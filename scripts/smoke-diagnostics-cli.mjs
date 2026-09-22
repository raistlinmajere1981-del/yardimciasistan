import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "yardimci-diagnostics-cli-"));
const sessionId = "20260922T010000000Z-smoke123";
const sessionRoot = path.join(root, "logs", "sessions", sessionId);
fs.mkdirSync(sessionRoot, { recursive: true });
fs.writeFileSync(path.join(sessionRoot, "session.json"), JSON.stringify({
  version: 1,
  sessionId,
  startedAt: "2026-09-22T01:00:00.000Z",
  endedAt: "2026-09-22T01:01:00.000Z",
  endReason: "before-quit",
  appVersion: "0.1.7",
  electronVersion: "43.1.1",
  nodeVersion: "24.18.0",
  platform: "linux",
  arch: "x64",
  packaged: false,
  eventCount: 3,
  warnCount: 1,
  errorCount: 1
}, null, 2));
fs.writeFileSync(path.join(sessionRoot, "events-001.jsonl"), [
  { timestamp: "2026-09-22T01:00:01.000Z", sequence: 1, level: "INFO", process: "main", scope: "startup", event: "app.session.started", message: "started" },
  { timestamp: "2026-09-22T01:00:02.000Z", sequence: 2, level: "WARN", process: "main", scope: "sync", event: "sync.retry", message: "retrying" },
  { timestamp: "2026-09-22T01:00:03.000Z", sequence: 3, level: "ERROR", process: "renderer", scope: "market", event: "market.failed", message: "failed safely" }
].map((item) => JSON.stringify(item)).join("\n") + "\n");

try {
  const listOutput = execFileSync(process.execPath, ["scripts/diagnostics-cli.mjs", "list", "--data-root", root], { encoding: "utf8" });
  assert.match(listOutput, new RegExp(sessionId));
  assert.match(listOutput, /warn=1/);
  assert.match(listOutput, /error=1/);

  const errorsOutput = execFileSync(process.execPath, ["scripts/diagnostics-cli.mjs", "errors", "--data-root", root], { encoding: "utf8" });
  assert.doesNotMatch(errorsOutput, /app\.session\.started/);
  assert.match(errorsOutput, /sync\.retry/);
  assert.match(errorsOutput, /market\.failed/);

  const scopedOutput = execFileSync(process.execPath, ["scripts/diagnostics-cli.mjs", "latest", "--data-root", root, "--scope", "sync"], { encoding: "utf8" });
  assert.match(scopedOutput, /sync\.retry/);
  assert.doesNotMatch(scopedOutput, /market\.failed/);

  console.log("diagnostics-cli-smoke-ok");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
