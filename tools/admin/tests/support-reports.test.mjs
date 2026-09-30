import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  extractSupportScreenshot,
  formatSupportReportLog,
  summarizeSupportReport
} from "../support-reports.mjs";

function fixtureBundle() {
  return {
    format: "yardimci-asistan-support-report",
    version: 1,
    note: "Web bağlantısı koptu.",
    app: { version: "0.1.7", platform: "linux", arch: "x64" },
    screenshot: {
      mimeType: "image/png",
      base64: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]).toString("base64"),
      width: 1,
      height: 1
    },
    sessions: [{
      session: {
        sessionId: "20260930T120000Z-SMOKE",
        startedAt: "2026-09-30T12:00:00.000Z",
        endedAt: "",
        warnCount: 1,
        errorCount: 1
      },
      events: [
        {
          timestamp: "2026-09-30T12:00:01.000Z",
          sequence: 1,
          level: "WARN",
          process: "main",
          scope: "ai",
          event: "ai.connection-test.failed",
          message: "AI işlemi tamamlanamadı.",
          meta: { reason: "rate_limited", status: 429 }
        },
        {
          timestamp: "2026-09-30T12:00:02.000Z",
          sequence: 2,
          level: "ERROR",
          process: "main",
          scope: "sync",
          event: "sync.capabilities.failed",
          message: "Web bağlantısı başarısız.",
          operationId: "sync-smoke"
        }
      ]
    }]
  };
}

test("support report summary counts severity and abrupt sessions", () => {
  const summary = summarizeSupportReport(fixtureBundle());
  assert.equal(summary.sessionCount, 1);
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.warnCount, 1);
  assert.equal(summary.errorCount, 1);
  assert.equal(summary.abruptSessionCount, 1);
  assert.equal(summary.screenshotAttached, true);
  assert.equal(summary.recent[0].event, "sync.capabilities.failed");
});

test("support report log keeps operation and failure metadata", () => {
  const text = formatSupportReportLog(fixtureBundle());
  assert.match(text, /ai\.connection-test\.failed/);
  assert.match(text, /rate_limited/);
  assert.match(text, /sync\.capabilities\.failed/);
  assert.match(text, /operationId: sync-smoke/);
});

test("support report screenshot extracts only valid PNG signature", () => {
  const root = mkdtempSync(join(tmpdir(), "ya-admin-support-"));
  try {
    const filePath = extractSupportScreenshot({ reportDir: root, bundle: fixtureBundle() });
    assert.equal(filePath, join(root, "screenshot.png"));
    assert.equal(readFileSync(filePath).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("support report listing keeps pathname expansion available", () => {
  const source = readFileSync(new URL("../support-reports.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /set -f/);
  assert.match(source, /find \${SUPPORT_REMOTE_ROOT} -mindepth 2 -maxdepth 2 -type f -name meta\.json -print/);
  assert.match(source, /while IFS= read -r f; do/);
});
