const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ANDROID_ACTION_TYPES,
  ANDROID_ADMIN_PERMISSIONS,
  ANDROID_PERMISSION_GROUP_PERMISSIONS,
  resolveAndroidActionPermission
} = require("../dist/index.js");

test("Android günlük iş action tipleri yetkilere bağlanır", () => {
  for (const actionType of ["daily_task_create", "daily_task_update", "daily_task_delete"]) {
    assert.ok(ANDROID_ACTION_TYPES.includes(actionType), `${actionType} action tipi eksik`);
  }
  assert.equal(resolveAndroidActionPermission("daily_task_create"), "daily_task.create");
  assert.equal(resolveAndroidActionPermission("daily_task_update"), "daily_task.update");
  assert.equal(resolveAndroidActionPermission("daily_task_delete"), "daily_task.delete");
});

test("oda ve işler grubu günlük iş oluşturup düzenleyebilir, silme yöneticiye kalır", () => {
  const permissions = ANDROID_PERMISSION_GROUP_PERMISSIONS.rooms_tasks;
  assert.ok(permissions.includes("daily_task.view"));
  assert.ok(permissions.includes("daily_task.create"));
  assert.ok(permissions.includes("daily_task.update"));
  assert.ok(permissions.includes("daily_task.complete"));
  assert.ok(permissions.includes("daily_task.reopen"));
  assert.equal(permissions.includes("daily_task.delete"), false);
  assert.ok(ANDROID_ADMIN_PERMISSIONS.includes("daily_task.delete"));
});
