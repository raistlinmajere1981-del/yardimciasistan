import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const logger = read("apps/desktop-app/electron/desktop-logger.ts");
const entry = read("apps/desktop-app/electron/main-entry.ts");
const dataPaths = read("apps/desktop-app/electron/data-paths.ts");
const commerceIpc = read("apps/desktop-app/electron/commerce-ipc.ts");
const syncCoordinator = read("apps/desktop-app/electron/sync-coordinator.ts");
const dataMaintenance = read("apps/desktop-app/electron/data-maintenance.ts");
const updateService = read("apps/desktop-app/electron/desktop-update-service.ts");
const companionServer = read("apps/desktop-app/electron/local-companion-server.ts");
const companionMdns = read("apps/desktop-app/electron/local-companion-mdns.ts");
const main = read("apps/desktop-app/electron/main.ts");
const diagnosticsIpc = read("apps/desktop-app/electron/ipc/diagnostics-ipc.ts");
const preload = read("apps/desktop-app/electron/preload.ts");
const rendererEntry = read("apps/desktop-app/src/main.tsx");
const agents = read("AGENTS.md");
const diagnosticsViewer = read("apps/desktop-app/src/components/diagnostics/DiagnosticsViewer.tsx");
const frame = read("apps/desktop-app/src/components/app/DesktopAppFrame.tsx");

assert.match(dataPaths, /DESKTOP_LOGS_DIR_NAME = "logs"/);
assert.match(dataPaths, /DESKTOP_LOG_SESSIONS_DIR_NAME = "sessions"/);
assert.match(dataPaths, /resolveDesktopLogSessionsPath/);

assert.match(logger, /MAX_EVENT_FILE_BYTES = 2 \* 1024 \* 1024/);
assert.match(logger, /MAX_SESSION_COUNT = 30/);
assert.match(logger, /MAX_TOTAL_SESSION_BYTES = 50 \* 1024 \* 1024/);
assert.match(logger, /events-\\d\{3\}\\\.jsonl/);
assert.match(logger, /session\.json/);
assert.match(logger, /writeRendererDiagnostic/);
assert.match(logger, /listDiagnosticSessions/);
assert.match(logger, /readDiagnosticSession/);
assert.match(logger, /uncaughtExceptionMonitor/);
assert.match(logger, /ipcMain\.handle\.bind\(ipcMain\)/);
assert.match(logger, /IPC işleyicisi başarısız oldu/);
assert.match(logger, /\[redacted\]/);
assert.match(logger, /console\.warn =/);
assert.match(logger, /console\.error =/);
assert.match(logger, /app\.session\.started/);
assert.match(logger, /ipc\.handler\.failed/);
assert.match(logger, /MAX_META_DEPTH = 4/);

const initializeIndex = entry.indexOf("initializeDesktopLogging({");
const mainImportIndex = entry.indexOf('import("./main")');
assert.ok(initializeIndex >= 0, "desktop logging initialization missing");
assert.ok(mainImportIndex > initializeIndex, "desktop logging must initialize before main IPC registration");
assert.match(entry, /finalizeDesktopLogging\("before-quit"\)/);
assert.match(entry, /registerDiagnosticsIpcHandlers/);

assert.match(diagnosticsIpc, /diagnostics:getCurrentSession/);
assert.match(diagnosticsIpc, /diagnostics:listSessions/);
assert.match(diagnosticsIpc, /diagnostics:readSession/);
assert.match(diagnosticsIpc, /diagnostics:writeRendererEvent/);
assert.match(diagnosticsIpc, /assertUnlocked/);
assert.match(preload, /writeDiagnosticEvent/);
assert.match(preload, /readDiagnosticSession/);
assert.match(rendererEntry, /renderer\.window-error/);
assert.match(rendererEntry, /renderer\.unhandled-rejection/);
assert.match(agents, /Logging and diagnostics/);
assert.match(agents, /data\/logs\/sessions/);
assert.match(diagnosticsViewer, /Tüm Oturumu Kopyala/);
assert.match(diagnosticsViewer, /Bu Kaydın Bağlamını Kopyala/);
assert.match(diagnosticsViewer, /LIVE_REFRESH_MS = 1000/);
assert.match(frame, /Uygulama loglarını aç/);
assert.doesNotMatch(diagnosticsViewer, />Session</);
assert.doesNotMatch(diagnosticsViewer, />Scope</);

assert.match(commerceIpc, /commerce:product:previewExternalImage/);
// Runtime diagnostics must use the structured API with stable events.
assert.match(commerceIpc, /product-data\.image-preview\.failed/);
assert.match(commerceIpc, /product-data\.image-archive\.failed/);
assert.match(syncCoordinator, /product-data\.image-archive\.failed/);
assert.match(dataMaintenance, /restore\.pending\.apply\.failed/);
assert.match(dataMaintenance, /reset\.preferences\.clear\.failed/);
assert.match(entry, /restore\.republish\.failed/);
assert.match(updateService, /update\.check\.failed/);
assert.match(updateService, /update\.download\.failed/);
assert.match(updateService, /update\.install\.failed/);
assert.match(companionServer, /local-companion\.server\.started/);
assert.match(companionServer, /local-companion\.auth\.rejected/);
assert.match(companionMdns, /local-companion-mdns\.advertising\.started/);
assert.match(main, /local-companion\.server\.start\.failed/);

// Legacy wrappers are removed; no runtime call sites may remain.
assert.doesNotMatch(logger, /desktopLogInfo|desktopLogWarn|desktopLogError/);
assert.doesNotMatch(logger, /legacy\.(info|warn|error)/);
for (const [name, source] of [
  ["main-entry", entry],
  ["commerce-ipc", commerceIpc],
  ["sync-coordinator", syncCoordinator],
  ["data-maintenance", dataMaintenance],
  ["update-service", updateService],
  ["local-companion-server", companionServer],
  ["local-companion-mdns", companionMdns],
  ["main", main]
]) {
  assert.doesNotMatch(source, /desktopLogInfo|desktopLogWarn|desktopLogError/, `${name} still uses legacy desktopLog wrappers`);
  assert.doesNotMatch(source, /legacy\.(info|warn|error)/, `${name} still emits legacy events`);
  assert.doesNotMatch(source, /console\.(log|info|warn|error)\s*\(/, `${name} still uses runtime console logging`);
}

console.log("desktop-logging-contract-ok");
