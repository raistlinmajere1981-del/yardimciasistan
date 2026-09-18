import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const { database, cleanup } = createTemporaryDesktopDatabase("yardimci-manual-reservation-");

try {
  database.initialize();
  const setupResult = database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Manuel Rezervasyon Test İşletmesi",
    phone: "+905550002021",
    whatsapp: "+905550002021",
    syncSecret: "manual-reservation-secret",
    servicePreferences: { whatsapp: true, android: true },
    initialCounts: { rooms: 3, tables: 0 }
  }));
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  const quickCustomer = database.saveCustomer({
    fullName: "Hızlı Rezervasyon Müşterisi",
    phone: "+905551112233",
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
  assert.equal(quickCustomer.ok, true, quickCustomer.message);
  const customerId = quickCustomer.savedId;
  assert.ok(customerId, "Quick customer must return savedId");
  assert.equal(
    quickCustomer.dashboardData.customers.find((customer) => customer.id === customerId)?.fullName,
    "Hızlı Rezervasyon Müşterisi"
  );

  const quickCreatorSource = readFileSync(
    join(process.cwd(), "apps", "desktop-app", "src", "components", "operations", "QuickCustomerCreator.tsx"),
    "utf8"
  );
  const reservationEditorSource = readFileSync(
    join(process.cwd(), "apps", "desktop-app", "src", "components", "operations", "ManualReservationEditor.tsx"),
    "utf8"
  );
  const routerSource = readFileSync(
    join(process.cwd(), "apps", "desktop-app", "src", "components", "app", "DesktopWorkspaceRouter.tsx"),
    "utf8"
  );
  assert.match(quickCreatorSource, /Yeni Müşteri Ekle/);
  assert.match(quickCreatorSource, /Kaydet ve Seç/);
  assert.match(reservationEditorSource, /onSaveCustomer/);
  assert.match(routerSource, /onSaveCustomer=\{handleSaveCustomer\}/);

  const initialDashboard = database.getDashboardData();
  const usableRooms = initialDashboard.rooms.filter((room) => {
    if (!room.isActive || room.status !== "available") return false;
    const activeReservation = initialDashboard.reservations.some(
      (reservation) => ["pending", "approved"].includes(reservation.status) && reservation.roomIds.includes(room.id)
    );
    const activeStay = initialDashboard.customerRoomStays.some(
      (stay) => ["planned", "checked_in"].includes(stay.status) && stay.roomId === room.id
    );
    return !activeReservation && !activeStay;
  });
  assert.ok(usableRooms.length >= 2, "Smoke test requires at least two usable rooms");
  const [firstRoom, secondRoom] = usableRooms;

  const created = database.saveManualReservation({
    customerId: customerId,
    startDate: "2035-09-01",
    endDate: "2035-09-03",
    guestCount: 2,
    notes: "Telefonla alınan test rezervasyonu."
  });
  assert.equal(created.ok, true, created.message);
  const reservation = created.dashboardData.reservations.find(
    (item) => item.customerId === customerId && item.startDate === "2035-09-01"
  );
  assert.ok(reservation, "Manual reservation must appear in dashboard data");
  assert.match(reservation.requestId, /^manual:/);
  assert.equal(reservation.status, "approved");
  assert.equal(reservation.reservationType, "room");
  assert.equal(reservation.guestCount, 2);
  assert.equal(reservation.notes, "Telefonla alınan test rezervasyonu.");

  const assigned = database.saveManualReservation({
    reservationId: reservation.id,
    customerId: customerId,
    roomId: firstRoom.id,
    startDate: "2035-09-02",
    endDate: "2035-09-05",
    guestCount: 2,
    notes: "Tarih ve oda güncellendi."
  });
  assert.equal(assigned.ok, true, assigned.message);
  const assignedReservation = assigned.dashboardData.reservations.find((item) => item.id === reservation.id);
  assert.ok(assignedReservation, "Updated reservation must remain in dashboard data");
  assert.deepEqual(assignedReservation.roomIds, [firstRoom.id]);
  assert.equal(assignedReservation.startDate, "2035-09-02");
  assert.equal(assignedReservation.endDate, "2035-09-05");
  assert.equal(assignedReservation.notes, "Tarih ve oda güncellendi.");
  assert.equal(assigned.dashboardData.rooms.find((room) => room.id === firstRoom.id)?.status, "reserved");

  const conflicting = database.saveManualReservation({
    customerId: customerId,
    roomId: firstRoom.id,
    startDate: "2035-09-03",
    endDate: "2035-09-04",
    guestCount: 1,
    notes: "Çakışma testi"
  });
  assert.equal(conflicting.ok, false, "Overlapping reservation must be rejected");

  const moved = database.saveManualReservation({
    reservationId: reservation.id,
    customerId: customerId,
    roomId: secondRoom.id,
    startDate: "2035-09-02",
    endDate: "2035-09-05",
    guestCount: 2,
    notes: "Oda değiştirildi."
  });
  assert.equal(moved.ok, true, moved.message);
  const movedReservation = moved.dashboardData.reservations.find((item) => item.id === reservation.id);
  assert.ok(movedReservation, "Moved reservation must remain in dashboard data");
  assert.deepEqual(movedReservation.roomIds, [secondRoom.id]);
  assert.equal(movedReservation.guestCount, 2);
  assert.equal(moved.dashboardData.rooms.find((room) => room.id === secondRoom.id)?.status, "reserved");
  assert.equal(moved.dashboardData.rooms.find((room) => room.id === firstRoom.id)?.status, "available");

  const invalidRange = database.saveManualReservation({
    customerId: customerId,
    startDate: "2035-09-03",
    endDate: "2035-09-03",
    guestCount: 1,
    notes: ""
  });
  assert.equal(invalidRange.ok, false);

  const verify = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const row = verify.prepare("SELECT request_id, status, reservation_type, room_ids_json FROM reservations WHERE id = ?").get(reservation.id);
    assert.equal(row.request_id, `manual:${reservation.id}`);
    assert.equal(row.status, "approved");
    assert.equal(row.reservation_type, "room");
    assert.deepEqual(JSON.parse(String(row.room_ids_json)), [secondRoom.id]);
    const createdEventCount = Number(
      verify.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'reservation.created' AND entity_id = ?").get(reservation.id)?.count ?? 0
    );
    const updatedEventCount = Number(
      verify.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'reservation.updated' AND entity_id = ?").get(reservation.id)?.count ?? 0
    );
    assert.ok(createdEventCount >= 1, "reservation.created event missing");
    assert.ok(updatedEventCount >= 2, "reservation.updated events missing");
    assert.equal(String(verify.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    verify.close();
  }

  console.log("manual-reservation-smoke-ok: quick customer, create, edit, room assign/change, overlap validation and events verified");
} finally {
  cleanup();
}
