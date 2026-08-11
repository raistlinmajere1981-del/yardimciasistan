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

const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-android-room-folio-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});
const DEVICE_ID = "android-room-folio-smoke";

try {
  database.initialize();
  database.upsertAndroidDeviceSightings([{
    device_id: DEVICE_ID,
    device_name: "Room Folio Smoke",
    app_version: "smoke",
    first_seen_at: "2026-08-11T20:00:00.000Z",
    last_seen_at: "2026-08-11T20:00:00.000Z"
  }]);

  let device = database.getAndroidDevices().find((item) => item.deviceId === DEVICE_ID);
  assert.ok(device);
  assert.equal(device.permissions.includes("room_folio.view"), true, "Oda/işler personeli oda hesaplarını görebilmeli");
  assert.equal(device.permissions.includes("room_folio.checkout"), true, "Oda/işler personeli ödenmiş hesabı kapatabilmeli");
  assert.equal(device.permissions.includes("room_folio.payment"), false, "Kasiyer görevi olmadan tahsilat alınmamalı");

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
      id, full_name, phone, email, source, notes, tags_json, last_contact_at,
      created_at, updated_at, deleted_at, sync_status
    ) VALUES (?, ?, ?, '', 'manual', '', '[]', '', ?, ?, '', 'local_only')
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

  const opened = roomFolio.openFolio("android_folio_stay");
  assert.equal(opened.ok, true, opened.message);
  const folioId = opened.folioId;
  assert.ok(folioId);
  let folio = opened.data.folios.find((item) => item.id === folioId);
  assert.ok(folio);
  assert.equal(folio.chargeTotalMinor, 240000);
  assert.equal(folio.remainingMinor, 240000);

  const deniedPayment = database.applyAndroidAction(action("folio-payment-denied", "room_folio_payment_add", {
    folio_id: folioId,
    amount_minor: 50000,
    expected_remaining_minor: folio.remainingMinor,
    payment_method: "cash"
  }));
  assert.equal(deniedPayment.ok, false, "Kasiyer görevi olmadan oda tahsilatı reddedilmeli");

  const groupsUpdated = database.setAndroidDevicePermissionGroups(DEVICE_ID, {
    service_orders: true,
    cashier: true,
    rooms_tasks: true,
    customer_reservation: false
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

  const checkoutBlocked = database.applyAndroidAction(action("folio-checkout-blocked", "room_folio_checkout", {
    folio_id: folioId,
    expected_remaining_minor: folio.remainingMinor
  }));
  assert.equal(checkoutBlocked.ok, false, "Borç varken mobil çıkış yapılamamalı");

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
    assert.equal(verify.prepare("SELECT status FROM rooms WHERE id = ?").get(room.id).status, "available");
    const receipts = Number(verify.prepare(`
      SELECT COUNT(*) AS count FROM android_action_receipts
      WHERE action_type IN ('room_folio_payment_add', 'room_folio_checkout')
    `).get()?.count ?? 0);
    assert.equal(receipts, 3, "İki ödeme ve bir çıkış receipt kaydı olmalı");
    const events = Number(verify.prepare(`
      SELECT COUNT(*) AS count FROM events
      WHERE actor_type = 'android' AND type IN ('room_folio.payment_added', 'room_folio.checked_out')
    `).get()?.count ?? 0);
    assert.equal(events, 3, "Android oda hesabı event kayıtları eksik");
    assert.equal(String(verify.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    verify.close();
  }

  console.log("android-room-folio-actions-smoke-ok: permissions, stale guard, payments, finance trigger, checkout and idempotency verified");
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

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}
