import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.XDG_CACHE_HOME = mkdtempSync(join(tmpdir(), "admin-test-cache-"));
const history = await import("../history.mjs");

test("record/list/get döngüsü", () => {
  const e = history.recordRun({
    kind: "task", refId: "doctor", title: "Ortam kontrolü",
    command: "npm", args: ["run", "doctor"], cwd: "repo",
    exitCode: 0, durationMs: 123, branch: "main", commit: "abc1234",
    fullLog: "OK doctor",
  });
  assert.equal(e.seq, 1);
  assert.equal(e.pass, true);
  const list = history.listRuns(10);
  assert.equal(list[0].seq, 1);
  assert.equal(history.getRun(1).title, "Ortam kontrolü");
  assert.match(history.readLog(list[0]), /OK doctor/);
});

test("lastPassFor HEAD uyumsuzluğunu yakalar", () => {
  history.recordRun({
    kind: "group", refId: "full-verify", title: "Full Verify",
    command: "group", args: [], cwd: "repo",
    exitCode: 0, durationMs: 10, branch: "main", commit: "abc1234", fullLog: "ok",
  });
  const same = history.lastPassFor("full-verify", "main", "abc1234");
  assert.ok(same.lastPass);
  assert.equal(same.currentMismatch, false);
  const changed = history.lastPassFor("full-verify", "main", "zzz9999");
  assert.equal(changed.currentMismatch, true);
  const missing = history.lastPassFor("olmayan", "main", "abc1234");
  assert.equal(missing.lastPass, null);
});
