const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ANDROID_ACTION_TYPES,
  ANDROID_PERMISSIONS,
  androidPermissionsForGroups,
  resolveAndroidActionPermission
} = require("../dist/index.js");

const RESERVATION_ACTIONS = [
  "reservation_room_create",
  "reservation_room_update",
  "reservation_table_create",
  "reservation_table_update"
];

test("Android rezervasyon oluşturma ve düzenleme action tipleri yayınlanır", () => {
  for (const action of RESERVATION_ACTIONS) {
    assert.ok(ANDROID_ACTION_TYPES.includes(action), `${action} action tipi eksik`);
  }
});

test("Android rezervasyon oluşturma ve düzenleme ayrı yetkilere bağlıdır", () => {
  assert.ok(ANDROID_PERMISSIONS.includes("reservation.create"));
  assert.ok(ANDROID_PERMISSIONS.includes("reservation.update"));
  assert.equal(resolveAndroidActionPermission("reservation_room_create", {}), "reservation.create");
  assert.equal(resolveAndroidActionPermission("reservation_table_create", {}), "reservation.create");
  assert.equal(resolveAndroidActionPermission("reservation_room_update", {}), "reservation.update");
  assert.equal(resolveAndroidActionPermission("reservation_table_update", {}), "reservation.update");
});

test("müşteri/rezervasyon görev grubu mobil rezervasyon yetkilerini içerir", () => {
  const permissions = androidPermissionsForGroups({
    service_orders: false,
    cashier: false,
    rooms_tasks: false,
    customer_reservation: true
  });
  assert.ok(permissions.includes("reservation.view"));
  assert.ok(permissions.includes("reservation.create"));
  assert.ok(permissions.includes("reservation.update"));
});
