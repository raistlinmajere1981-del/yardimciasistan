const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ANDROID_ACTION_TYPES,
  ANDROID_PERMISSION_GROUP_PERMISSIONS,
  resolveAndroidActionPermission
} = require("../dist");

test("Android oda hesabı ödeme ve çıkış action tipleri yayınlanır", () => {
  assert.equal(ANDROID_ACTION_TYPES.includes("room_folio_payment_add"), true);
  assert.equal(ANDROID_ACTION_TYPES.includes("room_folio_checkout"), true);
  assert.equal(resolveAndroidActionPermission("room_folio_payment_add"), "room_folio.payment");
  assert.equal(resolveAndroidActionPermission("room_folio_checkout"), "room_folio.checkout");
});

test("Kasiyer tahsilat, oda görev grubu borçsuz çıkış yetkisini taşır", () => {
  assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.cashier.includes("room_folio.view"), true);
  assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.cashier.includes("room_folio.payment"), true);
  assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.rooms_tasks.includes("room_folio.view"), true);
  assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.rooms_tasks.includes("room_folio.checkout"), true);
});
