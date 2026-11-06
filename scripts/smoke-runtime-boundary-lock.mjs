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
const pairingSession = { credential: "yald1.runtime-boundary-private-credential", desktopId: "fixture", deviceId: "phone-fixture", expiresAt: 1_900_000_000_000 };
const pairingInputs = [];
const pairingChannels = ["androidDevice:beginLocalPairing", "androidDevice:readLocalPairing", "androidDevice:cancelLocalPairing"];
let businessMessagingAuthority;
let businessMessagingDrain = () => Promise.resolve();
let androidIngress, androidIngressOptions, coordinatorOptions;
let menuGuardFixture = null;
let requestDocumentFixture = null;
const dealerApprovalInputs = [], openedDocuments = [];
const durable = createTemporaryDesktopDatabase("sync-finalize-intent-");
durable.database.initialize();
const dashboard = { revision: 1, kbsOverview: { enabled: false }, hospitalityNotifications: [] };
const result = () => ({ ok: true, message: "fixture", dashboardData: dashboard });
const record = (name) => (..._args) => { calls.push(name); return result(); };
const read = (name, value) => () => { calls.push(name); return value; };
const setup = { setupRequired: true, servicePreferences: {}, webModuleUrl: "", syncSecret: "" };
const database = new Proxy({}, { get: (_target, key) => {
  if (menuGuardFixture) {
    if (key === "getEnabledBusinessCapabilities") return () => menuGuardFixture.capabilities;
    if (key === "getPublishedMenu") return () => { menuGuardFixture.projections++; return { items: menuGuardFixture.items }; };
    if (key === "getMenuEntryMutationBaseline") return (id) => {
      menuGuardFixture.baselines++;
      const item = menuGuardFixture.items.find((entry) => entry.id === id);
      return item ? { stock_consumption_quantity: item.stock_consumption_quantity, hide_when_out_of_stock: item.hide_when_out_of_stock } : null;
    };
    if (key === "saveMenuProductEntry") return () => { menuGuardFixture.writes++; return result(); };
  }
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
  if (key === "getCustomerRequests") return (customerId) => { calls.push("database.getCustomerRequests"); return [{ id: "request-fixture", customer_id: customerId }]; };
  if (key === "approveDealerApplication") return (...args) => { calls.push("database.approveDealerApplication"); dealerApprovalInputs.push(args); return result(); };
  if (key === "getRequestById" && requestDocumentFixture) return read("database.getRequestById", requestDocumentFixture);
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
  shell: { openExternal: record("shell.openExternal"), openPath: async (path) => { calls.push("shell.openPath"); openedDocuments.push(path); return ""; } } };
const real = new Set([
  "main", "main-entry", "desktop-ipc-registry", "app-lock-service", "app-lock", "preload", "business-messaging/provider-error",
  "desktop-dictation-service", "desktop-dictation-contract", "sync-config",
  "request-document-store",
  "finance-ipc", "room-folio-ipc", "business-capability-ipc", "business-layout-ipc",
  "business-public-profile-ipc", "business-location-geocode-ipc", "google-reviews-settings-ipc",
  "kbs-settings-ipc", "kbs-webview-ipc", "room-media-ipc", "table-media-ipc",
  "commerce-ipc", "web-connection-ipc", "data-maintenance", "desktop-update-service"
]);
function stub(name) {
  return new Proxy({ __esModule: true }, { get: (target, key) => {
    if (key in target) return target[key];
    if (key === "then") return undefined;
    if (name === "local-companion-server" && key === "getLocalPairingEndpoint") {
      return (address, identity) => address?.protocol === "https" && identity?.spkiSha256
        ? `https://192.168.1.20:${address.port}` : "";
    }
    if (/^[A-Z]/.test(String(key))) return class {
      constructor(...args) {
        if (name === "business-messaging/service") businessMessagingAuthority = args[1];
        const instance = new Proxy({}, { get: (_target, method) => {
        if (name === "local-companion-pairing-service" && (method === "begin" || method === "read")) return (...inputs) => {
          calls.push(`${name}.${method}`);
          pairingInputs.push([method, ...inputs]);
          return pairingSession;
        };
        if (name === "local-companion-server" && method === "address") return { port: 47891, protocol: "https" };
        if (name === "local-companion-server" && method === "tlsIdentity") return { spkiSha256: "A".repeat(43), ipAddresses: ["192.168.1.20"] };
        if (name === "business-messaging/service" && method === "drain") return () => businessMessagingDrain();
        if (method === "start" || method === "drain" || method === "suspendAndDrain") return () => Promise.resolve();
        if (method === "getStatus") return () => ({ enabled: false });
        return record(`${name}.${String(method)}`);
        } });
        if (name === "android-action-sync-service") { androidIngress = instance; androidIngressOptions = args[0]; }
        if (name === "sync-coordinator") coordinatorOptions = args[0];
        return instance;
      }
    };
    return record(`${name}.${String(key)}`);
  } });
}
function load(file) {
  file = file.replace(/\.js$/, "");
  if (modules.has(file)) return modules.get(file);
  const exports = {}; modules.set(file, exports);
  runInNewContext(readFileSync(`${file}.js`, "utf8"), {
    exports, __dirname: dirname(file), Buffer, URL, Error, AbortController, fetch, console,
    process: { platform: process.platform, env: {}, argv: [], exit: () => assert.fail("unexpected exit") },
    setImmediate: (action) => immediate.push(action), setTimeout: () => ({ unref() {} }), clearTimeout,
    setInterval: () => ({ unref() {} }), clearInterval: () => {},
    require: (name) => {
      if (name === "electron") return electron;
      if (name === "@yardimci-asistan/shared") return shared;
      if (name === "node:os") return { ...require(name), networkInterfaces: () => ({
        eth0: [{ family: "IPv4", internal: false, address: "192.168.1.20" }]
      }) };
      if (name.startsWith("node:")) return require(name);
      if (!name.startsWith(".")) return stub(name);
      const dependency = resolve(dirname(file), name).replace(/\.js$/, "");
      const relative = dependency.slice(root.length + 1);
      if (relative === "database") return { DesktopDatabase: class { constructor() { return database; } } };
      if (relative === "commerce-benefits-engine" || relative === "document-output-management") return require(`${dependency}.js`);
      if (relative === "desktop-logger") return { desktopLog: { info() {}, warn() {}, error() {} }, initializeDesktopLogging: () => null };
      if (relative === "desktop-startup-data") return { resolveRuntimeDataRoot: () => "/tmp/opencode/runtime-boundary-fixture", prepareRuntimeDataForStartup: async () => true };
      if (relative === "desktop-runtime") return { configureDesktopSessionRuntime() {}, createDesktopMainWindow() {}, createTrustedDesktopRendererUrlPredicate: () => () => true };
      if (relative === "desktop-database-compatibility") return { inspectDesktopDatabaseCompatibility: () => ({ state: "current" }) };
      if (relative === "data-paths") return { resolveDataRoot: () => "/tmp/opencode/runtime-boundary-fixture", resolveDatabasePath: () => "/tmp/opencode/runtime-boundary-fixture/db", resolvePendingMaintenanceMarkerPath: () => "/tmp/opencode/runtime-boundary-fixture/missing" };
      if (relative === "kbs-settings") return { getKbsSettings: () => ({ enabled: false }) };
      if (relative === "google-reviews-settings") return { getGoogleReviewsSettings: () => ({ publicationPending: false }) };
      if (relative === "business-capability-runtime") return { assertPersistedBusinessCapability: record("capability.assert"), hasPersistedBusinessCapability: () => true };
      if (relative === "product-data-service") return new Proxy(stub(relative), { get: (target, key) => key === "prepareProductImageForSave"
        ? async () => { if (menuGuardFixture) { menuGuardFixture.preparations++; await menuGuardFixture.prepare?.(); } return undefined; }
        : target[key] });
      if (relative === "sync-request-menu-service") return {
        pullRequestsFromWeb: async (_database, afterSuccessfulPull) => { await afterSuccessfulPull(); return result(); },
        markRequestsSyncedOnWeb: record("sync-request-menu-service.markRequestsSyncedOnWeb"),
        pushMenuToWeb: record("sync-request-menu-service.pushMenuToWeb")
      };
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
const addedProtectedChannels = [
  ...["prepareSaleReceipt", "listReady", "printReady", "previewReady", "pickFormImage", "readFormImage", "saveProcessedFormImage", "getPrinters", "readPrinterBinding", "savePrinterBinding", "read", "saveRule", "readTemplate", "saveTemplate"].map(name => `documentOutput:${name}`),
  ...["get", "configure", "saveRule", "issueCoupon", "pointAccount", "adjustPoints", "expirePoints",
    "companionGrantStatus", "companionSpendStatus", "companionSpendGrant", "companionSpendRevoke",
    "companionDevices", "companionGrant", "companionRevoke"].map(name => `benefits:${name}`),
  ...["benefitsState", "previewBenefits", "fullRefundMarketPreview", "fullRefundMarket", "marketHistory"].map(name => `commerce:sale:${name}`),
  // Reviewed additions: window-owned cancellation and native-picker-only backup import.
  "ai:cancelTestConnection", "dataMaintenance:importBackupZip",
  "commerce:order:previewBenefits", "tableOrder:benefitsState", "tableOrder:previewBenefits", "webTraffic:snapshot",
  // Guarded additions: product save and translation queue controls.
  "commerce:product:saveDetails", "translation:pause", "translation:resume"
];
assert.equal(handlers.size, 296 + addedProtectedChannels.length, "all production invoke registrations must execute");
for (const channel of addedProtectedChannels) assert.ok(handlers.has(channel), `${channel}: protected registration must execute`);
for (const channel of ["androidDevice:listInstallDevices", "androidDevice:install", "androidDevice:provision"]) {
  assert.equal(handlers.has(channel), false, `${channel}: consumer ADB handler must stay retired`);
}
assert.ok(handlers.has("sync:pushAndroidSnapshot"), "ordinary Web publication must remain registered");
assert.ok(modules.has(resolve(root, "ipc/android-device-ipc")), "actual production Android device registration module must execute");
for (const channel of pairingChannels) {
  assert.ok(handlers.has(channel), `${channel}: production handler must be included in the locked invocation sweep`);
}
for (const action of ["list", "preview", "add", "remove", "setCover", "reorder"]) {
  assert.ok(handlers.has(`commerce:product:photos:${action}`), `Product photo IPC missing: ${action}`);
}
assert.ok(handlers.has("commerce:product:activate"), "product activation must be included in the production lock sweep");
for (const action of ["pick", "upload", "preview", "apply", "rows", "summary", "export", "report", "release"]) {
  assert.ok(handlers.has(`dataTransfer:${action}`), `dataTransfer:${action}: included in the production lock sweep`);
}
for (const action of ["list", "get"]) assert.ok(handlers.has(`customer:${action}`), `customer:${action}: included in the production lock sweep`);
for (const action of ["settings", "saveSettings", "get", "list", "save", "start", "job", "cancel", "pause", "resume"]) {
  assert.ok(handlers.has(`translation:${action}`), `translation:${action}: included in the production lock sweep`);
}
for (const [channel, module] of [
  ["sync:probeConnection", "web-connection-ipc"],
  ["marketingProviders:cancelInstagramOAuth", "ipc/marketing-provider-ipc"],
  ...["request:customerHistory", "request:approveDealer", "request:document"].map(channel => [channel, "ipc/request-ipc"])
]) {
  assert.ok(modules.has(resolve(root, module)), `${channel}: actual production registration module must execute`);
  assert.ok(handlers.has(channel), `${channel}: production handler must be included in the locked invocation sweep`);
}
assert.ok(handlers.has("sync:connectSource"), "explicit web publication ownership transfer must retain the production session lock gate");
assert.equal(coordinatorOptions.androidActions, androidIngress, "main composes the same ingress owner for automatic and manual sync");
assert.ok(handlers.has("app:restartAfterProfileChange"), "sector restart must remain an unlock-gated IPC operation");
const renderer = Object.assign(new EventEmitter(), { id: 42, getType: () => "window", getURL: () => "fixture", mainFrame: { url: "fixture" } });
const invoke = (channel, ...args) => Promise.resolve().then(() => handlers.get(channel)({ sender: renderer, senderFrame: renderer.mainFrame }, ...args));
const lockFree = new Set(["appLock:getStatus", "appLock:lock", "appLock:unlock", "appLock:updatePassword",
  "appLock:resetWithWebSecurityKey", "diagnostics:writeRendererEvent", "sync:getStatus", "update:getStatus",
  "dictation:getStatus", "dictation:cancel"]);
const benefitsResultChannels = new Set(["tableOrder:benefitsState", "tableOrder:previewBenefits", "commerce:sale:benefitsState", "commerce:sale:previewBenefits", "commerce:order:previewBenefits"]);
const documentResultChannels = new Set(addedProtectedChannels.filter(channel => channel.startsWith("documentOutput:")));
const managementResultChannels = new Set(addedProtectedChannels.filter(channel => channel.startsWith("benefits:")));
for (const channel of lockFree) assert.ok(handlers.has(channel), `${channel}: lock-free registration must execute`);
for (const module of ["ipc/document-output-ipc", "ipc/commerce-benefits-ipc", "ipc/table-order-ipc", "commerce-ipc"]) {
  assert.ok(modules.has(resolve(root, module)), `${module}: actual production registration module must execute`);
}
await invoke("appLock:lock");
assert.equal((await invoke("appLock:getStatus")).locked, true);
assert.equal(androidIngressOptions.isSuspended(), false, "session lock keeps the existing background sync authority");
await invoke("sync:getStatus");
await invoke("update:getStatus");
const beforeDictation = calls.length;
assert.equal((await invoke("dictation:getStatus")).available, false);
assert.equal((await invoke("dictation:transcribe", {})).ok, false, "Dictation returns a sanitized failure while locked");
assert.equal(await invoke("dictation:cancel", "dictation_lock_fixture"), true, "Lock must not prevent cancellation");
assert.equal(calls.length, beforeDictation, "Locked dictation must not read config or call transport");
for (const channel of pairingChannels) {
  const before = calls.length;
  await assert.rejects(invoke(channel, "phone-fixture"), error => {
    assert.match(error.message, /Uygulama kilitli/, `${channel}: trusted renderer must reach the real session gate`);
    assert.equal(String(error).includes(pairingSession.credential), false, `${channel}: locked rejection must not expose pairing credentials`);
    return true;
  });
  assert.equal(calls.length, before, `${channel}: locked mode must not read setup, begin/read a credential or cancel through IPC`);
}
for (const channel of handlers.keys()) {
  if (lockFree.has(channel) || pairingChannels.includes(channel)) continue;
  const before = calls.length;
  if (documentResultChannels.has(channel) || managementResultChannels.has(channel) || benefitsResultChannels.has(channel)) {
    const result = await invoke(channel, {});
    assert.equal(result.ok, false, `${channel}: locked operation fails closed`);
    assert.equal(result.code, documentResultChannels.has(channel) ? "DOCUMENT_SESSION_LOCKED" : "BENEFITS_SESSION_LOCKED", channel);
  } else if (channel === "commerce:sale:fullRefundMarketPreview" || channel === "commerce:sale:marketHistory") {
    await assert.rejects(invoke(channel, {}), error => error.code === "BENEFITS_SESSION_LOCKED", channel);
  } else if (channel.startsWith("dictation:")) assert.equal((await invoke(channel, {})).ok, false, `${channel}: locked dictation returns sanitized failure`);
  else await assert.rejects(invoke(channel, {}), /Uygulama kilitli/, channel);
  assert.equal(calls.length, before, `${channel}: no operation/read/network dependency before session gate`);
}
const representatives = [
  ["finance:saveManualEntry", {}], ["roomFolio:addPayment", {}], ["customer:save", {}],
  ["reservation:updateStatus", { reservationId: "reservation", status: "approved" }],
  ["tableOrder:open", "table"], ["ai:testConnection", {}, "ai-test-lock-fixture"], ["report:generateAiComment", {}],
  ["roomFolio:collectPayment", { folioId: "folio" }],
  ["customer:checkoutStayWithSettlement", { stayId: "stay", roomId: "room", settleCurrent: true, previousFolioIds: [] }],
  ["reservation:assignRoom", { reservationId: "reservation", roomId: "room" }], ["commerce:sale:completeMarket", {}]
];
for (const [channel, ...args] of representatives) {
  await invoke("appLock:unlock", "");
  const before = calls.length;
  assert.equal((await invoke(channel, ...args)).ok, true, `${channel}: unlocked path`);
  assert.ok(calls.length > before, `${channel}: delegated when unlocked`);
}
for (const [channel, method, args] of [
  ["androidDevice:beginLocalPairing", "begin", ["phone-fixture"]],
  ["androidDevice:readLocalPairing", "read", []],
  ["androidDevice:cancelLocalPairing", "cancel", []]
]) {
  const before = calls.length;
  const value = await invoke(channel, ...args);
  if (method !== "cancel") {
    assert.equal(value.credential, pairingSession.credential, `${channel}: unlocked trusted renderer receives the owner's session`);
    assert.equal(value.endpoint, "https://192.168.1.20:47891", `${channel}: production root supplies the authenticated LAN endpoint`);
    assert.equal(value.spkiSha256, "A".repeat(43), `${channel}: authenticated listener fingerprint is returned to trusted renderer`);
  } else assert.equal(value, undefined);
  const observed = calls.slice(before);
  assert.equal(observed[0], "database.getEnabledBusinessCapabilities", `${channel}: capability guard executes first`);
  assert.ok(observed.includes("database.getSetupData"), `${channel}: local network configuration checked`);
  assert.equal(observed.at(-1), `local-companion-pairing-service.${method}`, `${channel}: canonical pairing owner is called last`);
  if (method === "begin") assert.ok(observed.includes("local-companion-server.refreshTlsIdentity"), `${channel}: TLS SAN renewed before QR credentials`);
}
assert.deepEqual(pairingInputs, [["begin", "phone-fixture"], ["read"]], "pairing IPC preserves the device identity and canonical owner methods");
for (const channel of pairingChannels) {
  for (const senderFrame of [undefined, { url: "fixture" }]) {
    const before = calls.length;
    await assert.rejects(async () => handlers.get(channel)({ sender: renderer, senderFrame }, "phone-fixture"), /güvenilir masaüstü penceresinden/);
    assert.equal(calls.length, before, `${channel}: missing or child frame cannot reach pairing credentials`);
  }
}
const beforeHistory = calls.length;
assert.deepEqual(await invoke("request:customerHistory", "customer-fixture"), [{ id: "request-fixture", customer_id: "customer-fixture" }]);
assert.ok(calls.slice(beforeHistory).includes("database.getCustomerRequests"), "unlocked customer history delegates to its canonical reader");
const beforeApproval = calls.length;
assert.equal((await invoke("request:approveDealer", "request-fixture", "dealer_b")).ok, true);
assert.deepEqual(dealerApprovalInputs, [["request-fixture", "dealer_b"]], "approval preserves request identity and the owner's price-group choice");
assert.ok(calls.slice(beforeApproval).includes("database.approveDealerApplication"), "unlocked approval delegates to its transactional owner");
requestDocumentFixture = { request_type: "dealer_application", documents: [{ id: "a".repeat(32), mime: "application/pdf", size: 4, sha256: "b".repeat(64) }] };
try {
  const beforeDocument = calls.length;
  assert.equal(await invoke("request:document", "request-fixture", "a".repeat(32), "open"), "");
  assert.deepEqual(openedDocuments, ["/tmp/opencode/runtime-boundary-fixture/assets/request-documents/" + "a".repeat(32) + ".pdf"]);
  assert.ok(calls.slice(beforeDocument).includes("database.getRequestById"), "document open resolves the owning request");
  assert.ok(calls.slice(beforeDocument).includes("shell.openPath"), "unlocked document open reaches the platform boundary");
} finally { requestDocumentFixture = null; }
const beforeActivation = calls.length;
assert.equal((await invoke("commerce:product:activate", "product-fixture")).ok, true);
assert.ok(calls.slice(beforeActivation).includes("commerce-catalog-presentation-store.activateCatalogProduct"),
  "unlocked product activation delegates to its canonical writer");
for (const [channel, input, dependency] of [
  ["sync:probeConnection", { baseUrl: "https://fixture.invalid", syncSecret: "fixture-only-secret" }, "web-connection-test.testWebConnection"],
  ["marketingProviders:cancelInstagramOAuth", undefined, "marketing/instagram-oauth-service.cancelPending"]
]) {
  const before = calls.length;
  assert.equal((await invoke(channel, input)).ok, true, `${channel}: unlocked production handler delegates`);
  assert.deepEqual(calls.slice(before), [dependency], `${channel}: only its operation runs after the real session gate`);
}
const beforeManualAndroid = calls.filter((call) => call === "android-action-sync-service.processQueue").length;
assert.equal((await invoke("sync:pullRequests")).ok, true);
assert.equal(calls.filter((call) => call === "android-action-sync-service.processQueue").length, beforeManualAndroid + 1,
  "real manual IPC delegates after pull to the ingress owner injected into automatic sync");
// Exercise the real menu handler and guard through the production composition root.
const C = shared.BUSINESS_CAPABILITIES;
const menuInput = { id: "menu-entry", category_id: "category", product_id: "product", price_override: null,
  is_available: true, is_featured: false, allergens: [], tags: [], stock_consumption_quantity: 0.25,
  hide_when_out_of_stock: false, sort_order: 10 };
const menuFixture = (capabilities) => ({ capabilities, items: [{ id: menuInput.id, stock_consumption_quantity: 0.25, hide_when_out_of_stock: false }],
  writes: 0, preparations: 0, projections: 0, baselines: 0 });
try {
  menuGuardFixture = menuFixture([C.FOOD_MENU]);
  await assert.rejects(invoke("menu:saveEntry", { ...menuInput, stock_consumption_quantity: 1 }), /Stok alanları bu işletmede etkin değil\./);
  assert.equal(menuGuardFixture.writes, 0); assert.equal(menuGuardFixture.preparations, 0);
  assert.equal(menuGuardFixture.projections, 0, "mutation guard must not load the full menu projection");
  for (const product of [{ name: "Tracked" }, { name: "Tracked", trackInventory: true }]) {
    await assert.rejects(invoke("menu:saveEntry", { ...menuInput, id: undefined, product_id: undefined, stock_consumption_quantity: 1, product }), /Stok alanları bu işletmede etkin değil\./);
    assert.equal(menuGuardFixture.preparations, 0, "unauthorized stock creation is rejected before I/O");
  }
  for (const capabilities of [[C.FOOD_MENU], [C.FOOD_MENU, C.INVENTORY], [C.FOOD_MENU, C.QR_MENU]]) {
    menuGuardFixture = menuFixture(capabilities);
    await assert.rejects(invoke("menu:saveEntry", { ...menuInput, hide_when_out_of_stock: true }), /Stokta yokken QR menüden gizleme bu işletmede etkin değil\./);
    assert.equal(menuGuardFixture.writes, 0);
  }
  menuGuardFixture = menuFixture([C.FOOD_MENU]);
  assert.equal((await invoke("menu:saveEntry", menuInput)).ok, true, "unchanged stock fields need no Inventory permission");
  assert.equal(menuGuardFixture.baselines, 2, "existing entry baseline is checked on both sides of image preparation");
  assert.equal(menuGuardFixture.projections, 0);
  assert.equal((await invoke("menu:saveEntry", { ...menuInput, id: undefined, product_id: undefined, stock_consumption_quantity: 1, product: { name: "Untracked", trackInventory: false } })).ok, true);
  menuGuardFixture = menuFixture([C.FOOD_MENU, C.INVENTORY, C.QR_MENU]);
  assert.equal((await invoke("menu:saveEntry", { ...menuInput, stock_consumption_quantity: 2, hide_when_out_of_stock: true })).ok, true);
  for (const [withdraw, expected] of [
    [C.INVENTORY, /Stok alanları bu işletmede etkin değil\./],
    [C.QR_MENU, /Stokta yokken QR menüden gizleme bu işletmede etkin değil\./],
    [C.FOOD_MENU, /Menü yönetimi bu işletmede etkin değil\./],
    ["session", /Uygulama kilitli/]
  ]) {
    menuGuardFixture = menuFixture([C.FOOD_MENU, C.INVENTORY, C.QR_MENU]);
    let entered, release;
    const enteredImage = new Promise((resolve) => { entered = resolve; });
    const image = new Promise((resolve) => { release = resolve; });
    menuGuardFixture.prepare = () => { entered(); return image; };
    const pending = invoke("menu:saveEntry", { ...menuInput, id: undefined, product_id: undefined, stock_consumption_quantity: 2, hide_when_out_of_stock: true, product: { name: "Image product" } });
    await enteredImage;
    if (withdraw === "session") await invoke("appLock:lock");
    else menuGuardFixture.capabilities = menuGuardFixture.capabilities.filter((capability) => capability !== withdraw);
    const rejection = assert.rejects(pending, expected); release(); await rejection;
    assert.equal(menuGuardFixture.writes, 0, "late permission withdrawal cannot reach the mutation");
    await invoke("appLock:unlock", "");
  }
  menuGuardFixture = menuFixture([C.FOOD_MENU]);
  menuGuardFixture.items = [];
  assert.equal((await invoke("menu:saveEntry", { ...menuInput, id: "missing", stock_consumption_quantity: 1 })).ok, true, "missing baseline keeps existing default guard semantics; domain validates identity");
} finally { menuGuardFixture = null; }
// Execute the actual preload; lock after its status response, before invocation.
let bridge, beforeHandler;
runInNewContext(readFileSync(resolve(root, "preload.js"), "utf8"), { exports: {}, Error,
  require: () => ({ contextBridge: { exposeInMainWorld: (_key, value) => { bridge = value; } }, webFrame: {},
    ipcRenderer: { invoke: async (channel, ...args) => {
      if (channel === "appLock:getStatus") {
        const status = await invoke(channel);
        await invoke("appLock:lock");
        await modules.get(resolve(root, "main")).reconcileLocalCompanionRuntime();
        await modules.get(resolve(root, "main")).reconcileOptionalBackgroundServices();
        beforeHandler = calls.length; // Lock lifecycle cleanup is not a business invocation.
        return status;
      }
      return invoke(channel, ...args);
    } } }) });
await invoke("appLock:lock");
// Finish the lock transition's background-service lifecycle before measuring IPC effects.
await modules.get(resolve(root, "main")).reconcileLocalCompanionRuntime();
await modules.get(resolve(root, "main")).reconcileOptionalBackgroundServices();
for (const [method, args] of [
  ["beginLocalPairing", ["phone-fixture"]],
  ["readLocalPairing", []],
  ["cancelLocalPairing", []],
  ["getCustomerRequests", ["customer-fixture"]],
  ["approveDealerApplication", ["request-fixture", "dealer_b"]],
  ["requestDocument", ["request-fixture", "a".repeat(32), "open"]]
]) {
  const before = calls.length;
  await assert.rejects(bridge[method](...args), /Uygulama kilitli/);
  assert.deepEqual(calls.slice(before), [], `${method}: actual preload cannot bypass the main session gate`);
}
for (const method of ["saveManualFinanceEntry", "addRoomFolioPayment", "collectRoomFolioPayment", "assignReservationRoom", "checkoutStayWithSettlement"]) {
  await invoke("appLock:unlock", "");
  beforeHandler = undefined;
  await assert.rejects(bridge[method]({}), /Uygulama kilitli/);
  assert.notEqual(beforeHandler, undefined, "actual preload must execute its preflight");
  assert.deepEqual(calls.slice(beforeHandler), [], "preflight→handler lock change must not reach operation");
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
  assert.equal(androidIngressOptions.isSuspended(), true, "maintenance blocks new canonical ingress");
  for (const sender of barcodeSenders) assert.equal(sender.listenerCount("destroyed"), 0, "actual maintenance wiring removes every fast-pull listener");
  assert.throws(() => businessMessagingAuthority.assertCanSubmit(), (error) => error.code === "session_unavailable");
  await entered;
  assert.equal(maintenanceFinished, false, "maintenance waits for begun single-message sends");
  releaseSend(); await maintenance;
  main.resumeAutomaticSyncAfterMaintenanceAbort();
  assert.equal(androidIngressOptions.isSuspended(), false);
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
  assert.equal(androidIngressOptions.isSuspended(), true, "shutdown blocks new canonical ingress");
  assert.throws(() => businessMessagingAuthority.assertCanSubmit(), (error) => error.code === "session_unavailable");
  await shutdownEntered;
  assert.ok(!calls.slice(beforeShutdown).includes("database.close"), "shutdown keeps receipt database open while POST is pending");
  releaseShutdownSend(); await new Promise(setImmediate);
  assert.ok(calls.slice(beforeShutdown).includes("database.close"), "shutdown closes database after send drain");
} finally { durable.cleanup(); }
