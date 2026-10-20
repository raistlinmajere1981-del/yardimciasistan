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
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { DesktopRoomFolioService } = require("../apps/desktop-app/dist-electron/room-folio.js");
const { transferTableOrderToRoomFolio } = require("../apps/desktop-app/dist-electron/room-folio-order-transfer.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");
const { listCatalogProducts, saveCatalogProduct } = require("../apps/desktop-app/dist-electron/commerce-store.js");

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
    nightlyPriceMinor: 10000,
    tableCategories: [{ name: "Transfer Salonu", tableCount: 1 }]
  });

  const transferCategory = database.saveMenuCategory({
    name: "Transfer Test Kategorisi",
    description: "Transfer smoke testi",
    is_active: true,
    sort_order: 10
  });
  assert.equal(transferCategory.ok, true);
  const transferItem = saveMenuProductFixture(database, {
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
    stock_quantity: 5,
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
  const menuItem = database.getPublishedMenu().items.find(item => item.id === transferItem.savedId);
  assert.ok(room?.id, "Transfer smoke needs an active room.");
  assert.ok(table?.id, "Transfer smoke needs an active table.");
  assert.ok(menuItem?.id, "Transfer smoke needs a sellable menu item.");

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const checkout = shiftDate(today, 2);
  sqlite.prepare(`
    INSERT INTO customers (
      id, full_name, phone, email, source, notes, last_contact_at,
      created_at, updated_at, deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'manual', '', '', ?, ?, '', 'local_only')
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
    SELECT b.quantity AS stock_quantity FROM inventory_balances b JOIN menu_product_entries e ON e.product_id = b.product_id WHERE e.id = ?
  `).get(menuItem.id)?.stock_quantity ?? null;
  stockDbBefore.close();

  const openedOrder = database.openTableOrder(table.id);
  assert.equal(openedOrder.ok, true, openedOrder.message);
  const orderId = openedOrder.order.id;

  const itemAdded = database.addTableOrderItem({
    orderId,
    menuEntryId: menuItem.id,
    quantity: 1,
    note: "Pilot transfer smoke"
  });
  assert.equal(itemAdded.ok, true, itemAdded.message);
  const historicalLine = itemAdded.order.items[0];
  assert.equal(historicalLine.productId, menuItem.product_id);
  assert.equal(historicalLine.menuEntryId, menuItem.id);
  const canonicalProduct = listCatalogProducts(database.databasePath).find(item => item.id === menuItem.product_id);
  saveCatalogProduct(database.databasePath, { ...canonicalProduct, name: "Later product", salePrice: 999, currency: "USD" });
  assert.deepEqual(database.getActiveTableOrder(table.id).items[0], historicalLine,
    "Table line snapshots must not follow later canonical identity/pricing/currency edits.");

  const stockDbAfterOrder = new DatabaseSync(database.databasePath);
  const stockAfterOrder = stockDbAfterOrder.prepare(`
    SELECT b.quantity AS stock_quantity FROM inventory_balances b JOIN menu_product_entries e ON e.product_id = b.product_id WHERE e.id = ?
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
  const transferDb = new DatabaseSync(database.databasePath);
  const accountSnapshot = () => ["room_folios", "room_folio_items", "room_folio_payments", "room_folio_totals", "table_orders", "table_order_items", "tables", "inventory_balances", "inventory_movements", "customer_credit_entries"]
    .map(name => transferDb.prepare(`SELECT * FROM ${name}`).all());
  const beforeFailure = accountSnapshot();
  transferDb.exec("CREATE TRIGGER test_transfer_failure BEFORE INSERT ON room_folio_table_order_transfers BEGIN SELECT RAISE(ABORT, 'injected_transfer_failure'); END");
  assert.equal(transferTableOrderToRoomFolio(database.databasePath, { folioId: openedFolio.folioId, tableOrderId: orderId }).ok, false);
  assert.deepEqual(accountSnapshot(), beforeFailure, "Failed transfer must roll back the charge, order closure, inventory and all account state.");
  transferDb.exec("DROP TRIGGER test_transfer_failure");
  const movementsBeforeTransfer = transferDb.prepare("SELECT COUNT(*) AS n FROM inventory_movements").get().n;
  transferDb.close();
  const transfer = transferTableOrderToRoomFolio(database.databasePath, {
    folioId: openedFolio.folioId,
    tableOrderId: orderId
  });
  assert.equal(transfer.ok, true, transfer.message);

  const after = new DatabaseSync(database.databasePath);
  const orderAfter = after.prepare(`SELECT status, closed_at FROM table_orders WHERE id = ?`).get(orderId);
  const tableAfter = after.prepare(`SELECT status FROM tables WHERE id = ?`).get(table.id);
  const stockAfterTransfer = after.prepare(`SELECT b.quantity AS stock_quantity FROM inventory_balances b JOIN menu_product_entries e ON e.product_id = b.product_id WHERE e.id = ?`).get(menuItem.id)?.stock_quantity ?? null;
  const transferCount = Number(after.prepare(`
    SELECT COUNT(*) AS count FROM room_folio_table_order_transfers WHERE table_order_id = ?
  `).get(orderId)?.count ?? 0);
  const linkedItem = after.prepare(`
    SELECT items.kind, items.label, items.line_total_minor, items.product_id, items.menu_entry_id, items.inventory_quantity_per_item
    FROM room_folio_table_order_transfers AS transfers
    JOIN room_folio_items AS items ON items.id = transfers.folio_item_id
    WHERE transfers.table_order_id = ?
  `).get(orderId);
  assert.equal(after.prepare("SELECT COUNT(*) AS n FROM inventory_movements").get().n, movementsBeforeTransfer);
  assert.equal(after.prepare("SELECT COUNT(*) AS n FROM customer_credit_entries").get().n, 0);
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
  assert.equal(linkedItem.product_id, null);
  assert.equal(linkedItem.menu_entry_id, null);
  assert.equal(linkedItem.inventory_quantity_per_item, 0);
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
  assert.equal(duplicateCheck.prepare("SELECT COUNT(*) AS n FROM inventory_movements").get().n, movementsBeforeTransfer,
    "Transfer retry must not append an inventory movement.");
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
  const beforeCheckout = roomPayment.data.folios.find(item => item.id === openedFolio.folioId);
  assert.ok(beforeCheckout.remainingMinor > 0);
  const checkedOut = folioService.checkout({ folioId: openedFolio.folioId });
  assert.equal(checkedOut.ok, true, checkedOut.message);
  const afterCheckout = checkedOut.data.folios.find(item => item.id === openedFolio.folioId);
  assert.equal(afterCheckout.status, "open");
  assert.equal(afterCheckout.remainingMinor, beforeCheckout.remainingMinor);
  assert.deepEqual(afterCheckout.payments, beforeCheckout.payments);
  const finalDb = new DatabaseSync(database.databasePath);
  assert.equal(finalDb.prepare("SELECT COUNT(*) AS n FROM customer_credit_entries").get().n, 0);
  assert.equal(finalDb.prepare("SELECT COUNT(*) AS n FROM inventory_movements").get().n, movementsBeforeTransfer);
  finalDb.close();

  console.log("room-folio-table-order-transfer-smoke-ok");
} finally {
  database.close();
}

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}
