import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { getSyncCapabilities, resetHostingRuntime } from "@yardimci-asistan/sync-core";
import { DesktopDatabase } from "./database";
import { inspectDesktopDatabaseCompatibility } from "./desktop-database-compatibility.js";
import { applyPendingDataMaintenanceAtStartup, registerDataMaintenanceIpcHandlers, resolveProjectBackupPath } from "./data-maintenance";
import {
  resolveDatabasePath,
  resolveDataRoot
} from "./data-paths.js";
import { registerFinanceIpcHandlers } from "./finance-ipc";
import { registerRoomFolioIpcHandlers } from "./room-folio-ipc";
import { registerWebConnectionIpcHandlers } from "./web-connection-ipc";
import { registerBusinessCapabilityIpcHandlers } from "./business-capability-ipc";
import { registerBusinessLayoutIpcHandlers } from "./business-layout-ipc";
import { registerCommerceIpcHandlers } from "./commerce-ipc";
import { getWebSyncConfig } from "./sync-config";
import { registerDiagnosticsIpcHandlers } from "./ipc/diagnostics-ipc";
import {
  assertPersistedBusinessCapability,
  hasPersistedBusinessCapability
} from "./business-capability-runtime";
import {
  desktopLog,
  finalizeDesktopLogging,
  initializeDesktopLogging
} from "./desktop-logger";
import {
  applyPendingDesktopUpdateAtStartup,
  registerDesktopUpdateIpcHandlers,
  startAutomaticDesktopUpdateChecks
} from "./desktop-update-service";

const DEV_RELAUNCH_EXIT_CODE = 75;

function resolveRuntimeDataRoot(): string {
  return resolveDataRoot({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    defaultUserDataPath: app.getPath("userData")
  });
}

const userDataPath = () => resolveRuntimeDataRoot();

const desktopDiagnosticSession = initializeDesktopLogging({
  dataRoot: userDataPath(),
  appVersion: app.getVersion(),
  packaged: app.isPackaged
});
if (desktopDiagnosticSession) {
  desktopLog.info({
    scope: "startup",
    event: "app.process.starting",
    message: "Masaüstü uygulama işlemi başlatılıyor.",
    meta: { packaged: app.isPackaged }
  });
}

app.on("render-process-gone", (_event, webContents, details) => {
  desktopLog.error({
    scope: "renderer",
    event: "renderer.process.gone",
    message: "Renderer işlemi beklenmedik şekilde sonlandı.",
    meta: {
      webContentsId: webContents.id,
      reason: details.reason,
      exitCode: details.exitCode
    }
  });
});

app.on("child-process-gone", (_event, details) => {
  desktopLog.warn({
    scope: "child-process",
    event: "child-process.gone",
    message: "Alt işlem beklenmedik şekilde sonlandı.",
    meta: {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode
    }
  });
});

app.on("before-quit", () => {
  desktopLog.info({
    scope: "shutdown",
    event: "app.shutdown.requested",
    message: "Masaüstü uygulaması kapatılıyor."
  });
});
// Worker receipts must flush before the diagnostic session is finalized. Keep its existing end reason.
app.on("will-quit", () => finalizeDesktopLogging("before-quit"));

function shouldDeferPendingMaintenanceToCleanStart(): boolean {
  if (process.argv.includes("--clean-start")) return true;

  const compatibility = inspectDesktopDatabaseCompatibility(
    resolveDatabasePath(userDataPath()),
    path.join(app.getAppPath(), "db", "schema.sql")
  );
  return compatibility.state === "incompatible" || compatibility.state === "unreadable";
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
  };
  let relaunchRequested = false;

  mutableApp.relaunch = () => {
    relaunchRequested = true;
  };
  // Preserve before-quit so dispatch/sync drains finish before the development process exits.
  app.on("will-quit", (event) => {
    if (relaunchRequested) {
      event.preventDefault();
      relaunchRequested = false;
      app.exit(DEV_RELAUNCH_EXIT_CODE);
    }
  });
}

installDevelopmentRelaunchBridge();

// The packaged Windows process doubles as the lightweight launcher. A verified
// installer staged by the previous run is applied before SQLite or the renderer
// are opened, then the silent NSIS installer relaunches the updated app.
if (applyPendingDesktopUpdateAtStartup(userDataPath())) {
  desktopLog.info({ scope: "update", event: "update.installer.handoff", message: "Başlangıç başlatıcısı denetimi güncelleme kurucusuna devretti." });
  process.exit(0);
}

// Restore/reset operations are intentionally applied before main.ts opens the
// long-lived SQLite connection. This keeps WAL state and live database handles
// out of destructive maintenance operations.
const deferPendingMaintenance = shouldDeferPendingMaintenanceToCleanStart();
if (deferPendingMaintenance) {
  desktopLog.warn({
    scope: "startup",
    event: "startup.maintenance.deferred-for-clean-start",
    message: "Eski veri bakımı temiz başlangıç kararı verilene kadar ertelendi."
  });
} else {
  applyPendingDataMaintenanceAtStartup(userDataPath());
}
const mainProcessReady = import("./main");

// Ana Electron süreci mevcut main.ts içinde kurulmaya devam eder. Finans, oda
// hesabı, commerce, capability yönetimi, veri bakımı ve yan etkisiz web bağlantı
// testi IPC yüzeyleri ayrı tutulur; kayıtlar ana veritabanı initialization adımından
// sonra yapılır.
void mainProcessReady.then(async ({
  assertAppSessionUnlocked,
  markLocalCompanionSnapshotDirty,
  scheduleAutomaticSyncSoon,
  suspendAutomaticSyncForMaintenance,
  resumeAutomaticSyncAfterMaintenanceAbort
}) => {
  await app.whenReady();
  setImmediate(() => {
    const databasePath = () => resolveDatabasePath(userDataPath());

    const publishCommittedMutation = (capabilitiesChanged = false) => {
      // Short-lived domain services cannot reach main.ts's in-memory
      // SyncCoordinator directly. Domain mutations only affect the Android
      // publication while that service is active; setup/restore separately
      // queue the tombstone that clears stale hosted data when it is disabled.
      markLocalCompanionSnapshotDirty();
      const database = new DesktopDatabase({
        appPath: app.getAppPath(),
        userDataPath: userDataPath(),
        backupPath: resolveProjectBackupPath(userDataPath())
      });
      try {
        database.initialize();
        if (capabilitiesChanged
            || hasPersistedBusinessCapability(databasePath(), BUSINESS_CAPABILITIES.ANDROID)) {
          database.queueSyncJob("android_snapshot");
        }
        if (capabilitiesChanged
            && hasPersistedBusinessCapability(databasePath(), BUSINESS_CAPABILITIES.QR_MENU)) {
          database.queueSyncJob("menu_publish");
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
      scheduleAutomaticSyncSoon(capabilitiesChanged);
    };

    registerDiagnosticsIpcHandlers({ assertUnlocked: assertAppSessionUnlocked, userDataPath });
    registerDataMaintenanceIpcHandlers(userDataPath, {
      assertUnlocked: assertAppSessionUnlocked,
      beforeMaintenance: suspendAutomaticSyncForMaintenance,
      afterMaintenanceAbort: resumeAutomaticSyncAfterMaintenanceAbort,
      resetConnectedWebRuntime: async () => {
        const database = new DesktopDatabase({
          appPath: app.getAppPath(),
          userDataPath: userDataPath(),
          backupPath: resolveProjectBackupPath(userDataPath())
        });
        try {
          database.initialize();
          const { baseUrl, syncSecret } = getWebSyncConfig(database.getSetupData());
          const normalizedBaseUrl = String(baseUrl ?? "").trim();
          const normalizedSecret = String(syncSecret ?? "").trim();
          if (!normalizedBaseUrl || !normalizedSecret || normalizedSecret === "change-this-secret") {
            return { ok: true, skipped: true, message: "Bağlı web modülü yapılandırılmamış." };
          }

          const capabilities = await getSyncCapabilities({
            baseUrl: normalizedBaseUrl,
            syncSecret: normalizedSecret
          });
          if (!capabilities.ok) {
            return { ok: false, message: capabilities.message };
          }
          if (!capabilities.features.includes("runtime_reset")) {
            return {
              ok: false,
              message: "Web modülü temiz başlangıç sıfırlamasını desteklemiyor. Web modülü paketini güncelleyip tekrar deneyin."
            };
          }

          const result = await resetHostingRuntime({ baseUrl: normalizedBaseUrl, syncSecret: normalizedSecret });
          return { ok: result.ok, message: result.message };
        } finally {
          database.close();
        }
      }
    });
    registerDesktopUpdateIpcHandlers(userDataPath, assertAppSessionUnlocked);
    startAutomaticDesktopUpdateChecks(userDataPath);

    registerBusinessCapabilityIpcHandlers({
      databasePath,
      assertUnlocked: assertAppSessionUnlocked,
      // Capability changes must always publish the hosted manifest, including
      // the tombstone created while service.android is being switched off.
      onMutation: () => publishCommittedMutation(true)
    });

    registerBusinessLayoutIpcHandlers({
      databasePath,
      assertUnlocked: assertAppSessionUnlocked,
      onMutation: publishCommittedMutation
    });

    registerFinanceIpcHandlers({
      databasePath,
      assertUnlocked: assertAppSessionUnlocked,
      assertCapability: () => assertPersistedBusinessCapability(
        databasePath(),
        BUSINESS_CAPABILITIES.FINANCE,
        "Finans yönetimi bu işletme profilinde etkin değil."
      ),
      assertAccommodationReservationCapability: () => assertPersistedBusinessCapability(
        databasePath(),
        BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS,
        "Konaklama bedeli bu işletmede etkin değil."
      ),
      assertAccommodationFolioCapability: () => assertPersistedBusinessCapability(
        databasePath(),
        BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO,
        "Konaklama tahsilatı bu işletmede etkin değil."
      ),
      onMutation: publishCommittedMutation
    });

    registerRoomFolioIpcHandlers({
      databasePath,
      assertUnlocked: assertAppSessionUnlocked,
      assertCapability: () => assertPersistedBusinessCapability(
        databasePath(),
        BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO,
        "Oda hesabı bu işletme profilinde etkin değil."
      ),
      canUseMenu: () => hasPersistedBusinessCapability(databasePath(), BUSINESS_CAPABILITIES.FOOD_MENU),
      assertMenuCapability: () => assertPersistedBusinessCapability(
        databasePath(),
        BUSINESS_CAPABILITIES.FOOD_MENU,
        "Menüden oda hesabına ürün ekleme bu işletmede etkin değil."
      ),
      assertOrderTransferCapability: () => assertPersistedBusinessCapability(
        databasePath(),
        BUSINESS_CAPABILITIES.FOOD_ORDERS,
        "Restoran adisyonu aktarımı bu işletmede etkin değil."
      ),
      onMutation: publishCommittedMutation
    });

    registerCommerceIpcHandlers({
      databasePath,
      // Recheck the main-process session even if the app locked after preload's check.
      assertUnlocked: assertAppSessionUnlocked,
      onMutation: publishCommittedMutation
    });

    registerWebConnectionIpcHandlers({ assertUnlocked: assertAppSessionUnlocked });
  });
});
