import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { DesktopRoomFolioService } = require("../apps/desktop-app/dist-electron/room-folio.js");
const { transferTableOrderToRoomFolio } = require("../apps/desktop-app/dist-electron/room-folio-order-transfer.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");

const appPath = join(process.cwd(), "apps", "desktop-app");
const dataDir = join(process.cwd(), "artifacts", "room-folio-order-transfer-smoke", String(Date.now()));
mkdirSync(dataDir, { recursive: true });

const database = new DesktopDatabase({ appPath, userDataPath: dataDir });

try {
  database.initialize();

  const setupResult = database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Transfer Test İşletmesi",
    phone: "+905550000500",
    whatsapp: "+905550000500",
    syncSecret: "transfer-test-secret-123",
    servicePreferences: { whatsapp: false, android: false },
  }));
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  seedSmokeBusinessLayout(database.databasePath, {
    roomCount: 1,
    tableCategories: [{ name: "Transfer Salonu", tableCount: 1 }]
  });

  const transferCategory = database.saveMenuCategory({
    name: "Transfer Test Kategorisi",
    description: "Transfer smoke testi",
    is_active: true,
    sort_order: 10
  });
  assert.equal(transferCategory.ok, true);
  const transferItem = database.saveMenuItem({
    category_id: transferCategory.savedId,
    name: "Transfer Test Ürünü",
    description: "Transfer smoke ürünü",
    price: 100,
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: [],
    tags: ["smoke"],
    sort_order: 10
  });
  assert.equal(transferItem.ok, true);

  const folioService = new DesktopRoomFolioService(database.databasePath);
  const finance = new DesktopFinanceService(database.databasePath);
  const sqlite = new DatabaseSync(database.databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const room = sqlite.prepare(`
    SELECT id FROM rooms WHERE deleted_at = '' AND is_active = 1 ORDER BY sort_order, name LIMIT 1
  `).get();
  const table = sqlite.prepare(`
    SELECT id, name FROM tables WHERE deleted_at = '' AND is_active = 1 ORDER BY sort_order, name LIMIT 1
  `).get();
  const menuItem = sqlite.prepare(`
    SELECT id, name, price, currency, stock_quantity, stock_consumption_quantity
    FROM menu_items
    WHERE deleted_at = ''
      AND is_available = 1
      AND (
        stock_quantity IS NULL
        OR stock_consumption_quantity <= 0
        OR stock_quantity >= stock_consumption_quantity
      )
    ORDER BY CASE WHEN stock_quantity IS NULL THEN 1 ELSE 0 END, sort_order, name
    LIMIT 1
  `).get();
  assert.ok(room?.id, "Transfer smoke needs an active room.");
  assert.ok(table?.id, "Transfer smoke needs an active table.");
  assert.ok(menuItem?.id, "Transfer smoke needs a sellable menu item.");

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const checkout = shiftDate(today, 2);
  sqlite.prepare(`
    INSERT INTO customers (
      id, full_name, phone, email, source, notes, tags_json, last_contact_at,
      created_at, updated_at, deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'manual', '', '[]', '', ?, ?, '', 'local_only')
  `).run("room_transfer_smoke_customer", "Odaya Yaz Smoke", "+905000000077", now, now);
  sqlite.prepare(`
    INSERT INTO customer_room_stays (
      id, customer_id, room_id, reservation_id, status, check_in_date, check_out_date,
      guest_count, notes, source, checked_in_at, checked_out_at, created_at, updated_at,
      deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'planned', ?, ?, 2, '', 'manual', '', '', ?, ?, '', 'local_only')
  `).run("room_transfer_smoke_stay", "room_transfer_smoke_customer", room.id, today, checkout, now, now);
  sqlite.close();

  assert.equal(database.checkInStay("room_transfer_smoke_stay").ok, true);
  const openedFolio = folioService.openFolio("room_transfer_smoke_stay");
  assert.equal(openedFolio.ok, true);
  assert.ok(openedFolio.folioId);

  // Use the same table-order service path as the real desktop UI. This proves
  // stock is consumed by the restaurant order exactly once before the bill is
  // moved to the room folio.
  const stockDbBefore = new DatabaseSync(database.databasePath);
  const stockBefore = stockDbBefore.prepare(`
    SELECT stock_quantity FROM menu_items WHERE id = ?
  `).get(menuItem.id)?.stock_quantity ?? null;
  stockDbBefore.close();

  const openedOrder = database.openTableOrder(table.id);
  assert.equal(openedOrder.ok, true, openedOrder.message);
  const orderId = openedOrder.order.id;

  const itemAdded = database.addTableOrderItem({
    orderId,
    menuItemId: menuItem.id,
    quantity: 1,
    note: "Pilot transfer smoke"
  });
  assert.equal(itemAdded.ok, true, itemAdded.message);

  const stockDbAfterOrder = new DatabaseSync(database.databasePath);
  const stockAfterOrder = stockDbAfterOrder.prepare(`
    SELECT stock_quantity FROM menu_items WHERE id = ?
  `).get(menuItem.id)?.stock_quantity ?? null;
  stockDbAfterOrder.close();

  if (stockBefore !== null && Number(menuItem.stock_consumption_quantity ?? 0) > 0) {
    assert.equal(
      Number(stockAfterOrder),
      Number(stockBefore) - Number(menuItem.stock_consumption_quantity),
      "Adding the restaurant item must consume tracked stock exactly once."
    );
  }

  const paymentWaiting = database.updateTableOrderStatus({ orderId, status: "payment" });
  assert.equal(paymentWaiting.ok, true, paymentWaiting.message);
  assert.equal(paymentWaiting.order.status, "payment");
  const orderTotal = paymentWaiting.order.total;
  assert.ok(orderTotal > 0, "Payment-waiting restaurant order must have a positive total.");

  const financeBefore = finance.getData();
  const transfer = transferTableOrderToRoomFolio(database.databasePath, {
    folioId: openedFolio.folioId,
    tableOrderId: orderId
  });
  assert.equal(transfer.ok, true, transfer.message);

  const after = new DatabaseSync(database.databasePath);
  const orderAfter = after.prepare(`SELECT status, closed_at FROM table_orders WHERE id = ?`).get(orderId);
  const tableAfter = after.prepare(`SELECT status FROM tables WHERE id = ?`).get(table.id);
  const stockAfterTransfer = after.prepare(`SELECT stock_quantity FROM menu_items WHERE id = ?`).get(menuItem.id)?.stock_quantity ?? null;
  const transferCount = Number(after.prepare(`
    SELECT COUNT(*) AS count FROM room_folio_table_order_transfers WHERE table_order_id = ?
  `).get(orderId)?.count ?? 0);
  const linkedItem = after.prepare(`
    SELECT items.kind, items.label, items.line_total_minor
    FROM room_folio_table_order_transfers AS transfers
    JOIN room_folio_items AS items ON items.id = transfers.folio_item_id
    WHERE transfers.table_order_id = ?
  `).get(orderId);
  after.close();

  assert.equal(orderAfter.status, "paid", "Transferred restaurant order must close as paid without a cash entry.");
  assert.ok(orderAfter.closed_at);
  assert.equal(tableAfter.status, "available", "Transferred table must become available.");
  assert.equal(
    stockAfterTransfer,
    stockAfterOrder,
    "Moving a restaurant bill to a room must not consume tracked stock a second time."
  );
  assert.equal(transferCount, 1);
  assert.equal(linkedItem.kind, "manual_charge");
  assert.equal(linkedItem.line_total_minor, Math.round(orderTotal * 100));
  assert.match(linkedItem.label, /Restoran/);

  const financeAfterTransfer = finance.getData();
  assert.equal(
    financeAfterTransfer.todayIncomeMinor,
    financeBefore.todayIncomeMinor,
    "Moving a restaurant bill to a room must not record cash before the guest actually pays."
  );

  const repeated = transferTableOrderToRoomFolio(database.databasePath, {
    folioId: openedFolio.folioId,
    tableOrderId: orderId
  });
  assert.equal(repeated.ok, true, "Repeating the same transfer must be idempotent.");

  const duplicateCheck = new DatabaseSync(database.databasePath);
  const duplicateTransferCount = Number(duplicateCheck.prepare(`
    SELECT COUNT(*) AS count FROM room_folio_table_order_transfers WHERE table_order_id = ?
  `).get(orderId)?.count ?? 0);
  const duplicateFolioItems = Number(duplicateCheck.prepare(`
    SELECT COUNT(*) AS count
    FROM room_folio_items
    WHERE folio_id = ? AND note = ? AND deleted_at = ''
  `).get(openedFolio.folioId, `Masa adisyonu · ${orderId}`)?.count ?? 0);
  duplicateCheck.close();
  assert.equal(duplicateTransferCount, 1);
  assert.equal(duplicateFolioItems, 1, "Idempotent retry must not duplicate the room charge.");

  const folioAfterTransfer = folioService.getData().folios.find((folio) => folio.id === openedFolio.folioId);
  assert.ok(folioAfterTransfer);
  assert.ok(folioAfterTransfer.remainingMinor >= Math.round(orderTotal * 100));

  const paymentAmount = Math.min(folioAfterTransfer.remainingMinor, Math.round(orderTotal * 100));
  const roomPayment = folioService.addPayment({
    folioId: openedFolio.folioId,
    amountMinor: paymentAmount,
    paymentMethod: "cash",
    note: "Restoran oda transfer smoke tahsilatı"
  });
  assert.equal(roomPayment.ok, true, roomPayment.message);

  const financeAfterPayment = finance.getData();
  assert.equal(
    financeAfterPayment.todayIncomeMinor,
    financeAfterTransfer.todayIncomeMinor + paymentAmount,
    "Transferred restaurant revenue must enter cash only when the room payment is actually collected."
  );

  console.log("room-folio-table-order-transfer-smoke-ok");
} finally {
  database.close();
}

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}
