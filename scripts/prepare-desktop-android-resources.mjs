import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopResourceRoot = join(repoRoot, "apps", "desktop-app", "resources", "android");
const args = process.argv.slice(2);
const targetPlatform = valueAfter("--platform") || process.platform;
const allowDebug = args.includes("--allow-debug");
const allowMissing = args.includes("--allow-missing");

if (!["linux", "win32"].includes(targetPlatform)) {
  fail(`Desteklenmeyen masaüstü hedefi: ${targetPlatform}`);
}

const version = readProductVersion(join(repoRoot, "product-version.json"));
const releaseApk = join(
  repoRoot,
  "apps",
  "android-app",
  "build",
  "outputs",
  "apk",
  "release",
  "yardimci-asistan-release.apk"
);
const debugApk = join(
  repoRoot,
  "apps",
  "android-app",
  "build",
  "outputs",
  "apk",
  "debug",
  "yardimci-asistan-debug.apk"
);

let sourceApk = existsSync(releaseApk) ? releaseApk : "";
let variant = "release";
if (!sourceApk && allowDebug && existsSync(debugApk)) {
  sourceApk = debugApk;
  variant = "debug";
}
if (!sourceApk && !allowMissing) {
  fail(
    "Android APK bulunamadı. Önce release APK derleyin" +
    (allowDebug ? " veya debug APK hazırlayın." : ".")
  );
}

// Stage only the optional APK resource. Consumer pairing uses HTTPS QR.
mkdirSync(desktopResourceRoot, { recursive: true });
for (const filename of ["yardimci-asistan-release.apk", "version.json"]) {
  rmSync(join(desktopResourceRoot, filename), { force: true });
}

if (sourceApk) {
  const apkDestination = join(desktopResourceRoot, "yardimci-asistan-release.apk");
  copyFileSync(sourceApk, apkDestination);
  writeFileSync(
    join(desktopResourceRoot, "version.json"),
    JSON.stringify({
      versionName: variant === "debug" ? `${version.versionName}-debug` : version.versionName,
      versionCode: version.versionCode,
      variant,
      source: basename(sourceApk)
    }, null, 2) + "\n"
  );
  console.log(`Android APK staged: ${apkDestination}`);
}

function readProductVersion(path) {
  if (!existsSync(path)) {
    fail(`Ürün sürüm dosyası bulunamadı: ${path}`);
  }
  const value = JSON.parse(readFileSync(path, "utf8"));
  const versionName = String(value.version ?? "").trim();
  const versionCode = Number(value.androidVersionCode ?? 0);
  if (!/^\d+\.\d+\.\d+$/.test(versionName) || !Number.isInteger(versionCode) || versionCode <= 0) {
    fail("product-version.json geçersiz.");
  }
  return { versionName, versionCode };
}

function valueAfter(name) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1).trim();
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] ?? "").trim() : "";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
