import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  SyncCoordinator,
  supportsAndroidDevicePermissionSync
} = require("../apps/desktop-app/dist-electron/sync-coordinator.js");

const syncSecret = "automatic-sync-secret-12345";
const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-automatic-sync-"));
const webModuleRoot = join(tempRoot, "web-module");
const desktopDataRoot = join(tempRoot, "desktop-data");
cpSync(join(process.cwd(), "firm-template", "web-module"), webModuleRoot, { recursive: true });

for (const runtimeFile of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(webModuleRoot, "data", runtimeFile), { force: true });
}
writeFileSync(join(webModuleRoot, "data", "requests.json"), "[]\n");
writeFileSync(join(webModuleRoot, "data", "android-actions.json"), "[]\n");
const businessFile = join(webModuleRoot, "config", "business.json");
const businessConfig = JSON.parse(readFileSync(businessFile, "utf8"));
businessConfig.sync_secret = syncSecret;
writeFileSync(businessFile, `${JSON.stringify(businessConfig, null, 2)}\n`);

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
    schema_version: 1,
    features: ["android_device_sightings", "android_device_permissions"]
  }), false);
  assert.equal(supportsAndroidDevicePermissionSync({
    schema_version: 2,
    features: ["android_device_sightings"]
  }), false);
  assert.equal(supportsAndroidDevicePermissionSync({
    schema_version: 2,
    features: ["android_device_sightings", "android_device_permissions"]
  }), true);
  const setupResult = database.saveInitialSetup({
    businessName: "Otomatik Senkron Smoke",
    businessType: "pension_restaurant",
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
    modules: { rooms: true, tables: true, qrMenu: true, whatsapp: true, android: true },
    initialCounts: { rooms: 2, tables: 2 }
  }, { mode: "keep" });
  assert.equal(setupResult.ok, true);

  const trackedMenuItemBefore = database.getDashboardData().menu.items.find((item) => item.is_available);
  assert.ok(trackedMenuItemBefore);
  const trackedMenuSave = database.saveMenuItem({
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
    hide_when_out_of_stock: true,
    stock_note: "Otomatik senkron stok testi",
    sort_order: trackedMenuItemBefore.sort_order
  });
  assert.equal(trackedMenuSave.ok, true);
  const trackedMenuItemId = trackedMenuSave.savedId;

  const requestResponse = await postJson(`${baseUrl}/api/request.php`, {
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
  assert.equal(firstCycle.publishedJobs, 2);
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
    service_orders: true,
    cashier: false,
    rooms_tasks: true,
    customer_reservation: false
  });
  assert.equal(staffDevice.permissions.includes("table_order.open"), true);
  assert.equal(staffDevice.permissions.includes("room.update_status"), true);
  assert.equal(staffDevice.permissions.includes("menu.stock_view"), true);
  assert.equal(staffDevice.permissions.includes("menu.stock_update"), false);
  assert.equal(staffDevice.permissions.includes("customer.view"), false);
  assert.equal(staffDevice.permissions.includes("table_order.close_paid"), false);
  const runtime = database.getSyncRuntimeStatus();
  assert.ok(runtime.requestCursor > 0);
  assert.equal(runtime.acknowledgedCursor, runtime.requestCursor);
  assert.equal(runtime.pendingJobs, 0);
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
  assert.deepEqual(
    androidData.trackedStockItems.find((item) => item.menu_item_id === trackedMenuItemId),
    {
      menu_item_id: trackedMenuItemId,
      name: trackedMenuItemBefore.name,
      category: dashboard.menu.categories.find((category) => category.id === trackedMenuItemBefore.category_id)?.name,
      price: trackedMenuItemBefore.price,
      stock_quantity: 2,
      stock_min_quantity: 1,
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
  assert.equal((await unchangedSummary.json()).not_modified, true);

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
  assert.equal(summaryAfterDeletion.admin_menu.categories.length, database.getDashboardData().menu.categories.length);

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
  assert.equal(sightingOnlyDevice.isActive, true);
  const sightingOnlyProfileResponse = await syncApi({
    action: "android_summary",
    device_id: "android-summary-only-smoke"
  });
  const sightingOnlyProfile = (await sightingOnlyProfileResponse.json()).androidPermissions["android-summary-only-smoke"];
  assert.equal(sightingOnlyProfile.role, "staff");
  assert.equal(sightingOnlyProfile.is_active, true);
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
    menu_item_id: menuItem.id,
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
  assert.equal(outOfStockSummary.trackedStockItems.find((item) => item.menu_item_id === trackedMenuItemId)?.stock_quantity, 0);
  assert.equal(outOfStockSummary.trackedStockItems.find((item) => item.menu_item_id === trackedMenuItemId)?.stock_status, "out_of_stock");
  const outOfStockMenu = await (await fetch(`${baseUrl}/api/menu.php`)).json();
  assert.equal(outOfStockMenu.items.some((item) => item.id === trackedMenuItemId), false);

  const forbiddenStockActionId = "android_permission_stock_staff_0001";
  await assertQueued(await enqueueAndroidAction(forbiddenStockActionId, "menu_stock_add", {
    menu_item_id: trackedMenuItemId,
    quantity: 1,
    note: "Personel yetki testi"
  }));
  const forbiddenStockCycle = await coordinator.runNow();
  assert.equal(forbiddenStockCycle.appliedActions, 0);
  assert.equal(forbiddenStockCycle.failedActions, 1);
  assert.equal(database.getDashboardData().menu.items.find((item) => item.id === trackedMenuItemId)?.stock_quantity, 0);
  const forbiddenStockResult = await getAndroidAction(forbiddenStockActionId);
  assert.match(forbiddenStockResult.error_message, /yetkisi yok/i);

  const forbiddenImageImportActionId = "android_permission_stock_image_staff_0001";
  await assertQueued(await enqueueAndroidAction(forbiddenImageImportActionId, "menu_stock_image_import_apply", {
    import_id: "stock_import_staff_queue_0001",
    image_hash: "b".repeat(64),
    duplicate_warning_acknowledged: false,
    lines: [{
      menu_item_id: trackedMenuItemId,
      quantity: 2,
      raw_text: "2 adet personel yetki testi",
      confidence: "high"
    }]
  }));
  const forbiddenImageImportCycle = await coordinator.runNow();
  assert.equal(forbiddenImageImportCycle.appliedActions, 0);
  assert.equal(forbiddenImageImportCycle.failedActions, 1);
  assert.equal(database.getDashboardData().menu.items.find((item) => item.id === trackedMenuItemId)?.stock_quantity, 0);
  assert.match((await getAndroidAction(forbiddenImageImportActionId)).error_message, /yetkisi yok/i);

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
  await assertQueued(await enqueueAndroidAction(forbiddenCloseActionId, "table_order_close_paid", {
    order_id: order.id,
    table_id: table.id,
    expected_updated_at: order.updatedAt
  }));
  const forbiddenCloseCycle = await coordinator.runNow();
  assert.equal(forbiddenCloseCycle.appliedActions, 0);
  assert.equal(forbiddenCloseCycle.failedActions, 1);
  order = database.getActiveTableOrder(table.id);
  assert.ok(order);
  assert.equal(order.status, "payment");
  const forbiddenCloseResult = await getAndroidAction(forbiddenCloseActionId);
  assert.equal(forbiddenCloseResult.status, "failed");
  assert.equal(forbiddenCloseResult.error_message, "Bu cihazın hesap kapatma yetkisi yok.");
  const failureDashboard = database.getDashboardData();
  assert.equal(failureDashboard.paymentWaitingTableOrders.some((candidate) => candidate.id === order.id), true);
  assert.equal(failureDashboard.androidActionFailures.some((failure) => (
    failure.id === forbiddenCloseActionId
      && failure.message === "Bu cihazın hesap kapatma yetkisi yok."
      && failure.targetPage === "restaurant"
  )), true);

  const cashierResult = database.setAndroidDevicePermissionGroups("android-auto-smoke", {
    service_orders: true,
    cashier: true,
    rooms_tasks: true,
    customer_reservation: false
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
  assert.equal(database.getDashboardData().androidActionFailures.some((failure) => failure.id === forbiddenCloseActionId), false);

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
  await assertQueued(await enqueueAndroidAction(staffDeleteActionId, "customer_request_delete", {
    request_id: deletionTargetId
  }));
  const staffDeleteCycle = await coordinator.runNow();
  assert.equal(staffDeleteCycle.appliedActions, 0);
  assert.equal(staffDeleteCycle.failedActions, 1);
  assert.match((await getAndroidAction(staffDeleteActionId)).error_message, /yalnız yönetici/i);
  assert.equal(database.getDashboardData().requests.some((request) => request.id === deletionTargetId), true);

  const promoteResult = database.setAndroidDeviceRole("android-auto-smoke", "admin");
  assert.equal(promoteResult.ok, true);
  const adminProfilePublishCycle = await coordinator.runNow();
  assert.equal(adminProfilePublishCycle.ok, true, adminProfilePublishCycle.message);
  assert.equal(adminProfilePublishCycle.publishedJobs, 1);
  const adminSummaryResponse = await syncApi({ action: "android_summary", device_id: "android-auto-smoke" });
  const adminSummary = await adminSummaryResponse.json();
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].role, "admin");
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("table_order.close_paid"), true);
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("request.delete"), true);
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("customer.delete"), true);
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("menu.delete"), true);
  assert.equal(adminSummary.androidPermissions["android-auto-smoke"].permissions.includes("message.delete"), true);

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
    menu_item_id: trackedMenuItemId,
    quantity: 5,
    note: "Yönetici stok ekleme testi"
  }));
  const adminStockCycle = await coordinator.runNow();
  assert.equal(adminStockCycle.appliedActions, 1);
  assert.equal(adminStockCycle.failedActions, 0);
  assert.equal(adminStockCycle.publishedJobs, 2);
  assert.equal(database.getDashboardData().menu.items.find((item) => item.id === trackedMenuItemId)?.stock_quantity, 5);
  const replenishedSummary = await (await syncApi({ action: "android_summary", device_id: "android-auto-smoke" })).json();
  assert.equal(replenishedSummary.trackedStockItems.find((item) => item.menu_item_id === trackedMenuItemId)?.stock_quantity, 5);
  assert.equal(replenishedSummary.trackedStockItems.find((item) => item.menu_item_id === trackedMenuItemId)?.stock_status, "in_stock");
  const replenishedMenu = await (await fetch(`${baseUrl}/api/menu.php`)).json();
  assert.equal(replenishedMenu.items.some((item) => item.id === trackedMenuItemId), true);

  const imageImportHash = "a".repeat(64);
  const imageImportActionId = "android_stock_image_admin_0001";
  await assertQueued(await enqueueAndroidAction(imageImportActionId, "menu_stock_image_import_apply", {
    import_id: "stock_import_admin_queue_0001",
    image_hash: imageImportHash,
    duplicate_warning_acknowledged: false,
    lines: [{
      menu_item_id: trackedMenuItemId,
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
  assert.equal(imageImportSummary.trackedStockItems.find((item) => item.menu_item_id === trackedMenuItemId)?.stock_quantity, 8);

  const invalidImageImportActionId = "android_stock_image_atomic_0001";
  await assertQueued(await enqueueAndroidAction(invalidImageImportActionId, "menu_stock_image_import_apply", {
    import_id: "stock_import_admin_atomic_0001",
    image_hash: "c".repeat(64),
    duplicate_warning_acknowledged: false,
    lines: [
      {
        menu_item_id: trackedMenuItemId,
        quantity: 4,
        raw_text: "4 adet geçerli satır",
        confidence: "high"
      },
      {
        menu_item_id: "invented_untracked_menu_item",
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
  const inactiveAction = await getAndroidAction(inactiveActionId);
  assert.equal(inactiveAction.status, "failed");
  assert.equal(inactiveAction.error_message, "Cihaz masaüstünde pasifleştirilmiş.");
  assert.equal(database.getDashboardData().androidActionFailures.some((failure) => (
    failure.id === inactiveActionId && failure.message === "Bu cihaz pasifleştirilmiş."
  )), true);

  const automaticRequestResponse = await postJson(`${baseUrl}/api/request.php`, {
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
        && automaticRuntime.pendingJobs === 0
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

  const capabilities = await syncApi({ action: "capabilities" });
  assert.equal(capabilities.status, 200);
  assert.deepEqual(
    Object.assign({}, await capabilities.json(), { server_time: undefined, server_revision: undefined }),
    assertCapabilitiesShape()
  );

  const publicationPayload = {
    action: "publish_menu",
    client_id: "desktop-api-smoke",
    source_revision: 10,
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
    source_revision: 9,
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

  assert.equal(readFileSync(join(webModuleRoot, "data", "requests.json"), "utf8"), "[]\n");
  assert.equal(existsSync(join(webModuleRoot, "data", "yardimci-asistan.sqlite")), true);
  assert.equal(existsSync(join(webModuleRoot, "data", "requests.json.legacy-backup-v1")), true);
  console.log(`automatic-sync-ok: cursor ${database.getSyncRuntimeStatus().requestCursor}, ${firstCycle.publishedJobs} initial publications`);
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  database.close();
  server.kill();
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
      notes: customer.notes, tags: customer.tags, request_count: customer.requestCount,
      reservation_count: customer.reservationCount, updated_at: customer.updatedAt
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
        menu_item_id: item.id,
        name: item.name,
        category: categoryNames.get(item.category_id) ?? "Menü",
        price: item.price,
        stock_quantity: item.stock_quantity,
        stock_min_quantity: item.stock_min_quantity,
        hide_when_out_of_stock: item.hide_when_out_of_stock,
        stock_status: item.stock_quantity <= 0
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
        menu_item_id: item.menuItemId,
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
  return postJson(`${baseUrl}/api/sync.php`, payload, true);
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
    protocol_version: 2,
    storage: "sqlite",
    schema_version: 2,
    features: [
      "request_cursor",
      "request_acknowledgement",
      "android_action_queue",
      "android_device_sightings",
      "android_device_permissions",
      "versioned_publications",
      "idempotent_publications",
      "server_revision"
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
