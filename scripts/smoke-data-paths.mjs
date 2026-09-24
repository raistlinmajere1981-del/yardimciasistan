import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Contract test for centralized data-paths.
// Run: node scripts/smoke-data-paths.mjs

const repoRoot = process.cwd();
const appPath = path.join(repoRoot, "apps", "desktop-app");
const defaultUserDataPath = path.join(os.tmpdir(), `yardimci-test-default-${Date.now()}`);

async function importDataPaths() {
  const builtPath = path.join(appPath, "dist-electron", "data-paths.js");
  if (!fs.existsSync(builtPath)) {
    throw new Error(`Built data-paths not found at ${builtPath}. Run: npm run build -w @yardimci-asistan/desktop-app`);
  }
  return import(builtPath);
}

const dp = await importDataPaths();

// 1) YA_DESKTOP_DATA_DIR override kazanır
{
  const override = path.join(os.tmpdir(), "override-data-root");
  const result = dp.resolveDataRoot({
    envDataDir: override,
    isPackaged: false,
    appPath,
    defaultUserDataPath
  });
  assert.equal(result, path.resolve(override), "YA_DESKTOP_DATA_DIR override should win");
  console.log("✓ YA_DESKTOP_DATA_DIR override kazanır");
}

// 2) dev default repo-root/data olur
{
  const result = dp.resolveDataRoot({
    isPackaged: false,
    appPath,
    defaultUserDataPath
  });
  assert.equal(result, path.join(repoRoot, "data"), "dev default should be repo-root/data");
  console.log("✓ dev default repo-root/data olur");
}

// Packaging fallback: should return defaultUserDataPath
{
  const result = dp.resolveDataRoot({
    isPackaged: true,
    appPath,
    defaultUserDataPath
  });
  assert.equal(result, defaultUserDataPath, "packaged fallback should be userData");
  console.log("✓ packaged fallback userData olur");
}

// 3) databasePath dataRoot altındadır
{
  const dataRoot = path.join(repoRoot, "data");
  const db = dp.resolveDatabasePath(dataRoot);
  assert.ok(db.startsWith(path.resolve(dataRoot)), "databasePath should be under dataRoot");
  assert.equal(db, path.join(dataRoot, "yardimci-asistan.sqlite"));
  console.log("✓ databasePath dataRoot altındadır");
}

// 4) maintenance dataRoot altındadır
{
  const dataRoot = path.join(repoRoot, "data");
  const maint = dp.resolveMaintenancePath(dataRoot);
  assert.equal(maint, path.join(dataRoot, "maintenance"));
  assert.ok(maint.startsWith(path.resolve(dataRoot)));
  const marker = dp.resolvePendingMaintenanceMarkerPath(dataRoot);
  assert.equal(marker, path.join(dataRoot, "maintenance", "pending-data-maintenance.json"));
  const staged = dp.resolveStagedRestorePath(dataRoot);
  assert.equal(staged, path.join(dataRoot, "maintenance", "restore.sqlite"));
  const stagedAssets = dp.resolveStagedRestoreAssetsPath(dataRoot);
  assert.equal(stagedAssets, path.join(dataRoot, "maintenance", "restore-assets"));
  console.log("✓ maintenance ve staged asset restore dataRoot altındadır");
}

// 5) assets/products dataRoot altındadır
{
  const dataRoot = path.join(repoRoot, "data");
  const assets = dp.resolveAssetsPath(dataRoot);
  const productAsset = dp.resolveProductAssetAbsolutePath(dataRoot, "product_123", "front.webp");
  assert.equal(assets, path.join(dataRoot, "assets"));
  assert.equal(productAsset, path.join(dataRoot, "assets", "products", "product_123", "front.webp"));
  console.log("✓ assets/products dataRoot altındadır");
}

// 6) structured log session yolu dataRoot altındadır
{
  const dataRoot = path.join(repoRoot, "data");
  const logs = dp.resolveLogsPath(dataRoot);
  const sessions = dp.resolveDesktopLogSessionsPath(dataRoot);
  assert.equal(logs, path.join(dataRoot, "logs"));
  assert.equal(sessions, path.join(dataRoot, "logs", "sessions"));
  console.log("✓ structured log session yolu dataRoot altındadır");
}

// 7) backup resolver beklenen ayrı backup kökünü kullanır
{
  // dev backup default
  const devBackup = dp.resolveBackupRoot({ isPackaged: false, appPath });
  assert.equal(devBackup, path.join(repoRoot, "backup"));
  console.log("✓ backup resolver dev repo-root/backup olur");

  // override wins
  const override = path.join(os.tmpdir(), "override-backup");
  const withOverride = dp.resolveBackupRoot({ envBackupDir: override, isPackaged: false, appPath });
  assert.equal(withOverride, path.resolve(override));
  console.log("✓ YA_DESKTOP_BACKUP_DIR override kazanır");

  // packaged fallback
  const packaged = dp.resolveBackupRoot({ isPackaged: true, appPath, execDir: "/tmp/app-exec" });
  assert.equal(packaged, path.join("/tmp/app-exec", "backup"));
  console.log("✓ backup resolver packaged execDir/backup olur");
}

// 8) path traversal ile asset root dışına çıkılamaz
{
  const dataRoot = path.join(repoRoot, "data");
  const rel = dp.resolveProductAssetRelativePath("product_123", "front.webp");
  assert.equal(rel, "assets/products/product_123/front.webp");
  const abs = dp.resolveProductAssetAbsolutePath(dataRoot, "product_123", "front.webp");
  assert.equal(abs, path.join(dataRoot, "assets/products/product_123/front.webp"));

  // traversal attempts should throw
  assert.throws(() => dp.resolveProductAssetRelativePath("../evil", "front.webp"), /Geçersiz/);
  assert.throws(() => dp.resolveProductAssetAbsolutePath(dataRoot, "../evil", "front.webp"), /Geçersiz/);
  assert.throws(() => dp.resolveProductAssetAbsolutePath(dataRoot, "product_123", "../evil.webp"), /Geçersiz/);
  assert.throws(() => dp.resolveProductAssetAbsolutePath(dataRoot, "product_123", "../../etc/passwd"), /Geçersiz/);
  assert.throws(() => dp.resolveProductAssetAbsoluteFromRelative(dataRoot, "assets/products/../evil/front.webp"), /Geçersiz/);
  assert.throws(() => dp.resolveProductAssetAbsoluteFromRelative(dataRoot, "assets/products/product_123/../../outside.webp"), /Geçersiz/);
  console.log("✓ path traversal ile asset root dışına çıkılamaz");
}

console.log("\ndata-paths-contract-ok");
