import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reader = join(repoRoot, "scripts/read-local-credentials.mjs");

test("local credential reader returns only allowlisted fields from the selected reference", () => {
  const directory = mkdtempSync(join(tmpdir(), "ya-local-credentials-"));
  const file = join(directory, "credentials.json");
  writeFileSync(file, JSON.stringify({ credentials: {
    "blacksea-natro": { ftpUser: "fake-user", ftpPassword: "fake-password", syncSecret: "not-requested" }
  } }));
  try {
    const result = spawnSync(process.execPath, [reader, file, "blacksea-natro", "ftpUser", "ftpPassword"], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout.split("\0"), ["fake-user", "fake-password", ""]);
    assert.equal(result.stdout.includes("not-requested"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("local credential reader rejects fields outside the deployment allowlist", () => {
  const directory = mkdtempSync(join(tmpdir(), "ya-local-credentials-"));
  const file = join(directory, "credentials.json");
  writeFileSync(file, JSON.stringify({ credentials: { "blacksea-natro": { syncSecret: "fake-secret" } } }));
  try {
    const result = spawnSync(process.execPath, [reader, file, "blacksea-natro", "syncSecret"], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.includes("fake-secret"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
