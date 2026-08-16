import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourceRoot = join(repoRoot, "firm-template", "web-module");
const outputRoot = join(repoRoot, "artifacts", "web-module-deploy");
const packageRoot = join(outputRoot, "yardimci-asistan");
const manifestPath = join(outputRoot, "manifest.json");
const tarballPath = join(outputRoot, "yardimci-asistan.tar.gz");
const zipPath = join(outputRoot, "yardimci-asistan.zip");
const requiredFiles = [
  "README.md",
  "widget.js",
  "menu.html",
  "api/request.php",
  "api/sync.php",
  "api/menu.php",
  "api/chat.php",
  "api/stock-image-analysis.php",
  "api/identity-image-analysis.php",
  "lib/storage.php",
  "lib/public-request-guard.php",
  "lib/stock-image-analysis.php",
  "lib/identity-image-analysis.php",
  "assets/yardimci-asistan-symbol.png",
  "assets/menu-breakfast.webp",
  "config/.htaccess",
  "config/ai.php",
  "config/business.json",
  "data/.htaccess",
  "data/requests.json",
  "data/menu.json",
  "data/ai-conversations.json",
  "data/sync-state.json",
  "data/android-snapshot.json",
  "data/android-actions.json",
  "knowledge/.htaccess",
  "knowledge/firma.md",
  "knowledge/odalar.md",
  "knowledge/restoran.md",
  "knowledge/menu.md",
  "knowledge/sik-sorulan-sorular.md"
];
const businessOverrideFields = [
  ["display_name", "YARDIMCI_ASISTAN_DEPLOY_DISPLAY_NAME"],
  ["phone", "YARDIMCI_ASISTAN_DEPLOY_PHONE"],
  ["whatsapp", "YARDIMCI_ASISTAN_DEPLOY_WHATSAPP"],
  ["email", "YARDIMCI_ASISTAN_DEPLOY_EMAIL"],
  ["website", "YARDIMCI_ASISTAN_DEPLOY_WEBSITE"],
  ["address", "YARDIMCI_ASISTAN_DEPLOY_ADDRESS"],
  ["primary_color", "YARDIMCI_ASISTAN_DEPLOY_PRIMARY_COLOR"],
  ["accent_color", "YARDIMCI_ASISTAN_DEPLOY_ACCENT_COLOR"],
  ["sync_secret", "YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET", true]
];

validateSource();
rmSync(packageRoot, { recursive: true, force: true });
rmSync(tarballPath, { force: true });
rmSync(zipPath, { force: true });
mkdirSync(outputRoot, { recursive: true });
cpSync(sourceRoot, packageRoot, {
  recursive: true,
  filter: shouldCopySourcePath
});

const appliedOverrides = applyPackageOverrides();
const packageFiles = listFiles(packageRoot);
const businessConfig = JSON.parse(readFileSync(join(packageRoot, "config", "business.json"), "utf8"));
validateBusinessConfig(businessConfig, "paket config/business.json");
const archives = createArchives();
const manifest = {
  package_name: "yardimci-asistan",
  source: relative(repoRoot, sourceRoot),
  output: relative(repoRoot, packageRoot),
  generated_at: new Date().toISOString(),
  file_count: packageFiles.length,
  applied_overrides: appliedOverrides,
  warnings: createDeploymentWarnings(businessConfig),
  archives,
  files: packageFiles.map((file) => {
    const absolutePath = join(packageRoot, file);
    return {
      path: file,
      bytes: statSync(absolutePath).size,
      sha256: sha256(absolutePath)
    };
  })
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
validatePackage(manifest);

const archiveSummary = archives.filter((archive) => archive.status === "created").map((archive) => archive.path).join(", ") || "arşiv yok";
console.log(`web-module-package-ok: ${relative(repoRoot, packageRoot)} (${manifest.file_count} dosya, ${archiveSummary})`);

function validateSource() {
  assert.ok(existsSync(sourceRoot), `Web modül kaynak klasörü bulunamadı: ${sourceRoot}`);

  for (const file of requiredFiles) {
    assert.ok(existsSync(join(sourceRoot, file)), `Web modül kaynak dosyası eksik: ${file}`);
  }

  assertJsonObject("config/business.json");
  assertJsonArray("data/requests.json");
  assertJsonObject("data/menu.json");
  assertJsonArray("data/ai-conversations.json");
  assertJsonObject("data/sync-state.json");
  assertJsonObject("data/android-snapshot.json");
  assertJsonArray("data/android-actions.json");

  const business = JSON.parse(readFileSync(join(sourceRoot, "config", "business.json"), "utf8"));
  validateBusinessConfig(business, "kaynak config/business.json");

  const aiConfig = readFileSync(join(sourceRoot, "config", "ai.php"), "utf8");
  assert.ok(aiConfig.includes("getenv('YARDIMCI_ASISTAN_AI_API_KEY')"), "config/ai.php API anahtarını ortam değişkeninden okumalı.");
  assert.ok(aiConfig.includes("data/ai-settings.local.php"), "config/ai.php masaüstünden yayınlanan korumalı AI ayarını okumalı.");
  assert.ok(aiConfig.includes("public-request-guard.php") && aiConfig.includes("ya_public_guard_enforce('chat')"), "Web AI public abuse guard üzerinden geçmeli.");

  const requestEndpoint = readFileSync(join(sourceRoot, "api", "request.php"), "utf8");
  assert.ok(requestEndpoint.includes("public-request-guard.php") && requestEndpoint.includes("ya_public_guard_enforce('request')"), "Web talep endpoint'i public abuse guard üzerinden geçmeli.");

  const publicGuard = readFileSync(join(sourceRoot, "lib", "public-request-guard.php"), "utf8");
  assert.ok(publicGuard.includes("hash_hmac('sha256'"), "Public guard ham istemci adresi yerine HMAC özeti kullanmalı.");
  assert.ok(publicGuard.includes("public_request_guard_events"), "Public guard kalıcı hız sınırı sayacını içermeli.");
  assert.ok(publicGuard.includes("CONTENT_LENGTH") && publicGuard.includes("429"), "Public guard gövde boyutu ve rate-limit koruması uygulamalı.");

  const syncEndpoint = readFileSync(join(sourceRoot, "api", "sync.php"), "utf8");
  assert.ok(syncEndpoint.includes("publish_ai_settings"), "api/sync.php AI ayar yayın aksiyonunu içermeli.");
  assert.ok(syncEndpoint.includes("HTTP_X_YA_SYNC_SECRET"), "AI ayar yayını header güvenlik anahtarını doğrulamalı.");
  assert.ok(syncEndpoint.includes("enqueue_android_action"), "api/sync.php Android action kuyruğunu içermeli.");
  assert.ok(syncEndpoint.includes("acknowledge_requests"), "api/sync.php cursor onayını içermeli.");

  const stockImageEndpoint = readFileSync(join(sourceRoot, "api", "stock-image-analysis.php"), "utf8");
  assert.ok(stockImageEndpoint.includes("HTTP_X_YA_SYNC_SECRET"), "Stok görseli endpoint'i header güvenlik anahtarını doğrulamalı.");
  assert.ok(stockImageEndpoint.includes("YA_STOCK_IMAGE_MAX_BYTES"), "Stok görseli endpoint'i yükleme boyutu sınırı uygulamalı.");
  assert.ok(stockImageEndpoint.includes("unlink($temporaryPath)"), "Stok görseli endpoint'i geçici yüklemeyi silmeli.");

  const stockImageAnalyzer = readFileSync(join(sourceRoot, "lib", "stock-image-analysis.php"), "utf8");
  assert.ok(stockImageAnalyzer.includes("interface YaVisionStockAnalyzer"), "Stok görseli analizi sağlayıcıdan bağımsız sözleşme sunmalı.");
  assert.ok(
    stockImageAnalyzer.includes("function ya_stock_image_has_ambiguous_unit")
      && stockImageAnalyzer.includes("koli, paket, kg"),
    "Stok görseli analizi belirsiz birim korumasını içermeli."
  );

  const storageModule = readFileSync(join(sourceRoot, "lib", "storage.php"), "utf8");
  assert.ok(storageModule.includes("PDO_SQLITE") || storageModule.includes("pdo_sqlite"), "SQLite depolama PDO_SQLITE gereksinimini açıklamalı.");

  const widget = readFileSync(join(sourceRoot, "widget.js"), "utf8");
  assert.ok(widget.includes("YardimciAsistanWidget"), "widget.js YardimciAsistanWidget globalini içermeli.");

  for (const folder of ["config", "data", "knowledge"]) {
    const htaccess = readFileSync(join(sourceRoot, folder, ".htaccess"), "utf8");
    assert.match(htaccess, /(Deny from all|Require all denied)/, `${folder}/.htaccess doğrudan erişimi kapatmalı.`);
  }
}

function applyPackageOverrides() {
  const businessConfigPath = join(packageRoot, "config", "business.json");
  const business = JSON.parse(readFileSync(businessConfigPath, "utf8"));
  const applied = [];

  for (const [field, envName, redacted = false] of businessOverrideFields) {
    const value = String(process.env[envName] ?? "").trim();
    if (!value) {
      continue;
    }

    business[field] = value;
    applied.push({
      field,
      env: envName,
      redacted: Boolean(redacted)
    });
  }

  const allowedOrigins = parseList(process.env.YARDIMCI_ASISTAN_DEPLOY_ALLOWED_ORIGINS ?? "");
  if (allowedOrigins.length > 0) {
    business.allowed_origins = allowedOrigins;
    applied.push({
      field: "allowed_origins",
      env: "YARDIMCI_ASISTAN_DEPLOY_ALLOWED_ORIGINS",
      redacted: false
    });
  }

  if (applied.length > 0) {
    writeFileSync(businessConfigPath, `${JSON.stringify(business, null, 2)}\n`);
  }

  return applied;
}

function validatePackage(manifest) {
  const manifestFiles = new Set(manifest.files.map((file) => file.path));
  for (const file of requiredFiles) {
    assert.ok(manifestFiles.has(file), `Paket manifestinde eksik dosya: ${file}`);
  }

  for (const secretFile of ["config/ai.local.php", "data/ai-settings.local.php"]) {
    assert.equal(manifestFiles.has(secretFile), false, `Paket gizli runtime ayarı içermemeli: ${secretFile}`);
  }

  const forbidden = manifest.files.filter((file) => {
    return file.path.startsWith("node_modules/") || file.path.startsWith("dist/") || file.path.endsWith(".ts") || file.path.includes("/.env");
  });
  assert.deepEqual(forbidden, [], `Web modül paketinde yayınlanmaması gereken dosya var: ${forbidden.map((file) => file.path).join(", ")}`);

  const manifestOnDisk = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifestOnDisk.file_count, manifest.files.length);

  for (const archive of manifest.archives) {
    if (archive.status !== "created") {
      continue;
    }

    const archivePath = join(repoRoot, archive.path);
    assert.ok(existsSync(archivePath), `Arşiv dosyası bulunamadı: ${archive.path}`);
    assert.equal(statSync(archivePath).size, archive.bytes);
    assert.equal(sha256(archivePath), archive.sha256);
  }
}

function shouldCopySourcePath(sourcePath) {
  const relativePath = relative(sourceRoot, sourcePath).replaceAll("\\", "/");
  if (relativePath === ".DS_Store" || relativePath.endsWith("/.DS_Store")) {
    return false;
  }

  if (relativePath === "config/ai.local.php" || relativePath === "data/ai-settings.local.php") {
    return false;
  }

  if (relativePath === "data/yardimci-asistan.sqlite"
      || relativePath.startsWith("data/yardimci-asistan.sqlite-")
      || relativePath.endsWith(".legacy-backup-v1")) {
    return false;
  }

  return !relativePath.startsWith("data/.ai-settings.");
}

function validateBusinessConfig(business, label) {
  assert.equal(typeof business.display_name, "string", `${label} display_name string olmalı.`);
  assert.ok(business.display_name.trim().length > 0, `${label} display_name boş olmamalı.`);
  assert.equal(typeof business.sync_secret, "string", `${label} sync_secret string olmalı.`);
  assert.ok(business.sync_secret.trim().length > 0, `${label} sync_secret boş olmamalı.`);
  assert.ok(Array.isArray(business.allowed_origins), `${label} allowed_origins dizi olmalı.`);
}

function createArchives() {
  return [
    createTarGzArchive(),
    createZipArchiveIfAvailable()
  ];
}

function createTarGzArchive() {
  const result = spawnSync("tar", ["-czf", tarballPath, "-C", outputRoot, "yardimci-asistan"], {
    encoding: "utf8"
  });

  if (result.error?.code === "ENOENT") {
    return skippedArchive("tar.gz", "tar komutu bulunamadı.");
  }

  if (result.status !== 0) {
    throw new Error(`tar.gz arşivi oluşturulamadı.\n${result.stderr || result.stdout}`.trim());
  }

  return createdArchive("tar.gz", tarballPath);
}

function createZipArchiveIfAvailable() {
  const result = spawnSync("zip", ["-qr", zipPath, "yardimci-asistan"], {
    cwd: outputRoot,
    encoding: "utf8"
  });

  if (result.error?.code === "ENOENT") {
    return skippedArchive("zip", "zip komutu bulunamadı.");
  }

  if (result.status !== 0) {
    throw new Error(`zip arşivi oluşturulamadı.\n${result.stderr || result.stdout}`.trim());
  }

  return createdArchive("zip", zipPath);
}

function createdArchive(format, path) {
  return {
    format,
    status: "created",
    path: relative(repoRoot, path),
    bytes: statSync(path).size,
    sha256: sha256(path)
  };
}

function skippedArchive(format, reason) {
  return {
    format,
    status: "skipped",
    reason
  };
}

function createDeploymentWarnings(business) {
  const warnings = [];
  const syncSecret = String(business.sync_secret ?? "");
  const allowedOrigins = Array.isArray(business.allowed_origins) ? business.allowed_origins.map(String) : [];

  if (syncSecret === "change-this-secret") {
    warnings.push({
      code: "default_sync_secret",
      message: "Canlı kurulumdan önce config/business.json içindeki sync_secret değiştirilmelidir."
    });
  }

  const developmentOrigins = allowedOrigins.filter((origin) => /localhost|127\.0\.0\.1/.test(origin));
  if (developmentOrigins.length > 0) {
    warnings.push({
      code: "development_allowed_origins",
      message: `Canlı kurulumda gerekli değilse geliştirme origin değerlerini kaldırın: ${developmentOrigins.join(", ")}`
    });
  }

  const website = String(business.website ?? "");
  if (/\.example\b/.test(website)) {
    warnings.push({
      code: "example_website",
      message: "config/business.json içindeki website alanı gerçek firma alan adıyla değiştirilmelidir."
    });
  }

  return warnings;
}

function parseList(value) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertJsonObject(path) {
  const value = JSON.parse(readFileSync(join(sourceRoot, path), "utf8"));
  assert.equal(typeof value, "object", `${path} JSON object olmalı.`);
  assert.notEqual(value, null, `${path} null olmamalı.`);
  assert.equal(Array.isArray(value), false, `${path} JSON object olmalı, array değil.`);
}

function assertJsonArray(path) {
  const value = JSON.parse(readFileSync(join(sourceRoot, path), "utf8"));
  assert.ok(Array.isArray(value), `${path} JSON array olmalı.`);
}

function listFiles(root) {
  const files = [];
  walk(root);
  return files.sort();

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).replaceAll("\\", "/");

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
