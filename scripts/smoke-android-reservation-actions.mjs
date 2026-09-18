import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";

const { database, cleanup } = createTemporaryDesktopDatabase("yardimci-android-reservation-");

const DEVICE_ID = "android-reservation-smoke";

try {
  database.initialize();
  const setupResult = database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Android Reservation Smoke",
    phone: "+905550003030",
    whatsapp: "+905550003030",
    syncSecret: "android-reservation-secret-123",
    servicePreferences: { whatsapp: false, android: true },
    initialCounts: { rooms: 2, tables: 2 }
  }));
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);

  registerAdminDevice(database);
  const customerId = createCustomer(database);
  const initial = database.getDashboardData();
  const rooms = initial.rooms.filter((room) => room.isActive && room.status === "available");
  const tables = initial.tables.filter((table) => table.isActive && table.status === "available");
  assert.ok(rooms.length >= 2, "Smoke testi için iki boş oda gerekli");
  assert.ok(tables.length >= 2, "Smoke testi için iki boş masa gerekli");

  const roomCreateId = "android_room_reservation_create_001";
  const roomCreated = database.applyAndroidAction(action(roomCreateId, "reservation_room_create", {
    customer_id: customerId,
    room_id: rooms[0].id,
    start_date: "2036-04-10",
    end_date: "2036-04-12",
    guest_count: 2,
    notes: "Android oda rezervasyonu"
  }));
  assert.equal(roomCreated.ok, true, roomCreated.message);

  let dashboard = database.getDashboardData();
  const roomReservation = dashboard.reservations.find(
    (reservation) => reservation.customerId === customerId && reservation.startDate === "2036-04-10"
  );
  assert.ok(roomReservation, "Android oda rezervasyonu dashboard'a düşmeli");
  assert.equal(roomReservation.reservationType, "room");
  assert.deepEqual(roomReservation.roomIds, [rooms[0].id]);
  assert.equal(roomReservation.requestId, `android:${roomCreateId}`);
  assert.equal(dashboard.rooms.find((room) => room.id === rooms[0].id)?.status, "reserved");

  const repeated = database.applyAndroidAction(action(roomCreateId, "reservation_room_create", {
    customer_id: customerId,
    room_id: rooms[0].id,
    start_date: "2036-04-10",
    end_date: "2036-04-12",
    guest_count: 2,
    notes: "Tekrar gönderim"
  }));
  assert.equal(repeated.ok, true);
  assert.equal(repeated.alreadyApplied, true, "Aynı action receipt ikinci kez uygulanmamalı");
  dashboard = database.getDashboardData();
  assert.equal(
    dashboard.reservations.filter((reservation) => reservation.requestId === `android:${roomCreateId}`).length,
    1,
    "Aynı Android create action tek rezervasyon üretmeli"
  );

  const roomConflict = database.applyAndroidAction(action("android_room_reservation_conflict_001", "reservation_room_create", {
    customer_id: customerId,
    room_id: rooms[0].id,
    start_date: "2036-04-11",
    end_date: "2036-04-13",
    guest_count: 1,
    notes: "Çakışma"
  }));
  assert.equal(roomConflict.ok, false, "Çakışan oda rezervasyonu reddedilmeli");

  const roomUpdated = database.applyAndroidAction(action("android_room_reservation_update_001", "reservation_room_update", {
    reservation_id: roomReservation.id,
    expected_updated_at: roomReservation.updatedAt,
    room_id: rooms[1].id,
    start_date: "2036-04-10",
    end_date: "2036-04-13",
    guest_count: 2,
    notes: "Android oda değişikliği"
  }));
  assert.equal(roomUpdated.ok, true, roomUpdated.message);
  dashboard = database.getDashboardData();
  const movedRoomReservation = dashboard.reservations.find((reservation) => reservation.id === roomReservation.id);
  assert.deepEqual(movedRoomReservation?.roomIds, [rooms[1].id]);
  assert.equal(movedRoomReservation?.endDate, "2036-04-13");
  assert.equal(dashboard.rooms.find((room) => room.id === rooms[0].id)?.status, "available");
  assert.equal(dashboard.rooms.find((room) => room.id === rooms[1].id)?.status, "reserved");

  const tableCreateId = "android_table_reservation_create_001";
  const tableCreated = database.applyAndroidAction(action(tableCreateId, "reservation_table_create", {
    customer_id: customerId,
    table_id: tables[0].id,
    date: "2036-05-20",
    time: "19:30",
    guest_count: 2,
    notes: "Android masa rezervasyonu"
  }));
  assert.equal(tableCreated.ok, true, tableCreated.message);
  dashboard = database.getDashboardData();
  const tableReservation = dashboard.reservations.find(
    (reservation) => reservation.requestId === `android:${tableCreateId}`
  );
  assert.ok(tableReservation, "Android masa rezervasyonu dashboard'a düşmeli");
  assert.equal(tableReservation.reservationType, "table");
  assert.deepEqual(tableReservation.tableIds, [tables[0].id]);
  assert.equal(tableReservation.time, "19:30");

  const tableConflict = database.applyAndroidAction(action("android_table_reservation_conflict_001", "reservation_table_create", {
    customer_id: customerId,
    table_id: tables[0].id,
    date: "2036-05-20",
    time: "19:30",
    guest_count: 1,
    notes: "Çakışma"
  }));
  assert.equal(tableConflict.ok, false, "Aynı masa/tarih/saat çakışması reddedilmeli");

  const tableUpdateGuestCount = Math.max(
    1,
    Math.min(3, Number(tables[1].capacity ?? 0) > 0 ? Number(tables[1].capacity) : 3)
  );
  const tableUpdated = database.applyAndroidAction(action("android_table_reservation_update_001", "reservation_table_update", {
    reservation_id: tableReservation.id,
    expected_updated_at: tableReservation.updatedAt,
    table_id: tables[1].id,
    date: "2036-05-20",
    time: "20:00",
    guest_count: tableUpdateGuestCount,
    notes: "Masa ve saat değişti"
  }));
  assert.equal(tableUpdated.ok, true, tableUpdated.message);
  dashboard = database.getDashboardData();
  const movedTableReservation = dashboard.reservations.find((reservation) => reservation.id === tableReservation.id);
  assert.deepEqual(movedTableReservation?.tableIds, [tables[1].id]);
  assert.equal(movedTableReservation?.time, "20:00");
  assert.equal(movedTableReservation?.guestCount, tableUpdateGuestCount);

  const staleUpdate = database.applyAndroidAction(action("android_table_reservation_stale_001", "reservation_table_update", {
    reservation_id: tableReservation.id,
    expected_updated_at: tableReservation.updatedAt,
    table_id: tables[0].id,
    date: "2036-05-20",
    time: "21:00",
    guest_count: 2,
    notes: "Eski snapshot"
  }));
  assert.equal(staleUpdate.ok, false, "Eski updated_at ile Android düzenleme reddedilmeli");
  assert.match(staleUpdate.message, /yenile|değiş/i);

  const sqlite = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const receiptCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM android_action_receipts WHERE action_type LIKE 'reservation_%'").get()?.count ?? 0
    );
    assert.ok(receiptCount >= 4, "Başarılı rezervasyon action receipt kayıtları eksik");
    const androidEventCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM events WHERE actor_type = 'android' AND type IN ('reservation.created', 'reservation.updated')").get()?.count ?? 0
    );
    assert.ok(androidEventCount >= 4, "Android rezervasyon event kayıtları eksik");
    assert.equal(String(sqlite.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    sqlite.close();
  }

  console.log("android-reservation-actions-smoke-ok: approved device, room/table create, update, conflicts, stale version and idempotency verified");
} finally {
  cleanup();
}

function registerAdminDevice(database) {
  database.upsertAndroidDeviceSightings([{
    device_id: DEVICE_ID,
    device_name: "Reservation Smoke",
    app_version: "smoke",
    first_seen_at: "2026-08-11T12:00:00.000Z",
    last_seen_at: "2026-08-11T12:00:00.000Z"
  }]);
  const roleResult = database.setAndroidDeviceRole(DEVICE_ID, "admin");
  assert.equal(roleResult.ok, true, roleResult.message);
  const approvalResult = database.setAndroidDeviceActive(DEVICE_ID, true);
  assert.equal(approvalResult.ok, true, approvalResult.message);
}

function createCustomer(database) {
  const result = database.saveCustomer({
    fullName: "Android Rezervasyon Müşterisi",
    phone: "+905551234567",
    email: "",
    notes: "",
    tags: [],
    identityType: "",
    identityNumber: "",
    nationality: "",
    birthDate: "",
    gender: "",
    documentSerialNumber: "",
    documentExpiryDate: "",
    birthPlace: "",
    motherName: "",
    fatherName: "",
    issuingAuthority: "",
    address: ""
  });
  assert.equal(result.ok, true, result.message);
  return result.savedId;
}

function action(id, actionType, payload) {
  return {
    id,
    action_type: actionType,
    payload,
    created_at: "2026-08-11T12:00:00.000Z",
    device_id: DEVICE_ID,
    device_name: "Reservation Smoke",
    app_version: "smoke",
    status: "pending",
    error_message: ""
  };
}
