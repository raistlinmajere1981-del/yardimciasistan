const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BUSINESS_CAPABILITIES: C,
  canConvertRequestToReservation,
  getReservationDomain,
  getRequestReservationCapability,
  getRequestReservationType,
  getOperationalTaskDomain,
  isOperationalTaskAvailable,
  isRequestTypeAvailable,
  isReservationTypeAvailable
} = require("../dist");

test("request types use reservation capabilities rather than room/table presence", () => {
  assert.equal(isRequestTypeAvailable([C.ACCOMMODATION_ROOMS], "pension_reservation"), false);
  assert.equal(canConvertRequestToReservation([C.ACCOMMODATION_ROOMS], "pension_reservation"), false);
  assert.equal(isRequestTypeAvailable([C.CUSTOMERS, C.REQUESTS, C.ACCOMMODATION_RESERVATIONS], "pension_reservation"), true);
  assert.equal(getRequestReservationCapability("pension_reservation"), C.ACCOMMODATION_RESERVATIONS);
  assert.equal(getRequestReservationType("pension_reservation"), "room");

  assert.equal(isRequestTypeAvailable([C.FOOD_TABLES], "restaurant_reservation"), false);
  assert.equal(canConvertRequestToReservation([C.FOOD_TABLES], "breakfast_request"), false);
  assert.equal(canConvertRequestToReservation([C.CUSTOMERS, C.REQUESTS, C.FOOD_RESERVATIONS], "breakfast_request"), true);
  assert.equal(getRequestReservationType("restaurant_reservation"), "table");
});

test("domain-scoped tasks share one capability classifier", () => {
  assert.equal(getOperationalTaskDomain("room_cleaning"), "accommodation");
  assert.equal(getOperationalTaskDomain("table_service"), "food_service");
  assert.equal(getOperationalTaskDomain("reservation", "reservation", "table"), "food_service");
  assert.equal(getOperationalTaskDomain("reservation", "reservation", "room_and_table"), "mixed");
  assert.equal(getOperationalTaskDomain("reservation", "reservation", "mixed"), "mixed");
  assert.equal(getOperationalTaskDomain("note"), "core");
  assert.equal(isOperationalTaskAvailable([C.TASKS, C.ACCOMMODATION_ROOMS], "room_cleaning"), true);
  assert.equal(isOperationalTaskAvailable([C.TASKS, C.ACCOMMODATION_ROOMS], "table_service"), false);
  assert.equal(isOperationalTaskAvailable([C.TASKS, C.FOOD_TABLES], "table_service"), true);
  assert.equal(isOperationalTaskAvailable(
    [C.TASKS, C.FOOD_TABLES],
    "reservation",
    "reservation",
    "table"
  ), true);
  assert.equal(isOperationalTaskAvailable(
    [C.TASKS, C.ACCOMMODATION_ROOMS],
    "reservation",
    "reservation",
    "table"
  ), false);
  assert.equal(isOperationalTaskAvailable(
    [C.TASKS, C.ACCOMMODATION_ROOMS],
    "reservation",
    "reservation",
    "mixed"
  ), false);
  assert.equal(isOperationalTaskAvailable(
    [C.TASKS, C.ACCOMMODATION_ROOMS, C.FOOD_TABLES],
    "reservation",
    "reservation",
    "mixed"
  ), true);
  assert.equal(isOperationalTaskAvailable([C.TASKS], "note"), true);
  assert.equal(isOperationalTaskAvailable([C.ACCOMMODATION_ROOMS], "room_cleaning"), false);
});

test("generic requests require the request capability and cannot become fake reservations", () => {
  assert.equal(isRequestTypeAvailable([], "general_info"), false);
  assert.equal(isRequestTypeAvailable([C.CUSTOMERS], "location_question"), false);
  assert.equal(isRequestTypeAvailable([C.CUSTOMERS, C.REQUESTS], "general_info"), true);
  assert.equal(isRequestTypeAvailable([C.CUSTOMERS, C.REQUESTS], "location_question"), true);
  assert.equal(canConvertRequestToReservation([C.CUSTOMERS, C.REQUESTS, C.ACCOMMODATION_RESERVATIONS], "general_info"), false);
  assert.equal(getRequestReservationType("general_info"), null);
});

test("reservation records are projected by their own domain", () => {
  assert.equal(isReservationTypeAvailable([C.ACCOMMODATION_RESERVATIONS], "room"), true);
  assert.equal(isReservationTypeAvailable([C.ACCOMMODATION_RESERVATIONS], "table"), false);
  assert.equal(isReservationTypeAvailable([C.FOOD_RESERVATIONS], "table"), true);
  assert.equal(isReservationTypeAvailable([C.FOOD_RESERVATIONS], "room"), false);
  assert.equal(isReservationTypeAvailable([C.ACCOMMODATION_RESERVATIONS], "room_and_table"), false);
  assert.equal(isReservationTypeAvailable([
    C.ACCOMMODATION_RESERVATIONS,
    C.FOOD_RESERVATIONS
  ], "room_and_table"), true);
  assert.equal(isReservationTypeAvailable([], "other"), false);
  assert.equal(getReservationDomain("event", { roomIds: ["room-1"] }), "accommodation");
  assert.equal(getReservationDomain("other", { tableIds: ["table-1"] }), "food_service");
  assert.equal(getReservationDomain("event", { roomIds: ["room-1"], tableIds: ["table-1"] }), "mixed");
  assert.equal(isReservationTypeAvailable(
    [C.FOOD_RESERVATIONS],
    "event",
    { roomIds: ["room-1"] }
  ), false);
  assert.equal(isReservationTypeAvailable(
    [C.FOOD_RESERVATIONS],
    "event",
    { tableIds: ["table-1"] }
  ), true);
});

test("reservation-linked generic tasks use resource context", () => {
  assert.equal(getOperationalTaskDomain(
    "reservation",
    "reservation",
    "event",
    { tableIds: ["table-1"] }
  ), "food_service");
  assert.equal(isOperationalTaskAvailable(
    [C.TASKS, C.FOOD_TABLES],
    "reservation",
    "reservation",
    "event",
    { tableIds: ["table-1"] }
  ), true);
  assert.equal(isOperationalTaskAvailable(
    [C.TASKS, C.ACCOMMODATION_ROOMS],
    "reservation",
    "reservation",
    "event",
    { tableIds: ["table-1"] }
  ), false);
});
