import assert from 'node:assert/strict';
import { saveMenuProductFixture } from "./test-helpers/menu-product-fixture.mjs";
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import { createSmokeSetupInput } from './test-helpers/desktop-setup.mjs';
import { seedSmokeBusinessLayout } from './test-helpers/business-layout.mjs';

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require('../apps/desktop-app/dist-electron/database.js');
const { BUSINESS_CAPABILITIES: C } = require('@yardimci-asistan/shared');
const directory = mkdtempSync(join(tmpdir(), 'table-customer-'));
const database = new DesktopDatabase({ appPath: resolve('apps/desktop-app'), userDataPath: directory });
let raw;
try {
  database.initialize();
  assert.equal(database.saveInitialSetup(createSmokeSetupInput({ businessName: 'Masa Müşteri Smoke', phone: '+905551112233',
    whatsapp: '+905551112233', syncSecret: 'table-customer-smoke-secret', servicePreferences: { whatsapp: false, android: false } })).ok, true);
  seedSmokeBusinessLayout(database.databasePath, { tableCategories: [{ name: 'Salon', tableCount: 2 }] });
  raw = new DatabaseSync(database.databasePath);
  const tableId = database.getDashboardData().tables[0].id;
  const otherTableId = database.getDashboardData().tables[1].id;
  const customerIds = ['a', 'b'].map((suffix, index) => {
    const result = database.saveCustomer({ fullName: `Misafir ${suffix}`, phone: `0555111223${index}`, email: '', notes: '', tags: [] });
    assert.equal(result.ok, true); return result.savedId;
  });
  const tableRow = () => raw.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);
  const relations = () => ({ orders: raw.prepare('SELECT * FROM table_orders').all(),
    items: raw.prepare('SELECT * FROM table_order_items').all(), reservations: raw.prepare('SELECT * FROM reservations').all() });
  for (const input of [null, {}, { tableId, customerId: null }, { tableId: '', customerId: '' },
    { tableId: 'missing', customerId: '' }, { tableId, customerId: 'missing' }]) {
    const before = tableRow(); assert.equal(database.assignTableCustomer(input).ok, false); assert.deepEqual(tableRow(), before);
  }
  raw.prepare('UPDATE tables SET is_active = 0 WHERE id = ?').run(otherTableId);
  assert.equal(database.assignTableCustomer({ tableId: otherTableId, customerId: customerIds[0] }).ok, false);
  raw.prepare("UPDATE tables SET is_active = 1, deleted_at = 'deleted' WHERE id = ?").run(otherTableId);
  assert.equal(database.assignTableCustomer({ tableId: otherTableId, customerId: '' }).ok, false);
  raw.prepare("UPDATE customers SET deleted_at = 'deleted' WHERE id = ?").run(customerIds[1]);
  assert.equal(database.assignTableCustomer({ tableId, customerId: customerIds[1] }).ok, false);
  raw.prepare("UPDATE customers SET deleted_at = '' WHERE id = ?").run(customerIds[1]);

  // Empty tables remain empty; only the relation and persistence metadata may change.
  const emptyRelations = relations();
  assert.equal(database.assignTableCustomer({ tableId, customerId: customerIds[0] }).ok, true);
  assert.deepEqual(relations(), emptyRelations);
  assert.equal(tableRow().status, 'available');
  const reservation = database.saveManualRestaurantReservation({ customerId: customerIds[0], tableId,
    date: '2026-09-27', time: '18:00', guestCount: 2, notes: 'Korunan rezervasyon' });
  assert.equal(reservation.ok, true, reservation.message);
  const reservationId = reservation.dashboardData.reservations[0].id;
  raw.prepare('UPDATE tables SET current_reservation_id = ? WHERE id = ?').run(reservationId, tableId);
  const opened = database.openTableOrder(tableId);
  assert.equal(opened.ok, true, opened.message);
  const category = database.saveMenuCategory({ name: 'İçecek', description: '', is_active: true, sort_order: 1 });
  const item = saveMenuProductFixture(database, { category_id: category.savedId, name: 'Çay', description: '', price: 25, currency: 'TRY',
    image_url: '', is_available: true, is_featured: false, allergens: [], tags: [], sort_order: 1 });
  assert.equal(database.addTableOrderItem({ orderId: opened.order.id, menuEntryId: item.savedId, quantity: 2, note: 'Korunan not' }).ok, true);
  const beforeRelations = relations();
  for (const customerId of [customerIds[1], '', customerIds[0]]) {
    raw.prepare("UPDATE tables SET updated_at = '2000-01-01', sync_status = 'synced' WHERE id = ?").run(tableId);
    const before = tableRow();
    const result = database.assignTableCustomer({ tableId, customerId });
    assert.equal(result.ok, true, result.message);
    const after = tableRow();
    assert.deepEqual({ ...after }, { ...before, current_customer_id: customerId, updated_at: after.updated_at, sync_status: 'local_only' });
    assert.ok(after.updated_at > before.updated_at);
    assert.equal(result.dashboardData.tables.find(table => table.id === tableId).currentCustomerId, customerId);
    assert.equal(after.current_reservation_id, reservationId);
    assert.deepEqual(relations(), beforeRelations);
  }

  // Exercise the real IPC registration with controlled capability/session gates.
  const handlers = new Map();
  const ipcModule = { exports: {} };
  const ipcPath = resolve('apps/desktop-app/dist-electron/ipc/room-table-ipc.js');
  runInNewContext(readFileSync(ipcPath, 'utf8'), { exports: ipcModule.exports,
    require: name => name === 'electron' ? { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } } : require(name) });
  let locked = false; let capabilities = new Set([C.FOOD_TABLES, C.CUSTOMERS]); let calls = 0;
  ipcModule.exports.registerRoomTableIpcHandlers({
    getDatabase: () => ({ assignTableCustomer: input => { calls++; return database.assignTableCustomer(input); } }),
    assertUnlocked: () => { if (locked) throw new Error('locked'); },
    assertCapability: capability => { if (!capabilities.has(capability)) throw new Error('capability'); }
  });
  const assign = handlers.get('table:assignCustomer');
  const input = { tableId, customerId: '' };
  locked = true; assert.throws(() => assign({}, input), /locked/);
  locked = false;
  for (const capability of [C.FOOD_TABLES, C.CUSTOMERS]) {
    capabilities.delete(capability); assert.throws(() => assign({}, input), /capability/); capabilities.add(capability);
  }
  assert.equal(calls, 0);
  assert.equal(assign({}, input).ok, true); assert.equal(calls, 1);
  let bridge; const invocations = [];
  runInNewContext(readFileSync(resolve('apps/desktop-app/dist-electron/preload.js'), 'utf8'), {
    exports: {}, require: name => name === 'electron' ? {
      contextBridge: { exposeInMainWorld: (_name, exposed) => { bridge = exposed; } },
      webFrame: {}, ipcRenderer: { invoke: async (channel, ...args) => {
        invocations.push({ channel, args });
        return channel === 'appLock:getStatus' ? { locked } : assign({}, ...args);
      } }
    } : require(name)
  });
  locked = true;
  await assert.rejects(bridge.assignTableCustomer(input), /Uygulama kilitli/);
  assert.deepEqual(invocations.map(call => call.channel), ['appLock:getStatus']);
  locked = false; invocations.length = 0;
  assert.equal((await bridge.assignTableCustomer(input)).ok, true);
  assert.deepEqual(invocations.map(call => call.channel), ['appLock:getStatus', 'table:assignCustomer']);
  assert.deepEqual(invocations[1].args, [input]);
  console.log('table-customer-ok: validation, attach/change/remove, dashboard, reservation/order isolation, IPC capability/session gates');
} finally { raw?.close(); database.close(); rmSync(directory, { recursive: true, force: true }); }
