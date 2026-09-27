import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { createTemporaryDesktopDatabase } from './test-helpers/desktop-database.mjs';
import { createSmokeSetupInput } from './test-helpers/desktop-setup.mjs';
import { seedSmokeBusinessLayout } from './test-helpers/business-layout.mjs';
const require = createRequire(import.meta.url);
const { DesktopRoomFolioService } = require('../apps/desktop-app/dist-electron/room-folio.js');
const { checkoutHospitalityStay } = require('../apps/desktop-app/dist-electron/hospitality-checkout.js');
const { projectRoomState } = require('@yardimci-asistan/shared');
const { database, cleanup } = createTemporaryDesktopDatabase('hospitality-domain-');
let db;
try {
  database.initialize();
  const setup = database.saveInitialSetup(createSmokeSetupInput({ businessName: 'Hospitality smoke', phone: '+905550003001', whatsapp: '+905550003001', syncSecret: 'hospitality-smoke-secret', servicePreferences: { whatsapp: false, android: true } }));
  assert.equal(setup.ok, true, setup.message);
  seedSmokeBusinessLayout(database.databasePath, { roomCount: 12 });
  db = new DatabaseSync(database.databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  const rooms = database.getDashboardData().rooms;
  assert.ok(rooms.length >= 12);
  db.prepare("UPDATE rooms SET capacity = 4, status = 'available', nightly_price_minor = 0").run();
  const customer = database.saveCustomer({ fullName: 'Domain guest', phone: '', email: '', notes: '', tags: [], identityType: '', identityNumber: '', nationality: '', birthDate: '', gender: '', documentSerialNumber: '', documentExpiryDate: '', birthPlace: '', motherName: '', fatherName: '', issuingAuthority: '', address: '' });
  assert.equal(customer.ok, true, customer.message);
  const customerId = customer.savedId;
  const folios = new DesktopRoomFolioService(database.databasePath);
  const stayRow = id => db.prepare('SELECT * FROM customer_room_stays WHERE id = ?').get(id);
  const roomStatus = id => db.prepare('SELECT status FROM rooms WHERE id = ?').get(id).status;
  const manual = (roomId, overrides = {}) => database.assignCustomerToRoom({ customerId, roomId, checkInDate: '2035-09-01', checkOutDate: '2035-09-04', guestCount: 2, notes: '', status: 'checked_in', ...overrides });
  const reservation = (roomId, overrides = {}) => {
    const result = database.saveManualReservation({ customerId, roomId, startDate: '2035-09-01', endDate: '2035-09-04', guestCount: 2, notes: 'source notes', ...overrides });
    assert.equal(result.ok, true, result.message);
    return db.prepare('SELECT * FROM reservations ORDER BY rowid DESC LIMIT 1').get();
  };
  const ok = result => { assert.equal(result.ok, true, result.message); return result; };
  const fail = result => assert.equal(result.ok, false, result.message);

  // A / D / H: manual identity, existing validation, departure without an account, explicit cleaning completion.
  fail(manual(rooms[0].id, { guestCount: 5 }));
  const independent = ok(manual(rooms[0].id));
  assert.equal(stayRow(independent.savedId).reservation_id, '');
  fail(manual(rooms[0].id));
  ok(database.checkoutStay(independent.savedId));
  assert.equal(stayRow(independent.savedId).status, 'checked_out');
  assert.ok(stayRow(independent.savedId).checked_out_at);
  assert.equal(roomStatus(rooms[0].id), 'cleaning');
  ok(database.updateRoomStatus({ roomId: rooms[0].id, status: 'available' }));
  assert.equal(roomStatus(rooms[0].id), 'available');
  ok(database.checkoutStay(independent.savedId));
  assert.equal(roomStatus(rooms[0].id), 'available', 'Retry cannot dirty a cleaned room');

  // B / C / K: assignment alone never creates a Stay, linked conversion preserves source identity.
  const booking = reservation(rooms[1].id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_room_stays WHERE reservation_id = ?').get(booking.id).n, 0);
  fail(database.createStayFromReservation({ reservationId: 'missing' }));
  fail(database.createStayFromReservation({ reservationId: booking.id, roomId: rooms[0].id }));
  for (const status of ['pending', 'cancelled', 'completed', 'rejected']) {
    db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, booking.id);
    fail(database.createStayFromReservation({ reservationId: booking.id }));
  }
  db.prepare("UPDATE reservations SET status = 'approved', reservation_type = 'table' WHERE id = ?").run(booking.id);
  fail(database.createStayFromReservation({ reservationId: booking.id }));
  db.prepare("UPDATE reservations SET reservation_type = 'room' WHERE id = ?").run(booking.id);
  for (const status of ['maintenance', 'out_of_service', 'cleaning']) {
    db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, rooms[1].id);
    fail(database.createStayFromReservation({ reservationId: booking.id }));
    // Reservation approval cannot erase operational condition.
    ok(database.updateReservationStatus({ reservationId: booking.id, status: 'approved' }));
    assert.equal(roomStatus(rooms[1].id), status);
  }
  db.prepare("UPDATE rooms SET status = 'reserved', is_active = 0 WHERE id = ?").run(rooms[1].id);
  fail(database.createStayFromReservation({ reservationId: booking.id }));
  db.prepare('UPDATE rooms SET is_active = 1, capacity = 1 WHERE id = ?').run(rooms[1].id);
  fail(database.createStayFromReservation({ reservationId: booking.id }));
  db.prepare('UPDATE rooms SET capacity = 4 WHERE id = ?').run(rooms[1].id);
  db.prepare("UPDATE customers SET deleted_at = 'deleted' WHERE id = ?").run(customerId);
  fail(database.createStayFromReservation({ reservationId: booking.id }));
  db.prepare("UPDATE customers SET deleted_at = '' WHERE id = ?").run(customerId);
  const linked = ok(database.createStayFromReservation({ reservationId: booking.id, status: 'checked_in' }));
  const linkedRow = stayRow(linked.savedId);
  for (const [field, value] of Object.entries({ reservation_id: booking.id, customer_id: customerId, room_id: rooms[1].id, check_in_date: booking.start_date, check_out_date: booking.end_date, guest_count: booking.guest_count, status: 'checked_in' })) assert.equal(linkedRow[field], value);
  assert.ok(linkedRow.checked_in_at, 'Direct check-in must stamp arrival');
  assert.equal(roomStatus(rooms[1].id), 'occupied', 'Direct check-in occupies the room');
  fail(database.createStayFromReservation({ reservationId: booking.id }));
  assert.equal(db.prepare('SELECT status FROM reservations WHERE id = ?').get(booking.id).status, 'approved');
  assert.equal(stayRow(linked.savedId).status, 'checked_in');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM room_folios WHERE stay_id = ?').get(linked.savedId).n, 0, 'Direct check-in does not auto-open a Folio; the workspace opens it explicitly');
  assert.equal(db.prepare('SELECT status FROM reservations WHERE id = ?').get(booking.id).status, 'approved');
  // Aynı müşteri ikinci odada aktif olamaz: desktop + Android/domain reddi Oda bilgisiyle gelir.
  const secondActiveDesktop = database.assignCustomerToRoom({ customerId, roomId: rooms[2].id, checkInDate: '2035-09-01', checkOutDate: '2035-09-04', guestCount: 2, notes: '', status: 'checked_in' });
  assert.equal(secondActiveDesktop.ok, false);
  assert.match(secondActiveDesktop.message, /Oda .*için aktif/);
  database.upsertAndroidDeviceSightings([{ device_id: 'hospitality-single-active', device_name: 'Single active', app_version: 'smoke', first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }]);
  database.setAndroidDeviceActive('hospitality-single-active', true);
  database.setAndroidDeviceRole('hospitality-single-active', 'admin');
  const secondActiveAndroid = database.applyAndroidAction({ id: 'hospitality-second-active-android', action_type: 'customer_room_assign', payload: { customer_id: customerId, room_id: rooms[2].id, check_in_date: '2035-09-01', check_out_date: '2035-09-04', guest_count: 2, notes: '', status: 'checked_in' }, created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), device_id: 'hospitality-single-active', device_name: 'Single active', app_version: 'smoke', status: 'pending', error_message: '' });
  assert.equal(secondActiveAndroid.ok, false);
  assert.match(secondActiveAndroid.message, /Oda .*için aktif/);
  ok(database.checkoutStay(linked.savedId));
  assert.equal(stayRow(linked.savedId).status, 'checked_out');

  // Multi-room selection is explicit; total guest count is conservatively capacity-checked per selected room.
  // Aynı müşteri iki odada aynı anda aktif olamaz, bu yüzden ikinci oda önce reddedilir.
  const multi = reservation(rooms[2].id);
  db.prepare('UPDATE reservations SET room_ids_json = ? WHERE id = ?').run(JSON.stringify([rooms[2].id, rooms[3].id]), multi.id);
  fail(database.createStayFromReservation({ reservationId: multi.id }));
  const multiFirst = ok(database.createStayFromReservation({ reservationId: multi.id, roomId: rooms[2].id, status: 'checked_in' }));
  assert.equal(stayRow(multiFirst.savedId).status, 'checked_in');
  assert.equal(stayRow(multiFirst.savedId).reservation_id, multi.id);
  const multiSecondBlocked = database.createStayFromReservation({ reservationId: multi.id, roomId: rooms[3].id, status: 'checked_in' });
  assert.equal(multiSecondBlocked.ok, false);
  assert.match(multiSecondBlocked.message, /Oda .*için aktif/);
  ok(database.checkoutStay(multiFirst.savedId));
  const multiSecond = ok(database.createStayFromReservation({ reservationId: multi.id, roomId: rooms[3].id, status: 'checked_in' }));
  assert.equal(stayRow(multiSecond.savedId).reservation_id, multi.id);
  ok(database.checkoutStay(multiSecond.savedId));

  // F / G / E: both checkout entries share debt/zero semantics, finance happens once, payments do not close accounts.
  for (const [index, viaFolio, amount] of [[4, false, 0], [5, true, 0], [6, false, 10000], [7, true, 10000]]) {
    db.prepare('UPDATE rooms SET nightly_price_minor = ? WHERE id = ?').run(amount, rooms[index].id);
    const stay = ok(manual(rooms[index].id));
    const priorStatus = stayRow(stay.savedId).status;
    const priorRoomStatus = roomStatus(rooms[index].id);
    const opened = ok(folios.openFolio(stay.savedId));
    assert.equal(stayRow(stay.savedId).status, priorStatus, 'Opening an account cannot check in a guest');
    assert.equal(roomStatus(rooms[index].id), priorRoomStatus, 'Opening an account cannot change room readiness');
    ok(database.checkInStay(stay.savedId));
    const before = opened.data.folios.find(folio => folio.id === opened.folioId);
    const eventsBefore = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
    ok(viaFolio ? folios.checkout({ folioId: opened.folioId, allowOutstanding: false }) : database.checkoutStay(stay.savedId));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, eventsBefore + 1, 'One checkout event');
    assert.equal(stayRow(stay.savedId).status, 'checked_out');
    assert.equal(roomStatus(rooms[index].id), 'cleaning');
    let folio = folios.getData().folios.find(f => f.id === opened.folioId);
    assert.equal(folio.status, amount ? 'open' : 'closed');
    assert.equal(folio.remainingMinor, before.remainingMinor);
    if (amount) {
      ok(folios.addPayment({ folioId: folio.id, amountMinor: folio.remainingMinor, paymentMethod: 'cash', note: '' }));
      folio = folios.getData().folios.find(f => f.id === folio.id);
      assert.equal(folio.remainingMinor, 0);
      assert.equal(folio.status, 'open');
      assert.equal(roomStatus(rooms[index].id), 'cleaning');
      const payment = folio.payments.find(p => p.origin === 'direct');
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM finance_entries WHERE source_type = 'room_folio_payment' AND source_id = ? AND deleted_at = ''").get(payment.id).n, 1);
      ok(folios.voidPayment(payment.id));
      assert.equal(roomStatus(rooms[index].id), 'cleaning');
      const remaining = folios.getData().folios.find(f => f.id === folio.id).remainingMinor;
      assert.equal(remaining, amount * 3);
      ok(folios.addPayment({ folioId: folio.id, amountMinor: remaining, paymentMethod: 'card', note: '' }));
      ok(database.updateRoomStatus({ roomId: rooms[index].id, status: 'available' }));
      const checkedOutAt = stayRow(stay.savedId).checked_out_at;
      ok(folios.checkout({ folioId: folio.id, allowOutstanding: false }));
      assert.equal(folios.getData().folios.find(f => f.id === folio.id).status, 'closed');
      assert.equal(roomStatus(rooms[index].id), 'available', 'Financial closure cannot change room readiness');
      assert.equal(stayRow(stay.savedId).checked_out_at, checkedOutAt);
    }
  }

  // I: existing other checked-in/planned stays retain their room ownership.
  // Tek-aktif kuralı nedeniyle ikinci kayıt farklı müşteriyle yapılır; aynı müşteri ikinci odada reddedilir.
  const secondCustomer = ok(database.saveCustomer({ fullName: 'Domain second guest', phone: '', email: '', notes: '', tags: [], identityType: '', identityNumber: '', nationality: '', birthDate: '', gender: '', documentSerialNumber: '', documentExpiryDate: '', birthPlace: '', motherName: '', fatherName: '', issuingAuthority: '', address: '' }));
  const secondCustomerId = secondCustomer.savedId;
  const manualAs = (cid, roomId, overrides = {}) => database.assignCustomerToRoom({ customerId: cid, roomId, checkInDate: '2035-09-01', checkOutDate: '2035-09-04', guestCount: 2, notes: '', status: 'checked_in', ...overrides });
  for (const [index, otherStatus, expected] of [[8, 'checked_in', 'occupied'], [9, 'planned', 'reserved']]) {
    const first = ok(manual(rooms[index].id));
    const blockedSameCustomer = manual(rooms[index].id, { checkInDate: '2035-09-05', checkOutDate: '2035-09-08', status: otherStatus });
    assert.equal(blockedSameCustomer.ok, false);
    assert.match(blockedSameCustomer.message, /Oda .*için aktif/);
    const second = ok(manualAs(secondCustomerId, rooms[index].id, { checkInDate: '2035-09-05', checkOutDate: '2035-09-08', status: otherStatus }));
    ok(database.checkoutStay(first.savedId));
    assert.equal(roomStatus(rooms[index].id), expected);
    if (otherStatus === 'planned') ok(database.updateCustomerRoomStayStatus({ stayId: second.savedId, status: 'cancelled' }));
    else ok(database.checkoutStay(second.savedId));
  }

  // Conflict must not inherit the old 80-row dashboard limit or exempt another booking of the same customer.
  const conflicted = reservation(rooms[10].id);
  db.prepare(`INSERT INTO reservations (id, customer_id, reservation_type, status, title, start_date, end_date, room_ids_json, created_at, updated_at)
    VALUES ('same-customer-conflict', ?, 'room', 'approved', 'conflict', '2035-09-02', '2035-09-03', ?, '', '')`).run(customerId, JSON.stringify([rooms[10].id]));
  for (let i = 0; i < 85; i++) db.prepare("INSERT INTO reservations (id, reservation_type, title, start_date, created_at, updated_at) VALUES (?, 'room', 'history', '2020-01-01', '', '')").run(`old-${i}`);
  fail(database.createStayFromReservation({ reservationId: conflicted.id }));
  db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = 'same-customer-conflict'").run();
  const conflictManual = ok(manual(rooms[10].id)); // Manual same-customer legacy rule is preserved.
  fail(database.createStayFromReservation({ reservationId: conflicted.id })); // Stay overlap still applies.
  ok(database.checkoutStay(conflictManual.savedId));

  // Tek-aktif status geçişi: desktop + Android/domain yolları Oda bilgisiyle reddeder.
  db.prepare("UPDATE rooms SET status = 'available' WHERE id IN (?, ?)").run(rooms[0].id, rooms[1].id);
  const reactivatable = ok(manualAs(customerId, rooms[1].id, { checkInDate: '2035-09-10', checkOutDate: '2035-09-12', status: 'planned' }));
  ok(database.updateCustomerRoomStayStatus({ stayId: reactivatable.savedId, status: 'cancelled' }));
  const statusBlocker = ok(manual(rooms[0].id, { checkInDate: '2035-09-10', checkOutDate: '2035-09-12' }));
  const blockedReactivate = database.updateCustomerRoomStayStatus({ stayId: reactivatable.savedId, status: 'planned' });
  assert.equal(blockedReactivate.ok, false);
  assert.match(blockedReactivate.message, /Oda .*için aktif/);
  const stayBeforeAndroid = stayRow(reactivatable.savedId);
  const blockedAndroidStatus = database.applyAndroidAction({ id: 'hospitality-status-second-active', action_type: 'customer_room_stay_status', payload: { stay_id: reactivatable.savedId, status: 'planned', expected_updated_at: stayBeforeAndroid.updated_at }, created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), device_id: 'hospitality-single-active', device_name: 'Single active', app_version: 'smoke', status: 'pending', error_message: '' });
  assert.equal(blockedAndroidStatus.ok, false);
  assert.match(blockedAndroidStatus.message, /Oda .*için aktif/);
  ok(database.checkoutStay(statusBlocker.savedId));
  ok(database.updateCustomerRoomStayStatus({ stayId: reactivatable.savedId, status: 'planned' }));
  ok(database.updateCustomerRoomStayStatus({ stayId: reactivatable.savedId, status: 'cancelled' }));

  // Atomicity, including when composed with an outer action transaction.
  const rollbackStay = ok(manual(rooms[11].id));
  db.exec('BEGIN IMMEDIATE');
  ok(checkoutHospitalityStay(db, { stayId: rollbackStay.savedId }));
  db.exec('ROLLBACK');
  assert.equal(stayRow(rollbackStay.savedId).status, 'checked_in');
  assert.equal(roomStatus(rooms[11].id), 'occupied');

  // J: orthogonal facts, with explicit deterministic date input and no rendering changes.
  const r = { id: 'r', status: 'maintenance', isActive: true };
  const plans = [{ id: 'reservation', roomIds: ['r'], status: 'approved', startDate: '2035-09-01', endDate: '2035-09-04' }];
  const stays = [{ id: 'planned', roomId: 'r', status: 'planned', checkInDate: '2035-09-05', checkOutDate: '2035-09-08' }];
  for (const condition of ['maintenance', 'cleaning', 'out_of_service']) {
    const projected = projectRoomState({ ...r, status: condition }, stays, plans, '2035-08-01');
    assert.equal(projected.operationalCondition, condition);
    assert.equal(projected.occupancy.status, 'vacant');
    assert.deepEqual(projected.planning, { reservationIds: ['reservation'], plannedStayIds: ['planned'] });
  }
  const occupied = projectRoomState({ ...r, status: 'occupied' }, [{ ...stays[0], status: 'checked_in' }], plans, '2035-09-10');
  assert.equal(occupied.occupancy.status, 'occupied');
  assert.deepEqual(occupied.planning, { reservationIds: [], plannedStayIds: [] });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  // Exercise the new IPC gates and routing without launching a renderer.
  const handlers = new Map();
  const load = Module._load;
  let registerCustomerIpcHandlers;
  try {
    Module._load = function (id, ...args) {
      return id === 'electron' ? { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } } : load.call(this, id, ...args);
    };
    ({ registerCustomerIpcHandlers } = require('../apps/desktop-app/dist-electron/ipc/customer-ipc.js'));
  } finally { Module._load = load; }
  let locked = true;
  let deniedCapability = '';
  const gateCalls = [];
  const routed = [];
  registerCustomerIpcHandlers({
    assertUnlocked: () => { gateCalls.push('session'); if (locked) throw new Error('locked'); },
    assertCapability: capability => { gateCalls.push(capability); if (deniedCapability === capability) throw new Error('capability'); },
    getDatabase: () => ({
      createStayFromReservation: input => { routed.push(input); return { ok: true, savedId: 'linked' }; },
      checkInStay: input => { routed.push(input); return { ok: true, savedId: input }; },
      checkoutStay: input => { routed.push(input); return { ok: true, savedId: input }; }
    }),
    finalizeCustomerMutation: result => ({ ...result, finalized: true }),
    finalizeRecordDeletion: result => result
  });
  for (const [channel, input] of [['customer:createStayFromReservation', { reservationId: 'r', roomId: 'room' }], ['customer:checkInStay', 'stay'], ['customer:checkoutStay', 'stay']]) {
    locked = true;
    gateCalls.length = 0;
    assert.throws(() => handlers.get(channel)({}, input), /locked/);
    assert.deepEqual(gateCalls, ['session']);
    locked = false;
    deniedCapability = 'accommodation.stays';
    assert.throws(() => handlers.get(channel)({}, input), /capability/);
    deniedCapability = '';
    if (channel.endsWith('createStayFromReservation')) {
      deniedCapability = 'accommodation.reservations';
      assert.throws(() => handlers.get(channel)({}, input), /capability/);
      deniedCapability = '';
    }
    assert.equal(handlers.get(channel)({}, input).finalized, true);
    assert.deepEqual(routed.at(-1), input);
  }
  assert.equal(routed.length, 3, 'Denied calls must never mutate');
  console.log('hospitality-domain-smoke-ok');
} finally { db?.close(); cleanup(); }
