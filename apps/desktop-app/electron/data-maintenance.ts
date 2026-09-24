import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app, dialog, ipcMain, session, shell } from "electron";
import { desktopLog } from "./desktop-logger";
import {
  DESKTOP_DATABASE_FILE_NAME,
  resolveAssetsPath,
  resolveBackupRoot,
  resolveDatabasePath,
  resolveMaintenancePath,
  resolvePendingMaintenanceMarkerPath,
  resolveStagedRestoreAssetsPath,
  resolveStagedRestorePath
} from "./data-paths.js";

type DesktopBackupKind = "manual" | "safety";

export interface DesktopBackupListItem {
  id: string;
  createdAt: string;
  kind: DesktopBackupKind;
  folderName: string;
  folderPath: string;
  databaseFileName: string;
  imageCount: number;
  assetFileCount: number;
  sizeBytes: number;
}

export type DesktopBackupListResult =
  | { ok: true; backupDirectory: string; backups: DesktopBackupListItem[] }
  | { ok: false; message: string; backupDirectory: string; backups: DesktopBackupListItem[] };

export type DesktopBackupCreateResult =
  | { ok: true; message: string; backup: DesktopBackupListItem; backupDirectory: string; backups: DesktopBackupListItem[] }
  | { ok: false; message: string };

export type DesktopBackupActionResult =
  | { ok: true; message: string; backups?: DesktopBackupListItem[] }
  | { ok: false; message: string; cancelled?: boolean; backups?: DesktopBackupListItem[] };

export type DesktopDataMaintenanceResult =
  | {
      ok: true;
      message: string;
      restartScheduled: true;
      safetyBackupFolderName?: string;
      sourceBackupFolderName?: string;
    }
  | {
      ok: false;
      message: string;
      cancelled?: boolean;
    };

type PendingDataMaintenance =
  | { kind: "restore"; createdAt: string }
  | { kind: "reset"; createdAt: string };

interface DataMaintenancePaths {
  userDataPath: string;
  databasePath: string;
  assetsPath: string;
  projectBackupPath: string;
  maintenancePath: string;
  markerPath: string;
  stagedRestorePath: string;
  stagedRestoreAssetsPath: string;
}

interface BackupManifest {
  format: "yardimci-asistan-backup-v2";
  createdAt: string;
  kind: DesktopBackupKind;
  databaseFile: string;
  qrMenuImages: {
    directory: string;
    count: number;
    files: Array<{ menuItemId: string; menuItemName: string; fileName: string; mimeType: string }>;
  };
  assets: {
    directory: string;
    fileCount: number;
  };
}

const BACKUP_DATABASE_FILE = DESKTOP_DATABASE_FILE_NAME;
const BACKUP_MANIFEST_FILE = "backup.json";
const QR_IMAGE_DIRECTORY = "qr-menu-images";
const ASSET_DIRECTORY = "assets";

export function resolveProjectBackupPath() {
  return resolveBackupRoot({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    execDir: path.dirname(process.execPath)
  });
}

function resolvePaths(userDataPath: string): DataMaintenancePaths {
  const maintenancePath = resolveMaintenancePath(userDataPath);
  return {
    userDataPath,
    databasePath: resolveDatabasePath(userDataPath),
    assetsPath: resolveAssetsPath(userDataPath),
    projectBackupPath: resolveProjectBackupPath(),
    maintenancePath,
    markerPath: resolvePendingMaintenanceMarkerPath(userDataPath),
    stagedRestorePath: resolveStagedRestorePath(userDataPath),
    stagedRestoreAssetsPath: resolveStagedRestoreAssetsPath(userDataPath)
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Beklenmeyen bir hata oluştu.";
}

function sqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function removeIfExists(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Cleanup is best effort; the main operation reports meaningful failures.
  }
}

function removeDirectoryIfExists(directoryPath: string) {
  try {
    if (fs.existsSync(directoryPath)) fs.rmSync(directoryPath, { recursive: true, force: true });
  } catch {
    // Best effort cleanup.
  }
}

function removeDatabaseSidecars(databasePath: string) {
  removeIfExists(`${databasePath}-wal`);
  removeIfExists(`${databasePath}-shm`);
  removeIfExists(`${databasePath}-journal`);
}

function validateYardimciDatabase(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Yedek veritabanı bulunamadı.");
  }

  const database = new DatabaseSync(filePath);
  try {
    const quickCheckRow = database.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
    const quickCheckValue = quickCheckRow ? String(Object.values(quickCheckRow)[0] ?? "") : "";
    if (quickCheckValue.toLowerCase() !== "ok") {
      throw new Error("Yedek dosyasının SQLite bütünlük kontrolü başarısız.");
    }

    const requiredRows = database.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name IN ('business', 'settings', 'menu_items', 'business_capabilities', 'desktop_sync_identity', 'android_local_credentials')
    `).all() as Array<{ name?: unknown }>;
    const requiredTables = new Set(requiredRows.map((row) => String(row.name ?? "")));
    if (!["business", "settings", "menu_items", "business_capabilities", "desktop_sync_identity", "android_local_credentials"]
      .every((table) => requiredTables.has(table))) {
      throw new Error("Seçilen dosya Yardımcı Asistan yedeği olarak doğrulanamadı.");
    }

    const columns = (table: string) => new Set(
      (database.prepare(`PRAGMA table_info('${table.replace(/'/g, "''")}')`).all() as Array<{ name?: unknown }>)
        .map((row) => String(row.name ?? ""))
    );
    const businessColumns = columns("business");
    const settingsColumns = columns("settings");
    if (!businessColumns.has("profile_id")
      || businessColumns.has("business_type")
      || businessColumns.has("modules_json")
      || ["rooms_enabled", "tables_enabled", "qr_menu_enabled", "ai_enabled", "whatsapp_enabled", "android_enabled"]
        .some((column) => settingsColumns.has(column))) {
      throw new Error("Yedek eski profil veya capability alanlarını içeriyor.");
    }

    const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyViolations.length > 0) {
      throw new Error("Yedek veritabanında foreign key bütünlüğü bozulmuş.");
    }
  } finally {
    database.close();
  }
}

function ensureProjectBackupPath(paths: DataMaintenancePaths) {
  fs.mkdirSync(paths.projectBackupPath, { recursive: true });
}

function safeBackupId(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "." || normalized === ".." || path.basename(normalized) !== normalized) {
    return "";
  }
  return /^[A-Za-z0-9._-]+$/.test(normalized) ? normalized : "";
}

function backupTimestamp(createdAt: string) {
  return createdAt.replace(/[:.]/g, "-");
}

function sanitizeFileName(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 70);
  return cleaned || "urun";
}

function extractQrMenuImages(databasePath: string, outputDirectory: string) {
  const database = new DatabaseSync(databasePath);
  try {
    const rows = database.prepare(`
      SELECT id, name, image_url
      FROM menu_items
      WHERE deleted_at = '' AND image_url LIKE 'data:image/%'
      ORDER BY sort_order ASC, name ASC
    `).all() as Array<{ id?: unknown; name?: unknown; image_url?: unknown }>;

    const files: BackupManifest["qrMenuImages"]["files"] = [];
    for (const row of rows) {
      const imageUrl = String(row.image_url ?? "");
      const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(imageUrl);
      if (!match) continue;

      const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
      const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
      const menuItemId = String(row.id ?? "");
      const menuItemName = String(row.name ?? "Ürün");
      const suffix = sanitizeFileName(menuItemId).slice(-12) || String(files.length + 1);
      const fileName = `${sanitizeFileName(menuItemName)}-${suffix}.${extension}`;
      const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
      if (bytes.length === 0) continue;

      fs.mkdirSync(outputDirectory, { recursive: true });
      fs.writeFileSync(path.join(outputDirectory, fileName), bytes);
      files.push({ menuItemId, menuItemName, fileName, mimeType });
    }
    return files;
  } finally {
    database.close();
  }
}

function directorySize(directoryPath: string): number {
  if (!fs.existsSync(directoryPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) total += directorySize(entryPath);
    else if (entry.isFile()) total += fs.statSync(entryPath).size;
  }
  return total;
}

function directoryFileCount(directoryPath: string): number {
  if (!fs.existsSync(directoryPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) total += directoryFileCount(entryPath);
    else if (entry.isFile()) total += 1;
  }
  return total;
}

function copyDurableAssets(sourcePath: string, destinationPath: string): number {
  removeDirectoryIfExists(destinationPath);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    return 0;
  }
  fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true, errorOnExist: false });
  return directoryFileCount(destinationPath);
}

function readBackupManifest(folderPath: string): BackupManifest | null {
  const manifestPath = path.join(folderPath, BACKUP_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Partial<BackupManifest>;
    if (parsed.format !== "yardimci-asistan-backup-v2"
      || parsed.databaseFile !== BACKUP_DATABASE_FILE
      || !parsed.qrMenuImages
      || parsed.qrMenuImages.directory !== QR_IMAGE_DIRECTORY
      || !Number.isSafeInteger(parsed.qrMenuImages.count)
      || !Array.isArray(parsed.qrMenuImages.files)
      || !parsed.assets
      || parsed.assets.directory !== ASSET_DIRECTORY
      || !Number.isSafeInteger(parsed.assets.fileCount)) return null;
    return parsed as BackupManifest;
  } catch {
    return null;
  }
}

function readBackupItem(folderPath: string): DesktopBackupListItem | null {
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) return null;
  const id = path.basename(folderPath);
  if (!safeBackupId(id) || id.startsWith(".tmp-")) return null;

  const databasePath = path.join(folderPath, BACKUP_DATABASE_FILE);
  if (!fs.existsSync(databasePath)) return null;

  const manifest = readBackupManifest(folderPath);
  if (!manifest) return null;
  return {
    id,
    createdAt: manifest.createdAt,
    kind: manifest.kind,
    folderName: id,
    folderPath,
    databaseFileName: manifest.databaseFile,
    imageCount: manifest.qrMenuImages.count,
    assetFileCount: manifest.assets.fileCount,
    sizeBytes: directorySize(folderPath)
  };
}

function listBackupItems(paths: DataMaintenancePaths) {
  ensureProjectBackupPath(paths);
  return fs.readdirSync(paths.projectBackupPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readBackupItem(path.join(paths.projectBackupPath, entry.name)))
    .filter((item): item is DesktopBackupListItem => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function createBackupPackageFromDatabase(options: {
  paths: DataMaintenancePaths;
  sourceDatabasePath: string;
  kind: DesktopBackupKind;
  createdAt?: string;
  folderName?: string;
  liveDatabase?: boolean;
}): DesktopBackupListItem {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const defaultPrefix = options.kind === "safety" ? "yardimci-asistan-guvenlik" : "yardimci-asistan";
  const folderName = safeBackupId(options.folderName ?? `${defaultPrefix}-${backupTimestamp(createdAt)}`);
  if (!folderName) throw new Error("Yedek klasör adı oluşturulamadı.");

  ensureProjectBackupPath(options.paths);
  const finalFolderPath = path.join(options.paths.projectBackupPath, folderName);
  const existing = readBackupItem(finalFolderPath);
  if (existing) return existing;

  const tempFolderPath = path.join(options.paths.projectBackupPath, `.tmp-${folderName}-${process.pid}`);
  removeDirectoryIfExists(tempFolderPath);
  fs.mkdirSync(tempFolderPath, { recursive: true });
  const outputDatabasePath = path.join(tempFolderPath, BACKUP_DATABASE_FILE);

  try {
    if (options.liveDatabase) {
      const database = new DatabaseSync(options.sourceDatabasePath);
      try {
        database.exec("PRAGMA busy_timeout = 5000;");
        database.exec(`VACUUM INTO '${sqlString(outputDatabasePath)}'`);
      } finally {
        database.close();
      }
    } else {
      fs.copyFileSync(options.sourceDatabasePath, outputDatabasePath);
    }

    validateYardimciDatabase(outputDatabasePath);
    const imageFiles = extractQrMenuImages(outputDatabasePath, path.join(tempFolderPath, QR_IMAGE_DIRECTORY));
    const assetFileCount = copyDurableAssets(options.paths.assetsPath, path.join(tempFolderPath, ASSET_DIRECTORY));
    const manifest: BackupManifest = {
      format: "yardimci-asistan-backup-v2",
      createdAt,
      kind: options.kind,
      databaseFile: BACKUP_DATABASE_FILE,
      qrMenuImages: {
        directory: QR_IMAGE_DIRECTORY,
        count: imageFiles.length,
        files: imageFiles
      },
      assets: {
        directory: ASSET_DIRECTORY,
        fileCount: assetFileCount
      }
    };
    fs.writeFileSync(path.join(tempFolderPath, BACKUP_MANIFEST_FILE), JSON.stringify(manifest, null, 2), "utf8");
    fs.renameSync(tempFolderPath, finalFolderPath);

    const item = readBackupItem(finalFolderPath);
    if (!item) throw new Error("Yedek klasörü oluşturuldu ancak tekrar okunamadı.");
    return item;
  } catch (error) {
    removeDirectoryIfExists(tempFolderPath);
    throw error;
  }
}

function createManualBackup(userDataPath: string): DesktopBackupCreateResult {
  const paths = resolvePaths(userDataPath);
  try {
    if (!fs.existsSync(paths.databasePath)) {
      return { ok: false, message: "Yedeklenecek yerel veri bulunamadı." };
    }
    const backup = createBackupPackageFromDatabase({
      paths,
      sourceDatabasePath: paths.databasePath,
      kind: "manual",
      liveDatabase: true
    });
    const imagesText = backup.imageCount > 0 ? ` QR menüden ${backup.imageCount} görsel de yedeğe eklendi.` : "";
    const manifest = readBackupManifest(backup.folderPath);
    const assetCount = manifest?.assets?.fileCount ?? 0;
    const assetsText = assetCount > 0 ? ` Kalıcı asset klasöründen ${assetCount} dosya da yedeklendi.` : "";
    return {
      ok: true,
      message: `Yerel kayıtların yedeği oluşturuldu.${imagesText}${assetsText}`,
      backup,
      backupDirectory: paths.projectBackupPath,
      backups: listBackupItems(paths)
    };
  } catch (error) {
    return { ok: false, message: `Yedek oluşturulamadı: ${errorMessage(error)}` };
  }
}

function createSafetyBackup(paths: DataMaintenancePaths): DesktopBackupListItem | undefined {
  if (!fs.existsSync(paths.databasePath)) return undefined;
  return createBackupPackageFromDatabase({
    paths,
    sourceDatabasePath: paths.databasePath,
    kind: "safety",
    liveDatabase: true
  });
}

export function createUpdateSafetyBackup(
  userDataPath: string,
  targetVersion: string,
  keepLatest = 3
): DesktopBackupListItem | undefined {
  const paths = resolvePaths(userDataPath);
  if (!fs.existsSync(paths.databasePath)) return undefined;

  const normalizedVersion = String(targetVersion || "unknown")
    .trim()
    .replace(/[^0-9A-Za-z._-]+/g, "-")
    .slice(0, 48) || "unknown";
  const createdAt = new Date().toISOString();
  const backup = createBackupPackageFromDatabase({
    paths,
    sourceDatabasePath: paths.databasePath,
    kind: "safety",
    createdAt,
    folderName: `yardimci-asistan-guncelleme-${normalizedVersion}-${backupTimestamp(createdAt)}`,
    liveDatabase: true
  });

  const limit = Number.isInteger(keepLatest) && keepLatest > 0 ? keepLatest : 3;
  try {
    const updateBackups = fs.readdirSync(paths.projectBackupPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("yardimci-asistan-guncelleme-"))
      .map((entry) => ({
        name: entry.name,
        path: path.join(paths.projectBackupPath, entry.name),
        mtimeMs: fs.statSync(path.join(paths.projectBackupPath, entry.name)).mtimeMs
      }))
      .sort((left, right) => right.mtimeMs - left.mtimeMs);

    for (const stale of updateBackups.slice(limit)) {
      fs.rmSync(stale.path, { recursive: true, force: true });
    }
  } catch {
    // Update backup retention is best effort; never block the prepared update.
  }

  return backup;
}

function getBackups(userDataPath: string): DesktopBackupListResult {
  const paths = resolvePaths(userDataPath);
  try {
    return { ok: true, backupDirectory: paths.projectBackupPath, backups: listBackupItems(paths) };
  } catch (error) {
    return {
      ok: false,
      message: `Yedek listesi okunamadı: ${errorMessage(error)}`,
      backupDirectory: paths.projectBackupPath,
      backups: []
    };
  }
}

async function openBackupDirectory(userDataPath: string): Promise<DesktopBackupActionResult> {
  const paths = resolvePaths(userDataPath);
  try {
    ensureProjectBackupPath(paths);
    const openError = await shell.openPath(paths.projectBackupPath);
    if (openError) return { ok: false, message: `Yedek klasörü açılamadı: ${openError}` };
    return { ok: true, message: "Yedek klasörü açıldı." };
  } catch (error) {
    return { ok: false, message: `Yedek klasörü açılamadı: ${errorMessage(error)}` };
  }
}

async function openBackupItemDirectory(userDataPath: string, backupId: string): Promise<DesktopBackupActionResult> {
  const paths = resolvePaths(userDataPath);
  const id = safeBackupId(backupId);
  if (!id) return { ok: false, message: "Yedek kaydı geçersiz." };
  try {
    const folderPath = path.join(paths.projectBackupPath, id);
    if (!readBackupItem(folderPath)) return { ok: false, message: "Yedek klasörü bulunamadı." };
    const openError = await shell.openPath(folderPath);
    if (openError) return { ok: false, message: `Yedek klasörü açılamadı: ${openError}` };
    return { ok: true, message: "Yedek klasörü açıldı." };
  } catch (error) {
    return { ok: false, message: `Yedek klasörü açılamadı: ${errorMessage(error)}` };
  }
}

async function deleteBackup(userDataPath: string, backupId: string): Promise<DesktopBackupActionResult> {
  const paths = resolvePaths(userDataPath);
  const id = safeBackupId(backupId);
  if (!id) return { ok: false, message: "Yedek kaydı geçersiz." };

  try {
    const folderPath = path.join(paths.projectBackupPath, id);
    const item = readBackupItem(folderPath);
    if (!item) return { ok: false, message: "Silinecek yedek bulunamadı.", backups: listBackupItems(paths) };

    const confirmation = await dialog.showMessageBox({
      type: "warning",
      title: "Yedeği Sil",
      message: "Bu yedek kalıcı olarak silinsin mi?",
      detail: `${formatBackupDate(item.createdAt)} tarihli yedek klasörü, QR menü görselleri ve kalıcı asset dosyaları silinecek.`,
      buttons: ["Vazgeç", "Yedeği Sil"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (confirmation.response !== 1) {
      return { ok: false, cancelled: true, message: "Yedek silme iptal edildi.", backups: listBackupItems(paths) };
    }

    fs.rmSync(folderPath, { recursive: true, force: true });
    return { ok: true, message: "Yedek silindi.", backups: listBackupItems(paths) };
  } catch (error) {
    return { ok: false, message: `Yedek silinemedi: ${errorMessage(error)}`, backups: listBackupItems(paths) };
  }
}

function writePendingOperation(paths: DataMaintenancePaths, operation: PendingDataMaintenance) {
  fs.mkdirSync(paths.maintenancePath, { recursive: true });
  fs.writeFileSync(paths.markerPath, JSON.stringify(operation, null, 2), "utf8");
}

function readPendingOperation(paths: DataMaintenancePaths): PendingDataMaintenance | null {
  if (!fs.existsSync(paths.markerPath)) return null;
  const parsed = JSON.parse(fs.readFileSync(paths.markerPath, "utf8")) as Partial<PendingDataMaintenance>;
  if (parsed.kind !== "restore" && parsed.kind !== "reset") {
    throw new Error("Bekleyen veri bakım kaydı geçersiz.");
  }
  return parsed as PendingDataMaintenance;
}

function replaceAssetsFromStagedRestore(paths: DataMaintenancePaths) {
  if (!fs.existsSync(paths.stagedRestoreAssetsPath)) return;

  const nextAssetsPath = `${paths.assetsPath}.restore-next`;
  const rollbackAssetsPath = `${paths.assetsPath}.restore-rollback`;
  removeDirectoryIfExists(nextAssetsPath);
  removeDirectoryIfExists(rollbackAssetsPath);
  fs.renameSync(paths.stagedRestoreAssetsPath, nextAssetsPath);

  const hadCurrentAssets = fs.existsSync(paths.assetsPath);
  if (hadCurrentAssets) fs.renameSync(paths.assetsPath, rollbackAssetsPath);

  try {
    fs.renameSync(nextAssetsPath, paths.assetsPath);
    removeDirectoryIfExists(rollbackAssetsPath);
  } catch (error) {
    removeDirectoryIfExists(paths.assetsPath);
    if (hadCurrentAssets && fs.existsSync(rollbackAssetsPath)) {
      fs.renameSync(rollbackAssetsPath, paths.assetsPath);
    }
    throw error;
  } finally {
    removeDirectoryIfExists(nextAssetsPath);
  }
}

function replaceDatabaseFromStagedRestore(paths: DataMaintenancePaths) {
  validateYardimciDatabase(paths.stagedRestorePath);

  const nextDatabasePath = `${paths.databasePath}.restore-next`;
  const rollbackPath = `${paths.databasePath}.restore-rollback`;
  removeIfExists(nextDatabasePath);
  removeIfExists(rollbackPath);
  fs.copyFileSync(paths.stagedRestorePath, nextDatabasePath);
  validateYardimciDatabase(nextDatabasePath);

  removeDatabaseSidecars(paths.databasePath);
  const hadCurrentDatabase = fs.existsSync(paths.databasePath);
  if (hadCurrentDatabase) fs.renameSync(paths.databasePath, rollbackPath);

  try {
    fs.renameSync(nextDatabasePath, paths.databasePath);
    validateYardimciDatabase(paths.databasePath);
    replaceAssetsFromStagedRestore(paths);
    removeIfExists(rollbackPath);
  } catch (error) {
    removeIfExists(paths.databasePath);
    if (hadCurrentDatabase && fs.existsSync(rollbackPath)) fs.renameSync(rollbackPath, paths.databasePath);
    throw error;
  } finally {
    removeIfExists(nextDatabasePath);
  }
}

function resetDatabaseFiles(paths: DataMaintenancePaths) {
  removeDatabaseSidecars(paths.databasePath);
  removeIfExists(paths.databasePath);
  removeDirectoryIfExists(paths.assetsPath);
}

export function applyPendingDataMaintenanceAtStartup(userDataPath: string) {
  const paths = resolvePaths(userDataPath);
  let pending: PendingDataMaintenance | null = null;

  try {
    pending = readPendingOperation(paths);
    if (!pending) return;
    if (pending.kind === "restore") replaceDatabaseFromStagedRestore(paths);
    else resetDatabaseFiles(paths);
  } catch (error) {
    desktopLog.error({
      scope: "restore",
      event: "restore.pending.apply.failed",
      message: "Bekleyen veri bakımı uygulanamadı.",
      error
    });
  } finally {
    if (pending) {
      removeIfExists(paths.markerPath);
      removeIfExists(paths.stagedRestorePath);
      removeDirectoryIfExists(paths.stagedRestoreAssetsPath);
    }
  }
}

function scheduleRelaunch() {
  const timer = setTimeout(() => {
    app.relaunch();
    app.quit();
  }, 350);
  timer.unref();
}

function formatBackupDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

async function prepareRestore(userDataPath: string, backupId: string): Promise<DesktopDataMaintenanceResult> {
  const paths = resolvePaths(userDataPath);
  const id = safeBackupId(backupId);
  if (!id) return { ok: false, message: "Geri yüklenecek yedek kaydı geçersiz." };

  try {
    const backupFolderPath = path.join(paths.projectBackupPath, id);
    const backup = readBackupItem(backupFolderPath);
    if (!backup) return { ok: false, message: "Geri yüklenecek yedek bulunamadı." };
    const sourcePath = path.join(backupFolderPath, backup.databaseFileName || BACKUP_DATABASE_FILE);
    validateYardimciDatabase(sourcePath);

    const confirmation = await dialog.showMessageBox({
      type: "warning",
      title: "Yedekten Geri Yükle",
      message: `${formatBackupDate(backup.createdAt)} tarihli yedeğe dönülsün mü?`,
      detail: "Mevcut verilerin önce otomatik güvenlik yedeği alınır. Seçilen yedek daha sonra yerel verilerin yerini alır ve uygulama yeniden başlatılır.",
      buttons: ["Vazgeç", "Geri Yükle"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (confirmation.response !== 1) {
      return { ok: false, cancelled: true, message: "Geri yükleme iptal edildi." };
    }

    const safetyBackup = createSafetyBackup(paths);
    fs.mkdirSync(paths.maintenancePath, { recursive: true });
    removeIfExists(paths.stagedRestorePath);
    removeDirectoryIfExists(paths.stagedRestoreAssetsPath);
    fs.copyFileSync(sourcePath, paths.stagedRestorePath);
    validateYardimciDatabase(paths.stagedRestorePath);

    const sourceManifest = readBackupManifest(backupFolderPath);
    fs.mkdirSync(paths.stagedRestoreAssetsPath, { recursive: true });
    const sourceAssetsPath = path.join(backupFolderPath, ASSET_DIRECTORY);
    if (sourceManifest?.assets
        && fs.existsSync(sourceAssetsPath)
        && fs.statSync(sourceAssetsPath).isDirectory()) {
      fs.cpSync(sourceAssetsPath, paths.stagedRestoreAssetsPath, { recursive: true, force: true, errorOnExist: false });
    }

    writePendingOperation(paths, { kind: "restore", createdAt: new Date().toISOString() });
    scheduleRelaunch();

    return {
      ok: true,
      restartScheduled: true,
      sourceBackupFolderName: backup.folderName,
      safetyBackupFolderName: safetyBackup?.folderName,
      message: safetyBackup
        ? `Mevcut veriler ${safetyBackup.folderName} klasöründe güvenceye alındı; seçilen yedek geri yükleniyor.`
        : "Seçilen yedek geri yükleniyor; uygulama yeniden başlatılıyor."
    };
  } catch (error) {
    removeIfExists(paths.markerPath);
    removeIfExists(paths.stagedRestorePath);
    removeDirectoryIfExists(paths.stagedRestoreAssetsPath);
    return { ok: false, message: `Geri yükleme hazırlanamadı: ${errorMessage(error)}` };
  }
}

async function prepareReset(userDataPath: string): Promise<DesktopDataMaintenanceResult> {
  const paths = resolvePaths(userDataPath);
  const confirmation = await dialog.showMessageBox({
    type: "warning",
    title: "Yerel Verileri Sıfırla",
    message: "Bu bilgisayardaki Yardımcı Asistan verileri sıfırlanacak.",
    detail: "İşletme kayıtları, ayarlar ve uygulama şifresi kaldırılır. Projedeki backup klasörü korunur ve işlemden önce otomatik güvenlik yedeği alınır. Uygulama yeniden başladığında başlangıç verileri yeniden oluşturulur.",
    buttons: ["Vazgeç", "Verileri Sıfırla"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (confirmation.response !== 1) {
    return { ok: false, cancelled: true, message: "Veri sıfırlama iptal edildi." };
  }

  try {
    const safetyBackup = createSafetyBackup(paths);
    writePendingOperation(paths, { kind: "reset", createdAt: new Date().toISOString() });
    try {
      await session.defaultSession.clearStorageData({ storages: ["localstorage"] });
    } catch (error) {
      desktopLog.warn({
        scope: "reset",
        event: "reset.preferences.clear.failed",
        message: "Arayüz tercihleri temizlenemedi.",
        error
      });
    }
    scheduleRelaunch();

    return {
      ok: true,
      restartScheduled: true,
      safetyBackupFolderName: safetyBackup?.folderName,
      message: safetyBackup
        ? `Mevcut veriler ${safetyBackup.folderName} klasöründe güvenceye alındı; sıfırlama için uygulama yeniden başlatılıyor.`
        : "Sıfırlama hazırlandı; uygulama yeniden başlatılıyor."
    };
  } catch (error) {
    removeIfExists(paths.markerPath);
    return { ok: false, message: `Veriler sıfırlanamadı: ${errorMessage(error)}` };
  }
}

export function registerDataMaintenanceIpcHandlers(userDataPath: () => string) {
  const channels = [
    "dataMaintenance:createBackup",
    "dataMaintenance:listBackups",
    "dataMaintenance:openBackupDirectory",
    "dataMaintenance:openBackupItemDirectory",
    "dataMaintenance:deleteBackup",
    "dataMaintenance:restoreBackup",
    "dataMaintenance:resetLocalData"
  ];
  for (const channel of channels) ipcMain.removeHandler(channel);

  ipcMain.handle("dataMaintenance:createBackup", () => createManualBackup(userDataPath()));
  ipcMain.handle("dataMaintenance:listBackups", () => getBackups(userDataPath()));
  ipcMain.handle("dataMaintenance:openBackupDirectory", () => openBackupDirectory(userDataPath()));
  ipcMain.handle("dataMaintenance:openBackupItemDirectory", (_event, backupId: string) => openBackupItemDirectory(userDataPath(), backupId));
  ipcMain.handle("dataMaintenance:deleteBackup", (_event, backupId: string) => deleteBackup(userDataPath(), backupId));
  ipcMain.handle("dataMaintenance:restoreBackup", (_event, backupId: string) => prepareRestore(userDataPath(), backupId));
  ipcMain.handle("dataMaintenance:resetLocalData", () => prepareReset(userDataPath()));
}
