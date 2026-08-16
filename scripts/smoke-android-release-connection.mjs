import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const secret = "release-apk-must-not-contain-this-secret-987654321";
const generator = join(process.cwd(), "scripts", "generate-android-connection-defaults.mjs");
const result = spawnSync(process.execPath, [generator], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: {
    ...process.env,
    YARDIMCI_ASISTAN_ANDROID_RELEASE_BUILD: "1",
    YARDIMCI_ASISTAN_ANDROID_WEB_MODULE_URL: "https://pilot.example.test/yardimci-asistan",
    YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET: secret
  }
});

assert.equal(result.status, 0, result.stderr || result.stdout);
const generatedPath = join(
  process.cwd(),
  "apps",
  "android-app",
  "build",
  "generated",
  "source",
  "connection",
  "com",
  "yardimciasistan",
  "android",
  "ConnectionDefaults.java"
);
const generated = readFileSync(generatedPath, "utf8");
assert.equal(generated.includes(secret), false, "Release ConnectionDefaults ortak sync anahtarını içermemeli.");
assert.match(generated, /static final String SYNC_SECRET = "";/);
assert.match(generated, /static final boolean LOCK_EMBEDDED_CONNECTION = false;/);
assert.match(generated, /https:\/\/pilot\.example\.test\/yardimci-asistan/);
console.log("android-release-connection-smoke-ok: shared secret omitted");
