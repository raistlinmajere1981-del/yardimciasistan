import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { globSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";

const require = createRequire(import.meta.url);
const commerce = require("../apps/desktop-app/dist-electron/commerce-store.js");
const { receiveCommercePurchase } = require("../apps/desktop-app/dist-electron/commerce-purchase-store.js");
const { createAndroidEntityId } = require("../apps/desktop-app/dist-electron/database/android-utils.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");
const { DesktopRoomFolioService } = require("../apps/desktop-app/dist-electron/room-folio.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { BUSINESS_CAPABILITIES: C } = require("@yardimci-asistan/shared");
const ok = result => { assert.equal(result.ok, true, result.message); return result; };
const now = new Date().toISOString();

// Ownership-only assertions complement the behavioral tests: no function-body/location snapshots.
const inventoryWrite = /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+inventory_(?:balances|movements|locations)\b/i;
assert.doesNotMatch(readFileSync("apps/desktop-app/electron/commerce-purchase-store.ts", "utf8"), inventoryWrite,
  "Purchase must delegate inventory persistence instead of owning a second writer");
const androidDomainWrite = /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+(?:customer_room_stays|rooms|reservations|table_orders|table_order_items|finance_entries|customers|requests|inventory_balances|inventory_movements|inventory_locations)\b/i;
for (const file of globSync("apps/desktop-app/electron/*android*.ts")) {
  assert.doesNotMatch(readFileSync(file, "utf8"), androidDomainWrite, `${file} must route these domain mutations to canonical operations`);
}

function setup(database, profileId) {
  database.initialize();
  ok(database.saveInitialSetup(createSmokeSetupInput({ businessName: "Mutation ownership", profileId,
    phone: "+905550095501", whatsapp: "+905550095501", syncSecret: "ownership-regression-secret",
    servicePreferences: { whatsapp: false, android: true } })));
}

// Commerce: same failure surface and storage invariants for sale, purchase and explicit adjustments.
{
  const { database, cleanup } = createTemporaryDesktopDatabase("inventory-owner-");
  let db;
  try {
    setup(database, "market");
    const path = database.databasePath;
    db = new DatabaseSync(path);
    db.exec("PRAGMA foreign_keys = ON");
    const product = commerce.saveCatalogProduct(path, { name: "Stock owner", salePrice: 10, purchasePrice: 4, trackInventory: false });
    // No location/balance yet: emulate a newly tracked product, not an existing stock row.
    db.prepare("UPDATE catalog_products SET track_inventory = 1 WHERE id = ?").run(product.id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM inventory_locations").get().n, 0);
    const tables = ["inventory_locations", "inventory_balances", "inventory_movements", "purchase_orders", "purchase_order_items", "commerce_sales", "commerce_sale_items"];
    const snapshot = () => tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const buy = quantity => receiveCommercePurchase(path, { source: "android", items: [{ productId: product.id, quantity, unitCost: 4 }] });
    const sell = quantity => commerce.createPaidCommerceSale(path, { source: "desktop", items: [{ productId: product.id, quantity }] });
    let before = snapshot();
    for (const quantity of [0, -1, NaN, Infinity, 0.00001]) {
      assert.throws(() => buy(quantity), /adedi sıfırdan büyük/);
      assert.throws(() => sell(quantity), /adedi sıfırdan büyük/);
      assert.deepEqual(snapshot(), before);
    }
    db.exec(`CREATE TRIGGER test_inventory_failure BEFORE INSERT ON inventory_movements BEGIN SELECT RAISE(ABORT, 'inventory_failure'); END;`);
    assert.throws(() => buy(5), /inventory_failure/);
    assert.deepEqual(snapshot(), before, "First movement failure must also roll back primary location creation and purchase rows");
    db.exec("DROP TRIGGER test_inventory_failure");
    const purchase = buy(5.5);
    const location = db.prepare("SELECT * FROM inventory_locations").get();
    assert.equal(location.is_primary, 1);
    assert.equal(location.code, "main");
    assert.equal(commerce.getInventoryBalance(path, product.id).quantity, 5.5);
    let movement = db.prepare("SELECT * FROM inventory_movements ORDER BY rowid DESC LIMIT 1").get();
    assert.equal(movement.movement_type, "purchase");
    assert.equal(movement.reference_type, "purchase_order");
    assert.equal(movement.reference_id, purchase.order.id);
    assert.equal(movement.actor_source, "android");
    assert.equal(movement.unit_cost, 4);
    db.prepare("UPDATE inventory_balances SET minimum_quantity = 2 WHERE product_id = ?").run(product.id);
    const sale = sell(2);
    assert.equal(commerce.getInventoryBalance(path, product.id).quantity, 3.5);
    assert.equal(commerce.getInventoryBalance(path, product.id).minimumQuantity, 2);
    movement = db.prepare("SELECT * FROM inventory_movements ORDER BY rowid DESC LIMIT 1").get();
    assert.equal(movement.quantity_delta, -2);
    assert.equal(movement.reference_type, "commerce_sale");
    assert.equal(movement.reference_id, sale.id);
    assert.equal(movement.actor_source, "desktop");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM inventory_locations").get().n, 1);
    before = snapshot();
    assert.throws(() => sell(4), /Yetersiz stok/);
    assert.deepEqual(snapshot(), before);
    db.exec(`CREATE TRIGGER test_inventory_failure BEFORE INSERT ON inventory_movements BEGIN SELECT RAISE(ABORT, 'inventory_failure'); END;`);
    assert.throws(() => buy(1), /inventory_failure/);
    assert.throws(() => sell(1), /inventory_failure/);
    assert.deepEqual(snapshot(), before, "Both writers must roll back balance, movement and parent operation rows");
    db.exec("DROP TRIGGER test_inventory_failure");
    assert.throws(() => commerce.applyInventoryMovement(path, { productId: product.id, type: "adjust", quantityDelta: 0 }), /sıfırdan farklı/);
    assert.equal(commerce.setInventoryCount(path, { productId: product.id, countedQuantity: 3.5 }).movement, null);
    const count = commerce.setInventoryCount(path, { productId: product.id, countedQuantity: 0 });
    assert.equal(count.balance.quantity, 0);
    assert.equal(count.movement.type, "count");
    const businessId = db.prepare("SELECT id FROM business").get().id;
    db.exec("BEGIN IMMEDIATE");
    commerce.applyInventoryMovementInTransaction(db, businessId, { productId: product.id, type: "return_in", quantityDelta: 1 }, now);
    assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id = ?").get(product.id).quantity, 1);
    db.exec("ROLLBACK");
    assert.equal(commerce.getInventoryBalance(path, product.id).quantity, 0);
    db.prepare("UPDATE inventory_locations SET is_active = 0").run();
    assert.throws(() => buy(1), /Stok konumu bulunamadı/);
    assert.throws(() => sell(1), /Stok konumu bulunamadı/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM inventory_locations").get().n, 1, "Inactive primary must not cause a second primary to be created");
  } finally { db?.close(); cleanup(); }
}

// Android: entry coordinator, receipt, domain side effects and guards match the desktop path.
{
  const { database, cleanup } = createTemporaryDesktopDatabase("android-domain-owner-");
  let db;
  try {
    setup(database, "pension_restaurant");
    seedSmokeBusinessLayout(database.databasePath, { roomCount: 6, nightlyPriceMinor: 5000, tableCategories: [{ name: "Restaurant", tableCount: 2 }] });
    db = new DatabaseSync(database.databasePath);
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare("INSERT INTO kbs_service_settings (id, enabled, provider, created_at, updated_at) VALUES ('primary', 1, 'egm', ?, ?)").run(now, now);
    database.upsertAndroidDeviceSightings([{ device_id: "ownership_phone", device_name: "Ownership", app_version: "smoke", first_seen_at: now, last_seen_at: now }]);
    ok(database.setAndroidDeviceRole("ownership_phone", "admin"));
    ok(database.setAndroidDeviceActive("ownership_phone", true));
    const action = (id, action_type, payload) => ({ id, action_type, payload, device_id: "ownership_phone", device_name: "Ownership", app_version: "smoke", created_at: now, status: "pending", error_message: "" });
    const apply = (id, type, payload) => database.applyAndroidAction(action(id, type, payload));
    const rooms = database.getDashboardData().rooms;
    const tables = database.getDashboardData().tables;
    const customer = index => ok(database.saveCustomer({ fullName: `Owner guest ${index}`, phone: "", email: "", notes: "", tags: [],
      identityType: "", identityNumber: "", nationality: "", birthDate: "", gender: "", documentSerialNumber: "", documentExpiryDate: "", birthPlace: "", motherName: "", fatherName: "", issuingAuthority: "", address: "" })).savedId;
    const input = (customerId, roomId) => ({ customerId, roomId, checkInDate: "2035-05-01", checkOutDate: "2035-05-03", guestCount: 1, notes: "", status: "checked_in" });
    const payload = i => ({ customer_id: i.customerId, room_id: i.roomId, check_in_date: i.checkInDate, check_out_date: i.checkOutDate, guest_count: 1, notes: "", status: i.status });
    const desktopGuest = customer(1);
    const androidGuest = customer(2);
    const desktopStay = ok(database.assignCustomerToRoom({ ...input(desktopGuest, rooms[0].id), requestId: "desktop_entry" })).savedId;
    const androidInput = input(androidGuest, rooms[1].id);
    ok(apply("android_entry", "customer_room_assign", payload(androidInput)));
    const androidStay = createAndroidEntityId("stay_", "android_entry");
    function invariant(stayId) {
      const stay = db.prepare("SELECT * FROM customer_room_stays WHERE id = ?").get(stayId);
      assert.equal(stay.status, "checked_in");
      assert.ok(stay.checked_in_at);
      assert.equal(db.prepare("SELECT status FROM rooms WHERE id = ?").get(stay.room_id).status, "occupied");
      const guests = db.prepare("SELECT * FROM stay_guests WHERE stay_id = ? AND status = 'checked_in'").all(stayId);
      assert.equal(guests.length, 1);
      assert.equal(stay.guest_count, guests.length);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hospitality_notifications WHERE stay_id = ? AND kind = 'arrival'").get(stayId).n, 1);
      const folio = db.prepare("SELECT * FROM room_folios WHERE stay_id = ?").get(stayId);
      assert.ok(folio);
      assert.equal(folio.status, "open");
      assert.equal(folio.customer_id, stay.customer_id);
      assert.equal(folio.lodging_total_minor, 10000);
      return folio;
    }
    invariant(desktopStay);
    invariant(androidStay);
    const counts = () => ["customer_room_stays", "stay_guests", "room_folios", "room_folio_payments", "hospitality_notifications", "android_action_receipts"]
      .map(table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
    const beforeReplay = counts();
    assert.equal(ok(apply("android_entry", "customer_room_assign", payload(androidInput))).alreadyApplied, true);
    assert.deepEqual(counts(), beforeReplay);
    const arrival = db.prepare("SELECT * FROM events WHERE type = 'customer.room_assigned' AND entity_id = ?").get(androidStay);
    assert.equal(arrival.actor_type, "android");
    assert.equal(arrival.actor_id, "ownership_phone");
    assert.equal(JSON.parse(arrival.payload_json).android_action_id, "android_entry");
    // Failure in the coordinator's folio stage restores Stay, room, guests, notifications and receipt.
    const rollbackGuest = customer(3);
    db.exec(`CREATE TRIGGER test_entry_folio_failure BEFORE INSERT ON room_folios BEGIN SELECT RAISE(ABORT, 'entry_failure'); END;`);
    const beforeFailure = counts();
    assert.equal(apply("entry_failure", "customer_room_assign", payload(input(rollbackGuest, rooms[2].id))).ok, false);
    assert.deepEqual(counts(), beforeFailure);
    assert.equal(db.prepare("SELECT status FROM rooms WHERE id = ?").get(rooms[2].id).status, "available");
    assert.equal(database.assignCustomerToRoom(input(rollbackGuest, rooms[2].id)).ok, false);
    db.exec("DROP TRIGGER test_entry_folio_failure");
    ok(apply("entry_failure", "customer_room_assign", payload(input(rollbackGuest, rooms[2].id))));
    invariant(createAndroidEntityId("stay_", "entry_failure"));
    // Planned linked booking → Android arrival must preserve linkage, copy deposit and create the folio once.
    const bookingGuest = customer(4);
    ok(database.saveManualReservation({ customerId: bookingGuest, roomId: rooms[3].id, startDate: "2035-05-01", endDate: "2035-05-03", guestCount: 1, notes: "" }));
    const booking = db.prepare("SELECT id FROM reservations WHERE customer_id = ?").get(bookingGuest);
    const finance = new DesktopFinanceService(database.databasePath);
    ok(finance.setReservationAgreedTotal({ reservationId: booking.id, amountMinor: 10000 }));
    ok(finance.addPensionPayment({ reservationId: booking.id, amountMinor: 4000, paymentMethod: "bank" }));
    const planned = ok(database.createStayFromReservation({ reservationId: booking.id, status: "planned" }));
    ok(apply("booking_arrival", "customer_room_stay_status", { stay_id: planned.savedId, status: "checked_in" }));
    const linkedFolio = invariant(planned.savedId);
    assert.equal(linkedFolio.reservation_id, booking.id);
    assert.equal(db.prepare("SELECT paid_total_minor FROM room_folio_totals WHERE folio_id = ?").get(linkedFolio.id).paid_total_minor, 4000);
    assert.equal(db.prepare("SELECT status FROM reservations WHERE id = ?").get(booking.id).status, "approved");
    assert.equal(ok(apply("booking_arrival", "customer_room_stay_status", { stay_id: planned.savedId, status: "checked_in" })).alreadyApplied, true);
    // Permission and capability remain at the outer Android boundary, before any canonical mutation.
    const deniedGuest = customer(5);
    ok(database.setAndroidDeviceRole("ownership_phone", "staff"));
    const beforeDenied = counts();
    assert.equal(apply("permission_denied", "customer_room_assign", payload(input(deniedGuest, rooms[4].id))).ok, false);
    assert.deepEqual(counts(), beforeDenied);
    ok(database.setAndroidDeviceRole("ownership_phone", "admin"));
    const capabilityState = db.prepare("SELECT * FROM business_capabilities WHERE capability_id = ?").get(C.ACCOMMODATION_STAYS);
    db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = ?").run(C.ACCOMMODATION_STAYS);
    assert.equal(apply("capability_denied", "customer_room_assign", payload(input(deniedGuest, rooms[4].id))).ok, false);
    assert.deepEqual(counts(), beforeDenied);
    db.prepare("UPDATE business_capabilities SET is_enabled = ? WHERE capability_id = ?").run(capabilityState.is_enabled, C.ACCOMMODATION_STAYS);
    const receiptGuest = customer(6);
    const receiptInput = payload(input(receiptGuest, rooms[5].id));
    db.exec(`CREATE TRIGGER test_entry_receipt_failure BEFORE INSERT ON android_action_receipts WHEN NEW.id = 'entry_receipt_failure' BEGIN SELECT RAISE(ABORT, 'receipt_failure'); END;`);
    const beforeReceiptFailure = counts();
    assert.equal(apply("entry_receipt_failure", "customer_room_assign", receiptInput).ok, false);
    assert.deepEqual(counts(), beforeReceiptFailure, "Releasing the arrival savepoint must not commit outside the Android receipt transaction");
    assert.equal(db.prepare("SELECT status FROM rooms WHERE id = ?").get(rooms[5].id).status, "available");
    db.exec("DROP TRIGGER test_entry_receipt_failure");
    ok(apply("entry_receipt_failure", "customer_room_assign", receiptInput));
    invariant(createAndroidEntityId("stay_", "entry_receipt_failure"));
    assert.equal(apply("room_guard", "room_status_update", { room_id: rooms[0].id, status: "available" }).ok, false);
    assert.equal(database.updateRoomStatus({ roomId: rooms[0].id, status: "available" }).ok, false);

    // Table-order stock/currency/state invariants and receipt atomicity use the same operation.
    setBusinessCapability(database.databasePath, { capability: C.INVENTORY, enabled: true });
    const category = ok(database.saveMenuCategory({ name: "Shared orders", description: "", is_active: true, sort_order: 1 }));
    const menu = ok(database.saveMenuItem({ category_id: category.savedId, name: "Shared item", description: "", price: 20, currency: "TRY", image_url: "", is_available: true, is_featured: false, allergens: [], tags: [], sort_order: 1, stock_quantity: 10 }));
    const desktopOrder = ok(database.openTableOrder(tables[0].id));
    ok(database.addTableOrderItem({ orderId: desktopOrder.order.id, menuItemId: menu.savedId, quantity: 1, note: "" }));
    ok(apply("phone_order", "table_order_open", { table_id: tables[1].id }));
    const orderId = createAndroidEntityId("table_order_", "phone_order");
    const itemPayload = { table_id: tables[1].id, depends_on_action_id: "phone_order", menu_item_id: menu.savedId, quantity: 1 };
    ok(apply("phone_item", "table_order_add_item", itemPayload));
    assert.equal(db.prepare("SELECT total FROM table_orders WHERE id = ?").get(orderId).total, desktopOrder.order.total + 20);
    assert.equal(db.prepare("SELECT stock_quantity FROM menu_items WHERE id = ?").get(menu.savedId).stock_quantity, 8);
    assert.equal(ok(apply("phone_item", "table_order_add_item", itemPayload)).alreadyApplied, true);
    const itemId = createAndroidEntityId("table_order_item_", "phone_item");
    ok(apply("phone_quantity", "table_order_update_item_quantity", { item_id: itemId, quantity: 2 }));
    assert.equal(db.prepare("SELECT total FROM table_orders WHERE id = ?").get(orderId).total, 40);
    db.exec(`CREATE TRIGGER test_order_receipt_failure BEFORE INSERT ON android_action_receipts WHEN NEW.id = 'order_receipt_failure' BEGIN SELECT RAISE(ABORT, 'receipt_failure'); END;`);
    assert.equal(apply("order_receipt_failure", "table_order_update_item_quantity", { item_id: itemId, quantity: 3 }).ok, false);
    assert.equal(db.prepare("SELECT total FROM table_orders WHERE id = ?").get(orderId).total, 40);
    assert.equal(db.prepare("SELECT stock_quantity FROM menu_items WHERE id = ?").get(menu.savedId).stock_quantity, 7);
    db.exec("DROP TRIGGER test_order_receipt_failure");
    assert.equal(apply("stock_insufficient", "table_order_update_item_quantity", { item_id: itemId, quantity: 100 }).ok, false);
    assert.equal(apply("table_guard", "table_status_update", { table_id: tables[1].id, status: "available" }).ok, false);
    ok(apply("phone_cancel", "table_order_cancel", { order_id: orderId }));
    assert.equal(db.prepare("SELECT stock_quantity FROM menu_items WHERE id = ?").get(menu.savedId).stock_quantity, 9);
    assert.equal(db.prepare("SELECT status FROM tables WHERE id = ?").get(tables[1].id).status, "available");
    // Finance uses configured active categories, rather than an independent Android whitelist.
    ok(finance.saveCategory({ direction: "expense", name: "Shared custom category" }));
    const custom = finance.getData().categories.find(c => c.name === "Shared custom category");
    const financePayload = { direction: "expense", amount_minor: 100, payment_method: "cash", category: custom.id, description: "Phone" };
    ok(apply("shared_finance", "finance_manual_create", financePayload));
    assert.equal(ok(apply("shared_finance", "finance_manual_create", financePayload)).alreadyApplied, true);
    const financeCount = db.prepare("SELECT COUNT(*) AS n FROM finance_entries").get().n;
    db.exec(`CREATE TRIGGER test_finance_receipt_failure BEFORE INSERT ON android_action_receipts WHEN NEW.id = 'finance_receipt_failure' BEGIN SELECT RAISE(ABORT, 'receipt_failure'); END;`);
    assert.equal(apply("finance_receipt_failure", "finance_manual_create", financePayload).ok, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM finance_entries").get().n, financeCount);
    db.exec("DROP TRIGGER test_finance_receipt_failure");
    db.prepare("UPDATE finance_categories SET is_active = 0 WHERE id = ?").run(custom.id);
    assert.equal(apply("inactive_finance", "finance_manual_create", financePayload).ok, false);
    assert.equal(finance.saveManualEntry({ direction: "expense", amountMinor: 100, paymentMethod: "cash", category: custom.id, description: "Desktop" }).ok, false);
    // Folio payment caller shares canonical debt rules (including rejection and receipt replay).
    const account = new DesktopRoomFolioService(database.databasePath);
    const remaining = db.prepare("SELECT remaining_minor FROM room_folio_totals WHERE folio_id = ?").get(linkedFolio.id).remaining_minor;
    const payment = { folio_id: linkedFolio.id, amount_minor: 1000, payment_method: "cash", expected_remaining_minor: remaining };
    ok(apply("shared_folio_payment", "room_folio_payment_add", payment));
    assert.equal(ok(apply("shared_folio_payment", "room_folio_payment_add", payment)).alreadyApplied, true);
    assert.equal(account.addPayment({ folioId: linkedFolio.id, amountMinor: remaining, paymentMethod: "cash" }).ok, false);
    // Customer duplicates and request conversion are business operations, not independent Android SQL.
    ok(apply("phone_customer", "customer_create", { full_name: "Unique phone customer", phone: "+905551119501" }));
    assert.equal(apply("duplicate_customer", "customer_create", { full_name: "Duplicate", phone: "+905551119501" }).ok, false);
    const request = ok(database.createManualRequest({ requestType: "pension_reservation", customerName: "Ingress", customerPhone: "+905551119502", dateText: "", startDate: "2036-05-01", endDate: "2036-05-03", time: "", guestCount: 1, adultCount: 1, childCount: 0, message: "Booking", priority: "normal" }));
    ok(apply("phone_conversion", "customer_request_convert_to_reservation", { request_id: request.savedId }));
    assert.equal(ok(apply("phone_conversion", "customer_request_convert_to_reservation", { request_id: request.savedId })).alreadyApplied, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE request_id = ?").get(request.savedId).n, 1);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db?.close(); cleanup(); }
}
console.log("domain-mutation-ownership-smoke-ok: shared inventory, hospitality, orders, finance, customer and request invariants");
