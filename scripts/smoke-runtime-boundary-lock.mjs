import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";

// Execute the complete compiled production composition roots and registration
// modules. Only platform/operation dependencies are replaced; no source slicing
// or reimplemented registration wiring can hide a production no-op lock gate.
const require = createRequire(import.meta.url);
const root = resolve("apps/desktop-app/dist-electron");
const shared = require("@yardimci-asistan/shared");
const handlers = new Map(), events = new Map(), modules = new Map(), immediate = [];
const appEvents = new Map();
const calls = [];
let businessMessagingAuthority;
let businessMessagingDrain = () => Promise.resolve();
const durable = createTemporaryDesktopDatabase("sync-finalize-intent-");
durable.database.initialize();
const dashboard = { revision: 1, kbsOverview: { enabled: false }, hospitalityNotifications: [] };
const result = () => ({ ok: true, message: "fixture", dashboardData: dashboard });
const record = (name) => (..._args) => { calls.push(name); return result(); };
const read = (name, value) => () => { calls.push(name); return value; };
const setup = { setupRequired: true, servicePreferences: {}, webModuleUrl: "", syncSecret: "" };
const database = new Proxy({}, { get: (_target, key) => {
  if (key === "queueSyncJob") return (type) => { calls.push(`database.queueSyncJob:${type}`); durable.database.queueSyncJob(type); };
  if (key === "getPendingSyncJobs") return (...args) => durable.database.getPendingSyncJobs(...args);
  if (key === "databasePath" || key === "userDataPath" || key === "backupPath") return "/tmp/opencode/runtime-boundary-fixture";
  if (key === "getAppLockPasswordVerifier") return () => "";
  if (key === "getAppLockNotificationCount") return () => 0;
  if (key === "getEnabledBusinessCapabilities") return read("database.getEnabledBusinessCapabilities", Object.values(shared.BUSINESS_CAPABILITIES));
  if (key === "getSetupData") return read("database.getSetupData", setup);
  if (key === "getDashboardData") return read("database.getDashboardData", dashboard);
  if (key === "getSyncRuntimeStatus") return () => ({ clientId: "fixture" });
  if (key === "getReservationById") return read("database.getReservationById", { reservationType: "room", roomIds: ["room"], tableIds: [] });
  return record(`database.${String(key)}`);
} });
const app = {
  isPackaged: false, on: (event, action) => appEvents.set(event, action), getVersion: () => "fixture", getAppPath: () => root,
  getPath: () => "/tmp/opencode/runtime-boundary-fixture", setPath() {},
  requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() {},
  commandLine: { appendSwitch() {}, getSwitchValue: () => "" }
};
const electron = { app, BrowserWindow: { getAllWindows: () => [] }, powerMonitor: { on() {} },
  ipcMain: { handle: (channel, action) => { assert.ok(!handlers.has(channel), channel); handlers.set(channel, action); },
    on: (channel, action) => events.set(channel, action), removeHandler: (channel) => handlers.delete(channel) },
  shell: { openExternal: record("shell.openExternal") } };
const real = new Set([
  "main", "main-entry", "desktop-ipc-registry", "app-lock-service", "app-lock", "preload", "business-messaging/provider-error",
  "finance-ipc", "room-folio-ipc", "business-capability-ipc", "business-layout-ipc",
  "business-public-profile-ipc", "business-location-geocode-ipc", "google-reviews-settings-ipc",
  "kbs-settings-ipc", "kbs-webview-ipc", "room-media-ipc", "table-media-ipc",
  "commerce-ipc", "web-connection-ipc", "data-maintenance", "desktop-update-service"
]);
function stub(name) {
  return new Proxy({ __esModule: true }, { get: (target, key) => {
    if (key in target) return target[key];
    if (key === "then") return undefined;
    if (/^[A-Z]/.test(String(key))) return class {
      constructor(...args) {
        if (name === "business-messaging/service") businessMessagingAuthority = args[1];
        return new Proxy({}, { get: (_target, method) => {
        if (name === "business-messaging/service" && method === "drain") return () => businessMessagingDrain();
        if (method === "start" || method === "drain" || method === "suspendAndDrain") return () => Promise.resolve();
        if (method === "getStatus") return () => ({ enabled: false });
        return record(`${name}.${String(method)}`);
      } }); }
    };
    return record(`${name}.${String(key)}`);
  } });
}
function load(file) {
  file = file.replace(/\.js$/, "");
  if (modules.has(file)) return modules.get(file);
  const exports = {}; modules.set(file, exports);
  runInNewContext(readFileSync(`${file}.js`, "utf8"), {
    exports, __dirname: dirname(file), Buffer, URL, Error, fetch, console,
    process: { platform: process.platform, env: {}, argv: [], exit: () => assert.fail("unexpected exit") },
    setImmediate: (action) => immediate.push(action), setTimeout: () => ({ unref() {} }), clearTimeout,
    require: (name) => {
      if (name === "electron") return electron;
      if (name === "@yardimci-asistan/shared") return shared;
      if (name.startsWith("node:")) return require(name);
      if (!name.startsWith(".")) return stub(name);
      const dependency = resolve(dirname(file), name).replace(/\.js$/, "");
      const relative = dependency.slice(root.length + 1);
      if (relative === "database") return { DesktopDatabase: class { constructor() { return database; } } };
      if (relative === "desktop-logger") return { desktopLog: { info() {}, warn() {}, error() {} }, initializeDesktopLogging: () => null };
      if (relative === "desktop-startup-data") return { resolveRuntimeDataRoot: () => "/tmp/opencode/runtime-boundary-fixture", prepareRuntimeDataForStartup: async () => true };
      if (relative === "desktop-runtime") return { configureDesktopSessionRuntime() {}, createDesktopMainWindow() {}, createTrustedDesktopRendererUrlPredicate: () => () => true };
      if (relative === "desktop-database-compatibility") return { inspectDesktopDatabaseCompatibility: () => ({ state: "current" }) };
      if (relative === "data-paths") return { resolveDataRoot: () => "/tmp/opencode/runtime-boundary-fixture", resolveDatabasePath: () => "/tmp/opencode/runtime-boundary-fixture/db", resolvePendingMaintenanceMarkerPath: () => "/tmp/opencode/runtime-boundary-fixture/missing" };
      if (relative === "kbs-settings") return { getKbsSettings: () => ({ enabled: false }) };
      if (relative === "google-reviews-settings") return { getGoogleReviewsSettings: () => ({ publicationPending: false }) };
      if (relative === "business-capability-runtime") return { assertPersistedBusinessCapability: record("capability.assert"), hasPersistedBusinessCapability: () => true };
      if (relative.startsWith("ipc/") || real.has(relative)) {
        const actual = load(dependency);
        if (relative === "data-maintenance") return { ...actual, resolveProjectBackupPath: () => "/tmp/opencode/runtime-boundary-fixture", applyPendingDataMaintenanceAtStartup() {} };
        if (relative === "desktop-update-service") return { ...actual, applyPendingDesktopUpdateAtStartup: () => false, startAutomaticDesktopUpdateChecks() {} };
        return actual;
      }
      return stub(relative);
    }
  }, { filename: `${file}.js` });
  return exports;
}
load(resolve(root, "main-entry"));
// Drain real Promise-based startup, then the root's deferred registrations.
await new Promise(setImmediate);
for (const action of immediate) action();
assert.equal(handlers.size, 259, "all production invoke registrations must execute");
assert.ok(handlers.has("app:restartAfterProfileChange"), "sector restart must remain an unlock-gated IPC operation");
const invoke = (channel, ...args) => Promise.resolve().then(() => handlers.get(channel)({ sender: { getURL: () => "fixture" } }, ...args));
const lockFree = new Set(["appLock:getStatus", "appLock:lock", "appLock:unlock", "appLock:updatePassword",
  "appLock:resetWithWebSecurityKey", "diagnostics:writeRendererEvent", "sync:getStatus", "update:getStatus"]);
await invoke("appLock:lock");
assert.equal((await invoke("appLock:getStatus")).locked, true);
await invoke("sync:getStatus");
await invoke("update:getStatus");
for (const channel of handlers.keys()) {
  if (lockFree.has(channel)) continue;
  const before = calls.length;
  await assert.rejects(invoke(channel, {}), /Uygulama kilitli/, channel);
  assert.equal(calls.length, before, `${channel}: no operation/read/network dependency before session gate`);
}
const representatives = [
  ["finance:saveManualEntry", {}], ["roomFolio:addPayment", {}], ["customer:save", {}],
  ["reservation:updateStatus", { reservationId: "reservation", status: "approved" }],
  ["tableOrder:open", "table"], ["ai:testConnection", {}], ["report:generateAiComment", {}],
  ["roomFolio:collectPayment", { folioId: "folio" }],
  ["customer:checkoutStayWithSettlement", { stayId: "stay", roomId: "room", settleCurrent: true, previousFolioIds: [] }],
  ["reservation:assignRoom", { reservationId: "reservation", roomId: "room" }], ["commerce:sale:completeMarket", {}]
];
for (const [channel, input] of representatives) {
  await invoke("appLock:unlock", "");
  const before = calls.length;
  assert.equal((await invoke(channel, input)).ok, true, `${channel}: unlocked path`);
  assert.ok(calls.length > before, `${channel}: delegated when unlocked`);
}
// Execute the actual preload; lock after its status response, before invocation.
let bridge, beforeHandler;
runInNewContext(readFileSync(resolve(root, "preload.js"), "utf8"), { exports: {}, Error,
  require: () => ({ contextBridge: { exposeInMainWorld: (_key, value) => { bridge = value; } }, webFrame: {},
    ipcRenderer: { invoke: async (channel, ...args) => {
      if (channel === "appLock:getStatus") {
        const status = await invoke(channel);
        await invoke("appLock:lock");
        beforeHandler = calls.length; // Lock lifecycle cleanup is not a business invocation.
        return status;
      }
      return invoke(channel, ...args);
    } } }) });
for (const method of ["saveManualFinanceEntry", "addRoomFolioPayment", "collectRoomFolioPayment", "assignReservationRoom", "checkoutStayWithSettlement"]) {
  await invoke("appLock:unlock", "");
  beforeHandler = undefined;
  await assert.rejects(bridge[method]({}), /Uygulama kilitli/);
  assert.notEqual(beforeHandler, undefined, "actual preload must execute its preflight");
  assert.equal(calls.length, beforeHandler, "preflight→handler lock change must not reach operation");
}
await invoke("appLock:unlock", "");
await assert.rejects(bridge.commerce.completeMarketSale({}), /Uygulama kilitli/);
assert.equal(calls.length, beforeHandler, "market operation: no mutation across the preload/main race");
// One-way attachment must fail closed without throwing an uncaught main event error.
const beforeAttach = calls.length;
events.get("kbs:registerWebview")({ sender: { getURL: () => "fixture" } }, 1);
assert.equal(calls.length, beforeAttach);
console.log(`Production IPC lock: ${handlers.size - lockFree.size} protected invokes, real roots/session authority, unlocked delegation and preload TOCTOU passed.`);

// Execute production finalize wiring; only domain operations are fixtures above.
// The publication effect uses the real durable outbox, not a fake queue counter.
try {
  await invoke("appLock:unlock", "");
  const drain = () => {
    for (const job of durable.database.getPendingSyncJobs("9999")) durable.database.completeSyncJob(job.jobKey, job.sourceRevision);
  };
  const mutations = [
    ["customer:save", {}], ["reservation:saveManual", {}],
    ["dailyTask:save", { title: "task", taskType: "manual_pension" }],
    ["menu:saveCategory", { name: "menu" }], ["androidDevice:setActive", "phone", true], ["request:delete", "request"]
  ];
  for (const [channel, ...args] of mutations) {
    drain();
    assert.equal((await invoke(channel, ...args)).ok, true, channel);
    assert.ok(durable.database.getPendingSyncJobs().some(job => job.jobType === "android_snapshot"), `${channel}: successful finalize must create durable snapshot intent`);
  }
  // Actual composition must pass the central session/maintenance authority to single sends.
  businessMessagingAuthority.assertCanSubmit();
  await invoke("appLock:lock");
  assert.throws(() => businessMessagingAuthority.assertCanSubmit(), /Uygulama kilitli/);
  await invoke("appLock:unlock", "");
  businessMessagingAuthority.assertCanSubmit();
  let releaseSend, enteredDrain;
  const send = new Promise((resolve) => { releaseSend = resolve; });
  const entered = new Promise((resolve) => { enteredDrain = resolve; });
  businessMessagingDrain = () => { enteredDrain(); return send; };
  const main = modules.get(resolve(root, "main"));
  const barcodeSenders = [1, 2].map((id) => Object.assign(new EventEmitter(), { id }));
  const barcodeMode = (sender, enabled) => handlers.get("sync:setMarketBarcodeFastPull")({ sender }, enabled);
  for (const sender of barcodeSenders) {
    barcodeMode(sender, true);
    assert.equal(sender.listenerCount("destroyed"), 1);
  }
  let maintenanceFinished = false;
  const maintenance = main.suspendAutomaticSyncForMaintenance().then(() => { maintenanceFinished = true; });
  for (const sender of barcodeSenders) assert.equal(sender.listenerCount("destroyed"), 0, "actual maintenance wiring removes every fast-pull listener");
  assert.throws(() => businessMessagingAuthority.assertCanSubmit(), (error) => error.code === "session_unavailable");
  await entered;
  assert.equal(maintenanceFinished, false, "maintenance waits for begun single-message sends");
  releaseSend(); await maintenance;
  main.resumeAutomaticSyncAfterMaintenanceAbort();
  businessMessagingAuthority.assertCanSubmit();
  barcodeMode(barcodeSenders[0], true);
  assert.equal(barcodeSenders[0].listenerCount("destroyed"), 1, "maintenance clear permits re-enable");
  barcodeMode(barcodeSenders[0], false);
  assert.equal(barcodeSenders[0].listenerCount("destroyed"), 0);
  let releaseShutdownSend, enteredShutdownDrain;
  const shutdownSend = new Promise((resolve) => { releaseShutdownSend = resolve; });
  const shutdownEntered = new Promise((resolve) => { enteredShutdownDrain = resolve; });
  businessMessagingDrain = () => { enteredShutdownDrain(); return shutdownSend; };
  const beforeShutdown = calls.length;
  appEvents.get("before-quit")({ preventDefault() {} });
  assert.throws(() => businessMessagingAuthority.assertCanSubmit(), (error) => error.code === "session_unavailable");
  await shutdownEntered;
  assert.ok(!calls.slice(beforeShutdown).includes("database.close"), "shutdown keeps receipt database open while POST is pending");
  releaseShutdownSend(); await new Promise(setImmediate);
  assert.ok(calls.slice(beforeShutdown).includes("database.close"), "shutdown closes database after send drain");
} finally { durable.cleanup(); }
