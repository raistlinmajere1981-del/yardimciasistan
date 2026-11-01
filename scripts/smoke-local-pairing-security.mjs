import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes, X509Certificate } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getLocalPairingEndpoint, LocalCompanionServer } from "../apps/desktop-app/dist-electron/local-companion-server.js";
import { LocalCompanionTlsIdentity, LocalCompanionTlsIdentityError } from "../apps/desktop-app/dist-electron/local-companion-tls-identity.js";

const root = mkdtempSync(join(tmpdir(), "ya-s3-security-"));
const key = randomBytes(32);
let backend = "gnome_libsecret";
const safeStorage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => backend,
  encryptString(value) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  },
  decryptString(value) {
    const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8");
  }
};
const source = readFileSync(new URL("../apps/desktop-app/electron/main.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
const nodes = [];
function walk(node) { nodes.push(node); ts.forEachChild(node, walk); }
walk(ast);
const instances = name => nodes.filter(node => ts.isNewExpression(node) && node.expression.getText(ast) === name);
assert.equal(instances("LocalCompanionServer").length, 1, "product has one server owner");
assert.equal(instances("LocalCompanionTlsIdentity").length, 1, "identity lives for the app lifetime");
const serverOptions = instances("LocalCompanionServer")[0].arguments[0];
assert.ok(ts.isObjectLiteralExpression(serverOptions));
assert.ok(serverOptions.properties.every(ts.isPropertyAssignment), "no hidden spread can override TLS");
assert.match(serverOptions.getText(ast), /httpsExperiment:\s*\{\s*enabled:\s*true,\s*identity:\s*localCompanionTlsIdentity\s*\}/);
assert.doesNotMatch(serverOptions.getText(ast), /testOnlyHttp/);
assert.match(instances("LocalCompanionTlsIdentity")[0].getText(ast), /app\.getPath\("userData"\), safeStorage/);
assert.doesNotMatch(source, /verifyLegacyTicket|verifyLocalCompanionPairingTicket/);
assert.doesNotMatch(readFileSync(new URL("../apps/desktop-app/electron/local-companion-pairing-service.ts", import.meta.url), "utf8"), /verifyLegacyTicket|syncSecret|local-companion-ticket/);

// Evaluate the actual main composition callbacks against a real identity/server.
const registration = nodes.find(node => ts.isCallExpression(node) && node.expression.getText(ast) === "registerDesktopIpcHandlers");
function callback(name, context) {
  const property = registration.arguments[0].properties.find(node => node.name?.getText(ast) === name);
  const js = ts.transpileModule(`(${property.initializer.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(js, context);
}
const ipv4 = address => ({ family: "IPv4", internal: false, address });
let ips = ["127.0.0.1", "192.168.1.20", "172.17.0.1"];
let interfaces = { docker0: [ipv4("172.17.0.1")], wlan0: [ipv4("192.168.1.20")] };
const identity = new LocalCompanionTlsIdentity({ userDataPath: root, safeStorage, platform: "linux", addresses: () => ips });
const compiled = new URL("../apps/desktop-app/dist-electron/local-companion-server.js", import.meta.url);
const compiledRequire = createRequire(compiled);
const module = { exports: {} };
let listener, listenerCount = 0, cancelCount = 0;
class SocketMock extends EventEmitter {
  constructor(material) { super(); this.material = material; }
  listen(port) {
    if (port === 47831) { this.emit("error", Object.assign(new Error("fixture port busy"), { code: "EADDRINUSE" })); return; }
    this.port = port || 53219; this.listening = true; this.emit("listening");
  }
  address() { return { port: this.port }; }
  setSecureContext(material) { this.material = material; }
  close(done) { this.listening = false; done?.(); }
}
runInNewContext(readFileSync(compiled, "utf8"), {
  exports: module.exports, Buffer, URL, process,
  require: name => name === "node:https" ? { createServer: material => { listenerCount++; listener = new SocketMock(material); return listener; } }
    : name === "node:http" ? { createServer: () => { throw new Error("Product must never create HTTP"); } }
      : name === "./desktop-logger" ? { desktopLog: { info() {}, warn() {}, error() {} } } : compiledRequire(name)
});
const server = new module.exports.LocalCompanionServer({
  httpsExperiment: { enabled: true, identity }, onStopped: () => { cancelCount++; }
});
const handlers = new Map();
const ipcModule = { exports: {} };
const ipcPath = new URL("../apps/desktop-app/dist-electron/ipc/android-device-ipc.js", import.meta.url);
const ipcRequire = createRequire(ipcPath);
runInNewContext(readFileSync(ipcPath, "utf8"), {
  exports: ipcModule.exports,
  require: name => name === "electron" ? { ipcMain: { handle: (name, fn) => handlers.set(name, fn) } } : ipcRequire(name)
});
let locked = false, began = 0, preparePause;
const context = {
  localCompanionServer: server, localCompanionTlsFailure: "",
  localCompanionReconcile: Promise.resolve(), localCompanionEnabled: () => true,
  campaignShutdownStarted: false, LocalCompanionTlsIdentityError,
  localCompanionPairingService: { cancel: () => { cancelCount++; } },
  localCompanionMdnsAdvertiser: null, reconcileLocalCompanionAdvertisement() {},
  desktopLog: { error: value => { assert.ok(value.meta.code); assert.equal("error" in value, false); } },
  getLocalPairingEndpoint: (address, tls) => getLocalPairingEndpoint(address, tls, interfaces),
};
const reconcileNode = nodes.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "reconcileLocalCompanionRuntime");
const reconcileJs = ts.transpileModule(reconcileNode.getText(ast).replace(/^export /, "") + "\nreconcileLocalCompanionRuntime;", {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
const reconcile = runInNewContext(reconcileJs, context);
context.reconcileLocalCompanionRuntime = async () => { await reconcile(); if (preparePause) await preparePause; };
const prepare = callback("prepareLocalPairing", context);
const endpoint = callback("getLocalPairingEndpoint", context);
const spki = callback("getLocalPairingSpkiSha256", context);
ipcModule.exports.registerAndroidDeviceIpcHandlers({
  getDatabase: () => ({ getSetupData: () => ({ localNetworkEnabled: true }) }),
  assertUnlocked: () => { if (locked) throw new Error("locked"); }, assertCapability() {},
  isTrustedRendererUrl: url => url === "file:///desktop/index.html",
  prepareLocalPairing: prepare, getLocalPairingEndpoint: endpoint, getLocalPairingSpkiSha256: spki,
  getLocalPairingService: () => ({ begin: () => { began++; return { credential: "yald1.fixture" }; }, read: () => null, cancel: () => { cancelCount++; } })
});
const frame = { url: "file:///desktop/index.html" }, event = { senderFrame: frame, sender: { mainFrame: frame } };
const begin = () => handlers.get("androidDevice:beginLocalPairing")(event);
try {
  await assert.rejects(new LocalCompanionServer({}).start("127.0.0.1", 0), /local_companion_https_required/);
  await assert.rejects(new LocalCompanionServer({ testOnlyHttp: true }).start("0.0.0.0", 0), /local_companion_https_required/);
  backend = "basic_text";
  await assert.rejects(begin(), /tls_storage_unavailable/);
  assert.equal(listenerCount, 0, "unsafe storage on startup never opens a listener");
  assert.equal(began, 0);
  backend = "gnome_libsecret";
  const first = await begin();
  assert.equal(first.endpoint, "https://192.168.1.20:53219", "actual bound port, physical interface before virtual");
  const livePin = () => createHash("sha256").update(new X509Certificate(listener.material.cert).publicKey.export({ type: "spki", format: "der" })).digest("base64url");
  assert.equal(first.spkiSha256, livePin(), "QR pin is from the actual listener key");
  assert.equal(new X509Certificate(listener.material.cert).checkPrivateKey((await import("node:crypto")).createPrivateKey(listener.material.key)), true);
  const oldCertificate = listener.material.cert;
  ips = [...ips, "192.168.42.5"];
  interfaces.enp0s20f0u2 = [ipv4("192.168.42.5")];
  const tether = await begin();
  assert.equal(tether.endpoint, "https://192.168.42.5:53219", "USB tether preferred over Wi-Fi");
  assert.equal(tether.spkiSha256, first.spkiSha256);
  assert.notEqual(listener.material.cert, oldCertificate);
  assert.ok(new X509Certificate(listener.material.cert).checkIP("192.168.42.5"));
  assert.equal(listenerCount, 1, "same listener through renewal");
  assert.equal((await new LocalCompanionTlsIdentity({ userDataPath: root, safeStorage, platform: "linux", addresses: () => ips }).load()).spkiSha256, first.spkiSha256);
  let release;
  preparePause = new Promise(resolve => { release = resolve; });
  const pending = begin();
  handlers.get("androidDevice:cancelLocalPairing")(event);
  release();
  await assert.rejects(pending, /local_pairing_cancelled/);
  preparePause = null;
  preparePause = new Promise(resolve => { release = resolve; });
  const locking = begin();
  locked = true; release();
  await assert.rejects(locking, /locked/);
  locked = false; preparePause = null;
  const before = began;
  backend = "basic_text";
  await assert.rejects(begin(), /tls_storage_unavailable/);
  assert.equal(began, before, "unsafe keystore never issues a pairing credential");
  assert.equal(server.address, null);
  assert.equal(server.tlsIdentity, null);
  assert.ok(cancelCount > 0);
  backend = "gnome_libsecret";
  const recovered = await begin();
  assert.equal(recovered.spkiSha256, first.spkiSha256, "recovery never rotates install key");
  delete interfaces.enp0s20f0u2;
  assert.equal(endpoint(), "https://192.168.1.20:53219");
  interfaces = {};
  await assert.rejects(begin(), /local_pairing_address_unavailable/);
  assert.equal(began, before + 1, "no reachable address never opens QR");
  console.log("PASS: S3 product HTTPS-only composition, live listener key/SPKI/port, USB preference, same-key SAN renewal/restart, async cancel/lock fences, basic_text fail-closed/recovery; socket I/O mocked.");
} finally {
  await server.stop();
  rmSync(root, { recursive: true, force: true });
}
