import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";

const require = createRequire(import.meta.url);
const root = resolve("apps/desktop-app/dist-electron");
const { BUSINESS_CAPABILITIES: C } = require("@yardimci-asistan/shared");
const { setBusinessCapability } = require(resolve(root, "business-capability-store.js"));
const { completeMarketSale } = require(resolve(root, "market-sale-operation.js"));
const commerce = require(resolve(root, "commerce-runtime.js"));
const now = "2030-01-01T00:00:00.000Z";
const ok = result => { assert.equal(result.ok, true, result.message); return result; };

function fixture(profileId) {
  const temp = createTemporaryDesktopDatabase("application-operation-");
  temp.database.initialize();
  ok(temp.database.saveInitialSetup(createSmokeSetupInput({ profileId, businessName: "Operations", phone: "+905550089001",
    whatsapp: "+905550089001", syncSecret: "operation-fixture", servicePreferences: { android: false, whatsapp: false } })));
  const raw = new DatabaseSync(temp.database.databasePath);
  raw.exec("PRAGMA foreign_keys=ON");
  const businessId = raw.prepare("SELECT id FROM business").get().id;
  for (const id of ["customer", "other"]) raw.prepare(`INSERT INTO customers
    (id, business_id, full_name, phone, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?)`)
    .run(id, businessId, id, now, now);
  return { ...temp, raw, finish() { raw.close(); temp.cleanup(); } };
}

const h = fixture("pension_restaurant");
try {
  const { database: db, raw } = h;
  const rooms = seedSmokeBusinessLayout(db.databasePath, { roomCount: 7, roomCapacity: 8 }).rooms;
  function account(id, roomIndex, status = "checked_out", customer = "customer", amount = 1000) {
    raw.prepare(`INSERT INTO customer_room_stays (id, customer_id, room_id, status, check_in_date, check_out_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, '2030-01-01', '2030-01-02', ?, ?)`).run(`stay-${id}`, customer, rooms[roomIndex].id, status, now, now);
    raw.prepare(`INSERT INTO room_folios (id, stay_id, room_id, customer_id, check_in_date, planned_check_out_date,
      lodging_total_minor, opened_at, created_at, updated_at) VALUES (?, ?, ?, ?, '2030-01-01', '2030-01-02', ?, ?, ?, ?)`)
      .run(id, `stay-${id}`, rooms[roomIndex].id, customer, amount, now, now, now);
  }
  const state = id => raw.prepare("SELECT f.status, s.status stay_status, t.remaining_minor FROM room_folios f JOIN customer_room_stays s ON s.id=f.stay_id JOIN room_folio_totals t ON t.folio_id=f.id WHERE f.id=?").get(id);
  const pay = (folioId, amountMinor) => db.collectRoomFolioPayment({ folioId, amountMinor, paymentMethod: "cash" });
  account("partial", 0);
  // Renderer would have seen 1000, but another operation added 500 before submit.
  raw.prepare("UPDATE room_folios SET lodging_total_minor=1500 WHERE id='partial'").run();
  const partial = ok(pay("partial", 1000));
  assert.equal(partial.remainingMinor, 500); assert.equal(partial.closure, "open");
  assert.equal(state("partial").status, "open");
  assert.equal(pay("partial", 501).ok, false, "overpayment reads current remaining");
  assert.equal(ok(pay("partial", 500)).closure, "closed");
  account("active", 1, "checked_in");
  assert.equal(ok(pay("active", 1000)).closure, "open", "collection never departs an active group");
  assert.equal(state("active").stay_status, "checked_in");
  ok(db.checkoutStay("stay-active"));
  account("close-failure", 2);
  raw.exec(`CREATE TRIGGER fail_close BEFORE UPDATE OF status ON room_folios WHEN NEW.id='close-failure' AND NEW.status='closed'
    BEGIN SELECT RAISE(ABORT, 'injected closure failure'); END`);
  const closeFailure = ok(pay("close-failure", 1000));
  assert.equal(closeFailure.closure, "failed");
  assert.equal(state("close-failure").remaining_minor, 0); assert.equal(state("close-failure").status, "open");
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM room_folio_payments WHERE folio_id='close-failure'").get().n, 1);
  raw.exec("DROP TRIGGER fail_close");
  account("departure", 3, "checked_in");
  account("previous", 4);
  account("wrong-customer", 5, "checked_out", "other");
  account("wrong-active", 6, "planned", "other");
  raw.exec(`CREATE TRIGGER fail_payment BEFORE INSERT ON room_folio_payments WHEN NEW.folio_id='departure'
    BEGIN SELECT RAISE(ABORT, 'injected payment failure'); END`);
  raw.prepare("UPDATE room_folios SET lodging_total_minor=2500 WHERE id='previous'").run();
  const departed = ok(db.checkoutStayWithSettlement({ stayId: "stay-departure", roomId: rooms[3].id, settleCurrent: true,
    previousFolioIds: ["previous", "wrong-customer", "wrong-active", "missing"], paymentMethod: "card" }));
  assert.equal(state("departure").stay_status, "checked_out");
  assert.equal(state("departure").remaining_minor, 1000, "payment failure never rolls back departure");
  assert.match(departed.message, /Çıkış tamamlandı/);
  assert.equal(departed.settlements[0].result.ok, false);
  assert.equal(departed.settlements[1].result.amountMinor, 2500, "multi-folio settlement uses persisted amount, not preview");
  assert.equal(state("previous").status, "closed");
  assert.equal(state("wrong-customer").remaining_minor, 1000); assert.equal(state("wrong-active").remaining_minor, 1000);
  assert.ok(departed.settlements.slice(2).every(step => !step.result.ok));
  raw.exec("DROP TRIGGER fail_payment");
  const retry = ok(db.checkoutStayWithSettlement({ stayId: "stay-departure", roomId: rooms[3].id, settleCurrent: true,
    previousFolioIds: ["previous"], paymentMethod: "cash" }));
  assert.equal(retry.settlements[0].result.amountMinor, 1000); assert.equal(state("departure").status, "closed");
  const payments = raw.prepare("SELECT COUNT(*) n FROM room_folio_payments").get().n;
  assert.equal(db.checkoutStayWithSettlement({ stayId: "stay-active", roomId: rooms[0].id, settleCurrent: true,
    previousFolioIds: [], paymentMethod: "cash" }).ok, false, "moved-room preview cannot depart a different persisted context");
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM room_folio_payments").get().n, payments);

  const bookingInput = { customerId: "customer", startDate: "2040-01-01", endDate: "2040-01-03", guestCount: 2, notes: "A" };
  ok(db.saveManualReservation(bookingInput));
  const booking = db.getDashboardData().reservations.find(item => item.notes === "A");
  const stale = { ...booking };
  ok(db.saveManualReservation({ ...bookingInput, reservationId: booking.id, startDate: "2041-01-01", endDate: "2041-01-04", guestCount: 3, notes: "B" }));
  raw.prepare("UPDATE reservations SET updated_at='2041-01-01T00:00:00.000Z', adult_count=2, child_count=1 WHERE id=?").run(booking.id);
  const before = raw.prepare("SELECT * FROM reservations WHERE id=?").get(booking.id);
  ok(db.assignReservationRoom({ reservationId: stale.id, roomId: rooms[0].id,
    startDate: stale.startDate, notes: stale.notes, guestCount: stale.guestCount })); // Runtime extra fields have no authority.
  const after = raw.prepare("SELECT * FROM reservations WHERE id=?").get(booking.id);
  for (const key of Object.keys(before).filter(key => !["room_ids_json", "updated_at", "sync_status"].includes(key))) assert.equal(after[key], before[key], key);
  assert.equal(after.room_ids_json, JSON.stringify([rooms[0].id]));
  assert.equal(db.saveManualReservation({ ...bookingInput, reservationId: booking.id, expectedUpdatedAt: stale.updatedAt }).ok, false, "full edit rejects a stale draft");
  ok(db.saveManualReservation({ ...bookingInput, reservationId: booking.id, expectedUpdatedAt: after.updated_at,
    roomId: rooms[1].id, startDate: "2041-01-01", endDate: "2041-01-04", notes: "conflict" }));
  ok(db.saveManualReservation({ ...bookingInput, notes: "candidate", startDate: "2041-01-01", endDate: "2041-01-04" }));
  const candidate = db.getDashboardData().reservations.find(item => item.notes === "candidate");
  assert.equal(db.assignReservationRoom({ reservationId: candidate.id, roomId: rooms[1].id }).ok, false);
  assert.equal(db.assignReservationRoom({ reservationId: "missing", roomId: rooms[1].id }).ok, false);
  const handlers = new Map(), exports = {};
  runInNewContext(readFileSync(resolve(root, "ipc/reservation-ipc.js"), "utf8"), { exports,
    require: name => name === "electron" ? { ipcMain: { handle: (name, action) => handlers.set(name, action) } } : require(name) });
  let locked = false, downstream = 0;
  exports.registerReservationIpcHandlers({ getDatabase: () => { downstream++; return db; }, assertUnlocked: () => { assert.equal(locked, false, "locked"); },
    assertCapability: capability => assert.ok(db.getEnabledBusinessCapabilities().includes(capability), "disabled capability"),
    assertReservationType() {}, finalizeOperationMutation: result => result });
  const assign = () => handlers.get("reservation:assignRoom")({}, { reservationId: candidate.id, roomId: rooms[2].id });
  locked = true; assert.throws(assign, /locked/); assert.equal(downstream, 0);
  locked = false; setBusinessCapability(db.databasePath, { capability: C.ACCOMMODATION_RESERVATIONS, enabled: false });
  assert.throws(assign, /disabled capability/); assert.equal(downstream, 0);
  setBusinessCapability(db.databasePath, { capability: C.ACCOMMODATION_RESERVATIONS, enabled: true });
  ok(assign()); assert.equal(downstream, 1, "enabled assignment delegates to the real persisted operation");
  ok(db.assignReservationRoom({ reservationId: candidate.id, roomId: "" }));
  assert.equal(db.getReservationById(candidate.id).roomIds.length, 0, "explicit empty assignment clears only the resource");
  assert.equal(raw.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
} finally { h.finish(); }

const m = fixture("market");
try {
  const { database: db, raw } = m;
  setBusinessCapability(db.databasePath, { capability: C.CUSTOMER_CREDIT, enabled: true });
  const product = commerce.saveRuntimeCatalogProduct(db.databasePath, { name: "Operation Product", salePrice: 10, purchasePrice: 2,
    currency: "TRY", unit: "piece", trackInventory: false, isActive: true });
  const draft = () => commerce.createMarketCartDraft(db.databasePath, { lines: [{ productId: product.id, quantity: 1 }], source: "android" });
  const input = sourceDraftId => ({ items: [{ productId: product.id, quantity: 1 }], settlement: "paid", paymentMethod: "cash", sourceDraftId });
  const first = draft();
  const success = completeMarketSale(db.databasePath, input(first.draft.id));
  assert.equal(success.draftReview, "reviewed");
  const failedReview = draft();
  raw.exec(`CREATE TRIGGER fail_review BEFORE UPDATE OF status ON commerce_sale_drafts WHEN NEW.status='reviewed'
    BEGIN SELECT RAISE(ABORT, 'injected review failure'); END`);
  const partial = completeMarketSale(db.databasePath, input(failedReview.draft.id));
  assert.equal(partial.draftReview, "failed");
  assert.equal(commerce.getMarketCartDraft(db.databasePath, failedReview.draft.id).draft.status, "pending");
  assert.throws(() => commerce.loadMarketCartDraftForQuickSale(db.databasePath, failedReview.draft.id), /satışı zaten kaydedildi/);
  const count = () => raw.prepare("SELECT COUNT(*) n FROM commerce_sales").get().n;
  const beforeRetry = count();
  raw.prepare("UPDATE catalog_products SET sale_price=20 WHERE id=?").run(product.id);
  assert.equal(completeMarketSale(db.databasePath, input(failedReview.draft.id)).sale.id, partial.sale.id);
  assert.equal(completeMarketSale(db.databasePath, input(failedReview.draft.id)).sale.total, partial.sale.total,
    "replay returns the original receipt, not a newly resolved price");
  assert.equal(count(), beforeRetry);
  assert.throws(() => completeMarketSale(db.databasePath, { ...input(failedReview.draft.id), paymentMethod: "card" }), /değiştirilmiş/);
  raw.exec("DROP TRIGGER fail_review");
  const recovered = completeMarketSale(db.databasePath, input(failedReview.draft.id));
  assert.equal(recovered.sale.id, partial.sale.id); assert.equal(recovered.replayed, true); assert.equal(recovered.draftReview, "reviewed");
  assert.equal(count(), beforeRetry, "fresh invocation/restart-style retry cannot create another sale");
  const failedSale = draft();
  assert.throws(() => completeMarketSale(db.databasePath, { ...input(failedSale.draft.id), items: [{ productId: "gone", quantity: 1 }] }), /aktif değil/);
  assert.equal(commerce.getMarketCartDraft(db.databasePath, failedSale.draft.id).draft.status, "pending");
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM commerce_cart_draft_sales WHERE draft_id=?").get(failedSale.draft.id).n, 0);
  const credit = draft();
  const creditResult = completeMarketSale(db.databasePath, { ...input(credit.draft.id), settlement: "credit", customerId: "customer" });
  assert.equal(creditResult.sale.status, "credit");
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM customer_credit_entries WHERE sale_id=?").get(creditResult.sale.id).n, 1);
  const creditRetry = completeMarketSale(db.databasePath, { ...input(credit.draft.id), settlement: "credit", customerId: "customer" });
  assert.equal(creditRetry.sale.id, creditResult.sale.id);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM customer_credit_entries WHERE sale_id=?").get(creditResult.sale.id).n, 1);
  setBusinessCapability(db.databasePath, { capability: C.CUSTOMER_CREDIT, enabled: false });
  assert.throws(() => completeMarketSale(db.databasePath, { ...input(credit.draft.id), settlement: "credit", customerId: "customer" }), /etkin değil/,
    "receipt replay retains the credit capability gate");
  setBusinessCapability(db.databasePath, { capability: C.SALES, enabled: false });
  assert.throws(() => completeMarketSale(db.databasePath, input(first.draft.id)), /etkin değil/);
  assert.equal(raw.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(raw.prepare("PRAGMA foreign_key_check").all(), []);
} finally { m.finish(); }
console.log("Runtime application operations: authoritative collection/departure partial results, draft-sale replay recovery and narrow reservation assignment passed.");
