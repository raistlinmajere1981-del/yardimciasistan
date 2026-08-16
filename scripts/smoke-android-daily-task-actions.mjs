import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-android-daily-task-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});

const DEVICE_ID = "android-daily-task-smoke";

try {
  database.initialize();
  registerStaffDevice(database);

  let device = database.getAndroidDevices().find((item) => item.deviceId === DEVICE_ID);
  assert.ok(device, "Smoke cihazı kaydedilmeli");
  assert.equal(device.role, "staff");
  assert.equal(device.isActive, true, "Smoke cihazı test içinde açıkça onaylanmalı");
  assert.ok(device.permissions.includes("daily_task.create"));
  assert.ok(device.permissions.includes("daily_task.update"));
  assert.equal(device.permissions.includes("daily_task.delete"), false);

  const createId = "android_daily_task_create_001";
  const created = database.applyAndroidAction(action(createId, "daily_task_create", {
    task_type: "manual_pension",
    title: "Oda 103 havlu kontrolü",
    description: "Akşam girişinden önce tamamlanacak.",
    due_date: "2036-06-10",
    due_time: "16:30"
  }));
  assert.equal(created.ok, true, created.message);

  let dashboard = database.getDashboardData();
  const pensionTask = dashboard.dailyTasks.find((task) => task.title === "Oda 103 havlu kontrolü");
  assert.ok(pensionTask, "Android pansiyon işi dashboard'a düşmeli");
  assert.equal(pensionTask.taskType, "manual_pension");
  assert.equal(pensionTask.status, "pending");
  assert.equal(pensionTask.dueDate, "2036-06-10");
  assert.equal(pensionTask.dueTime, "16:30");

  const repeated = database.applyAndroidAction(action(createId, "daily_task_create", {
    task_type: "manual_pension",
    title: "Tekrar kayıt",
    description: "",
    due_date: "",
    due_time: ""
  }));
  assert.equal(repeated.ok, true);
  assert.equal(repeated.alreadyApplied, true, "Aynı create action ikinci kez uygulanmamalı");
  dashboard = database.getDashboardData();
  assert.equal(
    dashboard.dailyTasks.filter((task) => task.id === pensionTask.id).length,
    1,
    "Aynı action tek günlük iş üretmeli"
  );

  const updated = database.applyAndroidAction(action("android_daily_task_update_001", "daily_task_update", {
    task_id: pensionTask.id,
    task_type: "manual_pension",
    expected_updated_at: pensionTask.updatedAt,
    title: "Oda 103 giriş hazırlığı",
    description: "Havlu ve su kontrolü tamamlanacak.",
    due_date: "2036-06-10",
    due_time: "17:00"
  }));
  assert.equal(updated.ok, true, updated.message);
  dashboard = database.getDashboardData();
  const editedPensionTask = dashboard.dailyTasks.find((task) => task.id === pensionTask.id);
  assert.equal(editedPensionTask?.title, "Oda 103 giriş hazırlığı");
  assert.equal(editedPensionTask?.dueTime, "17:00");

  const stale = database.applyAndroidAction(action("android_daily_task_stale_001", "daily_task_update", {
    task_id: pensionTask.id,
    task_type: "manual_pension",
    expected_updated_at: pensionTask.updatedAt,
    title: "Eski snapshot",
    description: "",
    due_date: "",
    due_time: ""
  }));
  assert.equal(stale.ok, false, "Eski updated_at ile görev düzenleme reddedilmeli");
  assert.match(stale.message, /yenile|değiş/i);

  const restaurantCreated = database.applyAndroidAction(action("android_daily_task_restaurant_create_001", "daily_task_create", {
    task_type: "manual_restaurant",
    title: "Akşam masalarını hazırla",
    description: "Bahçe masaları öncelikli.",
    due_date: "2036-06-10",
    due_time: "18:00"
  }));
  assert.equal(restaurantCreated.ok, true, restaurantCreated.message);
  dashboard = database.getDashboardData();
  const restaurantTask = dashboard.dailyTasks.find((task) => task.title === "Akşam masalarını hazırla");
  assert.ok(restaurantTask, "Android restoran işi dashboard'a düşmeli");
  assert.equal(restaurantTask.taskType, "manual_restaurant");

  const staffDelete = database.applyAndroidAction(action("android_daily_task_staff_delete_001", "daily_task_delete", {
    task_id: restaurantTask.id,
    task_type: restaurantTask.taskType,
    expected_updated_at: restaurantTask.updatedAt
  }));
  assert.equal(staffDelete.ok, false, "Personel cihaz günlük işi silememeli");
  assert.match(staffDelete.message, /yetki|yönetici/i);

  assert.equal(database.setAndroidDeviceRole(DEVICE_ID, "admin").ok, true);
  device = database.getAndroidDevices().find((item) => item.deviceId === DEVICE_ID);
  assert.ok(device?.permissions.includes("daily_task.delete"));

  const adminDelete = database.applyAndroidAction(action("android_daily_task_admin_delete_001", "daily_task_delete", {
    task_id: restaurantTask.id,
    task_type: restaurantTask.taskType,
    expected_updated_at: restaurantTask.updatedAt
  }));
  assert.equal(adminDelete.ok, true, adminDelete.message);
  assert.equal(database.getDashboardData().dailyTasks.some((task) => task.id === restaurantTask.id), false);

  const automaticSeed = database.saveDailyTask({
    title: "Otomatik görev koruması",
    description: "Smoke için otomatik tipe çevrilecek.",
    taskType: "manual_pension",
    dueDate: "2036-06-11",
    dueTime: "10:00"
  });
  assert.equal(automaticSeed.ok, true, automaticSeed.message);
  const automaticTask = automaticSeed.dashboardData.dailyTasks.find((task) => task.title === "Otomatik görev koruması");
  assert.ok(automaticTask);
  const writable = new DatabaseSync(database.databasePath);
  try {
    writable.prepare("UPDATE daily_tasks SET task_type = 'room_cleaning' WHERE id = ?").run(automaticTask.id);
  } finally {
    writable.close();
  }
  const protectedTask = database.getDashboardData().dailyTasks.find((task) => task.id === automaticTask.id);
  assert.equal(protectedTask?.taskType, "room_cleaning");
  const protectedDelete = database.applyAndroidAction(action("android_daily_task_auto_delete_001", "daily_task_delete", {
    task_id: automaticTask.id,
    task_type: "room_cleaning",
    expected_updated_at: protectedTask.updatedAt
  }));
  assert.equal(protectedDelete.ok, false, "Otomatik görev silinmemeli");
  assert.match(protectedDelete.message, /otomatik/i);

  const sqlite = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const receiptCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM android_action_receipts WHERE action_type IN ('daily_task_create', 'daily_task_update', 'daily_task_delete')").get()?.count ?? 0
    );
    assert.ok(receiptCount >= 4, "Başarılı günlük iş action receipt kayıtları eksik");
    const androidEventCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM events WHERE actor_type = 'android' AND type IN ('task.created', 'task.updated', 'task.deleted')").get()?.count ?? 0
    );
    assert.ok(androidEventCount >= 4, "Android günlük iş event kayıtları eksik");
    assert.equal(String(sqlite.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    sqlite.close();
  }

  console.log("android-daily-task-actions-smoke-ok: create, update, stale version, idempotency, admin delete and automatic-task protection verified");
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}

function registerStaffDevice(database) {
  database.upsertAndroidDeviceSightings([{
    device_id: DEVICE_ID,
    device_name: "Daily Task Smoke",
    app_version: "smoke",
    first_seen_at: "2026-08-11T18:00:00.000Z",
    last_seen_at: "2026-08-11T18:00:00.000Z"
  }]);
  const approval = database.setAndroidDeviceActive(DEVICE_ID, true);
  assert.equal(approval.ok, true, approval.message);
}

function action(id, actionType, payload) {
  return {
    id,
    action_type: actionType,
    payload,
    created_at: "2026-08-11T18:00:00.000Z",
    device_id: DEVICE_ID,
    device_name: "Daily Task Smoke",
    app_version: "smoke",
    status: "pending",
    error_message: ""
  };
}
