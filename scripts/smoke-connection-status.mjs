import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const cache = new Map();
function compile(file) {
  return ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
}
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  runInNewContext(compile(file), { exports, require: name => {
    if (!name.startsWith(".")) return require(name);
    const stem = resolve(dirname(file), name);
    const target = [stem, `${stem}.ts`, `${stem}.tsx`].find(path => existsSync(path));
    assert.ok(target, `Missing dependency: ${name}`);
    return load(target);
  } });
  return exports;
}
const app = file => load(resolve("apps/desktop-app/src", file));
const { projectConnectionStatus: project } = app("app/connection-status.ts");
const { defaultAutomaticSyncStatus } = app("app/runtime-state.ts");
const { SyncStatusIndicator } = app("components/layout/SyncStatusIndicator.tsx");
const { SystemHealthPanel } = app("components/dashboard/SystemHealthPanel.tsx");
const setup = { webModuleUrl: "https://web.test/module", syncSecret: "saved-secret", autoSyncEnabled: true, localNetworkEnabled: true };
const base = { setup, syncStatus: defaultAutomaticSyncStatus, androidEnabled: true };
const localSetup = { ...setup, webModuleUrl: "", syncSecret: "" };
const webFailure = { ...defaultAutomaticSyncStatus, phase: "offline", message: "İnternet bağlantısı yok", consecutiveFailures: 1 };
const renderIndicator = connection => renderToStaticMarkup(createElement(SyncStatusIndicator, {connection, onSync: () => assert.fail("render cannot start sync")}));
const before = JSON.stringify(base);

const local = project({ ...base, setup: localSetup, syncStatus: webFailure });
assert.equal(local.webConfigured, false);
assert.equal(local.webSyncStatus, "disabled");
assert.equal(local.webNotice, null);
assert.equal(local.manualWebSyncAllowed, false);
assert.equal(local.localCompanion, "configured", "LAN preference/capability is independent of Web");
assert.equal(renderIndicator(local), "", "local-only has no clickable/inert sync button");
for (const incomplete of [{ ...setup, syncSecret: " " }, { ...setup, webModuleUrl: " " }]) {
  assert.equal(project({...base, setup: incomplete}).webConfigured, false);
}

const manual = project({ ...base, setup: { ...setup, autoSyncEnabled: false }, syncStatus: { ...defaultAutomaticSyncStatus, enabled: false, phase: "disabled" } });
assert.equal(manual.webConfigured, true);
assert.equal(manual.webSyncStatus, "ready");
assert.equal(manual.automaticWebSyncEnabled, false);
assert.equal(manual.manualWebSyncAllowed, true);
assert.match(manual.web.detail, /manuel eşitleme ve yayın kullanılabilir/);
assert.match(renderIndicator(manual), /Elle eşitlemek/);
assert.doesNotMatch(renderIndicator(manual), /disabled=""/);

const unreachable = project({ ...base, syncStatus: webFailure, networkSignal: "onlineHint" });
assert.equal(unreachable.webSyncStatus, "unreachable");
assert.equal(unreachable.networkSignal, "onlineHint");
assert.equal(unreachable.network.tone, "info");
assert.equal(unreachable.web.label, "Web sunucusuna erişilemiyor");
assert.match(unreachable.webNotice, /genel internet erişimini göstermez/);
assert.doesNotMatch(unreachable.webNotice, /İnternet bağlantısı yok/);
assert.match(renderIndicator(unreachable), /Web sunucusuna erişilemiyor/);

const localOffline = project({ ...base, setup: localSetup, networkSignal: "offlineHint" });
assert.equal(localOffline.webSyncStatus, "disabled");
assert.equal(localOffline.webNotice, null, "negative network hint alone creates no global sync alert");
assert.equal(localOffline.networkSignal, "offlineHint");
assert.equal(localOffline.localCompanion, "configured", "network hint cannot prove LAN unavailability");

const devices = [{ isActive: true, revokedAt: "" }, { isActive: false, revokedAt: "" }, { isActive: true, revokedAt: "2026-10-01" }];
const lanOff = project({ ...base, setup: { ...localSetup, localNetworkEnabled: false }, devices });
assert.equal(lanOff.localCompanion, "off");
assert.equal(lanOff.approvedAndroidDevices, 1, "approved devices remain counted while LAN is off");
assert.equal(lanOff.pendingAndroidDevices, 1);
assert.equal(project({ ...base, devices: [] }).localCompanion, "configured", "preference alone never means paired/ready");
assert.equal(project({ ...base, androidEnabled: false, devices }).localCompanion, "off");

for (const networkSignal of ["onlineHint", "offlineHint", "unknown"]) {
  const error = project({ ...base, networkSignal, syncStatus: { ...webFailure, phase: "error" } });
  assert.equal(error.webSyncStatus, "error");
  assert.equal(error.networkSignal, networkSignal);
  assert.equal(error.manualWebSyncAllowed, true);
  const success = project({ ...base, networkSignal, syncStatus: { ...defaultAutomaticSyncStatus, phase: "success", lastSuccessAt: "2026-10-27" } });
  assert.equal(success.networkSignal, networkSignal, "successful Web sync never verifies internet");
  assert.notEqual(success.web.tone, "success");
  assert.match(success.web.detail, /güncel erişim garantisi değildir/);
}
assert.equal(project({ ...base, syncStatus: { ...defaultAutomaticSyncStatus, pendingJobs: 2 } }).webSyncStatus, "waiting");
const syncing = project({ ...base, syncStatus: { ...defaultAutomaticSyncStatus, phase: "syncing" } });
assert.equal(syncing.webSyncStatus, "syncing");
assert.equal(syncing.manualWebSyncAllowed, false);
assert.match(renderIndicator(syncing), /disabled=""/);
assert.equal(JSON.stringify(base), before, "projection never changes its inputs");

const health = renderToStaticMarkup(createElement(SystemHealthPanel, {
  setup: { ...localSetup, localNetworkEnabled: false, aiApiKeyConfigured: true },
  data: { androidDevices: devices, backupPath: "/local/backups" }, syncStatus: webFailure,
  features: { android: true }, aiEnabled: true
}));
assert.match(health, /Web kullanılmıyor/);
assert.match(health, /Ağ sinyali bilinmiyor/);
assert.match(health, /Yerel ağ Companion/);
assert.match(health, /1 onaylı cihaz · 1 onay bekliyor/);
assert.doesNotMatch(health, /İnternet bağlantısı yok|aktif cihaz|Web sunucusuna erişilemiyor/);
assert.match(health, /Servis erişimi burada doğrulanmadı/);

const { buildDesktopNotifications } = app("app/notifications.ts");
const { defaultDashboardData } = app("app/bootstrap-defaults.ts");
const { BUSINESS_CAPABILITIES: C } = require("@yardimci-asistan/shared");
const staleFailure = { ...webFailure, enabled: true, lastError: "Web modülüne ulaşılamadı" };
for (const webAvailable of [true, false]) {
  const notifications = buildDesktopNotifications(defaultDashboardData, staleFailure, [C.NOTIFICATIONS], undefined, webAvailable);
  assert.equal(notifications.some(item => item.kind === "sync"), webAvailable, "local-only cannot retain stale Web notifications");
}

// Exercise the provider's real effect with native event stand-ins: no DOM/server/probe.
const listeners = new Map();
const navigator = { onLine: true };
let effect, signal;
const exports = {};
runInNewContext(compile(resolve("apps/desktop-app/src/app/network-signal.tsx")), {
  exports, navigator,
  window: {
    addEventListener: (name, listener) => { assert.equal(listeners.has(name), false); listeners.set(name, listener); },
    removeEventListener: (name, listener) => { assert.equal(listeners.get(name), listener); listeners.delete(name); }
  },
  require: name => name === "react" ? { ...require(name),
    useState: initial => { signal = initial(); return [signal, next => { signal = next; }]; },
    useEffect: callback => { effect = callback; }
  } : require(name)
});
exports.NetworkSignalProvider({ children: null });
const cleanup = effect();
assert.equal(signal, "onlineHint");
assert.equal(listeners.size, 2);
navigator.onLine = false;
listeners.get("offline")();
assert.equal(signal, "offlineHint");
navigator.onLine = true;
listeners.get("online")();
assert.equal(signal, "onlineHint");
cleanup();
assert.equal(listeners.size, 0, "both event listeners are removed on unmount");

const { classifyFailurePhase } = load(resolve("apps/desktop-app/electron/sync-network-policy.ts"));
assert.equal(classifyFailurePhase({ ok: false, message: "Web modülüne ulaşılamadı" }), "offline");
assert.equal(classifyFailurePhase({ ok: false, status: 401, message: "Web bağlantı anahtarı geçersiz" }), "error");
assert.equal(classifyFailurePhase({ ok: false, status: 503, message: "Web bağlantısı geçici olarak kapalı" }), "error");
assert.equal(classifyFailurePhase({ ok: false, message: "Web bağlantı anahtarı geçersiz" }), "error");
assert.equal(classifyFailurePhase({ ok: false, message: "HTTP yalnız localhost bağlantılarında kullanılabilir. İnternet ayarlarını kontrol edin." }), "error");

// Run the actual coordinator with an in-memory runtime and a failed Web adapter.
// No DB, listener, network request, real timer or external provider is involved.
const runtime = { ...defaultAutomaticSyncStatus, enabled: true, clientId: "connection-smoke" };
let initialTimer;
const coordinatorExports = {};
const log = { info() {}, error() {}, warn() {} };
class PublisherStub { resetCatalogSupport() {} }
const coordinatorDependencies = {
  "./desktop-logger": { desktopLog: log, createDiagnosticOperationId: () => "connection-smoke" },
  "./web-diagnostics": { safeWebTarget: () => "web.test", logWebFailure() {} },
  "./web-sync-ingress": { WebSyncIngress: class {} },
  "./sync-catalog-publisher": { SyncCatalogPublisher: PublisherStub },
  "./sync-outbox-publisher": { SyncOutboxPublisher: class {} },
  "./publication-source-service": { ensurePublicationSource: async () => ({ ok: false, message: "Web modülüne ulaşılamadı" }) },
  "./sync-network-policy": load(resolve("apps/desktop-app/electron/sync-network-policy.ts"))
};
runInNewContext(compile(resolve("apps/desktop-app/electron/sync-coordinator.ts")), {
  exports: coordinatorExports,
  require: name => coordinatorDependencies[name] ?? (name.startsWith(".") ? {} : require(name)),
  setTimeout: callback => { initialTimer = callback; return 1; }, clearTimeout() {},
  setInterval: () => 2, clearInterval() {}
});
const coordinator = new coordinatorExports.SyncCoordinator({
  database: {
    getSyncRuntimeStatus: () => ({ ...runtime }),
    getRestoreReconciliationStatus: () => null,
    setAutoSyncEnabled: enabled => { runtime.enabled = enabled; },
    recordSyncAttempt() {},
    recordAutomaticSyncFailure: message => { runtime.lastError = message; runtime.consecutiveFailures += 1; }
  },
  androidActions: { resume() {} },
  getSyncConfig: () => ({ baseUrl: setup.webModuleUrl, syncSecret: "connection-smoke-secret" }),
  onStatusChanged() {}, onDashboardChanged() {}
});
assert.equal(coordinator.setEnabled(false).phase, "disabled");
const manualFailure = await coordinator.runNow();
assert.equal(manualFailure.ok, false);
assert.equal(manualFailure.status.enabled, false);
assert.equal(manualFailure.status.phase, "offline", "manual Web failure is not masked by auto-sync off");
const manualFailureView = project({ ...base, setup: { ...setup, autoSyncEnabled: false }, syncStatus: manualFailure.status });
assert.equal(manualFailureView.webSyncStatus, "unreachable");
assert.equal(manualFailureView.manualWebSyncAllowed, true);
coordinator.start();
initialTimer();
assert.equal(coordinator.getStatus().phase, "offline", "passive no-op cannot erase the explicit Web result");
coordinator.stop();
console.log("connection-status-ok: saved Web/manual/transport, independent hints/LAN/device counts, indicator/health rendering, native event cleanup");
