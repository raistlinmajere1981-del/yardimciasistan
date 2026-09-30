import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";

const require = createRequire(import.meta.url);
const { DesktopRoomFolioService } = require("../apps/desktop-app/dist-electron/room-folio.js");
const { transferTableOrderToRoomFolio } = require("../apps/desktop-app/dist-electron/room-folio-order-transfer.js");
const { database, cleanup } = createTemporaryDesktopDatabase("hospitality-guests-");
const ok = result => { assert.equal(result.ok, true, result.message); return result; };
const fail = result => assert.equal(result.ok, false, result.message);
let db;
try {
  database.initialize();
  ok(database.saveInitialSetup(createSmokeSetupInput({ businessName: "Guest lifecycle", phone: "+905550003601", whatsapp: "+905550003601",
    syncSecret: "guest-lifecycle-smoke", servicePreferences: { whatsapp: false, android: false } })));
  seedSmokeBusinessLayout(database.databasePath, { roomCount: 5, roomCapacity: 4, nightlyPriceMinor: 10000,
    tableCategories: [{ name: "Restaurant", tableCount: 1 }] });
  db = new DatabaseSync(database.databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  const kbsEnabledAt = new Date().toISOString();
  db.prepare("INSERT INTO kbs_service_settings (id, enabled, provider, created_at, updated_at) VALUES ('primary', 1, 'egm', ?, ?)")
    .run(kbsEnabledAt, kbsEnabledAt);
  const rooms = database.getDashboardData().rooms;
  const customers = ["Ana Misafir", "İkinci Misafir", "Çocuk Misafir", "Yeni Misafir"].map(fullName => ok(database.saveCustomer({
    fullName, phone: "", email: "", notes: "", tags: [], identityType: "", identityNumber: "", nationality: "", birthDate: "",
    gender: "", documentSerialNumber: "", documentExpiryDate: "", birthPlace: "", motherName: "", fatherName: "", issuingAuthority: "", address: ""
  })).savedId);
  const [primary, second, child, newcomer] = customers;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const end = new Date(Date.now() + 3 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const entry = { customerId: primary, roomId: rooms[0].id, checkInDate: today, checkOutDate: end, guestCount: 3,
    guestCustomerIds: [primary, second, child], status: "checked_in", notes: "", requestId: "group-entry" };
  const stayId = ok(database.assignCustomerToRoom(entry)).savedId;
  const stay = () => db.prepare("SELECT * FROM customer_room_stays WHERE id = ?").get(stayId);
  const folio = () => db.prepare("SELECT * FROM room_folios WHERE stay_id = ?").get(stayId);
  const count = (table, where = "1", params = []) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...params).n;
  assert.equal(count("stay_guests", "stay_id = ? AND status = 'checked_in'", [stayId]), 3);
  assert.equal(count("hospitality_notifications", "stay_id = ? AND kind = 'arrival'", [stayId]), 3);
  assert.equal(count("room_folios", "stay_id = ?", [stayId]), 1);
  const folioId = folio().id;
  assert.equal(ok(database.assignCustomerToRoom(entry)).savedId, stayId);
  assert.equal(count("hospitality_notifications"), 3, "Retry must not duplicate arrival notifications");
  fail(database.assignCustomerToRoom({ ...entry, requestId: "group-entry", notes: "different" }));
  fail(database.assignCustomerToRoom({ ...entry, requestId: "second-room", roomId: rooms[1].id }));
  fail(database.assignCustomerToRoom({ ...entry, requestId: "anonymous-guest", customerId: newcomer, roomId: rooms[1].id, guestCustomerIds: [newcomer], guestCount: 2 }));
  fail(database.deleteCustomer(second));

  const tableId = database.getDashboardData().tables[0].id;
  const category = ok(database.saveMenuCategory({ name: "Menu", description: "", is_active: true, sort_order: 0 }));
  const item = ok(database.saveMenuItem({ category_id: category.savedId, name: "Yemek", description: "", price: 100, currency: "TRY",
    image_url: "", is_available: true, is_featured: false, allergens: [], tags: [], sort_order: 0 }));
  ok(database.assignTableCustomer({ tableId, customerId: second }));
  const order = ok(database.openTableOrder(tableId)).order;
  ok(database.addTableOrderItem({ orderId: order.id, menuItemId: item.savedId, quantity: 1, note: "" }));
  const transfer = { folioId, tableOrderId: order.id };
  ok(transferTableOrderToRoomFolio(database.databasePath, transfer));
  ok(transferTableOrderToRoomFolio(database.databasePath, transfer));
  assert.equal(count("room_folio_table_order_transfers"), 1);
  assert.equal(count("finance_entries", "source_type = 'restaurant_order' AND source_id = ? AND deleted_at = ''", [order.id]), 0,
    "A room transfer is not a second cash receipt");

  fail(database.checkoutStayGuest({ stayId, customerId: primary }));
  ok(database.checkoutStayGuest({ stayId, customerId: primary, nextPrimaryCustomerId: second }));
  assert.equal(stay().customer_id, second);
  assert.equal(stay().status, "checked_in");
  assert.equal(stay().guest_count, 2);
  assert.equal(folio().customer_id, primary, "Changing primary contact does not transfer historical debt");
  ok(database.addStayGuest({ stayId, customerId: newcomer }));
  ok(database.changeStayPrimary({ stayId, customerId: child }));
  assert.equal(stay().guest_count, 3);
  const beforePrice = folio().lodging_total_minor;
  ok(database.moveStayRoom({ stayId, roomId: rooms[1].id }));
  assert.equal(folio().id, folioId);
  assert.equal(folio().lodging_total_minor, beforePrice);
  assert.equal(folio().room_id, rooms[1].id);
  assert.equal(db.prepare("SELECT status FROM rooms WHERE id = ?").get(rooms[0].id).status, "cleaning");
  assert.equal(count("hospitality_notifications", "stay_id = ? AND kind = 'room_change'", [stayId]), 3);
  assert.equal(count("stay_room_history", "stay_id = ?", [stayId]), 2);
  const paymentsBefore = count("room_folio_payments");
  ok(database.checkoutStay(stayId));
  ok(database.checkoutStay(stayId));
  assert.equal(count("stay_guests", "stay_id = ? AND status = 'checked_in'", [stayId]), 0);
  assert.equal(count("hospitality_notifications", "stay_id = ? AND kind = 'departure'", [stayId]), 4);
  assert.equal(folio().status, "open");
  assert.equal(count("room_folio_payments"), paymentsBefore, "Physical departure must not invent a payment");
  const secondOrder = ok(database.openTableOrder(tableId)).order;
  ok(database.addTableOrderItem({ orderId: secondOrder.id, menuItemId: item.savedId, quantity: 1, note: "" }));
  fail(transferTableOrderToRoomFolio(database.databasePath, { folioId, tableOrderId: secondOrder.id }));

  // Prove complete rollback even when financial initialization fails after guest creation.
  const staysBefore = count("customer_room_stays");
  const notificationsBefore = count("hospitality_notifications");
  db.exec("CREATE TRIGGER reject_guest_smoke_folio BEFORE INSERT ON room_folios BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  fail(database.assignCustomerToRoom({ ...entry, roomId: rooms[2].id, requestId: "rollback" }));
  assert.equal(count("customer_room_stays"), staysBefore);
  assert.equal(count("hospitality_notifications"), notificationsBefore);
  assert.equal(count("hospitality_entry_receipts", "request_id = 'rollback'"), 0);
  db.exec("DROP TRIGGER reject_guest_smoke_folio");
  ok(database.assignCustomerToRoom({ ...entry, roomId: rooms[2].id, requestId: "rollback" }));

  // Expected booking occupancy is separate from actual registered arrivals.
  ok(database.saveManualReservation({ customerId: newcomer, roomId: "", startDate: today, endDate: end, guestCount: 3, notes: "" }));
  const booking = db.prepare("SELECT id FROM reservations WHERE customer_id = ? ORDER BY rowid DESC LIMIT 1").get(newcomer);
  db.prepare("UPDATE reservations SET status = 'approved' WHERE id = ?").run(booking.id);
  const linked = ok(database.createStayFromReservation({ reservationId: booking.id, roomId: rooms[3].id, status: "checked_in",
    guestCustomerIds: [newcomer], primaryCustomerId: newcomer, requestId: "reservation-entry" }));
  assert.equal(db.prepare("SELECT guest_count FROM reservations WHERE id = ?").get(booking.id).guest_count, 3);
  assert.equal(db.prepare("SELECT guest_count FROM customer_room_stays WHERE id = ?").get(linked.savedId).guest_count, 1);
  ok(database.moveStayRoom({ stayId: linked.savedId, roomId: rooms[4].id }));
  const linkedCount = count("customer_room_stays", "reservation_id = ?", [booking.id]);
  fail(database.createStayFromReservation({ reservationId: booking.id, roomId: rooms[3].id, status: "checked_in",
    guestCustomerIds: [newcomer], primaryCustomerId: newcomer, requestId: "reservation-after-move" }));
  ok(database.checkoutStay(linked.savedId));
  fail(database.createStayFromReservation({ reservationId: booking.id, roomId: rooms[3].id, status: "checked_in",
    guestCustomerIds: [newcomer], primaryCustomerId: newcomer, requestId: "reservation-after-departure" }));
  assert.equal(count("customer_room_stays", "reservation_id = ?", [booking.id]), linkedCount);
  // Recent departed debt must never evict an older active stay from transfer targets.
  const activeFolio = db.prepare("SELECT f.id FROM room_folios f JOIN customer_room_stays s ON s.id = f.stay_id WHERE s.status = 'checked_in'").get();
  db.prepare("UPDATE room_folios SET updated_at = '2000-01-01T00:00:00Z' WHERE id = ?").run(activeFolio.id);
  const stayColumns = db.prepare('PRAGMA table_info(customer_room_stays)').all().map(column => column.name);
  const folioColumns = db.prepare('PRAGMA table_info(room_folios)').all().map(column => column.name);
  const departed = db.prepare('SELECT * FROM customer_room_stays WHERE id = ?').get(linked.savedId);
  const departedFolio = db.prepare('SELECT * FROM room_folios WHERE stay_id = ?').get(linked.savedId);
  const insertStay = db.prepare(`INSERT INTO customer_room_stays (${stayColumns.join(',')}) VALUES (${stayColumns.map(() => '?').join(',')})`);
  const insertFolio = db.prepare(`INSERT INTO room_folios (${folioColumns.join(',')}) VALUES (${folioColumns.map(() => '?').join(',')})`);
  for (let i = 0; i < 105; i++) {
    const historyStay = { ...departed, id: `history-stay-${i}`, reservation_id: '' };
    const historyFolio = { ...departedFolio, id: `history-folio-${i}`, stay_id: historyStay.id };
    insertStay.run(...stayColumns.map(column => historyStay[column]));
    insertFolio.run(...folioColumns.map(column => historyFolio[column]));
  }
  const accounts = new DesktopRoomFolioService(database.databasePath);
  const unscoped = accounts.getData();
  assert.ok(unscoped.folios.some(account => account.id === activeFolio.id));
  assert.equal(unscoped.folios.filter(account => !unscoped.activeStays.some(stay => stay.id === account.stayId)).length, 100);
  assert.ok(accounts.getData(rooms[4].id).folios.length > 100, 'Room-scoped history remains complete');
  assert.equal(count("hospitality_notifications", "status = 'sent'"), 0, "Local records never pretend to have been sent to KBS");
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.ok(accounts.getData(rooms[1].id).folios.some(account => account.id === folioId));
  console.log("Hospitality guest lifecycle smoke passed.");
} finally {
  db?.close();
  cleanup();
}
