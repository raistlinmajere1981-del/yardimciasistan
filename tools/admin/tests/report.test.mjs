import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFullReport, buildSummary, formatDuration, timeAgo } from "../report.mjs";

test("özet PASS/FAIL, exit code, branch/commit içerir", () => {
  const ok = buildSummary({ title: "T", command: "npm", args: ["run", "x"], exitCode: 0, durationMs: 1500, branch: "main", commit: "abc" });
  assert.match(ok, /PASS/);
  assert.match(ok, /exit 0/);
  assert.match(ok, /main @ abc/);
  const fail = buildSummary({ title: "T", command: "npm", args: [], exitCode: 3, durationMs: 50, branch: "", commit: "" });
  assert.match(fail, /FAIL/);
  assert.match(fail, /exit 3/);
});

test("tam rapor özet + çıktı içerir", () => {
  const full = buildFullReport({ summary: "ÖZET", fullLog: "LOG" });
  assert.match(full, /ÖZET/);
  assert.match(full, /LOG/);
});

test("süre ve zaman formatları", () => {
  assert.equal(formatDuration(500), "500ms");
  assert.equal(formatDuration(2000), "2.0sn");
  assert.equal(formatDuration(125000), "2dk 5sn");
  assert.equal(timeAgo(new Date().toISOString()), "az önce");
});
