import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const demoDistRoot = join(repoRoot, "apps", "demo-web", "dist");
const webModuleDeployRoot = join(repoRoot, "artifacts", "web-module-deploy", "yardimci-asistan");
const outputRoot = join(repoRoot, "artifacts", "hosting-demo-deploy");
const publicHtmlRoot = join(outputRoot, "public_html");
const manifestPath = join(outputRoot, "manifest.json");
const tarballPath = join(outputRoot, "hosting-demo-public_html.tar.gz");
const zipPath = join(outputRoot, "hosting-demo-public_html.zip");
const desktopPackage = JSON.parse(readFileSync(join(repoRoot, "apps", "desktop-app", "package.json"), "utf8"));
const androidPackage = JSON.parse(readFileSync(join(repoRoot, "apps", "android-app", "package.json"), "utf8"));
const desktopInstallerVersion = String(desktopPackage.version ?? "").trim();
const androidAppVersion = String(androidPackage.version ?? "").trim();
const desktopInstallerFileName = `YardimciAsistan-Setup-${desktopInstallerVersion}.exe`;
const desktopInstallerX86FileName = `YardimciAsistan-Setup-${desktopInstallerVersion}-x86.exe`;
const androidApkFileName = `YardimciAsistan-Android-${androidAppVersion}.apk`;
const desktopInstallerSource = resolve(
  repoRoot,
  String(process.env.YARDIMCI_ASISTAN_DESKTOP_INSTALLER_PATH || join("dist", "desktop", desktopInstallerFileName))
);
const desktopInstallerX86Source = resolve(
  repoRoot,
  String(process.env.YARDIMCI_ASISTAN_DESKTOP_INSTALLER_X86_PATH || join("dist", "desktop", desktopInstallerX86FileName))
);
const androidApkSource = resolve(
  repoRoot,
  String(process.env.YARDIMCI_ASISTAN_ANDROID_APK_PATH || join("apps", "android-app", "build", "outputs", "apk", "release", "yardimci-asistan-release.apk"))
);
const desktopInstallerPublicPath = `downloads/${desktopInstallerFileName}`;
const desktopInstallerX86PublicPath = `downloads/${desktopInstallerX86FileName}`;
const androidApkPublicPath = `downloads/${androidApkFileName}`;

const hostingOrigin = normalizeOrigin(requiredEnv("YARDIMCI_ASISTAN_HOSTING_ORIGIN"));
const webModulePath = normalizePublicPath(process.env.YARDIMCI_ASISTAN_HOSTING_WEB_MODULE_PATH || "/yardimci-asistan");
const webModuleUrl = `${hostingOrigin}${webModulePath}`;
const desktopInstallerUrl = `${hostingOrigin}/${desktopInstallerPublicPath}`;
const desktopInstallerX86Url = `${hostingOrigin}/${desktopInstallerX86PublicPath}`;
const androidApkUrl = `${hostingOrigin}/${androidApkPublicPath}`;
const syncSecret = String(process.env.YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET ?? "").trim();
const allowedOrigins = mergeList(process.env.YARDIMCI_ASISTAN_DEPLOY_ALLOWED_ORIGINS || "", hostingOrigin);

assert.ok(syncSecret.length >= 12, "YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET en az 12 karakter olmalı.");
assert.notEqual(syncSecret, "change-this-secret", "Canlı hosting paketi varsayılan sync secret ile üretilemez.");
validateDesktopInstaller();
validateWindowsInstaller(desktopInstallerX86Source, "Windows 32 bit", "npm run pack:desktop:win32");
validateAndroidApk();

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

run("npm", ["run", "pack:web-module"], {
  ...process.env,
  YARDIMCI_ASISTAN_DEPLOY_WEBSITE: process.env.YARDIMCI_ASISTAN_DEPLOY_WEBSITE || hostingOrigin,
  YARDIMCI_ASISTAN_DEPLOY_ALLOWED_ORIGINS: allowedOrigins.join(",")
});
run("npm", ["run", "build", "-w", "@yardimci-asistan/demo-web"], {
  ...process.env,
  VITE_YA_WEB_MODULE_URL: webModuleUrl,
  VITE_YA_DESKTOP_INSTALLER_URL: desktopInstallerUrl,
  VITE_YA_DESKTOP_INSTALLER_X86_URL: desktopInstallerX86Url,
  VITE_YA_DESKTOP_INSTALLER_VERSION: desktopInstallerVersion,
  VITE_YA_ANDROID_APK_URL: androidApkUrl,
  VITE_YA_ANDROID_APP_VERSION: androidAppVersion
});

assert.ok(existsSync(demoDistRoot), `Demo web build çıktısı bulunamadı: ${demoDistRoot}`);
assert.ok(existsSync(webModuleDeployRoot), `Web modül deploy çıktısı bulunamadı: ${webModuleDeployRoot}`);

cpSync(demoDistRoot, publicHtmlRoot, { recursive: true });
cpSync(webModuleDeployRoot, join(publicHtmlRoot, stripLeadingSlash(webModulePath)), { recursive: true });
mkdirSync(join(publicHtmlRoot, "downloads"), { recursive: true });
cpSync(desktopInstallerSource, join(publicHtmlRoot, desktopInstallerPublicPath));
cpSync(desktopInstallerX86Source, join(publicHtmlRoot, desktopInstallerX86PublicPath));
cpSync(androidApkSource, join(publicHtmlRoot, androidApkPublicPath));

const aiConfig = writeDeployAiConfig();
const files = listFiles(publicHtmlRoot);
validatePackage(files);
const archives = createArchives();
const manifest = {
  package_name: "yardimci-asistan-hosting-demo",
  hosting_origin: hostingOrigin,
  web_module_path: webModulePath,
  web_module_url: webModuleUrl,
  public_root: relative(repoRoot, publicHtmlRoot),
  generated_at: new Date().toISOString(),
  file_count: files.length,
  ai_config: aiConfig,
  desktop_installer: {
    version: desktopInstallerVersion,
    source: relative(repoRoot, desktopInstallerSource),
    path: desktopInstallerPublicPath,
    url: desktopInstallerUrl,
    bytes: statSync(desktopInstallerSource).size,
    sha256: sha256(desktopInstallerSource)
  },
  desktop_installer_x86: artifactManifest(desktopInstallerVersion, desktopInstallerX86Source, desktopInstallerX86PublicPath, desktopInstallerX86Url),
  android_apk: artifactManifest(androidAppVersion, androidApkSource, androidApkPublicPath, androidApkUrl),
  archives,
  files: files.map((file) => {
    const absolutePath = join(publicHtmlRoot, file);
    return {
      path: file,
      bytes: statSync(absolutePath).size,
      sha256: sha256(absolutePath)
    };
  })
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`hosting-demo-package-ok: ${relative(repoRoot, publicHtmlRoot)} (${manifest.file_count} dosya, ${webModuleUrl})`);

function validatePackage(files) {
  const fileSet = new Set(files);
  const webModulePrefix = stripLeadingSlash(webModulePath);
  const requiredFiles = [
    "index.html",
    "favicon.png",
    desktopInstallerPublicPath,
    desktopInstallerX86PublicPath,
    androidApkPublicPath,
    `${webModulePrefix}/widget.js`,
    `${webModulePrefix}/menu.html`,
    `${webModulePrefix}/api/request.php`,
    `${webModulePrefix}/api/sync.php`,
    `${webModulePrefix}/api/chat.php`,
    `${webModulePrefix}/config/business.json`,
    `${webModulePrefix}/data/requests.json`
  ];

  for (const file of requiredFiles) {
    assert.ok(fileSet.has(file), `Hosting demo paketinde eksik dosya: ${file}`);
  }

  const jsFiles = files.filter((file) => file.startsWith("assets/") && file.endsWith(".js"));
  assert.ok(jsFiles.length > 0, "Demo site JS bundle bulunamadı.");
  const bundleHasWebModuleUrl = jsFiles.some((file) => {
    return readText(join(publicHtmlRoot, file)).includes(webModuleUrl);
  });
  assert.ok(bundleHasWebModuleUrl, "Demo site build çıktısı canlı web modül URL'ini içermeli.");
  const bundleHasDesktopInstallerUrl = jsFiles.some((file) => {
    return readText(join(publicHtmlRoot, file)).includes(desktopInstallerUrl);
  });
  assert.ok(bundleHasDesktopInstallerUrl, "Demo site build çıktısı masaüstü installer URL'ini içermeli.");
  const bundleHasAdditionalDownloads = jsFiles.some((file) => {
    const bundle = readText(join(publicHtmlRoot, file));
    return bundle.includes(desktopInstallerX86Url) && bundle.includes(androidApkUrl);
  });
  assert.ok(bundleHasAdditionalDownloads, "Demo site build çıktısı Windows 32 bit ve Android indirme URL'lerini içermeli.");

  const business = JSON.parse(readText(join(publicHtmlRoot, `${webModulePrefix}/config/business.json`)));
  assert.notEqual(business.sync_secret, "change-this-secret", "Hosting demo paketi varsayılan sync secret içeremez.");
  assert.ok(Array.isArray(business.allowed_origins), "Hosting demo business.json allowed_origins dizi olmalı.");
  assert.ok(business.allowed_origins.includes(hostingOrigin), "Hosting demo allowed_origins canlı site origin değerini içermeli.");

  const aiLocalPath = join(publicHtmlRoot, `${webModulePrefix}/config/ai.local.php`);
  if (existsSync(aiLocalPath)) {
    const aiLocal = readText(aiLocalPath);
    assert.ok(aiLocal.includes("'enabled' => true"), "AI local config etkin üretilmeli.");
    assert.ok(aiLocal.includes("'api_key' =>"), "AI local config API anahtarını içermeli.");
  }

  const forbidden = files.filter((file) => {
    return file.startsWith("node_modules/") || file.endsWith(".ts") || file.includes("/.env");
  });
  assert.deepEqual(forbidden, [], `Hosting demo paketinde yayınlanmaması gereken dosya var: ${forbidden.join(", ")}`);
}

function validateDesktopInstaller() {
  assert.ok(desktopInstallerVersion, "Desktop uygulama sürümü package.json içinde tanımlı olmalı.");
  validateWindowsInstaller(desktopInstallerSource, "Windows 64 bit", "npm run pack:desktop:win");
}

function validateWindowsInstaller(source, label, buildCommand) {
  assert.ok(existsSync(source), `${label} kurulum dosyası bulunamadı: ${source}\nDosyayı \`${buildCommand}\` ile üretin.`);
  const installerStats = statSync(source);
  assert.ok(installerStats.isFile(), `${label} kurulum yolu dosya olmalı: ${source}`);
  assert.ok(installerStats.size >= 20 * 1024 * 1024, `${label} kurulum dosyası eksik veya yarım görünüyor (20 MB altında).`);
  assert.equal(readFileSync(source).subarray(0, 2).toString("ascii"), "MZ", `${label} kurulum dosyası geçerli PE başlığı taşımıyor.`);
}

function validateAndroidApk() {
  assert.ok(androidAppVersion, "Android uygulama sürümü package.json içinde tanımlı olmalı.");
  assert.ok(existsSync(androidApkSource), `Android release APK bulunamadı: ${androidApkSource}\nDosyayı \`npm run android:release-apk\` ile üretin.`);
  const apkStats = statSync(androidApkSource);
  assert.ok(apkStats.isFile(), `Android APK yolu dosya olmalı: ${androidApkSource}`);
  assert.ok(apkStats.size >= 20 * 1024, "Android APK eksik veya yarım görünüyor (20 KB altında).");
  assert.equal(readFileSync(androidApkSource).subarray(0, 2).toString("ascii"), "PK", "Android APK geçerli ZIP/APK başlığı taşımıyor.");
}

function artifactManifest(version, source, publicPath, url) {
  return {
    version,
    source: relative(repoRoot, source),
    path: publicPath,
    url,
    bytes: statSync(source).size,
    sha256: sha256(source)
  };
}

function writeDeployAiConfig() {
  const enabled = readBoolean(process.env.YARDIMCI_ASISTAN_DEPLOY_AI_ENABLED ?? "", false);
  const apiKey = String(process.env.YARDIMCI_ASISTAN_DEPLOY_AI_API_KEY ?? "").trim();

  if (!enabled && apiKey === "") {
    return {
      enabled: false,
      source: "none"
    };
  }

  assert.ok(enabled, "AI deploy config için YARDIMCI_ASISTAN_DEPLOY_AI_ENABLED=1 olmalı.");
  assert.ok(apiKey.length > 0, "AI deploy config için YARDIMCI_ASISTAN_DEPLOY_AI_API_KEY gerekli.");

  const provider = String(process.env.YARDIMCI_ASISTAN_DEPLOY_AI_PROVIDER ?? "openai_compatible").trim();
  const baseUrl = String(process.env.YARDIMCI_ASISTAN_DEPLOY_AI_BASE_URL ?? "").trim();
  const model = String(process.env.YARDIMCI_ASISTAN_DEPLOY_AI_MODEL ?? "").trim();
  const timeoutSeconds = readPositiveInteger(process.env.YARDIMCI_ASISTAN_DEPLOY_AI_TIMEOUT_SECONDS ?? "30", 30);

  assert.equal(provider, "openai_compatible", "Hosting demo şimdilik openai_compatible AI provider destekler.");
  assert.ok(baseUrl.length > 0, "AI deploy config için YARDIMCI_ASISTAN_DEPLOY_AI_BASE_URL gerekli.");
  assert.ok(model.length > 0, "AI deploy config için YARDIMCI_ASISTAN_DEPLOY_AI_MODEL gerekli.");

  const webModulePrefix = stripLeadingSlash(webModulePath);
  const aiLocalPath = join(publicHtmlRoot, webModulePrefix, "config", "ai.local.php");
  writeFileSync(aiLocalPath, [
    "<?php",
    "declare(strict_types=1);",
    "",
    "return [",
    "    'enabled' => true,",
    `    'provider' => ${phpString(provider)},`,
    `    'base_url' => ${phpString(baseUrl)},`,
    `    'model' => ${phpString(model)},`,
    `    'api_key' => ${phpString(apiKey)},`,
    `    'timeout_seconds' => ${timeoutSeconds}`,
    "];",
    ""
  ].join("\n"));

  return {
    enabled: true,
    source: "ai.local.php",
    provider,
    base_url: baseUrl,
    model,
    api_key_redacted: true,
    timeout_seconds: timeoutSeconds
  };
}

function createArchives() {
  return [
    createTarGzArchive(),
    createZipArchiveIfAvailable()
  ];
}

function createTarGzArchive() {
  const result = spawnSync("tar", ["-czf", tarballPath, "-C", outputRoot, "public_html"], {
    encoding: "utf8"
  });

  if (result.error?.code === "ENOENT") {
    return skippedArchive("tar.gz", "tar komutu bulunamadı.");
  }

  if (result.status !== 0) {
    throw new Error(`hosting demo tar.gz arşivi oluşturulamadı.\n${result.stderr || result.stdout}`.trim());
  }

  return createdArchive("tar.gz", tarballPath);
}

function createZipArchiveIfAvailable() {
  const result = spawnSync("zip", ["-qr", zipPath, "public_html"], {
    cwd: outputRoot,
    encoding: "utf8"
  });

  if (result.error?.code === "ENOENT") {
    return skippedArchive("zip", "zip komutu bulunamadı.");
  }

  if (result.status !== 0) {
    throw new Error(`hosting demo zip arşivi oluşturulamadı.\n${result.stderr || result.stdout}`.trim());
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

function listFiles(root, prefix = "") {
  const entries = readdirSync(root, { withFileTypes: true });
  return entries
    .flatMap((entry) => {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(root, entry.name);
      if (entry.isDirectory()) {
        return listFiles(absolutePath, relativePath);
      }

      return [relativePath];
    })
    .sort((a, b) => a.localeCompare(b));
}

function normalizeOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("YARDIMCI_ASISTAN_HOSTING_ORIGIN geçerli bir http/https URL olmalı.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("YARDIMCI_ASISTAN_HOSTING_ORIGIN http veya https ile başlamalı.");
  }

  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizePublicPath(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    throw new Error("YARDIMCI_ASISTAN_HOSTING_WEB_MODULE_PATH / ile başlamalı.");
  }

  if (trimmed.includes("..")) {
    throw new Error("YARDIMCI_ASISTAN_HOSTING_WEB_MODULE_PATH üst klasör içeremez.");
  }

  return trimmed.replace(/\/+$/, "") || "/yardimci-asistan";
}

function stripLeadingSlash(value) {
  return value.replace(/^\/+/, "");
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`${name} gerekli.`);
  }

  return value;
}

function mergeList(value, requiredValue) {
  return Array.from(new Set([
    ...value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
    requiredValue
  ]));
}

function readBoolean(value, fallback) {
  const text = String(value ?? "").trim();
  if (text === "") {
    return fallback;
  }

  return /^(1|true|yes|on)$/i.test(text);
}

function readPositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    return fallback;
  }

  return number;
}

function phpString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} başarısız oldu.`);
  }
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
