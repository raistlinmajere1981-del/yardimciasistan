import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function readProductVersion(root = repoRoot) {
  const value = JSON.parse(readFileSync(resolve(root, "product-version.json"), "utf8"));
  validateVersion(value.version);
  validateVersion(value.webModuleVersion);
  if (!Number.isInteger(value.androidVersionCode) || value.androidVersionCode <= 0) {
    throw new Error("androidVersionCode pozitif bir tam sayı olmalı.");
  }
  return {
    version: value.version,
    androidVersionCode: value.androidVersionCode,
    webModuleVersion: value.webModuleVersion
  };
}

export function syncProductVersion(root = repoRoot) {
  const product = readProductVersion(root);
  updatePackage(resolve(root, "apps", "desktop-app", "package.json"), product.version);
  updatePackage(resolve(root, "apps", "android-app", "package.json"), product.version);

  const lockFile = resolve(root, "package-lock.json");
  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  for (const key of ["apps/desktop-app", "apps/android-app"]) {
    if (!lock.packages?.[key]) throw new Error(`package-lock.json içinde ${key} bulunamadı.`);
    lock.packages[key].version = product.version;
  }
  writeJson(lockFile, lock);
  syncLandingDownloadVersion(root, product.version);
  syncWebModuleVersionMetadata(root, product);
  return product;
}

export function checkProductVersion(root = repoRoot) {
  const product = readProductVersion(root);
  const desktop = JSON.parse(readFileSync(resolve(root, "apps", "desktop-app", "package.json"), "utf8")).version;
  const android = JSON.parse(readFileSync(resolve(root, "apps", "android-app", "package.json"), "utf8")).version;
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const lockDesktop = lock.packages?.["apps/desktop-app"]?.version;
  const lockAndroid = lock.packages?.["apps/android-app"]?.version;
  const landingVersions = readLandingDownloadVersions(root);
  const webModuleMetadata = readWebModuleVersionMetadata(root);
  const mismatches = [
    ["desktop package", desktop],
    ["android package", android],
    ["desktop lock", lockDesktop],
    ["android lock", lockAndroid],
    ...landingVersions.map((value, index) => [`landing download ${index + 1}`, value])
  ].filter(([, value]) => value !== product.version);
  if (webModuleMetadata.productVersion !== product.version) {
    mismatches.push(["web module product version", webModuleMetadata.productVersion]);
  }
  if (webModuleMetadata.webModuleVersion !== product.webModuleVersion) {
    mismatches.push(["web module version", webModuleMetadata.webModuleVersion]);
  }
  if (mismatches.length) {
    throw new Error(
      `Ürün sürümü senkron değil (${product.version}): ` +
      mismatches.map(([name, value]) => `${name}=${value ?? "yok"}`).join(", ") +
      ". npm run version:sync çalıştırın."
    );
  }
  return product;
}

export function setProductVersion(nextVersion, root = repoRoot, { force = false } = {}) {
  validateVersion(nextVersion);
  const current = readProductVersion(root);
  const comparison = compareVersions(nextVersion, current.version);
  if (comparison < 0 && !force) {
    throw new Error(`Sürüm geriye alınamaz: ${current.version} → ${nextVersion}. Gerekirse --force kullanın.`);
  }
  if (comparison === 0) {
    syncProductVersion(root);
    return current;
  }
  const next = {
    version: nextVersion,
    androidVersionCode: current.androidVersionCode + 1,
    webModuleVersion: current.webModuleVersion
  };
  writeJson(resolve(root, "product-version.json"), next);
  syncProductVersion(root);
  return next;
}

export function setWebModuleVersion(nextVersion, root = repoRoot, { force = false } = {}) {
  validateVersion(nextVersion);
  const current = readProductVersion(root);
  const comparison = compareVersions(nextVersion, current.webModuleVersion);
  if (comparison < 0 && !force) {
    throw new Error(`Web modülü sürümü geriye alınamaz: ${current.webModuleVersion} → ${nextVersion}. Gerekirse --force kullanın.`);
  }
  const next = { ...current, webModuleVersion: nextVersion };
  writeJson(resolve(root, "product-version.json"), next);
  syncProductVersion(root);
  return next;
}

export function bumpWebModuleVersion(part, root = repoRoot) {
  if (!["major", "minor", "patch"].includes(part)) {
    throw new Error("Web modülü bump türü major, minor veya patch olmalı.");
  }
  const current = readProductVersion(root);
  const [major, minor, patch] = current.webModuleVersion.split(".").map(Number);
  const next = part === "major"
    ? `${major + 1}.0.0`
    : part === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;
  return setWebModuleVersion(next, root);
}

export function bumpProductVersion(part, root = repoRoot) {
  if (!["major", "minor", "patch"].includes(part)) {
    throw new Error("Bump türü major, minor veya patch olmalı.");
  }
  const current = readProductVersion(root);
  const [major, minor, patch] = current.version.split(".").map(Number);
  const next = part === "major"
    ? `${major + 1}.0.0`
    : part === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;
  return setProductVersion(next, root);
}

export function syncLandingDownloadVersion(root = repoRoot, version = readProductVersion(root).version) {
  const path = resolve(root, "test-site", "landing", "release.json");
  if (!existsSync(dirname(path))) return false;
  writeJson(path, { desktopVersion: version, androidVersion: version });
  return true;
}

export function syncWebModuleVersionMetadata(root = repoRoot, product = readProductVersion(root)) {
  const path = resolve(root, "firm-template", "web-module", "config", "version.json");
  if (!existsSync(dirname(path))) return false;
  writeJson(path, {
    product_version: product.version,
    web_module_version: product.webModuleVersion
  });
  return true;
}

export function readWebModuleVersionMetadata(root = repoRoot) {
  const path = resolve(root, "firm-template", "web-module", "config", "version.json");
  if (!existsSync(path)) {
    return { productVersion: "", webModuleVersion: "" };
  }
  const value = JSON.parse(readFileSync(path, "utf8"));
  return {
    productVersion: String(value.product_version ?? ""),
    webModuleVersion: String(value.web_module_version ?? "")
  };
}

export function readLandingDownloadVersions(root = repoRoot) {
  const path = resolve(root, "test-site", "landing", "release.json");
  if (!existsSync(path)) return [];
  const release = JSON.parse(readFileSync(path, "utf8"));
  validateVersion(release.desktopVersion);
  validateVersion(release.androidVersion);
  return [release.desktopVersion, release.androidVersion];
}

function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version ?? ""))) {
    throw new Error("Ürün sürümü x.y.z biçiminde olmalı (ör. 0.1.8).");
  }
}

function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

function updatePackage(path, version) {
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.version = version;
  writeJson(path, pkg);
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function print(product) {
  console.log(`Ürün sürümü: ${product.version}`);
  console.log(`Android versionCode: ${product.androidVersionCode}`);
  console.log(`Web modülü sürümü: ${product.webModuleVersion}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = "show", value, ...rest] = process.argv.slice(2);
  try {
    if (command === "show") {
      const product = readProductVersion();
      if (value === "--json" || rest.includes("--json")) {
        console.log(JSON.stringify(product));
      } else {
        print(product);
      }
    } else if (command === "check") {
      const product = checkProductVersion();
      print(product);
      console.log("Sürüm metadata'sı senkron.");
    } else if (command === "sync") {
      const product = syncProductVersion();
      if (!rest.includes("--quiet") && value !== "--quiet") {
        print(product);
        console.log("Desktop/Android metadata ve landing download sürümü senkronlandı.");
      }
    } else if (command === "set") {
      if (!value) throw new Error("Yeni sürüm gerekli. Örnek: npm run version:set -- 0.1.8");
      const product = setProductVersion(value, repoRoot, { force: rest.includes("--force") });
      print(product);
      console.log("Desktop, Android ve landing download sürümü güncellendi.");
    } else if (command === "bump") {
      if (!value) throw new Error("Bump türü gerekli: major, minor veya patch.");
      const product = bumpProductVersion(value);
      print(product);
      console.log("Desktop, Android ve landing download sürümü güncellendi.");
    } else if (command === "web-set") {
      if (!value) throw new Error("Yeni web modülü sürümü gerekli. Örnek: npm run version:web:set -- 2.0.3");
      const product = setWebModuleVersion(value, repoRoot, { force: rest.includes("--force") });
      print(product);
      console.log("Web modülü sürümü güncellendi.");
    } else if (command === "web-bump") {
      if (!value) throw new Error("Web modülü bump türü gerekli: major, minor veya patch.");
      const product = bumpWebModuleVersion(value);
      print(product);
      console.log("Web modülü sürümü güncellendi.");
    } else {
      throw new Error("Komut: show [--json] | check | sync | set <x.y.z> | bump <major|minor|patch> | web-set <x.y.z> | web-bump <major|minor|patch>");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
