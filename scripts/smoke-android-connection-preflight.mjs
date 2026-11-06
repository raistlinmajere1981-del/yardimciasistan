import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

// QR pairing now owns connection credentials. The preflight must verify that
// even a stale local configuration or legacy environment overrides cannot
// inject a business-specific address/secret into the Android build.
const repo = process.cwd();
const preflight = join(repo, "scripts", "preflight-android-connection.mjs");
const generatedPath = join(
  repo, "apps", "android-app", "build", "generated", "source",
  "connection", "com", "yardimciasistan", "android", "ConnectionDefaults.java"
);
const bogusSecret = "android-preflight-injected-legacy-secret-123";
const bogusUrl = "https://obsolete-private-business.example.test/yardimci-asistan";

for (const release of ["0", "1"]) {
  const env = {
    ...process.env,
    YARDIMCI_ASISTAN_ANDROID_RELEASE_BUILD: release,
    YARDIMCI_ASISTAN_ANDROID_ALLOW_EMBEDDED_SYNC_SECRET: "1",
    YARDIMCI_ASISTAN_ANDROID_WEB_MODULE_URL: bogusUrl,
    YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET: bogusSecret
  };
  const result = spawnSync(process.execPath, [preflight], { cwd: repo, env, encoding: "utf8" });
  const log = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert.equal(result.status, 0, log);
  assert.match(log, /preflight başarılı: işletmeden bağımsız APK/);
  assert.equal(log.includes(bogusSecret), false, "Secret must never appear in preflight output.");
  assert.equal(log.includes(bogusUrl), false, "Private URL must never appear in preflight output.");

  const generated = readFileSync(generatedPath, "utf8");
  assert.match(generated, /static final String WEB_MODULE_URL = "";/);
  assert.match(generated, /static final String SYNC_SECRET = "";/);
  assert.match(generated, /static final boolean LOCK_EMBEDDED_CONNECTION = false;/);
  assert.equal(generated.includes(bogusSecret), false, "Shared secret must not be compiled.");
  assert.equal(generated.includes(bogusUrl), false, "Business URL must not be compiled.");
}
console.log("android-connection-preflight-smoke-ok: debug/release credential-free, legacy overrides ignored");
