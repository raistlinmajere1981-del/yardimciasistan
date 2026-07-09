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
  "knowledge/.htaccess",
  "knowledge/firma.md",
  "knowledge/odalar.md",
  "knowledge/restoran.md",
  "knowledge/menu.md",
  "knowledge/sik-sorulan-sorular.md"
];

validateSource();
rmSync(packageRoot, { recursive: true, force: true });
rmSync(tarballPath, { force: true });
rmSync(zipPath, { force: true });
mkdirSync(outputRoot, { recursive: true });
cpSync(sourceRoot, packageRoot, {
  recursive: true,
  filter: (path) => !path.includes(`${sourceRoot}/.DS_Store`)
});

const packageFiles = listFiles(packageRoot);
const businessConfig = JSON.parse(readFileSync(join(sourceRoot, "config", "business.json"), "utf8"));
const archives = createArchives();
const manifest = {
  package_name: "yardimci-asistan",
  source: relative(repoRoot, sourceRoot),
  output: relative(repoRoot, packageRoot),
  generated_at: new Date().toISOString(),
  file_count: packageFiles.length,
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

  const business = JSON.parse(readFileSync(join(sourceRoot, "config", "business.json"), "utf8"));
  assert.equal(typeof business.display_name, "string");
  assert.ok(business.display_name.trim().length > 0, "business.json display_name boş olmamalı.");
  assert.equal(typeof business.sync_secret, "string");
  assert.ok(business.sync_secret.trim().length > 0, "business.json sync_secret boş olmamalı.");
  assert.ok(Array.isArray(business.allowed_origins), "business.json allowed_origins dizi olmalı.");

  const aiConfig = readFileSync(join(sourceRoot, "config", "ai.php"), "utf8");
  assert.ok(aiConfig.includes("getenv('YARDIMCI_ASISTAN_AI_API_KEY')"), "config/ai.php API anahtarını ortam değişkeninden okumalı.");

  const widget = readFileSync(join(sourceRoot, "widget.js"), "utf8");
  assert.ok(widget.includes("YardimciAsistanWidget"), "widget.js YardimciAsistanWidget globalini içermeli.");

  for (const folder of ["config", "data", "knowledge"]) {
    const htaccess = readFileSync(join(sourceRoot, folder, ".htaccess"), "utf8");
    assert.match(htaccess, /(Deny from all|Require all denied)/, `${folder}/.htaccess doğrudan erişimi kapatmalı.`);
  }
}

function validatePackage(manifest) {
  const manifestFiles = new Set(manifest.files.map((file) => file.path));
  for (const file of requiredFiles) {
    assert.ok(manifestFiles.has(file), `Paket manifestinde eksik dosya: ${file}`);
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
