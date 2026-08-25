import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app, dialog, ipcMain, session, shell } from "electron";

export type DesktopBackupKind = "manual" | "safety" | "legacy";

export interface DesktopBackupListItem {
  id: string;
  createdAt: string;
  kind: DesktopBackupKind;
  folderName: string;
  folderPath: string;
  databaseFileName: string;
  imageCount: number;
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
  | { version: 1; kind: "restore"; createdAt: string }
  | { version: 1; kind: "reset"; createdAt: string };

interface DataMaintenancePaths {
  userDataPath: string;
  databasePath: string;
  projectBackupPath: string;
  legacyBackupPath: string;
  maintenancePath: string;
  markerPath: string;
  stagedRestorePath: string;
}

interface BackupManifest {
  format: "yardimci-asistan-backup";
  version: 2;
  createdAt: string;
  kind: DesktopBackupKind;
  databaseFile: string;
  qrMenuImages: {
    directory: string;
    count: number;
    files: Array<{ menuItemId: string; menuItemName: string; fileName: string; mimeType: string }>;
  };
  migratedFrom?: string;
}

const BACKUP_DATABASE_FILE = "yardimci-asistan.sqlite";
const BACKUP_MANIFEST_FILE = "backup.json";
const QR_IMAGE_DIRECTORY = "qr-menu-images";

function resolveProjectBackupPath() {
  const override = process.env.YA_DESKTOP_BACKUP_DIR?.trim();
  if (override) return path.resolve(override);

  if (!app.isPackaged) {
    // Development runs from apps/desktop-app; keep backups at repo-root/backup.
    return path.resolve(app.getAppPath(), "..", "..", "backup");
  }

  // Packaged builds have no source repo. The executable directory is the
  // closest equivalent to the user's visible application/project folder.
  return path.join(path.dirname(process.execPath), "backup");
}

function resolvePaths(userDataPath: string): DataMaintenancePaths {
  const maintenancePath = path.join(userDataPath, "maintenance");
  return {
    userDataPath,
    databasePath: path.join(userDataPath, "yardimci-asistan.sqlite"),
    projectBackupPath: resolveProjectBackupPath(),
    legacyBackupPath: path.join(userDataPath, "backups"),
    maintenancePath,
    markerPath: path.join(maintenancePath, "pending-data-maintenance.json"),
    stagedRestorePath: path.join(maintenancePath, "restore.sqlite")
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
      WHERE type = 'table' AND name IN ('business', 'settings', 'menu_items')
    `).all() as Array<{ name?: unknown }>;
    const requiredTables = new Set(requiredRows.map((row) => String(row.name ?? "")));
    if (!requiredTables.has("business") || !requiredTables.has("settings") || !requiredTables.has("menu_items")) {
      throw new Error("Seçilen dosya Yardımcı Asistan yedeği olarak doğrulanamadı.");
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

function readBackupManifest(folderPath: string): BackupManifest | null {
  const manifestPath = path.join(folderPath, BACKUP_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Partial<BackupManifest>;
    if (parsed.format !== "yardimci-asistan-backup" || parsed.version !== 2) return null;
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
  const databaseStat = fs.statSync(databasePath);
  const imageDirectory = path.join(folderPath, QR_IMAGE_DIRECTORY);
  const fallbackImageCount = fs.existsSync(imageDirectory)
    ? fs.readdirSync(imageDirectory, { withFileTypes: true }).filter((entry) => entry.isFile()).length
    : 0;

  return {
    id,
    createdAt: manifest?.createdAt || databaseStat.mtime.toISOString(),
    kind: manifest?.kind || "legacy",
    folderName: id,
    folderPath,
    databaseFileName: manifest?.databaseFile || BACKUP_DATABASE_FILE,
    imageCount: manifest?.qrMenuImages?.count ?? fallbackImageCount,
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
  migratedFrom?: string;
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
    const manifest: BackupManifest = {
      format: "yardimci-asistan-backup",
      version: 2,
      createdAt,
      kind: options.kind,
      databaseFile: BACKUP_DATABASE_FILE,
      qrMenuImages: {
        directory: QR_IMAGE_DIRECTORY,
        count: imageFiles.length,
        files: imageFiles
      },
      ...(options.migratedFrom ? { migratedFrom: options.migratedFrom } : {})
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

function migrateLegacyBackupDirectory(paths: DataMaintenancePaths) {
  ensureProjectBackupPath(paths);
  const sourceDirectories = [paths.legacyBackupPath, paths.projectBackupPath];

  for (const sourceDirectory of sourceDirectories) {
    if (!fs.existsSync(sourceDirectory)) continue;
    const files = fs.readdirSync(sourceDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:sqlite|db)$/i.test(entry.name));

    for (const entry of files) {
      const sourcePath = path.join(sourceDirectory, entry.name);
      try {
        validateYardimciDatabase(sourcePath);
        const stat = fs.statSync(sourcePath);
        const baseName = sanitizeFileName(entry.name.replace(/\.(?:sqlite|db)$/i, ""));
        const folderName = safeBackupId(baseName) || `yardimci-asistan-eski-${backupTimestamp(stat.mtime.toISOString())}`;
        createBackupPackageFromDatabase({
          paths,
          sourceDatabasePath: sourcePath,
          kind: "legacy",
          createdAt: stat.mtime.toISOString(),
          folderName,
          migratedFrom: sourcePath,
          liveDatabase: false
        });
        removeIfExists(sourcePath);
      } catch (error) {
        console.warn(`[data-maintenance] Eski yedek taşınamadı: ${sourcePath}`, error);
      }
    }
  }
}

function createManualBackup(userDataPath: string): DesktopBackupCreateResult {
  const paths = resolvePaths(userDataPath);
  try {
    migrateLegacyBackupDirectory(paths);
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
    return {
      ok: true,
      message: `Yerel kayıtların yedeği oluşturuldu.${imagesText}`,
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
  migrateLegacyBackupDirectory(paths);
  return createBackupPackageFromDatabase({
    paths,
    sourceDatabasePath: paths.databasePath,
    kind: "safety",
    liveDatabase: true
  });
}

function getBackups(userDataPath: string): DesktopBackupListResult {
  const paths = resolvePaths(userDataPath);
  try {
    migrateLegacyBackupDirectory(paths);
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
    migrateLegacyBackupDirectory(paths);
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
    migrateLegacyBackupDirectory(paths);
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
    migrateLegacyBackupDirectory(paths);
    const folderPath = path.join(paths.projectBackupPath, id);
    const item = readBackupItem(folderPath);
    if (!item) return { ok: false, message: "Silinecek yedek bulunamadı.", backups: listBackupItems(paths) };

    const confirmation = await dialog.showMessageBox({
      type: "warning",
      title: "Yedeği Sil",
      message: "Bu yedek kalıcı olarak silinsin mi?",
      detail: `${formatBackupDate(item.createdAt)} tarihli yedek klasörü ve içindeki QR menü görselleri silinecek.`,
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
  if (parsed.version !== 1 || (parsed.kind !== "restore" && parsed.kind !== "reset")) {
    throw new Error("Bekleyen veri bakım kaydı geçersiz.");
  }
  return parsed as PendingDataMaintenance;
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
    console.error("[data-maintenance] Bekleyen işlem uygulanamadı:", error);
  } finally {
    if (pending) {
      removeIfExists(paths.markerPath);
      removeIfExists(paths.stagedRestorePath);
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
    migrateLegacyBackupDirectory(paths);
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
    fs.copyFileSync(sourcePath, paths.stagedRestorePath);
    validateYardimciDatabase(paths.stagedRestorePath);
    writePendingOperation(paths, { version: 1, kind: "restore", createdAt: new Date().toISOString() });
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
    writePendingOperation(paths, { version: 1, kind: "reset", createdAt: new Date().toISOString() });
    try {
      await session.defaultSession.clearStorageData({ storages: ["localstorage"] });
    } catch (error) {
      console.warn("[data-maintenance] Arayüz tercihleri temizlenemedi:", error);
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
