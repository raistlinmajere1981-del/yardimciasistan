import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

const { database, cleanup } = createTemporaryDesktopDatabase("yardimci-restaurant-reservation-");

try {
  database.initialize();
  const setupResult = database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Restoran Rezervasyon Test İşletmesi",
    phone: "+905550002022",
    whatsapp: "+905550002022",
    syncSecret: "restaurant-reservation-secret",
    servicePreferences: { whatsapp: true, android: true },
  }));
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  seedSmokeBusinessLayout(database.databasePath, {
    tableCategories: [{ name: "Rezervasyon Salonu", tableCount: 2 }]
  });

  const customerResult = database.saveCustomer({
    fullName: "Restoran Test Müşterisi",
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
  assert.equal(customerResult.ok, true, customerResult.message);

  const dashboard = database.getDashboardData();
  const table = dashboard.tables.find((item) => item.isActive && item.capacity >= 2);
  assert.ok(table, "Smoke test requires one active restaurant table with capacity >= 2");

  const created = database.saveManualRestaurantReservation({
    customerId: customerResult.savedId,
    tableId: table.id,
    date: "2035-10-10",
    time: "19:00",
    guestCount: 2,
    notes: "Telefonla alınan masa rezervasyonu."
  });
  assert.equal(created.ok, true, created.message);
  const reservation = created.dashboardData.reservations.find(
    (item) => item.customerId === customerResult.savedId
      && item.reservationType === "table"
      && item.startDate === "2035-10-10"
      && item.time === "19:00"
  );
  assert.ok(reservation, "Restaurant reservation must appear in dashboard data");
  assert.match(reservation.requestId, /^manual:/);
  assert.equal(reservation.status, "approved");
  assert.equal(reservation.endDate, "2035-10-10");
  assert.deepEqual(reservation.tableIds, [table.id]);
  assert.equal(reservation.guestCount, 2);
  assert.equal(reservation.notes, "Telefonla alınan masa rezervasyonu.");

  const conflict = database.saveManualRestaurantReservation({
    customerId: customerResult.savedId,
    tableId: table.id,
    date: "2035-10-10",
    time: "19:00",
    guestCount: 1,
    notes: "Çakışma testi"
  });
  assert.equal(conflict.ok, false, "Same table/date/time reservation must be rejected");

  const differentTime = database.saveManualRestaurantReservation({
    customerId: customerResult.savedId,
    tableId: table.id,
    date: "2035-10-10",
    time: "21:00",
    guestCount: 1,
    notes: "Farklı saat"
  });
  assert.equal(differentTime.ok, true, differentTime.message);

  const unassigned = database.saveManualRestaurantReservation({
    customerId: customerResult.savedId,
    date: "2035-10-11",
    time: "20:00",
    guestCount: 3,
    notes: "Masa sonra atanacak"
  });
  assert.equal(unassigned.ok, true, unassigned.message);
  const unassignedReservation = unassigned.dashboardData.reservations.find(
    (item) => item.customerId === customerResult.savedId && item.startDate === "2035-10-11" && item.time === "20:00"
  );
  assert.ok(unassignedReservation);
  assert.deepEqual(unassignedReservation.tableIds, []);

  const overCapacity = database.saveManualRestaurantReservation({
    customerId: customerResult.savedId,
    tableId: table.id,
    date: "2035-10-12",
    time: "19:30",
    guestCount: table.capacity + 1,
    notes: "Kapasite testi"
  });
  assert.equal(overCapacity.ok, false, "Table capacity must be enforced");

  const verify = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const row = verify.prepare("SELECT reservation_type, start_date, end_date, time, table_ids_json FROM reservations WHERE id = ?").get(reservation.id);
    assert.equal(row.reservation_type, "table");
    assert.equal(row.start_date, "2035-10-10");
    assert.equal(row.end_date, "2035-10-10");
    assert.equal(row.time, "19:00");
    assert.deepEqual(JSON.parse(String(row.table_ids_json)), [table.id]);
    const eventCount = Number(
      verify.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'reservation.created' AND entity_id = ?").get(reservation.id)?.count ?? 0
    );
    assert.ok(eventCount >= 1, "reservation.created event missing for restaurant reservation");
    assert.equal(String(verify.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    verify.close();
  }

  console.log("manual-restaurant-reservation-smoke-ok: create, quick customer path, table assignment, conflict and capacity verified");
} finally {
  cleanup();
}
