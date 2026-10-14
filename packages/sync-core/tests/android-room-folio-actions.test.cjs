const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ANDROID_ACTION_TYPES,
  ANDROID_PERMISSION_GROUP_PERMISSIONS,
  ANDROID_PERMISSIONS,
  androidEffectivePermissionsForRole,
  androidActionAllowedByCapabilities,
  resolveAndroidActionPermission
} = require("../dist");
const { BUSINESS_CAPABILITIES: C } = require("../../shared/dist");

test("Android oda hesabı ödeme ve çıkış action tipleri yayınlanır", () => {
  assert.equal(ANDROID_ACTION_TYPES.includes("room_folio_payment_add"), true);
  assert.equal(ANDROID_ACTION_TYPES.includes("room_folio_checkout"), true);
  assert.equal(resolveAndroidActionPermission("room_folio_payment_add"), "room_folio.payment");
  assert.equal(resolveAndroidActionPermission("room_folio_checkout"), "room_folio.checkout");
});

test("folio charges expose distinct permissions through the rooms group", () => {
  for (const [action, permission] of [
    ["room_folio_menu_item_add", "room_folio.add_menu_item"],
    ["room_folio_manual_charge_add", "room_folio.add_manual_charge"]
  ]) {
    assert.ok(ANDROID_ACTION_TYPES.includes(action));
    assert.equal(resolveAndroidActionPermission(action), permission);
    assert.ok(ANDROID_PERMISSION_GROUP_PERMISSIONS.rooms_tasks.includes(permission));
    assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.cashier.includes(permission), false);
    const caps = [C.ANDROID, C.ACCOMMODATION_FOLIO, C.ACCOMMODATION_STAYS, C.FOOD_MENU];
    assert.ok(androidActionAllowedByCapabilities(action, caps));
    assert.equal(androidEffectivePermissionsForRole("staff", [], caps).includes(permission), false);
    assert.ok(androidEffectivePermissionsForRole("staff", [permission], caps).includes(permission));
    assert.ok(androidEffectivePermissionsForRole("admin", [], caps).includes(permission));
    for (const capability of [C.ANDROID, C.ACCOMMODATION_FOLIO, C.ACCOMMODATION_STAYS,
      ...(action === "room_folio_menu_item_add" ? [C.FOOD_MENU] : [])]) {
      const disabled = caps.filter(value => value !== capability);
      assert.equal(androidActionAllowedByCapabilities(action, disabled), false);
      assert.equal(androidEffectivePermissionsForRole("admin", ANDROID_PERMISSIONS, disabled).includes(permission), false);
    }
  }
  assert.ok(androidActionAllowedByCapabilities("room_folio_manual_charge_add", [C.ANDROID, C.ACCOMMODATION_FOLIO, C.ACCOMMODATION_STAYS]));
  assert.equal(resolveAndroidActionPermission("room_folio_discount_add"), null);
});

test("Kasiyer tahsilat, oda görev grubu borçsuz çıkış yetkisini taşır", () => {
  assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.cashier.includes("room_folio.view"), true);
  assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.cashier.includes("room_folio.payment"), true);
  assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.rooms_tasks.includes("room_folio.view"), true);
  assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.rooms_tasks.includes("room_folio.checkout"), true);
});
