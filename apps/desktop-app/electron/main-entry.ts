import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { DesktopDatabase } from "./database";
import { applyPendingDataMaintenanceAtStartup, registerDataMaintenanceIpcHandlers } from "./data-maintenance";
import { registerFinanceIpcHandlers } from "./finance-ipc";
import { registerRoomFolioIpcHandlers } from "./room-folio-ipc";
import { registerWebConnectionIpcHandlers } from "./web-connection-ipc";
import { registerBusinessCapabilityIpcHandlers } from "./business-capability-ipc";
import { registerCommerceIpcHandlers } from "./commerce-ipc";
import {
  assertPersistedBusinessCapability,
  hasPersistedBusinessCapability
} from "./business-capability-runtime";

const DEV_RELAUNCH_EXIT_CODE = 75;
const userDataPath = () => process.env.YA_DESKTOP_DATA_DIR ?? app.getPath("userData");

type PendingMaintenanceKind = "restore" | "reset" | "";

function readPendingMaintenanceKind(): PendingMaintenanceKind {
  const markerPath = path.join(userDataPath(), "maintenance", "pending-data-maintenance.json");
  if (!fs.existsSync(markerPath)) return "";
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { kind?: unknown };
    return parsed.kind === "restore" || parsed.kind === "reset" ? parsed.kind : "";
  } catch {
    return "";
  }
}

function installDevelopmentRelaunchBridge() {
  if (app.isPackaged || !process.env.VITE_DEV_SERVER_URL) return;

  // Electron's app.relaunch() starts a new Electron process directly. During
  // `npm run dev` that makes the parent start-dev script observe the old
  // process exit and shut down Vite, leaving the relaunched renderer white.
  // Convert relaunch requests to a dedicated exit code so start-dev can keep
  // the same Vite server alive and spawn the replacement Electron itself.
  const mutableApp = app as unknown as {
    relaunch: (...args: unknown[]) => void;
    quit: () => void;
  };
  const originalQuit = app.quit.bind(app);
  let relaunchRequested = false;

  mutableApp.relaunch = () => {
    relaunchRequested = true;
  };
  mutableApp.quit = () => {
    if (relaunchRequested) {
      relaunchRequested = false;
      app.exit(DEV_RELAUNCH_EXIT_CODE);
      return;
    }
    originalQuit();
  };
}

function prepareRestoredStateForFullRepublish() {
  const restoredUserDataPath = userDataPath();
  const restoredDatabasePath = path.join(restoredUserDataPath, "yardimci-asistan.sqlite");
  if (!fs.existsSync(restoredDatabasePath)) return;

  // First migrate the restored backup to the current schema. This is important
  // for old backups that predate automatic sync tables/columns.
  const migrated = new DesktopDatabase({
    appPath: app.getAppPath(),
    userDataPath: restoredUserDataPath
  });
  try {
    migrated.initialize();
  } finally {
    migrated.close();
  }

  // A restore can rewind the local outbox source revision while hosting still
  // remembers a newer revision from the same desktop client. Rotate the desktop
  // sync identity so the restored point-in-time state is allowed to become the
  // new authoritative publication. Request cursors are intentionally retained:
  // genuinely new web requests received after the backup can still be pulled.
  const raw = new DatabaseSync(restoredDatabasePath);
  const now = new Date().toISOString();
  try {
    raw.prepare("UPDATE settings SET sync_client_id = '', updated_at = ?").run(now);
    raw.prepare(`
      UPDATE sync_runtime
      SET last_attempt_at = '', last_success_at = '', last_error = '',
          consecutive_failures = 0, updated_at = ?
      WHERE id = 'primary'
    `).run(now);
  } finally {
    raw.close();
  }

  // Re-open once so DesktopDatabase generates the new client id, then queue
  // durable publications according to the persisted capability set rather than
  // legacy module booleans. The normal SyncCoordinator will push these on
  // startup, making Web and Android converge to the restored SQLite state.
  const database = new DesktopDatabase({
    appPath: app.getAppPath(),
    userDataPath: restoredUserDataPath
  });
  try {
    database.initialize();
    if (hasPersistedBusinessCapability(restoredDatabasePath, BUSINESS_CAPABILITIES.QR_MENU)) {
      database.queueSyncJob("menu_publish", now);
    }
    if (hasPersistedBusinessCapability(restoredDatabasePath, BUSINESS_CAPABILITIES.ANDROID)) {
      database.queueSyncJob("android_snapshot", now);
    }
  } finally {
    database.close();
  }
}

installDevelopmentRelaunchBridge();

// Restore/reset operations are intentionally applied before main.ts opens the
// long-lived SQLite connection. This keeps WAL state and live database handles
// out of destructive maintenance operations.
const pendingMaintenanceKind = readPendingMaintenanceKind();
applyPendingDataMaintenanceAtStartup(userDataPath());
if (pendingMaintenanceKind === "restore") {
  try {
    prepareRestoredStateForFullRepublish();
  } catch (error) {
    console.error("[data-maintenance] Geri yükleme sonrası tam yayın hazırlanamadı:", error);
  }
}
const mainProcessReady = import("./main");

// Ana Electron süreci mevcut main.ts içinde kurulmaya devam eder. Finans, oda
// hesabı, commerce, capability yönetimi, veri bakımı ve yan etkisiz web bağlantı
// testi IPC yüzeyleri ayrı tutulur; kayıtlar ana veritabanı migration'larından
// sonra yapılır.
void mainProcessReady.then(() => app.whenReady()).then(() => {
  setImmediate(() => {
    const databasePath = () => path.join(userDataPath(), "yardimci-asistan.sqlite");

    const publishCommittedMutation = () => {
      // Short-lived domain services cannot reach main.ts's in-memory
      // SyncCoordinator directly. Queue Android publication only when the
      // persisted runtime capability is enabled; legacy settings booleans are
      // no longer consulted here.
      const database = new DesktopDatabase({
        appPath: app.getAppPath(),
        userDataPath: userDataPath()
      });
      try {
        database.initialize();
        if (hasPersistedBusinessCapability(databasePath(), BUSINESS_CAPABILITIES.ANDROID)) {
          database.queueSyncJob("android_snapshot");
        }
        const dashboard = database.getDashboardData();
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send("dashboard:dataChanged", dashboard);
          }
        }
      } finally {
        database.close();
      }
    };

    registerDataMaintenanceIpcHandlers(userDataPath);

    registerBusinessCapabilityIpcHandlers({
      databasePath,
      assertUnlocked: () => undefined,
      onMutation: publishCommittedMutation
    });

    registerFinanceIpcHandlers({
      databasePath,
      // The isolated preload bridge checks appLock:getStatus before exposing
      // these channels to renderer code. The handler remains internal-only;
      // nodeIntegration is disabled in the renderer.
      assertUnlocked: () => undefined,
      onMutation: publishCommittedMutation
    });

    registerRoomFolioIpcHandlers({
      databasePath,
      assertUnlocked: () => undefined,
      assertCapability: () => assertPersistedBusinessCapability(
        databasePath(),
        BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO,
        "Oda hesabı bu işletme profilinde etkin değil."
      ),
      onMutation: publishCommittedMutation
    });

    registerCommerceIpcHandlers({
      databasePath,
      // Commerce runtime performs capability checks. Renderer access remains
      // behind the same app-lock-aware preload bridge used by finance/folio.
      assertUnlocked: () => undefined,
      onMutation: publishCommittedMutation
    });

    registerWebConnectionIpcHandlers();
  });
});
