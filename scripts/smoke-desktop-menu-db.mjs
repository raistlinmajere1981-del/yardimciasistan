import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { basename, join } from "node:path";
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
  const initialSetupResult = database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Menü Test İşletmesi",
    phone: "+905550002020",
    whatsapp: "+905550002020",
    syncSecret: "menu-smoke-secret",
    servicePreferences: { whatsapp: true, android: true },
  }));
  assert.equal(initialSetupResult.ok, true, initialSetupResult.ok ? "" : initialSetupResult.message);
  seedSmokeBusinessLayout(database.databasePath, {
    roomCount: 3,
    tableCategories: [{ name: "Salon", tableCount: 3 }]
  });
  // Test-only fixture: give the created rooms/tables stable smoke IDs so the
  // status-transition flows below can address them without demo seed data.
  {
    const seedDb = new DatabaseSync(database.databasePath);
    try {
      const firstRoom = seedDb.prepare("SELECT id FROM rooms WHERE deleted_at = '' ORDER BY sort_order, created_at LIMIT 1").get();
      assert.ok(firstRoom?.id, "Test setup should create at least one room");
      seedDb.prepare("UPDATE rooms SET id = 'room_101' WHERE id = ?").run(firstRoom.id);
      const createdTables = seedDb.prepare("SELECT id FROM tables WHERE deleted_at = '' ORDER BY sort_order, created_at LIMIT 2").all();
      assert.ok(createdTables.length >= 2, "Test setup should create at least two tables");
      seedDb.prepare("UPDATE tables SET id = 'table_001' WHERE id = ?").run(createdTables[0].id);
      seedDb.prepare("UPDATE tables SET id = 'table_002' WHERE id = ?").run(createdTables[1].id);
    } finally {
      seedDb.close();
    }
  }
  seedOperationalSmokeData(database.databasePath);
  seedSmokeMenu(database);

  if (process.argv.includes("--table-orders-only")) {
    const category = database.saveMenuCategory({ name: "Order pilot", description: "", is_active: true, sort_order: 1 });
    assert.equal(category.ok, true);
    const item = database.saveMenuItem({ category_id: category.savedId, name: "Smoke Ürün", description: "", price: 42,
      currency: "TRY", image_url: "", is_available: true, is_featured: false, allergens: [], tags: [], sort_order: 1 });
    assert.equal(item.ok, true);
    assertTableOrderFlow(database, { appPath, dataDir, categoryId: category.savedId, menuItemId: item.savedId });
    assertStockTrackingFlow(database, category.savedId);
    console.log("table-order-domain-smoke-ok: existing order and stock assertions");
  } else {
  assert.ok(database.getDashboardData().menu.items.length > 0);
  const initialTrackedItems = database.getDashboardData().menu.items.filter((item) => item.stock_quantity !== null);
  assert.equal(initialTrackedItems.length, 10, "The smoke menu must expose ten stock-tracked test items.");
  assert.equal(initialTrackedItems.filter((item) => item.stock_unit === "gram").length, 2);
  assert.equal(initialTrackedItems.find((item) => item.id === "smoke_item_006")?.stock_consumption_quantity, 200);

  const initialSetup = database.getSetupData();
  assert.equal(initialSetup.setupRequired, false);
  assert.equal(initialSetup.autoSyncEnabled, false);
  assert.equal(initialSetup.webModuleUrl, "https://example.test/yardimci-asistan");
  assert.equal(initialSetup.aiEnabled, false);
  assert.equal(initialSetup.aiService, "openai");
  assert.equal(initialSetup.aiProjectName, "");
  assert.equal(initialSetup.aiBaseUrl, "https://api.openai.com/v1");
  assert.equal(initialSetup.aiTimeoutSeconds, 30);
  assert.equal(initialSetup.aiApiKeyConfigured, false);
  assert.equal(initialSetup.aiLastPublishedAt, "");
  assert.equal(basename(database.backupPath), "backup");

  const initialSyncRuntime = database.getSyncRuntimeStatus();
  assert.equal(initialSyncRuntime.enabled, false);
  assert.match(initialSyncRuntime.clientId, /^desktop-[0-9a-f-]{36}$/);
  database.setAutoSyncEnabled(true);
  assert.equal(database.getSyncRuntimeStatus().enabled, true);
  database.setAutoSyncEnabled(false);
  assert.equal(database.getSyncRuntimeStatus().enabled, false);
  for (const job of database.getPendingSyncJobs()) {
    database.completeSyncJob(job.jobKey, job.sourceRevision);
  }
  assert.equal(database.getSyncRuntimeStatus().pendingJobs, 0);

  database.queueSyncJob("menu_publish");
  const firstPublishJob = database.getPendingSyncJobs().find((job) => job.jobType === "menu_publish");
  assert.ok(firstPublishJob);
  database.completeSyncJob(firstPublishJob.jobKey, firstPublishJob.sourceRevision);
  database.queueSyncJob("menu_publish");
  const failedJob = database.getPendingSyncJobs().find((job) => job.jobType === "menu_publish");
  assert.ok(failedJob);
  assert.ok(failedJob.sourceRevision > firstPublishJob.sourceRevision);
  database.failSyncJob(failedJob.jobKey, failedJob.sourceRevision, "geçici ağ hatası", "2100-01-01T00:00:00.000Z");
  assert.equal(database.getPendingSyncJobs().some((job) => job.jobType === "menu_publish"), false);
  database.queueSyncJob("menu_publish");
  const retriedJob = database.getPendingSyncJobs().find((job) => job.jobType === "menu_publish");
  assert.ok(retriedJob);
  assert.equal(retriedJob.attemptCount, 0);
  assert.equal(retriedJob.lastError, "");
  database.completeSyncJob(retriedJob.jobKey, retriedJob.sourceRevision);

  const firstRawAiApiKey = "smoke-raw-ai-key-never-persist-001";
  const firstEncryptedAiApiKey = "safe-storage:v1:opaque-smoke-value-001";
  const setupInput = {
    businessName: "Deniz Çiçeği Pansiyon & Kafe",
    profileId: "pension_restaurant",
    phone: "+905321234567",
    whatsapp: "+905321234567",
    email: "smoke@example.test",
    address: "Smoke adresi",
    webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
    syncSecret: "smoke-secret-12345",
    autoSyncEnabled: true,
    aiEnabled: true,
    aiProvider: "openai_compatible",
    aiService: "openrouter",
    aiProjectName: "",
    aiModel: "smoke-model-v1",
    aiBaseUrl: "https://openrouter.example.test/api/v1/",
    aiTimeoutSeconds: 30,
    aiApiKey: firstRawAiApiKey,
    clearAiApiKey: false,
    aiModelOptions: [],
    servicePreferences: {
      whatsapp: true,
      android: true
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
  assert.equal(database.getEncryptedAiApiKey("openrouter"), firstEncryptedAiApiKey);
  assert.equal(setupResult.setupData.aiProfiles.find((profile) => profile.service === "openrouter")?.model, "smoke-model-v1");
  assert.equal(setupResult.dashboardData.webModuleUrl, "https://yardimciasistan.alwaysdata.net/yardimci-asistan");
  assert.equal(basename(setupResult.dashboardData.backupPath), "backup");

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

  const groqRawAiApiKey = "smoke-raw-groq-key-never-persist-001";
  const groqEncryptedAiApiKey = "safe-storage:v1:opaque-groq-smoke-value-001";
  const multiProfileResult = database.saveInitialSetup(
    {
      ...setupInput,
      aiApiKey: "",
      aiProfiles: [{
        service: "groq",
        projectName: "",
        baseUrl: "https://api.groq.com/openai/v1",
        model: "groq-smoke-model",
        modelOptions: [],
        timeoutSeconds: 25,
        apiKey: groqRawAiApiKey,
        clearApiKey: false
      }]
    },
    { mode: "keep" },
    { groq: { mode: "replace", encryptedValue: groqEncryptedAiApiKey } }
  );
  assert.equal(multiProfileResult.ok, true);
  assert.equal(multiProfileResult.setupData.aiService, "openrouter");
  assert.equal(multiProfileResult.setupData.aiLastPublishedAt, publishedAt);
  assert.equal(database.getEncryptedAiApiKey("groq"), groqEncryptedAiApiKey);
  assert.equal(multiProfileResult.setupData.aiProfiles.find((profile) => profile.service === "groq")?.model, "groq-smoke-model");

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

  const googleRawAiApiKey = "smoke-raw-google-key-never-persist-001";
  const googleEncryptedAiApiKey = "safe-storage:v1:opaque-google-smoke-value-001";
  const missingGoogleProjectResult = database.saveInitialSetup(
    {
      ...setupInput,
      aiService: "gemini",
      aiProjectName: "",
      aiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      aiModel: "gemini-smoke",
      aiModelOptions: [
        { id: "gemini-smoke", label: "Gemini Smoke" },
        { id: "gemini-smoke-lite", label: "Gemini Smoke Lite" }
      ],
      aiApiKey: googleRawAiApiKey
    },
    { mode: "replace", encryptedValue: googleEncryptedAiApiKey }
  );
  assert.equal(missingGoogleProjectResult.ok, true);
  assert.equal(missingGoogleProjectResult.setupData.aiProjectName, "");
  assert.equal(missingGoogleProjectResult.setupData.aiApiKeyConfigured, true);
  assert.equal(database.getEncryptedAiApiKey("gemini"), googleEncryptedAiApiKey);

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
      aiModelOptions: [
        { id: "gemini-smoke", label: "Gemini Smoke" },
        { id: "gemini-smoke-lite", label: "Gemini Smoke Lite" }
      ],
      aiApiKey: ""
    },
    { mode: "keep" }
  );
  assert.equal(googleSetupResult.ok, true);
  assert.equal(googleSetupResult.setupData.aiService, "gemini");
  assert.equal(googleSetupResult.setupData.aiProjectName, "");
  assert.equal(googleSetupResult.setupData.aiBaseUrl, "https://generativelanguage.googleapis.com/v1beta");
  assert.deepEqual(
    googleSetupResult.setupData.aiProfiles.find((profile) => profile.service === "gemini")?.modelOptions,
    [
      { id: "gemini-smoke", label: "Gemini Smoke" },
      { id: "gemini-smoke-lite", label: "Gemini Smoke Lite" }
    ]
  );

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
  assert.equal(database.getEncryptedAiApiKey("openrouter"), secondEncryptedAiApiKey);
  assert.equal(database.getEncryptedAiApiKey("gemini"), googleEncryptedAiApiKey);
  assert.equal(replaceResult.setupData.aiProfiles.find((profile) => profile.service === "gemini")?.apiKeyConfigured, true);

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
  assert.equal(database.getEncryptedAiApiKey("openrouter"), "");
  assert.equal(database.getEncryptedAiApiKey("gemini"), googleEncryptedAiApiKey);

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
    requestId: "request_smoke_001",
    status: "answered"
  });
  assert.equal(requestStatusResult.ok, true);
  assert.ok(requestStatusResult.dashboardData.requests.some((request) => request.id === "request_smoke_001" && request.status === "answered"));

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
    taskId: "task_smoke_001",
    status: "done"
  });
  assert.equal(taskStatusResult.ok, true);
  assert.ok(taskStatusResult.dashboardData.dailyTasks.some((task) => task.id === "task_smoke_001" && task.status === "done"));
  assert.ok(taskStatusResult.dashboardData.summary.pendingDailyTasks >= 1);

  const reservationStatusResult = database.updateReservationStatus({
    reservationId: "reservation_smoke_001",
    status: "approved"
  });
  assert.equal(reservationStatusResult.ok, true);
  assert.ok(reservationStatusResult.dashboardData.reservations.some((reservation) => reservation.id === "reservation_smoke_001" && reservation.status === "approved"));
  // D-003/D-004: approving a reservation must not overwrite the operational
  // cleaning state. The planning link stays on the reservation itself.
  assert.ok(reservationStatusResult.dashboardData.rooms.some((room) => room.id === "room_101" && room.status === "cleaning"));
  assert.ok(reservationStatusResult.dashboardData.reservations.some((reservation) => reservation.id === "reservation_smoke_001" && reservation.roomIds.includes("room_101")));

  const reopenRequestForSuggestion = database.updateRequestStatus({
    requestId: "request_smoke_001",
    status: "new"
  });
  assert.equal(reopenRequestForSuggestion.ok, true);

  const aiSuggestionResult = database.saveRequestAiSuggestion({
    requestId: "request_smoke_001",
    summary: "Smoke AI özet",
    suggestedReply: "Merhaba Smoke Misafir, smoke AI cevap taslağı hazır.",
    missingFields: []
  });
  assert.equal(aiSuggestionResult.ok, true);
  assert.ok(aiSuggestionResult.dashboardData.requests.some((request) => request.id === "request_smoke_001" && request.ai_suggested_reply.includes("smoke AI")));
  assert.ok(aiSuggestionResult.dashboardData.summary.preparedWhatsAppMessages >= 1);
  assert.ok(database.getPreparedWhatsAppMessages().some((message) => message.requestId === "request_smoke_001" && message.message.includes("smoke AI")));

  const rejectedWhatsAppSentResult = database.markWhatsAppMessageSent({
    requestId: "request_smoke_001",
    message: "AI taslağından farklı bir metin"
  });
  assert.equal(rejectedWhatsAppSentResult.ok, false);

  const preparedBeforeSend = aiSuggestionResult.dashboardData.summary.preparedWhatsAppMessages;
  const whatsappSentResult = database.markWhatsAppMessageSent({
    requestId: "request_smoke_001",
    message: "Merhaba Smoke Misafir, smoke AI cevap taslağı hazır."
  });
  assert.equal(whatsappSentResult.ok, true);
  assert.equal(whatsappSentResult.dashboardData.summary.preparedWhatsAppMessages, preparedBeforeSend - 1);
  assert.equal(database.getPreparedWhatsAppMessages().some((message) => message.requestId === "request_smoke_001"), false);
  assert.ok(database.countEventsByType("whatsapp.message_sent") >= 1);

  // Request-scoped AI summary is owned by the request record (no separate AI workspace).
  assert.ok(aiSuggestionResult.dashboardData.requests.some((request) => request.id === "request_smoke_001" && request.ai_summary === "Smoke AI özet"));

  const conversionResult = database.convertRequestToReservation("request_smoke_001");
  assert.equal(conversionResult.ok, true);
  assert.equal(conversionResult.reservationId, "reservation_smoke_001");
  assert.equal(conversionResult.dashboardData.summary.newRequests, 1);
  assert.equal(conversionResult.dashboardData.summary.pendingReservations, 0);
  assert.ok(conversionResult.dashboardData.requests.some((request) => request.id === "request_smoke_001" && request.status === "converted_to_reservation"));
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
  ], 42);
  assert.equal(database.getSyncRuntimeStatus().requestCursor, 42);
  assert.equal(database.getSyncRuntimeStatus().acknowledgedCursor, 0);
  database.acknowledgeRequestCursor(42);
  assert.equal(database.getSyncRuntimeStatus().acknowledgedCursor, 42);
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
  assertStockTrackingFlow(database, categoryResult.savedId);

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

  console.log(`desktop-menu-db-ok: setup ${categoryResult.savedId} ${itemResult.savedId}`);
  }
} finally {
  database.close();
}

function seedOperationalSmokeData(databasePath) {
  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec(readFileSync(join(process.cwd(), "scripts", "fixtures", "desktop-operations-smoke.sql"), "utf8"));
  } finally {
    sqlite.close();
  }
}

// Test-only menu fixture: ten stock-tracked items (two gram-based, one with a
// consumption quantity of 200) without relying on production seed data.
function seedSmokeMenu(database) {
  const categories = ["Smoke Mutfak", "Smoke Izgara", "Smoke İçecek", "Smoke Tatlı"];
  const categoryIds = categories.map((name, index) => {
    const created = database.saveMenuCategory({
      name,
      description: "DB smoke test kategorisi.",
      is_active: true,
      sort_order: index + 1
    });
    assert.equal(created.ok, true, created.ok ? "" : created.message);
    return created.savedId;
  });
  const tracked = [
    { id: "smoke_item_001", name: "Smoke Ürün 1", unit: "adet", quantity: 50, consumption: 1 },
    { id: "smoke_item_002", name: "Smoke Ürün 2", unit: "adet", quantity: 40, consumption: 1 },
    { id: "smoke_item_003", name: "Smoke Ürün 3", unit: "adet", quantity: 30, consumption: 1 },
    { id: "smoke_item_004", name: "Smoke Ürün 4", unit: "adet", quantity: 25, consumption: 1 },
    { id: "smoke_item_005", name: "Smoke Ürün 5", unit: "adet", quantity: 20, consumption: 1 },
    { id: "smoke_item_006", name: "Smoke Gram Ürün", unit: "gram", quantity: 5000, consumption: 200 },
    { id: "smoke_item_007", name: "Smoke Gram Ürün 2", unit: "gram", quantity: 3000, consumption: 100 },
    { id: "smoke_item_008", name: "Smoke Ürün 8", unit: "adet", quantity: 15, consumption: 1 },
    { id: "smoke_item_009", name: "Smoke Ürün 9", unit: "adet", quantity: 12, consumption: 1 },
    { id: "smoke_item_010", name: "Smoke Ürün 10", unit: "adet", quantity: 10, consumption: 1 }
  ];
  tracked.forEach((item, index) => {
    const created = database.saveMenuItem({
      id: item.id,
      category_id: categoryIds[index % categoryIds.length],
      name: item.name,
      description: "DB smoke test ürünü.",
      price: 100 + index,
      currency: "TRY",
      image_url: "",
      is_available: true,
      is_featured: false,
      allergens: [],
      tags: ["smoke"],
      stock_quantity: item.quantity,
      stock_min_quantity: 2,
      stock_unit: item.unit,
      stock_consumption_quantity: item.consumption,
      sort_order: index + 1
    });
    assert.equal(created.ok, true, created.ok ? "" : created.message);
  });
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
  assert.equal(database.getPreparedWhatsAppMessages().some((message) => message.requestId === "request_smoke_customer_001"), true);
  const requestBeforeAnswer = preparedMessageResult.dashboardData.requests.find((request) => request.id === "request_smoke_customer_001");
  assert.ok(requestBeforeAnswer);

  const deniedStaffAnswer = database.applyAndroidAction(androidAction("android_action_request_staff_denied_001", "customer_request_mark_answered", {
    request_id: "request_smoke_customer_001",
    expected_updated_at: requestBeforeAnswer.updated_at
  }));
  assert.equal(deniedStaffAnswer.ok, false);
  assert.match(deniedStaffAnswer.message, /pasifleştirilmiş/i);
  assert.equal(database.getAndroidDevices().find((device) => device.deviceId === "android-smoke-device")?.isActive, false);
  const approvalResult = database.setAndroidDeviceActive("android-smoke-device", true);
  assert.equal(approvalResult.ok, true);
  const automaticallyRegisteredDevice = database.getAndroidDevices().find((device) => device.deviceId === "android-smoke-device");
  assert.ok(automaticallyRegisteredDevice);
  assert.equal(automaticallyRegisteredDevice.role, "staff");
  assert.equal(automaticallyRegisteredDevice.isActive, true);
  assert.deepEqual(automaticallyRegisteredDevice.permissionGroups, {
    service_orders: true,
    cashier: false,
    rooms_tasks: true,
    customer_reservation: false,
    market_operations: false
  });
  assert.equal(automaticallyRegisteredDevice.permissions.includes("table_order.open"), true);
  assert.equal(automaticallyRegisteredDevice.permissions.includes("room.update_status"), true);
  assert.equal(automaticallyRegisteredDevice.permissions.includes("table_order.close_paid"), false);
  assert.equal(automaticallyRegisteredDevice.permissions.includes("customer.view"), false);
  assert.equal(automaticallyRegisteredDevice.permissions.includes("customer.mark_answered"), false);

  const packageTestOrder = database.openTableOrder("table_002");
  assert.equal(packageTestOrder.ok, true);
  const deniedStaffClose = database.applyAndroidAction(androidAction("android_action_package_close_denied_001", "table_order_close_paid", {
    order_id: packageTestOrder.order.id
  }));
  assert.equal(deniedStaffClose.ok, false);
  assert.match(deniedStaffClose.message, /hesap kapatma yetkisi yok/i);
  assert.ok(database.getActiveTableOrder("table_002"));

  const cashierGroups = {
    service_orders: true,
    cashier: true,
    rooms_tasks: true,
    customer_reservation: false,
    market_operations: false
  };
  const cashierResult = database.setAndroidDevicePermissionGroups("android-smoke-device", cashierGroups);
  assert.equal(cashierResult.ok, true);
  assert.equal(cashierResult.devices.find((device) => device.deviceId === "android-smoke-device")?.permissions.includes("table_order.close_paid"), true);
  const allowedStaffClose = database.applyAndroidAction(androidAction("android_action_package_close_allowed_001", "table_order_close_paid", {
    order_id: packageTestOrder.order.id
  }));
  assert.equal(allowedStaffClose.ok, true);
  assert.equal(database.getActiveTableOrder("table_002"), null);

  const serviceOnlyGroups = {
    service_orders: true,
    cashier: false,
    rooms_tasks: false,
    customer_reservation: false,
    market_operations: false
  };
  assert.equal(database.setAndroidDevicePermissionGroups("android-smoke-device", serviceOnlyGroups).ok, true);
  const roomBeforePackageToggle = database.getDashboardData().rooms[0];
  assert.ok(roomBeforePackageToggle);
  const nextRoomStatus = roomBeforePackageToggle.status === "maintenance" ? "cleaning" : "maintenance";
  const deniedRoomUpdate = database.applyAndroidAction(androidAction("android_action_package_room_denied_001", "room_status_update", {
    room_id: roomBeforePackageToggle.id,
    status: nextRoomStatus,
    expected_updated_at: roomBeforePackageToggle.updatedAt
  }));
  assert.equal(deniedRoomUpdate.ok, false);
  assert.match(deniedRoomUpdate.message, /yetkisi yok/i);
  assert.equal(database.getDashboardData().rooms.find((room) => room.id === roomBeforePackageToggle.id)?.status, roomBeforePackageToggle.status);

  const defaultGroups = {
    service_orders: true,
    cashier: false,
    rooms_tasks: true,
    customer_reservation: false,
    market_operations: false
  };
  assert.equal(database.setAndroidDevicePermissionGroups("android-smoke-device", defaultGroups).ok, true);
  const allowedRoomUpdate = database.applyAndroidAction(androidAction("android_action_package_room_allowed_001", "room_status_update", {
    room_id: roomBeforePackageToggle.id,
    status: nextRoomStatus,
    expected_updated_at: roomBeforePackageToggle.updatedAt
  }));
  assert.equal(allowedRoomUpdate.ok, true);
  assert.equal(database.getDashboardData().rooms.find((room) => room.id === roomBeforePackageToggle.id)?.status, nextRoomStatus);
  const restoreRoomAfterPackageTest = database.updateRoomStatus({
    roomId: roomBeforePackageToggle.id,
    status: roomBeforePackageToggle.status
  });
  assert.equal(restoreRoomAfterPackageTest.ok, true);

  const customerReservationGroups = { ...defaultGroups, customer_reservation: true };
  const customerReservationResult = database.setAndroidDevicePermissionGroups("android-smoke-device", customerReservationGroups);
  assert.equal(customerReservationResult.ok, true);
  const customerReservationDevice = customerReservationResult.devices.find((device) => device.deviceId === "android-smoke-device");
  assert.equal(customerReservationDevice?.permissions.includes("customer.respond"), true);
  assert.equal(customerReservationDevice?.permissions.includes("customer.mark_answered"), true);
  assert.equal(customerReservationDevice?.permissions.includes("reservation.approve"), true);
  assert.equal(customerReservationDevice?.permissions.includes("customer.reject"), false);
  assert.equal(customerReservationDevice?.permissions.includes("customer.convert_to_reservation"), false);
  assert.equal(customerReservationDevice?.permissions.includes("reservation.reject"), false);
  assert.equal(customerReservationDevice?.permissions.includes("reservation.cancel"), false);
  const staffAnsweredRequest = database.applyAndroidAction(androidAction("android_action_package_request_answered_001", "customer_request_mark_answered", {
    request_id: "request_smoke_customer_001",
    expected_updated_at: requestBeforeAnswer.updated_at
  }));
  assert.equal(staffAnsweredRequest.ok, true);
  const staffReopenedRequest = database.applyAndroidAction(androidAction("android_action_package_request_reopened_001", "customer_request_reopen", {
    request_id: "request_smoke_customer_001"
  }));
  assert.equal(staffReopenedRequest.ok, true);
  const deniedCriticalCustomerAction = database.applyAndroidAction(androidAction("android_action_package_request_reject_denied_001", "customer_request_reject", {
    request_id: "request_smoke_customer_001"
  }));
  assert.equal(deniedCriticalCustomerAction.ok, false);
  assert.match(deniedCriticalCustomerAction.message, /yetkisi yok/i);

  const resetGroupsResult = database.resetAndroidDevicePermissions("android-smoke-device");
  assert.equal(resetGroupsResult.ok, true);
  const resetDevice = resetGroupsResult.devices.find((device) => device.deviceId === "android-smoke-device");
  assert.deepEqual(resetDevice?.permissionGroups, defaultGroups);
  assert.equal(resetDevice?.permissions.includes("table_order.close_paid"), false);
  assert.equal(resetDevice?.permissions.includes("customer.view"), false);

  const malformedPermissionDb = new DatabaseSync(database.databasePath);
  try {
    malformedPermissionDb
      .prepare("UPDATE android_devices SET permissions_json = ? WHERE device_id = ?")
      .run("{bozuk-json", "android-smoke-device");
  } finally {
    malformedPermissionDb.close();
  }
  assert.deepEqual(
    database.getAndroidDevices().find((device) => device.deviceId === "android-smoke-device")?.permissions,
    []
  );
  const roomBeforeMalformedPermission = database.getDashboardData().rooms[0];
  assert.ok(roomBeforeMalformedPermission);
  const malformedPermissionAction = database.applyAndroidAction(androidAction("android_action_malformed_permissions_denied_001", "room_status_update", {
    room_id: roomBeforeMalformedPermission.id,
    status: roomBeforeMalformedPermission.status === "maintenance" ? "cleaning" : "maintenance",
    expected_updated_at: roomBeforeMalformedPermission.updatedAt
  }));
  assert.equal(malformedPermissionAction.ok, false);
  assert.match(malformedPermissionAction.message, /yetkisi yok/i);
  assert.equal(
    database.getDashboardData().rooms.find((room) => room.id === roomBeforeMalformedPermission.id)?.status,
    roomBeforeMalformedPermission.status
  );
  assert.equal(database.setAndroidDeviceRole("android-smoke-device", "admin").ok, true);

  const requestBeforeAdminAnswer = database.getDashboardData().requests.find((request) => request.id === "request_smoke_customer_001");
  assert.ok(requestBeforeAdminAnswer);
  const answeredRequestResult = database.applyAndroidAction(androidAction("android_action_request_answered_001", "customer_request_mark_answered", {
    request_id: "request_smoke_customer_001",
    expected_updated_at: requestBeforeAdminAnswer.updated_at
  }));
  assert.equal(answeredRequestResult.ok, true);
  assert.equal(database.getDashboardData().requests.find((request) => request.id === "request_smoke_customer_001")?.status, "answered");
  assert.equal(database.getPreparedWhatsAppMessages().some((message) => message.requestId === "request_smoke_customer_001"), false);
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
    reservation_id: "reservation_smoke_001"
  }));
  assert.equal(cancelledReservationResult.ok, true);
  assert.equal(database.getDashboardData().reservations.find((reservation) => reservation.id === "reservation_smoke_001")?.status, "cancelled");
  // D-003/D-004: cancelling the planning link must not clear operational cleaning.
  assert.equal(database.getDashboardData().rooms.find((room) => room.id === "room_101")?.status, "cleaning");

  // Complete cleaning explicitly; the planning state applies once the room is available again.
  const cleanedRoomResult = database.updateRoomStatus({ roomId: "room_101", status: "available" });
  assert.equal(cleanedRoomResult.ok, true);

  const approvedReservationResult = database.applyAndroidAction(androidAction("android_action_reservation_approve_001", "reservation_approve", {
    reservation_id: "reservation_smoke_001"
  }));
  assert.equal(approvedReservationResult.ok, true);
  assert.equal(database.getDashboardData().rooms.find((room) => room.id === "room_101")?.status, "reserved");

  const rejectedReservationResult = database.applyAndroidAction(androidAction("android_action_reservation_reject_001", "reservation_reject", {
    reservation_id: "reservation_smoke_001"
  }));
  assert.equal(rejectedReservationResult.ok, true);
  assert.equal(database.getDashboardData().reservations.find((reservation) => reservation.id === "reservation_smoke_001")?.status, "rejected");
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
    task_id: "task_smoke_001"
  }));
  assert.equal(taskCompleteResult.ok, true);
  assert.equal(database.getDashboardData().dailyTasks.find((task) => task.id === "task_smoke_001")?.status, "done");

  const taskCancelResult = database.applyAndroidAction(androidAction("android_action_task_cancel_001", "daily_task_cancel", {
    task_id: "task_smoke_001"
  }));
  assert.equal(taskCancelResult.ok, true);
  assert.equal(database.getDashboardData().dailyTasks.find((task) => task.id === "task_smoke_001")?.status, "cancelled");

  const taskReopenResult = database.applyAndroidAction(androidAction("android_action_task_reopen_001", "daily_task_reopen", {
    task_id: "task_smoke_001"
  }));
  assert.equal(taskReopenResult.ok, true);
  assert.equal(database.getDashboardData().dailyTasks.find((task) => task.id === "task_smoke_001")?.status, "pending");

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
      .prepare("UPDATE reservations SET status = 'pending', table_ids_json = '[\"table_001\"]', updated_at = ? WHERE id = 'reservation_smoke_001'")
      .run("2026-07-17T12:30:00.000Z");
    invariantDb
      .prepare("UPDATE tables SET current_customer_id = 'customer_smoke_001', current_reservation_id = 'reservation_smoke_001' WHERE id = 'table_001'")
      .run();
  } finally {
    invariantDb.close();
  }
  const conflictingReservationResult = database.applyAndroidAction(androidAction("android_action_reservation_order_conflict_001", "reservation_approve", {
    reservation_id: "reservation_smoke_001"
  }));
  assert.equal(conflictingReservationResult.ok, false);
  assert.match(conflictingReservationResult.message, /aktif adisyon/i);
  assert.equal(database.getActiveTableOrder("table_001")?.id, openedOrder.id);
  assert.equal(database.getDashboardData().tables.find((table) => table.id === "table_001")?.status, "occupied");
  const desktopReservationConflict = database.updateReservationStatus({
    reservationId: "reservation_smoke_001",
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

  const preparingResult = database.applyAndroidAction(androidAction("android_action_order_preparing_001", "table_order_set_preparing", {
    order_id: openedOrder.id,
    status: "preparing"
  }));
  assert.equal(preparingResult.ok, true);
  assert.equal(database.getActiveTableOrder("table_001").status, "preparing");
  assert.equal(database.getActiveTableOrder("table_001").items[0].status, "preparing");

  const servedResult = database.applyAndroidAction(androidAction("android_action_order_served_001", "table_order_set_served", {
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

  const paymentResult = database.applyAndroidAction(androidAction("android_action_order_payment_001", "table_order_set_payment_waiting", {
    order_id: openedOrder.id,
    status: "payment"
  }));
  assert.equal(paymentResult.ok, true);
  assert.equal(database.getDashboardData().tables.find((table) => table.id === "table_001")?.status, "bill_waiting");

  const closeResult = database.applyAndroidAction(androidAction("android_action_order_close_001", "table_order_close_paid", {
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
    reservationId: "reservation_smoke_001",
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
  const cancelResult = database.applyAndroidAction(androidAction("android_action_order_cancel_001", "table_order_cancel", {
    order_id: secondOrder.id,
    status: "cancelled"
  }));
  assert.equal(cancelResult.ok, true);
  assert.equal(database.getActiveTableOrder("table_001"), null);
  assert.equal(database.getDashboardData().tables.find((table) => table.id === "table_001")?.status, "available");

  const adminResult = database.setAndroidDeviceRole("android-smoke-device", "admin");
  assert.equal(adminResult.ok, true);
  const revokedResult = database.revokeAndroidDevice("android-smoke-device");
  assert.equal(revokedResult.ok, true);
  const revokedDevice = database.getAndroidDevices().find((device) => device.deviceId === "android-smoke-device");
  assert.ok(revokedDevice?.revokedAt);
  assert.equal(revokedDevice.isActive, false);
  const revokedProfile = database.getAndroidPermissionSnapshot()["android-smoke-device"];
  assert.equal(revokedProfile?.role, "admin");
  assert.equal(revokedProfile?.is_active, false);
  const restoredResult = database.setAndroidDeviceActive("android-smoke-device", true);
  assert.equal(restoredResult.ok, true);
  const restoredDevice = database.getAndroidDevices().find((device) => device.deviceId === "android-smoke-device");
  assert.equal(restoredDevice?.revokedAt, "");
  assert.equal(restoredDevice?.isActive, true);
  const restoredProfile = database.getAndroidPermissionSnapshot()["android-smoke-device"];
  assert.equal(restoredProfile?.role, "admin");
  assert.equal(restoredProfile?.is_active, true);
  assert.ok(restoredProfile?.permissions.includes("android_devices.manage"));
}

function assertStockTrackingFlow(database, categoryId) {
  const stockTableId = database.getDashboardData().tables.find((table) => !["table_001", "table_002"].includes(table.id))?.id;
  assert.ok(stockTableId);
  const baseInput = {
    category_id: categoryId,
    name: "Stok Smoke Ürün",
    description: "Basit stok takibi smoke ürünü.",
    price: 25,
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: [],
    tags: ["stock-smoke"],
    stock_quantity: null,
    stock_min_quantity: null,
    stock_unit: "piece",
    stock_consumption_quantity: 1,
    hide_when_out_of_stock: false,
    stock_note: null,
    sort_order: 80
  };
  const created = database.saveMenuItem(baseInput);
  assert.equal(created.ok, true);
  const itemId = created.savedId;
  assert.equal(created.dashboardData.menu.items.find((item) => item.id === itemId)?.stock_quantity, null);
  assert.equal(database.getMenuStockMovements(itemId).length, 0);

  const zeroVisible = database.saveMenuItem({
    ...baseInput,
    id: itemId,
    stock_quantity: 0,
    stock_min_quantity: 2,
    stock_note: "0 takip dışı değildir"
  });
  assert.equal(zeroVisible.ok, true);
  assert.equal(zeroVisible.dashboardData.menu.items.find((item) => item.id === itemId)?.stock_quantity, 0);
  assert.equal(database.getQrMenuPublication().items.some((item) => item.id === itemId), true);

  const zeroHidden = database.saveMenuItem({
    ...baseInput,
    id: itemId,
    stock_quantity: 0,
    stock_min_quantity: 2,
    hide_when_out_of_stock: true
  });
  assert.equal(zeroHidden.ok, true);
  assert.equal(zeroHidden.dashboardData.menu.items.some((item) => item.id === itemId), true);
  assert.equal(database.getQrMenuPublication().items.some((item) => item.id === itemId), false);

  const stocked = database.saveMenuItem({
    ...baseInput,
    id: itemId,
    stock_quantity: 5,
    stock_min_quantity: 2,
    hide_when_out_of_stock: true
  });
  assert.equal(stocked.ok, true);
  assert.equal(database.getQrMenuPublication().items.some((item) => item.id === itemId), true);

  const opened = database.openTableOrder(stockTableId);
  assert.equal(opened.ok, true);
  const added = database.addTableOrderItem({ orderId: opened.order.id, menuItemId: itemId, quantity: 2, note: "" });
  assert.equal(added.ok, true);
  assert.equal(stockQuantity(database, itemId), 3);
  assert.equal(added.dashboardData.menu.items.find((item) => item.id === itemId)?.stock_quantity, 3);
  const orderItemId = added.order.items[0].id;

  const increased = database.updateTableOrderItemQuantity({ itemId: orderItemId, quantity: 3 });
  assert.equal(increased.ok, true);
  assert.equal(stockQuantity(database, itemId), 2);
  const decreased = database.updateTableOrderItemQuantity({ itemId: orderItemId, quantity: 1 });
  assert.equal(decreased.ok, true);
  assert.equal(stockQuantity(database, itemId), 4);
  const removed = database.removeTableOrderItem(orderItemId);
  assert.equal(removed.ok, true);
  assert.equal(stockQuantity(database, itemId), 5);
  assert.equal(database.closeTableOrder({ orderId: opened.order.id, status: "cancelled" }).ok, true);
  assert.equal(stockQuantity(database, itemId), 5);

  const cancelOrder = database.openTableOrder(stockTableId);
  assert.equal(cancelOrder.ok, true);
  assert.equal(database.addTableOrderItem({ orderId: cancelOrder.order.id, menuItemId: itemId, quantity: 3, note: "" }).ok, true);
  assert.equal(stockQuantity(database, itemId), 2);
  assert.equal(database.closeTableOrder({ orderId: cancelOrder.order.id, status: "cancelled" }).ok, true);
  assert.equal(stockQuantity(database, itemId), 5);

  const paidOrder = database.openTableOrder(stockTableId);
  assert.equal(paidOrder.ok, true);
  assert.equal(database.addTableOrderItem({ orderId: paidOrder.order.id, menuItemId: itemId, quantity: 2, note: "" }).ok, true);
  assert.equal(stockQuantity(database, itemId), 3);
  assert.equal(database.closeTableOrder({ orderId: paidOrder.order.id, status: "paid" }).ok, true);
  assert.equal(stockQuantity(database, itemId), 3, "Paid orders must not restore stock.");

  const insufficientOrder = database.openTableOrder(stockTableId);
  assert.equal(insufficientOrder.ok, true);
  const insufficient = database.addTableOrderItem({ orderId: insufficientOrder.order.id, menuItemId: itemId, quantity: 4, note: "" });
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.message, "Bu ürün stokta yeterli değil.");
  assert.equal(stockQuantity(database, itemId), 3);
  assert.equal(database.getActiveTableOrder(stockTableId).items.length, 0);
  assert.equal(database.closeTableOrder({ orderId: insufficientOrder.order.id, status: "cancelled" }).ok, true);

  const untracked = database.saveMenuItem({ ...baseInput, name: "Takipsiz Smoke Ürün", sort_order: 90 });
  assert.equal(untracked.ok, true);
  const untrackedOrder = database.openTableOrder(stockTableId);
  assert.equal(untrackedOrder.ok, true);
  assert.equal(database.addTableOrderItem({ orderId: untrackedOrder.order.id, menuItemId: untracked.savedId, quantity: 2, note: "" }).ok, true);
  assert.equal(database.getMenuStockMovements(untracked.savedId).length, 0);
  assert.equal(database.closeTableOrder({ orderId: untrackedOrder.order.id, status: "cancelled" }).ok, true);
  assert.equal(database.getMenuStockMovements(untracked.savedId).length, 0);

  const deniedManual = database.applyAndroidAction(androidAction(
    "android_stock_denied_001",
    "menu_stock_add",
    { menu_item_id: itemId, quantity: 1, note: "Yetkisiz deneme" },
    "android-stock-smoke"
  ));
  assert.equal(deniedManual.ok, false);
  assert.match(deniedManual.message, /pasifleştirilmiş/i);
  assert.equal(database.setAndroidDeviceActive("android-stock-smoke", true).ok, true);
  const deniedManualAfterApproval = database.applyAndroidAction(androidAction(
    "android_stock_denied_001",
    "menu_stock_add",
    { menu_item_id: itemId, quantity: 1, note: "Yetkisiz deneme" },
    "android-stock-smoke"
  ));
  assert.equal(deniedManualAfterApproval.ok, false);
  assert.match(deniedManualAfterApproval.message, /yetkisi yok/i);
  const stockViewer = database.getAndroidDevices().find((device) => device.deviceId === "android-stock-smoke");
  assert.equal(stockViewer?.permissions.includes("menu.stock_view"), true);
  assert.equal(stockViewer?.permissions.includes("menu.stock_update"), false);
  assert.equal(database.setAndroidDeviceRole("android-stock-smoke", "admin").ok, true);
  const allowedManual = database.applyAndroidAction(androidAction(
    "android_stock_set_001",
    "menu_stock_set",
    { menu_item_id: itemId, quantity: 10, note: "Sayım sonucu" },
    "android-stock-smoke"
  ));
  assert.equal(allowedManual.ok, true);
  assert.equal(stockQuantity(database, itemId), 10);
  const allowedAdd = database.applyAndroidAction(androidAction(
    "android_stock_add_001",
    "menu_stock_add",
    { menu_item_id: itemId, quantity: 2, note: "Teslimat" },
    "android-stock-smoke"
  ));
  assert.equal(allowedAdd.ok, true);
  assert.equal(stockQuantity(database, itemId), 12);
  const allowedAdjust = database.applyAndroidAction(androidAction(
    "android_stock_adjust_001",
    "menu_stock_adjust",
    { menu_item_id: itemId, quantity_change: -3, note: "Fire düzeltmesi" },
    "android-stock-smoke"
  ));
  assert.equal(allowedAdjust.ok, true);
  assert.equal(stockQuantity(database, itemId), 9);

  const movementTypes = database.getMenuStockMovements(itemId).map((movement) => movement.type);
  for (const type of ["add", "set", "adjust", "order_add", "order_update", "order_remove", "order_cancel"]) {
    assert.equal(movementTypes.includes(type), true, `Missing stock movement type: ${type}`);
  }
  assert.ok(database.getMenuStockMovements(itemId).some((movement) =>
    movement.sourceType === "android" && movement.actorDeviceId === "android-stock-smoke" && movement.note === "Sayım sonucu"
  ));

  const gramItemId = "smoke_item_006";
  const gramStockBefore = stockQuantity(database, gramItemId);
  assert.equal(gramStockBefore, 5000);
  const gramOrder = database.openTableOrder(stockTableId);
  assert.equal(gramOrder.ok, true);
  const gramAdded = database.addTableOrderItem({ orderId: gramOrder.order.id, menuItemId: gramItemId, quantity: 2, note: "" });
  assert.equal(gramAdded.ok, true);
  assert.equal(stockQuantity(database, gramItemId), 4600, "Two portions must consume 2 × 200 grams.");
  const gramOrderItemId = gramAdded.order.items[0].id;
  assert.equal(database.updateTableOrderItemQuantity({ itemId: gramOrderItemId, quantity: 3 }).ok, true);
  assert.equal(stockQuantity(database, gramItemId), 4400);
  assert.equal(database.removeTableOrderItem(gramOrderItemId).ok, true);
  assert.equal(stockQuantity(database, gramItemId), 5000, "Removing the line must restore the consumed grams.");
  assert.equal(database.closeTableOrder({ orderId: gramOrder.order.id, status: "cancelled" }).ok, true);

  const gramCancelOrder = database.openTableOrder(stockTableId);
  assert.equal(gramCancelOrder.ok, true);
  assert.equal(database.addTableOrderItem({ orderId: gramCancelOrder.order.id, menuItemId: gramItemId, quantity: 2, note: "" }).ok, true);
  assert.equal(stockQuantity(database, gramItemId), 4600);
  assert.equal(database.closeTableOrder({ orderId: gramCancelOrder.order.id, status: "cancelled" }).ok, true);
  assert.equal(stockQuantity(database, gramItemId), 5000, "Cancelling the order must restore the consumed grams.");

  const stopped = database.saveMenuItem({ ...baseInput, id: itemId, stock_quantity: null });
  assert.equal(stopped.ok, true);
  assert.equal(stockQuantity(database, itemId), null);
}

function stockQuantity(database, itemId) {
  return database.getDashboardData().menu.items.find((item) => item.id === itemId)?.stock_quantity ?? null;
}

function androidAction(id, actionType, payload, deviceId = "android-smoke-device") {
  return {
    id,
    action_type: actionType,
    payload,
    created_at: "2026-07-17T10:00:00.000Z",
    device_id: deviceId,
    device_name: "DB Smoke Telefonu",
    app_version: "0.1.0-smoke",
    last_seen_at: "2026-07-17T10:00:01.000Z",
    status: "pending",
    error_message: "",
    processed_at: ""
  };
}
