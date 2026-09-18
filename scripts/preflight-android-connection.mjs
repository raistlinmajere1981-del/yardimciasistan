import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(repoRoot, "apps", "android-app");
const connectionConfigPath = join(appDir, "connection.local.json");
const productionWebModuleUrl = "https://yardimciasistan.alwaysdata.net/yardimci-asistan";
const releaseBuild = truthy(process.env.YARDIMCI_ASISTAN_ANDROID_RELEASE_BUILD);
const allowEmbeddedSyncSecret = truthy(process.env.YARDIMCI_ASISTAN_ANDROID_ALLOW_EMBEDDED_SYNC_SECRET);
const skipPreflight = truthy(process.env.YARDIMCI_ASISTAN_ANDROID_SKIP_CONNECTION_PREFLIGHT);

let localConfig = {};
if (existsSync(connectionConfigPath)) {
  try {
    localConfig = JSON.parse(readFileSync(connectionConfigPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Android bağlantı dosyası okunamadı: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
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
// Same embedding rule as scripts/generate-android-connection-defaults.mjs:
// release builds do not embed the shared secret unless explicitly allowed.
const embeddedSyncSecret = releaseBuild && !allowEmbeddedSyncSecret ? "" : configuredSyncSecret;

if (!embeddedSyncSecret) {
  console.log("Android bağlantı preflight atlandı: gömülü sync anahtarı yok (release davranışı).");
  process.exit(0);
}

if (skipPreflight) {
  console.warn(
    "UYARI: Android bağlantı preflight atlandı " +
    "(YARDIMCI_ASISTAN_ANDROID_SKIP_CONNECTION_PREFLIGHT ayarlı). " +
    "APK içindeki bağlantı anahtarı doğrulanmadı."
  );
  process.exit(0);
}

try {
  await verifyEmbeddedSecret(webModuleUrl, embeddedSyncSecret);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function verifyEmbeddedSecret(baseUrl, secret) {
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/sync.php?action=capabilities`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { "X-YA-Sync-Secret": secret },
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error(
      "Android bağlantı anahtarı doğrulanamadı: " +
      `web modülüne ulaşılamadı (${baseUrl}).\n` +
      "Ağı kontrol edip tekrar deneyin veya çevrimdışı derleme için " +
      "YARDIMCI_ASISTAN_ANDROID_SKIP_CONNECTION_PREFLIGHT=1 kullanın."
    );
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && payload?.ok === true) {
    console.log(`Android bağlantı preflight başarılı: ${baseUrl}`);
    return;
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "Android bağlantı anahtarı canlı web modülüyle eşleşmiyor.\n" +
      "apps/android-app/connection.local.json dosyasını güncelleyin."
    );
  }

  throw new Error(
    "Android bağlantı anahtarı doğrulanamadı: " +
    `web modülü beklenmedik yanıt verdi (HTTP ${response.status}).`
  );
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function normalizeWebModuleUrl(value) {
  return firstNonEmpty(value)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\/+$/, "");
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}
