import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";

const require = createRequire(import.meta.url);
const { KbsDeliveryService } = require("../apps/desktop-app/dist-electron/kbs-delivery-service.js");
const { EgmKbsProviderAdapter, JandarmaKbsProviderAdapter } = require("../apps/desktop-app/dist-electron/kbs-provider-adapters.js");
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
        submission: "rejected",
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

  const clone = (name) => {
    const id = `kbs-fence-${name}`;
    db.prepare(`INSERT INTO hospitality_notifications(id,guest_id,stay_id,room_id,kind,occurred_at,identity_snapshot,created_at)
      SELECT ?,guest_id,stay_id,room_id,kind,occurred_at,identity_snapshot,created_at FROM hospitality_notifications WHERE id=?`).run(id, arrival.id);
    return id;
  };
  const row = id => db.prepare("SELECT * FROM hospitality_notifications WHERE id=?").get(id);
  const sentResult = { ok: true, state: "sent", provider: "egm", providerReference: "fake-remote-receipt", message: "Fixture sent" };
  let submissions = 0;
  const fake = { provider: "egm", send: async input => { submissions++; assert.equal(db.isTransaction, false); assert.equal(row(input.notificationId).status, 'submission_unknown'); return sentResult; } };

  // A: durable preparation must succeed before any provider submission.
  const prepareFailure = clone('prepare-failure');
  db.exec(`CREATE TRIGGER fixture_kbs_prepare_failure BEFORE UPDATE OF status ON hospitality_notifications
    WHEN NEW.id='${prepareFailure}' AND NEW.status='submission_unknown' BEGIN SELECT RAISE(ABORT,'prepare failure'); END`);
  assert.equal((await new KbsDeliveryService(db, [fake]).deliver(prepareFailure, 'egm')).code, 'local_preparation_failed');
  assert.equal(submissions, 0); assert.equal(row(prepareFailure).status, 'pending');
  db.exec('DROP TRIGGER fixture_kbs_prepare_failure');
  assert.equal((await new KbsDeliveryService(db, [fake]).deliver(prepareFailure, 'egm')).state, 'sent');
  assert.equal(submissions, 1); assert.equal(row(prepareFailure).provider_reference, sentResult.providerReference);

  // Reject a caller-owned transaction: its fence would not be durable before await.
  const nested = clone('nested-transaction'); db.exec('BEGIN IMMEDIATE');
  assert.equal((await new KbsDeliveryService(db, [fake]).deliver(nested, 'egm')).code, 'local_transaction_active');
  assert.equal(submissions, 1); db.exec('ROLLBACK'); assert.equal(row(nested).status, 'pending');

  // B/C: only explicit rejection allows retry, using the SAME logical notification id.
  const retry = clone('rejected'), identities = [];
  const retryAdapter = { provider: 'egm', send: async input => {
    identities.push(input.notificationId);
    return identities.length === 1 ? { ok: false, state: 'failed', submission: 'rejected', provider: 'egm', retryable: true, code: 'fixture_rejected', message: 'Rejected' } : sentResult;
  } };
  const retryService = new KbsDeliveryService(db, [retryAdapter]);
  assert.equal((await retryService.deliver(retry, 'egm')).state, 'failed'); assert.equal(row(retry).status, 'failed');
  ok(database.retryKbsNotification(retry));
  assert.equal((await retryService.deliver(retry, 'egm')).state, 'sent'); assert.deepEqual(identities, [retry, retry]);
  assert.equal((await retryService.deliver(retry, 'egm')).state, 'already_sent'); assert.equal(identities.length, 2);

  // D: success after remote I/O + ALL local result writes failing must retain the fence.
  const persistFailure = clone('persist-failure');
  db.exec(`CREATE TRIGGER fixture_kbs_result_failure BEFORE UPDATE OF status ON hospitality_notifications
    WHEN NEW.id='${persistFailure}' AND OLD.status='submission_unknown' BEGIN SELECT RAISE(ABORT,'result failure'); END`);
  const successfulButUnpersisted = await database.deliverKbsNotification(persistFailure, [fake]);
  assert.equal(successfulButUnpersisted.state, 'submission_unknown'); assert.equal(successfulButUnpersisted.retryable, false);
  assert.equal(successfulButUnpersisted.code, 'local_result_persistence_failed'); assert.equal(row(persistFailure).status, 'submission_unknown');
  assert.equal(database.retryKbsNotification(persistFailure).ok, false);
  const frozen = row(persistFailure).identity_snapshot;
  db.prepare('UPDATE customers SET full_name=? WHERE id=?').run('Updated after attempted submission', readyCustomer);
  assert.equal(row(persistFailure).identity_snapshot, frozen, 'Unknown submission payload must stay frozen');
  db.exec('DROP TRIGGER fixture_kbs_result_failure');
  const previousSubmissions = submissions, recoveryDb = new DatabaseSync(database.databasePath);
  try {
    const recovery = await new KbsDeliveryService(recoveryDb, [fake]).deliver(persistFailure, 'egm');
    assert.equal(recovery.state, 'submission_unknown'); assert.equal(submissions, previousSubmissions);
  } finally { recoveryDb.close(); }
  assert.equal(database.getDashboardData().hospitalityNotifications.find(n => n.id === persistFailure).status, 'submission_unknown');
  assert.equal(database.getDashboardData().kbsOverview.submissionUnknownCount, 1);
  ok(database.markKbsNotificationSentExternally(persistFailure));
  assert.equal((await database.deliverKbsNotification(persistFailure, [fake])).state, 'already_sent');
  assert.equal(submissions, previousSubmissions); assert.equal(row(persistFailure).provider_reference, 'external');

  // Unknown provider failures/exceptions do not authorize resubmission.
  for (const mode of ['exception', 'failure-without-proof']) {
    const id = clone(mode); let calls = 0;
    const adapter = { provider: 'egm', send: async () => {
      calls++; if (mode === 'exception') throw new Error('fake lost response');
      return { ok: false, state: 'failed', provider: 'egm', retryable: true, code: 'no_rejection_proof', message: 'Unknown' };
    } };
    assert.equal((await database.deliverKbsNotification(id, [adapter])).state, 'submission_unknown');
    assert.equal(row(id).status, 'submission_unknown'); assert.equal(database.retryKbsNotification(id).ok, false);
    assert.equal((await database.deliverKbsNotification(id, [adapter])).state, 'submission_unknown'); assert.equal(calls, 1);
  }

  // E: actual process exit after the durable fence, before any remote effect/result write.
  const crashed = clone('process-crash');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createRequire } from 'node:module'; import { DatabaseSync } from 'node:sqlite';
    const require = createRequire(import.meta.url);
    const { KbsDeliveryService } = require('./apps/desktop-app/dist-electron/kbs-delivery-service.js');
    const db = new DatabaseSync(process.argv[1]);
    await new KbsDeliveryService(db, [{provider:'egm',send:async () => process.exit(0)}]).deliver(process.argv[2], 'egm');
    process.exit(9);
  `, database.databasePath, crashed], { cwd: process.cwd(), encoding: 'utf8', timeout: 15000 });
  assert.equal(child.status, 0, child.stderr); assert.equal(row(crashed).status, 'submission_unknown');
  const crashRecovery = new DatabaseSync(database.databasePath);
  try { assert.equal((await new KbsDeliveryService(crashRecovery, [fake]).deliver(crashed, 'egm')).state, 'submission_unknown'); }
  finally { crashRecovery.close(); }
  assert.equal(submissions, previousSubmissions);

  // F/G: manual + background/second connection compete for the same canonical operation.
  const concurrent = clone('concurrent'); let entered, resolveSend, concurrentCalls = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const response = new Promise(resolve => { resolveSend = resolve; });
  const concurrentAdapter = { provider: 'egm', send: async input => {
    concurrentCalls++; assert.equal(input.notificationId, concurrent); entered(); return response;
  } };
  const manual = database.deliverKbsNotification(concurrent, [concurrentAdapter]); await started;
  const automaticDb = new DatabaseSync(database.databasePath);
  try {
    assert.equal(automaticDb.isTransaction, false);
    // A writer on another connection proves network work is outside the SQLite lock.
    automaticDb.prepare('UPDATE rooms SET updated_at=updated_at WHERE id=?').run(rooms[1].id);
    assert.equal((await new KbsDeliveryService(automaticDb, [concurrentAdapter]).deliver(concurrent, 'egm')).state, 'submission_unknown');
    assert.equal((await database.deliverKbsNotification(concurrent, [concurrentAdapter])).state, 'submission_unknown');
    assert.equal(database.retryKbsNotification(concurrent).ok, false);
    resolveSend(sentResult); assert.equal((await manual).state, 'sent'); assert.equal(concurrentCalls, 1);
  } finally { automaticDb.close(); }

  // External reconciliation during I/O wins; a late failure must not demote confirmed sent.
  for (const submission of ['rejected', 'unknown']) {
    const externalRace = clone(`external-race-${submission}`); let confirmStarted, returnFailure;
    const externalStarted = new Promise(resolve => { confirmStarted = resolve; });
    const externalResponse = new Promise(resolve => { returnFailure = resolve; });
    const externalFlight = database.deliverKbsNotification(externalRace, [{ provider: 'egm', send: async () => { confirmStarted(); return externalResponse; } }]);
    await externalStarted; ok(database.markKbsNotificationSentExternally(externalRace));
    returnFailure({ ok: false, state: 'failed', submission, provider: 'egm', retryable: true, message: 'Fixture failure' });
    assert.equal((await externalFlight).state, 'already_sent'); assert.equal(row(externalRace).status, 'sent');
  }

  // Disabled/missing config suppress both facade and direct application operation.
  const gated = clone('gated'), callsBeforeGate = submissions;
  db.exec("UPDATE kbs_service_settings SET enabled=0 WHERE id='primary'");
  assert.equal((await database.deliverKbsNotification(gated, [fake])).code, 'kbs_disabled');
  assert.equal((await new KbsDeliveryService(db, [fake]).deliver(gated, 'egm')).code, 'kbs_disabled');
  db.exec("UPDATE kbs_service_settings SET enabled=1,password_encrypted='' WHERE id='primary'");
  assert.equal((await database.deliverKbsNotification(gated, [fake])).code, 'kbs_not_configured');
  assert.equal((await new KbsDeliveryService(db, [fake]).deliver(gated, 'egm')).code, 'kbs_not_configured');
  enableKbs('egm'); assert.equal(submissions, callsBeforeGate); assert.equal(row(gated).status, 'pending');

  // Real adapter contracts, fake transports only: no invented native idempotency/receipt.
  const egmUnverified = clone('egm-unverified');
  const egmAdapter = new EgmKbsProviderAdapter({ inspect: async () => ({ state: 'authenticated' }) });
  assert.equal((await new KbsDeliveryService(db, [egmAdapter]).deliver(egmUnverified, 'egm')).code, 'egm_submission_contract_unverified');
  assert.equal(row(egmUnverified).status, 'pending');
  enableKbs('jandarma');
  const jandarmaUnverified = clone('jandarma-unverified');
  assert.equal((await new KbsDeliveryService(db, [new JandarmaKbsProviderAdapter()]).deliver(jandarmaUnverified, 'jandarma')).code, 'jandarma_soap_binding_unverified');
  assert.equal(row(jandarmaUnverified).status, 'pending');
  const jandarmaFailure = clone('jandarma-failure'); let soapCalls = 0;
  const failedSoap = new JandarmaKbsProviderAdapter({ send: async (_operation, input) => {
    soapCalls++; assert.equal(input.notificationId, jandarmaFailure); return { successful: false, code: 105, message: 'Fixture DB failure' };
  } });
  assert.equal((await new KbsDeliveryService(db, [failedSoap]).deliver(jandarmaFailure, 'jandarma')).state, 'submission_unknown');
  assert.equal((await new KbsDeliveryService(db, [failedSoap]).deliver(jandarmaFailure, 'jandarma')).state, 'submission_unknown'); assert.equal(soapCalls, 1);
  const jandarmaSuccess = clone('jandarma-success');
  const successfulSoap = new JandarmaKbsProviderAdapter({ send: async (operation, input) => {
    soapCalls++; assert.equal(operation, 'MusteriKimlikNoGiris'); assert.equal(input.notificationId, jandarmaSuccess);
    return { successful: true, code: 100, message: 'Fixture accepted without receipt' };
  } });
  assert.equal((await new KbsDeliveryService(db, [successfulSoap]).deliver(jandarmaSuccess, 'jandarma')).state, 'sent');
  assert.equal(row(jandarmaSuccess).provider_reference, '', 'Classifier does not invent a provider receipt');
  assert.equal((await new KbsDeliveryService(db, [successfulSoap]).deliver(jandarmaSuccess, 'jandarma')).state, 'already_sent'); assert.equal(soapCalls, 2);
  enableKbs('egm');

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
