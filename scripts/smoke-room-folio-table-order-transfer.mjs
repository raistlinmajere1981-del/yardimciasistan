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
    SELECT id, name, price, currency, stock_quantity
    FROM menu_items
    WHERE deleted_at = '' AND is_available = 1
    ORDER BY sort_order, name LIMIT 1
  `).get();
  assert.ok(room?.id, "Transfer smoke needs an active room.");
  assert.ok(table?.id, "Transfer smoke needs an active table.");
  assert.ok(menuItem?.id, "Transfer smoke needs a menu item.");

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

  const opened = folioService.openFolio("room_transfer_smoke_stay");
  assert.equal(opened.ok, true);
  assert.ok(opened.folioId);

  const orderId = "room_transfer_smoke_order";
  const orderItemId = "room_transfer_smoke_order_item";
  const orderTotal = Math.max(1, Number(menuItem.price ?? 1));
  const currency = String(menuItem.currency || "TRY");
  const orderDb = new DatabaseSync(database.databasePath);
  orderDb.exec("PRAGMA foreign_keys = ON;");
  const stockBefore = orderDb.prepare(`SELECT stock_quantity FROM menu_items WHERE id = ?`).get(menuItem.id)?.stock_quantity ?? null;
  orderDb.exec("BEGIN");
  try {
    orderDb.prepare(`
      INSERT INTO table_orders (
        id, table_id, status, opened_at, closed_at, subtotal, discount_total, total,
        note, created_at, updated_at
      ) VALUES (?, ?, 'payment', ?, '', ?, 0, ?, '', ?, ?)
    `).run(orderId, table.id, now, orderTotal, orderTotal, now, now);
    orderDb.prepare(`
      INSERT INTO table_order_items (
        id, order_id, menu_item_id, product_name, unit_price, currency, quantity,
        line_total, note, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, '', 'served', ?, ?)
    `).run(orderItemId, orderId, menuItem.id, menuItem.name, orderTotal, currency, orderTotal, now, now);
    orderDb.prepare(`
      UPDATE tables SET status = 'bill_waiting', updated_at = ?, sync_status = 'local_only' WHERE id = ?
    `).run(now, table.id);
    orderDb.exec("COMMIT");
  } catch (error) {
    orderDb.exec("ROLLBACK");
    throw error;
  } finally {
    orderDb.close();
  }

  const financeBefore = finance.getData();
  const transfer = transferTableOrderToRoomFolio(database.databasePath, {
    folioId: opened.folioId,
    tableOrderId: orderId
  });
  assert.equal(transfer.ok, true, transfer.message);

  const after = new DatabaseSync(database.databasePath);
  const orderAfter = after.prepare(`SELECT status, closed_at FROM table_orders WHERE id = ?`).get(orderId);
  const tableAfter = after.prepare(`SELECT status FROM tables WHERE id = ?`).get(table.id);
  const stockAfter = after.prepare(`SELECT stock_quantity FROM menu_items WHERE id = ?`).get(menuItem.id)?.stock_quantity ?? null;
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
  assert.equal(stockAfter, stockBefore, "Room transfer must not consume menu stock a second time.");
  assert.equal(transferCount, 1);
  assert.equal(linkedItem.kind, "manual_charge");
  assert.equal(linkedItem.line_total_minor, Math.round(orderTotal * 100));
  assert.match(linkedItem.label, /Restoran/);

  const financeAfter = finance.getData();
  assert.equal(
    financeAfter.todayIncomeMinor,
    financeBefore.todayIncomeMinor,
    "Moving a restaurant bill to a room must not record cash before the guest actually pays."
  );

  const repeated = transferTableOrderToRoomFolio(database.databasePath, {
    folioId: opened.folioId,
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
  `).get(opened.folioId, `Masa adisyonu · ${orderId}`)?.count ?? 0);
  duplicateCheck.close();
  assert.equal(duplicateTransferCount, 1);
  assert.equal(duplicateFolioItems, 1, "Idempotent retry must not duplicate the room charge.");

  console.log("room-folio-table-order-transfer-smoke-ok");
} finally {
  database.close();
}

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}
