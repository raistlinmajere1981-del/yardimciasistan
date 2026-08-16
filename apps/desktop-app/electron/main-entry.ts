import { app, BrowserWindow } from "electron";
import path from "node:path";
import "./main";
import { DesktopDatabase } from "./database";
import { registerFinanceIpcHandlers } from "./finance-ipc";
import { registerRoomFolioIpcHandlers } from "./room-folio-ipc";
import { registerWebConnectionIpcHandlers } from "./web-connection-ipc";

// Ana Electron süreci mevcut main.ts içinde kurulmaya devam eder. Finans, oda
// hesabı ve yan etkisiz web bağlantı testi IPC yüzeyleri ayrı tutulur; kayıtlar
// ana veritabanı migration'larından sonra yapılır.
void app.whenReady().then(() => {
  setImmediate(() => {
    const userDataPath = () => process.env.YA_DESKTOP_DATA_DIR ?? app.getPath("userData");
    const databasePath = () => path.join(userDataPath(), "yardimci-asistan.sqlite");

    const publishCommittedMutation = () => {
      // Finance/folio services use their own short-lived SQLite connection and
      // therefore cannot reach main.ts's in-memory SyncCoordinator directly.
      // Queue the same durable Android snapshot job used by DesktopDatabase;
      // the regular coordinator picks it up on its next cycle even after a
      // process restart. Also broadcast a fresh dashboard to all renderer
      // windows so cross-page totals stay coherent immediately.
      const database = new DesktopDatabase({
        appPath: app.getAppPath(),
        userDataPath: userDataPath()
      });
      try {
        database.initialize();
        const setup = database.getSetupData();
        if (setup.modules.android) {
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
      onMutation: publishCommittedMutation
    });

    registerWebConnectionIpcHandlers();
  });
});
