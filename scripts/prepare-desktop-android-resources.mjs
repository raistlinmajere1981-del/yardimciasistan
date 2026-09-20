import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopResourceRoot = join(repoRoot, "apps", "desktop-app", "resources", "android");
const args = process.argv.slice(2);
const targetPlatform = valueAfter("--platform") || process.platform;
const allowDebug = args.includes("--allow-debug");
const allowMissing = args.includes("--allow-missing");

if (!["linux", "win32"].includes(targetPlatform)) {
  fail(`Desteklenmeyen Android Platform-Tools hedefi: ${targetPlatform}`);
}

mkdirSync(desktopResourceRoot, { recursive: true });
rmSync(join(desktopResourceRoot, "platform-tools"), { recursive: true, force: true });
for (const filename of ["yardimci-asistan-release.apk", "version.json"]) {
  rmSync(join(desktopResourceRoot, filename), { force: true });
}

const version = readVersionProperties(join(repoRoot, "apps", "android-app", "version.properties"));
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

const platformToolsSource = resolvePlatformToolsSource(targetPlatform);
if (!platformToolsSource) {
  if (!allowMissing) {
    const envName = targetPlatform === "win32"
      ? "YA_ANDROID_PLATFORM_TOOLS_WIN32"
      : "YA_ANDROID_PLATFORM_TOOLS_LINUX";
    fail(
      `${targetPlatform} Android Platform-Tools bulunamadı. ` +
      `${envName} ile platform-tools klasörünü belirtin.`
    );
  }
  console.warn(`Android Platform-Tools staging atlandı: ${targetPlatform} kaynağı bulunamadı.`);
  process.exit(0);
}

const platformToolsDestination = join(desktopResourceRoot, "platform-tools");
mkdirSync(platformToolsDestination, { recursive: true });
const requiredFiles = targetPlatform === "win32"
  ? ["adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll"]
  : ["adb"];

for (const filename of requiredFiles) {
  const source = join(platformToolsSource, filename);
  if (!existsSync(source)) {
    if (!allowMissing) {
      fail(`Platform-Tools dosyası bulunamadı: ${source}`);
    }
    console.warn(`Platform-Tools dosyası atlandı: ${source}`);
    continue;
  }
  const destination = join(platformToolsDestination, filename);
  copyFileSync(source, destination);
  if (targetPlatform === "linux" && filename === "adb") {
    chmodSync(destination, 0o755);
  }
}

console.log(`Android Platform-Tools staged: ${platformToolsDestination} (${targetPlatform})`);

function resolvePlatformToolsSource(platform) {
  const explicit = platform === "win32"
    ? process.env.YA_ANDROID_PLATFORM_TOOLS_WIN32
    : process.env.YA_ANDROID_PLATFORM_TOOLS_LINUX;
  if (explicit?.trim() && existsSync(explicit.trim())) {
    return resolve(explicit.trim());
  }

  if (platform !== process.platform) {
    return "";
  }

  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : "",
    platform !== "win32" ? join(homedir(), "Android", "Sdk") : ""
  ].filter(Boolean);

  return sdkRoots
    .map((root) => join(root, "platform-tools"))
    .find((candidate) => existsSync(candidate)) ?? "";
}

function readVersionProperties(path) {
  if (!existsSync(path)) {
    fail(`Android sürüm dosyası bulunamadı: ${path}`);
  }
  const text = readFileSync(path, "utf8");
  const versionName = text.match(/^VERSION_NAME=(.+)$/m)?.[1]?.trim() ?? "";
  const versionCode = Number(text.match(/^VERSION_CODE=(\d+)$/m)?.[1] ?? 0);
  if (!versionName || !Number.isInteger(versionCode) || versionCode <= 0) {
    fail("Android version.properties geçersiz.");
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
