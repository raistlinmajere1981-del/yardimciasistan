import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  IGNORED_SMOKE_FILES,
  VERIFICATION_CHECKS,
  createVerificationPlan,
  validateVerificationRegistry
} from "./verification-registry.mjs";

test("verification registry geçerli ve komutlar benzersiz", () => {
  assert.deepEqual(validateVerificationRegistry(), []);
});

test("full preset hiçbir kontrolü iki kez planlamaz", () => {
  const plan = createVerificationPlan({ preset: "full", platform: "linux" });
  const ids = plan.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("build-packages"));
  assert.ok(ids.includes("build-desktop"));
  assert.equal(ids.filter((id) => id === "build-packages").length, 1);
  assert.equal(ids.filter((id) => id === "build-desktop").length, 1);
});

test("pre-main full kapsamını taşır ve strict kapıları ekler", () => {
  const full = new Set(createVerificationPlan({ preset: "full", platform: "linux" }).map((item) => item.id));
  const preMain = new Set(createVerificationPlan({ preset: "pre-main", platform: "linux" }).map((item) => item.id));
  for (const id of full) assert.ok(preMain.has(id), `pre-main full kontrolünü içermiyor: ${id}`);
  for (const id of ["lint-strict", "knip-strict", "design-audit-strict", "architecture-audit", "git-diff-check"]) {
    assert.ok(preMain.has(id), `pre-main strict kapısı eksik: ${id}`);
  }
});

test("release pre-main kapsamını taşır ve paket doğrulamalarını ekler", () => {
  const preMain = new Set(createVerificationPlan({ preset: "pre-main", platform: "linux" }).map((item) => item.id));
  const release = new Set(createVerificationPlan({ preset: "release", platform: "linux" }).map((item) => item.id));
  for (const id of preMain) assert.ok(release.has(id), `release pre-main kontrolünü içermiyor: ${id}`);
  for (const id of ["package-web-module", "package-desktop-dir", "android-release-apk", "dealer-android-release-apk", "android-release-aab", "desktop-package"]) {
    assert.ok(release.has(id), `release paket kontrolü eksik: ${id}`);
  }
});

test("release güncel A/B/C ZIP dosyalarının gerçek import smoke'unu çalıştırır", () => {
  const plan = createVerificationPlan({ preset: "release", platform: "linux" });
  const check = plan.find(item => item.id === "backup-zip-import");
  assert.ok(check && !check.manual, "Demo ZIP import otomatik release kabulünde bulunmalı");
  assert.ok(check.requires.includes("build-desktop"), "ZIP import güncel Electron derlemesi üstünde çalışmalı");
});

test("domain plan prerequisite'leri bir kez ekler", () => {
  const plan = createVerificationPlan({ domain: "hospitality", platform: "linux" });
  const ids = plan.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => id === "build-packages").length, 1);
  assert.equal(ids.filter((id) => id === "build-desktop").length, 1);
  assert.ok(ids.includes("pension-workspace"));
  assert.ok(ids.includes("restaurant-workspace"));
});

test("manuel kontroller full preset'e kendiliğinden girmez", () => {
  const ids = new Set(createVerificationPlan({ preset: "full", platform: "linux" }).map((item) => item.id));
  assert.equal(ids.has("android-device-ui"), false);
  assert.equal(ids.has("live-ai"), false);
});

test("scripts altındaki tüm smoke dosyaları registry'de veya açıkça helper olarak işaretli", () => {
  const registered = new Set(
    VERIFICATION_CHECKS
      .flatMap((item) => item.args)
      .filter((value) => typeof value === "string" && /^scripts\/smoke-.*\.(mjs|php)$/.test(value))
  );
  const files = readdirSync(join(process.cwd(), "scripts"))
    .filter((name) => /^smoke-.*\.(mjs|php)$/.test(name))
    .map((name) => `scripts/${name}`)
    .sort();

  const missing = files.filter((file) => !registered.has(file) && !IGNORED_SMOKE_FILES.has(file));
  assert.deepEqual(missing, []);
});


test("domain plan release-only paketleme adımlarını içermez", () => {
  const desktop = new Set(createVerificationPlan({ domain: "desktop", platform: "linux" }).map((item) => item.id));
  const android = new Set(createVerificationPlan({ domain: "android", platform: "linux" }).map((item) => item.id));
  assert.equal(desktop.has("package-desktop-dir"), false);
  assert.equal(desktop.has("desktop-package"), false);
  assert.equal(android.has("android-release-apk"), false);
  assert.equal(android.has("android-release-aab"), false);
});

test("Android domain sync ve local companion çapraz akışlarını kapsar", () => {
  const ids = new Set(createVerificationPlan({ domain: "android", platform: "linux" }).map((item) => item.id));
  assert.ok(ids.has("automatic-sync"));
  assert.ok(ids.has("local-companion-server"));
  assert.ok(ids.has("market-companion-desktop-inbox"));
});


test("Android Bayi ve inspector release kontrolü soğuk Gradle cache'de offline zorlamaz", () => {
  const keys = ["dealer-android-build", "dealer-android-tests", "image-inspector-device-build"];
  for (const id of keys) {
    const item = VERIFICATION_CHECKS.find(check => check.id === id);
    assert.ok(item, id);
    assert.equal(item.args.includes("--offline"), false, id + " Maven/Android lint araçlarını çözebilmeli");
  }
});

test("release stages the current signed Companion before the desktop package",()=>{
  const ids=createVerificationPlan({preset:"release",platform:"linux"}).map(item=>item.id);
  assert.ok(ids.indexOf("android-release-apk")<ids.indexOf("package-desktop-dir"));
  assert.ok(ids.includes("dealer-android-release-apk"));
});


test("başarısız verify kontrolü gerçek stderr/stdout'u raporda özel dosyaya kaydeder", () => {
  const root = mkdtempSync(join(tmpdir(), "ya-verify-log-fixture-"));
  try {
    mkdirSync(join(root, "scripts"));
    copyFileSync("scripts/verify.mjs", join(root, "scripts/verify.mjs"));
    writeFileSync(join(root, "scripts/verification-registry.mjs"), `
export const VERIFICATION_CHECKS = [];
export const VERIFICATION_PRESETS = ["release"];
export const verificationDomains = () => [];
export const validateVerificationRegistry = () => [];
export const createVerificationPlan = () => [{
  id: "fixture-fail", label: "Fixture", command: "node",
  args: ["-e", "console.log('STDOUT-fixture'); if(process.env.TEST_FAIL === '1'){console.error('STDERR-fixture'); process.exit(23)}"],
  requires: []
}];
`);
    const execute = (fail) => spawnSync(process.execPath, ["scripts/verify.mjs", "--check", "fixture-fail"], {
      cwd: root, encoding: "utf8", env: { ...process.env, TEST_FAIL: fail ? "1" : "0" }
    });
    const failed = execute(true);
    assert.equal(failed.status, 1, failed.stderr);
    assert.match(failed.stdout, /STDOUT-fixture/);
    const reportPath = join(root, "artifacts/verify/latest.json");
    const result = JSON.parse(readFileSync(reportPath, "utf8")).checks[0];
    assert.equal(result.exit_code, 23);
    assert.equal(result.status, "failed");
    assert.ok(result.log_path);
    const log = readFileSync(result.log_path, "utf8");
    assert.match(log, /STDOUT-fixture/);
    assert.match(log, /STDERR-fixture/);
    if (process.platform !== "win32") assert.equal(statSync(result.log_path).mode & 0o777, 0o600);
    const passed = execute(false);
    assert.equal(passed.status, 0, passed.stderr);
    const passCheck = JSON.parse(readFileSync(reportPath, "utf8")).checks[0];
    assert.equal(passCheck.status, "passed");
    assert.equal(passCheck.log_path, undefined, "Başarılı kontroller log saklamamalı");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
