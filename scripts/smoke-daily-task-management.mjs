import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-daily-task-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});

try {
  database.initialize();
  const initialPending = database.getDashboardData().summary.pendingDailyTasks;

  const created = database.saveDailyTask({
    title: "Oda 4 klimayı kontrol et",
    description: "Misafir gelmeden önce kontrol edilecek.",
    taskType: "manual_pension",
    dueDate: "2035-08-12",
    dueTime: "11:30"
  });
  assert.equal(created.ok, true, created.message);
  const createdTask = created.dashboardData.dailyTasks.find((task) => task.title === "Oda 4 klimayı kontrol et");
  assert.ok(createdTask);
  assert.match(createdTask.id, /^task_/);
  assert.equal(createdTask.taskType, "manual_pension");
  assert.equal(createdTask.status, "pending");
  assert.equal(created.dashboardData.summary.pendingDailyTasks, initialPending + 1);

  const edited = database.saveDailyTask({
    id: createdTask.id,
    title: "Oda 4 klima ve kumanda kontrolü",
    description: "Kumanda pili de kontrol edilecek.",
    taskType: "manual_pension",
    dueDate: "2035-08-12",
    dueTime: "12:00"
  });
  assert.equal(edited.ok, true, edited.message);
  const editedTask = edited.dashboardData.dailyTasks.find((task) => task.id === createdTask.id);
  assert.equal(editedTask?.title, "Oda 4 klima ve kumanda kontrolü");
  assert.equal(editedTask?.dueTime, "12:00");

  const completed = database.updateDailyTaskStatus({ taskId: createdTask.id, status: "done" });
  assert.equal(completed.ok, true, completed.message);
  assert.equal(completed.dashboardData.dailyTasks.find((task) => task.id === createdTask.id)?.status, "done");

  const restaurantTask = database.saveDailyTask({
    title: "Akşam servisi masa düzeni",
    description: "Bahçe masalarını kontrol et.",
    taskType: "manual_restaurant",
    dueDate: "2035-08-12",
    dueTime: "17:00"
  });
  assert.equal(restaurantTask.ok, true, restaurantTask.message);
  const restaurantRecord = restaurantTask.dashboardData.dailyTasks.find((task) => task.title === "Akşam servisi masa düzeni");
  assert.equal(restaurantRecord?.taskType, "manual_restaurant");

  const deleted = database.deleteDailyTask(createdTask.id);
  assert.equal(deleted.ok, true, deleted.message);
  assert.equal(deleted.dashboardData.dailyTasks.some((task) => task.id === createdTask.id), false);

  const sqlite = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const deletedRow = sqlite.prepare("SELECT deleted_at FROM daily_tasks WHERE id = ?").get(createdTask.id);
    assert.ok(String(deletedRow?.deleted_at ?? ""));
    for (const eventType of ["task.created", "task.updated", "task.completed", "task.deleted"]) {
      const count = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM events WHERE type = ? AND entity_id = ?").get(eventType, createdTask.id)?.count ?? 0);
      assert.ok(count >= 1, `${eventType} event missing`);
    }
    assert.equal(String(sqlite.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    sqlite.close();
  }

  const pensionPage = readFileSync(join(process.cwd(), "apps", "desktop-app", "src", "pages", "PensionPage.tsx"), "utf8");
  const restaurantPage = readFileSync(join(process.cwd(), "apps", "desktop-app", "src", "pages", "RestaurantPage.tsx"), "utf8");
  assert.ok(pensionPage.includes('<div className="operation-panel-content">{tasks}</div>'), "Pansiyon günlük iş alanı her zaman erişilebilir olmalı");
  assert.ok(restaurantPage.includes('<div className="operation-panel-content">{tasks}</div>'), "Restoran günlük iş alanı her zaman erişilebilir olmalı");
  assert.equal(pensionPage.includes("pendingAccommodationTasks.length > 0"), false, "Pansiyon görev alanı boş durumda gizlenmemeli");
  assert.equal(restaurantPage.includes("pendingRestaurantTasks.length > 0 &&"), false, "Restoran görev alanı boş durumda gizlenmemeli");

  console.log("daily-task-management-smoke-ok: create, edit, complete, restaurant scope, soft-delete, events and empty-state access verified");
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}
