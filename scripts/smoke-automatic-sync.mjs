import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";
import { verifyAndroidActionSingleFlight, verifyAndroidProductImageIngress } from "./test-helpers/android-product-image-ingress.mjs";
import { activateFixtureSource, publicationEnvelope } from "./test-helpers/publication-protocol.mjs";
import assert from "node:assert/strict";
import { saveMenuProductFixture, fixtureProductId } from "./test-helpers/menu-product-fixture.mjs";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { BUSINESS_CAPABILITIES } = require("../packages/shared/dist/index.js");
const { ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS } = require("../packages/sync-core/dist/index.js");
const {
  SyncCoordinator,
  supportsAndroidDevicePermissionSync
} = require("../apps/desktop-app/dist-electron/sync-coordinator.js");

const syncSecret = "automatic-sync-secret-12345";
await verifyAndroidActionSingleFlight();
await verifyAndroidProductImageIngress();
const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-automatic-sync-"));
const webModuleRoot = join(tempRoot, "web-module");
const desktopDataRoot = join(tempRoot, "desktop-data");
cpSync(join(process.cwd(), "firm-template", "web-module"), webModuleRoot, { recursive: true });

for (const runtimeFile of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(webModuleRoot, "data", runtimeFile), { force: true });
}
const businessFile = join(webModuleRoot, "config", "business.json");
const businessConfig = JSON.parse(readFileSync(businessFile, "utf8"));
businessConfig.sync_secret = syncSecret;
writeFileSync(businessFile, `${JSON.stringify(businessConfig, null, 2)}\n`);

const aiPort = await getFreePort();
let mockAiAnswer = "Hazır rapor özeti güvenli biçimde yorumlandı.";
const mockAiRequests = [];
const aiServer = http.createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    mockAiRequests.push({
      authorization: String(request.headers.authorization ?? ""),
      body: JSON.parse(body || "{}")
    });
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      choices: [{ message: { content: mockAiAnswer } }]
    }));
  });
});
await new Promise((resolve, reject) => {
  aiServer.once("error", reject);
  aiServer.listen(aiPort, "127.0.0.1", resolve);
});
const aiSettingsFile = join(webModuleRoot, "config", "ai.local.php");
writeFileSync(aiSettingsFile, "<?php\nreturn ['enabled' => false];\n");

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", webModuleRoot], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: desktopDataRoot
});

try {
  await waitForUrl(`${baseUrl}/api/menu.php`);
  database.initialize();
  assert.equal(supportsAndroidDevicePermissionSync({
    features: ["android_device_sightings"]
  }), false);
  assert.equal(supportsAndroidDevicePermissionSync({
    features: ["android_device_sightings", "android_device_permissions"]
  }), true);
  const setupResult = database.saveInitialSetup({
    businessName: "Otomatik Senkron Smoke",
    profileId: "pension_restaurant",
    phone: "+905321234567",
    whatsapp: "+905321234567",
    email: "sync-smoke@example.test",
    address: "Test adresi",
    webModuleUrl: baseUrl,
    syncSecret,
    autoSyncEnabled: true,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "gpt-4o-mini",
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKey: "",
    clearAiApiKey: false,
    aiModelOptions: [],
    servicePreferences: { whatsapp: true, android: true },
  }, { mode: "keep" });
  assert.equal(setupResult.ok, true);
  seedSmokeBusinessLayout(database.databasePath, {
    roomCount: 2,
    tableCategories: [{ name: "Salon", tableCount: 2 }]
  });
  // Keep the business capability enabled while the hosted provider remains
  // disabled below; this exercises capability and provider gates separately.
  setBusinessCapability(database.databasePath, {
    capability: BUSINESS_CAPABILITIES.AI,
    enabled: true
  });

  database.upsertAndroidDeviceSightings([{
    device_id: "android-auto-smoke",
    device_name: "Smoke Personel Telefonu",
    app_version: "0.1.0-smoke",
    first_seen_at: "2026-08-11T12:00:00.000Z",
    last_seen_at: "2026-08-11T12:00:00.000Z"
  }]);
  const pendingStaffDevice = database.getAndroidDevices().find((device) => device.deviceId === "android-auto-smoke");
  assert.ok(pendingStaffDevice);
  assert.equal(pendingStaffDevice.isActive, false, "Yeni Android cihaz masaüstü onayı olmadan aktif başlamamalı");
  const staffApproval = database.setAndroidDeviceActive("android-auto-smoke", true);
  assert.equal(staffApproval.ok, true, staffApproval.message);

  const categoryResult = database.saveMenuCategory({
    name: "Otomatik Senkron Test",
    description: "Automatic sync smoke fixture",
    is_active: true,
    sort_order: 1
  });
  assert.equal(categoryResult.ok, true, categoryResult.message);

  const itemResult = saveMenuProductFixture(database, {
    category_id: categoryResult.savedId,
    name: "Senkron Stok Ürünü",
    description: "Automatic sync smoke fixture",
    price: 100,
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: [],
    tags: ["smoke"],
    stock_quantity: null,
    stock_min_quantity: null,
    stock_unit: "piece",
    stock_consumption_quantity: 1,
    hide_when_out_of_stock: false,
    stock_note: "",
    sort_order: 1
  });
  assert.equal(itemResult.ok, true, itemResult.message);

  const trackedMenuItemBefore = database.getDashboardData().menu.items.find((item) => item.id === itemResult.savedId);
  assert.ok(trackedMenuItemBefore);
  const trackedMenuSave = saveMenuProductFixture(database, {
    id: trackedMenuItemBefore.id,
    category_id: trackedMenuItemBefore.category_id,
    name: trackedMenuItemBefore.name,
    description: trackedMenuItemBefore.description,
    price: trackedMenuItemBefore.price,
    currency: trackedMenuItemBefore.currency,
    image_url: trackedMenuItemBefore.image_url,
    is_available: trackedMenuItemBefore.is_available,
    is_featured: trackedMenuItemBefore.is_featured,
    allergens: trackedMenuItemBefore.allergens,
    tags: trackedMenuItemBefore.tags,
    stock_quantity: 2,
    stock_min_quantity: 1,
    stock_unit: trackedMenuItemBefore.stock_unit,
    stock_consumption_quantity: trackedMenuItemBefore.stock_consumption_quantity,
    hide_when_out_of_stock: true,
    stock_note: "Otomatik senkron stok testi",
    sort_order: trackedMenuItemBefore.sort_order
  });
  assert.equal(trackedMenuSave.ok, true);
  const trackedMenuItemId = trackedMenuSave.savedId;
  const trackedProductId = fixtureProductId(database, trackedMenuItemId);

  await activateFixtureSource(baseUrl, syncSecret, database.getSyncRuntimeStatus().clientId);
  const bootstrapSnapshot = await syncApi({
    action: "publish_android_snapshot",
    client_id: database.getSyncRuntimeStatus().clientId,
    source_revision: 1,
    idempotency_key: "android-action-bootstrap-smoke-1",
    snapshot: createSnapshot(database)
  });
  assert.equal(bootstrapSnapshot.status, 200);

  const requestResponse = await postJson(`${baseUrl}/api/request.php`, {
    idempotency_key: "automatic-sync-request-1",
    request_type: "pension_reservation",
    customer_name: "Otomatik Web Misafiri",
    customer_phone: "0555 444 33 22",
    date_text: "20-22 Temmuz",
    start_date: "2026-07-20",
    end_date: "2026-07-22",
    guest_count: 2,
    adult_count: 2,
    child_count: 0,
    message: "Sessiz oda rica ediyoruz."
  }, false);
  assert.equal(requestResponse.status, 201);
  const requestResult = await requestResponse.json();

  const roomBefore = database.getDashboardData().rooms[0];
  assert.ok(roomBefore);
  const actionId = "android_auto_smoke_0001";
  const queuedAction = await syncApi({
    action: "enqueue_android_action",
    action_id: actionId,
    action_type: "room_status_update",
    device_id: "android-auto-smoke",
    device_name: "Smoke Personel Telefonu",
    app_version: "0.1.0-smoke",
    payload: {
      room_id: roomBefore.id,
      status: "cleaning",
      expected_updated_at: roomBefore.updatedAt
    }
  });
  assert.equal(queuedAction.status, 201);

  const statusEvents = [];
  let dashboardChangeCount = 0;
  const coordinator = new SyncCoordinator({
    database,
    getSyncConfig: () => ({ baseUrl, syncSecret }),
    createAndroidSnapshot: () => createSnapshot(database),
    onDashboardChanged: () => { dashboardChangeCount += 1; },
    onStatusChanged: (status) => { statusEvents.push(status); }
  });

  const firstCycle = await coordinator.runNow();
  assert.equal(firstCycle.ok, true, firstCycle.message);
  assert.equal(firstCycle.pulledRequests, 1);
  assert.equal(firstCycle.pulledActions, 1);
  assert.equal(firstCycle.appliedActions, 1);
  assert.equal(firstCycle.failedActions, 0);
  assert.equal(firstCycle.publishedJobs, 4, "menu, catalog, common account state and Android snapshot are acknowledged");
  assert.ok(dashboardChangeCount >= 1);
  assert.ok(statusEvents.some((status) => status.phase === "syncing"));
  assert.equal(statusEvents.at(-1)?.phase, "success");

  const dashboard = database.getDashboardData();
  assert.ok(dashboard.requests.some((request) => request.id === requestResult.request_id));
  assert.equal(dashboard.rooms.find((room) => room.id === roomBefore.id)?.status, "cleaning");
  const staffDevice = dashboard.androidDevices.find((device) => device.deviceId === "android-auto-smoke");
  assert.ok(staffDevice);
  assert.equal(staffDevice.deviceName, "Smoke Personel Telefonu");
  assert.equal(staffDevice.appVersion, "0.1.0-smoke");
  assert.equal(staffDevice.role, "staff");
  assert.equal(staffDevice.isActive, true);
  assert.deepEqual(staffDevice.permissionGroups, {
    ...ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS,
    service_orders: true,
    cashier: false,
    rooms_tasks: true,
    customer_reservation: false,
    market_operations: false
  });
  assert.equal(staffDevice.permissions.includes("table_order.open"), true);
  assert.equal(staffDevice.permissions.includes("room.update_status"), true);
  assert.equal(staffDevice.permissions.includes("menu.stock_view"), true);
  assert.equal(staffDevice.permissions.includes("menu.stock_update"), false);
  assert.equal(staffDevice.permissions.includes("customer.view"), false);
  assert.equal(staffDevice.permissions.includes("table_order.close_paid"), false);
  for (const group of ["commerce_orders_view", "commerce_orders_manage", "dealer_view", "shipment_view", "online_sales_view", "marketing_status_view"]) {
    assert.equal(staffDevice.permissionGroups[group], false, "Missing Companion groups must remain OFF during permission sync.");
  }
  const runtime = database.getSyncRuntimeStatus();
  assert.ok(runtime.requestCursor > 0);
  assert.equal(runtime.acknowledgedCursor, runtime.requestCursor);
  assert.ok(database.getPendingSyncJobs().every((job) => job.jobKey === "ai_settings"), "only unconfigured provider intent may remain");
  assert.equal(runtime.consecutiveFailures, 0);

  const menuResponse = await fetch(`${baseUrl}/api/menu.php`);
  assert.equal(menuResponse.status, 200);
  const hostedMenu = await menuResponse.json();
  assert.equal(hostedMenu.ok, true);
  assert.equal(hostedMenu.categories.length, dashboard.menu.categories.filter((category) => category.is_active).length);
  assert.equal(hostedMenu.items.find((item) => item.id === trackedMenuItemId)?.stock_quantity, 2);

  const androidSummary = await syncApi({
    action: "android_summary",
    device_id: "android-auto-smoke",
    limit: 200
  });
  assert.equal(androidSummary.status, 200);
  const androidData = await androidSummary.json();
  assert.ok(androidData.requests.some((request) => request.id === requestResult.request_id));
  assert.equal(androidData.rooms.find((room) => room.id === roomBefore.id)?.status, "cleaning");
  assert.deepEqual(androidData.customers, [], "Staff devices must not receive customer cards or identity fields.");
  assert.deepEqual(androidData.customer_room_stays, [], "Staff devices must not receive the customer-room archive.");
  assert.deepEqual(androidData.reports, [], "Staff devices must not receive report aggregates.");
  const staffCustomerCreateResponse = await enqueueAndroidAction(
    "android_customer_create_staff_hosting_0001",
    "customer_create",
    {
      full_name: "Personel Oluşturamaz",
      phone: "+905550000224",
      email: "",
      notes: "",
      tags: [],
      identity_type: "",
      identity_number: "",
      nationality: "",
      birth_date: "",
      gender: "",
      document_serial_number: "",
      document_expiry_date: "",
      birth_place: "",
      mother_name: "",
      father_name: "",
      issuing_authority: "",
      address: ""
    }
  );
  assert.equal(staffCustomerCreateResponse.status, 403);
  assert.equal((await staffCustomerCreateResponse.json()).code, "customer_management_permission_denied");
  const staffCustomerDeleteResponse = await enqueueAndroidAction(
    "android_customer_delete_staff_hosting_0001",
    "customer_delete",
    { customer_id: "customer_staff_must_not_delete" }
  );
  assert.equal(staffCustomerDeleteResponse.status, 403);
  assert.equal((await staffCustomerDeleteResponse.json()).code, "customer_management_permission_denied");
  const staffRoomAssignmentResponse = await enqueueAndroidAction(
    "android_room_assign_staff_hosting_0001",
    "customer_room_assign",
    {
      customer_id: "customer_staff_must_not_assign",
      room_id: "room_staff_must_not_assign",
      check_in_date: "2037-07-10",
      check_out_date: "2037-07-12",
      guest_count: 1,
      status: "planned",
      notes: ""
    }
  );
  assert.equal(staffRoomAssignmentResponse.status, 403);
  assert.equal((await staffRoomAssignmentResponse.json()).code, "customer_management_permission_denied");
  const staffReportAi = await postJson(`${baseUrl}/api/chat.php`, {
    report_mode: "summary",
    report_preset: "last7",
    device_id: "android-auto-smoke"
  }, true);
  assert.equal(staffReportAi.status, 403, "Staff report AI access must fail closed.");
  assert.equal((await staffReportAi.json()).message, "Bu cihazın raporlara erişim yetkisi yok.");
  assert.deepEqual(
    androidData.trackedStockItems.find((item) => item.product_id === trackedProductId),
    {
      product_id: trackedProductId,
      menu_entry_id: trackedMenuItemId,
      name: trackedMenuItemBefore.name,
      category: dashboard.menu.categories.find((category) => category.id === trackedMenuItemBefore.category_id)?.name,
      price: trackedMenuItemBefore.price,
      stock_quantity: 2,
      stock_min_quantity: 1,
      stock_unit: trackedMenuItemBefore.stock_unit,
      stock_consumption_quantity: trackedMenuItemBefore.stock_consumption_quantity,
      hide_when_out_of_stock: true,
      stock_status: "in_stock"
    }
  );
  assert.deepEqual(androidData.appliedStockImageHashes, []);
  assert.ok(androidData.server_revision > 0);

  const unchangedSummary = await syncApi({
    action: "android_summary",
    device_id: "android-auto-smoke",
    known_server_revision: androidData.server_revision
  });
  assert.equal(unchangedSummary.status, 200);
  assert.equal((await unchangedSummary.json()).not_modified, undefined, "Shared-secret summaries must not retain a device's old private cache.");
  const claim = await fetch(`${baseUrl}/api/android-device-token.php`, { method: "POST", headers: {
    "Content-Type": "application/json", "X-YA-Sync-Secret": syncSecret, "X-YA-Device-Id": "android-auto-smoke"
  }, body: "{}" });
  assert.equal(claim.status, 201);
  const deviceToken = (await claim.json()).device_token;
  const personalCurrent = await (await personalAndroidSummary(deviceToken)).json();
  const personalUnchanged = await (await personalAndroidSummary(deviceToken, { known_server_revision: personalCurrent.server_revision })).json();
  assert.equal(personalUnchanged.not_modified, true);

  const deletedHostedRequest = database.deleteRequest(requestResult.request_id);
  assert.equal(deletedHostedRequest.ok, true);
  assert.equal(database.getDeletedRequestIds().includes(requestResult.request_id), true);
  const deletionPublishCycle = await coordinator.runNow();
  assert.equal(deletionPublishCycle.ok, true, deletionPublishCycle.message);
  assert.ok(deletionPublishCycle.publishedJobs >= 1);
  const summaryAfterDeletion = await (await syncApi({
    action: "android_summary",
    device_id: "android-auto-smoke",
    limit: 200
  })).json();
  assert.equal(
    summaryAfterDeletion.requests.some((request) => request.id === requestResult.request_id),
    false,
    "A hosting web request deleted on desktop must not reappear in Android summary."
  );
  // Staff without menu.edit/delete receives a permission-gated empty admin_menu
  // (sync.php ya_sync_android_menu_for_permissions). Full menu remains in desktop and admin snapshots.
  assert.equal(summaryAfterDeletion.admin_menu.categories.length, 0);
  assert.deepEqual(summaryAfterDeletion.admin_menu.items, []);

  const duplicateAction = await syncApi({
    action: "enqueue_android_action",
    action_id: actionId,
    action_type: "room_status_update",
    device_id: "android-auto-smoke",
    payload: { room_id: roomBefore.id, status: "cleaning" }
  });
  assert.equal(duplicateAction.status, 200);
  assert.equal((await duplicateAction.json()).deduplicated, true);

  const sightingOnlySummary = await syncApi({
    action: "android_summary",
    device_id: "android-summary-only-smoke",
    device_name: "Yalnız Snapshot Telefonu",
    app_version: "0.1.0-snapshot"
  });
  assert.equal(sightingOnlySummary.status, 200);

  const secondCycle = await coordinator.runNow();
  assert.equal(secondCycle.ok, true, secondCycle.message);
  assert.equal(secondCycle.pulledRequests, 0);
  assert.equal(secondCycle.pulledActions, 0);
  assert.equal(secondCycle.publishedJobs, 1);
  const sightingOnlyDevice = database.getAndroidDevices().find((device) => device.deviceId === "android-summary-only-smoke");
  assert.ok(sightingOnlyDevice);
  assert.equal(sightingOnlyDevice.deviceName, "Yalnız Snapshot Telefonu");
  assert.equal(sightingOnlyDevice.role, "staff");
  assert.equal(sightingOnlyDevice.isActive, false, "Yalnız görülen yeni cihaz onay bekler durumda kalmalı");
  const sightingOnlyProfileResponse = await syncApi({
    action: "android_summary",
    device_id: "android-summary-only-smoke"
  });
  const sightingOnlyProfile = (await sightingOnlyProfileResponse.json()).androidPermissions["android-summary-only-smoke"];
  assert.equal(sightingOnlyProfile.role, "staff");
  assert.equal(sightingOnlyProfile.is_active, false);
  assert.equal(sightingOnlyProfile.permissions.includes("table_order.close_paid"), false);

  const table = database.getDashboardData().tables[0];
  const menuItem = database.getDashboardData().menu.items.find((item) => item.id === trackedMenuItemId);
  assert.ok(table);
  assert.ok(menuItem);

  const openActionId = "android_permission_open_0001";
  await assertQueued(await enqueueAndroidAction(openActionId, "table_order_open", {
    table_id: table.id,
    expected_table_updated_at: table.updatedAt
  }));
  const openCycle = await coordinator.runNow();
  assert.equal(openCycle.appliedActions, 1);
  assert.equal(openCycle.failedActions, 0);
  let order = database.getActiveTableOrder(table.id);
  assert.ok(order);

  const addActionId = "android_permission_add_0001";
  await assertQueued(await enqueueAndroidAction(addActionId, "table_order_add_item", {
    order_id: order.id,
    table_id: table.id,
    menu_entry_id: menuItem.id,
    quantity: 2,
    expected_order_updated_at: order.updatedAt
  }));
  const addCycle = await coordinator.runNow();
  assert.equal(addCycle.appliedActions, 1);
  assert.equal(addCycle.failedActions, 0);
  assert.equal(addCycle.publishedJobs, 2);
  order = database.getActiveTableOrder(table.id);
  assert.ok(order);
  assert.equal(order.itemCount, 2);
  assert.equal(database.getDashboardData().menu.items.find((item) => item.id === trackedMenuItemId)?.stock_quantity, 0);
  const outOfStockSummaryResponse = await syncApi({ action: "android_summary", device_id: "android-auto-smoke" });
  const outOfStockSummary = await outOfStockSummaryResponse.json();
  assert.equal(outOfStockSummary.trackedStockItems.find((item) => item.product_id === trackedProductId)?.stock_quantity, 0);
  assert.equal(outOfStockSummary.trackedStockItems.find((item) => item.product_id === trackedProductId)?.stock_status, "out_of_stock");
  const outOfStockMenu = await (await fetch(`${baseUrl}/api/menu.php`)).json();
  assert.equal(outOfStockMenu.items.some((item) => item.id === trackedMenuItemId), false);

  const forbiddenStockActionId = "android_permission_stock_staff_0001";
  const forbiddenStockResponse = await enqueueAndroidAction(forbiddenStockActionId, "menu_stock_add", {
    product_id: trackedProductId,
    quantity: 1,
    note: "Personel yetki testi"
  });
  assert.equal(forbiddenStockResponse.status, 403);
  assert.equal((await forbiddenStockResponse.json()).code, "android_action_permission_denied");
  assert.equal(database.getDashboardData().menu.items.find((item) => item.id === trackedMenuItemId)?.stock_quantity, 0);

  const forbiddenImageImportActionId = "android_permission_stock_image_staff_0001";
  const forbiddenImageImportResponse = await enqueueAndroidAction(forbiddenImageImportActionId, "menu_stock_image_import_apply", {
    import_id: "stock_import_staff_queue_0001",
    image_hash: "b".repeat(64),
    duplicate_warning_acknowledged: false,
    lines: [{
      product_id: trackedProductId,
      quantity: 2,
      raw_text: "2 adet personel yetki testi",
      confidence: "high"
    }]
  });
  assert.equal(forbiddenImageImportResponse.status, 403);
  assert.equal((await forbiddenImageImportResponse.json()).code, "android_action_permission_denied");
  assert.equal(database.getDashboardData().menu.items.find((item) => item.id === trackedMenuItemId)?.stock_quantity, 0);

  const paymentActionId = "android_permission_payment_0001";
  await assertQueued(await enqueueAndroidAction(paymentActionId, "table_order_set_payment_waiting", {
    order_id: order.id,
    table_id: table.id,
    expected_updated_at: order.updatedAt
  }));
  const paymentCycle = await coordinator.runNow();
  assert.equal(paymentCycle.appliedActions, 1);
  assert.equal(paymentCycle.failedActions, 0);
  order = database.getActiveTableOrder(table.id);
  assert.ok(order);
  assert.equal(order.status, "payment");

  const forbiddenCloseActionId = "android_permission_close_staff_0001";
  const forbiddenCloseResponse = await enqueueAndroidAction(forbiddenCloseActionId, "table_order_close_paid", {
    order_id: order.id,
    table_id: table.id,
    expected_updated_at: order.updatedAt
  });
  assert.equal(forbiddenCloseResponse.status, 403);
  assert.equal((await forbiddenCloseResponse.json()).code, "android_action_permission_denied");
  order = database.getActiveTableOrder(table.id);
  assert.ok(order);
  assert.equal(order.status, "payment");
  const failureDashboard = database.getDashboardData();
  assert.equal(failureDashboard.paymentWaitingTableOrders.some((candidate) => candidate.id === order.id), true);

  const cashierResult = database.setAndroidDevicePermissionGroups("android-auto-smoke", {
    service_orders: true,
    cashier: true,
    rooms_tasks: true,
    customer_reservation: false,
    market_operations: false
  });
  assert.equal(cashierResult.ok, true);
  const cashierProfilePublishCycle = await coordinator.runNow();
  assert.equal(cashierProfilePublishCycle.ok, true, cashierProfilePublishCycle.message);
  assert.equal(cashierProfilePublishCycle.publishedJobs, 1);
  const cashierSummaryResponse = await syncApi({ action: "android_summary", device_id: "android-auto-smoke" });
  const cashierSummary = await cashierSummaryResponse.json();
  assert.equal(cashierSummary.androidPermissions["android-auto-smoke"].role, "staff");
  assert.equal(cashierSummary.androidPermissions["android-auto-smoke"].permissions.includes("table_order.close_paid"), true);

  const cashierCloseActionId = "android_permission_close_cashier_0001";
  await assertQueued(await enqueueAndroidAction(cashierCloseActionId, "table_order_close_paid", {
    order_id: order.id,
    table_id: table.id,
    expected_updated_at: order.updatedAt
  }));
  const cashierCloseCycle = await coordinator.runNow();
  assert.equal(cashierCloseCycle.appliedActions, 1);
  assert.equal(cashierCloseCycle.failedActions, 0);
  assert.equal(database.getActiveTableOrder(table.id), null);

  const deletionTargetResult = database.createManualRequest({
    requestType: "general_info",
    customerName: "Android Silme Yetki Misafiri",
    customerPhone: "+905550000222",
    dateText: "",
    startDate: "",
    endDate: "",
    time: "",
    guestCount: 1,
    adultCount: 1,
    childCount: 0,
    message: "Android silme yetki smoke talebi.",
    priority: "normal"
  });
  assert.equal(deletionTargetResult.ok, true);
  const deletionTargetId = deletionTargetResult.savedId;
  const staffDeleteActionId = "android_request_delete_staff_0001";
  const staffDeleteResponse = await enqueueAndroidAction(staffDeleteActionId, "customer_request_delete", {
    request_id: deletionTargetId
  });
  assert.equal(staffDeleteResponse.status, 403);
  assert.equal((await staffDeleteResponse.json()).code, "android_action_permission_denied");
  assert.equal(database.getDashboardData().requests.some((request) => request.id === deletionTargetId), true);

  const managedCustomerResult = database.saveCustomer({
    fullName: "Android Gizlilik Müşterisi",
    phone: "+905550000223",
    email: "android-gizlilik@example.test",
    notes: "Yalnız yönetici snapshot testi",
    tags: ["android", "gizlilik"],
    identityType: "passport",
    identityNumber: "PAUTO12345",
    nationality: "T.C.",
    birthDate: "1991-06-15",
    gender: "female",
    documentSerialNumber: "AUTO12345",
    documentExpiryDate: "2031-06-15",
    birthPlace: "İzmir",
    motherName: "",
    fatherName: "",
    issuingAuthority: "",
    address: ""
  });
  assert.equal(managedCustomerResult.ok, true, managedCustomerResult.message);
  const managedRoom = database.getDashboardData().rooms.find(
    (room) => room.id !== roomBefore.id && room.isActive && room.status === "available"
  );
  assert.ok(managedRoom);
  const managedStayResult = database.assignCustomerToRoom({
    customerId: managedCustomerResult.savedId,
    roomId: managedRoom.id,
    checkInDate: "2037-07-10",
    checkOutDate: "2037-07-12",
    guestCount: 1,
    notes: "Yönetici snapshot konaklaması",
    status: "planned"
  });
  assert.equal(managedStayResult.ok, true, managedStayResult.message);

  const promoteResult = database.setAndroidDeviceRole("android-auto-smoke", "admin");
  assert.equal(promoteResult.ok, true);
  const adminProfilePublishCycle = await coordinator.runNow();
  assert.equal(adminProfilePublishCycle.ok, true, adminProfilePublishCycle.message);
  assert.equal(adminProfilePublishCycle.publishedJobs, 2);
  const adminSummaryResponse = await syncApi({ action: "android_summary", device_id: "android-auto-smoke" });
  const adminSummary = await adminSummaryResponse.json();
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].role, "admin");
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("table_order.close_paid"), true);
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("request.delete"), true);
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("customer.delete"), true);
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("customer.manage"), true);
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("room.assign_customer"), true);
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("menu.delete"), true);
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("message.delete"), true);
  const managedCustomerSnapshot = adminSummary.customers.find((customer) => customer.id === managedCustomerResult.savedId);
  assert.ok(managedCustomerSnapshot);
  // Hosted Android snapshots redact identity/document numbers for all roles
  // (sync.php ya_sync_sanitize_android_customers, D-042 privacy). Canonical desktop retains them.
  assert.equal(managedCustomerSnapshot.identity_number, "");
  assert.equal(managedCustomerSnapshot.document_serial_number, "");
  assert.equal(database.getDashboardData().customers.find((customer) => customer.id === managedCustomerResult.savedId)?.identityNumber, "PAUTO12345");
  const managedStaySnapshot = adminSummary.customer_room_stays.find((stay) => stay.id === managedStayResult.savedId);
  assert.ok(managedStaySnapshot);
  assert.equal(managedStaySnapshot.customer_id, managedCustomerResult.savedId);
  assert.equal(managedStaySnapshot.room_id, managedRoom.id);
  const adminCustomerCreateActionId = "android_customer_create_admin_hosting_0001";
  await assertQueued(await enqueueAndroidAction(adminCustomerCreateActionId, "customer_create", {
    full_name: "Android Hosting Yönetici",
    phone: "+905550000225",
    email: "",
    notes: "Hosting action smoke",
    tags: ["android"],
    identity_type: "passport",
    identity_number: "PHOST12345",
    nationality: "T.C.",
    birth_date: "",
    gender: "",
    document_serial_number: "",
    document_expiry_date: "",
    birth_place: "",
    mother_name: "",
    father_name: "",
    issuing_authority: "",
    address: ""
  }));
  const adminCustomerCreateCycle = await coordinator.runNow();
  assert.equal(adminCustomerCreateCycle.appliedActions, 1);
  assert.equal(adminCustomerCreateCycle.failedActions, 0);
  assert.equal(
    database.getDashboardData().customers.some((customer) => customer.identityNumber === "PHOST12345"),
    true
  );
  assert.deepEqual(
    Object.keys(adminSummary.reports).sort(),
    ["last30", "last7", "today", "yesterday"],
    "Admin devices receive only the four compact report presets."
  );

  const disabledAdminReportAi = await postJson(`${baseUrl}/api/chat.php`, {
    report_mode: "summary",
    report_preset: "last7",
    device_id: "android-auto-smoke"
  }, true);
  assert.equal(disabledAdminReportAi.status, 503);
  assert.equal(
    (await disabledAdminReportAi.json()).message,
    "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı."
  );

  writeFileSync(aiSettingsFile, `<?php
return [
  'enabled' => true,
  'provider' => 'openai_compatible',
  'service' => 'custom',
  'base_url' => 'http://127.0.0.1:${aiPort}/v1',
  'model' => 'report-smoke-model',
  'api_key' => 'server-only-report-smoke-key',
  'timeout_seconds' => 5
];
`);
  const localizedRevenue = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(adminSummary.reports.last7.summary.restaurant_revenue);
  mockAiAnswer = `Restoran cirosu ₺${localizedRevenue}.`;
  const adminReportAi = await postJson(`${baseUrl}/api/chat.php`, {
    report_mode: "summary",
    report_preset: "last7",
    device_id: "android-auto-smoke",
    report: { summary: { restaurant_revenue: 987654 } }
  }, true);
  assert.equal(adminReportAi.status, 200);
  assert.equal((await adminReportAi.json()).answer, mockAiAnswer);
  const providerRequest = mockAiRequests.at(-1);
  assert.ok(providerRequest);
  assert.equal(providerRequest.authorization, "Bearer server-only-report-smoke-key");
  const providerReport = JSON.parse(providerRequest.body.messages.at(-1).content);
  assert.deepEqual(providerReport, adminSummary.reports.last7, "The server must ignore client-supplied report numbers.");
  assert.equal(JSON.stringify(providerReport).includes("Otomatik Web Misafiri"), false);
  assert.equal(JSON.stringify(providerReport).includes("0555 444 33 22"), false);

  mockAiAnswer = "Raporda 987654 kayıt var.";
  const fabricatedAdminReportAi = await postJson(`${baseUrl}/api/chat.php`, {
    report_mode: "summary",
    report_preset: "last7",
    device_id: "android-auto-smoke"
  }, true);
  assert.equal(fabricatedAdminReportAi.status, 502);
  assert.equal(
    (await fabricatedAdminReportAi.json()).message,
    "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı."
  );
  mockAiAnswer = "Hazır rapor özeti güvenli biçimde yorumlandı.";

  const adminDeleteActionId = "android_request_delete_admin_0001";
  await assertQueued(await enqueueAndroidAction(adminDeleteActionId, "customer_request_delete", {
    request_id: deletionTargetId
  }));
  const adminDeleteCycle = await coordinator.runNow();
  assert.equal(adminDeleteCycle.appliedActions, 1);
  assert.equal(adminDeleteCycle.failedActions, 0);
  assert.equal(database.getDashboardData().requests.some((request) => request.id === deletionTargetId), false);
  assert.equal(database.getDeletedRequestIds().includes(deletionTargetId), true);

  const adminStockActionId = "android_permission_stock_admin_0001";
  await assertQueued(await enqueueAndroidAction(adminStockActionId, "menu_stock_add", {
    product_id: trackedProductId,
    quantity: 5,
    note: "Yönetici stok ekleme testi"
  }));
  const adminStockCycle = await coordinator.runNow();
  assert.equal(adminStockCycle.appliedActions, 1);
  assert.equal(adminStockCycle.failedActions, 0);
  assert.equal(adminStockCycle.publishedJobs, 2);
  assert.equal(database.getDashboardData().menu.items.find((item) => item.id === trackedMenuItemId)?.stock_quantity, 5);
  const replenishedSummary = await (await syncApi({ action: "android_summary", device_id: "android-auto-smoke" })).json();
  assert.equal(replenishedSummary.trackedStockItems.find((item) => item.product_id === trackedProductId)?.stock_quantity, 5);
  assert.equal(replenishedSummary.trackedStockItems.find((item) => item.product_id === trackedProductId)?.stock_status, "in_stock");
  const replenishedMenu = await (await fetch(`${baseUrl}/api/menu.php`)).json();
  assert.equal(replenishedMenu.items.some((item) => item.id === trackedMenuItemId), true);

  const imageImportHash = "a".repeat(64);
  const imageImportActionId = "android_stock_image_admin_0001";
  await assertQueued(await enqueueAndroidAction(imageImportActionId, "menu_stock_image_import_apply", {
    import_id: "stock_import_admin_queue_0001",
    image_hash: imageImportHash,
    duplicate_warning_acknowledged: false,
    lines: [{
      product_id: trackedProductId,
      quantity: 3,
      raw_text: "3 adet yönetici görsel stok testi",
      confidence: "high"
    }]
  }));
  const imageImportCycle = await coordinator.runNow();
  assert.equal(imageImportCycle.appliedActions, 1);
  assert.equal(imageImportCycle.failedActions, 0);
  assert.equal(imageImportCycle.publishedJobs, 2);
  assert.equal(database.getDashboardData().menu.items.find((item) => item.id === trackedMenuItemId)?.stock_quantity, 8);
  const imageImportSummary = await (await syncApi({ action: "android_summary", device_id: "android-auto-smoke" })).json();
  assert.equal(imageImportSummary.appliedStockImageHashes.includes(imageImportHash), true);
  assert.equal(imageImportSummary.trackedStockItems.find((item) => item.product_id === trackedProductId)?.stock_quantity, 8);

  const invalidImageImportActionId = "android_stock_image_atomic_0001";
  await assertQueued(await enqueueAndroidAction(invalidImageImportActionId, "menu_stock_image_import_apply", {
    import_id: "stock_import_admin_atomic_0001",
    image_hash: "c".repeat(64),
    duplicate_warning_acknowledged: false,
    lines: [
      {
        product_id: trackedProductId,
        quantity: 4,
        raw_text: "4 adet geçerli satır",
        confidence: "high"
      },
      {
        product_id: "invented_untracked_product",
        quantity: 1,
        raw_text: "1 adet geçersiz satır",
        confidence: "low"
      }
    ]
  }));
  const invalidImageImportCycle = await coordinator.runNow();
  assert.equal(invalidImageImportCycle.appliedActions, 0);
  assert.equal(invalidImageImportCycle.failedActions, 1);
  assert.equal(database.getDashboardData().menu.items.find((item) => item.id === trackedMenuItemId)?.stock_quantity, 8);
  assert.match((await getAndroidAction(invalidImageImportActionId)).error_message, /stok takipli/i);

  const adminOrderResult = database.openTableOrder(table.id);
  assert.equal(adminOrderResult.ok, true);
  order = database.getActiveTableOrder(table.id);
  assert.ok(order);

  const adminCloseActionId = "android_permission_close_admin_0001";
  await assertQueued(await enqueueAndroidAction(adminCloseActionId, "table_order_close_paid", {
    order_id: order.id,
    table_id: table.id,
    expected_updated_at: order.updatedAt
  }));
  const adminCloseCycle = await coordinator.runNow();
  assert.equal(adminCloseCycle.appliedActions, 1);
  assert.equal(adminCloseCycle.failedActions, 0);
  assert.equal(database.getActiveTableOrder(table.id), null);
  assert.equal(database.listTableOrders().find((candidate) => candidate.id === order.id)?.status, "paid");

  const deactivateResult = database.setAndroidDeviceActive("android-auto-smoke", false);
  assert.equal(deactivateResult.ok, true);
  const roomBeforeInactiveAction = database.getDashboardData().rooms[1] ?? database.getDashboardData().rooms[0];
  const inactiveActionId = "android_permission_inactive_0001";
  await assertQueued(await enqueueAndroidAction(inactiveActionId, "room_status_update", {
    room_id: roomBeforeInactiveAction.id,
    status: roomBeforeInactiveAction.status === "maintenance" ? "cleaning" : "maintenance",
    expected_updated_at: roomBeforeInactiveAction.updatedAt
  }));
  const inactiveCycle = await coordinator.runNow();
  assert.equal(inactiveCycle.appliedActions, 0);
  assert.equal(inactiveCycle.failedActions, 1);
  assert.equal(database.getDashboardData().rooms.find((room) => room.id === roomBeforeInactiveAction.id)?.status, roomBeforeInactiveAction.status);
  const inactiveSummaryResponse = await syncApi({ action: "android_summary", device_id: "android-auto-smoke" });
  assert.equal(inactiveSummaryResponse.status, 200);
  const inactiveSummary = await inactiveSummaryResponse.json();
  assert.equal(inactiveSummary.approval_required, true);
  assert.deepEqual(inactiveSummary.actions, [], "Pasif cihaz eski action sonuçlarını görmemeli.");
  const pendingAfterInactiveResponse = await syncApi({ action: "pull_android_actions", limit: 50 });
  assert.equal(pendingAfterInactiveResponse.status, 200);
  const pendingAfterInactive = await pendingAfterInactiveResponse.json();
  assert.equal(pendingAfterInactive.actions.some((candidate) => candidate.id === inactiveActionId), false);
  const reactivateResult = database.setAndroidDeviceActive("android-auto-smoke", true);
  assert.equal(reactivateResult.ok, true);
  await coordinator.runNow();
  const inactiveAction = await getAndroidAction(inactiveActionId);
  assert.equal(inactiveAction.status, "failed");
  assert.equal(inactiveAction.error_message, "Cihaz masaüstünde pasifleştirilmiş.");
  assert.equal(database.getDashboardData().androidActionFailures.some((failure) => (
    failure.id === inactiveActionId && failure.message === "Bu cihaz pasifleştirilmiş."
  )), true);

  const automaticRequestResponse = await postJson(`${baseUrl}/api/request.php`, {
    idempotency_key: "automatic-sync-request-2",
    request_type: "restaurant_reservation",
    customer_name: "Zamanlayıcı Misafiri",
    customer_phone: "0555 222 11 00",
    date_text: "Bu akşam",
    start_date: "2026-07-17",
    time: "20:30",
    guest_count: 3,
    message: "Bahçede masa rica ediyoruz."
  }, false);
  assert.equal(automaticRequestResponse.status, 201);
  const automaticRequestId = (await automaticRequestResponse.json()).request_id;
  coordinator.start();
  await waitForCondition(
    () => database.getDashboardData().requests.some((request) => request.id === automaticRequestId),
    6_000,
    "Masaüstü başlangıç zamanlayıcısı web talebini otomatik çekmedi."
  );
  await waitForCondition(
    () => {
      const automaticRuntime = database.getSyncRuntimeStatus();
      return automaticRuntime.acknowledgedCursor === 2
         && database.getPendingSyncJobs().every((job) => job.jobKey === "ai_settings")
        && automaticRuntime.consecutiveFailures === 0;
    },
    6_000,
    "Masaüstü otomatik senkron döngüsünü tamamlamadı."
  );
  coordinator.stop();
  assert.equal(database.getSyncRuntimeStatus().acknowledgedCursor, 2);

  database.queueSyncJob("menu_publish");
  const offlineStatuses = [];
  const offlineCoordinator = new SyncCoordinator({
    database,
    getSyncConfig: () => ({ baseUrl: "http://127.0.0.1:1", syncSecret }),
    createAndroidSnapshot: () => createSnapshot(database),
    onDashboardChanged: () => {},
    onStatusChanged: (status) => { offlineStatuses.push(status); }
  });
  offlineCoordinator.start();
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  offlineCoordinator.stop();
  assert.equal(offlineStatuses.filter((status) => status.phase === "syncing").length, 1);
  assert.equal(offlineStatuses.at(-1)?.phase, "offline");
  assert.equal(database.getSyncRuntimeStatus().consecutiveFailures, 1);

  // Explicit Web work remains available with passive sync off; its transport
  // failure must still be reported instead of being masked as merely disabled.
  assert.equal(offlineCoordinator.setEnabled(false).phase, "disabled");
  const manualOffline = await offlineCoordinator.runNow();
  assert.equal(manualOffline.ok, false);
  assert.equal(manualOffline.status.enabled, false);
  assert.equal(manualOffline.status.phase, "offline");
  database.setAutoSyncEnabled(true);

  const capabilities = await syncApi({ action: "capabilities" });
  assert.equal(capabilities.status, 200);
  assert.deepEqual(
    Object.assign({}, await capabilities.json(), { server_time: undefined, server_revision: undefined }),
    assertCapabilitiesShape()
  );

  const publicationPayload = {
    action: "publish_menu",
    client_id: database.getSyncRuntimeStatus().clientId,
    source_revision: 100000,
    idempotency_key: "menu-api-smoke-revision-10",
    menu: { categories: [], items: [], updated_at: new Date().toISOString() }
  };
  const firstPublication = await syncApi(publicationPayload);
  assert.equal(firstPublication.status, 200);
  assert.equal((await firstPublication.json()).deduplicated, false);
  const repeatedPublication = await syncApi(publicationPayload);
  assert.equal(repeatedPublication.status, 200);
  assert.equal((await repeatedPublication.json()).deduplicated, true);
  const stalePublication = await syncApi({
    ...publicationPayload,
    source_revision: 99999,
    idempotency_key: "menu-api-smoke-revision-9"
  });
  assert.equal(stalePublication.status, 409);

  const oldestFailureAction = {
    id: "android_failure_limit_oldest",
    action_type: "table_order_close_paid",
    device_id: "android-limit-smoke",
    payload: { order_id: "order-limit-oldest" }
  };
  database.recordAndroidActionResult(oldestFailureAction, { ok: false, message: "Limit smoke hatası." });
  await new Promise((resolve) => setTimeout(resolve, 5));
  for (let index = 0; index < 100; index += 1) {
    database.recordAndroidActionResult({
      id: `android_failure_limit_filler_${index}`,
      action_type: "table_order_close_paid",
      device_id: "android-limit-smoke",
      payload: { order_id: `order-limit-filler-${index}` }
    }, { ok: false, message: "Limit smoke dolgu hatası." });
  }
  database.recordAndroidActionResult({
    ...oldestFailureAction,
    id: "android_failure_limit_resolution"
  }, { ok: true, message: "Limit smoke sorunu çözüldü." });
  database.recordAndroidActionResult(oldestFailureAction, { ok: false, message: "Limit smoke yeniden oluştu." });
  assert.equal(
    database.getDashboardData().androidActionFailures.some((failure) => failure.id === oldestFailureAction.id),
    true,
    "Son 100 kaydın dışındaki Android action hatası başarıyla çözülemedi."
  );

  const stalePermissionSnapshot = createSnapshot(database);
  stalePermissionSnapshot.business_capabilities = stalePermissionSnapshot.business_capabilities.filter((capability) => ![
    BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS,
    BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS,
    BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS,
    BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO
  ].includes(capability));
  stalePermissionSnapshot.androidPermissions["android-auto-smoke"] = {
    role: "admin",
    is_active: true,
    permissions: ["room.update_status"]
  };
  const stalePermissionPublication = await syncApi({
    action: "publish_android_snapshot",
    client_id: database.getSyncRuntimeStatus().clientId,
    source_revision: 100000,
    idempotency_key: "android-stale-capability-boundary-smoke-1",
    snapshot: stalePermissionSnapshot
  });
  assert.equal(stalePermissionPublication.status, 200);
  const staleCapabilitySummary = await (await syncApi({
    action: "android_summary",
    device_id: "android-auto-smoke"
  })).json();
  assert.deepEqual(
    staleCapabilitySummary.actions,
    [],
    "Capability dışı eski Android action geçmişi telefona geri sızmamalı."
  );
  assert.equal(staleCapabilitySummary.summary.pending_action_count, 0);
  const unchangedStaleCapabilitySummary = await (await personalAndroidSummary(deviceToken, {
    known_server_revision: staleCapabilitySummary.server_revision
  })).json();
  assert.equal(unchangedStaleCapabilitySummary.not_modified, true);
  assert.equal(
    unchangedStaleCapabilitySummary.pending_action_count,
    0,
    "Not-modified özeti capability dışı bekleyen action sayısını göstermemeli."
  );
  const staleRoomPermissionResponse = await enqueueAndroidAction(
    "android_stale_room_capability_0001",
    "room_status_update",
    { room_id: roomBefore.id, status: "cleaning" }
  );
  assert.equal(staleRoomPermissionResponse.status, 403);
  assert.equal((await staleRoomPermissionResponse.json()).code, "android_action_capability_disabled");

  assert.equal(existsSync(join(webModuleRoot, "data", "requests.json")), false);
  assert.equal(existsSync(join(webModuleRoot, "data", "yardimci-asistan.sqlite")), true);
  console.log(`automatic-sync-ok: cursor ${database.getSyncRuntimeStatus().requestCursor}, ${firstCycle.publishedJobs} initial publications`);
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  database.close();
  server.kill();
  aiServer.close();
  rmSync(tempRoot, { recursive: true, force: true });
}

function createSnapshot(databaseInstance) {
  const data = databaseInstance.getDashboardData();
  const activeCategories = data.menu.categories.filter((category) => category.is_active);
  const categoryIds = new Set(activeCategories.map((category) => category.id));
  const categoryNames = new Map(data.menu.categories.map((category) => [category.id, category.name]));
  const activeTableOrders = databaseInstance.listTableOrders()
    .filter((order) => ["open", "preparing", "served", "payment"].includes(order.status));
  return {
    business_capabilities: databaseInstance.getEnabledBusinessCapabilities(),
    summary: {
      pending_daily_tasks: data.summary.pendingDailyTasks,
      today_tasks: data.dailyTasks.length,
      available_rooms: data.summary.availableRooms,
      total_rooms: data.summary.totalRooms,
      available_tables: data.summary.availableTables,
      occupied_tables: data.tables.filter((table) => table.status === "occupied").length,
      bill_waiting_tables: data.tables.filter((table) => table.status === "bill_waiting").length,
      active_table_orders: activeTableOrders.length,
      pending_reservations: data.summary.pendingReservations,
      prepared_whatsapp_messages: 0,
      waiting_responses: data.requests.filter((request) => ["new", "seen", "waiting_owner"].includes(request.status)).length,
      active_menu_categories: activeCategories.length,
      available_menu_items: data.menu.items.filter((item) => item.is_available).length,
      customer_count: data.customers.length
    },
    daily_tasks: data.dailyTasks.map((task) => ({
      id: task.id, title: task.title, description: task.description, task_type: task.taskType,
      status: task.status, due_date: task.dueDate, due_time: task.dueTime,
      related_type: task.relatedType, related_id: task.relatedId, updated_at: task.updatedAt
    })),
    requests: data.requests.map((request) => ({
      id: request.id, customer_id: request.customer_id, request_type: request.request_type,
      status: request.status, customer_name: request.customer_name, customer_phone: request.customer_phone,
      date_text: request.date_text, start_date: request.start_date, end_date: request.end_date,
      time: request.time, guest_count: request.guest_count, message: request.message,
      ai_summary: request.ai_summary, ai_suggested_reply: request.ai_suggested_reply,
      whatsapp_message: request.whatsapp_message, priority: request.priority,
      created_at: request.created_at, updated_at: request.updated_at
    })),
    customers: data.customers.map((customer) => ({
      id: customer.id, full_name: customer.fullName, phone: customer.phone, email: customer.email,
      notes: customer.notes, request_count: customer.requestCount,
      identity_type: customer.identityType, identity_number: customer.identityNumber,
      nationality: customer.nationality, birth_date: customer.birthDate, gender: customer.gender,
      document_serial_number: customer.documentSerialNumber,
      document_expiry_date: customer.documentExpiryDate, birth_place: customer.birthPlace,
      mother_name: customer.motherName, father_name: customer.fatherName,
      issuing_authority: customer.issuingAuthority, address: customer.address,
      reservation_count: customer.reservationCount, stay_count: customer.stayCount,
      updated_at: customer.updatedAt
    })),
    customer_room_stays: data.customerRoomStays.map((stay) => ({
      id: stay.id, customer_id: stay.customerId, customer_name: stay.customerName,
      customer_phone: stay.customerPhone, room_id: stay.roomId, room_name: stay.roomName,
      room_number: stay.roomNumber, reservation_id: stay.reservationId, status: stay.status,
      check_in_date: stay.checkInDate, check_out_date: stay.checkOutDate,
      guest_count: stay.guestCount, notes: stay.notes, source: stay.source,
      checked_in_at: stay.checkedInAt, checked_out_at: stay.checkedOutAt,
      created_at: stay.createdAt, updated_at: stay.updatedAt
    })),
    reservations: [],
    rooms: data.rooms.map((room) => ({
      id: room.id, name: room.name, number: room.number, capacity: room.capacity,
      status: room.status, active_reservation_title: room.activeReservationTitle, updated_at: room.updatedAt
    })),
    tables: data.tables.map((table) => ({
      id: table.id, name: table.name, area: table.area, capacity: table.capacity,
      status: table.status, active_reservation_title: table.activeReservationTitle, updated_at: table.updatedAt
    })),
    menu: {
      categories: activeCategories,
      items: data.menu.items.filter((item) => item.is_available && categoryIds.has(item.category_id)),
      updated_at: data.menu.updated_at
    },
    admin_menu: data.menu,
    deleted_request_ids: databaseInstance.getDeletedRequestIds(),
    trackedStockItems: data.menu.items
      .filter((item) => item.stock_quantity !== null)
      .map((item) => ({
        product_id: item.product_id,
        menu_entry_id: item.id,
        name: item.name,
        category: categoryNames.get(item.category_id) ?? "Menü",
        price: item.price,
        stock_quantity: item.stock_quantity,
        stock_min_quantity: item.stock_min_quantity,
        stock_unit: item.stock_unit,
        stock_consumption_quantity: item.stock_consumption_quantity,
        hide_when_out_of_stock: item.hide_when_out_of_stock,
        stock_status: item.stock_quantity < item.stock_consumption_quantity
          ? "out_of_stock"
          : item.stock_min_quantity !== null && item.stock_quantity <= item.stock_min_quantity
            ? "low_stock"
            : "in_stock"
      })),
    appliedStockImageHashes: databaseInstance.getAppliedStockImageHashes(100),
    table_orders: activeTableOrders.map((order) => ({
      id: order.id,
      table_id: order.tableId,
      table_name: order.tableName,
      status: order.status,
      opened_at: order.openedAt,
      total: order.total,
      item_count: order.itemCount,
      items: order.items.map((item) => ({
        id: item.id,
        order_id: item.orderId,
        product_id: item.productId,
        menu_entry_id: item.menuEntryId,
        product_name: item.productName,
        unit_price: item.unitPrice,
        currency: item.currency,
        quantity: item.quantity,
        line_total: item.lineTotal,
        status: item.status,
        updated_at: item.updatedAt
      })),
      updated_at: order.updatedAt
    })),
    messages: [],
    androidPermissions: databaseInstance.getAndroidPermissionSnapshot(),
    reports: databaseInstance.getAndroidReportPresets(),
    updated_at: new Date().toISOString()
  };
}

async function enqueueAndroidAction(actionId, actionType, payload) {
  return syncApi({
    action: "enqueue_android_action",
    action_id: actionId,
    action_type: actionType,
    device_id: "android-auto-smoke",
    device_name: "Smoke Personel Telefonu",
    app_version: "0.1.0-smoke",
    payload
  });
}

async function assertQueued(response) {
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.action.status, "pending");
}

async function getAndroidAction(actionId) {
  const response = await syncApi({ action: "android_summary", device_id: "android-auto-smoke" });
  assert.equal(response.status, 200);
  const result = await response.json();
  const action = result.actions.find((candidate) => candidate.id === actionId);
  assert.ok(action, `Android action result not found: ${actionId}`);
  return action;
}

async function syncApi(payload) {
  return postJson(`${baseUrl}/api/sync.php`, publicationEnvelope(payload), true);
}

function personalAndroidSummary(deviceToken, fields = {}) {
  return fetch(`${baseUrl}/api/android.php`, { method: "POST", headers: {
    "Content-Type": "application/json", "X-YA-Device-Id": "android-auto-smoke", "X-YA-Device-Token": deviceToken
  }, body: JSON.stringify({ action: "android_summary", device_id: "android-auto-smoke", ...fields }) });
}

function postJson(url, payload, authenticated) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { "X-YA-Sync-Secret": syncSecret } : {})
    },
    body: JSON.stringify(payload)
  });
}

function assertCapabilitiesShape() {
  return {
    ok: true,
    message: "Senkron özellikleri alındı.",
    protocol_version: 3,
    storage: "sqlite",
    features: [
      "marketing_website_publications",
      "business_messaging_status_v1",
      "web_orders_v1",
      "online_catalog_v1",
      "customer_accounts_v1",
      "request_documents_v1",
      "dealer_catalog_v1",
      "dealer_orders_v1",
      "request_cursor",
      "request_acknowledgement",
      "android_action_queue",
      "android_device_sightings",
      "android_device_permissions",
      "versioned_publications",
      "exact_publication_receipts",
      "publication_source_epochs",
      "idempotent_publications",
      "server_revision",
      "runtime_reset"
    ],
    server_time: undefined,
    server_revision: undefined
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const freePort = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(freePort));
    });
  });
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(url)).ok) {
        return;
      }
    } catch {
      // PHP server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PHP server did not become ready: ${url}`);
}

async function waitForCondition(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}
