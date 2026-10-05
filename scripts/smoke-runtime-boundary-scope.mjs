import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";

const require = createRequire(import.meta.url);
const shared = require("@yardimci-asistan/shared"), C = shared.BUSINESS_CAPABILITIES;
const { setBusinessCapability, applyBusinessProfileCapabilities } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { findConflictingRoomReservation, hasConflictingRoomReservation } = require("../apps/desktop-app/dist-electron/database/reservation-store.js");
const { database, cleanup } = createTemporaryDesktopDatabase("runtime-boundary-scope-");
let raw;
try {
  database.initialize();
  assert.equal(database.saveInitialSetup(createSmokeSetupInput({ businessName: "Boundary", phone: "+905550095501",
    whatsapp: "+905550095501", syncSecret: "scope-fixture", servicePreferences: { whatsapp: false, android: false } })).ok, true);
  const layout = seedSmokeBusinessLayout(database.databasePath, { roomCount: 2 });
  const [room, otherRoom] = layout.rooms;
  raw = new DatabaseSync(database.databasePath);
  const now = "2026-01-01T00:00:00.000Z";
  for (const id of ["customer", "other-customer"]) raw.prepare(`INSERT INTO customers
    (id, full_name, phone, created_at, updated_at) VALUES (?, ?, '+905550095501', ?, ?)`).run(id, id, now, now);
  const reservation = (id, type, start, end, status = "approved", roomIds = []) => raw.prepare(`INSERT INTO reservations
    (id, request_id, customer_id, reservation_type, title, start_date, end_date, status, room_ids_json, created_at, updated_at)
    VALUES (?, ?, 'other-customer', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, `manual:${id}`, type, id, start, end, status, JSON.stringify(roomIds), now, now);
  for (let index = 0; index < 85; index++) reservation(`history-${index}`, "room", "2000-01-01", "2000-01-02", index % 2 ? "cancelled" : "approved");
  reservation("outside-room", "room", "2040-01-01", "2040-01-05", "approved", [room.id]);
  reservation("outside-food", "table", "2040-02-01", "2040-02-01");
  reservation("outside-generic-room", "event", "2041-02-01", "2041-02-02", "approved", [room.id]);
  const task = (id, type, due, relatedType = "", relatedId = "") => raw.prepare(`INSERT INTO daily_tasks
    (id, title, task_type, due_date, related_type, related_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, id, type, due, relatedType, relatedId, now, now);
  for (let index = 0; index < 85; index++) task(`early-${index}`, "manual_pension", "2000-01-01");
  task("outside-task", "manual_pension", "2040-01-01");
  task("outside-related", "note", "2040-01-01", "reservation", "outside-room");
  task("outside-food-task", "manual_restaurant", "2040-01-01");
  task("missing-related", "note", "2040-01-01", "reservation", "gone");
  assert.ok(!database.getDashboardData().reservations.some(item => item.id === "outside-room"));
  assert.ok(!database.getDashboardData().dailyTasks.some(item => item.id === "outside-task"));
  const handlers = new Map();
  const facade = new Proxy(database, { get: (target, key) => {
    if (key === "getDashboardData") return () => assert.fail("IPC scope must not use dashboard projection");
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  const options = {
    getDatabase: () => facade, assertUnlocked() {}, finalizeOperationMutation: value => value,
    assertCapability: capability => assert.ok(database.getEnabledBusinessCapabilities().includes(capability), "capability denied"),
    assertReservationType: (type, roomIds, tableIds) => assert.ok(shared.isReservationTypeAvailable(database.getEnabledBusinessCapabilities(), type, { roomIds, tableIds }), "reservation capability denied"),
    assertTaskScope: (type, relation, reservationType, roomIds, tableIds) => assert.ok(shared.isOperationalTaskAvailable(database.getEnabledBusinessCapabilities(), type, relation, reservationType, { roomIds, tableIds }), "task capability denied")
  };
  for (const [file, register] of [["reservation", "registerReservationIpcHandlers"], ["daily-task", "registerDailyTaskIpcHandlers"]]) {
    const exports = {};
    runInNewContext(readFileSync(resolve(`apps/desktop-app/dist-electron/ipc/${file}-ipc.js`), "utf8"), { exports,
      require: name => name === "electron" ? { ipcMain: { handle: (channel, action) => handlers.set(channel, action) } } : require(name) });
    exports[register](options);
  }
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
  setBusinessCapability(database.databasePath, { capability: C.ACCOMMODATION_RESERVATIONS, enabled: false });
  const beforeReservation = raw.prepare("SELECT * FROM reservations WHERE id='outside-room'").get();
  assert.throws(() => invoke("reservation:updateStatus", { reservationId: "outside-room", status: "cancelled" }), /capability denied/);
  assert.deepEqual(raw.prepare("SELECT * FROM reservations WHERE id='outside-room'").get(), beforeReservation);
  assert.throws(() => invoke("reservation:updateStatus", { reservationId: "history-0", status: "cancelled" }), /capability denied/);
  assert.throws(() => invoke("reservation:updateStatus", { reservationId: "outside-generic-room", status: "cancelled" }), /capability denied/, "persisted resource context remains authoritative");
  assert.equal(invoke("reservation:updateStatus", { reservationId: "outside-food", status: "cancelled" }).ok, true);
  assert.equal(invoke("reservation:updateStatus", { reservationId: "missing", status: "cancelled" }).ok, false);
  for (const capability of [C.ACCOMMODATION_FOLIO, C.ACCOMMODATION_STAYS, C.ACCOMMODATION_ROOMS]) {
    setBusinessCapability(database.databasePath, { capability, enabled: false });
  }
  assert.ok(database.getEnabledBusinessCapabilities().includes(C.TASKS));
  assert.ok(database.getEnabledBusinessCapabilities().includes(C.FOOD_TABLES));
  const taskSnapshot = () => raw.prepare("SELECT * FROM daily_tasks ORDER BY id").all();
  const beforeTasks = taskSnapshot();
  for (const id of ["outside-task", " outside-task ", "outside-related", "early-0"]) {
    assert.throws(() => invoke("dailyTask:updateStatus", { taskId: id, status: "done" }), /capability denied/);
    assert.throws(() => invoke("dailyTask:delete", id), /capability denied/);
    for (const taskType of ["note", "manual_restaurant"]) assert.throws(() => invoke("dailyTask:save", { id, title: "spoof", taskType }), /capability denied/);
  }
  assert.deepEqual(taskSnapshot(), beforeTasks, "all rejected task mutations leave persistence unchanged");
  assert.equal(invoke("dailyTask:updateStatus", { taskId: "outside-food-task", status: "done" }).ok, true);
  assert.equal(invoke("dailyTask:save", { title: "new food", taskType: "manual_restaurant" }).ok, true);
  assert.equal(invoke("dailyTask:save", { id: "missing", title: "missing", taskType: "manual_restaurant" }).ok, false);
  assert.equal(invoke("dailyTask:delete", "missing").ok, false);
  assert.equal(invoke("dailyTask:updateStatus", { taskId: "missing", status: "done" }).ok, false);
  assert.equal(invoke("dailyTask:updateStatus", { taskId: "missing-related", status: "done" }).ok, false, "missing relation cannot become core scope");

  applyBusinessProfileCapabilities(database.databasePath, "pension_restaurant", { preserveUserOverrides: false });
  assert.equal(invoke("reservation:updateStatus", { reservationId: "outside-room", status: "approved" }).ok, true);
  assert.equal(invoke("reservation:updateStatus", { reservationId: "history-0", status: "approved" }).ok, true);
  assert.equal(invoke("dailyTask:updateStatus", { taskId: "outside-task", status: "done" }).ok, true);
  assert.equal(invoke("dailyTask:save", { id: "outside-task", title: "enabled update", taskType: "manual_pension" }).ok, true);
  assert.equal(invoke("dailyTask:delete", "early-0").ok, true);
  const booking = (roomId, startDate, endDate, extra = {}) => database.saveManualReservation({ customerId: "customer", roomId, startDate, endDate, guestCount: 1, notes: "", ...extra });
  const beforeCount = raw.prepare("SELECT COUNT(*) n FROM reservations").get().n;
  const conflict = booking(room.id, "2040-01-02", "2040-01-04");
  assert.equal(conflict.ok, false); assert.match(conflict.message, /başka bir aktif rezervasyona/);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM reservations").get().n, beforeCount);
  assert.equal(booking(room.id, "2040-01-05", "2040-01-06").ok, true, "touching ranges are not overlapping");
  assert.equal(booking(otherRoom.id, "2040-01-02", "2040-01-04").ok, true, "other room is independent");
  assert.equal(booking(room.id, "2040-01-01", "2040-01-05", { reservationId: "outside-room", customerId: "other-customer" }).ok, true, "edit excludes self");
  assert.equal(findConflictingRoomReservation(raw, room.id, "customer", "2040-01-02", "2040-01-04", "outside-room"), "");
  const stay = database.assignCustomerToRoom({ customerId: "customer", roomId: room.id, checkInDate: "2040-01-02", checkOutDate: "2040-01-04", guestCount: 1, status: "planned", notes: "" });
  assert.equal(stay.ok, false); assert.match(stay.message, /rezervasyonuna bağlı/);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM customer_room_stays").get().n, 0);
  for (const status of ["cancelled", "rejected", "completed"]) {
    raw.prepare("UPDATE reservations SET status=? WHERE id='outside-room'").run(status);
    assert.equal(hasConflictingRoomReservation(raw, room.id, "2040-01-02", "2040-01-04", ""), false);
    assert.equal(findConflictingRoomReservation(raw, room.id, "customer", "2040-01-02", "2040-01-04"), "");
  }
  assert.equal(database.assignCustomerToRoom({ customerId: "customer", roomId: room.id, checkInDate: "2040-01-02", checkOutDate: "2040-01-04", guestCount: 1, status: "planned", notes: "" }).ok, true);
  // Preserve legacy unlinked-Stay same-customer exemption and missing-end policies.
  reservation("open-end", "room", "2050-01-01", "", "pending", [room.id]);
  assert.equal(hasConflictingRoomReservation(raw, room.id, "2050-01-02", "2050-01-03", ""), false);
  assert.notEqual(findConflictingRoomReservation(raw, room.id, "customer", "2050-01-02", "2050-01-03"), "");
  assert.equal(findConflictingRoomReservation(raw, room.id, "other-customer", "2050-01-02", "2050-01-03"), "");
  assert.notEqual(findConflictingRoomReservation(raw, room.id, "other-customer", "2050-01-02", "2050-01-03", ""), "");
  console.log("Persisted scope/conflicts: 85+ bounded-out records, wrong-domain/spoof rejection, allowed paths, full SQL conflicts and legacy date semantics passed.");
} finally { raw?.close(); cleanup(); }
