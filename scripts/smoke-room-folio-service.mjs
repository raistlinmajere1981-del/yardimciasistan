import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { saveMenuProductFixture } from "./test-helpers/menu-product-fixture.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { DesktopRoomFolioService } = require("../apps/desktop-app/dist-electron/room-folio.js");
const { saveBusinessLayout } = require("../apps/desktop-app/dist-electron/business-layout.js");
const { synchronizeFinanceSourceInTransaction } = require("../apps/desktop-app/dist-electron/finance.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");
const { listCatalogProducts, saveCatalogProduct, getInventoryBalance } = require("../apps/desktop-app/dist-electron/commerce-store.js");

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
    servicePreferences: { whatsapp: false, android: false }
  }));
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);

  const layoutSeed = saveBusinessLayout(database.databasePath, {
    rooms: [{
      clientKey: "folio-smoke-room",
      name: "Smoke Test Oda",
      number: "101",
      capacity: 2,
      bedInfo: "1 çift kişilik yatak",
      floor: "",
      features: [],
      description: "",
      priceNote: "",
      nightlyPriceMinor: 150000,
      currency: "TRY"
    }, {
      clientKey: "folio-smoke-prior-room",
      name: "Önceki Konaklama Odası",
      number: "102",
      capacity: 2,
      bedInfo: "2 tek kişilik yatak",
      floor: "",
      features: [],
      description: "",
      priceNote: "",
      nightlyPriceMinor: 120000,
      currency: "TRY"
    }]
  });
  assert.equal(layoutSeed.ok, true, layoutSeed.ok ? "" : layoutSeed.message);

  const folioCategory = database.saveMenuCategory({
    name: "Folio Test Kategorisi",
    description: "Folio smoke testi",
    is_active: true,
    sort_order: 10
  });
  assert.equal(folioCategory.ok, true);
  const folioItem = saveMenuProductFixture(database, {
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
    stock_quantity: 10,
    stock_unit: "l",
    stock_consumption_quantity: 0.125,
    sort_order: 10
  });
  assert.equal(folioItem.ok, true);

  const service = new DesktopRoomFolioService(database.databasePath);
  const finance = new DesktopFinanceService(database.databasePath);
  const sqlite = new DatabaseSync(database.databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const rooms = sqlite.prepare(`
    SELECT id, name FROM rooms WHERE deleted_at = '' AND is_active = 1 ORDER BY sort_order, name
  `).all();
  const room = rooms.find((candidate) => candidate.name === "Smoke Test Oda");
  const priorRoom = rooms.find((candidate) => candidate.name === "Önceki Konaklama Odası");
  assert.ok(room?.id, "Smoke test needs the active room.");
  assert.ok(priorRoom?.id, "Smoke test needs the prior-debt room.");

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const checkout = shiftDate(today, 3);
  sqlite.prepare(`
    INSERT INTO customers (
      id, full_name, phone, email, source, notes, last_contact_at,
      created_at, updated_at, deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'manual', '', '', ?, ?, '', 'local_only')
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
  sqlite.exec("BEGIN IMMEDIATE");
  sqlite.prepare(`
    INSERT INTO pension_payments (id, reservation_id, amount_minor, payment_method, paid_at, note, created_at, updated_at)
    VALUES ('folio_smoke_deposit', 'folio_smoke_reservation', ?, 'bank', ?, 'Rezervasyon kaporası', ?, ?)
  `).run(depositAmount, now, now, now);
  synchronizeFinanceSourceInTransaction(sqlite, "pension_payment", "folio_smoke_deposit");
  sqlite.exec("COMMIT");
  sqlite.close();

  const profileData = service.getData();
  const profiledRoom = profileData.rooms.find((item) => item.id === room.id);
  assert.ok(profiledRoom);
  assert.equal(profiledRoom.name, "Smoke Test Oda");
  assert.equal(profiledRoom.nightlyPriceMinor, 150000);

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

  const debtDb = new DatabaseSync(database.databasePath);
  debtDb.exec("PRAGMA foreign_keys = ON;");
  debtDb.prepare(`
    INSERT INTO customers (
      id, full_name, phone, email, source, notes, last_contact_at,
      created_at, updated_at, deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'manual', '', '', ?, ?, '', 'local_only')
  `).run("room_folio_other_customer", "Başka Borçlu Misafir", "+905000000002", now, now);
  const priorCheckIn = shiftDate(today, -8);
  const priorCheckOut = shiftDate(today, -6);
  const priorCheckedInAt = `${priorCheckIn}T12:00:00.000Z`;
  const priorCheckedOutAt = `${priorCheckOut}T12:00:00.000Z`;
  const oldStayInsert = debtDb.prepare(`
    INSERT INTO customer_room_stays (
      id, customer_id, room_id, reservation_id, status, check_in_date, check_out_date,
      guest_count, notes, source, checked_in_at, checked_out_at, created_at, updated_at,
      deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'checked_out', ?, ?, 1, '', 'manual', ?, ?, ?, ?, '', 'local_only')
  `);
  oldStayInsert.run("room_folio_prior_same_customer", "room_folio_smoke_customer", priorRoom.id, priorCheckIn, priorCheckOut,
    priorCheckedInAt, priorCheckedOutAt, now, now);
  oldStayInsert.run("room_folio_prior_other_customer", "room_folio_other_customer", priorRoom.id, priorCheckIn, priorCheckOut,
    priorCheckedInAt, priorCheckedOutAt, now, now);

  const priorFolioInsert = debtDb.prepare(`
    INSERT INTO room_folios (
      id, stay_id, room_id, customer_id, reservation_id, status, guest_count,
      check_in_date, planned_check_out_date, nightly_price_minor, currency,
      lodging_total_minor, lodging_manual_override, opened_at, closed_at, note,
      created_at, updated_at, deleted_at, sync_status
    ) VALUES (?, ?, ?, ?, '', 'open', 1, ?, ?, 120000, 'TRY', 240000, 0, ?, '', '', ?, ?, '', 'local_only')
  `);
  const sameCustomerDebtFolioId = "room_folio_prior_same_customer_folio";
  const otherCustomerDebtFolioId = "room_folio_prior_other_customer_folio";
  priorFolioInsert.run(sameCustomerDebtFolioId, "room_folio_prior_same_customer", priorRoom.id, "room_folio_smoke_customer",
    priorCheckIn, priorCheckOut, priorCheckedInAt, now, now);
  priorFolioInsert.run(otherCustomerDebtFolioId, "room_folio_prior_other_customer", priorRoom.id, "room_folio_other_customer",
    priorCheckIn, priorCheckOut, priorCheckedInAt, now, now);
  debtDb.close();

  const scopedRoomData = service.getData(room.id);
  assert.ok(scopedRoomData.folios.some((item) => item.id === sameCustomerDebtFolioId),
    "Room-scoped data must include an unpaid prior folio owned by the current customer, even from another room.");
  assert.equal(scopedRoomData.folios.some((item) => item.id === otherCustomerDebtFolioId), false,
    "Room-scoped data must not pull another customer's debt from an unrelated room.");

  const menuItem = opened.data.menuItems.find((item) => item.stockQuantity === null || item.stockQuantity >= item.stockConsumptionQuantity);
  assert.ok(menuItem, "Smoke test needs at least one sellable menu item.");
  const menuStockBefore = menuItem.stockQuantity;

  const menuAdded = service.addMenuItem({ folioId: opened.folioId, menuEntryId: menuItem.id, quantity: 1 });
  assert.equal(menuAdded.ok, true);
  folio = menuAdded.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(folio);
  const menuLine = folio.items.find((item) => item.menuEntryId === menuItem.id);
  assert.ok(menuLine);
  assert.equal(menuLine.lineTotalMinor, menuItem.priceMinor);
  assert.equal(menuLine.productId, menuItem.productId);
  assert.equal(menuLine.label, menuItem.name);
  assert.equal(menuLine.unitPriceMinor, menuItem.priceMinor);
  assert.equal(menuLine.quantity, 1);
  assert.equal(folio.currency, "TRY");

  if (menuStockBefore !== null) {
    const updatedMenu = menuAdded.data.menuItems.find((item) => item.id === menuItem.id);
    assert.ok(updatedMenu);
    assert.equal(updatedMenu.stockQuantity, menuStockBefore - menuItem.stockConsumptionQuantity);
  }

  const product = listCatalogProducts(database.databasePath).items.find(item => item.id === menuItem.productId);
  saveCatalogProduct(database.databasePath, { ...product, name: "Later canonical label", salePrice: 999, currency: "USD" });
  const entry = database.getPublishedMenu().items.find(item => item.id === menuItem.id);
  assert.equal(database.saveMenuProductEntry({ ...entry, product_id: product.id, stock_consumption_quantity: 0.5, price_override: 77 }).ok, true);
  const historicalFolio = service.getData().folios.find(item => item.id === opened.folioId);
  assert.deepEqual(historicalFolio.items.find(item => item.id === menuLine.id), menuLine,
    "Product/channel edits must not rewrite folio line name, price, quantity or total snapshots.");
  assert.equal(historicalFolio.currency, "TRY", "Folio currency is not a live Product projection.");
  const doubled = service.updateItemQuantity({ itemId: menuLine.id, quantity: 2 });
  assert.equal(doubled.ok, true, doubled.message);
  assert.equal(getInventoryBalance(database.databasePath, product.id).quantity, menuStockBefore - 0.25,
    "Folio quantity edits must use frozen consumption, not the current Menu policy.");
  assert.equal(doubled.data.folios.find(item => item.id === opened.folioId).items.find(item => item.id === menuLine.id).lineTotalMinor, menuItem.priceMinor * 2);
  assert.equal(service.updateItemQuantity({ itemId: menuLine.id, quantity: 1 }).ok, true);
  assert.equal(database.deleteMenuProductEntry(menuItem.id).ok, true);
  assert.ok(listCatalogProducts(database.databasePath).items.find(item => item.id === product.id));

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

  const replacedDiscount = service.setDiscount({ folioId: opened.folioId, amountMinor: 15000 });
  assert.equal(replacedDiscount.ok, true);
  folio = replacedDiscount.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(folio);
  assert.equal(folio.items.filter((item) => item.kind === "discount").length, 1);
  assert.equal(folio.items.find((item) => item.kind === "discount")?.lineTotalMinor, -15000);
  assert.equal(folio.extrasTotalMinor, menuItem.priceMinor + 15000);

  const clearedDiscount = service.setDiscount({ folioId: opened.folioId, amountMinor: 0 });
  assert.equal(clearedDiscount.ok, true);
  folio = clearedDiscount.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(folio);
  assert.equal(folio.items.some((item) => item.kind === "discount"), false);
  assert.equal(folio.extrasTotalMinor, menuItem.priceMinor + 30000);

  const restoredDiscount = service.setDiscount({ folioId: opened.folioId, amountMinor: 10000 });
  assert.equal(restoredDiscount.ok, true);
  folio = restoredDiscount.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(folio);
  assert.equal(folio.extrasTotalMinor, menuItem.priceMinor + 20000);

  const secondGuest = database.saveCustomer({ fullName: "Folio İkinci Misafir", phone: "", email: "", notes: "", tags: [],
    identityType: "", identityNumber: "", nationality: "", birthDate: "", gender: "", documentSerialNumber: "",
    documentExpiryDate: "", birthPlace: "", motherName: "", fatherName: "", issuingAuthority: "", address: "" });
  assert.equal(secondGuest.ok, true, secondGuest.message);
  assert.equal(database.addStayGuest({ stayId: "room_folio_smoke_stay", customerId: secondGuest.savedId }).ok, true);
  folio = service.getData().folios.find((item) => item.id === opened.folioId);
  assert.ok(folio);
  assert.equal(folio.guestCount, 2, "Folio guest count follows registered stay guests, not the planned estimate.");

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
  assert.equal(folio.guestCount, 2, "Folio details cannot override the registered guest count.");
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
    assert.equal(getInventoryBalance(database.databasePath, menuItem.productId).quantity, menuStockBefore,
      "Unlinking a Menu entry must not prevent exact canonical stock restoration for a historical Folio line.");
  }

  const checkedOut = service.checkout({ folioId: opened.folioId });
  assert.equal(checkedOut.ok, true);
  const closedFolio = checkedOut.data.folios.find((item) => item.id === opened.folioId);
  assert.ok(closedFolio);
  assert.equal(closedFolio.status, "open");
  assert.ok(closedFolio.remainingMinor > 0, "Outstanding receivable must remain after checkout.");
  assert.deepEqual(closedFolio.payments, persistedPayments);

  const sqliteCheckout = new DatabaseSync(database.databasePath);
  const stayAfter = sqliteCheckout.prepare(`SELECT status FROM customer_room_stays WHERE id = ?`).get("room_folio_smoke_stay");
  const roomAfter = sqliteCheckout.prepare(`SELECT status FROM rooms WHERE id = ?`).get(room.id);
  assert.equal(sqliteCheckout.prepare("SELECT COUNT(*) AS n FROM customer_credit_entries").get().n, 0,
    "Hospitality charges/payments/checkout must not be converted to retail credit.");
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
