import assert from "node:assert/strict";
import crypto, { createCipheriv, createDecipheriv, createHash, createPrivateKey, randomBytes, X509Certificate } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkServerIdentity } from "node:tls";
import { BitString, fromBER, Integer, Sequence } from "asn1js";
import { Certificate } from "pkijs";
// These imports exercise the actual CommonJS Electron artifacts and runtime dependency graph.
import { LocalCompanionTlsIdentity } from "../apps/desktop-app/dist-electron/local-companion-tls-identity.js";
import { LocalCompanionServer } from "../apps/desktop-app/dist-electron/local-companion-server.js";

const DAY = 86_400_000;
const root = mkdtempSync(join(tmpdir(), "ya-companion-tls-"));
const encryptionKey = randomBytes(32);
// Authenticated mock only: no Electron/keyring dependency and no plaintext identity on disk.
const safeStorage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => "gnome_libsecret",
  encryptString(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  },
  decryptString(value) {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8");
  }
};

function identityOptions(name, overrides = {}) {
  const userDataPath = mkdtempSync(join(root, `${name}-`));
  return { userDataPath, safeStorage, platform: "linux", addresses: () => ["127.0.0.1", "192.168.15.23", "::1", "fe80::1234%fixture"], ...overrides };
}

function encryptedFile(options) { return join(options.userDataPath, "local-companion-tls", "identity.enc"); }
function pin(cert) { return createHash("sha256").update(cert.publicKey.export({ type: "spki", format: "der" })).digest("base64url"); }
async function rejectsCode(operation, code) {
  await assert.rejects(operation, error => error.name === "LocalCompanionTlsIdentityError" && error.code === code && error.message === code && !error.cause);
}

function assertPositiveDerInteger(integer) {
  assert.ok(integer instanceof Integer);
  const bytes = integer.valueBlock.valueHexView;
  assert.ok(bytes.length > 0 && bytes.some(byte => byte !== 0), "positive, nonzero INTEGER");
  assert.equal(bytes[0] & 0x80, 0, "INTEGER must not be negative");
  if (bytes.length > 1 && bytes[0] === 0) assert.ok(bytes[1] & 0x80, "only necessary sign padding is allowed");
}

function assertCertificate(material, now = Date.now()) {
  const certificate = new X509Certificate(material.certificatePem);
  assert.ok(certificate.verify(certificate.publicKey), "real X509 self-signature verification");
  assert.ok(certificate.checkPrivateKey(createPrivateKey(material.privateKeyPem)), "certificate matches the retained key");
  assert.equal(pin(certificate), material.spkiSha256);
  assert.equal(certificate.ca, false);
  assert.deepEqual(certificate.keyUsage, ["1.3.6.1.5.5.7.3.1"]);
  assert.ok(Date.parse(certificate.validFrom) <= now && now < Date.parse(certificate.validTo));
  for (const ip of material.ipAddresses) assert.ok(certificate.checkIP(ip));
  const parsed = Certificate.fromBER(certificate.raw);
  assertPositiveDerInteger(parsed.serialNumber);
  assert.ok(parsed.serialNumber.valueBlock.valueHexView.length <= 20);
  assert.equal(parsed.signatureValue.valueBlock.unusedBits, 0);
  const signature = fromBER(parsed.signatureValue.valueBlock.valueHexView);
  assert.equal(signature.offset, parsed.signatureValue.valueBlock.valueHexView.length);
  assert.ok(signature.result instanceof Sequence);
  assert.equal(signature.result.valueBlock.value.length, 2);
  for (const integer of signature.result.valueBlock.value) assertPositiveDerInteger(integer);
  return { parsed, signatureShape: signature.result.valueBlock.value.map(integer => integer.valueBlock.valueHexView.length).join("/") };
}

async function derRegressionContracts() {
  const originalRandomBytes = crypto.randomBytes;
  const originalSign = Certificate.prototype.sign;
  let serial;
  let encryptionCalls = 0;
  // Exercise the actual compiled CommonJS owner. Only certificate serial entropy
  // is controlled; keys and ECDSA signatures still come from real WebCrypto.
  crypto.randomBytes = size => size === 20 ? Buffer.from(serial) : originalRandomBytes(size);
  Certificate.prototype.sign = async function (...args) {
    await originalSign.apply(this, args);
    const signature = fromBER(this.signatureValue.valueBlock.valueHexView).result;
    // Emulate the converter's rare redundant padding, preserving real r/s values
    // and signed TBS bytes. The owner must normalize before X509 verification.
    this.signatureValue = new BitString({ unusedBits: 0, valueHex: new Sequence({
      value: signature.valueBlock.value.map(integer => new Integer({
        valueHex: Buffer.concat([Buffer.alloc(3), integer.valueBlock.valueHexView])
      }))
    }).toBER(false) });
  };
  try {
    for (const hex of ["0049", "0080", "00000049", "00000080", "8049", "7f", "00".repeat(19) + "01"]) {
      serial = Buffer.from(hex.padEnd(40, "1"), "hex");
      const options = identityOptions("der-regression", { safeStorage: {
        ...safeStorage,
        encryptString(value) {
          const stored = JSON.parse(value);
          // Verify before encryption, not only after load() has persisted it.
          const certificate = new X509Certificate(stored.certificatePem);
          assert.ok(certificate.verify(certificate.publicKey));
          encryptionCalls++;
          return safeStorage.encryptString(value);
        }
      } });
      const material = await new LocalCompanionTlsIdentity(options).load();
      const { parsed } = assertCertificate(material);
      const masked = Buffer.from(serial);
      masked[0] &= 0x7f;
      assert.equal(BigInt("0x" + Buffer.from(parsed.serialNumber.valueBlock.valueHexView).toString("hex")), BigInt("0x" + masked.toString("hex")));
    }
    assert.equal(encryptionCalls, 7);
    serial = Buffer.alloc(20);
    const zeroSerial = identityOptions("zero-serial");
    await rejectsCode(new LocalCompanionTlsIdentity(zeroSerial).load(), "tls_identity_invalid");
    assert.equal(existsSync(encryptedFile(zeroSerial)), false);

    serial = Buffer.alloc(20, 0x49);
    Certificate.prototype.sign = originalSign;
    const renewalOptions = identityOptions("rejected-renewal");
    const established = await new LocalCompanionTlsIdentity(renewalOptions).load();
    const saved = readFileSync(encryptedFile(renewalOptions));
    Certificate.prototype.sign = async function (...args) {
      await originalSign.apply(this, args);
      const bytes = this.signatureValue.valueBlock.valueHexView;
      bytes[bytes.length - 1] ^= 1;
    };
    const invalidFirst = identityOptions("rejected-first-issuance");
    await rejectsCode(new LocalCompanionTlsIdentity(invalidFirst).load(), "tls_identity_invalid");
    assert.equal(existsSync(encryptedFile(invalidFirst)), false, "invalid signature never reaches persistence");
    await rejectsCode(new LocalCompanionTlsIdentity({ ...renewalOptions, addresses: () => ["127.0.0.1"] }).load(), "tls_identity_invalid");
    assert.deepEqual(readFileSync(encryptedFile(renewalOptions)), saved, "failed renewal preserves encrypted identity");
    const recovered = await new LocalCompanionTlsIdentity(renewalOptions).load();
    assert.equal(recovered.spkiSha256, established.spkiSha256);
    assert.ok(recovered.privateKeyPem === established.privateKeyPem, "failed renewal never rotates the key");
  } finally {
    crypto.randomBytes = originalRandomBytes;
    Certificate.prototype.sign = originalSign;
  }
  console.log("PASS: deterministic serial sign/leading-zero regression and multi-zero ECDSA INTEGER normalization; real X509 verification before encryption.");
}

function serverOptions(httpsExperiment) {
  return {
    desktopId: () => "desktop-tls-fixture",
    businessInfo: () => ({ displayName: "TLS fixture", phone: "", whatsapp: "" }),
    authorize: () => false,
    createSummary: () => { throw new Error("Unexpected projection"); },
    applyAction: () => { throw new Error("Unexpected mutation"); },
    ...(httpsExperiment === undefined ? {} : { httpsExperiment })
  };
}

async function identityContracts() {
  const options = identityOptions("stable");
  const owner = new LocalCompanionTlsIdentity(options);
  const [first, parallel] = await Promise.all([owner.load(), owner.load()]);
  const restart = await new LocalCompanionTlsIdentity(options).load();
  assert.equal(parallel.spkiSha256, first.spkiSha256);
  assert.equal(restart.spkiSha256, first.spkiSha256);
  assert.ok(restart.privateKeyPem === first.privateKeyPem, "restart retains the private key");
  assert.equal(restart.certificatePem, first.certificatePem);
  const certificate = new X509Certificate(first.certificatePem);
  assert.equal(certificate.ca, false);
  assert.equal(certificate.publicKey.asymmetricKeyType, "ec");
  assert.equal(certificate.publicKey.asymmetricKeyDetails.namedCurve, "prime256v1");
  assert.ok(certificate.verify(certificate.publicKey));
  assert.deepEqual(certificate.keyUsage, ["1.3.6.1.5.5.7.3.1"]);
  assert.equal(pin(certificate), first.spkiSha256);
  assert.equal(Buffer.from(first.spkiSha256, "base64url").length, 32);
  for (const ip of first.ipAddresses) assert.ok(certificate.checkIP(ip));
  assert.equal(certificate.checkIP("192.168.15.99"), undefined);
  assert.equal(certificate.checkHost("localhost"), undefined, "IP SANs are not DNS names");
  const parsed = Certificate.fromBER(certificate.raw);
  assert.equal(parsed.signatureAlgorithm.algorithmId, "1.2.840.10045.4.3.2", "ECDSA SHA-256");
  const extension = oid => parsed.extensions.find(item => item.extnID === oid);
  assert.equal(extension("2.5.29.19").critical, true);
  assert.equal(extension("2.5.29.19").parsedValue.cA, false);
  assert.equal(extension("2.5.29.15").critical, true);
  const usage = fromBER(extension("2.5.29.15").extnValue.valueBlock.valueHexView).result;
  assert.equal(usage.valueBlock.unusedBits, 7);
  assert.deepEqual([...usage.valueBlock.valueHexView], [0x80], "digitalSignature only, no CA signing/encipherment");
  assert.ok(extension("2.5.29.17").parsedValue.altNames.every(name => name.type === 7));
  const disk = readFileSync(encryptedFile(options));
  assert.equal(disk.includes(Buffer.from("PRIVATE KEY")), false);
  assert.equal(disk.includes(Buffer.from(first.privateKeyPem)), false);
  if (process.platform !== "win32") {
    assert.equal(statSync(encryptedFile(options)).mode & 0o777, 0o600);
    assert.equal(statSync(join(options.userDataPath, "local-companion-tls")).mode & 0o777, 0o700);
  }
  const publicIdentity = await owner.publicIdentity();
  assert.deepEqual(Object.keys(publicIdentity).sort(), ["certificatePem", "ipAddresses", "spkiSha256"]);
  const changedIp = await new LocalCompanionTlsIdentity({ ...options, addresses: () => ["127.0.0.1", "10.2.3.4"] }).load();
  assert.equal(changedIp.spkiSha256, first.spkiSha256);
  assert.ok(changedIp.privateKeyPem === first.privateKeyPem, "IP renewal retains the private key");
  assert.notEqual(changedIp.certificatePem, first.certificatePem);
  assert.ok(new X509Certificate(changedIp.certificatePem).checkIP("10.2.3.4"));
  assert.equal(new X509Certificate(changedIp.certificatePem).checkIP("192.168.15.23"), undefined);
  const expiresSoon = Date.parse(new X509Certificate(changedIp.certificatePem).validTo) - 29 * DAY;
  const renewed = await new LocalCompanionTlsIdentity({ ...options, now: () => expiresSoon }).load();
  assert.equal(renewed.spkiSha256, first.spkiSha256);
  assert.ok(renewed.privateKeyPem === first.privateKeyPem, "expiry renewal retains the private key");
  assert.notEqual(renewed.certificatePem, changedIp.certificatePem);
  assert.ok(Date.parse(new X509Certificate(renewed.certificatePem).validTo) > expiresSoon + 364 * DAY);
  await rejectsCode(new LocalCompanionTlsIdentity(options).load(), "tls_clock_invalid");

  for (const backend of ["basic_text", "unknown"]) {
    const bad = identityOptions(backend, { safeStorage: { ...safeStorage, getSelectedStorageBackend: () => backend } });
    await rejectsCode(new LocalCompanionTlsIdentity(bad).load(), "tls_storage_unavailable");
    assert.equal(existsSync(join(bad.userDataPath, "local-companion-tls")), false);
  }
  const unavailable = identityOptions("unavailable", { safeStorage: { ...safeStorage, isEncryptionAvailable: () => false } });
  await rejectsCode(new LocalCompanionTlsIdentity(unavailable).load(), "tls_storage_unavailable");
  const saved = readFileSync(encryptedFile(options));
  await rejectsCode(new LocalCompanionTlsIdentity({ ...options, safeStorage: unavailable.safeStorage }).load(), "tls_storage_unavailable");
  assert.deepEqual(readFileSync(encryptedFile(options)), saved, "keystore outage preserves the stored identity");
  await rejectsCode(new LocalCompanionTlsIdentity({ ...options, safeStorage: { ...safeStorage, decryptString() { throw new Error(first.privateKeyPem); } } }).load(), "tls_identity_invalid");
  for (const ips of [[], ["localhost"], ["0.0.0.0"], ["::"], ["192.168.1.999"]]) {
    await rejectsCode(new LocalCompanionTlsIdentity(identityOptions("invalid-ip", { addresses: () => ips })).load(), "tls_addresses_invalid");
  }
  const encryptionFailure = identityOptions("encryption-failure", { safeStorage: { ...safeStorage, encryptString() { throw new Error("fixture-sensitive-error"); } } });
  await rejectsCode(new LocalCompanionTlsIdentity(encryptionFailure).load(), "tls_identity_io");
  assert.equal(existsSync(encryptedFile(encryptionFailure)), false);
  await rejectsCode(new LocalCompanionTlsIdentity({ ...encryptionFailure, safeStorage }).load(), "tls_identity_invalid");
  const windows = identityOptions("windows", { platform: "win32", safeStorage: { ...safeStorage, getSelectedStorageBackend() { throw new Error("Linux-only API"); } } });
  assert.notEqual((await new LocalCompanionTlsIdentity(windows).load()).spkiSha256, first.spkiSha256, "different install gets a distinct key");

  const corrupt = identityOptions("corrupt");
  await new LocalCompanionTlsIdentity(corrupt).load();
  for (const bytes of [Buffer.from("corrupt encrypted identity"), Buffer.alloc(0), safeStorage.encryptString("{private-key-secret malformed JSON")]) {
    writeFileSync(encryptedFile(corrupt), bytes);
    await rejectsCode(new LocalCompanionTlsIdentity(corrupt).load(), "tls_identity_invalid");
    assert.deepEqual(readFileSync(encryptedFile(corrupt)), bytes, "never overwrite corruption or rotate key");
  }
  unlinkSync(encryptedFile(corrupt));
  await rejectsCode(new LocalCompanionTlsIdentity(corrupt).load(), "tls_identity_invalid");
  assert.equal(existsSync(encryptedFile(corrupt)), false, "missing identity in existing install is not regenerated");
  if (process.platform !== "win32") {
    symlinkSync(encryptedFile(windows), encryptedFile(corrupt));
    await rejectsCode(new LocalCompanionTlsIdentity(corrupt).load(), "tls_identity_invalid");
  }
  const mismatch = identityOptions("mismatch");
  await new LocalCompanionTlsIdentity(mismatch).load();
  const stored = JSON.parse(safeStorage.decryptString(readFileSync(encryptedFile(mismatch))));
  stored.certificatePem = first.certificatePem;
  writeFileSync(encryptedFile(mismatch), safeStorage.encryptString(JSON.stringify(stored)));
  await rejectsCode(new LocalCompanionTlsIdentity(mismatch).load(), "tls_identity_invalid");
  const replacement = identityOptions("replacement");
  const established = new LocalCompanionTlsIdentity(replacement);
  await established.load();
  writeFileSync(encryptedFile(replacement), readFileSync(encryptedFile(windows)));
  await rejectsCode(established.load(), "tls_identity_invalid");
  rmSync(join(replacement.userDataPath, "local-companion-tls"), { recursive: true });
  await rejectsCode(established.load(), "tls_identity_invalid");
  assert.equal(existsSync(encryptedFile(replacement)), false, "active owner never regenerates a deleted identity");

  const failClosed = new LocalCompanionServer(serverOptions({ enabled: true, identity: new LocalCompanionTlsIdentity(unavailable) }));
  await rejectsCode(failClosed.start("127.0.0.1", 0), "tls_storage_unavailable");
  assert.equal(failClosed.address, null);
  assert.equal(failClosed.tlsIdentity, null);
  await failClosed.stop();
  const malformed = new LocalCompanionServer(serverOptions({ enabled: false, identity: owner }));
  await assert.rejects(malformed.start("127.0.0.1", 0), /local_companion_tls_experiment_required/);
  assert.equal(malformed.address, null);
  console.log("PASS: TLS CommonJS imports, P-256 profile/IP SANs, encrypted persistence/restart, renewal/stable SPKI, corruption/missing key, safeStorage refusal, experiment fail-closed.");
}

function request(port, { ca, expectedPin, host = "127.0.0.1", path = "/local/v1/status", method = "GET", plaintext = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = (plaintext ? httpRequest : httpsRequest)({
      host, port, path, method, agent: false, timeout: 4000,
      ...(plaintext ? {} : {
        ca,
        checkServerIdentity(name, peer) {
          const hostnameError = checkServerIdentity(name, peer);
          if (hostnameError) return hostnameError;
          if (expectedPin && pin(new X509Certificate(peer.raw)) !== expectedPin) return new Error("fixture_pin_mismatch");
        }
      })
    }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("fixture_timeout")));
    req.end();
  });
}

async function httpsContracts() {
  const options = identityOptions("https", { addresses: () => ["127.0.0.1"] });
  let ips = ["127.0.0.1"];
  const owner = new LocalCompanionTlsIdentity({ ...options, addresses: () => ips });
  const first = await owner.load();
  const wrong = await new LocalCompanionTlsIdentity(identityOptions("other-key")).load();
  const server = new LocalCompanionServer(serverOptions({ enabled: true, identity: owner }));
  try {
    const [address, concurrent] = await Promise.all([server.start("127.0.0.1", 0), server.start("127.0.0.1", 0)]);
    assert.deepEqual(address, concurrent, "one operational listener even with concurrent start");
    assert.equal(address.protocol, "https");
    assert.equal(server.tlsIdentity.spkiSha256, first.spkiSha256);
    assert.equal("privateKeyPem" in server.tlsIdentity, false);
    const tls = { ca: first.certificatePem, expectedPin: first.spkiSha256 };
    const status = await request(address.port, tls);
    assert.equal(status.status, 200);
    assert.equal(JSON.parse(status.body).desktop_id, "desktop-tls-fixture");
    for (const endpoint of ["pair", "summary", "action"]) {
      const result = await request(address.port, { ...tls, path: `/local/v1/${endpoint}`, method: "POST" });
      assert.ok([401, 503].includes(result.status), "all operational endpoints use the TLS listener");
    }
    await assert.rejects(request(address.port), /self.signed|certificate/i, "default trust rejects untrusted self-signed cert");
    await assert.rejects(request(address.port, { ca: wrong.certificatePem }), /self.signed|certificate/i, "wrong Desktop certificate rejected");
    await assert.rejects(request(address.port, { ...tls, expectedPin: wrong.spkiSha256 }), /fixture_pin_mismatch/);
    const plain = await request(address.port, { plaintext: true }).catch(() => null);
    assert.ok(plain === null || plain.status >= 400, "HTTPS never serves a plaintext operational response");
    ips = ["127.0.0.1", "10.0.1.2"];
    await server.refreshTlsIdentity();
    assert.equal(server.tlsIdentity.spkiSha256, first.spkiSha256);
    assert.equal(server.address.port, address.port);
    assert.notEqual(server.tlsIdentity.certificatePem, first.certificatePem);
    assert.equal((await request(address.port, { ca: server.tlsIdentity.certificatePem, expectedPin: first.spkiSha256 })).status, 200);
    // A certificate for the wrong IP must fail before any HTTP operation is accepted.
    ips = ["192.168.50.12"];
    await server.refreshTlsIdentity();
    await assert.rejects(request(address.port, { ca: server.tlsIdentity.certificatePem }), error => error.code === "ERR_TLS_CERT_ALTNAME_INVALID");
  } finally {
    await server.stop();
  }
  assert.equal(server.address, null);
  assert.equal(server.tlsIdentity, null);
  console.log("PASS: real HTTPS handshake/endpoints, wrong certificate/pin/SAN rejection, no plaintext downgrade, live same-key renewal.");
}

async function stressContracts(contractsOnly) {
  const pins = new Set();
  const signatureShapes = new Set();
  let handshakes = 0;
  // Sequential issuance and one ephemeral listener at a time; no child processes.
  for (let index = 0; index < 40; index++) {
    let ips = ["127.0.0.1", "::1"];
    let now = Date.now();
    const options = identityOptions("stress", { addresses: () => ips, now: () => now });
    const owner = new LocalCompanionTlsIdentity(options);
    const server = contractsOnly ? null : new LocalCompanionServer(serverOptions({ enabled: true, identity: owner }));
    try {
      const first = await owner.load();
      signatureShapes.add(assertCertificate(first, now).signatureShape);
      assert.equal(pins.has(first.spkiSha256), false, "fresh installation has a distinct key");
      pins.add(first.spkiSha256);
      const restart = await new LocalCompanionTlsIdentity(options).load();
      assert.equal(restart.spkiSha256, first.spkiSha256);
      assert.equal(restart.certificatePem, first.certificatePem);
      assert.ok(restart.privateKeyPem === first.privateKeyPem, "restart preserves the private key");
      if (server) {
        const address = await server.start("127.0.0.1", 0);
        assert.equal((await request(address.port, { ca: first.certificatePem, expectedPin: first.spkiSha256 })).status, 200);
        handshakes++;
      }
      ips = ["127.0.0.1", "::1", `10.20.30.${index + 1}`];
      const changed = await owner.load();
      signatureShapes.add(assertCertificate(changed, now).signatureShape);
      assert.equal(changed.spkiSha256, first.spkiSha256);
      assert.ok(changed.privateKeyPem === first.privateKeyPem, "IP renewal preserves the private key");
      assert.notEqual(changed.certificatePem, first.certificatePem);
      if (server) {
        await server.refreshTlsIdentity();
        assert.equal((await request(server.address.port, { ca: changed.certificatePem, expectedPin: first.spkiSha256 })).status, 200);
        handshakes++;
      }
      now = Date.parse(new X509Certificate(changed.certificatePem).validTo) - 29 * DAY;
      const renewed = await owner.load();
      signatureShapes.add(assertCertificate(renewed, now).signatureShape);
      assert.equal(renewed.spkiSha256, first.spkiSha256);
      assert.ok(renewed.privateKeyPem === first.privateKeyPem, "expiry renewal preserves the private key");
      assert.notEqual(renewed.certificatePem, changed.certificatePem);
      const finalRestart = await new LocalCompanionTlsIdentity(options).load();
      assert.equal(finalRestart.spkiSha256, first.spkiSha256);
      assert.equal(finalRestart.certificatePem, renewed.certificatePem);
    } finally {
      if (server) await server.stop();
      rmSync(options.userDataPath, { recursive: true, force: true });
    }
  }
  // Both unpadded and sign-padded real r/s values must have been exercised.
  for (const shape of ["32/32", "32/33", "33/32", "33/33"]) assert.ok(signatureShapes.has(shape), `missing randomized ECDSA signature shape ${shape}`);
  console.log(`PASS: 40 fresh identities, 120 X509-verified issuances, canonical serial/r/s, all four signature padding shapes, stable keys/pins across restart and IP/expiry renewal; ${handshakes} real HTTPS handshakes${contractsOnly ? " (network omitted by --contracts-only)" : ""}.`);
}

try {
  await derRegressionContracts();
  await identityContracts();
  const contractsOnly = process.argv.includes("--contracts-only");
  if (process.argv.includes("--stress")) await stressContracts(contractsOnly);
  if (!contractsOnly) await httpsContracts();
} finally {
  rmSync(root, { recursive: true, force: true });
}
