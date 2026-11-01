import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { Readable } from "node:stream";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";
import {
  projectLocalAndroidSnapshotForDevice
} from "../apps/desktop-app/dist-electron/local-android-device-projection.js";
import {
  emptyAndroidMarketSnapshot
} from "../apps/desktop-app/dist-electron/market-android-snapshot.js";
import {
  LocalCompanionPairingService
} from "../apps/desktop-app/dist-electron/local-companion-pairing-service.js";
import {
  DesktopDatabase
} from "../apps/desktop-app/dist-electron/database.js";
import {
  buildLocalCompanionMdnsResponse
} from "../apps/desktop-app/dist-electron/local-companion-mdns.js";

const require = createRequire(import.meta.url);
const serverCompiledUrl = new URL("../apps/desktop-app/dist-electron/local-companion-server.js", import.meta.url);
const serverExports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../apps/desktop-app/electron/local-companion-server.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: serverExports, require: createRequire(serverCompiledUrl), Buffer, URL, process, setTimeout, clearTimeout });
const { LocalCompanionServer } = serverExports;
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const TOKEN = "yal_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function baseSnapshot() {
  return {
    business_capabilities: ["service.android", "core.customers", "accommodation.folio", "core.reports", "core.finance", "food_service.menu", "commerce.catalog"],
    local_network_enabled: true,
    summary: {
      pending_daily_tasks: 0,
      today_tasks: 0,
      available_rooms: 0,
      total_rooms: 0,
      available_tables: 0,
      occupied_tables: 0,
      bill_waiting_tables: 0,
      active_table_orders: 0,
      pending_reservations: 0,
      prepared_whatsapp_messages: 0,
      waiting_responses: 0,
      active_menu_categories: 0,
      available_menu_items: 0,
      customer_count: 1
    },
    daily_tasks: [],
    requests: [],
    customers: [{ id: "customer-1", full_name: "Test Customer" }],
    customer_room_stays: [{ id: "stay-1" }],
    room_folios: [{ id: "folio-1" }],
    reservations: [],
    rooms: [],
    tables: [],
    menu: { categories: [], items: [], updated_at: "" },
    admin_menu: { categories: [], items: [], updated_at: "" },
    menu_product_candidates: [{ product_id: "product-unlinked", name: "Existing product", unit: "l", sale_price: 12, currency: "TRY" }],
    deleted_request_ids: [],
    trackedStockItems: [],
    appliedStockImageHashes: [],
    table_orders: [],
    messages: [],
    androidPermissions: {
      "device-admin": {
        role: "admin",
        is_active: true,
        permissions: [
          "customer.manage",
          "finance.view",
          "room_folio.view",
          "menu.edit",
          "market.product.view"
        ]
      },
      "device-staff": {
        role: "staff",
        is_active: true,
        permissions: []
      },
      "device-other": {
        role: "admin",
        is_active: true,
        permissions: ["finance.view"]
      },
      "device-test": {
        role: "staff",
        is_active: true,
        permissions: []
      }
    },
    finance: {
      generated_at: "2026-09-20T00:00:00Z",
      currency: "TRY",
      today_income_minor: 1000,
      today_expense_minor: 100,
      today_net_minor: 900,
      outstanding_pension_minor: 300,
      recent_entries: []
    },
    reports: {},
    market: {
      ...emptyAndroidMarketSnapshot(),
      products: []
    },
    updated_at: "2026-09-20T00:00:00Z"
  };
}

function assertProjection() {
  const source = baseSnapshot();

  source.business_capabilities.push("service.ai");
  source.voice = { stt_available: true };
  source.androidPermissions["device-admin"].permissions.push("voice.dictation");
  const staff = projectLocalAndroidSnapshotForDevice(source, "device-staff");
  assert.equal(Object.keys(staff.androidPermissions).length, 1);
  assert.equal(staff.androidPermissions["device-staff"].role, "staff");
  assert.deepEqual(staff.voice, { stt_available: false });
  assert.deepEqual(staff.customers, []);
  const saleStaffSource = structuredClone(source);
  saleStaffSource.business_capabilities.push("commerce.sales", "retail.barcode");
  saleStaffSource.androidPermissions["device-staff"].permissions = [
    "market.product.view", "market.sale.complete", "customer.view"
  ];
  saleStaffSource.customers[0].phone = "PRIVATE-PHONE";
  saleStaffSource.customers[0].notes = "PRIVATE-NOTES";
  const saleStaff = projectLocalAndroidSnapshotForDevice(saleStaffSource, "device-staff");
  assert.equal(saleStaff.customers.length, 1);
  assert.equal(saleStaff.customers[0].id, "customer-1");
  assert.equal(saleStaff.customers[0].full_name, "Test Customer");
  assert.deepEqual(saleStaff.customers.map(c => ({ id: c.id, full_name: c.full_name })),
    [{ id: "customer-1", full_name: "Test Customer" }]);
  assert.equal(JSON.stringify(saleStaff.customers).includes("PRIVATE"), false);
  assert.equal(saleStaff.customers[0].phone, "");
  assert.equal(saleStaff.customers[0].notes, "");
  assert.deepEqual(saleStaff.customer_room_stays, []);
  const noCustomerRead = structuredClone(saleStaffSource);
  noCustomerRead.androidPermissions["device-staff"].permissions = ["market.product.view", "market.sale.complete"];
  assert.deepEqual(projectLocalAndroidSnapshotForDevice(noCustomerRead, "device-staff").customers, []);
  const noSale = structuredClone(saleStaffSource);
  noSale.androidPermissions["device-staff"].permissions = ["customer.view", "market.product.view"];
  assert.deepEqual(projectLocalAndroidSnapshotForDevice(noSale, "device-staff").customers, []);
  assert.deepEqual(staff.customer_room_stays, []);
  assert.deepEqual(staff.room_folios, []);
  assert.equal(staff.finance.today_income_minor, 0);
  assert.deepEqual(staff.reports, {});
  assert.deepEqual(staff.market.products, []);
  assert.deepEqual(staff.menu_product_candidates, []);

  const admin = projectLocalAndroidSnapshotForDevice(source, "device-admin");
  assert.equal(Object.keys(admin.androidPermissions).length, 1);
  assert.equal(admin.androidPermissions["device-other"], undefined);
  assert.deepEqual(admin.voice, { stt_available: true });
  assert.equal(admin.customers.length, 1);
  assert.equal(admin.customer_room_stays.length, 1);
  assert.equal(admin.room_folios.length, 1);
  assert.equal(admin.finance.today_income_minor, 1000);
  assert.deepEqual(admin.menu_product_candidates, source.menu_product_candidates);

  const unknown = projectLocalAndroidSnapshotForDevice(source, "device-unknown");
  assert.deepEqual(unknown.voice, { stt_available: false });
  assert.equal(unknown.androidPermissions["device-unknown"].is_active, false);
  assert.deepEqual(unknown.requests, []);
  assert.deepEqual(unknown.rooms, []);
  assert.deepEqual(unknown.market.products, []);
  assert.deepEqual(unknown.menu_product_candidates, []);
}

function createPairingTicket({
  syncSecret,
  desktopId,
  deviceId,
  nonce = "0123456789abcdef0123456789abcdef",
  issuedAt = Math.floor(Date.now() / 1000)
}) {
  const payload = {
    v: 1,
    desktop_id: desktopId,
    device_id: deviceId,
    iat: issuedAt,
    exp: issuedAt + 120,
    nonce
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", syncSecret).update(encoded, "utf8").digest("hex");
  return `yalp1.${encoded}.${signature}`;
}

async function assertPairingStore() {
  const root = mkdtempSync(join(tmpdir(), "yardimci-local-companion-"));
  const database = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: root,
    backupPath: join(root, "backups")
  });
  let raw;
  try {
    database.initialize();
    assert.equal(database.saveInitialSetup(createSmokeSetupInput({
      businessName: "Offline pairing", profileId: "pension_restaurant", phone: "", whatsapp: "",
      webModuleUrl: "", syncSecret: "", autoSyncEnabled: false,
      servicePreferences: { android: true, whatsapp: false },
      initialCounts: { rooms: 0, tables: 0 }, tableCategories: []
    })).ok, true);
    setBusinessCapability(database.databasePath, { capability: "service.android", enabled: true });
    raw = new DatabaseSync(database.databasePath);
    let desktopId = database.getSyncRuntimeStatus().clientId;
    let locked = false, enabled = true, now = 1000;
    const options = {
      desktopId: () => desktopId,
      isLocked: () => locked,
      androidEnabled: () => database.getEnabledBusinessCapabilities().includes("service.android"),
      localNetworkEnabled: () => enabled,
      monotonicNow: () => now
    };
    const pairing = new LocalCompanionPairingService(database, options);
    const input = { deviceId: "device-local-test", deviceName: "Local Test Telefonu", appVersion: "2.1.0", pairingTicket: "" };
    const devices = () => JSON.stringify(raw.prepare("SELECT * FROM android_devices ORDER BY device_id").all());
    const credentials = () => JSON.stringify(raw.prepare("SELECT * FROM android_local_credentials ORDER BY device_id").all());
    const unchanged = (attempt, code) => {
      const before = [devices(), credentials()];
      const result = attempt();
      assert.equal(result.ok, false);
      assert.equal(result.code, code);
      assert.deepEqual([devices(), credentials()], before, "rejected pair must not change device/credential rows");
    };
    const begin = () => {
      const value = pairing.begin(input.deviceId);
      assert.match(value.credential, /^yald1\.[a-f0-9]{64}$/);
      assert.equal(value.desktopId, desktopId);
      assert.equal(value.deviceId, input.deviceId);
      assert.ok(value.expiresAt <= Date.now() + 120_000);
      input.pairingTicket = value.credential;
      return value;
    };
    assert.equal(pairing.read(), null, "pairing is closed by default");
    unchanged(() => pairing.pair(input), "local_pairing_session_closed");
    assert.throws(() => pairing.begin("bad"));
    begin();
    unchanged(() => pairing.pair({ ...input, pairingTicket: "wrong" }), "local_pairing_credential_invalid");
    unchanged(() => pairing.pair({ ...input, deviceId: "device-other-test" }), "local_pairing_credential_invalid");
    assert.ok(pairing.read(), "fewer than five failures retain the bounded session");
    const old = begin();
    begin();
    assert.notEqual(old.credential, input.pairingTicket, "each explicit begin replaces the credential");
    unchanged(() => pairing.pair({ ...input, pairingTicket: old.credential }), "local_pairing_credential_invalid");
    pairing.cancel();
    unchanged(() => pairing.pair(input), "local_pairing_session_closed");
    begin(); now += 119_999;
    assert.ok(pairing.read());
    now += 1;
    unchanged(() => pairing.pair(input), "local_pairing_session_closed");
    begin(); desktopId += "-changed";
    unchanged(() => pairing.pair(input), "local_pairing_session_closed");
    begin();
    for (let i = 0; i < 5; i++) unchanged(() => pairing.pair({ ...input, pairingTicket: "wrong" }), "local_pairing_credential_invalid");
    assert.equal(pairing.read(), null);
    unchanged(() => pairing.pair(input), "local_pairing_session_closed");
    for (const gate of ["locked", "capability", "disabled"]) {
      begin();
      const toggle = value => {
        if (gate === "locked") locked = !value;
        if (gate === "capability") setBusinessCapability(database.databasePath, { capability: "service.android", enabled: value });
        if (gate === "disabled") enabled = value;
      };
      toggle(false);
      assert.throws(() => pairing.begin(input.deviceId));
      unchanged(() => pairing.pair(input), gate === "locked" ? "app_locked" : gate === "disabled" ? "local_network_disabled" : "android_capability_disabled");
      assert.equal(pairing.read(), null);
      toggle(true);
      unchanged(() => pairing.pair(input), "local_pairing_session_closed");
    }
    assert.equal(database.getSetupData().webModuleUrl, "");
    assert.equal(database.getSetupData().syncSecret, "");
    const session = begin();
    const first = pairing.pair(input);
    assert.equal(first.ok, true);
    assert.match(first.token, /^yal_[a-f0-9]{64}$/);
    assert.equal(first.approvalRequired, true);
    assert.equal(pairing.read(), null);
    assert.equal(database.authorizeAndroidLocalCredential(input.deviceId, first.token), true);
    assert.equal(database.authorizeAndroidLocalCredential("device-other-test", first.token), false);
    assert.equal(credentials().includes(first.token), false, "permanent token is hashed");
    assert.equal(credentials().includes(session.credential), false);
    assert.equal(devices().includes(session.credential), false);
    assert.equal(raw.prepare("SELECT token_hash FROM android_local_credentials WHERE device_id = ?").get(input.deviceId).token_hash.length, 64);
    const source = baseSnapshot();
    source.androidPermissions = database.getAndroidPermissionSnapshot();
    const pending = projectLocalAndroidSnapshotForDevice(source, input.deviceId);
    assert.equal(pending.androidPermissions[input.deviceId].is_active, false);
    assert.deepEqual(pending.customers, []);
    assert.equal(database.applyAndroidAction({ id: "pending-device-action", action_type: "room_update_status", device_id: input.deviceId, payload: { room_id: "missing", status: "available" } }).ok, false);
    await assertServerSecurity(database, pairing, input, first.token);
    unchanged(() => pairing.pair(input), "local_pairing_session_closed");
    begin();
    unchanged(() => pairing.pair({ ...input, pairingTicket: session.credential }), "local_pairing_credential_invalid");
    pairing.cancel();
    assert.equal(database.setAndroidDeviceActive(input.deviceId, true).ok, true);
    assert.equal(database.authorizeAndroidLocalCredential(input.deviceId, first.token), true);
    assert.equal(database.authorizeAndroidLocalCredential(input.deviceId, TOKEN), false);

    // Fresh unregistered Android can start without USB/ADB or manually entering device ID on desktop.
    const freshSession = pairing.begin();
    assert.equal(freshSession.deviceId, "");
    const freshId = "device-fresh-no-usb";
    const fresh = pairing.pair({ ...input, deviceId: freshId, pairingTicket: freshSession.credential });
    assert.equal(fresh.ok, true);
    assert.equal(fresh.approvalRequired, true, "fresh phone remains pending desktop approval");
    assert.equal(database.authorizeAndroidLocalCredential(freshId, fresh.token), true);
    assert.equal(database.getAndroidDevices().find(device => device.deviceId === freshId).isActive, false);
    unchanged(() => pairing.pair({ ...input, deviceId: "device-second-no-usb", pairingTicket: freshSession.credential }), "local_pairing_session_closed");

    // Hosting signatures never authorize LAN pairing, even during desktop consent.
    const ticket = createPairingTicket({ syncSecret: "ya-local-smoke-secret-123456", desktopId, deviceId: input.deviceId });
    begin();
    unchanged(() => pairing.pair({ ...input, pairingTicket: ticket }), "local_pairing_credential_invalid");
    const renewed = pairing.pair(input);
    assert.equal(renewed.ok, true);
    assert.equal(renewed.approvalRequired, false, "pairing preserves existing approval");
    assert.equal(database.authorizeAndroidLocalCredential(input.deviceId, first.token), false, "renewal replaces old token");
    assert.equal(database.revokeAndroidDevice(input.deviceId).ok, true);
    assert.equal(database.authorizeAndroidLocalCredential(input.deviceId, renewed.token), false);
    begin();
    unchanged(() => pairing.pair(input), "device_revoked");
  } finally {
    raw?.close();
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
}

async function assertPairingIpcSecurity() {
  const handlers = new Map();
  const module = { exports: {} };
  runInNewContext(readFileSync(new URL("../apps/desktop-app/dist-electron/ipc/android-device-ipc.js", import.meta.url), "utf8"), {
    exports: module.exports,
    require: name => name === "electron"
      ? { ipcMain: { handle: (name, fn) => handlers.set(name, fn) } } : require(name)
  });
  let locked = false, enabled = true, capability = true, secure = true;
  const calls = [];
  module.exports.registerAndroidDeviceIpcHandlers({
    getDatabase: () => ({ getSetupData: () => ({ localNetworkEnabled: enabled }) }),
    assertUnlocked: () => { if (locked) throw new Error("locked"); },
    assertCapability: () => { if (!capability) throw new Error("capability"); },
    isTrustedRendererUrl: url => url === "file:///desktop/index.html",
    prepareLocalPairing: async () => {},
    getLocalPairingEndpoint: () => `${secure ? "https" : "http"}://192.168.225.140:47831`,
    getLocalPairingSpkiSha256: () => secure ? "A".repeat(43) : "",
    getLocalPairingService: () => ({
      begin: id => { calls.push(["begin", id]); return { credential: "private" }; },
      read: () => { calls.push(["read"]); return null; },
      cancel: () => { calls.push(["cancel"]); }
    })
  });
  const frame = { url: "file:///desktop/index.html" };
  const event = { senderFrame: frame, sender: { mainFrame: frame } };
  secure = false;
  await assert.rejects(handlers.get("androidDevice:beginLocalPairing")(event), /local_secure_pairing_unavailable/);
  assert.deepEqual(calls, [["cancel"]], "HTTP listener must not open a pairing session or expose a QR");
  secure = true;
  for (const channel of ["beginLocalPairing", "readLocalPairing", "cancelLocalPairing"]) {
    const invoke = (eventInput = event) => handlers.get(`androidDevice:${channel}`)(eventInput, "device-test");
    await invoke();
    const count = calls.length;
    locked = true; await assert.rejects(async () => invoke(), /locked/); locked = false;
    capability = false; await assert.rejects(async () => invoke(), /capability/); capability = true;
    enabled = false; await assert.rejects(async () => invoke(), /Yerel/); enabled = true;
    await assert.rejects(async () => invoke({ ...event, senderFrame: { url: frame.url } }), /güvenilir/);
    await assert.rejects(async () => invoke({ ...event, senderFrame: null }), /güvenilir/);
    frame.url = "https://untrusted.invalid"; await assert.rejects(async () => invoke(), /güvenilir/); frame.url = "file:///desktop/index.html";
    assert.equal(calls.length, count, "IPC guards precede every session operation");
  }
}

async function assertServerSecurity(database, pairing, input, token) {
  let enabled = true, actions = 0;
  const logs = [];
  const module = { exports: {} };
  const compiled = new URL("../apps/desktop-app/dist-electron/local-companion-server.js", import.meta.url);
  const compiledRequire = createRequire(compiled);
  runInNewContext(readFileSync(compiled, "utf8"), {
    exports: module.exports, Buffer, URL,
    require: name => name === "./desktop-logger"
      ? { desktopLog: { error: value => logs.push(value), warn() {}, info() {} } }
      : compiledRequire(name)
  });
  const server = new module.exports.LocalCompanionServer({
    desktopId: () => database.getSyncRuntimeStatus().clientId,
    businessInfo: () => ({ displayName: "Fixture", phone: "", whatsapp: "" }),
    enabled: () => enabled,
    pair: value => pairing.pair(value),
    authorize: ({ deviceId, token }) => database.authorizeAndroidLocalCredential(deviceId, token),
    createSummary: deviceId => {
      const snapshot = baseSnapshot();
      snapshot.androidPermissions = database.getAndroidPermissionSnapshot();
      return projectLocalAndroidSnapshotForDevice(snapshot, deviceId);
    },
    applyAction: value => { actions++; return database.applyAndroidAction(value); },
    onStopped: () => pairing.cancel()
  });
  // Exercise the real HTTP request handler without binding a sandbox socket.
  const dispatch = async (path, { body = {}, headers = {}, address = "127.0.0.1", method = "POST", chunks } = {}) => {
    const request = chunks ?? Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
    Object.assign(request, { url: `/local/v1/${path}`, method, headers, socket: { remoteAddress: address } });
    let status, payload;
    const response = { headersSent: false, writeHead(code) { status = code; this.headersSent = true; }, end(data) { payload = data ? JSON.parse(data) : null; } };
    await server.handleRequest(request, response);
    return { status, payload };
  };
  const auth = { "x-ya-device-id": input.deviceId, "x-ya-local-token": token };
  const action = { id: "pending-http-action", action_type: "room_update_status", payload: { room_id: "missing", status: "available" } };
  for (const path of ["summary", "action"]) {
    assert.equal((await dispatch(path)).status, 401);
    assert.equal((await dispatch(path, { headers: { ...auth, "x-ya-local-token": TOKEN } })).status, 401);
    assert.equal((await dispatch(path, { headers: { ...auth, "x-ya-device-id": "another-device" } })).status, 401);
    assert.equal((await dispatch(path, { headers: auth, address: "8.8.8.8" })).status, 403);
    enabled = false;
    assert.equal((await dispatch(path, { headers: auth, body: action })).status, 403);
    enabled = true;
  }
  assert.equal(actions, 0, "rejected HTTP actions never reach the domain writer");
  const summary = await dispatch("summary", { headers: auth });
  assert.equal(summary.status, 200);
  assert.equal(summary.payload.approval_required, true);
  assert.deepEqual(Array.from(summary.payload.customers), []);
  assert.equal((await dispatch("action", { headers: auth, body: action })).payload.status, "failed", "pending approval cannot mutate");
  const before = actions;
  const slow = Readable.from((async function* () { enabled = false; yield Buffer.from(JSON.stringify(action)); })());
  assert.equal((await dispatch("action", { headers: auth, chunks: slow })).status, 403);
  assert.equal(actions, before, "lock/disable during body read cannot reach the writer");
  enabled = true;
  const session = pairing.begin("device-http-pair");
  const status = await dispatch("status", { method: "GET" });
  assert.equal(status.status, 200);
  for (const secret of [session.credential, token, "credential", "pairing_ticket", "device-http-pair"]) {
    assert.equal(JSON.stringify(status.payload).includes(secret), false, "public status contains no pairing session details");
  }
  const pairBody = { pairing_ticket: session.credential, device_id: "device-http-pair", device_name: "HTTP fixture", app_version: "2.1.0" };
  const wrong = await dispatch("pair", { body: { ...pairBody, pairing_ticket: "wrong" } });
  assert.equal(wrong.status, 401);
  assert.equal(database.getAndroidDevices().some(device => device.deviceId === "device-http-pair"), false);
  const concurrent = await Promise.all([dispatch("pair", { body: pairBody }), dispatch("pair", { body: pairBody })]);
  assert.deepEqual(concurrent.map(value => value.status).sort(), [200, 401], "only one concurrent request consumes the session");
  const paired = concurrent.find(value => value.status === 200);
  assert.equal(paired.status, 200);
  assert.equal(paired.payload.approval_required, true);
  assert.match(paired.payload.local_token, /^yal_[a-f0-9]{64}$/);
  assert.equal((await dispatch("pair", { body: pairBody })).status, 401);
  enabled = false;
  assert.equal((await dispatch("pair", { body: pairBody })).status, 403);
  enabled = true;
  await dispatch("pair", { body: `{"pairing_ticket":"${session.credential}", broken` });
  assert.equal(logs.length, 1);
  assert.equal(JSON.stringify(logs).includes(session.credential), false, "malformed JSON errors never log secret text");
  const revokedAuth = { "x-ya-device-id": "device-http-pair", "x-ya-local-token": paired.payload.local_token };
  const revokingBody = Readable.from((async function* () {
    assert.equal(database.revokeAndroidDevice("device-http-pair").ok, true);
    yield Buffer.from(JSON.stringify(action));
  })());
  const beforeRevokedAction = actions;
  assert.equal((await dispatch("action", { headers: revokedAuth, chunks: revokingBody })).status, 401);
  assert.equal(actions, beforeRevokedAction, "revoke during body read cannot reach the writer");
  for (const path of ["summary", "action"]) assert.equal((await dispatch(path, { headers: revokedAuth, body: action })).status, 401);
  pairing.begin("device-stop-test");
  await server.stop();
  assert.equal(pairing.read(), null, "stopping the server cancels pairing even without a listener");
}

async function assertServer() {
  let appliedAction = null;
  let grantEnabled = true;
  process.env.NODE_ENV = "test";
  const server = new LocalCompanionServer({
    testOnlyHttp: true,
    desktopId: () => "desktop-test-123",
    businessInfo: () => ({
      displayName: "Local Test İşletmesi",
      phone: "05550000000",
      whatsapp: "05550000000"
    }),
    createSummary: (deviceId) => {
      const source = baseSnapshot();
      source.business_capabilities.push("service.ai");
      source.voice = { stt_available: true };
      source.androidPermissions["device-test"].permissions.push("voice.dictation");
      return projectLocalAndroidSnapshotForDevice(source, deviceId);
    },
    applyAction: (action) => {
      appliedAction = action;
      return { ok: true, message: "Applied.", alreadyApplied: false };
    },
    authorize: ({ deviceId, token }) => deviceId === "device-test" && token === TOKEN,
    readBenefitsBalance: ({ deviceId, token, customerId, currency }) =>
      deviceId === "device-test" && token === TOKEN && customerId === "customer-1" && currency === "TRY" && grantEnabled
        ? { availableMinor: 123, generatedAtMs: 12345 } : null,
    enabled: () => true,
    pair: ({ pairingTicket, deviceId }) => pairingTicket === "pair-ticket" && deviceId === "device-pair"
      ? {
          ok: true,
          token: TOKEN,
          approvalRequired: true,
          message: "Paired."
        }
      : {
          ok: false,
          code: "local_pairing_ticket_invalid",
          message: "Invalid.",
          statusCode: 401
        }
  });

  const address = await server.start("127.0.0.1", 0);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const balanceRequest = (body, token = TOKEN) => fetch(`${base}/local/v1/benefits-balance`, {
      method: "POST", headers: { "content-type": "application/json", "x-ya-device-id": "device-test", "x-ya-local-token": token },
      body: JSON.stringify(body)
    });
    const input = { customerId: "customer-1", currency: "TRY" };
    const balance = await balanceRequest(input);
    assert.equal(balance.status, 200);
    assert.equal(balance.headers.get("cache-control"), "no-store");
    assert.deepEqual(await balance.json(), { availableMinor: 123, generatedAtMs: 12345 });
    for (const [body, token] of [[input, "wrong"], [input, ""], [{ ...input, customerId: "other" }, TOKEN]]) {
      const denied = await balanceRequest(body, token);
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get("cache-control"), "no-store");
      assert.deepEqual(await denied.json(), { code: "benefits_balance_denied" });
    }
    grantEnabled = false;
    const disabled = await balanceRequest(input);
    assert.equal(disabled.status, 403);
    assert.equal(disabled.headers.get("cache-control"), "no-store");
    grantEnabled = true;
    const status = await fetch(`${base}/local/v1/status`);
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.desktop_id, "desktop-test-123");
    assert.equal(statusBody.pairing_required, true);
    assert.equal(statusBody.local_network_enabled, true);

    const denied = await fetch(`${base}/local/v1/summary`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ya-device-id": "device-test",
        "x-ya-local-token": "wrong"
      },
      body: "{}"
    });
    assert.equal(denied.status, 401);

    const summary = await fetch(`${base}/local/v1/summary`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ya-device-id": "device-test",
        "x-ya-local-token": TOKEN
      },
      body: "{}"
    });
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.business.display_name, "Local Test İşletmesi");
    assert.equal(summaryBody.approval_required, false);
    assert.equal(summaryBody.business_capabilities.includes("service.android"), true);
    assert.deepEqual(summaryBody.voice, { stt_available: true });
    assert.equal(summaryBody.androidPermissions["device-test"].is_active, true);

    const beforeRevision = summaryBody.server_revision;
    const unchanged = await fetch(`${base}/local/v1/summary`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ya-device-id": "device-test",
        "x-ya-local-token": TOKEN
      },
      body: JSON.stringify({ known_server_revision: beforeRevision })
    });
    assert.equal(unchanged.status, 200);
    const unchangedBody = await unchanged.json();
    assert.equal(unchangedBody.not_modified, true);
    assert.equal(unchangedBody.server_revision, beforeRevision);
    assert.deepEqual(unchangedBody.voice, { stt_available: true });
    const action = await fetch(`${base}/local/v1/action`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ya-device-id": "device-test",
        "x-ya-local-token": TOKEN
      },
      body: JSON.stringify({
        id: "android_action_local_smoke",
        action_type: "room_update_status",
        payload: { room_id: "room-1", status: "available" }
      })
    });
    assert.equal(action.status, 200);
    const actionBody = await action.json();
    assert.equal(actionBody.status, "applied");
    assert.ok(actionBody.source_revision > beforeRevision);
    assert.equal(appliedAction.device_id, "device-test");

    const pair = await fetch(`${base}/local/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairing_ticket: "pair-ticket",
        device_id: "device-pair",
        device_name: "Pair Telefonu",
        app_version: "0.1.1"
      })
    });
    assert.equal(pair.status, 200);
    const pairBody = await pair.json();
    assert.equal(pairBody.ok, true);
    assert.equal(pairBody.local_token, TOKEN);
    assert.equal(pairBody.approval_required, true);
  } finally {
    await server.stop();
  }
}

function assertMdnsPacket() {
  const packet = buildLocalCompanionMdnsResponse({
    desktopId: "desktop-test-123",
    protocolVersion: 1,
    serviceType: "_yardimciasistan._tcp",
    port: 47831,
    addresses: ["192.168.1.20"]
  });
  const text = packet.toString("latin1");
  assert.ok(text.includes("_yardimciasistan"));
  assert.ok(text.includes("protocol=1"));
  assert.ok(text.includes("scheme=https"));
  assert.ok(text.includes("desktop_id=desktop-test-123"));
  assert.ok(packet.includes(Buffer.from([192, 168, 1, 20])));
  assert.equal(/yald1\.|yalp1\.|yal_|credential|pairing_ticket/.test(text), false);
}

assertProjection();
await assertPairingStore();
assertMdnsPacket();
await assertPairingIpcSecurity();
console.log("Local companion pairing/store/IPC security + projection + mDNS contracts passed.");
if (!process.argv.includes("--contracts-only")) {
  await assertServer();
  console.log("Local companion HTTP server smoke passed.");
}
