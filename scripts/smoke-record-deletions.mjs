import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

const { database, cleanup } = createTemporaryDesktopDatabase("yardimci-record-deletions-");

try {
  database.initialize();

  const setupResult = database.saveInitialSetup({
    businessName: "Record Deletions Test İşletmesi",
    profileId: "pension_restaurant",
    phone: "+905550000100",
    whatsapp: "+905550000100",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "record-deletions-secret-123",
    autoSyncEnabled: false,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "",
    aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKey: "",
    clearAiApiKey: false,
    servicePreferences: { whatsapp: true, android: true },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);

  assertDesktopMessageDeletion(database);
  assertDesktopCustomerDeletion(database);
  assertDesktopRequestDeletion(database);
  assertDesktopMenuDeletion(database);
  assertAndroidAdminOnlyDeletion(database);
  assertSoftDeleteRows(database);
  console.log("record-deletions-smoke-ok");
} finally {
  cleanup();
}

function assertDesktopMessageDeletion(database) {
  const request = createRequest(database, "Mesaj Silme", "+905550000101");
  const suggestion = database.saveRequestAiSuggestion({
    requestId: request.id,
    summary: "Hazır mesaj silme özeti",
    suggestedReply: "Bu mesaj masaüstünden silinecek.",
    missingFields: []
  });
  assert.equal(suggestion.ok, true);
  assert.equal(database.getAndroidPreparedMessages().some((message) => message.requestId === request.id), true);

  const result = database.deleteWhatsAppMessage({ requestId: request.id });
  assert.equal(result.ok, true);
  const preservedRequest = result.dashboardData.requests.find((candidate) => candidate.id === request.id);
  assert.ok(preservedRequest);
  assert.equal(preservedRequest.ai_suggested_reply, "");
  assert.equal(preservedRequest.whatsapp_message, "");
  assert.equal(database.getAndroidPreparedMessages().some((message) => message.requestId === request.id), false);
  assert.equal(database.countEventsByType("whatsapp.message_deleted"), 1);
}

function assertDesktopCustomerDeletion(database) {
  const request = createRequest(database, "Müşteri Silme", "+905550000102", "pension_reservation");
  const conversion = database.convertRequestToReservation(request.id);
  assert.equal(conversion.ok, true);
  const reservation = conversion.dashboardData.reservations.find((candidate) => candidate.requestId === request.id);
  assert.ok(reservation);

  const result = database.deleteCustomer(request.customer_id);
  assert.equal(result.ok, true);
  assert.equal(result.dashboardData.customers.some((customer) => customer.id === request.customer_id), false);
  assert.equal(result.dashboardData.requests.find((candidate) => candidate.id === request.id)?.customer_id, "");
  assert.equal(result.dashboardData.reservations.find((candidate) => candidate.id === reservation.id)?.customerId, "");
  assert.equal(database.countEventsByType("customer.deleted"), 1);
}

function assertDesktopRequestDeletion(database) {
  const request = createRequest(database, "Talep Silme", "+905550000103");
  assert.equal(database.saveRequestAiSuggestion({
    requestId: request.id,
    summary: "Silinecek talep",
    suggestedReply: "Talebe bağlı silinecek mesaj.",
    missingFields: []
  }).ok, true);

  const result = database.deleteRequest(request.id);
  assert.equal(result.ok, true);
  assert.equal(result.dashboardData.requests.some((candidate) => candidate.id === request.id), false);
  assert.equal(database.getAndroidPreparedMessages().some((message) => message.requestId === request.id), false);
  assert.equal(database.getDeletedRequestIds().includes(request.id), true);
  assert.equal(database.countEventsByType("request.deleted"), 1);
}

function assertDesktopMenuDeletion(database) {
  const category = createCategory(database, "Masaüstü Silme Kategorisi");
  const firstItem = createItem(database, category.id, "Tek Ürün Silme");
  const secondItem = createItem(database, category.id, "Kategoriyle Silme");

  const itemResult = database.deleteMenuItem(firstItem.id);
  assert.equal(itemResult.ok, true);
  assert.equal(itemResult.dashboardData.menu.items.some((item) => item.id === firstItem.id), false);
  assert.equal(itemResult.dashboardData.menu.items.some((item) => item.id === secondItem.id), true);

  const categoryResult = database.deleteMenuCategory(category.id);
  assert.equal(categoryResult.ok, true);
  assert.equal(categoryResult.dashboardData.menu.categories.some((candidate) => candidate.id === category.id), false);
  assert.equal(categoryResult.dashboardData.menu.items.some((item) => item.category_id === category.id), false);
  assert.equal(database.countEventsByType("menu.item_deleted"), 1);
  assert.equal(database.countEventsByType("menu.category_deleted"), 1);
}

function assertAndroidAdminOnlyDeletion(database) {
  const deviceId = "android-delete-smoke";
  registerAndApproveDevice(database, deviceId);

  const staffRequest = createRequest(database, "Personel Koruması", "+905550000104");
  const denied = database.applyAndroidAction(androidAction(
    "android_delete_staff_denied_001",
    "customer_request_delete",
    { request_id: staffRequest.id }
  ));
  assert.equal(denied.ok, false);
  assert.match(denied.message, /yalnız yönetici/i);
  assert.equal(database.getDashboardData().requests.some((request) => request.id === staffRequest.id), true);
  const staffDevice = database.getAndroidDevices().find((device) => device.deviceId === deviceId);
  assert.equal(staffDevice?.isActive, true);
  assert.equal(staffDevice?.role, "staff");
  assert.equal(staffDevice?.permissions.includes("request.delete"), false);
  assert.equal(staffDevice?.permissions.includes("customer.delete"), false);
  assert.equal(staffDevice?.permissions.includes("menu.delete"), false);
  assert.equal(staffDevice?.permissions.includes("message.delete"), false);

  assert.equal(database.setAndroidDeviceRole(deviceId, "admin").ok, true);
  const adminDevice = database.getAndroidDevices().find((device) => device.deviceId === deviceId);
  assert.equal(adminDevice?.isActive, true);
  assert.equal(adminDevice?.permissions.includes("request.delete"), true);
  assert.equal(adminDevice?.permissions.includes("customer.delete"), true);
  assert.equal(adminDevice?.permissions.includes("menu.delete"), true);
  assert.equal(adminDevice?.permissions.includes("message.delete"), true);

  assert.equal(database.saveRequestAiSuggestion({
    requestId: staffRequest.id,
    summary: "Android mesaj silme",
    suggestedReply: "Android yöneticisinin sileceği mesaj.",
    missingFields: []
  }).ok, true);
  const preparedMessage = database.getAndroidPreparedMessages().find((message) => message.requestId === staffRequest.id);
  assert.ok(preparedMessage);
  const messageDeletion = database.applyAndroidAction(androidAction(
    "android_message_delete_001",
    "message_delete",
    { message_id: preparedMessage.id, request_id: staffRequest.id, expected_updated_at: preparedMessage.updatedAt }
  ));
  assert.equal(messageDeletion.ok, true);
  assert.equal(database.getAndroidPreparedMessages().some((message) => message.requestId === staffRequest.id), false);

  const requestDeletion = database.applyAndroidAction(androidAction(
    "android_request_delete_001",
    "customer_request_delete",
    { request_id: staffRequest.id }
  ));
  assert.equal(requestDeletion.ok, true);
  assert.equal(database.getDeletedRequestIds().includes(staffRequest.id), true);

  const customerRequest = createRequest(database, "Android Müşteri Silme", "+905550000105");
  const customerDeletion = database.applyAndroidAction(androidAction(
    "android_customer_delete_001",
    "customer_delete",
    { customer_id: customerRequest.customer_id }
  ));
  assert.equal(customerDeletion.ok, true);
  assert.equal(database.getDashboardData().customers.some((customer) => customer.id === customerRequest.customer_id), false);
  assert.equal(database.getDashboardData().requests.find((request) => request.id === customerRequest.id)?.customer_id, "");

  const category = createCategory(database, "Android Silme Kategorisi");
  const firstItem = createItem(database, category.id, "Android Tek Ürün");
  const secondItem = createItem(database, category.id, "Android Zincir Ürün");
  assert.equal(database.applyAndroidAction(androidAction(
    "android_menu_item_delete_001",
    "menu_item_delete",
    { menu_item_id: firstItem.id }
  )).ok, true);
  assert.equal(database.getDashboardData().menu.items.some((item) => item.id === firstItem.id), false);
  assert.equal(database.applyAndroidAction(androidAction(
    "android_menu_category_delete_001",
    "menu_category_delete",
    { category_id: category.id }
  )).ok, true);
  assert.equal(database.getDashboardData().menu.categories.some((candidate) => candidate.id === category.id), false);
  assert.equal(database.getDashboardData().menu.items.some((item) => item.id === secondItem.id), false);
}

function registerAndApproveDevice(database, deviceId) {
  const now = new Date().toISOString();
  database.upsertAndroidDeviceSightings([{
    device_id: deviceId,
    device_name: "Deletion Smoke",
    app_version: "smoke",
    first_seen_at: now,
    last_seen_at: now
  }]);
  const pending = database.getAndroidDevices().find((device) => device.deviceId === deviceId);
  assert.equal(pending?.isActive, false, "New Android devices must wait for desktop approval.");
  const approval = database.setAndroidDeviceActive(deviceId, true);
  assert.equal(approval.ok, true, approval.message);
}

function assertSoftDeleteRows(database) {
  const sqlite = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    for (const table of ["requests", "customers", "menu_categories", "menu_items", "whatsapp_messages"]) {
      const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE deleted_at != ''`).get();
      assert.ok(Number(row.count) > 0, `${table} must contain a soft-deleted row`);
    }
    assert.equal(String(sqlite.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    sqlite.close();
  }
}

function createRequest(database, customerName, customerPhone, requestType = "general_info") {
  const result = database.createManualRequest({
    requestType,
    customerName,
    customerPhone,
    dateText: "22 Temmuz",
    startDate: requestType === "pension_reservation" ? "2026-07-23" : "",
    endDate: requestType === "pension_reservation" ? "2026-07-24" : "",
    time: "",
    guestCount: 2,
    adultCount: 2,
    childCount: 0,
    message: `${customerName} için smoke talebi.`,
    priority: "normal"
  });
  assert.equal(result.ok, true);
  const request = result.dashboardData.requests.find((candidate) => candidate.id === result.savedId);
  assert.ok(request);
  assert.ok(request.customer_id);
  return request;
}

function createCategory(database, name) {
  const result = database.saveMenuCategory({
    name,
    description: "Silme smoke testi",
    is_active: true,
    sort_order: 900
  });
  assert.equal(result.ok, true);
  return { id: result.savedId };
}

function createItem(database, categoryId, name) {
  const result = database.saveMenuItem({
    category_id: categoryId,
    name,
    description: "Silme smoke ürünü",
    price: 25,
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: [],
    tags: ["smoke"],
    sort_order: 1
  });
  assert.equal(result.ok, true);
  return { id: result.savedId };
}

function androidAction(id, actionType, payload) {
  return {
    id,
    action_type: actionType,
    payload,
    created_at: "2026-07-22T12:00:00.000Z",
    device_id: "android-delete-smoke",
    device_name: "Deletion Smoke",
    app_version: "smoke",
    status: "pending",
    error_message: ""
  };
}
