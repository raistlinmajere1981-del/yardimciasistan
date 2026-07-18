import { chmodSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(repoRoot, "apps", "android-app", "connection.local.json");
const webModuleUrl = normalizeWebModuleUrl(process.env.YARDIMCI_ASISTAN_ANDROID_WEB_MODULE_URL ?? "");
const syncSecret = String(process.env.YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET ?? "").trim();

if (syncSecret.length < 16) {
  throw new Error("YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET en az 16 karakter olmalı.");
}

writeFileSync(outputPath, `${JSON.stringify({
  web_module_url: webModuleUrl,
  sync_secret: syncSecret
}, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputPath, 0o600);

console.log(`android-connection-config-ok: ${outputPath} (sync secret stored)`);

function normalizeWebModuleUrl(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error("YARDIMCI_ASISTAN_ANDROID_WEB_MODULE_URL geçerli bir URL olmalı.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Android web modül adresi HTTP veya HTTPS kullanmalı.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}
