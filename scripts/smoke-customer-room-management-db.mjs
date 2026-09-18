import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

const { database, cleanup } = createTemporaryDesktopDatabase("yardimci-customer-room-");

try {
  database.initialize();

  const setupResult = database.saveInitialSetup(createSmokeSetupInput({
    businessName: "Customer Room Test İşletmesi",
    phone: "+905550001000",
    whatsapp: "+905550001000",
    syncSecret: "customer-room-secret-123",
    servicePreferences: { whatsapp: false, android: true },
    initialCounts: { rooms: 2, tables: 0 },
    tableCategories: []
  }));
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);

  const migrationCheck = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const customerColumns = migrationCheck.prepare("PRAGMA table_info(customers)").all().map((row) => row.name);
    assert.ok(customerColumns.includes("identity_number"));
    assert.ok(customerColumns.includes("document_expiry_date"));
    assert.equal(
      migrationCheck.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'customer_room_stays'").get().count,
      1
    );
    assert.equal(String(migrationCheck.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    migrationCheck.close();
  }

  const first = database.saveCustomer(customerInput({
    fullName: "Ayşe Yönetim Testi",
    phone: "+905550001001",
    identityNumber: "10000000146"
  }));
  assert.equal(first.ok, true, first.message);
  const firstCustomer = first.dashboardData.customers.find((customer) => customer.id === first.savedId);
  assert.ok(firstCustomer);
  assert.equal(firstCustomer.identityType, "tc_identity_card");
  assert.equal(firstCustomer.identityNumber, "10000000146");
  assert.equal(firstCustomer.birthDate, "1990-05-12");
  assert.equal(firstCustomer.documentSerialNumber, "A12B34567");

  const duplicateIdentity = database.saveCustomer(customerInput({
    fullName: "Kimlik Çakışması",
    phone: "+905550001002",
    identityNumber: "10000000146"
  }));
  assert.equal(duplicateIdentity.ok, false);
  assert.match(duplicateIdentity.message, /kimlik numarası/i);

  const second = database.saveCustomer(customerInput({
    fullName: "Mehmet Çakışma Testi",
    phone: "+905550001003",
    identityType: "passport",
    identityNumber: "P12345678"
  }));
  assert.equal(second.ok, true, second.message);

  const room = database.getDashboardData().rooms.find((candidate) => candidate.isActive && candidate.capacity > 0);
  assert.ok(room);
  const tooManyGuests = database.assignCustomerToRoom({
    customerId: first.savedId,
    roomId: room.id,
    checkInDate: "2035-05-10",
    checkOutDate: "2035-05-12",
    guestCount: room.capacity + 1,
    notes: "",
    status: "planned"
  });
  assert.equal(tooManyGuests.ok, false);
  assert.match(tooManyGuests.message, /kapasitesi/i);

  const assignment = database.assignCustomerToRoom({
    customerId: first.savedId,
    roomId: room.id,
    checkInDate: "2035-05-10",
    checkOutDate: "2035-05-12",
    guestCount: 1,
    notes: "Sessiz oda tercih ediyor.",
    status: "planned"
  });
  assert.equal(assignment.ok, true, assignment.message);
  let stay = assignment.dashboardData.customerRoomStays.find((candidate) => candidate.id === assignment.savedId);
  assert.ok(stay);
  assert.equal(stay.customerId, first.savedId);
  assert.equal(stay.roomId, room.id);
  assert.equal(stay.status, "planned");
  assert.equal(assignment.dashboardData.rooms.find((candidate) => candidate.id === room.id)?.status, "reserved");

  const overlap = database.assignCustomerToRoom({
    customerId: second.savedId,
    roomId: room.id,
    checkInDate: "2035-05-11",
    checkOutDate: "2035-05-13",
    guestCount: 1,
    notes: "",
    status: "planned"
  });
  assert.equal(overlap.ok, false);
  assert.match(overlap.message, /aktif müşteri kaydı/i);

  const activeDelete = database.deleteCustomer(first.savedId);
  assert.equal(activeDelete.ok, false);
  assert.match(activeDelete.message, /aktif konaklama/i);

  const checkIn = database.updateCustomerRoomStayStatus({ stayId: stay.id, status: "checked_in" });
  assert.equal(checkIn.ok, true, checkIn.message);
  stay = checkIn.dashboardData.customerRoomStays.find((candidate) => candidate.id === stay.id);
  assert.equal(stay?.status, "checked_in");
  assert.equal(checkIn.dashboardData.rooms.find((candidate) => candidate.id === room.id)?.status, "occupied");

  const checkOut = database.updateCustomerRoomStayStatus({ stayId: stay.id, status: "checked_out" });
  assert.equal(checkOut.ok, true, checkOut.message);
  stay = checkOut.dashboardData.customerRoomStays.find((candidate) => candidate.id === stay.id);
  assert.equal(stay?.status, "checked_out");
  assert.ok(stay?.checkedOutAt);
  assert.equal(checkOut.dashboardData.rooms.find((candidate) => candidate.id === room.id)?.status, "cleaning");

  const archivedCustomerDelete = database.deleteCustomer(first.savedId);
  assert.equal(archivedCustomerDelete.ok, true, archivedCustomerDelete.message);
  assert.equal(
    archivedCustomerDelete.dashboardData.customerRoomStays.some((candidate) => candidate.id === stay.id),
    true,
    "A completed stay must remain queryable after the customer card is soft-deleted"
  );

  const staffDeviceId = "android-customer-room-staff";
  database.upsertAndroidDeviceSightings([sighting(staffDeviceId)]);
  const pendingDevice = database.getAndroidDevices().find((device) => device.deviceId === staffDeviceId);
  assert.equal(pendingDevice?.isActive, false, "New Android devices must wait for desktop approval.");
  assert.equal(database.setAndroidDeviceActive(staffDeviceId, true).ok, true);

  const denied = database.applyAndroidAction(androidAction(
    "android_customer_create_staff_001",
    staffDeviceId,
    "customer_create",
    androidCustomerPayload("Personel Oluşturamaz", "+905550001010", "PSTAFF001")
  ));
  assert.equal(denied.ok, false);
  assert.match(denied.message, /yönetici|yetkisi yok/i);

  assert.equal(database.setAndroidDeviceRole(staffDeviceId, "admin").ok, true);
  const adminDevice = database.getAndroidDevices().find((device) => device.deviceId === staffDeviceId);
  assert.equal(adminDevice?.isActive, true);
  assert.ok(adminDevice?.permissions.includes("customer.manage"));
  assert.ok(adminDevice?.permissions.includes("room.assign_customer"));

  const androidCreate = database.applyAndroidAction(androidAction(
    "android_customer_create_admin_001",
    staffDeviceId,
    "customer_create",
    androidCustomerPayload("Android Yönetici Müşterisi", "+905550001011", "PADMIN001")
  ));
  assert.equal(androidCreate.ok, true, androidCreate.message);
  const androidCustomer = database.getDashboardData().customers.find((customer) => customer.phone === "+905550001011");
  assert.ok(androidCustomer);
  assert.equal(androidCustomer.identityNumber, "PADMIN001");

  const androidRoom = database.getDashboardData().rooms.find(
    (candidate) => candidate.id !== room.id && candidate.isActive && candidate.capacity > 0
  );
  assert.ok(androidRoom);
  const androidAssignment = database.applyAndroidAction(androidAction(
    "android_customer_room_assign_admin_001",
    staffDeviceId,
    "customer_room_assign",
    {
      customer_id: androidCustomer.id,
      room_id: androidRoom.id,
      check_in_date: "2036-06-01",
      check_out_date: "2036-06-03",
      guest_count: 1,
      notes: "Android yönetici ataması",
      status: "checked_in"
    }
  ));
  assert.equal(androidAssignment.ok, true, androidAssignment.message);
  const androidStay = database.getDashboardData().customerRoomStays.find(
    (candidate) => candidate.customerId === androidCustomer.id && candidate.roomId === androidRoom.id
  );
  assert.ok(androidStay);
  assert.equal(androidStay.source, "android");
  assert.equal(androidStay.status, "checked_in");

  const androidCheckout = database.applyAndroidAction(androidAction(
    "android_customer_room_checkout_admin_001",
    staffDeviceId,
    "customer_room_stay_status",
    {
      stay_id: androidStay.id,
      status: "checked_out",
      expected_updated_at: androidStay.updatedAt
    }
  ));
  assert.equal(androidCheckout.ok, true, androidCheckout.message);
  assert.equal(
    database.getDashboardData().customerRoomStays.find((candidate) => candidate.id === androidStay.id)?.status,
    "checked_out"
  );

  const sqlite = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    assert.ok(Number(sqlite.prepare("SELECT COUNT(*) AS count FROM customer_room_stays").get().count) >= 2);
    assert.ok(Number(sqlite.prepare("SELECT COUNT(*) AS count FROM customer_room_stays WHERE status = 'checked_out'").get().count) >= 2);
    assert.ok(Number(sqlite.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'customer.created'").get().count) >= 2);
    assert.ok(Number(sqlite.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'customer.room_assigned'").get().count) >= 2);
    assert.equal(String(sqlite.prepare("PRAGMA foreign_key_check").all().length), "0");
  } finally {
    sqlite.close();
  }

  console.log("customer-room-management-db-smoke-ok: manual cards, identity fields, capacity, overlap, archive, lifecycle and approved admin Android actions verified");
} finally {
  cleanup();
}

function customerInput(overrides = {}) {
  return {
    fullName: "Müşteri Testi",
    phone: "",
    email: "musteri@example.test",
    notes: "Manuel müşteri kartı smoke testi",
    tags: ["smoke", "pansiyon"],
    identityType: "tc_identity_card",
    identityNumber: "",
    nationality: "T.C.",
    birthDate: "1990-05-12",
    gender: "female",
    documentSerialNumber: "A12B34567",
    documentExpiryDate: "2030-05-12",
    birthPlace: "İstanbul",
    motherName: "Fatma",
    fatherName: "Mehmet",
    issuingAuthority: "T.C. İçişleri Bakanlığı",
    address: "Smoke test adresi",
    ...overrides
  };
}

function androidCustomerPayload(fullName, phone, identityNumber) {
  return {
    full_name: fullName,
    phone,
    email: "",
    notes: "Android yönetici smoke testi",
    tags: ["android"],
    identity_type: "passport",
    identity_number: identityNumber,
    nationality: "T.C.",
    birth_date: "",
    gender: "",
    document_serial_number: "",
    document_expiry_date: "",
    birth_place: "",
    mother_name: "",
    father_name: "",
    issuing_authority: "",
    address: ""
  };
}

function sighting(deviceId) {
  const now = new Date().toISOString();
  return {
    device_id: deviceId,
    device_name: "Customer Room Smoke",
    app_version: "0.1.2-smoke",
    first_seen_at: now,
    last_seen_at: now
  };
}

function androidAction(id, deviceId, actionType, payload) {
  const now = new Date().toISOString();
  return {
    id,
    action_type: actionType,
    payload,
    created_at: now,
    last_seen_at: now,
    device_id: deviceId,
    device_name: "Customer Room Smoke",
    app_version: "0.1.2-smoke",
    status: "pending",
    error_message: ""
  };
}
