import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const logger = read("apps/desktop-app/electron/desktop-logger.ts");
const entry = read("apps/desktop-app/electron/main-entry.ts");
const dataPaths = read("apps/desktop-app/electron/data-paths.ts");
const commerceIpc = read("apps/desktop-app/electron/commerce-ipc.ts");
const productDataService = read("apps/desktop-app/electron/product-data-service.ts");
const syncCoordinator = read("apps/desktop-app/electron/sync-coordinator.ts");
const dataMaintenance = read("apps/desktop-app/electron/data-maintenance.ts");
const updateService = read("apps/desktop-app/electron/desktop-update-service.ts");
const companionServer = read("apps/desktop-app/electron/local-companion-server.ts");
const companionMdns = read("apps/desktop-app/electron/local-companion-mdns.ts");
const main = read("apps/desktop-app/electron/main.ts");
const diagnosticsIpc = read("apps/desktop-app/electron/ipc/diagnostics-ipc.ts");
const supportService = read("apps/desktop-app/electron/support-report-service.ts");
const webDiagnostics = read("apps/desktop-app/electron/web-diagnostics.ts");
const aiDiagnostics = read("apps/desktop-app/electron/ai-diagnostics.ts");
const aiFailureClassification = read("packages/ai-core/providers/failure-classification.ts");
const supportEndpoint = read("infrastructure/support/report.php");
const rootErrorBoundary = read("apps/desktop-app/src/components/app/RootErrorBoundary.tsx");
const preload = read("apps/desktop-app/electron/preload.ts");
const rendererEntry = read("apps/desktop-app/src/main.tsx");
const agents = read("AGENTS.md");
const loggingDoc = read("docs/diagnostics/logging.md");
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
assert.match(logger, /INFO_FLUSH_INTERVAL_MS = 250/);
assert.match(logger, /INFO_FLUSH_BYTES = 32 \* 1024/);
assert.match(logger, /flushPendingEvents/);
assert.match(logger, /process\.on\("unhandledRejection"/);
assert.match(logger, /createDiagnosticOperationId/);
assert.match(logger, /createDiagnosticSupportSnapshot/);

const initializeIndex = entry.indexOf("initializeDesktopLogging({");
const mainImportIndex = entry.indexOf('import("./main")');
assert.ok(initializeIndex >= 0, "desktop logging initialization missing");
assert.ok(mainImportIndex > initializeIndex, "desktop logging must initialize before main IPC registration");
assert.match(entry, /finalizeDesktopLogging\("before-quit"\)/);
assert.match(entry, /registerDiagnosticsIpcHandlers/);

assert.match(diagnosticsIpc, /diagnostics:listSessions/);
assert.match(diagnosticsIpc, /diagnostics:readSession/);
assert.match(diagnosticsIpc, /diagnostics:writeRendererEvent/);
assert.match(diagnosticsIpc, /diagnostics:getSupportReportDraft/);
assert.match(diagnosticsIpc, /diagnostics:addClipboardScreenshot/);
assert.match(diagnosticsIpc, /diagnostics:sendSupportReport/);
assert.match(diagnosticsIpc, /assertUnlocked/);
assert.match(preload, /writeDiagnosticEvent/);
assert.match(preload, /readDiagnosticSession/);
assert.match(rendererEntry, /renderer\.window-error/);
assert.match(rendererEntry, /renderer\.unhandled-rejection/);
assert.match(rendererEntry, /RootErrorBoundary/);
assert.match(rootErrorBoundary, /renderer\.react-boundary/);
assert.match(agents, /docs\/diagnostics\/logging\.md/);
assert.match(loggingDoc, /Desktop diagnostics/);
assert.match(loggingDoc, /data\/logs\/sessions/);
assert.match(diagnosticsViewer, /Tüm Oturumu Kopyala/);
assert.match(diagnosticsViewer, /Bu Kaydın Bağlamını Kopyala/);
assert.match(diagnosticsViewer, /LIVE_REFRESH_MS = 1000/);
assert.match(diagnosticsViewer, /Hata Bildir/);
assert.match(frame, /Uygulama loglarını aç/);
assert.doesNotMatch(diagnosticsViewer, />Session</);
assert.doesNotMatch(diagnosticsViewer, />Scope</);

assert.match(commerceIpc, /commerce:product:previewExternalImage/);
// Runtime diagnostics must use the structured API with stable events.
assert.match(commerceIpc, /product-data\.image-preview\.failed/);
assert.match(productDataService, /product-data\.image-archive\.failed/);
assert.match(commerceIpc, /commerce\.domain\.rejected/);
assert.match(commerceIpc, /desktopLog\.warn\(\{[\s\S]*?event:\s*"commerce\.domain\.rejected"/);
assert.match(commerceIpc, /mutateForIpc\("commerce:sale:createPaid"/);
assert.match(syncCoordinator, /product-data\.image-archive\.failed/);
assert.match(dataMaintenance, /restore\.pending\.apply\.failed/);
assert.match(dataMaintenance, /reset\.preferences\.clear\.failed/);
assert.match(dataMaintenance, /restore\.republish\.failed/);
assert.match(updateService, /update\.check\.failed/);
assert.match(updateService, /update\.download\.failed/);
assert.match(updateService, /update\.install\.failed/);
assert.match(companionServer, /local-companion\.server\.started/);
assert.match(companionServer, /local-companion\.auth\.rejected/);
assert.match(companionMdns, /local-companion-mdns\.advertising\.started/);
assert.match(main, /local-companion\.reconcile\.failed/);
assert.match(webDiagnostics, /protocol_mismatch/);
assert.match(webDiagnostics, /authentication/);
assert.match(webDiagnostics, /rate_limited/);
assert.match(syncCoordinator, /sync\.cycle\.started/);
assert.match(syncCoordinator, /this\.logSyncFailure\("capabilities"/);
assert.match(syncCoordinator, /event:\s*`sync\.\$\{stage\}\.failed`/);
assert.match(aiFailureClassification, /quota_exhausted/);
assert.match(aiFailureClassification, /service_busy/);
assert.match(aiFailureClassification, /rate_limited/);
assert.match(aiDiagnostics, /retryAfterSeconds/);
assert.match(supportService, /createDiagnosticSupportSnapshot\(3\)/);
assert.match(supportService, /\[identity-number\]/);
assert.match(supportService, /SUPPORT_REPORT_ENDPOINT/);
assert.match(supportEndpoint, /YARDIMCI_ASISTAN_SUPPORT_DIR/);
assert.match(supportEndpoint, /YA_SUPPORT_MAX_SESSIONS = 3/);
assert.match(supportEndpoint, /REQUEST_METHOD/);


// Legacy wrappers are removed; no runtime call sites may remain.
assert.doesNotMatch(logger, /desktopLogInfo|desktopLogWarn|desktopLogError/);
assert.doesNotMatch(logger, /legacy\.(info|warn|error)/);
for (const [name, source] of [
  ["main-entry", entry],
  ["commerce-ipc", commerceIpc],
  ["product-data-service", productDataService],
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
