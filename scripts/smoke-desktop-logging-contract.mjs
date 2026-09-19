import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const logger = read("apps/desktop-app/electron/desktop-logger.ts");
const entry = read("apps/desktop-app/electron/main-entry.ts");
const dataPaths = read("apps/desktop-app/electron/data-paths.ts");
const commerceIpc = read("apps/desktop-app/electron/commerce-ipc.ts");

assert.match(dataPaths, /DESKTOP_LOGS_DIR_NAME = "logs"/);
assert.match(dataPaths, /DESKTOP_LOG_FILE_NAME = "yardimci-asistan\.log"/);
assert.match(dataPaths, /resolveDesktopLogFilePath/);

assert.match(logger, /MAX_LOG_BYTES = 2 \* 1024 \* 1024/);
assert.match(logger, /ROTATED_LOG_COUNT = 3/);
assert.match(logger, /uncaughtExceptionMonitor/);
assert.match(logger, /ipcMain\.handle\.bind\(ipcMain\)/);
assert.match(logger, /IPC handler failed/);
assert.match(logger, /\[redacted\]/);
assert.match(logger, /console\.warn =/);
assert.match(logger, /console\.error =/);

const initializeIndex = entry.indexOf("initializeDesktopLogging(userDataPath())");
const mainImportIndex = entry.indexOf('import("./main")');
assert.ok(initializeIndex >= 0, "desktop logging initialization missing");
assert.ok(mainImportIndex > initializeIndex, "desktop logging must initialize before main IPC registration");

assert.match(commerceIpc, /commerce:product:previewExternalImage/);
assert.match(commerceIpc, /desktopLogWarn\("product-data"/);

console.log("desktop-logging-contract-ok");
