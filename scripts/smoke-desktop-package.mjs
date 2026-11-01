import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { listPackage } from "@electron/asar";

// Check the resource owner without producing or launching an installer.
const packagingConfig = readFileSync("apps/desktop-app/electron-builder.yml", "utf8");
assert.match(packagingConfig, /- yardimci-asistan-release\.apk/);
assert.match(packagingConfig, /- version\.json/);
assert.doesNotMatch(packagingConfig, /platform-tools|adb(?:\.exe)?/i,
  "Consumer packages must not include ADB resources");
const resourcePreparation = readFileSync("scripts/prepare-desktop-android-resources.mjs", "utf8");
assert.doesNotMatch(resourcePreparation, /platform-tools|AdbWin|resolvePlatformToolsSource/,
  "APK resource preparation must not require or stage ADB");
if (process.argv.includes("--contracts-only")) {
  console.log("desktop-package-resource-contracts-ok");
  process.exit(0);
}

const packageRoot = join(process.cwd(), "dist", "desktop", "linux-unpacked");
const packageExecutable = join(packageRoot, "yardimci-asistan-desktop");
const appAsar = join(packageRoot, "resources", "app.asar");

assert.ok(existsSync(packageRoot), `Paket klasörü bulunamadı: ${packageRoot}`);
assert.ok(existsSync(packageExecutable), "Linux paket çalıştırılabilir dosyası bulunamadı.");
assert.ok(existsSync(appAsar), `app.asar bulunamadı: ${appAsar}`);

assert.equal(existsSync(join(packageRoot, "resources", "android", "platform-tools")), false,
  "Consumer packages must not contain platform-tools");

const stagedAndroidRoot = join(process.cwd(), "apps", "desktop-app", "resources", "android");
const stagedApk = join(stagedAndroidRoot, "yardimci-asistan-release.apk");
const stagedVersion = join(stagedAndroidRoot, "version.json");
if (existsSync(stagedApk) && existsSync(stagedVersion)) {
  const packagedAndroidRoot = join(packageRoot, "resources", "android");
  assert.ok(
    existsSync(join(packagedAndroidRoot, "yardimci-asistan-release.apk")),
    "Staged Android APK desktop paketine kopyalanmalı."
  );
  assert.ok(
    existsSync(join(packagedAndroidRoot, "version.json")),
    "Android version metadata desktop paketine kopyalanmalı."
  );
}

const entries = new Set(listPackage(appAsar));
const requiredEntries = [
  "/package.json",
  "/assets/app-icon.ico",
  "/assets/app-icon.png",
  "/dist-electron/main.js",
  "/dist-electron/preload.js",
  "/dist-electron/database.js",
  "/dist-electron/app-lock.js",
  "/dist-renderer/index.html",
  "/db/schema.sql"
];

for (const entry of requiredEntries) {
  assert.ok(entries.has(entry), `Paket içinde eksik dosya: ${entry}`);
}

for (const entry of entries) {
  assert.equal(entry.startsWith("/db/demo-profiles/"), false, `Paket demo profili içermemeli: ${entry}`);
}

await smokePackagedRuntime(packageExecutable);

console.log(`desktop-package-ok: ${packageRoot}`);

async function smokePackagedRuntime(executablePath) {
  const xvfbCheck = spawnSync("xvfb-run", ["--help"], {
    encoding: "utf8"
  });
  assert.equal(xvfbCheck.status, 0, "xvfb-run bulunamadı. Paketli Electron smoke testi için xorg-server-xvfb gerekli.");

  const dataDir = join(process.cwd(), "artifacts", "desktop-package-smoke-data", String(Date.now()));
  mkdirSync(dataDir, { recursive: true });
  const databasePath = join(dataDir, "yardimci-asistan.sqlite");
  const backupPath = join(dataDir, "backups");
  const child = spawn("xvfb-run", ["-a", executablePath, "--no-sandbox"], {
    cwd: packageRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: "1",
      XDG_CONFIG_HOME: join(dataDir, "xdg-config"),
      YA_DESKTOP_DATA_DIR: dataDir,
      YA_DESKTOP_BACKUP_DIR: backupPath
    }
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForPackagedDatabase({ child, databasePath, backupPath, output: () => output });
  } finally {
    await stopProcess(child);
  }
}

async function waitForPackagedDatabase({ child, databasePath, backupPath, output }) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Paketli Electron erken kapandı (${child.exitCode}).\n${output().trim()}`);
    }

    if (existsSync(databasePath) && existsSync(backupPath)) {
      try {
        assert.ok(statSync(databasePath).size > 0);
        assert.ok(statSync(backupPath).isDirectory());
        assertPackagedDatabase(databasePath);
        return;
      } catch {
        // Database may still be initializing.
      }
    }

    await delay(100);
  }

  throw new Error(`Paketli Electron veri dosyalarını oluşturmadı.\n${output().trim()}`);
}

function assertPackagedDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);

  try {
    assert.equal(String(scalar(database, "PRAGMA integrity_check")), "ok");
    assert.equal(
      Number(scalar(database, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")),
      0
    );
    assert.equal(Number(scalar(database, "SELECT COUNT(*) FROM business WHERE deleted_at = ''")), 0);
    assert.equal(Number(scalar(database, "SELECT COUNT(*) FROM settings WHERE deleted_at = ''")), 0);
    assert.equal(Number(scalar(database, "SELECT COUNT(*) FROM rooms WHERE deleted_at = ''")), 0);
    assert.equal(Number(scalar(database, "SELECT COUNT(*) FROM tables WHERE deleted_at = ''")), 0);
    assert.equal(Number(scalar(database, "SELECT COUNT(*) FROM menu_product_entries WHERE deleted_at = ''")), 0);
    assert.equal(Number(scalar(database, "SELECT COUNT(*) FROM requests WHERE deleted_at = ''")), 0);
  } finally {
    database.close();
  }
}

function scalar(database, sql) {
  const row = database.prepare(sql).get();
  assert.ok(row, `Sorgu sonuç döndürmedi: ${sql}`);
  return Object.values(row)[0];
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      killProcessTree(child, "SIGKILL");
      resolve();
    }, 3000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    killProcessTree(child, "SIGTERM");
  });
}

function killProcessTree(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
