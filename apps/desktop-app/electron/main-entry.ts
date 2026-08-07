import { app } from "electron";
import path from "node:path";
import "./main";
import { registerFinanceIpcHandlers } from "./finance-ipc";
import { registerRoomFolioIpcHandlers } from "./room-folio-ipc";

// Ana Electron süreci mevcut main.ts içinde kurulmaya devam eder. Finans ve oda
// adisyonu IPC yüzeyleri ayrı tutulur; kayıtlar ana veritabanı migration'larından
// sonra yapılır.
void app.whenReady().then(() => {
  setImmediate(() => {
    const databasePath = () => path.join(
      process.env.YA_DESKTOP_DATA_DIR ?? app.getPath("userData"),
      "yardimci-asistan.sqlite"
    );

    registerFinanceIpcHandlers({
      databasePath,
      // Renderer tarafındaki preload köprüsü kilit durumunu yazma öncesinde kontrol eder.
      assertUnlocked: () => undefined
    });

    registerRoomFolioIpcHandlers({
      databasePath,
      assertUnlocked: () => undefined
    });
  });
});
