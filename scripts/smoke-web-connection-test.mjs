import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { testWebConnection } = require("../apps/desktop-app/dist-electron/web-connection-test.js");

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
        schema_version: 2,
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
