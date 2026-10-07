import assert from "node:assert/strict";
import { saveMenuProductFixture, fixtureProductId } from "./test-helpers/menu-product-fixture.mjs";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { DesktopRoomFolioService } = require("../apps/desktop-app/dist-electron/room-folio.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");
const { saveBusinessLayout } = require("../apps/desktop-app/dist-electron/business-layout.js");
const { saveBusinessPublicProfile, getBusinessPublicProfile } = require("../apps/desktop-app/dist-electron/business-public-profile.js");
const { applyInventoryMovementInTransaction, saveCatalogProduct } = require("../apps/desktop-app/dist-electron/commerce-store.js");
const { pullRequestsFromWeb } = require("../apps/desktop-app/dist-electron/sync-request-menu-service.js");
const { BUSINESS_CAPABILITIES } = require("@yardimci-asistan/shared");
const root = mkdtempSync(join(tmpdir(), "yardimci-storage-correctness-"));
const database = new DesktopDatabase({ appPath: join(process.cwd(), "apps/desktop-app"), userDataPath: root });
let db;
const now = "2030-01-01T12:00:00.000Z";
const ok = result => assert.equal(result.ok, true, result.message);

async function manualPull(request, acknowledgementOk) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const action = JSON.parse(init.body).action;
    assert.ok(["pull_requests", "mark_requests_synced"].includes(action));
    return new Response(JSON.stringify(action === "pull_requests"
      ? { ok: true, requests: [request], count: 1 }
      : acknowledgementOk ? { ok: true, updated_count: 1 }
        : { ok: false, message: "Injected acknowledgement failure" }), { status: 200 });
  };
  try { ok(await pullRequestsFromWeb(database)); }
  finally { globalThis.fetch = originalFetch; }
}

try {
  database.initialize();
  ok(database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Storage regression", phone: "+905550009501", whatsapp: "+905550009501",
    syncSecret: "storage-regression-secret", servicePreferences: { whatsapp: false, android: false }
  })));
  ok(saveBusinessLayout(database.databasePath, { rooms: [{
    clientKey: "storage-room", name: "Storage Room", number: "501", capacity: 2,
    bedInfo: "", floor: "", features: [], description: "", priceNote: "",
    nightlyPriceMinor: 5000, currency: "TRY"
  }] }));
  db = new DatabaseSync(database.databasePath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const roomId = db.prepare("SELECT id FROM rooms WHERE name = 'Storage Room'").get().id;
  db.prepare("INSERT INTO customers (id, full_name, phone, created_at, updated_at) VALUES ('storage_customer', 'Guest', '+905550009502', ?, ?)").run(now, now);
  db.prepare(`INSERT INTO reservations (id, customer_id, reservation_type, status, title, room_ids_json,
    start_date, end_date, agreed_total_minor, created_at, updated_at)
    VALUES ('storage_booking', 'storage_customer', 'room', 'approved', 'Booking', ?, '2030-01-01', '2030-01-03', 10000, ?, ?)`)
    .run(JSON.stringify([roomId]), now, now);
  const finance = new DesktopFinanceService(database.databasePath);
  const folios = new DesktopRoomFolioService(database.databasePath);

  // F1: pre-handoff deposits work; failed copy restores the entire authority handoff.
  ok(finance.addPensionPayment({ reservationId: "storage_booking", amountMinor: 4000, paymentMethod: "bank" }));
  const stay = database.createStayFromReservation({ reservationId: "storage_booking", status: "planned" });
  ok(stay);
  db.exec(`CREATE TRIGGER test_deposit_copy_failure BEFORE INSERT ON room_folio_payments
    WHEN NEW.origin = 'reservation' BEGIN SELECT RAISE(ABORT, 'test_copy_failure'); END;`);
  assert.equal(folios.openFolio(stay.savedId).ok, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM room_folios WHERE stay_id = ?").get(stay.savedId).n, 0);
  assert.equal(db.prepare("SELECT remaining_minor FROM pension_payment_totals WHERE reservation_id = 'storage_booking'").get().remaining_minor, 6000);
  db.exec("DROP TRIGGER test_deposit_copy_failure");
  db.exec("BEGIN");
  ok(folios.openFolio(stay.savedId, db));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM room_folios WHERE stay_id = ?").get(stay.savedId).n, 1);
  db.exec("ROLLBACK");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM room_folios WHERE stay_id = ?").get(stay.savedId).n, 0,
    "Folio handoff must not commit the caller's enclosing transaction");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM room_folio_payments").get().n, 0);
  const opened = folios.openFolio(stay.savedId);
  ok(opened);
  const folioId = opened.folioId;
  const totals = () => db.prepare("SELECT * FROM room_folio_totals WHERE folio_id = ?").get(folioId);
  assert.equal(totals().paid_total_minor, 4000);
  assert.equal(totals().remaining_minor, 6000);
  const financeBefore = db.prepare("SELECT * FROM finance_entries ORDER BY id").all();
  const beforePayment = totals();
  for (let attempt = 0; attempt < 2; attempt++) {
    const blocked = finance.addPensionPayment({ reservationId: "storage_booking", amountMinor: 1000, paymentMethod: "cash" });
    assert.equal(blocked.ok, false);
    assert.match(blocked.message, /oda hesabından/);
  }
  assert.deepEqual(totals(), beforePayment);
  assert.deepEqual(db.prepare("SELECT * FROM finance_entries ORDER BY id").all(), financeBefore);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pension_payments").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM room_folio_payments").get().n, 1);
  ok(folios.openFolio(stay.savedId));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM room_folio_payments").get().n, 1);
  ok(folios.addPayment({ folioId, amountMinor: 1000, paymentMethod: "cash" }));
  assert.equal(totals().paid_total_minor, 5000);
  assert.equal(finance.getData().outstandingPensionMinor, totals().remaining_minor,
    "After handoff the financial receivable projection uses only folio authority");
  db.exec("BEGIN");
  db.prepare("UPDATE room_folios SET status = 'closed' WHERE id = ?").run(folioId);
  assert.throws(() => db.prepare(`INSERT INTO pension_payments
    (id, reservation_id, amount_minor, paid_at, created_at, updated_at)
    VALUES ('illegal_payment', 'storage_booking', 1000, ?, ?, ?)`).run(now, now, now), /reservation_payment_authority_transferred/);
  db.exec("ROLLBACK");

  // F2: deliberately fail the second write on both initial insert and update.
  const snapshotProfiles = () => ["business_public_profile", "business_public_social_links"]
    .map(table => db.prepare(`SELECT * FROM ${table}`).all());
  for (const existing of [false, true]) {
    if (existing) ok(saveBusinessPublicProfile(database.databasePath, {
      ...getBusinessPublicProfile(database.databasePath), description: "Original", socialLinks: []
    }));
    const before = snapshotProfiles();
    db.exec(`CREATE TRIGGER test_profile_second_write BEFORE INSERT ON business_public_social_links
      BEGIN SELECT RAISE(ABORT, 'test_second_write'); END;`);
    assert.equal(saveBusinessPublicProfile(database.databasePath, {
      ...getBusinessPublicProfile(database.databasePath), description: "Must roll back",
      socialLinks: [{ platform: "instagram", url: "https://instagram.com/regression" }]
    }).ok, false);
    assert.deepEqual(snapshotProfiles(), before);
    db.exec("DROP TRIGGER test_profile_second_write");
  }

  // F3: ingress fields remain Web-owned; all local operational fields survive replay + ack.
  const request = {
    id: "storage_web_request", customer_id: "", source: "web_form", request_type: "general_info", status: "new",
    customer_name: "Web Guest", customer_phone: "+905550009503", date_text: "Tomorrow",
    start_date: "2030-02-01", end_date: "2030-02-03", time: "12:00", guest_count: 2, adult_count: 2, child_count: 0,
    message: "Initial ingress", ai_summary: "Web summary", ai_suggested_reply: "Web reply", whatsapp_message: "Web draft",
    assigned_to: "", priority: "normal", created_at: now, updated_at: now, sync_status: "pending"
  };
  await manualPull(request, false);
  const readRequest = () => db.prepare("SELECT * FROM requests WHERE id = ?").get(request.id);
  assert.equal(readRequest().message, request.message);
  assert.ok(readRequest().customer_id);
  ok(database.updateRequestStatus({ requestId: request.id, status: "waiting_customer" }));
  ok(database.saveRequestAiSuggestion({ requestId: request.id, summary: "Local summary", suggestedReply: "Local reply", missingFields: [] }));
  db.prepare("UPDATE requests SET priority = 'high', assigned_to = 'owner', whatsapp_message = 'Local draft' WHERE id = ?").run(request.id);
  const local = readRequest();
  const operational = ["status", "priority", "customer_id", "ai_summary", "ai_suggested_reply", "whatsapp_message", "assigned_to", "updated_at", "sync_status"];
  const identity = ["id", "source", "request_type", "created_at", "deleted_at"];
  const replay = { ...request, message: "Additional ingress", customer_name: "Updated Web Guest", guest_count: 3, adult_count: 2, child_count: 1 };
  // Actual manual replay + successful ack, then the shared automatic import/cursor path.
  await manualPull(replay, true);
  database.upsertRequests([replay], 42);
  for (const field of [...operational, ...identity]) assert.equal(readRequest()[field], local[field], field);
  for (const field of ["message", "customer_name", "guest_count", "adult_count", "child_count"]) assert.equal(readRequest()[field], replay[field], field);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM requests WHERE id = ?").get(request.id).n, 1);
  assert.equal(db.prepare("SELECT request_cursor FROM sync_runtime WHERE id = 'primary'").get().request_cursor, 42);
  const detached = { ...request, id: "storage_detached_request", customer_phone: "+905550009504" };
  database.upsertRequests([detached]);
  db.prepare("UPDATE requests SET customer_id = '', deleted_at = ?, sync_status = 'local_only' WHERE id = ?").run(now, detached.id);
  const deleted = db.prepare("SELECT * FROM requests WHERE id = ?").get(detached.id);
  const customerCount = db.prepare("SELECT COUNT(*) AS n FROM customers").get().n;
  database.upsertRequests([{ ...detached, message: "Do not revive" }]);
  assert.deepEqual(db.prepare("SELECT * FROM requests WHERE id = ?").get(detached.id), deleted);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM customers").get().n, customerCount);

  // F4: self/source booking is excluded, other Stays and even same-customer bookings conflict.
  const details = { folioId, checkInDate: "2030-01-01", plannedCheckOutDate: "2030-01-04", nightlyPriceMinor: 5000, lodgingManualOverride: false };
  ok(folios.updateFolioDetails(details));
  assert.equal(db.prepare("SELECT check_out_date FROM customer_room_stays WHERE id = ?").get(stay.savedId).check_out_date, "2030-01-04");
  db.prepare("INSERT INTO customers (id, full_name, phone, created_at, updated_at) VALUES ('storage_other_customer', 'Other Guest', '', ?, ?)").run(now, now);
  db.prepare(`INSERT INTO customer_room_stays (id, customer_id, room_id, status, check_in_date, check_out_date, created_at, updated_at)
    VALUES ('storage_other_stay', 'storage_other_customer', ?, 'planned', '2030-01-05', '2030-01-07', ?, ?)`)
    .run(roomId, now, now);
  const dateSnapshot = () => [
    db.prepare("SELECT * FROM room_folios WHERE id = ?").get(folioId),
    db.prepare("SELECT * FROM customer_room_stays WHERE id = ?").get(stay.savedId)
  ];
  const dateBefore = dateSnapshot();
  const overlap = folios.updateFolioDetails({ ...details, plannedCheckOutDate: "2030-01-06", nightlyPriceMinor: 6000 });
  assert.equal(overlap.ok, false);
  assert.match(overlap.message, /aktif müşteri/);
  assert.deepEqual(dateSnapshot(), dateBefore);
  db.prepare(`INSERT INTO reservations (id, customer_id, reservation_type, status, title, room_ids_json, start_date, end_date, created_at, updated_at)
    VALUES ('storage_conflict_booking', 'storage_customer', 'room', 'approved', 'Conflict booking', ?, '2030-01-04', '2030-01-05', ?, ?)`)
    .run(JSON.stringify([roomId]), now, now);
  const bookingOverlap = folios.updateFolioDetails({ ...details, plannedCheckOutDate: "2030-01-05" });
  assert.equal(bookingOverlap.ok, false);
  assert.match(bookingOverlap.message, /Conflict booking/);
  assert.deepEqual(dateSnapshot(), dateBefore);
  // Stay write succeeds first; failure of the following folio write must still restore both.
  db.exec(`CREATE TRIGGER test_folio_detail_failure BEFORE UPDATE ON room_folios
    BEGIN SELECT RAISE(ABORT, 'test_folio_write'); END;`);
  assert.equal(folios.updateFolioDetails({ ...details, plannedCheckOutDate: "2030-01-03" }).ok, false);
  assert.deepEqual(dateSnapshot(), dateBefore);
  db.exec("DROP TRIGGER test_folio_detail_failure");

  // F5: real current schema, fractional consumption, canonical menu primitive and folio caller.
  db.prepare(`INSERT INTO business_capabilities (business_id, capability_id, is_enabled, created_at, updated_at)
    SELECT id, ?, 1, ?, ? FROM business WHERE deleted_at = ''
    ON CONFLICT(business_id, capability_id) DO UPDATE SET is_enabled = 1`).run(BUSINESS_CAPABILITIES.INVENTORY, now, now);
  const category = database.saveMenuCategory({ name: "Storage menu", description: "", is_active: true, sort_order: 1 });
  ok(category);
  const item = saveMenuProductFixture(database, { category_id: category.savedId, name: "Tracked item", description: "", price: 10,
    currency: "TRY", image_url: "", is_available: true, is_featured: false, allergens: [], tags: [], sort_order: 1,
    stock_quantity: 10, stock_consumption_quantity: 0.5, stock_unit: "piece" });
  ok(item);
  const productId = fixtureProductId(database, item.savedId);
  const stock = () => db.prepare("SELECT CASE WHEN p.track_inventory = 1 THEN b.quantity ELSE NULL END AS quantity FROM catalog_products p LEFT JOIN inventory_balances b ON b.product_id = p.id WHERE p.id = ?").get(productId).quantity;
  const movements = () => db.prepare("SELECT * FROM inventory_movements WHERE product_id = ? AND reference_type = 'room_folio' ORDER BY rowid").all(productId);
  const added = folios.addMenuItem({ folioId, menuEntryId: item.savedId, quantity: 2 });
  ok(added);
  const lineId = added.data.folios.find(f => f.id === folioId).items.find(i => i.menuEntryId === item.savedId).id;
  assert.equal(stock(), 9);
  ok(folios.updateItemQuantity({ itemId: lineId, quantity: 4 }));
  assert.equal(stock(), 8);
  ok(folios.updateItemQuantity({ itemId: lineId, quantity: 1 }));
  assert.equal(stock(), 9.5);
  assert.equal(folios.updateItemQuantity({ itemId: lineId, quantity: 100 }).ok, false);
  assert.equal(folios.addMenuItem({ folioId, menuEntryId: item.savedId, quantity: 100 }).ok, false);
  assert.equal(stock(), 9.5);
  assert.equal(db.prepare("SELECT quantity FROM room_folio_items WHERE id = ?").get(lineId).quantity, 1);
  const movementsBefore = movements();
  db.exec(`CREATE TRIGGER test_stock_movement_failure BEFORE INSERT ON inventory_movements
    BEGIN SELECT RAISE(ABORT, 'test_movement_write'); END;`);
  assert.equal(folios.updateItemQuantity({ itemId: lineId, quantity: 2 }).ok, false);
  assert.equal(stock(), 9.5);
  assert.deepEqual(movements(), movementsBefore);
  assert.equal(db.prepare("SELECT quantity FROM room_folio_items WHERE id = ?").get(lineId).quantity, 1);
  assert.equal(folios.removeItem(lineId).ok, false);
  assert.equal(stock(), 9.5);
  assert.equal(folios.addMenuItem({ folioId, menuEntryId: item.savedId, quantity: 1 }).ok, false);
  assert.equal(stock(), 9.5);
  db.exec("DROP TRIGGER test_stock_movement_failure");
  ok(folios.removeItem(lineId));
  assert.equal(stock(), 10);
  assert.deepEqual(movements().map(m => [m.movement_type, m.quantity_delta]), [
    ["sale", -1], ["sale", -1], ["return_in", 1.5], ["return_in", 0.5]
  ]);
  for (const movement of movements()) {
    assert.equal(movement.reference_type, "room_folio");
    assert.equal(movement.actor_source, "desktop");
    assert.equal(movement.reference_id, lineId);
  }
  db.exec("BEGIN");
  applyInventoryMovementInTransaction(db, db.prepare("SELECT business_id FROM catalog_products WHERE id = ?").get(productId).business_id,
    { productId, type: "sale", quantityDelta: -1, referenceType: "table_order", referenceId: "test_table_order", actorSource: "desktop" }, now);
  assert.equal(stock(), 9);
  db.exec("ROLLBACK");
  assert.equal(stock(), 10, "Canonical primitive participates in the caller's transaction");
  saveCatalogProduct(database.databasePath, { id: productId, name: "Tracked item", trackInventory: false });
  ok(folios.addMenuItem({ folioId, menuEntryId: item.savedId, quantity: 1 }));
  assert.equal(stock(), null, "Untracked menu items still work in folios");
  assert.equal(movements().length, 4);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log("storage-correctness-smoke-ok: F1–F5 authority, replay, conflicts and injected-failure rollback");
} finally {
  db?.close();
  database.close();
  rmSync(root, { recursive: true, force: true });
}
