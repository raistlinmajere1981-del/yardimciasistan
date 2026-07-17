import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");

const appPath = join(process.cwd(), "apps", "desktop-app");
const dataDir = join(process.cwd(), "artifacts", "desktop-menu-db-smoke", String(Date.now()));
mkdirSync(dataDir, { recursive: true });

const database = new DesktopDatabase({
  appPath,
  userDataPath: dataDir
});

try {
  database.initialize();

  const initialSetup = database.getSetupData();
  assert.equal(initialSetup.setupRequired, true);
  assert.equal(initialSetup.webModuleUrl, "https://yardimciasistan.alwaysdata.net/yardimci-asistan");
  assert.equal(initialSetup.aiEnabled, false);
  assert.equal(initialSetup.aiService, "openai");
  assert.equal(initialSetup.aiProjectName, "");
  assert.equal(initialSetup.aiBaseUrl, "https://api.openai.com/v1");
  assert.equal(initialSetup.aiTimeoutSeconds, 30);
  assert.equal(initialSetup.aiApiKeyConfigured, false);
  assert.equal(initialSetup.aiLastPublishedAt, "");
  assert.ok(database.backupPath.endsWith("backups"));

  const firstRawAiApiKey = "smoke-raw-ai-key-never-persist-001";
  const firstEncryptedAiApiKey = "safe-storage:v1:opaque-smoke-value-001";
  const setupInput = {
    businessName: "Deniz Çiçeği Pansiyon & Kafe",
    businessType: "pension_restaurant",
    phone: "+905321234567",
    whatsapp: "+905321234567",
    email: "smoke@example.test",
    address: "Smoke adresi",
    webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
    syncSecret: "smoke-secret-12345",
    aiEnabled: true,
    aiProvider: "openai_compatible",
    aiService: "openrouter",
    aiProjectName: "",
    aiModel: "smoke-model-v1",
    aiBaseUrl: "https://openrouter.example.test/api/v1/",
    aiTimeoutSeconds: 30,
    aiApiKey: firstRawAiApiKey,
    clearAiApiKey: false,
    modules: {
      rooms: true,
      tables: true,
      qrMenu: true,
      whatsapp: true,
      android: true
    },
    initialCounts: {
      rooms: 3,
      tables: 3
    }
  };
  const setupResult = database.saveInitialSetup(setupInput, {
    mode: "replace",
    encryptedValue: firstEncryptedAiApiKey
  });
  assert.equal(setupResult.ok, true);
  assert.equal(setupResult.setupData.setupRequired, false);
  assert.equal(setupResult.setupData.aiEnabled, true);
  assert.equal(setupResult.setupData.aiProvider, "openai_compatible");
  assert.equal(setupResult.setupData.aiService, "openrouter");
  assert.equal(setupResult.setupData.aiModel, "smoke-model-v1");
  assert.equal(setupResult.setupData.aiBaseUrl, "https://openrouter.example.test/api/v1");
  assert.equal(setupResult.setupData.aiTimeoutSeconds, 30);
  assert.equal(setupResult.setupData.aiApiKeyConfigured, true);
  assert.equal(setupResult.setupData.aiLastPublishedAt, "");
  assert.equal(database.getEncryptedAiApiKey(), firstEncryptedAiApiKey);
  assert.equal(setupResult.dashboardData.webModuleUrl, "https://yardimciasistan.alwaysdata.net/yardimci-asistan");
  assert.ok(setupResult.dashboardData.backupPath.endsWith("backups"));

  const publishedAt = "2026-07-12T09:30:00.000Z";
  const publishedSetup = database.markAiSettingsPublished(publishedAt);
  assert.equal(publishedSetup.aiLastPublishedAt, publishedAt);

  const keepResult = database.saveInitialSetup(
    {
      ...setupInput,
      aiApiKey: ""
    },
    { mode: "keep" }
  );
  assert.equal(keepResult.ok, true);
  assert.equal(keepResult.setupData.aiApiKeyConfigured, true);
  assert.equal(keepResult.setupData.aiLastPublishedAt, publishedAt);
  assert.equal(database.getEncryptedAiApiKey(), firstEncryptedAiApiKey);

  const invalidAiCases = [
    [{ aiProvider: "unsupported" }, "servis sağlayıcı"],
    [{ aiService: "unsupported" }, "servisi"],
    [{ aiBaseUrl: "https://user:pass@provider.example/v1" }, "bağlantı adresi"],
    [{ aiModel: "" }, "model"],
    [{ aiTimeoutSeconds: 121 }, "zaman aşımı"]
  ];
  for (const [override, expectedMessage] of invalidAiCases) {
    const invalidResult = database.saveInitialSetup(
      {
        ...setupInput,
        ...override,
        aiApiKey: ""
      },
      { mode: "keep" }
    );
    assert.equal(invalidResult.ok, false);
    assert.match(invalidResult.message, new RegExp(expectedMessage, "i"));
  }

  const missingGoogleProjectResult = database.saveInitialSetup(
    {
      ...setupInput,
      aiService: "gemini",
      aiProjectName: "",
      aiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      aiModel: "gemini-smoke",
      aiApiKey: ""
    },
    { mode: "keep" }
  );
  assert.equal(missingGoogleProjectResult.ok, true);
  assert.equal(missingGoogleProjectResult.setupData.aiProjectName, "");

  const invalidGoogleUrlResult = database.saveInitialSetup(
    {
      ...setupInput,
      aiService: "gemini",
      aiProjectName: "",
      aiBaseUrl: "https://provider.example.test/v1",
      aiModel: "gemini-smoke",
      aiApiKey: ""
    },
    { mode: "keep" }
  );
  assert.equal(invalidGoogleUrlResult.ok, false);
  assert.match(invalidGoogleUrlResult.message, /resmi Gemini bağlantı/i);

  const googleSetupResult = database.saveInitialSetup(
    {
      ...setupInput,
      aiService: "gemini",
      aiProjectName: "",
      aiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      aiModel: "gemini-smoke",
      aiApiKey: ""
    },
    { mode: "keep" }
  );
  assert.equal(googleSetupResult.ok, true);
  assert.equal(googleSetupResult.setupData.aiService, "gemini");
  assert.equal(googleSetupResult.setupData.aiProjectName, "");
  assert.equal(googleSetupResult.setupData.aiBaseUrl, "https://generativelanguage.googleapis.com/v1beta");

  const secondRawAiApiKey = "smoke-raw-ai-key-never-persist-002";
  const secondEncryptedAiApiKey = "safe-storage:v1:opaque-smoke-value-002";
  const replaceResult = database.saveInitialSetup(
    {
      ...setupInput,
      aiApiKey: secondRawAiApiKey
    },
    {
      mode: "replace",
      encryptedValue: secondEncryptedAiApiKey
    }
  );
  assert.equal(replaceResult.ok, true);
  assert.equal(replaceResult.setupData.aiApiKeyConfigured, true);
  assert.equal(replaceResult.setupData.aiLastPublishedAt, "");
  assert.equal(database.getEncryptedAiApiKey(), secondEncryptedAiApiKey);

  const backupResult = database.createManualBackup();
  assert.equal(backupResult.ok, true);
  assert.match(backupResult.backupFileName, /^yardimci-asistan-.+\.sqlite$/);
  assert.equal(backupResult.dashboardData.backupPath, database.backupPath);
  assert.equal(existsSync(backupResult.backupFilePath), true);
  assert.ok(statSync(backupResult.backupFilePath).size > 0);
  assertReadableSqliteBackup(backupResult.backupFilePath);
  assertFilesDoNotContainSecrets(
    [database.databasePath, backupResult.backupFilePath],
    [firstRawAiApiKey, secondRawAiApiKey]
  );

  const clearResult = database.saveInitialSetup(
    {
      ...setupInput,
      aiEnabled: false,
      aiApiKey: "",
      clearAiApiKey: true
    },
    { mode: "clear" }
  );
  assert.equal(clearResult.ok, true);
  assert.equal(clearResult.setupData.aiEnabled, false);
  assert.equal(clearResult.setupData.aiApiKeyConfigured, false);
  assert.equal(database.getEncryptedAiApiKey(), "");

  const enableWithoutKeyResult = database.saveInitialSetup(
    {
      ...setupInput,
      aiApiKey: ""
    },
    { mode: "keep" }
  );
  assert.equal(enableWithoutKeyResult.ok, false);
  assert.match(enableWithoutKeyResult.message, /güvenlik anahtarı/i);

  const createdRequestEventCount = database.countEventsByType("request.created");
  const manualRequestResult = database.createManualRequest({
    requestType: "restaurant_reservation",
    customerName: "Manuel Smoke Misafir",
    customerPhone: "0555 333 44 55",
    dateText: "Bu akşam",
    startDate: "2026-07-18",
    endDate: "",
    time: "20:30",
    guestCount: 4,
    adultCount: 0,
    childCount: 0,
    message: "Telefonla bahçe masası istedi.",
    priority: "high"
  });
  assert.equal(manualRequestResult.ok, true);
  assert.equal(database.countEventsByType("request.created"), createdRequestEventCount + 1);
  const manualRequest = manualRequestResult.dashboardData.requests.find((request) => request.id === manualRequestResult.savedId);
  assert.ok(manualRequest);
  assert.equal(manualRequest.source, "manual");
  assert.equal(manualRequest.customer_phone, "+905553334455");
  assert.equal(manualRequest.sync_status, "local_only");
  assert.equal(manualRequest.status, "new");
  assert.equal(manualRequest.priority, "high");
  assert.equal(manualRequest.request_type, "restaurant_reservation");
  const manualCustomer = manualRequestResult.dashboardData.customers.find((customer) => customer.id === manualRequest.customer_id);
  assert.ok(manualCustomer);
  assert.equal(manualCustomer.fullName, "Manuel Smoke Misafir");
  assert.equal(manualCustomer.phone, "+905553334455");
  assert.equal(manualCustomer.source, "manual");
  assert.deepEqual(manualCustomer.tags, ["manuel", "talep"]);

  const requestStatusResult = database.updateRequestStatus({
    requestId: "request_demo_001",
    status: "answered"
  });
  assert.equal(requestStatusResult.ok, true);
  assert.ok(requestStatusResult.dashboardData.requests.some((request) => request.id === "request_demo_001" && request.status === "answered"));

  const roomStatusResult = database.updateRoomStatus({
    roomId: "room_101",
    status: "cleaning"
  });
  assert.equal(roomStatusResult.ok, true);
  assert.ok(roomStatusResult.dashboardData.rooms.some((room) => room.id === "room_101" && room.status === "cleaning"));

  const tableStatusResult = database.updateTableStatus({
    tableId: "table_001",
    status: "bill_waiting"
  });
  assert.equal(tableStatusResult.ok, true);
  assert.ok(tableStatusResult.dashboardData.tables.some((table) => table.id === "table_001" && table.status === "bill_waiting"));

  const taskStatusResult = database.updateDailyTaskStatus({
    taskId: "task_demo_001",
    status: "done"
  });
  assert.equal(taskStatusResult.ok, true);
  assert.ok(taskStatusResult.dashboardData.dailyTasks.some((task) => task.id === "task_demo_001" && task.status === "done"));
  assert.ok(taskStatusResult.dashboardData.summary.pendingDailyTasks >= 1);

  const reservationStatusResult = database.updateReservationStatus({
    reservationId: "reservation_demo_001",
    status: "approved"
  });
  assert.equal(reservationStatusResult.ok, true);
  assert.ok(reservationStatusResult.dashboardData.reservations.some((reservation) => reservation.id === "reservation_demo_001" && reservation.status === "approved"));
  assert.ok(reservationStatusResult.dashboardData.rooms.some((room) => room.id === "room_101" && room.status === "reserved"));

  const reopenRequestForSuggestion = database.updateRequestStatus({
    requestId: "request_demo_001",
    status: "new"
  });
  assert.equal(reopenRequestForSuggestion.ok, true);

  const aiSuggestionResult = database.saveRequestAiSuggestion({
    requestId: "request_demo_001",
    summary: "Smoke AI özet",
    suggestedReply: "Merhaba Demo Misafir, smoke AI cevap taslağı hazır.",
    missingFields: []
  });
  assert.equal(aiSuggestionResult.ok, true);
  assert.ok(aiSuggestionResult.dashboardData.requests.some((request) => request.id === "request_demo_001" && request.ai_suggested_reply.includes("smoke AI")));
  assert.ok(aiSuggestionResult.dashboardData.summary.preparedWhatsAppMessages >= 1);
  assert.ok(database.getAndroidPreparedMessages().some((message) => message.requestId === "request_demo_001" && message.message.includes("smoke AI")));

  const rejectedWhatsAppSentResult = database.markWhatsAppMessageSent({
    requestId: "request_demo_001",
    message: "AI taslağından farklı bir metin"
  });
  assert.equal(rejectedWhatsAppSentResult.ok, false);

  const preparedBeforeSend = aiSuggestionResult.dashboardData.summary.preparedWhatsAppMessages;
  const whatsappSentResult = database.markWhatsAppMessageSent({
    requestId: "request_demo_001",
    message: "Merhaba Demo Misafir, smoke AI cevap taslağı hazır."
  });
  assert.equal(whatsappSentResult.ok, true);
  assert.equal(whatsappSentResult.dashboardData.summary.preparedWhatsAppMessages, preparedBeforeSend - 1);
  assert.equal(database.getAndroidPreparedMessages().some((message) => message.requestId === "request_demo_001"), false);
  assert.ok(database.countEventsByType("whatsapp.message_sent") >= 1);

  const workspaceEntry = database.saveAiWorkspaceHistory({
    mode: "summary",
    requestId: "request_demo_001",
    requestLabel: "Demo Misafir • Pansiyon rezervasyonu",
    instructions: "Eksik bilgileri öne çıkar.",
    content: "Demo Misafir balkonlu oda için bilgi istiyor.",
    summary: "AI çalışma alanı smoke özeti",
    missingFields: ["giriş saati"],
    provider: "openai_compatible",
    model: "smoke-model-v1",
    fallback: false
  });
  assert.ok(workspaceEntry.id.startsWith("ai_conv_"));
  const workspaceHistory = database.getAiWorkspaceHistory();
  assert.equal(workspaceHistory[0].id, workspaceEntry.id);
  assert.equal(workspaceHistory[0].mode, "summary");
  assert.deepEqual(workspaceHistory[0].missingFields, ["giriş saati"]);

  const workspaceSaveResult = database.saveAiWorkspaceResult({
    mode: "summary",
    requestId: "request_demo_001",
    content: "Düzenlenen çalışma alanı özeti.",
    summary: workspaceEntry.summary,
    missingFields: workspaceEntry.missingFields
  });
  assert.equal(workspaceSaveResult.ok, true);
  assert.ok(workspaceSaveResult.dashboardData.requests.some((request) => request.id === "request_demo_001" && request.ai_summary === "Düzenlenen çalışma alanı özeti."));

  const conversionResult = database.convertRequestToReservation("request_demo_001");
  assert.equal(conversionResult.ok, true);
  assert.equal(conversionResult.reservationId, "reservation_demo_001");
  assert.equal(conversionResult.dashboardData.summary.newRequests, 1);
  assert.equal(conversionResult.dashboardData.summary.pendingReservations, 0);
  assert.ok(conversionResult.dashboardData.requests.some((request) => request.id === "request_demo_001" && request.status === "converted_to_reservation"));
  assert.ok(conversionResult.dashboardData.requests.some((request) => request.id === manualRequestResult.savedId && request.status === "new"));

  database.upsertRequests([
    {
      id: "request_smoke_customer_001",
      customer_id: "",
      source: "web_form",
      request_type: "pension_reservation",
      status: "new",
      customer_name: "Smoke Yeni Misafir",
      customer_phone: "+905551112299",
      date_text: "22 Temmuz",
      start_date: "2026-07-22",
      end_date: "2026-07-23",
      time: "",
      guest_count: 2,
      adult_count: 2,
      child_count: 0,
      message: "Sessiz oda için bilgi almak istiyorum.",
      ai_summary: "",
      ai_suggested_reply: "",
      whatsapp_message: "",
      assigned_to: "",
      priority: "normal",
      sync_status: "synced",
      created_at: "2026-07-11T11:00:00+03:00",
      updated_at: "2026-07-11T11:00:00+03:00"
    }
  ]);
  const customerDashboard = database.getDashboardData();
  const smokeCustomer = customerDashboard.customers.find((customer) => customer.fullName === "Smoke Yeni Misafir");
  assert.ok(smokeCustomer);
  assert.equal(smokeCustomer.phone, "+905551112299");
  assert.ok(customerDashboard.requests.some((request) => request.id === "request_smoke_customer_001" && request.customer_id === smokeCustomer.id));

  const categoryResult = database.saveMenuCategory({
    name: "Smoke Kategori",
    description: "DB smoke test kategorisi.",
    is_active: true,
    sort_order: 90
  });
  assert.equal(categoryResult.ok, true);

  const itemResult = database.saveMenuItem({
    category_id: categoryResult.savedId,
    name: "Smoke Ürün",
    description: "DB smoke test ürünü.",
    price: 42,
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: ["test"],
    tags: ["smoke"],
    sort_order: 10
  });
  assert.equal(itemResult.ok, true);
  assertTableOrderFlow(database, { appPath, dataDir, categoryId: categoryResult.savedId, menuItemId: itemResult.savedId });
  assertAndroidActionFlow(database, itemResult.savedId, manualRequestResult.savedId);

  const dashboardData = database.getDashboardData();
  assert.ok(dashboardData.menu.categories.some((category) => category.id === categoryResult.savedId));
  assert.ok(dashboardData.menu.items.some((item) => item.id === itemResult.savedId && item.price === 42));
  assert.ok(dashboardData.summary.activeMenuCategories >= 4);
  assert.ok(dashboardData.summary.availableMenuItems >= 6);

  const publishedEventCount = database.countEventsByType("menu.published");
  database.markMenuPublished();
  assert.equal(database.countEventsByType("menu.published"), publishedEventCount + 1);

  const completedSyncCount = database.countEventsByType("sync.completed");
  database.recordSyncEvent({
    direction: "pull",
    entityType: "request",
    ok: true,
    recordCount: 2
  });
  assert.equal(database.countEventsByType("sync.completed"), completedSyncCount + 1);

  const failedSyncCount = database.countEventsByType("sync.failed");
  database.recordSyncEvent({
    direction: "push",
    entityType: "menu",
    ok: false,
    message: "Smoke sync failure",
    status: 500
  });
  assert.equal(database.countEventsByType("sync.failed"), failedSyncCount + 1);

  assertLegacyAiMigration(appPath, join(dataDir, "legacy-migration"));

  console.log(`desktop-menu-db-ok: setup ${categoryResult.savedId} ${itemResult.savedId}`);
} finally {
  database.close();
}

function assertReadableSqliteBackup(backupFilePath) {
  const backupDb = new DatabaseSync(backupFilePath);

  try {
    assert.equal(String(scalar(backupDb, "PRAGMA integrity_check")), "ok");
    assert.equal(scalar(backupDb, "SELECT display_name FROM business WHERE deleted_at = '' LIMIT 1"), "Deniz Çiçeği Pansiyon & Kafe");
    assert.equal(scalar(backupDb, "SELECT sync_secret FROM settings WHERE deleted_at = '' LIMIT 1"), "smoke-secret-12345");
    assert.equal(Number(scalar(backupDb, "SELECT setup_completed FROM settings WHERE deleted_at = '' LIMIT 1")), 1);
    assert.equal(scalar(backupDb, "SELECT ai_service FROM settings WHERE deleted_at = '' LIMIT 1"), "openrouter");
    assert.equal(scalar(backupDb, "SELECT ai_api_key_encrypted FROM settings WHERE deleted_at = '' LIMIT 1"), "safe-storage:v1:opaque-smoke-value-002");
    assert.ok(Number(scalar(backupDb, "SELECT COUNT(*) FROM rooms WHERE deleted_at = ''")) >= 3);
    assert.ok(Number(scalar(backupDb, "SELECT COUNT(*) FROM tables WHERE deleted_at = ''")) >= 3);
    assert.equal(scalar(backupDb, "SELECT customer_name FROM requests WHERE id = 'request_demo_001'"), "Demo Misafir");
  } finally {
    backupDb.close();
  }
}

function assertTableOrderFlow(database, { appPath, dataDir, categoryId, menuItemId }) {
  const reservedTable = database.updateTableStatus({ tableId: "table_002", status: "reserved" });
  assert.equal(reservedTable.ok, true);
  assert.equal(reservedTable.dashboardData.tables.find((table) => table.id === "table_002")?.status, "reserved");

  const opened = database.openTableOrder("table_002");
  assert.equal(opened.ok, true);
  assert.equal(opened.order.status, "open");
  assert.equal(opened.dashboardData.tables.find((table) => table.id === "table_002")?.status, "occupied");
  assert.equal(database.openTableOrder("table_002").order.id, opened.order.id);

  const added = database.addTableOrderItem({
    orderId: opened.order.id,
    menuItemId,
    quantity: 1,
    note: "İlk snapshot"
  });
  assert.equal(added.ok, true);
  assert.equal(added.order.items[0].productName, "Smoke Ürün");
  assert.equal(added.order.items[0].unitPrice, 42);
  assert.equal(added.order.items[0].currency, "TRY");
  const firstItemId = added.order.items[0].id;

  const renamedMenuItem = database.saveMenuItem({
    id: menuItemId,
    category_id: categoryId,
    name: "Yeni Smoke Ürün",
    description: "Ad değişikliği snapshot testi.",
    price: 42,
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: [],
    tags: ["smoke"],
    sort_order: 10
  });
  assert.equal(renamedMenuItem.ok, true);
  const addedAfterRename = database.addTableOrderItem({
    orderId: opened.order.id,
    menuItemId,
    quantity: 1,
    note: ""
  });
  assert.equal(addedAfterRename.ok, true);
  assert.deepEqual(addedAfterRename.order.items.map((item) => item.productName), ["Smoke Ürün", "Yeni Smoke Ürün"]);
  assert.equal(addedAfterRename.order.total, 84);

  const repricedMenuItem = database.saveMenuItem({
    id: menuItemId,
    category_id: categoryId,
    name: "Yeni Smoke Ürün",
    description: "Fiyat değişikliği snapshot testi.",
    price: 57,
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: [],
    tags: ["smoke"],
    sort_order: 10
  });
  assert.equal(repricedMenuItem.ok, true);
  const orderAfterMenuReprice = database.getActiveTableOrder("table_002");
  assert.ok(orderAfterMenuReprice);
  assert.deepEqual(orderAfterMenuReprice.items.map((item) => item.unitPrice), [42, 42]);
  assert.equal(orderAfterMenuReprice.total, 84);
  assert.equal(database.saveMenuItem({
    id: menuItemId,
    category_id: categoryId,
    name: "Yeni Smoke Ürün",
    description: "Ad değişikliği snapshot testi.",
    price: 42,
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: [],
    tags: ["smoke"],
    sort_order: 10
  }).ok, true);

  const foreignCurrencyItem = database.saveMenuItem({
    category_id: categoryId,
    name: "Dövizli Smoke Ürün",
    description: "Karma para birimi koruması.",
    price: 10,
    currency: "USD",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: [],
    tags: ["smoke"],
    sort_order: 20
  });
  assert.equal(foreignCurrencyItem.ok, true);
  const mixedCurrencyResult = database.addTableOrderItem({
    orderId: opened.order.id,
    menuItemId: foreignCurrencyItem.savedId,
    quantity: 1,
    note: ""
  });
  assert.equal(mixedCurrencyResult.ok, false);
  assert.match(mixedCurrencyResult.message, /TRY.*USD/);

  const increased = database.updateTableOrderItemQuantity({ itemId: firstItemId, quantity: 2 });
  assert.equal(increased.ok, true);
  assert.equal(increased.order.itemCount, 3);
  assert.equal(increased.order.total, 126);
  const rejectedZeroQuantity = database.updateTableOrderItemQuantity({ itemId: firstItemId, quantity: 0 });
  assert.equal(rejectedZeroQuantity.ok, false);
  assert.equal(database.getActiveTableOrder("table_002").items.find((item) => item.id === firstItemId)?.quantity, 2);
  const noted = database.updateTableOrderItemNote({ itemId: firstItemId, note: "Kalıcı ürün notu" });
  assert.equal(noted.ok, true);
  assert.equal(noted.order.items.find((item) => item.id === firstItemId)?.note, "Kalıcı ürün notu");
  const secondItemId = noted.order.items.find((item) => item.id !== firstItemId)?.id;
  assert.ok(secondItemId);
  const removed = database.removeTableOrderItem(secondItemId);
  assert.equal(removed.ok, true);
  assert.equal(removed.order.total, 84);
  const preparing = database.updateTableOrderStatus({ orderId: opened.order.id, status: "preparing" });
  assert.equal(preparing.ok, true);
  assert.equal(preparing.dashboardData.tables.find((table) => table.id === "table_002")?.status, "occupied");
  const payment = database.updateTableOrderStatus({ orderId: opened.order.id, status: "payment" });
  assert.equal(payment.ok, true);
  assert.equal(payment.dashboardData.tables.find((table) => table.id === "table_002")?.status, "bill_waiting");

  const secondConnection = new DesktopDatabase({ appPath, userDataPath: dataDir });
  try {
    secondConnection.initialize();
    const paid = secondConnection.closeTableOrder({ orderId: opened.order.id, status: "paid" });
    assert.equal(paid.ok, true);
    assert.equal(paid.dashboardData.tables.find((table) => table.id === "table_002")?.status, "available");
  } finally {
    secondConnection.close();
  }
  const rejectedClosedMutation = database.addTableOrderItem({
    orderId: opened.order.id,
    menuItemId,
    quantity: 1,
    note: ""
  });
  assert.equal(rejectedClosedMutation.ok, false);
  assert.equal(database.getActiveTableOrder("table_002"), null);

  const reopened = database.openTableOrder("table_002");
  assert.equal(reopened.ok, true);
  assert.notEqual(reopened.order.id, opened.order.id);
  assert.equal(reopened.dashboardData.tables.find((table) => table.id === "table_002")?.status, "occupied");
  const cancelled = database.closeTableOrder({ orderId: reopened.order.id, status: "cancelled" });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.dashboardData.tables.find((table) => table.id === "table_002")?.status, "available");
  assert.equal(database.getActiveTableOrder("table_002"), null);
}

function assertAndroidActionFlow(database, menuItemId, convertibleRequestId) {
  const preparedMessageResult = database.saveRequestAiSuggestion({
    requestId: "request_smoke_customer_001",
    summary: "Android cevap temizleme testi",
    suggestedReply: "Merhaba Smoke Yeni Misafir, Android için hazır cevap.",
    missingFields: []
  });
  assert.equal(preparedMessageResult.ok, true);
  const preparedMessageCount = preparedMessageResult.dashboardData.summary.preparedWhatsAppMessages;
  assert.equal(database.getAndroidPreparedMessages().some((message) => message.requestId === "request_smoke_customer_001"), true);
  const requestBeforeAnswer = preparedMessageResult.dashboardData.requests.find((request) => request.id === "request_smoke_customer_001");
  assert.ok(requestBeforeAnswer);

  const answeredRequestResult = database.applyAndroidAction(androidAction("android_action_request_answered_001", "customer_request_mark_answered", {
    request_id: "request_smoke_customer_001",
    expected_updated_at: requestBeforeAnswer.updated_at
  }));
  assert.equal(answeredRequestResult.ok, true);
  assert.equal(database.getDashboardData().requests.find((request) => request.id === "request_smoke_customer_001")?.status, "answered");
  assert.equal(database.getAndroidPreparedMessages().some((message) => message.requestId === "request_smoke_customer_001"), false);
  assert.equal(database.getDashboardData().summary.preparedWhatsAppMessages, preparedMessageCount - 1);

  const reopenedRequestResult = database.applyAndroidAction(androidAction("android_action_request_reopen_001", "customer_request_reopen", {
    request_id: "request_smoke_customer_001"
  }));
  assert.equal(reopenedRequestResult.ok, true);
  assert.equal(database.getDashboardData().requests.find((request) => request.id === "request_smoke_customer_001")?.status, "new");

  const staleRequestResult = database.applyAndroidAction(androidAction("android_action_request_stale_001", "customer_request_approve", {
    request_id: "request_smoke_customer_001",
    expected_updated_at: requestBeforeAnswer.updated_at
  }));
  assert.equal(staleRequestResult.ok, false);
  assert.match(staleRequestResult.message, /değişmiş/i);
  assert.equal(database.getDashboardData().requests.find((request) => request.id === "request_smoke_customer_001")?.status, "new");

  const approvedRequestResult = database.applyAndroidAction(androidAction("android_action_request_approve_001", "customer_request_approve", {
    request_id: "request_smoke_customer_001"
  }));
  assert.equal(approvedRequestResult.ok, true);
  assert.equal(database.getDashboardData().requests.find((request) => request.id === "request_smoke_customer_001")?.status, "approved");

  const rejectedRequestResult = database.applyAndroidAction(androidAction("android_action_request_reject_001", "customer_request_reject", {
    request_id: "request_smoke_customer_001"
  }));
  assert.equal(rejectedRequestResult.ok, true);
  assert.equal(database.getDashboardData().requests.find((request) => request.id === "request_smoke_customer_001")?.status, "rejected");

  const convertedRequestResult = database.applyAndroidAction(androidAction("android_action_request_convert_001", "customer_request_convert_to_reservation", {
    request_id: convertibleRequestId
  }));
  assert.equal(convertedRequestResult.ok, true);
  const convertedDashboard = database.getDashboardData();
  assert.equal(convertedDashboard.requests.find((request) => request.id === convertibleRequestId)?.status, "converted_to_reservation");
  assert.ok(convertedDashboard.reservations.some((reservation) => reservation.requestId === convertibleRequestId && reservation.status === "approved"));

  const cancelledReservationResult = database.applyAndroidAction(androidAction("android_action_reservation_cancel_001", "reservation_cancel", {
    reservation_id: "reservation_demo_001"
  }));
  assert.equal(cancelledReservationResult.ok, true);
  assert.equal(database.getDashboardData().reservations.find((reservation) => reservation.id === "reservation_demo_001")?.status, "cancelled");
  assert.equal(database.getDashboardData().rooms.find((room) => room.id === "room_101")?.status, "available");

  const approvedReservationResult = database.applyAndroidAction(androidAction("android_action_reservation_approve_001", "reservation_approve", {
    reservation_id: "reservation_demo_001"
  }));
  assert.equal(approvedReservationResult.ok, true);
  assert.equal(database.getDashboardData().rooms.find((room) => room.id === "room_101")?.status, "reserved");

  const rejectedReservationResult = database.applyAndroidAction(androidAction("android_action_reservation_reject_001", "reservation_reject", {
    reservation_id: "reservation_demo_001"
  }));
  assert.equal(rejectedReservationResult.ok, true);
  assert.equal(database.getDashboardData().reservations.find((reservation) => reservation.id === "reservation_demo_001")?.status, "rejected");
  assert.equal(database.getDashboardData().rooms.find((room) => room.id === "room_101")?.status, "available");

  const roomEventCount = database.countEventsByType("room.status_changed");
  const roomAction = androidAction("android_action_room_001", "room_status_update", {
    room_id: "room_101",
    status: "maintenance"
  });
  const roomResult = database.applyAndroidAction(roomAction);
  assert.equal(roomResult.ok, true);
  assert.equal(roomResult.alreadyApplied, false);
  assert.equal(database.getDashboardData().rooms.find((room) => room.id === "room_101")?.status, "maintenance");
  assert.equal(database.countEventsByType("room.status_changed"), roomEventCount + 1);

  const duplicateRoomResult = database.applyAndroidAction(roomAction);
  assert.equal(duplicateRoomResult.ok, true);
  assert.equal(duplicateRoomResult.alreadyApplied, true);
  assert.equal(database.countEventsByType("room.status_changed"), roomEventCount + 1);

  const failedAction = database.applyAndroidAction(androidAction("android_action_missing_room", "room_status_update", {
    room_id: "room_missing",
    status: "cleaning"
  }));
  assert.equal(failedAction.ok, false);
  assert.match(failedAction.message, /bulunamadı/i);

  const taskCompleteResult = database.applyAndroidAction(androidAction("android_action_task_complete_001", "daily_task_complete", {
    task_id: "task_demo_001"
  }));
  assert.equal(taskCompleteResult.ok, true);
  assert.equal(database.getDashboardData().dailyTasks.find((task) => task.id === "task_demo_001")?.status, "done");

  const taskCancelResult = database.applyAndroidAction(androidAction("android_action_task_cancel_001", "daily_task_cancel", {
    task_id: "task_demo_001"
  }));
  assert.equal(taskCancelResult.ok, true);
  assert.equal(database.getDashboardData().dailyTasks.find((task) => task.id === "task_demo_001")?.status, "cancelled");

  const taskReopenResult = database.applyAndroidAction(androidAction("android_action_task_reopen_001", "daily_task_reopen", {
    task_id: "task_demo_001"
  }));
  assert.equal(taskReopenResult.ok, true);
  assert.equal(database.getDashboardData().dailyTasks.find((task) => task.id === "task_demo_001")?.status, "pending");

  const tableStatusResult = database.applyAndroidAction(androidAction("android_action_table_status_001", "table_status_update", {
    table_id: "table_001",
    status: "available"
  }));
  assert.equal(tableStatusResult.ok, true);
  assert.equal(database.getDashboardData().tables.find((table) => table.id === "table_001")?.status, "available");

  const staleBatchTable = database.getDashboardData().tables.find((table) => table.id === "table_002");
  assert.ok(staleBatchTable);
  const competingOrder = database.openTableOrder("table_002");
  assert.equal(competingOrder.ok, true);
  const failedBatchParentId = "android_action_order_open_conflict_001";
  const failedBatchParent = database.applyAndroidAction(androidAction(failedBatchParentId, "table_order_open", {
    table_id: "table_002",
    expected_table_updated_at: staleBatchTable.updatedAt
  }));
  assert.equal(failedBatchParent.ok, false);
  assert.match(failedBatchParent.message, /değişmiş/i);
  const rejectedBatchChild = database.applyAndroidAction(androidAction("android_action_order_child_conflict_001", "table_order_add_item", {
    table_id: "table_002",
    menu_item_id: menuItemId,
    quantity: 1,
    depends_on_action_id: failedBatchParentId
  }));
  assert.equal(rejectedBatchChild.ok, false);
  assert.match(rejectedBatchChild.message, /bağlı adisyon açma/i);
  assert.equal(database.getActiveTableOrder("table_002").items.length, 0);
  assert.equal(database.closeTableOrder({ orderId: competingOrder.order.id, status: "cancelled" }).ok, true);

  const openActionId = "android_action_order_open_001";
  const openResult = database.applyAndroidAction(androidAction(openActionId, "table_order_open", {
    table_id: "table_001"
  }));
  assert.equal(openResult.ok, true);
  const openedOrder = database.getActiveTableOrder("table_001");
  assert.ok(openedOrder);
  assert.equal(openedOrder.status, "open");
  assert.equal(database.getDashboardData().tables.find((table) => table.id === "table_001")?.status, "occupied");

  const invariantDb = new DatabaseSync(database.databasePath);
  try {
    invariantDb
      .prepare("UPDATE reservations SET status = 'pending', table_ids_json = '[\"table_001\"]', updated_at = ? WHERE id = 'reservation_demo_001'")
      .run("2026-07-17T12:30:00.000Z");
    invariantDb
      .prepare("UPDATE tables SET current_customer_id = 'customer_demo_001', current_reservation_id = 'reservation_demo_001' WHERE id = 'table_001'")
      .run();
  } finally {
    invariantDb.close();
  }
  const conflictingReservationResult = database.applyAndroidAction(androidAction("android_action_reservation_order_conflict_001", "reservation_approve", {
    reservation_id: "reservation_demo_001"
  }));
  assert.equal(conflictingReservationResult.ok, false);
  assert.match(conflictingReservationResult.message, /aktif adisyon/i);
  assert.equal(database.getActiveTableOrder("table_001")?.id, openedOrder.id);
  assert.equal(database.getDashboardData().tables.find((table) => table.id === "table_001")?.status, "occupied");
  const desktopReservationConflict = database.updateReservationStatus({
    reservationId: "reservation_demo_001",
    status: "cancelled"
  });
  assert.equal(desktopReservationConflict.ok, false);
  assert.match(desktopReservationConflict.message, /aktif adisyon/i);

  const addResult = database.applyAndroidAction(androidAction("android_action_order_item_001", "table_order_add_item", {
    table_id: "table_001",
    menu_item_id: menuItemId,
    quantity: 2,
    depends_on_action_id: openActionId
  }));
  assert.equal(addResult.ok, true);
  const orderWithItem = database.getActiveTableOrder("table_001");
  assert.equal(orderWithItem.items.length, 1);
  assert.equal(orderWithItem.items[0].quantity, 2);
  assert.equal(orderWithItem.items[0].productName, "Yeni Smoke Ürün");

  const staleItemUpdatedAt = orderWithItem.items[0].updatedAt;
  const concurrentQuantityResult = database.updateTableOrderItemQuantity({
    itemId: orderWithItem.items[0].id,
    quantity: 4
  });
  assert.equal(concurrentQuantityResult.ok, true);
  const staleQuantityResult = database.applyAndroidAction(androidAction("android_action_order_quantity_stale_001", "table_order_update_item_quantity", {
    item_id: orderWithItem.items[0].id,
    quantity: 3,
    expected_item_updated_at: staleItemUpdatedAt
  }));
  assert.equal(staleQuantityResult.ok, false);
  assert.match(staleQuantityResult.message, /değişmiş/i);
  assert.equal(database.getActiveTableOrder("table_001").items[0].quantity, 4);

  const currentItem = database.getActiveTableOrder("table_001").items[0];
  const quantityResult = database.applyAndroidAction(androidAction("android_action_order_quantity_001", "table_order_update_item_quantity", {
    item_id: orderWithItem.items[0].id,
    quantity: 3,
    expected_item_updated_at: currentItem.updatedAt
  }));
  assert.equal(quantityResult.ok, true);
  assert.equal(database.getActiveTableOrder("table_001").items[0].quantity, 3);
  const repeatedQuantityResult = database.applyAndroidAction(androidAction("android_action_order_quantity_repeat_001", "table_order_update_item_quantity", {
    item_id: orderWithItem.items[0].id,
    quantity: 3,
    expected_item_updated_at: currentItem.updatedAt
  }));
  assert.equal(repeatedQuantityResult.ok, false);
  assert.match(repeatedQuantityResult.message, /değişmiş/i);
  assert.equal(database.getActiveTableOrder("table_001").items[0].quantity, 3);

  const preparingResult = database.applyAndroidAction(androidAction("android_action_order_preparing_001", "table_order_set_status", {
    order_id: openedOrder.id,
    status: "preparing"
  }));
  assert.equal(preparingResult.ok, true);
  assert.equal(database.getActiveTableOrder("table_001").status, "preparing");
  assert.equal(database.getActiveTableOrder("table_001").items[0].status, "preparing");

  const servedResult = database.applyAndroidAction(androidAction("android_action_order_served_001", "table_order_set_status", {
    order_id: openedOrder.id,
    status: "served"
  }));
  assert.equal(servedResult.ok, true);
  assert.equal(database.getActiveTableOrder("table_001").status, "served");
  assert.equal(database.getActiveTableOrder("table_001").items[0].status, "served");

  const removeResult = database.applyAndroidAction(androidAction("android_action_order_remove_001", "table_order_remove_item", {
    item_id: orderWithItem.items[0].id
  }));
  assert.equal(removeResult.ok, true);
  assert.equal(database.getActiveTableOrder("table_001").items.length, 0);
  assert.equal(database.getActiveTableOrder("table_001").total, 0);

  const replacementAddResult = database.applyAndroidAction(androidAction("android_action_order_item_002", "table_order_add_item", {
    order_id: openedOrder.id,
    menu_item_id: menuItemId,
    quantity: 1
  }));
  assert.equal(replacementAddResult.ok, true);
  assert.equal(database.getActiveTableOrder("table_001").items.length, 1);

  const paymentResult = database.applyAndroidAction(androidAction("android_action_order_payment_001", "table_order_set_status", {
    order_id: openedOrder.id,
    status: "payment"
  }));
  assert.equal(paymentResult.ok, true);
  assert.equal(database.getDashboardData().tables.find((table) => table.id === "table_001")?.status, "bill_waiting");

  const closeResult = database.applyAndroidAction(androidAction("android_action_order_close_001", "table_order_close", {
    order_id: openedOrder.id,
    status: "paid"
  }));
  assert.equal(closeResult.ok, true);
  assert.equal(database.getActiveTableOrder("table_001"), null);
  const tableAfterClose = database.getDashboardData().tables.find((table) => table.id === "table_001");
  assert.equal(tableAfterClose?.status, "available");
  assert.equal(tableAfterClose?.currentReservationId, "");
  assert.equal(tableAfterClose?.currentCustomerId, "");
  const reservationAfterClose = database.updateReservationStatus({
    reservationId: "reservation_demo_001",
    status: "cancelled"
  });
  assert.equal(reservationAfterClose.ok, true);

  const secondOpenResult = database.applyAndroidAction(androidAction("android_action_order_open_002", "table_order_open", {
    table_id: "table_001"
  }));
  assert.equal(secondOpenResult.ok, true);
  const secondOrder = database.getActiveTableOrder("table_001");
  assert.ok(secondOrder);
  const staleOrderAddResult = database.applyAndroidAction(androidAction("android_action_order_stale_id_001", "table_order_add_item", {
    order_id: openedOrder.id,
    table_id: "table_001",
    menu_item_id: menuItemId,
    quantity: 1
  }));
  assert.equal(staleOrderAddResult.ok, false);
  assert.equal(database.getActiveTableOrder("table_001").items.length, 0);
  const cancelResult = database.applyAndroidAction(androidAction("android_action_order_cancel_001", "table_order_close", {
    order_id: secondOrder.id,
    status: "cancelled"
  }));
  assert.equal(cancelResult.ok, true);
  assert.equal(database.getActiveTableOrder("table_001"), null);
  assert.equal(database.getDashboardData().tables.find((table) => table.id === "table_001")?.status, "available");
}

function androidAction(id, actionType, payload) {
  return {
    id,
    action_type: actionType,
    payload,
    created_at: "2026-07-17T10:00:00.000Z",
    device_id: "android-smoke-device",
    status: "pending",
    error_message: "",
    processed_at: ""
  };
}

function assertLegacyAiMigration(desktopAppPath, legacyDataDir) {
  mkdirSync(legacyDataDir, { recursive: true });
  const legacyDatabasePath = join(legacyDataDir, "yardimci-asistan.sqlite");
  const legacyDb = new DatabaseSync(legacyDatabasePath);

  try {
    legacyDb.exec(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    legacyDb.exec(readFileSync(join(desktopAppPath, "db", "migrations", "001_initial_schema.sql"), "utf8"));
    legacyDb.exec(readFileSync(join(desktopAppPath, "db", "migrations", "002_setup_completion.sql"), "utf8"));
    legacyDb.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("001_initial_schema.sql", "2026-07-10T10:00:00.000Z");
    legacyDb.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("002_setup_completion.sql", "2026-07-10T10:00:01.000Z");
    legacyDb.exec(`
      INSERT INTO business (
        id, name, display_name, business_type, whatsapp, modules_json, created_at, updated_at
      ) VALUES (
        'business_demo_001', 'legacy-smoke', 'Legacy Smoke', 'other', '+905551112233', '{}',
        '2026-07-10T10:00:00.000Z', '2026-07-10T10:00:00.000Z'
      );

      INSERT INTO settings (
        id, business_id, web_module_url, sync_secret, ai_enabled, ai_provider, ai_model,
        created_at, updated_at, setup_completed
      ) VALUES (
        'settings_demo_001', 'business_demo_001', 'https://yardimciasistan.alwaysdata.net/', 'legacy-secret-12345',
        1, 'openai_compatible', 'legacy-model',
        '2026-07-10T10:00:00.000Z', '2026-07-10T10:00:00.000Z', 1
      );
    `);
  } finally {
    legacyDb.close();
  }

  const migratedDatabase = new DesktopDatabase({
    appPath: desktopAppPath,
    userDataPath: legacyDataDir
  });

  try {
    migratedDatabase.initialize();
    const migratedSetup = migratedDatabase.getSetupData();
    assert.equal(migratedSetup.webModuleUrl, "https://yardimciasistan.alwaysdata.net/yardimci-asistan");
    assert.equal(migratedSetup.aiEnabled, true);
    assert.equal(migratedSetup.aiProvider, "openai_compatible");
    assert.equal(migratedSetup.aiService, "openai");
    assert.equal(migratedSetup.aiModel, "legacy-model");
    assert.equal(migratedSetup.aiBaseUrl, "https://api.openai.com/v1");
    assert.equal(migratedSetup.aiTimeoutSeconds, 30);
    assert.equal(migratedSetup.aiApiKeyConfigured, false);
    assert.equal(migratedSetup.aiLastPublishedAt, "");
    assert.equal(migratedDatabase.getEncryptedAiApiKey(), "");
  } finally {
    migratedDatabase.close();
  }
}

function assertFilesDoNotContainSecrets(filePaths, secrets) {
  for (const filePath of filePaths) {
    const contents = readFileSync(filePath);
    for (const secret of secrets) {
      assert.equal(contents.includes(Buffer.from(secret, "utf8")), false, `${filePath} ham AI API anahtarını içermemeli.`);
    }
  }
}

function scalar(database, sql) {
  const row = database.prepare(sql).get();
  assert.ok(row, `Sorgu sonuç döndürmedi: ${sql}`);
  return Object.values(row)[0];
}
