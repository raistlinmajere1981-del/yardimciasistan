import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app, dialog, ipcMain, session } from "electron";

export type DesktopDataMaintenanceResult =
  | {
      ok: true;
      message: string;
      restartScheduled: true;
      safetyBackupFileName?: string;
      sourceFileName?: string;
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
  backupPath: string;
  maintenancePath: string;
  markerPath: string;
  stagedRestorePath: string;
}

function resolvePaths(userDataPath: string): DataMaintenancePaths {
  const maintenancePath = path.join(userDataPath, "maintenance");
  return {
    userDataPath,
    databasePath: path.join(userDataPath, "yardimci-asistan.sqlite"),
    backupPath: path.join(userDataPath, "backups"),
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
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Cleanup is best effort; the main operation reports any meaningful failure.
  }
}

function removeDatabaseSidecars(databasePath: string) {
  removeIfExists(`${databasePath}-wal`);
  removeIfExists(`${databasePath}-shm`);
  removeIfExists(`${databasePath}-journal`);
}

function validateYardimciDatabase(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Seçilen yedek dosyası bulunamadı.");
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
      WHERE type = 'table' AND name IN ('business', 'settings')
    `).all() as Array<{ name?: unknown }>;
    const requiredTables = new Set(requiredRows.map((row) => String(row.name ?? "")));
    if (!requiredTables.has("business") || !requiredTables.has("settings")) {
      throw new Error("Seçilen dosya Yardımcı Asistan yedeği olarak doğrulanamadı.");
    }
  } finally {
    database.close();
  }
}

function createSafetyBackup(paths: DataMaintenancePaths): string | undefined {
  if (!fs.existsSync(paths.databasePath)) {
    return undefined;
  }

  fs.mkdirSync(paths.backupPath, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `yardimci-asistan-guvenlik-${timestamp}.sqlite`;
  const filePath = path.join(paths.backupPath, fileName);
  const database = new DatabaseSync(paths.databasePath);

  try {
    database.exec("PRAGMA busy_timeout = 5000;");
    database.exec(`VACUUM INTO '${sqlString(filePath)}'`);
  } finally {
    database.close();
  }

  validateYardimciDatabase(filePath);
  return fileName;
}

function writePendingOperation(paths: DataMaintenancePaths, operation: PendingDataMaintenance) {
  fs.mkdirSync(paths.maintenancePath, { recursive: true });
  fs.writeFileSync(paths.markerPath, JSON.stringify(operation, null, 2), "utf8");
}

function readPendingOperation(paths: DataMaintenancePaths): PendingDataMaintenance | null {
  if (!fs.existsSync(paths.markerPath)) {
    return null;
  }

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
  if (hadCurrentDatabase) {
    fs.renameSync(paths.databasePath, rollbackPath);
  }

  try {
    fs.renameSync(nextDatabasePath, paths.databasePath);
    validateYardimciDatabase(paths.databasePath);
    removeIfExists(rollbackPath);
  } catch (error) {
    removeIfExists(paths.databasePath);
    if (hadCurrentDatabase && fs.existsSync(rollbackPath)) {
      fs.renameSync(rollbackPath, paths.databasePath);
    }
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
    if (!pending) {
      return;
    }

    if (pending.kind === "restore") {
      replaceDatabaseFromStagedRestore(paths);
    } else {
      resetDatabaseFiles(paths);
    }
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

async function prepareRestore(userDataPath: string): Promise<DesktopDataMaintenanceResult> {
  const paths = resolvePaths(userDataPath);
  const selection = await dialog.showOpenDialog({
    title: "Yardımcı Asistan Yedeğini Seç",
    properties: ["openFile"],
    filters: [
      { name: "Yardımcı Asistan SQLite yedeği", extensions: ["sqlite", "db"] },
      { name: "Tüm dosyalar", extensions: ["*"] }
    ]
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return { ok: false, cancelled: true, message: "Geri yükleme iptal edildi." };
  }

  const sourcePath = path.resolve(selection.filePaths[0]);
  if (sourcePath === path.resolve(paths.databasePath)) {
    return {
      ok: false,
      message: "Aktif veri dosyası geri yükleme kaynağı olarak kullanılamaz. Yedek klasöründeki bir kopyayı seçin."
    };
  }

  try {
    validateYardimciDatabase(sourcePath);
  } catch (error) {
    return { ok: false, message: `Yedek açılamadı: ${errorMessage(error)}` };
  }

  const confirmation = await dialog.showMessageBox({
    type: "warning",
    title: "Yedekten Geri Yükle",
    message: "Seçilen yedek mevcut yerel verilerin yerini alacak.",
    detail: "Devam etmeden önce mevcut verilerin otomatik güvenlik yedeği alınır. Ardından uygulama yeniden başlatılır.",
    buttons: ["Vazgeç", "Geri Yükle"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (confirmation.response !== 1) {
    return { ok: false, cancelled: true, message: "Geri yükleme iptal edildi." };
  }

  try {
    const safetyBackupFileName = createSafetyBackup(paths);
    fs.mkdirSync(paths.maintenancePath, { recursive: true });
    removeIfExists(paths.stagedRestorePath);
    fs.copyFileSync(sourcePath, paths.stagedRestorePath);
    validateYardimciDatabase(paths.stagedRestorePath);
    writePendingOperation(paths, { version: 1, kind: "restore", createdAt: new Date().toISOString() });
    scheduleRelaunch();

    return {
      ok: true,
      restartScheduled: true,
      sourceFileName: path.basename(sourcePath),
      safetyBackupFileName,
      message: safetyBackupFileName
        ? `Yedek doğrulandı. Mevcut veriler ${safetyBackupFileName} adıyla güvenceye alındı; uygulama yeniden başlatılıyor.`
        : "Yedek doğrulandı; uygulama yeniden başlatılıyor."
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
    detail: "İşletme kayıtları, ayarlar ve uygulama şifresi kaldırılır. Yedek klasörü korunur ve işlemden önce otomatik güvenlik yedeği alınır. Uygulama yeniden başladığında başlangıç verileri yeniden oluşturulur.",
    buttons: ["Vazgeç", "Verileri Sıfırla"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (confirmation.response !== 1) {
    return { ok: false, cancelled: true, message: "Veri sıfırlama iptal edildi." };
  }

  try {
    const safetyBackupFileName = createSafetyBackup(paths);
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
      safetyBackupFileName,
      message: safetyBackupFileName
        ? `Mevcut veriler ${safetyBackupFileName} adıyla güvenceye alındı; sıfırlama için uygulama yeniden başlatılıyor.`
        : "Sıfırlama hazırlandı; uygulama yeniden başlatılıyor."
    };
  } catch (error) {
    removeIfExists(paths.markerPath);
    return { ok: false, message: `Veriler sıfırlanamadı: ${errorMessage(error)}` };
  }
}

export function registerDataMaintenanceIpcHandlers(userDataPath: () => string) {
  ipcMain.removeHandler("dataMaintenance:restoreBackup");
  ipcMain.removeHandler("dataMaintenance:resetLocalData");
  ipcMain.handle("dataMaintenance:restoreBackup", () => prepareRestore(userDataPath()));
  ipcMain.handle("dataMaintenance:resetLocalData", () => prepareReset(userDataPath()));
}
