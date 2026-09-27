import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");
const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-android-finance-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});
const DEVICE_ID = "android-finance-smoke";

try {
  database.initialize();
  const setupResult = database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Android Finance Smoke",
    phone: "+905550005050",
    whatsapp: "+905550005050",
    syncSecret: "android-finance-secret-123",
    servicePreferences: { whatsapp: false, android: true }
  }));
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);

  database.upsertAndroidDeviceSightings([{
    device_id: DEVICE_ID,
    device_name: "Finance Smoke",
    app_version: "smoke",
    first_seen_at: "2026-08-11T19:00:00.000Z",
    last_seen_at: "2026-08-11T19:00:00.000Z"
  }]);

  let device = database.getAndroidDevices().find((item) => item.deviceId === DEVICE_ID);
  assert.ok(device);
  assert.equal(device.isActive, false, "Yeni Android cihaz masaüstü onayı olmadan aktif başlamamalı");
  assert.equal(device.permissions.includes("finance.view"), false, "Varsayılan personel mobil Kasa görmemeli");
  assert.equal(device.permissions.includes("finance.create"), false, "Varsayılan personel Kasa hareketi eklememeli");

  const inactiveDenied = database.applyAndroidAction(action("finance-inactive-denied", {
    direction: "income",
    amount_minor: 12500,
    payment_method: "cash",
    category: "other_income",
    description: "Onaysız cihaz denemesi"
  }));
  assert.equal(inactiveDenied.ok, false, "Masaüstünden onaylanmamış cihaz işlem yapamamalı");

  const approved = database.setAndroidDeviceActive(DEVICE_ID, true);
  assert.equal(approved.ok, true, approved.message);
  device = database.getAndroidDevices().find((item) => item.deviceId === DEVICE_ID);
  assert.equal(device?.isActive, true, "Masaüstü onayı cihazı aktif hale getirmeli");

  const denied = database.applyAndroidAction(action("finance-denied", {
    direction: "income",
    amount_minor: 12500,
    payment_method: "cash",
    category: "other_income",
    description: "Yetkisiz deneme"
  }));
  assert.equal(denied.ok, false, "Kasiyer görevi olmadan Kasa kaydı reddedilmeli");

  const groupsUpdated = database.setAndroidDevicePermissionGroups(DEVICE_ID, {
    service_orders: true,
    cashier: true,
    rooms_tasks: true,
    customer_reservation: false,
    market_operations: false
  });
  assert.equal(groupsUpdated.ok, true, groupsUpdated.message);
  device = database.getAndroidDevices().find((item) => item.deviceId === DEVICE_ID);
  assert.ok(device?.permissions.includes("finance.view"));
  assert.ok(device?.permissions.includes("finance.create"));

  const now = new Date().toISOString();
  const createId = "finance-income-001";
  const created = database.applyAndroidAction(action(createId, {
    direction: "income",
    amount_minor: 12550,
    payment_method: "cash",
    category: "other_income",
    description: "Mobil satış",
    occurred_at: now
  }));
  assert.equal(created.ok, true, created.message);

  const repeated = database.applyAndroidAction(action(createId, {
    direction: "income",
    amount_minor: 99999,
    payment_method: "cash",
    category: "other_income",
    description: "Tekrar kayıt",
    occurred_at: now
  }));
  assert.equal(repeated.ok, true);
  assert.equal(repeated.alreadyApplied, true, "Aynı action ikinci kez kasa kaydı oluşturmamalı");

  const expense = database.applyAndroidAction(action("finance-expense-001", {
    direction: "expense",
    amount_minor: 4200,
    payment_method: "card",
    category: "maintenance",
    description: "Küçük bakım",
    occurred_at: now
  }));
  assert.equal(expense.ok, true, expense.message);

  const invalid = database.applyAndroidAction(action("finance-invalid-001", {
    direction: "expense",
    amount_minor: 0,
    payment_method: "cash",
    category: "other_expense",
    description: "Geçersiz"
  }));
  assert.equal(invalid.ok, false, "Sıfır tutar reddedilmeli");

  const finance = new DesktopFinanceService(database.databasePath).getData(20);
  const mobileIncome = finance.recentEntries.filter((entry) => entry.sourceId.startsWith(`android:${DEVICE_ID}/`) && entry.direction === "income");
  const mobileExpense = finance.recentEntries.filter((entry) => entry.sourceId.startsWith(`android:${DEVICE_ID}/`) && entry.direction === "expense");
  assert.equal(mobileIncome.length, 1, "Tek Android gelir kaydı oluşmalı");
  assert.equal(mobileIncome[0].amountMinor, 12550);
  assert.equal(mobileExpense.length, 1, "Android gider kaydı oluşmalı");
  assert.equal(mobileExpense[0].amountMinor, 4200);

  const sqlite = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const receipts = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM android_action_receipts WHERE action_type = 'finance_manual_create'").get()?.count ?? 0);
    assert.equal(receipts, 2, "Yalnız başarılı iki Kasa action receipt kaydı olmalı");
    const events = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM events WHERE actor_type = 'android' AND type = 'finance.manual_created'").get()?.count ?? 0);
    assert.equal(events, 2, "Android Kasa event kayıtları eksik");
    assert.equal(String(sqlite.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    sqlite.close();
  }

  console.log("android-finance-actions-smoke-ok: device approval, permission, income/expense, idempotency and finance totals verified");
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}

function action(id, payload) {
  return {
    id,
    action_type: "finance_manual_create",
    payload,
    created_at: new Date().toISOString(),
    device_id: DEVICE_ID,
    device_name: "Finance Smoke",
    app_version: "smoke",
    status: "pending",
    error_message: ""
  };
}
