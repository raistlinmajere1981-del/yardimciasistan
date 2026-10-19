import assert from "node:assert/strict";
import http from "node:http";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import {
  getDefaultAutoSelectFamilyAttemptTimeout,
  setDefaultAutoSelectFamilyAttemptTimeout
} from "node:net";

const require = createRequire(import.meta.url);
const { testWebConnection } = require("../apps/desktop-app/dist-electron/web-connection-test.js");
const {
  configureNetworkFamilyAttemptTimeout,
  MINIMUM_NETWORK_FAMILY_ATTEMPT_TIMEOUT_MS
} = require("../apps/desktop-app/dist-electron/network-runtime.js");

// Probe and explicit Test share the network check; only explicit Test writes save authority.
{
  const handlers = new Map();
  const ipcExports = {};
  let locked = false, checks = 0, writes = 0, sources = 0;
  let finishProbe;
  const compiled = ts.transpileModule(readFileSync(new URL("../apps/desktop-app/electron/web-connection-ipc.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInNewContext(compiled, { exports: ipcExports, require: name => {
    if (name === "electron") return { ipcMain: { handle: (id, handler) => handlers.set(id, handler) } };
    if (name === "./web-connection-test") return { testWebConnection: async () => { checks++; return await new Promise(resolve => { finishProbe = resolve; }); } };
    if (name === "./publication-source-service") return { connectPublicationSource: async () => { sources++; return { ok: true }; } };
    throw new Error(`Unexpected import: ${name}`);
  } });
  ipcExports.registerWebConnectionIpcHandlers({
    assertUnlocked: () => { if (locked) throw Error("locked"); },
    getDatabase: () => ({ recordServiceSettingsVerification: () => { writes++; } })
  });
  const input = { baseUrl: "https://fixture.test", syncSecret: "fixture-secret-only" };
  locked = true;
  await assert.rejects(handlers.get("sync:probeConnection")({}, input), /locked/);
  assert.equal(checks, 0, "locked sessions cannot start a probe");
  locked = false;
  const probe = handlers.get("sync:probeConnection")({}, input);
  finishProbe({ ok: true });
  assert.equal((await probe).ok, true);
  assert.equal(writes, 0, "opening Settings never records verification authority");
  assert.equal(sources, 0, "opening Settings never activates a source");
  const stale = handlers.get("sync:probeConnection")({}, input);
  locked = true; finishProbe({ ok: true });
  await assert.rejects(stale, /locked/, "a session locked during the probe cannot receive its result");
  locked = false;
  const explicit = handlers.get("sync:testConnection")({}, input);
  finishProbe({ ok: true });
  await explicit;
  assert.equal(writes, 1, "explicit Test retains its existing save authority");
}

const validSecret = "web-connection-secret-123";
const slowSecret = "slow-connection-secret-123";
const server = http.createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const payload = JSON.parse(body || "{}");
    const secret = String(request.headers["x-ya-sync-secret"] ?? "");
    const sendCapabilities = () => {
      if (payload.action !== "capabilities") {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: false, message: "Beklenmeyen işlem." }));
        return;
      }
      if (secret !== validSecret && secret !== slowSecret) {
        response.writeHead(401, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: false, message: "Güvenlik anahtarı kabul edilmedi." }));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        message: "Senkron özellikleri alındı.",
        protocol_version: 2,
        storage: "sqlite",
        features: [],
        server_time: new Date().toISOString(),
        server_revision: 1
      }));
    };

    if (secret === slowSecret) {
      setTimeout(sendCapabilities, 200);
    } else {
      sendCapabilities();
    }
  });
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const originalFamilyAttemptTimeout = getDefaultAutoSelectFamilyAttemptTimeout();
  try {
    setDefaultAutoSelectFamilyAttemptTimeout(250);
    assert.equal(
      configureNetworkFamilyAttemptTimeout(),
      MINIMUM_NETWORK_FAMILY_ATTEMPT_TIMEOUT_MS,
      "Electron's short default should be raised for slower dual-stack hosts."
    );

    setDefaultAutoSelectFamilyAttemptTimeout(2_000);
    assert.equal(
      configureNetworkFamilyAttemptTimeout(),
      2_000,
      "An operator-supplied higher timeout should be preserved."
    );
  } finally {
    setDefaultAutoSelectFamilyAttemptTimeout(originalFamilyAttemptTimeout);
  }

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const success = await testWebConnection({ baseUrl, syncSecret: validSecret }, 1_000);
  assert.equal(success.ok, true, success.message);
  assert.equal(success.protocolVersion, 2);
  assert.equal(success.storage, "sqlite");

  const unauthorized = await testWebConnection({ baseUrl, syncSecret: "wrong-secret-12345" }, 1_000);
  assert.equal(unauthorized.ok, false);
  assert.match(unauthorized.message, /Güvenlik anahtarı/i);

  const timedOut = await testWebConnection({ baseUrl, syncSecret: slowSecret }, 25);
  assert.equal(timedOut.ok, false);
  assert.match(timedOut.message, /yanıt vermedi/i);

  const invalidUrl = await testWebConnection({ baseUrl: "yardimci.example", syncSecret: validSecret }, 1_000);
  assert.equal(invalidUrl.ok, false);
  assert.match(invalidUrl.message, /http:\/\/ veya https:\/\//i);

  console.log("Web connection test smoke OK");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
