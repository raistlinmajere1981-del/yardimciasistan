import { app } from "electron";
import path from "node:path";
import "./main";
import { registerFinanceIpcHandlers } from "./finance-ipc";

// Ana Electron süreci mevcut main.ts içinde kurulmaya devam eder. Finans IPC
// yüzeyi ayrı tutulur; app.whenReady callback'i kayıt sırasına göre ana veritabanı
// migration'larından sonra çalışır.
void app.whenReady().then(() => {
  setImmediate(() => {
    registerFinanceIpcHandlers({
      databasePath: () => path.join(
        process.env.YA_DESKTOP_DATA_DIR ?? app.getPath("userData"),
        "yardimci-asistan.sqlite"
      ),
      // Finans ekranı yalnız uygulama kilidi açıldıktan sonra renderer tarafından
      // gösterilir. Ana kilit yüzeyi mevcut main.ts içinde korunur.
      assertUnlocked: () => undefined
    });
  });
});
