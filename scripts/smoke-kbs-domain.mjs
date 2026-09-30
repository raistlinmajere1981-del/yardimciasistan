import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";

const require = createRequire(import.meta.url);
const { KbsDeliveryService } = require("../apps/desktop-app/dist-electron/kbs-delivery-service.js");
const {
  hasKbsIdentityMinimum,
  parseKbsIdentitySnapshot,
  selectJandarmaOperation
} = require("../apps/desktop-app/dist-electron/kbs-provider-adapter.js");

const { database, cleanup } = createTemporaryDesktopDatabase("kbs-domain-");
let db;

const ok = result => {
  assert.equal(result.ok, true, result.message);
  return result;
};

function customerInput(fullName, overrides = {}) {
  return {
    fullName,
    phone: "+905550000001",
    email: "",
    notes: "",
    tags: [],
    identityType: "tc_identity_card",
    identityNumber: "10000000146",
    nationality: "Türkiye",
    birthDate: "1991-04-23",
    gender: "male",
    documentSerialNumber: "A12B34567",
    documentExpiryDate: "2032-04-23",
    birthPlace: "Kastamonu",
    motherName: "Anne",
    fatherName: "Baba",
    issuingAuthority: "",
    address: "Cide",
    ...overrides
  };
}

function enableKbs(provider = "egm") {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO kbs_service_settings (
      id, enabled, provider, facility_code, username,
      authorized_identity_number, password_encrypted, created_at, updated_at
    ) VALUES ('primary', 1, ?, '123456', 'smoke-user', '10000000146', 'smoke-encrypted', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      enabled = 1,
      provider = excluded.provider,
      facility_code = excluded.facility_code,
      username = excluded.username,
      authorized_identity_number = excluded.authorized_identity_number,
      password_encrypted = excluded.password_encrypted,
      updated_at = excluded.updated_at
  `).run(provider, now, now);
}

try {
  database.initialize();
  ok(database.saveInitialSetup(createSmokeSetupInput({
    businessName: "KBS domain smoke",
    phone: "+905550000001",
    whatsapp: "+905550000001",
    syncSecret: "kbs-domain-smoke",
    servicePreferences: { whatsapp: false, android: false }
  })));
  seedSmokeBusinessLayout(database.databasePath, { roomCount: 3, roomCapacity: 2, nightlyPriceMinor: 10000 });

  db = new DatabaseSync(database.databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  const rooms = database.getDashboardData().rooms;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

  // KBS is opt-in: accommodation activity alone must not retain a KBS identity snapshot.
  const disabledCustomer = ok(database.saveCustomer(customerInput("KBS Kapalı Misafir"))).savedId;
  const disabledStay = ok(database.assignCustomerToRoom({
    customerId: disabledCustomer,
    roomId: rooms[0].id,
    checkInDate: today,
    checkOutDate: tomorrow,
    guestCount: 1,
    guestCustomerIds: [disabledCustomer],
    status: "checked_in",
    notes: "",
    requestId: "kbs-disabled"
  })).savedId;
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hospitality_notifications").get().n, 0);
  ok(database.checkoutStay(disabledStay));

  enableKbs("egm");

  const readyCustomer = ok(database.saveCustomer(customerInput("KBS Hazır Misafir", {
    identityNumber: "10000000214",
    phone: "+905550000002"
  }))).savedId;
  const readyStay = ok(database.assignCustomerToRoom({
    customerId: readyCustomer,
    roomId: rooms[1].id,
    checkInDate: today,
    checkOutDate: tomorrow,
    guestCount: 1,
    guestCustomerIds: [readyCustomer],
    status: "checked_in",
    notes: "",
    requestId: "kbs-ready"
  })).savedId;

  const arrival = db.prepare(
    "SELECT * FROM hospitality_notifications WHERE stay_id = ? AND kind = 'arrival' LIMIT 1"
  ).get(readyStay);
  assert.ok(arrival, "KBS-enabled check-in must queue an arrival notification");
  assert.equal(arrival.status, "pending");

  const snapshot = parseKbsIdentitySnapshot(arrival.identity_snapshot);
  assert.ok(snapshot);
  assert.equal(snapshot.customerId, readyCustomer);
  assert.equal(snapshot.phone, "+905550000002");
  assert.equal(snapshot.motherName, "Anne");
  assert.equal(snapshot.fatherName, "Baba");
  assert.equal(hasKbsIdentityMinimum(snapshot), true);

  let adapterCalls = 0;
  const waitingAdapter = {
    provider: "egm",
    send: async () => {
      adapterCalls += 1;
      return {
        ok: false,
        state: "waiting",
        provider: "egm",
        retryable: true,
        code: "smoke_waiting",
        message: "Smoke prerequisite bekliyor."
      };
    }
  };
  const waitingService = new KbsDeliveryService(db, [waitingAdapter]);
  const waiting = await waitingService.deliver(arrival.id, "egm");
  assert.equal(waiting.ok, false);
  assert.equal(waiting.state, "waiting");
  assert.equal(db.prepare("SELECT status FROM hospitality_notifications WHERE id = ?").get(arrival.id).status, "pending");

  const failedAdapter = {
    provider: "egm",
    send: async () => {
      adapterCalls += 1;
      return {
        ok: false,
        state: "failed",
        provider: "egm",
        retryable: true,
        code: "smoke_failure",
        message: "Smoke provider hatası."
      };
    }
  };
  const failedService = new KbsDeliveryService(db, [failedAdapter]);
  const failed = await failedService.deliver(arrival.id, "egm");
  assert.equal(failed.ok, false);
  assert.equal(failed.state, "failed");
  const failedRow = db.prepare("SELECT status, provider, provider_reference FROM hospitality_notifications WHERE id = ?").get(arrival.id);
  assert.equal(failedRow.status, "failed");
  assert.equal(failedRow.provider, "egm");
  assert.equal(failedRow.provider_reference, "smoke_failure");

  const sentAdapter = {
    provider: "egm",
    send: async () => {
      adapterCalls += 1;
      return {
        ok: true,
        state: "sent",
        provider: "egm",
        providerReference: "smoke-provider-reference",
        message: "Smoke KBS gönderildi."
      };
    }
  };
  const sentService = new KbsDeliveryService(db, [sentAdapter]);
  const sent = await sentService.deliver(arrival.id, "egm");
  assert.equal(sent.ok, true);
  assert.equal(sent.state, "sent");
  const sentRow = db.prepare("SELECT status, provider, provider_reference, sent_at FROM hospitality_notifications WHERE id = ?").get(arrival.id);
  assert.equal(sentRow.status, "sent");
  assert.equal(sentRow.provider, "egm");
  assert.equal(sentRow.provider_reference, "smoke-provider-reference");
  assert.ok(sentRow.sent_at);

  const callsBeforeRetry = adapterCalls;
  const duplicate = await sentService.deliver(arrival.id, "egm");
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.state, "already_sent");
  assert.equal(adapterCalls, callsBeforeRetry, "Already-sent notifications must not hit the provider again");

  // Missing identity remains pending and does not call the provider.
  const incompleteCustomer = ok(database.saveCustomer(customerInput("Kimliği Eksik", {
    phone: "+905550000003",
    identityNumber: "",
    documentSerialNumber: "",
    birthDate: ""
  }))).savedId;
  const incompleteStay = ok(database.assignCustomerToRoom({
    customerId: incompleteCustomer,
    roomId: rooms[2].id,
    checkInDate: today,
    checkOutDate: tomorrow,
    guestCount: 1,
    guestCustomerIds: [incompleteCustomer],
    status: "checked_in",
    notes: "",
    requestId: "kbs-incomplete"
  })).savedId;
  const incompleteArrival = db.prepare(
    "SELECT * FROM hospitality_notifications WHERE stay_id = ? AND kind = 'arrival' LIMIT 1"
  ).get(incompleteStay);
  assert.ok(incompleteArrival);
  const beforeIncomplete = adapterCalls;
  const incomplete = await sentService.deliver(incompleteArrival.id, "egm");
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.state, "waiting");
  assert.equal(incomplete.code, "identity_incomplete");
  assert.equal(adapterCalls, beforeIncomplete);
  assert.equal(db.prepare("SELECT status FROM hospitality_notifications WHERE id = ?").get(incompleteArrival.id).status, "pending");

  // Jandarma: 11-digit TCK/YKN uses identity-number operations regardless of nationality.
  const yknSelection = selectJandarmaOperation({
    notificationId: "ykn",
    kind: "arrival",
    occurredAt: new Date().toISOString(),
    roomNumber: "102",
    identity: {
      ...snapshot,
      nationality: "Almanya",
      identityNumber: "99000000001",
      documentSerialNumber: "P1234567"
    }
  });
  assert.equal(yknSelection.ok, true);
  assert.equal(yknSelection.selection.operation, "MusteriKimlikNoGiris");
  assert.equal(yknSelection.selection.identityPath, "identity_number");

  const foreignSelection = selectJandarmaOperation({
    notificationId: "foreign",
    kind: "arrival",
    occurredAt: new Date().toISOString(),
    roomNumber: "102",
    identity: {
      ...snapshot,
      nationality: "Almanya",
      identityNumber: "",
      documentSerialNumber: "P1234567"
    }
  });
  assert.equal(foreignSelection.ok, true);
  assert.equal(foreignSelection.selection.operation, "MusteriYabanciGiris");
  assert.equal(foreignSelection.selection.identityPath, "foreign_document");

  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log("kbs-domain-smoke-ok");
} finally {
  db?.close();
  cleanup();
}
