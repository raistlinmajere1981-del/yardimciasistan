import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(repoRoot, "apps", "android-app");
const buildDir = join(appDir, "build");
const packageName = "com.yardimciasistan.android";

const sdkDir = findAndroidSdk();
const platform = findAndroidPlatform(sdkDir);
const buildTools = findBuildTools(sdkDir);

const androidJar = join(platform.path, "android.jar");
const aapt2 = join(buildTools.path, "aapt2");
const d8 = join(buildTools.path, "d8");
const zipalign = join(buildTools.path, "zipalign");
const apksigner = join(buildTools.path, "apksigner");
const lambdaStubs = join(buildTools.path, "core-lambda-stubs.jar");

const compiledResources = join(buildDir, "intermediates", "compiled-res.zip");
const resourceApk = join(buildDir, "intermediates", "resources.apk");
const unsignedApk = join(buildDir, "intermediates", "app-unsigned.apk");
const alignedApk = join(buildDir, "intermediates", "app-aligned.apk");
const dexDir = join(buildDir, "intermediates", "dex");
const classDir = join(buildDir, "intermediates", "classes");
const testClassDir = join(buildDir, "intermediates", "test-classes");
const generatedJavaDir = join(buildDir, "generated", "source", "r");
const outputDir = join(buildDir, "outputs", "apk", "debug");
const outputApk = join(outputDir, "yardimci-asistan-debug.apk");
const debugKeystore = join(appDir, ".debug", "yardimci-asistan-debug.keystore");
const connectionConfigPath = join(appDir, "connection.local.json");
const productionWebModuleUrl = "https://yardimciasistan.alwaysdata.net/yardimci-asistan";

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(join(buildDir, "intermediates"), { recursive: true });
mkdirSync(classDir, { recursive: true });
mkdirSync(testClassDir, { recursive: true });
mkdirSync(dexDir, { recursive: true });
mkdirSync(generatedJavaDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });
mkdirSync(dirname(debugKeystore), { recursive: true });

run(aapt2, ["compile", "--dir", join(appDir, "src", "main", "res"), "-o", compiledResources]);
run(aapt2, [
  "link",
  "-o",
  resourceApk,
  "--manifest",
  join(appDir, "AndroidManifest.xml"),
  "-I",
  androidJar,
  "--java",
  generatedJavaDir,
  "--min-sdk-version",
  "26",
  "--target-sdk-version",
  String(platform.api),
  "--version-code",
  "1",
  "--version-name",
  "0.1.0",
  "--debug-mode",
  compiledResources
]);

const connectionDefaults = generateConnectionDefaults();

const javaFiles = [
  ...collectFiles(join(appDir, "src", "main", "java"), ".java"),
  ...collectFiles(generatedJavaDir, ".java")
];

run("javac", [
  "-encoding",
  "UTF-8",
  "-source",
  "8",
  "-target",
  "8",
  "-bootclasspath",
  `${androidJar}${delimiter}${lambdaStubs}`,
  "-d",
  classDir,
  ...javaFiles
]);

const javaTestFiles = collectFiles(join(appDir, "src", "test", "java"), ".java");
if (javaTestFiles.length > 0) {
  run("javac", [
    "-encoding",
    "UTF-8",
    "-source",
    "8",
    "-target",
    "8",
    "-classpath",
    classDir,
    "-d",
    testClassDir,
    ...javaTestFiles
  ]);
  for (const testMain of [
    "com.yardimciasistan.android.StableDeviceIdSmoke",
    "com.yardimciasistan.android.NotificationRulesSmoke",
    "com.yardimciasistan.android.StockRulesSmoke"
  ]) {
    run("java", [
      "-classpath",
      `${androidJar}${delimiter}${classDir}${delimiter}${testClassDir}`,
      testMain
    ]);
  }
}

run(d8, [
  "--lib",
  androidJar,
  "--min-api",
  "26",
  "--output",
  dexDir,
  ...collectFiles(classDir, ".class")
]);

copyFileSync(resourceApk, unsignedApk);
run("jar", ["uf", unsignedApk, "-C", dexDir, "classes.dex"]);
createDebugKeystore(debugKeystore);
run(zipalign, ["-f", "-p", "4", unsignedApk, alignedApk]);
run(apksigner, [
  "sign",
  "--ks",
  debugKeystore,
  "--ks-key-alias",
  "androiddebugkey",
  "--ks-pass",
  "pass:android",
  "--key-pass",
  "pass:android",
  "--out",
  outputApk,
  alignedApk
]);
run(apksigner, ["verify", "--verbose", outputApk]);

const badging = run(aapt2, ["dump", "badging", outputApk], { capture: true });
const packageLine = badging.stdout.split("\n").find((line) => line.startsWith("package:"));

if (!packageLine?.includes(`name='${packageName}'`)) {
  throw new Error(`APK package doğrulanamadı: ${packageLine ?? "badging yok"}`);
}

console.log(`android-build-ok: ${outputApk}`);
console.log(packageLine);
console.log(`android-sdk: ${sdkDir}`);
console.log(`compile-sdk: android-${platform.api} build-tools-${buildTools.version}`);
console.log(`android-connection-defaults: ${connectionDefaults.webModuleUrl} (${connectionDefaults.syncSecret ? "sync secret embedded" : "sync secret not configured"})`);
console.log(`android-connection-mode: ${connectionDefaults.lockEmbeddedConnection ? "embedded connection locked" : "editable connection"}`);

function generateConnectionDefaults() {
  let localConfig = {};
  if (existsSync(connectionConfigPath)) {
    try {
      localConfig = JSON.parse(readFileSync(connectionConfigPath, "utf8"));
    } catch (error) {
      throw new Error(`Android bağlantı dosyası okunamadı: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const webModuleUrl = normalizeWebModuleUrl(
    firstNonEmpty(process.env.YARDIMCI_ASISTAN_ANDROID_WEB_MODULE_URL, localConfig.web_module_url, productionWebModuleUrl)
  );
  const syncSecret = firstNonEmpty(process.env.YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET, localConfig.sync_secret);
  if (syncSecret && syncSecret.length < 16) {
    throw new Error("Android varsayılan sync anahtarı en az 16 karakter olmalı.");
  }
  const lockEmbeddedConnection = Boolean(webModuleUrl && syncSecret);

  const packageDir = join(generatedJavaDir, "com", "yardimciasistan", "android");
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, "ConnectionDefaults.java"), [
    "package com.yardimciasistan.android;",
    "",
    "final class ConnectionDefaults {",
    `  static final String WEB_MODULE_URL = ${javaString(webModuleUrl)};`,
    `  static final String SYNC_SECRET = ${javaString(syncSecret)};`,
    `  static final boolean LOCK_EMBEDDED_CONNECTION = ${lockEmbeddedConnection};`,
    "",
    "  private ConnectionDefaults() {}",
    "}",
    ""
  ].join("\n"), { mode: 0o600 });

  return { webModuleUrl, syncSecret, lockEmbeddedConnection };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function normalizeWebModuleUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Android varsayılan web modül adresi geçerli bir URL olmalı.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Android varsayılan web modül adresi HTTP veya HTTPS kullanmalı.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function javaString(value) {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)}"`;
}

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), "Android", "Sdk")
  ].filter(Boolean);

  const sdk = candidates.find((candidate) => candidate && existsSync(join(candidate, "platforms")) && existsSync(join(candidate, "build-tools")));
  if (!sdk) {
    throw new Error("Android SDK bulunamadı. ANDROID_HOME veya ANDROID_SDK_ROOT ayarlayın.");
  }

  return sdk;
}

function findAndroidPlatform(sdk) {
  const platformsDir = join(sdk, "platforms");
  const platforms = readdirSync(platformsDir)
    .map((name) => {
      const match = /^android-(\d+)$/.exec(name);
      return match ? { name, api: Number(match[1]), path: join(platformsDir, name) } : null;
    })
    .filter(Boolean)
    .filter((platformEntry) => existsSync(join(platformEntry.path, "android.jar")))
    .sort((a, b) => b.api - a.api);

  if (platforms.length === 0) {
    throw new Error("Sayısal Android platformu bulunamadı. Örn. platforms/android-36.");
  }

  return platforms[0];
}

function findBuildTools(sdk) {
  const toolsDir = join(sdk, "build-tools");
  const tools = readdirSync(toolsDir)
    .map((version) => ({
      version,
      score: version.split(".").map((part) => Number(part) || 0),
      path: join(toolsDir, version)
    }))
    .filter((tool) => ["aapt2", "d8", "zipalign", "apksigner", "core-lambda-stubs.jar"].every((binary) => existsSync(join(tool.path, binary))))
    .sort((a, b) => compareVersionScore(b.score, a.score));

  if (tools.length === 0) {
    throw new Error("Android build-tools içinde aapt2/d8/zipalign/apksigner bulunamadı.");
  }

  return tools[0];
}

function createDebugKeystore(path) {
  if (existsSync(path)) {
    return;
  }

  run("keytool", [
    "-genkeypair",
    "-keystore",
    path,
    "-storepass",
    "android",
    "-alias",
    "androiddebugkey",
    "-keypass",
    "android",
    "-keyalg",
    "RSA",
    "-keysize",
    "2048",
    "-validity",
    "10000",
    "-dname",
    "CN=Yardimci Asistan Debug,O=Yardimci Asistan,C=TR",
    "-noprompt"
  ]);
}

function collectFiles(directory, extension) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      return collectFiles(path, extension);
    }

    return path.endsWith(extension) ? [path] : [];
  });
}

function compareVersionScore(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`${command} ${args.join(" ")} başarısız oldu.\n${output}`);
  }

  if (!options.capture && result.stderr?.trim()) {
    const stderr = result.stderr.trim();
    if (!/bootstrap class path not set/.test(stderr)) {
      console.error(stderr);
    }
  }

  return result;
}
