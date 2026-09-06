const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BUSINESS_CAPABILITIES: C
} = require("../../shared/dist");
const {
  ANDROID_PERMISSIONS,
  androidActionAllowedByCapabilities,
  androidAvailablePermissionGroupIds,
  androidEffectivePermissionsForGroups,
  androidEffectivePermissionsForRole
} = require("../dist");

const core = [C.ANDROID, C.CUSTOMERS, C.TASKS, C.FINANCE, C.DEVICES];
const allGroups = {
  service_orders: true,
  cashier: true,
  rooms_tasks: true,
  customer_reservation: true
};

test("stored Android groups cannot grant disabled room or food domains", () => {
  const permissions = androidEffectivePermissionsForGroups(allGroups, core);
  assert.equal(permissions.includes("room.view"), false);
  assert.equal(permissions.includes("table.view"), false);
  assert.equal(permissions.includes("reservation.view"), false);
  assert.equal(permissions.includes("table_order.view"), false);
  assert.equal(permissions.includes("finance.view"), true);
  assert.equal(permissions.includes("daily_task.view"), true);
  assert.equal(permissions.includes("customer.view"), true);
  assert.deepEqual(androidAvailablePermissionGroupIds(core), ["cashier", "rooms_tasks", "customer_reservation"]);
});

test("admin remains bounded by active business capabilities", () => {
  const marketAdmin = androidEffectivePermissionsForRole("admin", ANDROID_PERMISSIONS, core);
  assert.equal(marketAdmin.includes("room.update_status"), false);
  assert.equal(marketAdmin.includes("reservation.create"), false);
  assert.equal(marketAdmin.includes("table_order.open"), false);
  assert.equal(marketAdmin.includes("customer.manage"), true);

  assert.equal(androidActionAllowedByCapabilities("room_status_update", core), false);
  assert.equal(androidActionAllowedByCapabilities("reservation_room_create", core), false);
});

test("room-customer assignment requires both customer and stay capabilities", () => {
  const staysWithoutCustomers = [C.ANDROID, C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_STAYS];
  const effective = androidEffectivePermissionsForRole("admin", ANDROID_PERMISSIONS, staysWithoutCustomers);
  assert.equal(effective.includes("room.assign_customer"), false);
  assert.equal(androidActionAllowedByCapabilities("customer_room_assign", staysWithoutCustomers), false);
  assert.equal(androidActionAllowedByCapabilities("customer_room_stay_status", staysWithoutCustomers), false);

  const staysWithCustomers = [...staysWithoutCustomers, C.CUSTOMERS];
  assert.equal(androidActionAllowedByCapabilities("customer_room_assign", staysWithCustomers), true);
});

test("room/table presence does not grant reservation actions", () => {
  const roomsOnly = [...core, C.ACCOMMODATION_ROOMS];
  const tablesOnly = [...core, C.FOOD_TABLES];
  assert.equal(androidActionAllowedByCapabilities("reservation_room_create", roomsOnly), false);
  assert.equal(androidActionAllowedByCapabilities("reservation_table_create", tablesOnly), false);
  assert.equal(androidActionAllowedByCapabilities("room_status_update", roomsOnly), true);
  assert.equal(androidActionAllowedByCapabilities("table_status_update", tablesOnly), true);
  assert.equal(androidActionAllowedByCapabilities("room_status_update", roomsOnly, { payload: { status: "reserved" } }), false);
  assert.equal(androidActionAllowedByCapabilities("table_status_update", tablesOnly, { payload: { status: "reserved" } }), false);
  assert.equal(androidActionAllowedByCapabilities("table_status_update", tablesOnly, { payload: { status: "bill_waiting" } }), false);
  assert.equal(androidActionAllowedByCapabilities("table_status_update", tablesOnly, { payload: { status: "occupied" } }), true);
});

test("adding a menu item to an order requires both order and menu capabilities", () => {
  const inconsistentOrdersOnly = [...core, C.FOOD_TABLES, C.FOOD_ORDERS];
  assert.equal(androidActionAllowedByCapabilities("table_order_open", inconsistentOrdersOnly), true);
  assert.equal(androidActionAllowedByCapabilities("table_order_add_item", inconsistentOrdersOnly), false);
  assert.equal(androidActionAllowedByCapabilities(
    "table_order_add_item",
    [...inconsistentOrdersOnly, C.FOOD_MENU]
  ), true);
});

test("a queued stock image import remains bounded by the AI capability", () => {
  const stockCapabilities = [...core, C.FOOD_MENU, C.CATALOG, C.INVENTORY];
  assert.equal(
    androidActionAllowedByCapabilities("menu_stock_image_import_apply", stockCapabilities),
    false
  );
  assert.equal(
    androidActionAllowedByCapabilities("menu_stock_image_import_apply", [...stockCapabilities, C.AI]),
    true
  );
});

test("request conversion and generic reservation status use record domain context", () => {
  const accommodation = [...core, C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_RESERVATIONS];
  assert.equal(androidActionAllowedByCapabilities(
    "customer_request_convert_to_reservation",
    accommodation,
    { requestType: "pension_reservation" }
  ), true);
  assert.equal(androidActionAllowedByCapabilities(
    "customer_request_convert_to_reservation",
    accommodation,
    { requestType: "restaurant_reservation" }
  ), false);
  assert.equal(androidActionAllowedByCapabilities(
    "customer_request_convert_to_reservation",
    accommodation,
    { requestType: "general_info" }
  ), false);
  assert.equal(androidActionAllowedByCapabilities("reservation_approve", accommodation, { reservationType: "room" }), true);
  assert.equal(androidActionAllowedByCapabilities("reservation_approve", accommodation, { reservationType: "table" }), false);
  assert.equal(androidActionAllowedByCapabilities(
    "reservation_approve",
    accommodation,
    { reservationType: "event", reservationTableIds: ["table-1"] }
  ), false);
  assert.equal(androidActionAllowedByCapabilities(
    "reservation_approve",
    accommodation,
    { reservationType: "event", reservationRoomIds: ["room-1"] }
  ), true);
});

test("reservation-linked tasks use the related reservation domain", () => {
  const accommodation = [...core, C.ACCOMMODATION_ROOMS];
  const restaurant = [...core, C.FOOD_TABLES];
  const context = {
    taskType: "reservation",
    relatedType: "reservation",
    relatedReservationType: "table"
  };
  assert.equal(androidActionAllowedByCapabilities("daily_task_complete", accommodation, context), false);
  assert.equal(androidActionAllowedByCapabilities("daily_task_complete", restaurant, context), true);
});

test("service capabilities remove WhatsApp permissions and Android-off removes every permission", () => {
  const withoutWhatsApp = androidEffectivePermissionsForRole("admin", ANDROID_PERMISSIONS, core);
  assert.equal(withoutWhatsApp.includes("message.delete"), false);
  const withoutCustomers = androidEffectivePermissionsForRole(
    "admin",
    ANDROID_PERMISSIONS,
    [C.ANDROID, C.WHATSAPP]
  );
  assert.equal(withoutCustomers.includes("message.delete"), false);
  assert.equal(androidActionAllowedByCapabilities("message_delete", [C.ANDROID, C.WHATSAPP]), false);
  assert.deepEqual(androidEffectivePermissionsForRole("admin", ANDROID_PERMISSIONS, core.filter((capability) => capability !== C.ANDROID)), []);
});
