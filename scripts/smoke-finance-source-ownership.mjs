import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { globSync, readFileSync } from "node:fs";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";

const require = createRequire(import.meta.url);
const { DesktopFinanceService, synchronizeFinanceSourceInTransaction: sync } = require("../apps/desktop-app/dist-electron/finance.js");
const { DesktopRoomFolioService } = require("../apps/desktop-app/dist-electron/room-folio.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const credit = require("../apps/desktop-app/dist-electron/customer-credit-runtime.js");
const { saveCatalogProduct } = require("../apps/desktop-app/dist-electron/commerce-store.js");
const ok = result => { assert.equal(result.ok, true, result.message); return result; };
const now = new Date().toISOString();
const ledgerWrite = /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+finance_entries\b/i;
for (const file of globSync("apps/desktop-app/electron/**/*.ts")) {
  if (file.endsWith("/finance.ts")) continue;
  assert.doesNotMatch(readFileSync(file, "utf8"), ledgerWrite, `${file} must delegate to finance ownership`);
}
assert.doesNotMatch(readFileSync("apps/desktop-app/db/schema.sql", "utf8"), ledgerWrite, "Schema invariants/projections must not write the canonical ledger");

for (const source of ["pension_payment", "room_folio_payment", "restaurant_order", "customer_credit_payment"]) {
  const { database, cleanup } = createTemporaryDesktopDatabase("finance-source-owner-");
  let db;
  try {
    database.initialize();
    ok(database.saveInitialSetup(createSmokeSetupInput({ profileId: source === "customer_credit_payment" ? "market" : "pension_restaurant",
      businessName: "Finance ownership", phone: "", whatsapp: "", syncSecret: "finance-source-fixture-secret", servicePreferences: { whatsapp: false, android: false } })));
    const path = database.databasePath;
    const finance = new DesktopFinanceService(path), folios = new DesktopRoomFolioService(path);
    db = new DatabaseSync(path);
    db.exec("PRAGMA foreign_keys=ON");
    let operation, table, failureEvent;
    if (source === "pension_payment") {
      db.prepare(`INSERT INTO reservations (id, reservation_type, status, title, start_date, end_date, agreed_total_minor, created_at, updated_at)
        VALUES ('deposit', 'room', 'approved', 'Deposit', '2035-01-01', '2035-01-02', 10000, ?, ?)`).run(now, now);
      operation = () => finance.addPensionPayment({ reservationId: "deposit", amountMinor: 1000, paymentMethod: "bank" });
      table = "pension_payments"; failureEvent = "INSERT";
    } else if (source === "room_folio_payment") {
      seedSmokeBusinessLayout(path, { roomCount: 1, nightlyPriceMinor: 10000 });
      const customerId = ok(database.saveCustomer({ fullName: "Guest" })).savedId;
      const roomId = db.prepare("SELECT id FROM rooms LIMIT 1").get().id;
      const stay = ok(database.assignCustomerToRoom({ customerId, roomId, checkInDate: "2035-01-01", checkOutDate: "2035-01-02", guestCount: 1, status: "checked_in", notes: "" }));
      const folioId = ok(folios.openFolio(stay.savedId)).folioId;
      operation = () => folios.addPayment({ folioId, amountMinor: 1000, paymentMethod: "card" });
      table = "room_folio_payments"; failureEvent = "INSERT";
    } else if (source === "restaurant_order") {
      seedSmokeBusinessLayout(path, { tableCategories: [{ name: "Restaurant", tableCount: 1 }] });
      const categoryId = ok(database.saveMenuCategory({ name: "Food", description: "", is_active: true, sort_order: 1 })).savedId;
      const menuItemId = ok(database.saveMenuItem({ category_id: categoryId, name: "Meal", description: "", price: 10, currency: "TRY", image_url: "", is_available: true,
        is_featured: false, allergens: [], tags: [], sort_order: 1 })).savedId;
      const tableId = db.prepare("SELECT id FROM tables LIMIT 1").get().id;
      const orderId = ok(database.openTableOrder(tableId)).order.id;
      ok(database.addTableOrderItem({ orderId, menuItemId, quantity: 1, note: "" }));
      operation = () => database.closeTableOrder({ orderId, status: "paid" });
      table = "table_orders"; failureEvent = "UPDATE OF status";
    } else {
      setBusinessCapability(path, { capability: "commerce.customer_credit", enabled: true });
      const customerId = ok(database.saveCustomer({ fullName: "Credit customer" })).savedId;
      const product = saveCatalogProduct(path, { name: "Credit product", salePrice: 100, trackInventory: false });
      credit.createCustomerCreditSale(path, { customerId, items: [{ productId: product.id, quantity: 1 }] });
      operation = () => ({ ok: true, entry: credit.recordCustomerCreditPayment(path, { customerId, amountMinor: 1000, currency: "TRY", paymentMethod: "cash" }) });
      table = "customer_credit_entries"; failureEvent = "INSERT";
    }
    const snapshot = () => [table, "finance_entries", "reservations", "tables", "sync_outbox", "events"]
      .map(name => db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
    const fails = () => {
      try { assert.equal(operation().ok, false); } catch (error) { assert.match(error.message, /injected_/); }
    };
    const before = snapshot();
    db.exec("CREATE TRIGGER test_ledger_fail BEFORE INSERT ON finance_entries BEGIN SELECT RAISE(ABORT, 'injected_ledger'); END");
    fails(); assert.deepEqual(snapshot(), before, `${source}: ledger failure rolls back source and projections`);
    db.exec("DROP TRIGGER test_ledger_fail");
    db.exec(`CREATE TRIGGER test_source_fail BEFORE ${failureEvent} ON ${table} BEGIN SELECT RAISE(ABORT, 'injected_source'); END`);
    fails(); assert.deepEqual(snapshot(), before, `${source}: source failure creates no ledger`);
    db.exec("DROP TRIGGER test_source_fail");
    ok(operation());
    const entry = db.prepare("SELECT * FROM finance_entries WHERE source_type=?").get(source);
    assert.ok(entry); assert.equal(entry.amount_minor, 1000);
    assert.equal(finance.getData().recentEntries.filter(e => e.sourceType === source).length, 1);
    assert.throws(() => sync(db, source, entry.source_id), /requires a transaction/);
    db.exec("BEGIN IMMEDIATE");
    sync(db, source, entry.source_id); sync(db, source, entry.source_id);
    db.exec("COMMIT");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM finance_entries WHERE source_type=?").get(source).n, 1, "Same source cannot create duplicate ledger income");
    if (source === "restaurant_order") {
      // Explicit recalc is also exposed for closed orders; it must preserve the same ledger identity.
      db.prepare("UPDATE table_order_items SET unit_price=20, line_total=20 WHERE order_id=?").run(entry.source_id);
      const beforeRecalc = snapshot();
      db.exec("CREATE TRIGGER test_recalc_fail BEFORE UPDATE ON finance_entries BEGIN SELECT RAISE(ABORT, 'injected_recalc'); END");
      assert.throws(() => database.recalculateTableOrderTotal(entry.source_id), /injected_recalc/);
      assert.deepEqual(snapshot(), beforeRecalc, "Recalc finance failure restores order totals/timestamp");
      db.exec("DROP TRIGGER test_recalc_fail");
      ok(database.recalculateTableOrderTotal(entry.source_id));
      assert.equal(db.prepare("SELECT amount_minor FROM finance_entries WHERE id=?").get(entry.id).amount_minor, 2000);
      db.prepare("UPDATE table_order_items SET line_total=0 WHERE order_id=?").run(entry.source_id);
      ok(database.recalculateTableOrderTotal(entry.source_id));
      assert.ok(db.prepare("SELECT deleted_at FROM finance_entries WHERE id=?").get(entry.id).deleted_at);
      db.prepare("UPDATE table_order_items SET line_total=10, unit_price=10 WHERE order_id=?").run(entry.source_id);
      ok(database.recalculateTableOrderTotal(entry.source_id));
      assert.equal(db.prepare("SELECT amount_minor FROM finance_entries WHERE id=?").get(entry.id).amount_minor, 1000);
      assert.equal(db.prepare("SELECT deleted_at FROM finance_entries WHERE id=?").get(entry.id).deleted_at, "");
    }
    if (source === "room_folio_payment") {
      const beforeVoid = snapshot();
      db.exec("CREATE TRIGGER test_void_fail BEFORE UPDATE ON finance_entries BEGIN SELECT RAISE(ABORT, 'injected_void'); END");
      assert.throws(() => folios.voidPayment(entry.source_id), /injected_void/);
      assert.deepEqual(snapshot(), beforeVoid);
      db.exec("DROP TRIGGER test_void_fail");
      ok(folios.voidPayment(entry.source_id));
      assert.ok(db.prepare("SELECT deleted_at FROM finance_entries WHERE id=?").get(entry.id).deleted_at);
      assert.equal(finance.getData().recentEntries.some(e => e.id === entry.id), false);
    }
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    console.log(`PASS ${source}: commit, source/ledger rollback, source identity, idempotent ledger${source === "room_folio_payment" ? ", atomic void" : ""}`);
  } finally { db?.close(); cleanup(); }
}
