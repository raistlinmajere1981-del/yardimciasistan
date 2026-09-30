import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { gunzipSync, gzipSync } from "node:zlib";

const storage = mkdtempSync(join(tmpdir(), "ya-support-endpoint-"));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const value = typeof address === "object" && address ? address.port : 0;
    server.close(() => resolve(value));
  });
});
const baseUrl = `http://127.0.0.1:${port}/report.php`;
const php = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", "infrastructure/support"], {
  cwd: process.cwd(),
  env: { ...process.env, YARDIMCI_ASISTAN_SUPPORT_DIR: storage },
  stdio: ["ignore", "ignore", "pipe"]
});

try {
  let ready = false;
  for (let i = 0; i < 80; i += 1) {
    if (php.exitCode !== null) throw new Error("PHP support smoke server stopped early.");
    try {
      const response = await fetch(baseUrl);
      if (response.status === 405) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(ready, true, "support endpoint did not become ready");

  const getResponse = await fetch(baseUrl);
  assert.equal(getResponse.status, 405);
  assert.equal((await getResponse.json()).ok, false);

  const unsupported = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Support-Client": "00000000-0000-4000-8000-000000000001",
      "X-YA-App-Version": "0.1.7"
    },
    body: "{}"
  });
  assert.equal(unsupported.status, 415);

  const bundle = {
    format: "yardimci-asistan-support-report",
    version: 1,
    clientReportId: "00000000-0000-4000-8000-000000000002",
    createdAt: new Date().toISOString(),
    app: {
      version: "0.1.7",
      electronVersion: "43.1.1",
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      packaged: false
    },
    note: "Smoke raporu",
    screenshot: null,
    sessions: [{
      session: {
        version: 1,
        sessionId: "20260930T120000Z-SMOKE",
        startedAt: new Date().toISOString(),
        appVersion: "0.1.7",
        electronVersion: "43.1.1",
        nodeVersion: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        packaged: false,
        eventCount: 1,
        warnCount: 0,
        errorCount: 1,
        current: true,
        totalBytes: 100
      },
      events: [{
        timestamp: new Date().toISOString(),
        sequence: 1,
        level: "ERROR",
        process: "main",
        scope: "sync",
        event: "sync.capabilities.failed",
        message: "Smoke web failure."
      }]
    }]
  };
  const compressed = gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"));
  const upload = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "X-YA-Support-Client": "00000000-0000-4000-8000-000000000001",
      "X-YA-App-Version": "0.1.7"
    },
    body: compressed
  });
  const uploadBody = await upload.text();
  assert.equal(upload.status, 201, uploadBody);
  const result = JSON.parse(uploadBody);
  assert.equal(result.ok, true);
  assert.match(result.report_id, /^YA-\d{6}-\d{6}-[A-F0-9]{6}$/);

  const reports = readdirSync(storage).filter((name) => name.startsWith("YA-"));
  assert.deepEqual(reports, [result.report_id]);
  const reportDir = join(storage, result.report_id);
  const meta = JSON.parse(readFileSync(join(reportDir, "meta.json"), "utf8"));
  assert.equal(meta.status, "new");
  assert.equal(meta.session_count, 1);
  assert.equal(meta.event_count, 1);
  assert.equal(meta.screenshot_bytes, 0);

  const stored = JSON.parse(gunzipSync(readFileSync(join(reportDir, "report.json.gz"))).toString("utf8"));
  assert.equal(stored.clientReportId, bundle.clientReportId);
  assert.equal(stored.sessions[0].events[0].event, "sync.capabilities.failed");

  console.log("support-endpoint-smoke-ok");
} finally {
  php.kill("SIGTERM");
  rmSync(storage, { recursive: true, force: true });
}
