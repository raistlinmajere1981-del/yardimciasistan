const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ANDROID_ACTION_TYPES,
  ANDROID_PERMISSION_GROUP_PERMISSIONS,
  resolveAndroidActionPermission
} = require("../dist");

test("Android mobil Kasa action tipi finance.create yetkisine bağlıdır", () => {
  assert.equal(ANDROID_ACTION_TYPES.includes("finance_manual_create"), true);
  assert.equal(resolveAndroidActionPermission("finance_manual_create"), "finance.create");
});

test("Kasiyer görev alanı mobil Kasa görüntüleme ve kayıt yetkilerini taşır", () => {
  assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.cashier.includes("finance.view"), true);
  assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.cashier.includes("finance.create"), true);
});
