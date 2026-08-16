import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(repoRoot, "apps", "android-app");
const connectionConfigPath = join(appDir, "connection.local.json");
const outputPath = join(
  appDir,
  "build",
  "generated",
  "source",
  "connection",
  "com",
  "yardimciasistan",
  "android",
  "ConnectionDefaults.java"
);
const productionWebModuleUrl = "https://yardimciasistan.alwaysdata.net/yardimci-asistan";
const releaseBuild = ["1", "true", "yes"].includes(
  String(process.env.YARDIMCI_ASISTAN_ANDROID_RELEASE_BUILD ?? "").trim().toLowerCase()
);

let localConfig = {};
if (existsSync(connectionConfigPath)) {
  try {
    localConfig = JSON.parse(readFileSync(connectionConfigPath, "utf8"));
  } catch (error) {
    throw new Error(`Android bağlantı dosyası okunamadı: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const webModuleUrl = normalizeWebModuleUrl(
  firstNonEmpty(
    process.env.YARDIMCI_ASISTAN_ANDROID_WEB_MODULE_URL,
    localConfig.web_module_url,
    productionWebModuleUrl
  )
);
const configuredSyncSecret = firstNonEmpty(
  process.env.YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET,
  localConfig.sync_secret
);
if (configuredSyncSecret && configuredSyncSecret.length < 16) {
  throw new Error("Android varsayılan sync anahtarı en az 16 karakter olmalı.");
}

// Release/pilot APK must never contain the business-wide bootstrap secret in
// its bytecode. The operator enters it once during first pairing; after desktop
// approval the app replaces it with a per-device token. Debug builds may still
// embed a local secret to keep device automation practical.
const syncSecret = releaseBuild ? "" : configuredSyncSecret;
const lockEmbeddedConnection = Boolean(webModuleUrl && syncSecret);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, [
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

const mode = releaseBuild
  ? "release editable connection (shared secret omitted)"
  : lockEmbeddedConnection ? "embedded debug connection locked" : "editable connection";
console.log(`android-connection-mode: ${mode}`);

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
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
    )}"`;
}
