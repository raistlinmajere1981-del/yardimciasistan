import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { VerificationRunner } = require("../apps/admin-control-center/dist-electron/electron/services/verification-runner.js");
const { VerificationProgressTracker } = require("../apps/admin-control-center/dist-electron/electron/services/verification-progress.js");

test("structured plan events preserve ordering, skipped IDs and separate failure logs", () => {
  const progress = new VerificationProgressTracker();
  [
    "Plan: 3 benzersiz kontrol",
    "▶ [1/3] [first] İlk deneme",
    "first output",
    "✓ [1/3] İlk deneme (23 ms)",
    "▶ [2/3] [second] İkinci deneme",
    "Error: expected result",
    "✗ [2/3] İkinci deneme (40 ms)",
    "- [3/3] [third] Üçüncü deneme · Prerequisite başarısız: second"
  ].forEach((line) => progress.feed(line));
  assert.equal(progress.snapshot.total, 3);
  assert.deepEqual(progress.snapshot.checks.map((item) => [item.id, item.status]), [
    ["first", "passed"], ["second", "failed"], ["third", "skipped"]
  ]);
  assert.match(progress.getOutput("second"), /Error: expected result/);
  assert.doesNotMatch(progress.getOutput("first"), /expected result/);
  assert.match(progress.getOutput("third"), /Prerequisite/);
});

test("runner decodes split chunks and maintains full check-specific output", async () => {
  const root = mkdtempSync(join(tmpdir(), "nexa-verify-progress-"));
  mkdirSync(join(root, "scripts"));
  // The stream boundaries intentionally divide a progress marker, a Turkish
  // character, and the failing check's own command output.
  writeFileSync(join(root, "scripts", "verify.mjs"), `
    process.stdout.write("Plan: 2 benzersiz kontrol\\n");
    process.stdout.write("▶ [1/2] [safe] İlk k");
    setTimeout(() => {
      process.stdout.write("ontrol\\npass-data\\n✓ [1/2] İlk kontrol (10 ms)\\n");
      process.stdout.write("▶ [2/2] [broken] Hata\\npartial ");
      process.stderr.write("FAIL: something failed\\n");
      setTimeout(() => {
        process.stdout.write("line\\n✗ [2/2] Hata (20 ms)\\n");
        process.exitCode = 1;
      }, 15);
    }, 15);
  `);
  try {
    const runner = new VerificationRunner(root);
    const result = await new Promise((resolve, reject) => {
      runner.subscribe((state) => {
        if (state.startedAt && !state.running) resolve(state);
      });
      const started = runner.start({ mode: "preset", value: "dev" });
      if (!started.accepted) reject(new Error(started.message));
      setTimeout(() => reject(new Error("Verification runner timed out")), 10000).unref();
    });
    assert.equal(result.result, "failed");
    assert.equal(result.totalPlanned, 2);
    assert.deepEqual(result.checks.map((check) => check.status), ["passed", "failed"]);
    assert.match(runner.getCheckOutput("safe"), /pass-data/);
    assert.doesNotMatch(runner.getCheckOutput("safe"), /FAIL:/);
    assert.match(runner.getCheckOutput("broken"), /FAIL: something failed/);
    assert.match(runner.getCheckOutput("broken"), /partial line/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
