import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { DesktopRoomFolioService } = require("../apps/desktop-app/dist-electron/room-folio.js");
const { saveRoomProfile } = require("../apps/desktop-app/dist-electron/room-profile.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");

const appPath = join(process.cwd(), "apps", "desktop-app");
const dataDir = join(process.cwd(), "artifacts", "room-folio-service-smoke", String(Date.now()));
mkdirSync(dataDir, { recursive: true });

let database = new DesktopDatabase({ appPath, userDataPath: dataDir });

try {
  database.initialize();

  const setupResult = database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Room Folio Test İşletmesi",
    phone: "+905550000400",
    whatsapp: "+905550000400",
    syncSecret: "room-folio-test-secret-123",
    servicePreferences: { whatsapp: false, android: false },
    initialCounts: { rooms: 1, tables: 0 },
    tableCategories: []
  }));
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);

  const folioCategory = database.saveMenuCategory({
    name: "Folio Test Kategorisi",
    description: "Folio smoke testi",
    is_active: true,
    sort_order: 10
  });
  assert.equal(folioCategory.ok, true);
  const folioItem = database.saveMenuItem({
    category_id: folioCategory.savedId,
    name: "Folio Test Ürünü",
    description: "Folio smoke ürünü",
    price: 120,
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: [],
    tags: ["smoke"],
    sort_order: 10
  });
  assert.equal(folioItem.ok, true);

  const service = new DesktopRoomFolioService(database.databasePath);
  const finance = new DesktopFinanceService(database.databasePath);
  const sqlite = new DatabaseSync(database.databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const room = sqlite.prepare(`
    SELECT id, name FROM rooms WHERE deleted_at = '' AND is_active = 1 ORDER BY sort_order, name LIMIT 1
  `).get();
  assert.ok(room?.id, "Smoke test needs at least one active room.");

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const checkout = shiftDate(today, 3);
  sqlite.prepare(`
    INSERT INTO customers (
      id, full_name, phone, email, source, notes, tags_json, last_contact_at,
      created_at, updated_at, deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'manual', '', '[]', '', ?, ?, '', 'local_only')
  `).run("room_folio_smoke_customer", "Oda Adisyon Smoke", "+905000000001", now, now);

  sqlite.prepare(`
    INSERT INTO customer_room_stays (
      id, customer_id, room_id, reservation_id, status, check_in_date, check_out_date,
      guest_count, notes, source, checked_in_at, checked_out_at, created_at, updated_at,
      deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'planned', ?, ?, 2, '', 'manual', '', '', ?, ?, '', 'local_only')
  `).run("room_folio_smoke_stay", "room_folio_smoke_customer", room.id, today, checkout, now, now);
  const depositAmount = 10000;
  sqlite.prepare(`
    INSERT INTO reservations (
      id, customer_id, reservation_type, status, title, start_date, end_date,
      agreed_total_minor, created_at, updated_at
    ) VALUES ('folio_smoke_reservation', 'room_folio_smoke_customer', 'room', 'approved',
      'Kaporalı konaklama', ?, ?, 450000, ?, ?)
  `).run(today, checkout, now, now);
  sqlite.prepare(`UPDATE customer_room_stays SET reservation_id = 'folio_smoke_reservation' WHERE id = ?`)
    .run("room_folio_smoke_stay");
  sqlite.prepare(`
    INSERT INTO pension_payments (id, reservation_id, amount_minor, payment_method, paid_at, note, created_at, updated_at)
    VALUES ('folio_smoke_deposit', 'folio_smoke_reservation', ?, 'bank', ?, 'Rezervasyon kaporası', ?, ?)
  `).run(depositAmount, now, now, now);
  sqlite.close();

  const profileName = "Smoke Test Oda";
  const profile = saveRoomProfile(database.databasePath, {
    roomId: room.id,
    name: profileName,
    amountMinor: 140000,
    currency: "TRY"
  });
  assert.equal(profile.ok, true);
  const profileData = service.getData();
  const profiledRoom = profileData.rooms.find((item) => item.id === room.id);
  assert.ok(profiledRoom);
  assert.equal(profiledRoom.name, profileName);
  assert.equal(profiledRoom.nightlyPriceMinor, 140000);

  const roomPrice = service.setRoomNightlyPrice({ roomId: room.id, amountMinor: 150000, currency: "TRY" });
  assert.equal(roomPrice.ok, true);
  assert.equal(roomPrice.data.rooms.find((item) => item.id === room.id)?.name, profileName, "Price update must preserve editable room name.");

  const opened = service.openFolio("room_folio_smoke_stay");
  assert.equal(opened.ok, true);
  assert.ok(opened.folioId);
  let folio = opened.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(folio);
  assert.equal(folio.status, "open");
  assert.equal(folio.guestCount, 2);
  assert.equal(folio.nights, 3);
  assert.equal(folio.nightlyPriceMinor, 150000);
  assert.equal(folio.lodgingTotalMinor, 450000);
  const deposit = folio.payments.find((payment) => payment.origin === "reservation");
  assert.ok(deposit, "Imported reservation payment must retain its origin for the UI and void guard.");
  assert.equal(deposit.amountMinor, depositAmount);
  assert.equal(deposit.note, "Rezervasyon kaporası");
  assert.equal(service.voidPayment(deposit.id).ok, false, "Reservation deposits cannot be voided as direct payments.");
  assert.equal(service.openFolio("room_folio_smoke_stay").data.folios.find((item) => item.id === folio.id).payments.length, 1);

  const beforeCheckIn = new DatabaseSync(database.databasePath);
  assert.equal(beforeCheckIn.prepare("SELECT status FROM customer_room_stays WHERE id = ?").get("room_folio_smoke_stay").status, "planned", "Folio opening is financial only");
  beforeCheckIn.close();
  assert.equal(database.checkInStay("room_folio_smoke_stay").ok, true);
  const sqliteCheckIn = new DatabaseSync(database.databasePath);
  const checkedIn = sqliteCheckIn.prepare(`SELECT status FROM customer_room_stays WHERE id = ?`).get("room_folio_smoke_stay");
  const occupiedRoom = sqliteCheckIn.prepare(`SELECT status FROM rooms WHERE id = ?`).get(room.id);
  sqliteCheckIn.close();
  assert.equal(checkedIn.status, "checked_in");
  assert.equal(occupiedRoom.status, "occupied");

  const menuItem = opened.data.menuItems.find((item) => item.stockQuantity === null || item.stockQuantity >= item.stockConsumptionQuantity);
  assert.ok(menuItem, "Smoke test needs at least one sellable menu item.");
  const menuStockBefore = menuItem.stockQuantity;

  const menuAdded = service.addMenuItem({ folioId: opened.folioId, menuItemId: menuItem.id, quantity: 1 });
  assert.equal(menuAdded.ok, true);
  folio = menuAdded.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(folio);
  const menuLine = folio.items.find((item) => item.menuItemId === menuItem.id);
  assert.ok(menuLine);
  assert.equal(menuLine.lineTotalMinor, menuItem.priceMinor);

  if (menuStockBefore !== null) {
    const updatedMenu = menuAdded.data.menuItems.find((item) => item.id === menuItem.id);
    assert.ok(updatedMenu);
    assert.equal(updatedMenu.stockQuantity, menuStockBefore - menuItem.stockConsumptionQuantity);
  }

  const manualAdded = service.addManualItem({
    folioId: opened.folioId,
    kind: "manual_charge",
    label: "Ek yatak",
    amountMinor: 30000
  });
  assert.equal(manualAdded.ok, true);
  const discounted = service.addManualItem({
    folioId: opened.folioId,
    kind: "discount",
    label: "Misafir indirimi",
    amountMinor: 10000
  });
  assert.equal(discounted.ok, true);
  folio = discounted.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(folio);
  assert.equal(folio.extrasTotalMinor, menuItem.priceMinor + 20000);

  const details = service.updateFolioDetails({
    folioId: opened.folioId,
    guestCount: 3,
    checkInDate: today,
    plannedCheckOutDate: checkout,
    nightlyPriceMinor: 160000,
    lodgingManualOverride: false
  });
  assert.equal(details.ok, true);
  folio = details.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(folio);
  assert.equal(folio.guestCount, 3);
  assert.equal(folio.lodgingTotalMinor, 480000);

  const financeBefore = finance.getData();
  const partialAmount = 200000;
  const partial = service.addPayment({
    folioId: opened.folioId,
    amountMinor: partialAmount,
    paymentMethod: "cash",
    note: "Smoke tahsilat"
  });
  assert.equal(partial.ok, true);
  folio = partial.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(folio);
  assert.equal(folio.paidTotalMinor, partialAmount + depositAmount);
  assert.equal(folio.payments.find((payment) => payment.note === "Smoke tahsilat")?.origin, "direct");
  const persistedPayments = folio.payments;
  database.close();
  database = new DesktopDatabase({ appPath, userDataPath: dataDir });
  database.initialize();
  database.initialize();
  const restored = new DesktopRoomFolioService(database.databasePath).getData().folios.find((item) => item.id === folio.id);
  assert.deepEqual(restored.payments, persistedPayments, "Reinitializing an existing baseline must preserve both payment origins and values.");
  assert.ok(folio.remainingMinor > 0);

  const financeAfter = finance.getData();
  assert.equal(financeAfter.todayIncomeMinor, financeBefore.todayIncomeMinor + partialAmount);
  assert.ok(financeAfter.recentEntries.some((entry) => entry.sourceType === "room_folio_payment" && entry.amountMinor === partialAmount));
  assert.ok(financeAfter.outstandingPensionMinor >= folio.remainingMinor);

  const overpay = service.addPayment({
    folioId: opened.folioId,
    amountMinor: folio.remainingMinor + 1,
    paymentMethod: "card"
  });
  assert.equal(overpay.ok, false, "Payment greater than room-folio remaining must be rejected.");


  const menuRemoved = service.removeItem(menuLine.id);
  assert.equal(menuRemoved.ok, true);
  if (menuStockBefore !== null) {
    const restoredMenu = menuRemoved.data.menuItems.find((item) => item.id === menuItem.id);
    assert.ok(restoredMenu);
    assert.equal(restoredMenu.stockQuantity, menuStockBefore);
  }

  const checkedOut = service.checkout({ folioId: opened.folioId, allowOutstanding: false });
  assert.equal(checkedOut.ok, true);
  const closedFolio = checkedOut.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(closedFolio);
  assert.equal(closedFolio.status, "open");
  assert.ok(closedFolio.remainingMinor > 0, "Outstanding receivable must remain after checkout.");

  const sqliteCheckout = new DatabaseSync(database.databasePath);
  const stayAfter = sqliteCheckout.prepare(`SELECT status FROM customer_room_stays WHERE id = ?`).get("room_folio_smoke_stay");
  const roomAfter = sqliteCheckout.prepare(`SELECT status FROM rooms WHERE id = ?`).get(room.id);
  sqliteCheckout.close();
  assert.equal(stayAfter.status, "checked_out");
  assert.equal(roomAfter.status, "cleaning");

  console.log("room-folio-service-smoke-ok");
} finally {
  database.close();
}

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}
