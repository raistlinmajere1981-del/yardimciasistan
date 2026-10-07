import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { saveMenuProductFixture } from "./test-helpers/menu-product-fixture.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  buildReportAiMessages,
  buildReportAiPayload,
  reportHasEnoughData,
  sanitizeReportAiAnswer
} = require("../apps/desktop-app/dist-electron/report-ai.js");

const appPath = join(process.cwd(), "apps", "desktop-app");
const dataDir = join(process.cwd(), "artifacts", "reports-db-smoke", String(Date.now()));
mkdirSync(dataDir, { recursive: true });

const database = new DesktopDatabase({
  appPath,
  userDataPath: dataDir
});

try {
  database.initialize();

  const setupResult = database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Reports Test İşletmesi",
    phone: "+905550000300",
    whatsapp: "+905550000300",
    syncSecret: "reports-test-secret-123",
    servicePreferences: { whatsapp: false, android: false },
  }));
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  seedSmokeBusinessLayout(database.databasePath, {
    tableCategories: [{ name: "Rapor Salonu", tableCount: 3 }]
  });
  const reportTables = database.getDashboardData().tables;
  assert.equal(reportTables.length, 3);

  const reportCategory = database.saveMenuCategory({
    name: "Rapor İçecekleri",
    description: "Rapor smoke testi",
    is_active: true,
    sort_order: 10
  });
  assert.equal(reportCategory.ok, true);
  const reportCategoryId = reportCategory.savedId;

  function createReportItem(name, price) {
    const result = saveMenuProductFixture(database, {
      category_id: reportCategoryId,
      name,
      description: "Rapor smoke ürünü",
      price,
      currency: "TRY",
      image_url: "",
      is_available: true,
      is_featured: false,
      allergens: [],
      tags: ["smoke"],
      stock_quantity: 0,
      sort_order: 10
    });
    assert.equal(result.ok, true);
    return result.savedId;
  }

  const reportItemIds = [
    createReportItem("Rapor Kahvesi", 150),
    createReportItem("Rapor Limonatası", 125),
    createReportItem("Rapor İptal Ürünü", 10)
  ];
  const reportTableIds = reportTables.map((table) => table.id);

  const today = localDateKey(new Date());
  const yesterday = shiftDate(today, -1);
  seedReportData(database.databasePath, today, { tableIds: reportTableIds, itemIds: reportItemIds });

  setBusinessCapability(database.databasePath, { capability: C.AI, enabled: false });
  assert.equal(database.getSetupData().aiEnabled, false, "Reports must work with AI explicitly disabled.");

  const todayReport = database.getReportData(range("today", today, today));
  assert.equal(todayReport.summary.restaurantRevenue, 1000, "Only today's paid order contributes to revenue.");
  assert.equal(todayReport.summary.closedOrders, 1);
  assert.equal(todayReport.summary.averageOrder, 1000);
  assert.equal(todayReport.restaurant.soldItemCount, 7, "Cancelled order lines must be excluded.");
  assert.equal(todayReport.restaurant.cancelledOrders, 1);
  assert.deepEqual(todayReport.restaurant.topItems.slice(0, 2), [
    { name: "Snapshot Türk Kahvesi", quantity: 5, revenue: 750 },
    { name: "Snapshot Limonata", quantity: 2, revenue: 250 }
  ]);
  assert.equal(
    todayReport.restaurant.topItems.some((item) => item.name === "Sonradan Değişen Kahve"),
    false,
    "Menu edits must not rewrite historical order-line snapshots."
  );

  assert.equal(todayReport.pensionAndRequests.incomingReservations, 5);
  assert.equal(todayReport.pensionAndRequests.approvedReservations, 2);
  assert.equal(todayReport.pensionAndRequests.pendingReservations, 1);
  assert.equal(todayReport.pensionAndRequests.cancelledOrRejectedReservations, 2);
  assert.equal(todayReport.pensionAndRequests.accommodationNights, 5);
  assert.equal(todayReport.pensionAndRequests.newRequests, 4);
  assert.equal(todayReport.pensionAndRequests.answeredRequests, 2);
  assert.equal(todayReport.pensionAndRequests.waitingRequests, 2);
  assert.equal(todayReport.summary.pendingTasks, 1);

  assert.equal(todayReport.stock.manualMovementCount, 2);
  assert.equal(todayReport.stock.imageMovementCount, 1);
  assert.equal(todayReport.stock.topConsumed[0]?.quantity, 5);
  assert.equal(todayReport.stock.recentMovements.length, 3);
  assert.equal(todayReport.attention.pendingRequests, 2);
  assert.equal(todayReport.attention.pendingReservations, 1);
  assert.equal(todayReport.attention.paymentWaitingTables, 1);
  assert.equal(todayReport.attention.overdueTasks, 1);
  assert.equal(todayReport.attention.incompleteTasks, 2);
  assert.equal(todayReport.attention.outOfStockItems, 1);
  assert.equal(todayReport.attention.lowStockItems, 1);
  assert.equal(todayReport.attention.totalCount, 8);

  const yesterdayReport = database.getReportData(range("yesterday", yesterday, yesterday));
  assert.equal(yesterdayReport.summary.restaurantRevenue, 500);
  assert.equal(yesterdayReport.summary.closedOrders, 1);
  assert.equal(yesterdayReport.summary.averageOrder, 500);

  const last7 = database.getReportData(range("last7", shiftDate(today, -6), today));
  assert.equal(last7.summary.restaurantRevenue, 1800);
  assert.equal(last7.summary.closedOrders, 3);
  assert.equal(last7.summary.averageOrder, 600);
  assert.equal(last7.restaurant.dailyRevenue.length, 7);

  const last30 = database.getReportData(range("last30", shiftDate(today, -29), today));
  assert.equal(last30.summary.restaurantRevenue, 2000);
  assert.equal(last30.summary.closedOrders, 4);
  assert.equal(last30.restaurant.dailyRevenue.length, 30);

  const custom = database.getReportData(range("custom", yesterday, today));
  assert.equal(custom.summary.restaurantRevenue, 1500);
  assert.equal(custom.summary.closedOrders, 2);
  assert.equal(custom.summary.averageOrder, 750);

  const noPaidOrders = database.getReportData(range("custom", shiftDate(today, 30), shiftDate(today, 31)));
  assert.equal(noPaidOrders.summary.restaurantRevenue, 0);
  assert.equal(noPaidOrders.summary.closedOrders, 0);
  assert.equal(noPaidOrders.summary.averageOrder, 0);

  assert.throws(
    () => database.getReportData(range("custom", today, yesterday)),
    /başlangıç tarihi bitiş tarihinden sonra/i
  );

  const androidReports = database.getAndroidReportPresets(today);
  assert.equal(androidReports.today.summary.restaurant_revenue, 1000);
  assert.equal(androidReports.yesterday.summary.restaurant_revenue, 500);
  assert.equal(androidReports.last7.summary.restaurant_revenue, 1800);
  assert.equal(androidReports.last30.summary.restaurant_revenue, 2000);
  assert.ok(androidReports.last7.restaurant.top_items.length <= 3);
  assert.equal(androidReports.last7.attention.attention_count, undefined);
  assert.equal(androidReports.last7.summary.attention_count, 8);

  const payload = buildReportAiPayload(todayReport);
  const serializedPayload = JSON.stringify(payload);
  assert.equal(serializedPayload.includes("Gizli Müşteri"), false, "AI payload must not include customer identity.");
  assert.equal(serializedPayload.includes("05550000000"), false, "AI payload must not include customer phone.");
  assert.equal(reportHasEnoughData(payload), true);

  const messages = buildReportAiMessages("summary", payload, "Smoke İşletmesi");
  assert.equal(messages[1].content, serializedPayload, "AI user content must be the prepared report JSON only.");
  assert.match(messages[0].content, /Hiçbir metrik hesaplama/i);
  assert.match(messages[0].content, /JSON içinde bulunmayan hiçbir sayı/i);

  const acceptedAi = sanitizeReportAiAnswer(
    "Restoran cirosu ₺1.000,00 ve kapanan adisyon sayısı 1.",
    payload,
    "summary"
  );
  assert.equal(acceptedAi.ok, true);
  const fabricatedAi = sanitizeReportAiAnswer(
    "Restoran cirosu 9.999 TL oldu.",
    payload,
    "summary"
  );
  assert.equal(fabricatedAi.ok, false, "A number absent from the prepared JSON must be rejected.");
  const signChangedAi = sanitizeReportAiAnswer(
    "Kapanan adisyon sayısı -1.",
    payload,
    "summary"
  );
  assert.equal(signChangedAi.ok, false, "Changing the sign of a prepared number must be rejected.");

  const limitedRecommendations = sanitizeReportAiAnswer(
    "- Talepleri yanıtlayın.\n- Rezervasyonları kontrol edin.\n- Stokları tamamlayın.\n- Fazladan öneri.",
    payload,
    "recommendations"
  );
  assert.equal(limitedRecommendations.ok, true);
  assert.equal(limitedRecommendations.content.split("\n").length, 3);

  console.log("reports-db-smoke-ok");
} finally {
  database.close();
}

function range(preset, startDate, endDate) {
  return {
    preset,
    label: preset === "custom" ? `${startDate} – ${endDate}` : preset,
    startDate,
    endDate
  };
}

function seedReportData(databasePath, today, ids) {
  const [tableA, tableB, tableC] = ids.tableIds;
  const [itemA, itemB, itemC] = ids.itemIds;
  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      DELETE FROM table_order_items;
      DELETE FROM table_orders;
      DELETE FROM inventory_movements;
      DELETE FROM requests;
      DELETE FROM reservations;
      DELETE FROM daily_tasks;
      UPDATE tables SET status = 'available';
      UPDATE catalog_products SET track_inventory = 0, minimum_quantity = 0;
      UPDATE menu_product_entries SET stock_consumption_quantity = 1;
    `);

    insertOrder(sqlite, {
      id: "report_paid_today",
      tableId: tableA,
      status: "paid",
      total: 1000,
      date: today
    }, [
      ["report_line_today_coffee", itemA, "Snapshot Türk Kahvesi", 150, 5, 750, "served"],
      ["report_line_today_lemonade", itemB, "Snapshot Limonata", 125, 2, 250, "served"],
      ["report_line_today_cancelled", itemC, "İptal Satır", 10, 50, 500, "cancelled"]
    ]);
    insertOrder(sqlite, {
      id: "report_paid_yesterday",
      tableId: tableA,
      status: "paid",
      total: 500,
      date: shiftDate(today, -1)
    }, [
      ["report_line_yesterday_coffee", itemA, "Snapshot Türk Kahvesi", 500, 1, 500, "served"]
    ]);
    insertOrder(sqlite, {
      id: "report_paid_five_days",
      tableId: tableA,
      status: "paid",
      total: 300,
      date: shiftDate(today, -5)
    }, [
      ["report_line_five_days", itemB, "Snapshot Limonata", 100, 3, 300, "served"]
    ]);
    insertOrder(sqlite, {
      id: "report_paid_twenty_days",
      tableId: tableA,
      status: "paid",
      total: 200,
      date: shiftDate(today, -20)
    }, [
      ["report_line_twenty_days", itemA, "Snapshot Türk Kahvesi", 100, 2, 200, "served"]
    ]);
    insertOrder(sqlite, {
      id: "report_paid_outside",
      tableId: tableA,
      status: "paid",
      total: 100,
      date: shiftDate(today, -40)
    }, [
      ["report_line_outside", itemA, "Snapshot Türk Kahvesi", 100, 1, 100, "served"]
    ]);
    insertOrder(sqlite, {
      id: "report_cancelled_today",
      tableId: tableA,
      status: "cancelled",
      total: 777,
      date: today
    }, [
      ["report_line_cancelled_order", itemA, "Snapshot Türk Kahvesi", 777, 100, 777, "served"]
    ]);
    insertOrder(sqlite, {
      id: "report_open_today",
      tableId: tableC,
      status: "open",
      total: 999,
      date: today
    }, [
      ["report_line_open", itemA, "Snapshot Türk Kahvesi", 999, 100, 999, "open"]
    ]);
    insertOrder(sqlite, {
      id: "report_payment_today",
      tableId: tableB,
      status: "payment",
      total: 888,
      date: today
    }, [
      ["report_line_payment", itemB, "Snapshot Limonata", 888, 100, 888, "served"]
    ]);
    sqlite.prepare("UPDATE tables SET status = 'bill_waiting' WHERE id = ?").run(tableB);
    sqlite.prepare("UPDATE catalog_products SET name = ?, sale_price = ? WHERE id = (SELECT product_id FROM menu_product_entries WHERE id = ?)")
      .run("Sonradan Değişen Kahve", 999, itemA);

    insertReservation(sqlite, "report_res_approved", "approved", "room", today, shiftDate(today, 2), shiftDate(today, 5));
    insertReservation(sqlite, "report_res_completed", "completed", "room", today, shiftDate(today, -10), shiftDate(today, -8));
    insertReservation(sqlite, "report_res_pending", "pending", "table", today, today, today);
    insertReservation(sqlite, "report_res_cancelled", "cancelled", "room", today, today, shiftDate(today, 10));
    insertReservation(sqlite, "report_res_rejected", "rejected", "room", today, today, shiftDate(today, 10));
    insertReservation(sqlite, "report_res_yesterday", "approved", "room", shiftDate(today, -1), today, shiftDate(today, 1));

    insertRequest(sqlite, "report_req_new", "new", today);
    insertRequest(sqlite, "report_req_answered", "answered", today);
    insertRequest(sqlite, "report_req_waiting_customer", "waiting_customer", today);
    insertRequest(sqlite, "report_req_waiting_owner", "waiting_owner", today);
    insertRequest(sqlite, "report_req_yesterday", "answered", shiftDate(today, -1));

    insertTask(sqlite, "report_task_today", "pending", today, today);
    insertTask(sqlite, "report_task_completed", "completed", today, today);
    insertTask(sqlite, "report_task_overdue", "pending", today, shiftDate(today, -2));

    for (const [entryId, quantity, minimum] of [[itemA, 0, 2], [itemB, 2, 3]]) {
      const product = sqlite.prepare("SELECT p.id, p.business_id FROM catalog_products p JOIN menu_product_entries e ON e.product_id = p.id WHERE e.id = ?").get(entryId);
      sqlite.prepare("UPDATE catalog_products SET track_inventory = 1, minimum_quantity = ?, unit = 'piece' WHERE id = ?").run(minimum, product.id);
      const locationId = sqlite.prepare("SELECT id FROM inventory_locations WHERE business_id = ? AND is_primary = 1").get(product.business_id).id;
      sqlite.prepare("INSERT INTO inventory_balances (product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(product_id, location_id) DO UPDATE SET quantity = excluded.quantity").run(product.id, locationId, quantity, atNoon(today));
    }
    insertMovement(sqlite, "report_stock_remove", itemA, "remove", -5, 5, 0, "desktop", today);
    insertMovement(sqlite, "report_stock_image", itemB, "image_import_add", 10, 0, 10, "stock_image_import", today);
    insertMovement(sqlite, "report_stock_android", itemB, "add", 3, 10, 13, "android", today);

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {
      // The original error remains more useful if the transaction never started.
    }
    throw error;
  } finally {
    sqlite.close();
  }
}

function insertOrder(sqlite, order, items) {
  const timestamp = atNoon(order.date);
  sqlite.prepare(`
    INSERT INTO table_orders (
      id, table_id, status, opened_at, closed_at, subtotal, discount_total, total,
      note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, '', ?, ?)
  `).run(
    order.id,
    order.tableId,
    order.status,
    timestamp,
    order.status === "open" || order.status === "payment" ? "" : timestamp,
    order.total,
    order.total,
    timestamp,
    timestamp
  );
  for (const [id, menuItemId, productName, unitPrice, quantity, lineTotal, status] of items) {
    sqlite.prepare(`
      INSERT INTO table_order_items (
        id, order_id, product_id, menu_entry_id, product_name, unit_price, quantity, line_total,
        note, status, created_at, updated_at, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, 'TRY')
    `).run(id, order.id, sqlite.prepare("SELECT product_id FROM menu_product_entries WHERE id = ?").get(menuItemId).product_id,
      menuItemId, productName, unitPrice, quantity, lineTotal, status, timestamp, timestamp);
  }
}

function insertReservation(sqlite, id, status, type, createdDate, startDate, endDate) {
  const timestamp = atNoon(createdDate);
  sqlite.prepare(`
    INSERT INTO reservations (
      id, reservation_type, status, title, start_date, end_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, type, status, `Smoke ${id}`, startDate, endDate, timestamp, timestamp);
}

function insertRequest(sqlite, id, status, createdDate) {
  const timestamp = atNoon(createdDate);
  sqlite.prepare(`
    INSERT INTO requests (
      id, request_type, status, customer_name, customer_phone, created_at, updated_at
    ) VALUES (?, 'general_info', ?, 'Gizli Müşteri', '05550000000', ?, ?)
  `).run(id, status, timestamp, timestamp);
}

function insertTask(sqlite, id, status, createdDate, dueDate) {
  const timestamp = atNoon(createdDate);
  sqlite.prepare(`
    INSERT INTO daily_tasks (
      id, title, status, due_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, `Smoke iş ${id}`, status, dueDate, timestamp, timestamp);
}

function insertMovement(sqlite, id, menuItemId, type, change, _before, after, sourceType, createdDate) {
  const product = sqlite.prepare("SELECT p.id, p.business_id FROM catalog_products p JOIN menu_product_entries e ON e.product_id = p.id WHERE e.id = ?").get(menuItemId);
  const locationId = sqlite.prepare("SELECT id FROM inventory_locations WHERE business_id = ? AND is_primary = 1").get(product.business_id).id;
  sqlite.prepare(`
    INSERT INTO inventory_movements (
      id, business_id, product_id, location_id, movement_type, quantity_delta, quantity_after,
      reference_type, reference_id, actor_source, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Rapor smoke', ?)
  `).run(
    id,
    product.business_id,
    product.id,
    locationId,
    type === "image_import_add" ? "purchase" : "adjust",
    change,
    after,
    sourceType,
    `${sourceType}_source`,
    sourceType === "android" ? "android" : "desktop",
    atNoon(createdDate)
  );
}

function atNoon(date) {
  return `${date}T12:00:00+03:00`;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
