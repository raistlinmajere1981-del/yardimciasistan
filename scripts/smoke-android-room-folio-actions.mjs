import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { saveMenuProductFixture } from "./test-helpers/menu-product-fixture.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { DesktopRoomFolioService } = require("../apps/desktop-app/dist-electron/room-folio.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");
const { saveBusinessLayout } = require("../apps/desktop-app/dist-electron/business-layout.js");
const { createAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-operations-snapshot.js");
const { projectLocalAndroidSnapshotForDevice } = require("../apps/desktop-app/dist-electron/local-android-device-projection.js");
const { projectAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-capability-projection.js");

const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-android-room-folio-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});
const DEVICE_ID = "android-room-folio-smoke";

try {
  database.initialize();
  const setup = database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Android Folio Test", phone: "+905550003002", whatsapp: "+905550003002",
    syncSecret: "android-folio-test-secret", servicePreferences: { whatsapp: false, android: true }
  }));
  assert.equal(setup.ok, true, setup.message);

  const layoutSeed = saveBusinessLayout(database.databasePath, {
    rooms: [{
      clientKey: "android-folio-room",
      name: "Android Folio Oda",
      number: "101",
      capacity: 2,
      bedInfo: "1 çift kişilik yatak",
      floor: "",
      features: [],
      description: "",
      priceNote: "",
      nightlyPriceMinor: 120000,
      currency: "TRY"
    }]
  });
  assert.equal(layoutSeed.ok, true, layoutSeed.ok ? "" : layoutSeed.message);
  database.upsertAndroidDeviceSightings([{
    device_id: DEVICE_ID,
    device_name: "Room Folio Smoke",
    app_version: "smoke",
    first_seen_at: "2026-08-11T20:00:00.000Z",
    last_seen_at: "2026-08-11T20:00:00.000Z"
  }]);

  let device = database.getAndroidDevices().find((item) => item.deviceId === DEVICE_ID);
  assert.ok(device);
  assert.equal(device.isActive, false, "Yeni Android cihaz onay bekler durumda başlamalı");
  assert.equal(device.permissions.includes("room_folio.view"), true, "Oda/işler personeli oda hesaplarını görebilmeli");
  assert.equal(device.permissions.includes("room_folio.checkout"), true, "Oda/işler personeli ödenmiş hesabı kapatabilmeli");
  assert.equal(device.permissions.includes("room_folio.payment"), false, "Kasiyer görevi olmadan tahsilat alınmamalı");

  const approved = database.setAndroidDeviceActive(DEVICE_ID, true);
  assert.equal(approved.ok, true, approved.message);
  device = database.getAndroidDevices().find((item) => item.deviceId === DEVICE_ID);
  assert.equal(device?.isActive, true, "Masaüstü onayı cihazı aktif hale getirmeli");

  const roomFolio = new DesktopRoomFolioService(database.databasePath);
  const finance = new DesktopFinanceService(database.databasePath);
  const sqlite = new DatabaseSync(database.databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const room = sqlite.prepare(`
    SELECT id FROM rooms WHERE deleted_at = '' AND is_active = 1 ORDER BY sort_order, name LIMIT 1
  `).get();
  assert.ok(room?.id, "Smoke test için aktif oda gerekli.");
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const checkoutDate = shiftDate(today, 2);
  sqlite.prepare(`
    INSERT INTO customers (
      id, full_name, phone, email, source, notes, last_contact_at,
      created_at, updated_at, deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'manual', '', '', ?, ?, '', 'local_only')
  `).run("android_folio_customer", "Android Oda Hesabı", "+905000000009", now, now);
  sqlite.prepare(`
    UPDATE rooms SET nightly_price_minor = 120000, price_currency = 'TRY', updated_at = ? WHERE id = ?
  `).run(now, room.id);
  sqlite.prepare(`
    INSERT INTO customer_room_stays (
      id, customer_id, room_id, reservation_id, status, check_in_date, check_out_date,
      guest_count, notes, source, checked_in_at, checked_out_at, created_at, updated_at,
      deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'planned', ?, ?, 2, '', 'manual', '', '', ?, ?, '', 'local_only')
  `).run("android_folio_stay", "android_folio_customer", room.id, today, checkoutDate, now, now);
  sqlite.close();

  assert.equal(database.checkInStay("android_folio_stay").ok, true);
  const opened = roomFolio.openFolio("android_folio_stay");
  assert.equal(opened.ok, true, opened.message);
  const folioId = opened.folioId;
  assert.ok(folioId);
  let folio = opened.data.folios.find((item) => item.id === folioId);
  assert.ok(folio);
  assert.equal(folio.chargeTotalMinor, 240000);
  assert.equal(folio.remainingMinor, 240000);
  verifyFolioCharges(database, roomFolio, folioId);

  const deniedPayment = database.applyAndroidAction(action("folio-payment-denied", "room_folio_payment_add", {
    folio_id: folioId,
    amount_minor: 50000,
    expected_remaining_minor: folio.remainingMinor,
    payment_method: "cash"
  }));
  assert.equal(deniedPayment.ok, false, "Kasiyer görevi olmadan oda tahsilatı reddedilmeli");

  const groupsUpdated = database.setAndroidDevicePermissionGroups(DEVICE_ID, {
    ...device.permissionGroups,
    service_orders: true,
    cashier: true,
    rooms_tasks: true,
    customer_reservation: false,
    market_operations: false
  });
  assert.equal(groupsUpdated.ok, true, groupsUpdated.message);
  device = database.getAndroidDevices().find((item) => item.deviceId === DEVICE_ID);
  assert.ok(device?.permissions.includes("room_folio.payment"));

  const financeBefore = finance.getData();
  const partial = database.applyAndroidAction(action("folio-payment-partial", "room_folio_payment_add", {
    folio_id: folioId,
    amount_minor: 100000,
    expected_remaining_minor: folio.remainingMinor,
    payment_method: "cash",
    note: "Android kısmi tahsilat"
  }));
  assert.equal(partial.ok, true, partial.message);

  folio = roomFolio.getData().folios.find((item) => item.id === folioId);
  assert.ok(folio);
  assert.equal(folio.paidTotalMinor, 100000);
  assert.equal(folio.remainingMinor, 140000);

  const stale = database.applyAndroidAction(action("folio-payment-stale", "room_folio_payment_add", {
    folio_id: folioId,
    amount_minor: 10000,
    expected_remaining_minor: 240000,
    payment_method: "cash"
  }));
  assert.equal(stale.ok, false, "Eski snapshot ile ikinci tahsilat kabul edilmemeli");
  assert.match(stale.message, /değişmiş|güncel/i);

  const debtCheckout = database.applyAndroidAction(action("folio-checkout-blocked", "room_folio_checkout", {
    folio_id: folioId,
    expected_remaining_minor: folio.remainingMinor
  }));
  assert.equal(debtCheckout.ok, true, "Borç misafirin çıkışını engellememeli");
  assert.equal(roomFolio.getData().folios.find(item => item.id === folioId).status, "open");

  const finalPayment = database.applyAndroidAction(action("folio-payment-final", "room_folio_payment_add", {
    folio_id: folioId,
    amount_minor: folio.remainingMinor,
    expected_remaining_minor: folio.remainingMinor,
    payment_method: "card",
    note: "Android kalan tahsilat"
  }));
  assert.equal(finalPayment.ok, true, finalPayment.message);

  folio = roomFolio.getData().folios.find((item) => item.id === folioId);
  assert.ok(folio);
  assert.equal(folio.remainingMinor, 0);
  assert.equal(folio.paidTotalMinor, 240000);

  const checkoutActionId = "folio-checkout-final";
  const checkedOut = database.applyAndroidAction(action(checkoutActionId, "room_folio_checkout", {
    folio_id: folioId,
    expected_remaining_minor: 0
  }));
  assert.equal(checkedOut.ok, true, checkedOut.message);

  const repeatedCheckout = database.applyAndroidAction(action(checkoutActionId, "room_folio_checkout", {
    folio_id: folioId,
    expected_remaining_minor: 0
  }));
  assert.equal(repeatedCheckout.ok, true);
  assert.equal(repeatedCheckout.alreadyApplied, true, "Aynı çıkış action ikinci kez uygulanmamalı");

  const after = roomFolio.getData().folios.find((item) => item.id === folioId);
  assert.ok(after);
  assert.equal(after.status, "closed");
  const financeAfter = finance.getData(40);
  assert.equal(financeAfter.todayIncomeMinor, financeBefore.todayIncomeMinor + 240000);
  const roomPayments = financeAfter.recentEntries.filter((entry) => entry.sourceType === "room_folio_payment");
  assert.equal(roomPayments.filter((entry) => entry.amountMinor === 100000).length, 1);
  assert.equal(roomPayments.filter((entry) => entry.amountMinor === 140000).length, 1);

  const verify = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    assert.equal(verify.prepare("SELECT status FROM customer_room_stays WHERE id = ?").get("android_folio_stay").status, "checked_out");
    assert.equal(verify.prepare("SELECT status FROM rooms WHERE id = ?").get(room.id).status, "cleaning");
    const receipts = Number(verify.prepare(`
      SELECT COUNT(*) AS count FROM android_action_receipts
      WHERE action_type IN ('room_folio_payment_add', 'room_folio_checkout')
    `).get()?.count ?? 0);
    assert.equal(receipts, 4, "İki ödeme, misafir çıkışı ve finansal kapanış receipt kaydı olmalı");
    const events = Number(verify.prepare(`
      SELECT COUNT(*) AS count FROM events
      WHERE actor_type = 'android' AND type IN ('room_folio.payment_added', 'room_folio.checked_out', 'room_folio.closed')
    `).get()?.count ?? 0);
    assert.equal(events, 4, "Android oda hesabı event kayıtları eksik");
    assert.equal(String(verify.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    verify.close();
  }

  console.log("android-room-folio-actions-smoke-ok: approval, permissions, stale guard, payments, finance trigger, checkout and idempotency verified");
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}

function action(id, actionType, payload) {
  return {
    id,
    action_type: actionType,
    payload,
    created_at: new Date().toISOString(),
    device_id: DEVICE_ID,
    device_name: "Room Folio Smoke",
    app_version: "smoke",
    status: "pending",
    error_message: ""
  };
}

function verifyFolioCharges(database, service, folioId) {
  const db = new DatabaseSync(database.databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  const originalPermissions = db.prepare("SELECT permissions_json FROM android_devices WHERE device_id = ?").get(DEVICE_ID).permissions_json;
  const permissions = ["room_folio.view", "room_folio.add_menu_item", "room_folio.add_manual_charge", "menu.view", "menu.stock_view"];
  const setPermissions = values => db.prepare("UPDATE android_devices SET role = 'staff', permissions_json = ? WHERE device_id = ?").run(JSON.stringify(values), DEVICE_ID);
  const currentFolio = () => service.getData().folios.find(folio => folio.id === folioId);
  const currentSnapshot = () => createAndroidOperationsSnapshot(database, database.getDashboardData());
  const category = database.saveMenuCategory({ name: "Folio menüsü", description: "", is_active: true, sort_order: 0 });
  assert.equal(category.ok, true);
  const saved = saveMenuProductFixture(database, { category_id: category.savedId, name: "İçecek", description: "", price: 12.34,
    currency: "TRY", image_url: "", is_available: true, is_featured: false, sort_order: 0,
    stock_quantity: 5, stock_unit: "l", stock_consumption_quantity: 0.125 });
  assert.equal(saved.ok, true, saved.message);
  const entryId = saved.savedId;
  const menuEntry = () => database.getPublishedMenu().items.find(item => item.id === entryId);
  const productId = menuEntry().product_id;
  // The channel override, rather than catalog sale price, must be charged.
  db.prepare("UPDATE menu_product_entries SET price_override = 9.87 WHERE id = ?").run(entryId);
  const menuPayload = () => ({ folio_id: folioId, expected_folio_version: currentFolio().version,
    menu_entry_id: entryId, quantity: 2, expected_menu_updated_at: menuEntry().updated_at,
    expected_unit_price_minor: Math.round(menuEntry().price * 100), expected_currency: menuEntry().currency });
  const manualPayload = () => ({ folio_id: folioId, expected_folio_version: currentFolio().version,
    label: "Otopark", amount_minor: 12345, note: "İki gün" });
  let sequence = 0;
  const rejected = (type, payload, pattern) => {
    const id = `folio-charge-rejected-${sequence++}`;
    const before = db.prepare("SELECT COUNT(*) AS count FROM room_folio_items").get().count;
    const balance = menuEntry().stock_quantity;
    const result = database.applyAndroidAction(action(id, type, payload));
    assert.equal(result.ok, false, `${type} should be rejected`);
    if (pattern) assert.match(result.message, pattern);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM room_folio_items").get().count, before);
    assert.equal(menuEntry().stock_quantity, balance);
    assert.equal(db.prepare("SELECT id FROM android_action_receipts WHERE id = ?").get(id), undefined);
    return result;
  };
  try {
    setPermissions(permissions);
    for (const [type, payload] of [["room_folio_menu_item_add", menuPayload], ["room_folio_manual_charge_add", manualPayload]]) {
      db.prepare("UPDATE android_devices SET is_active = 0 WHERE device_id = ?").run(DEVICE_ID);
      rejected(type, payload(), /pasifleştirilmiş/);
      db.prepare("UPDATE android_devices SET is_active = 1, revoked_at = 'revoked' WHERE device_id = ?").run(DEVICE_ID);
      rejected(type, payload(), /pasifleştirilmiş/);
      db.prepare("UPDATE android_devices SET revoked_at = '' WHERE device_id = ?").run(DEVICE_ID);
      for (const missing of ["room_folio.view", type === "room_folio_menu_item_add" ? "room_folio.add_menu_item" : "room_folio.add_manual_charge",
        ...(type === "room_folio_menu_item_add" ? ["menu.view"] : [])]) {
        setPermissions(permissions.filter(permission => permission !== missing));
        rejected(type, payload(), /yetki/);
      }
      setPermissions(permissions);
      for (const capability of ["service.android", "accommodation.folio", "accommodation.stays",
        ...(type === "room_folio_menu_item_add" ? ["food_service.menu"] : [])]) {
        for (const role of ["staff", "admin"]) {
          db.prepare("UPDATE android_devices SET role = ? WHERE device_id = ?").run(role, DEVICE_ID);
          db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = ?").run(capability);
          rejected(type, payload(), /yetenek/);
          db.prepare("UPDATE business_capabilities SET is_enabled = 1 WHERE capability_id = ?").run(capability);
        }
        setPermissions(permissions);
      }
      rejected(type, { ...payload(), expected_folio_version: "" }, /sürümü/);
      rejected(type, { ...payload(), expected_folio_version: "f".repeat(64) }, /değişmiş/);
      for (const status of ["planned", "checked_out", "cancelled"]) {
        db.prepare("UPDATE customer_room_stays SET status = ? WHERE id = 'android_folio_stay'").run(status);
        rejected(type, payload(), /konaklama/);
      }
      db.prepare("UPDATE stay_guests SET status = 'planned' WHERE stay_id = 'android_folio_stay'").run();
      db.prepare("UPDATE customer_room_stays SET status = 'checked_in' WHERE id = 'android_folio_stay'").run();
    }
    for (const [table, id, field, invalid, valid] of [
      ["rooms", currentFolio().roomId, "is_active", 0, 1],
      ["customer_room_stays", "android_folio_stay", "deleted_at", "withdrawn", ""],
      ["room_folios", folioId, "status", "closed", "open"]
    ]) {
      const payload = manualPayload();
      db.prepare(`UPDATE ${table} SET ${field} = ? WHERE id = ?`).run(invalid, id);
      rejected("room_folio_manual_charge_add", payload, /konaklama/);
      db.prepare(`UPDATE ${table} SET ${field} = ? WHERE id = ?`).run(valid, id);
    }
    db.prepare("INSERT INTO customers (id, full_name, phone, created_at, updated_at) VALUES ('folio-other-customer', 'Diğer', '', ?, ?)").run(new Date().toISOString(), new Date().toISOString());
    const mismatchedCustomer = manualPayload();
    db.prepare("UPDATE customer_room_stays SET customer_id = 'folio-other-customer' WHERE id = 'android_folio_stay'").run();
    rejected("room_folio_manual_charge_add", mismatchedCustomer, /konaklama/);
    db.prepare("UPDATE customer_room_stays SET customer_id = 'android_folio_customer' WHERE id = 'android_folio_stay'").run();
    const source = currentSnapshot();
    const snapshotFolio = source.room_folios.find(folio => folio.id === folioId);
    assert.equal(snapshotFolio.version, currentFolio().version);
    assert.equal(snapshotFolio.can_add_items, true);
    assert.equal(source.menu.items.find(item => item.id === entryId).price, 9.87);
    const projected = projectLocalAndroidSnapshotForDevice(source, DEVICE_ID);
    assert.equal(projected.menu.items.find(item => item.id === entryId).currency, "TRY");
    assert.equal(projected.menu.items.find(item => item.id === entryId).stock_quantity, 5);
    assert.deepEqual(projected.admin_menu.items, [], "Charge permissions must not grant menu editing");
    const withoutMenu = { ...source, androidPermissions: { [DEVICE_ID]: { role: "staff", is_active: true, permissions: ["room_folio.view"] } } };
    assert.deepEqual(projectLocalAndroidSnapshotForDevice(withoutMenu, DEVICE_ID).menu.items, []);
    const noStock = { ...source, androidPermissions: { [DEVICE_ID]: { role: "staff", is_active: true, permissions: ["menu.view"] } } };
    assert.equal(projectLocalAndroidSnapshotForDevice(noStock, DEVICE_ID).menu.items[0].stock_quantity, null);
    assert.deepEqual(projectLocalAndroidSnapshotForDevice(source, "unknown-device").room_folios, []);
    const noMenuCapability = projectAndroidOperationsSnapshot(source, source.business_capabilities.filter(cap => cap !== "food_service.menu"), "2026-10-14");
    assert.deepEqual(noMenuCapability.menu.items, []);

    rejected("room_folio_menu_item_add", { ...menuPayload(), quantity: 0 });
    rejected("room_folio_menu_item_add", { ...menuPayload(), quantity: 1.5 });
    rejected("room_folio_menu_item_add", { ...menuPayload(), quantity: "2" });
    rejected("room_folio_menu_item_add", { ...menuPayload(), quantity: 1001 });
    rejected("room_folio_menu_item_add", { ...menuPayload(), quantity: 100 }, /stok/i);
    rejected("room_folio_menu_item_add", { ...menuPayload(), expected_menu_updated_at: "stale" }, /değişmiş/);
    const stalePrice = menuPayload();
    db.prepare("UPDATE menu_product_entries SET price_override = 10 WHERE id = ?").run(entryId);
    rejected("room_folio_menu_item_add", stalePrice, /değişmiş/);
    db.prepare("UPDATE menu_product_entries SET price_override = 9.87 WHERE id = ?").run(entryId);
    db.prepare("UPDATE catalog_products SET currency = 'USD' WHERE id = ?").run(productId);
    rejected("room_folio_menu_item_add", menuPayload(), /para birimi/);
    db.prepare("UPDATE catalog_products SET currency = 'TRY' WHERE id = ?").run(productId);
    for (const [table, id, field] of [["catalog_products", productId, "is_active"], ["menu_product_entries", entryId, "is_available"], ["menu_categories", category.savedId, "is_active"]]) {
      const payload = menuPayload();
      db.prepare(`UPDATE ${table} SET ${field} = 0 WHERE id = ?`).run(id);
      // menuEntry() excludes inactive products; the known payload still checks withdrawal.
      const result = database.applyAndroidAction(action(`folio-withdrawn-${sequence++}`, "room_folio_menu_item_add", payload));
      assert.equal(result.ok, false);
      assert.match(result.message, /satışa kapalı/);
      db.prepare(`UPDATE ${table} SET ${field} = 1 WHERE id = ?`).run(id);
    }
    for (const invalid of [{ amount_minor: -1 }, { amount_minor: 1.1 }, { amount_minor: "100" }, { label: {} },
      { label: "" }, { label: "x".repeat(121) }, { note: "x".repeat(501) }]) {
      rejected("room_folio_manual_charge_add", { ...manualPayload(), ...invalid });
    }
    const baseTotal = currentFolio().chargeTotalMinor;
    const oldVersion = currentFolio().version;
    const menuAction = action("folio-menu-added", "room_folio_menu_item_add", menuPayload());
    const movementCount = () => db.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type = 'room_folio'").get().count;
    const oldMovements = movementCount();
    const financeCount = () => db.prepare("SELECT COUNT(*) AS count FROM finance_entries").get().count;
    const oldFinance = financeCount();
    assert.equal(database.applyAndroidAction(menuAction).ok, true);
    assert.equal(database.applyAndroidAction(menuAction).alreadyApplied, true);
    assert.equal(menuEntry().stock_quantity, 4.75);
    assert.equal(movementCount(), oldMovements + 1);
    let folio = currentFolio();
    assert.equal(folio.chargeTotalMinor, baseTotal + 1974);
    assert.notEqual(folio.version, oldVersion);
    assert.equal(folio.items[0].unitPriceMinor, 987);
    assert.equal(folio.items[0].productId, productId);
    rejected("room_folio_manual_charge_add", { ...manualPayload(), expected_folio_version: oldVersion }, /değişmiş/);
    db.prepare("DELETE FROM sync_outbox WHERE job_key = 'android_snapshot'").run();
    const manualAction = action("folio-manual-added", "room_folio_manual_charge_add", manualPayload());
    assert.equal(database.applyAndroidAction(manualAction).ok, true);
    assert.equal(database.applyAndroidAction(manualAction).alreadyApplied, true);
    assert.ok(db.prepare("SELECT job_key FROM sync_outbox WHERE job_key = 'android_snapshot'").get(), "Manual charges must durably invalidate the snapshot");
    folio = currentFolio();
    assert.equal(folio.chargeTotalMinor, baseTotal + 1974 + 12345);
    assert.equal(folio.items.find(item => item.kind === "manual_charge").note, "İki gün");
    assert.equal(menuEntry().stock_quantity, 4.75);
    assert.equal(financeCount(), oldFinance, "Adding charges must not create a cash receipt");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM android_action_receipts WHERE action_type IN ('room_folio_menu_item_add', 'room_folio_manual_charge_add')").get().count, 2);
    const refreshed = currentSnapshot();
    assert.equal(refreshed.room_folios.find(item => item.id === folioId).charge_total_minor, folio.chargeTotalMinor);
    assert.equal(refreshed.menu.items.find(item => item.id === entryId).stock_quantity, 4.75);
    const publishedVersion = currentFolio().version;
    db.prepare("UPDATE room_folio_items SET sync_status = 'synced' WHERE folio_id = ?").run(folioId);
    assert.equal(currentFolio().version, publishedVersion, "Publication acknowledgement must not invalidate the account version");
    // A receipt write failure must roll back both the item and its inventory consumption.
    db.exec("CREATE TRIGGER folio_test_receipt_failure BEFORE INSERT ON android_action_receipts WHEN NEW.id LIKE 'folio-charge-rejected-%' BEGIN SELECT RAISE(ABORT, 'test receipt failure'); END");
    rejected("room_folio_menu_item_add", menuPayload());
    rejected("room_folio_manual_charge_add", manualPayload());
    db.exec("DROP TRIGGER folio_test_receipt_failure");
    for (const item of folio.items) assert.equal(service.removeItem(item.id).ok, true);
    assert.equal(currentFolio().chargeTotalMinor, baseTotal);
    assert.equal(menuEntry().stock_quantity, 5, "Canonical removal restores the frozen consumption exactly");
  } finally {
    db.prepare("UPDATE android_devices SET role = 'staff', is_active = 1, revoked_at = '', permissions_json = ? WHERE device_id = ?").run(originalPermissions, DEVICE_ID);
    db.close();
  }
}

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}
