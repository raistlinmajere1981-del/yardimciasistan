import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");

const dataDir = join(process.cwd(), "artifacts", "desktop-menu-db-smoke", String(Date.now()));
mkdirSync(dataDir, { recursive: true });

const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();

  const initialSetup = database.getSetupData();
  assert.equal(initialSetup.setupRequired, true);
  assert.ok(database.backupPath.endsWith("backups"));

  const setupResult = database.saveInitialSetup({
    businessName: "Deniz Çiçeği Pansiyon & Kafe",
    businessType: "pension_restaurant",
    phone: "+905321234567",
    whatsapp: "+905321234567",
    email: "smoke@example.test",
    address: "Smoke adresi",
    webModuleUrl: "http://127.0.0.1:8080",
    syncSecret: "smoke-secret-12345",
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiModel: "",
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
  });
  assert.equal(setupResult.ok, true);
  assert.equal(setupResult.setupData.setupRequired, false);
  assert.equal(setupResult.dashboardData.webModuleUrl, "http://127.0.0.1:8080");
  assert.ok(setupResult.dashboardData.backupPath.endsWith("backups"));

  const backupResult = database.createManualBackup();
  assert.equal(backupResult.ok, true);
  assert.match(backupResult.backupFileName, /^yardimci-asistan-.+\.sqlite$/);
  assert.equal(backupResult.dashboardData.backupPath, database.backupPath);
  assert.equal(existsSync(backupResult.backupFilePath), true);
  assert.ok(statSync(backupResult.backupFilePath).size > 0);
  assertReadableSqliteBackup(backupResult.backupFilePath);

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

  const aiSuggestionResult = database.saveRequestAiSuggestion({
    requestId: "request_demo_001",
    summary: "Smoke AI özet",
    suggestedReply: "Merhaba Demo Misafir, smoke AI cevap taslağı hazır.",
    missingFields: []
  });
  assert.equal(aiSuggestionResult.ok, true);
  assert.ok(aiSuggestionResult.dashboardData.requests.some((request) => request.id === "request_demo_001" && request.ai_suggested_reply.includes("smoke AI")));
  assert.ok(aiSuggestionResult.dashboardData.summary.preparedWhatsAppMessages >= 1);

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
      status: "answered",
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
    assert.ok(Number(scalar(backupDb, "SELECT COUNT(*) FROM rooms WHERE deleted_at = ''")) >= 3);
    assert.ok(Number(scalar(backupDb, "SELECT COUNT(*) FROM tables WHERE deleted_at = ''")) >= 3);
    assert.equal(scalar(backupDb, "SELECT customer_name FROM requests WHERE id = 'request_demo_001'"), "Demo Misafir");
  } finally {
    backupDb.close();
  }
}

function scalar(database, sql) {
  const row = database.prepare(sql).get();
  assert.ok(row, `Sorgu sonuç döndürmedi: ${sql}`);
  return Object.values(row)[0];
}
