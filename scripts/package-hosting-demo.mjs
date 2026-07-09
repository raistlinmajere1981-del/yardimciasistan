import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const demoDistRoot = join(repoRoot, "apps", "demo-web", "dist");
const webModuleDeployRoot = join(repoRoot, "artifacts", "web-module-deploy", "yardimci-asistan");
const outputRoot = join(repoRoot, "artifacts", "hosting-demo-deploy");
const publicHtmlRoot = join(outputRoot, "public_html");
const manifestPath = join(outputRoot, "manifest.json");
const tarballPath = join(outputRoot, "hosting-demo-public_html.tar.gz");
const zipPath = join(outputRoot, "hosting-demo-public_html.zip");

const hostingOrigin = normalizeOrigin(requiredEnv("YARDIMCI_ASISTAN_HOSTING_ORIGIN"));
const webModulePath = normalizePublicPath(process.env.YARDIMCI_ASISTAN_HOSTING_WEB_MODULE_PATH || "/yardimci-asistan");
const webModuleUrl = `${hostingOrigin}${webModulePath}`;
const syncSecret = String(process.env.YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET ?? "").trim();
const allowedOrigins = mergeList(process.env.YARDIMCI_ASISTAN_DEPLOY_ALLOWED_ORIGINS || "", hostingOrigin);

assert.ok(syncSecret.length >= 12, "YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET en az 12 karakter olmalı.");
assert.notEqual(syncSecret, "change-this-secret", "Canlı hosting paketi varsayılan sync secret ile üretilemez.");

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

run("npm", ["run", "pack:web-module"], {
  ...process.env,
  YARDIMCI_ASISTAN_DEPLOY_WEBSITE: process.env.YARDIMCI_ASISTAN_DEPLOY_WEBSITE || hostingOrigin,
  YARDIMCI_ASISTAN_DEPLOY_ALLOWED_ORIGINS: allowedOrigins.join(",")
});
run("npm", ["run", "build", "-w", "@yardimci-asistan/demo-web"], {
  ...process.env,
  VITE_YA_WEB_MODULE_URL: webModuleUrl
});

assert.ok(existsSync(demoDistRoot), `Demo web build çıktısı bulunamadı: ${demoDistRoot}`);
assert.ok(existsSync(webModuleDeployRoot), `Web modül deploy çıktısı bulunamadı: ${webModuleDeployRoot}`);

cpSync(demoDistRoot, publicHtmlRoot, { recursive: true });
cpSync(webModuleDeployRoot, join(publicHtmlRoot, stripLeadingSlash(webModulePath)), { recursive: true });

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

  const business = JSON.parse(readText(join(publicHtmlRoot, `${webModulePrefix}/config/business.json`)));
  assert.notEqual(business.sync_secret, "change-this-secret", "Hosting demo paketi varsayılan sync secret içeremez.");
  assert.ok(Array.isArray(business.allowed_origins), "Hosting demo business.json allowed_origins dizi olmalı.");
  assert.ok(business.allowed_origins.includes(hostingOrigin), "Hosting demo allowed_origins canlı site origin değerini içermeli.");

  const forbidden = files.filter((file) => {
    return file.startsWith("node_modules/") || file.endsWith(".ts") || file.includes("/.env");
  });
  assert.deepEqual(forbidden, [], `Hosting demo paketinde yayınlanmaması gereken dosya var: ${forbidden.join(", ")}`);
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
