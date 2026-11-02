#!/usr/bin/env node
/**
 * Local-only opt-in staging for demo ZIPs.
 * This script never uploads or changes release/update metadata.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const site = join(root, "test-site", "landing");
const source = join(root, "artifacts", "demo-data");
const destination = join(site, "downloads");
const stage = process.argv.slice(2).includes("--stage");
assert.ok(process.argv.slice(2).every(arg => arg === "--stage"), "Only --stage is accepted");
const release = JSON.parse(readFileSync(join(site, "release.json"), "utf8"));
const manifestPath = join(source, "demo-data-manifest.json");
assert.ok(existsSync(manifestPath), "Demo generator has not produced the manifest yet");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.equal(manifest.version, release.desktopVersion, "Sample schema/version must match the desktop release");
assert.equal(manifest.backupFormat, "yardimci-asistan-backup-v2");
const targetNames = {
  "a-pension-restaurant": "pension-restaurant",
  "b-market": "market",
  "c-market-dealer": "market-bayi"
};
const verified = [];
for (const [id, slug] of Object.entries(targetNames)) {
  const item = manifest.packages.find(pack => pack.id === id);
  assert.ok(item?.verification?.ok, "Missing verified demo package: " + id);
  assert.match(item.zipFile, /^[A-Za-z0-9._-]+\.zip$/);
  assert.match(item.folderName, /^[A-Za-z0-9._-]+$/);
  assert.match(item.zipSha256, /^[a-f0-9]{64}$/);
  const file = join(source, item.zipFile);
  assert.ok(existsSync(file) && statSync(file).size > 0, "Missing ZIP: " + file);
  const actualHash = createHash("sha256").update(readFileSync(file)).digest("hex");
  assert.equal(actualHash, item.zipSha256, "Package changed since verification: " + id);
  execFileSync("unzip", ["-tqq", file], { stdio: "pipe" });
  const entries = execFileSync("unzip", ["-Z", "-1", file], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  assert.ok(entries.some(entry => entry === item.folderName + "/backup.json"), "Missing package manifest: " + id);
  assert.ok(entries.some(entry => entry === item.folderName + "/yardimci-asistan.sqlite"), "Missing package database: " + id);
  assert.ok(entries.every(entry =>
    entry.startsWith(item.folderName + "/") &&
    !entry.split("/").some(part => part === "." || part === "..")
  ), "Unexpected path in " + id);
  verified.push({ file, target: join(destination, `YardimciAsistan-OrnekVeri-${slug}-${release.desktopVersion}.zip`), id });
}
if (stage) mkdirSync(destination, { recursive: true });
for (const item of verified) {
  if (stage) { copyFileSync(item.file, item.target); chmodSync(item.target, 0o644); }
  console.log(`${stage ? "STAGED" : "READY"} ${item.id} => ${item.target}`);
}
console.log(`Verified ${verified.length}/3 archives. No network or deploy was used.`);
