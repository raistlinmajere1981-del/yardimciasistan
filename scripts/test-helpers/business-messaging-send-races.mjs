import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { configuration, serviceFixture } from './business-messaging-fixtures.mjs';

const require = createRequire(import.meta.url);
const { DesktopAppLockService } = require('../../apps/desktop-app/dist-electron/app-lock-service.js');
const { saveMessagingConfiguration } = require('../../apps/desktop-app/dist-electron/business-messaging/store.js');
const { BUSINESS_CAPABILITIES: C } = require('../../packages/shared/dist');
function latch() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

export async function verifySendAuthorityRaces({ db, raw, http, secrets, logs, input }) {
  const lock = new DesktopAppLockService({ database: db, getSyncStatus: () => undefined, onUnlocked: () => {} });
  const business = raw.prepare("SELECT * FROM business WHERE deleted_at='' LIMIT 1").get();
  let maintenance = false, shutdown = false, currentDb = db;
  const assertCanSubmit = () => {
    lock.assertUnlocked();
    if (maintenance || shutdown) throw new Error('maintenance/shutdown');
  };
  const saveConfig = (config = configuration) => {
    raw.exec('BEGIN IMMEDIATE');
    try {
      saveMessagingConfiguration(raw, business.id, config, secrets.createMessagingSecretWrite(config));
      raw.exec('COMMIT');
    } catch (error) { raw.exec('ROLLBACK'); throw error; }
  };
  const restore = async () => {
    await lock.unlock(''); maintenance = false; shutdown = false; currentDb = db;
    secrets.setAvailable(true); saveConfig();
    raw.prepare('UPDATE business_capabilities SET is_enabled=1 WHERE business_id=? AND capability_id=?').run(business.id, C.CUSTOMERS);
    raw.prepare('UPDATE business SET deleted_at=? WHERE id=?').run(business.deleted_at, business.id);
    raw.prepare('DELETE FROM business_messaging_provider_config WHERE business_id=?').run('send-race-business');
    raw.prepare('DELETE FROM business_capabilities WHERE business_id=?').run('send-race-business');
    raw.prepare('DELETE FROM business WHERE id=?').run('send-race-business');
  };
  const switchBusiness = () => {
    const columns = Object.keys(business);
    raw.prepare(`INSERT INTO business (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .run(...columns.map((key) => key === 'id' ? 'send-race-business' : business[key]));
    raw.prepare('INSERT INTO business_capabilities SELECT ?,capability_id,is_enabled,is_selected,source,created_at,updated_at FROM business_capabilities WHERE business_id=?')
      .run('send-race-business', business.id);
    saveMessagingConfiguration(raw, 'send-race-business', configuration, secrets.createMessagingSecretWrite(configuration));
    raw.prepare("UPDATE business SET deleted_at='fixture' WHERE id=?").run(business.id);
  };
  const cases = [
    ['lock', () => lock.lock()],
    ['maintenance', () => { maintenance = true; }],
    ['shutdown', () => { shutdown = true; }],
    ['service disabled', () => saveConfig({ ...configuration, enabled: false })],
    ['credential rotation', () => saveConfig({ ...configuration, accessToken: 'fixture_ROTATED_only' })],
    ['credential removal', () => saveConfig({ ...configuration, accessToken: '', clearAccessToken: true })],
    ['credential unavailable', () => secrets.setAvailable(false)],
    ['capability disabled', () => raw.prepare('UPDATE business_capabilities SET is_enabled=0 WHERE business_id=? AND capability_id=?').run(business.id, C.CUSTOMERS)],
    ['business changed', switchBusiness],
    ['database replaced', () => { currentDb = Object.create(db); }]
  ];
  for (const [name, change] of cases) {
    const entered = latch(), catalog = latch(); let delayed = false, posts = 0;
    const transport = { fetchImpl: async (url, init) => {
      if (delayed && init.method === 'GET') { entered.release(); await catalog.promise; }
      if (init.method === 'POST') posts++;
      return http.fetchImpl(url, init);
    } };
    const service = serviceFixture(() => currentDb, transport, secrets, logs, { assertCanSubmit });
    const intent = await service.prepare(input); delayed = true;
    const pending = service.send(intent.id, input.parameters).then((value) => ({ value }), (error) => ({ error }));
    try {
      await entered.promise; change(); catalog.release();
      const result = await pending;
      assert.equal(posts, 0, `${name} during catalog GET: provider POST must not start`);
      assert.equal(Number(db.getMessageBinding(intent.id).submitted), 0, `${name}: no submission claim`);
      assert.equal(raw.prepare('SELECT status FROM business_messages WHERE id=?').get(intent.id).status, 'draft');
      assert.ok(result.error, `${name}: rejected before claim`);
    } finally { catalog.release(); await pending; await restore(); }
  }

  // Inject a synchronous authority change at the canonical claim return boundary.
  for (const [name, change] of cases.slice(0, 5)) {
    let posts = 0;
    const service = serviceFixture(() => db, { fetchImpl: (url, init) => {
      if (init.method === 'POST') posts++;
      return http.fetchImpl(url, init);
    } }, secrets, logs, { assertCanSubmit });
    const intent = await service.prepare(input), claim = db.claimBusinessMessage;
    db.claimBusinessMessage = (id) => { const claimed = claim.call(db, id); change(); return claimed; };
    try {
      const result = await service.send(intent.id, input.parameters);
      assert.equal(posts, 0, `${name} after claim: provider POST must not start`);
      assert.equal(result.status, 'failed');
      assert.equal(Number(db.getMessageBinding(intent.id).submitted), 1, 'preserve durable submission fence');
      db.claimBusinessMessage = claim; await restore();
      await service.send(intent.id, input.parameters);
      assert.equal(posts, 0, 'replay cannot resubmit a claimed failure');
    } finally { db.claimBusinessMessage = claim; await restore(); }
  }

  for (const lost of [false, true]) {
    const entered = latch(), response = latch(); let posts = 0;
    const transport = { fetchImpl: async (url, init) => {
      if (init.method === 'POST') { posts++; entered.release(); await response.promise; }
      return http.fetchImpl(url, init);
    } };
    const service = serviceFixture(() => db, transport, secrets, logs, { assertCanSubmit });
    const intent = await service.prepare(input), pending = service.send(intent.id, input.parameters);
    try {
      await entered.promise; lock.lock(); maintenance = true;
      saveConfig({ ...configuration, enabled: false, accessToken: '', clearAccessToken: true });
      let drained = false;
      const draining = service.drain().then(() => { drained = true; });
      await Promise.resolve(); assert.equal(drained, false, 'drain waits for begun POST receipt');
      http.state.lost = lost; response.release();
      const result = await pending; await draining;
      assert.equal(result.status, lost ? 'failed' : 'accepted');
      if (!lost) assert.ok(result.providerMessageId, 'receipt survives lock and credential removal');
      assert.equal(Number(db.getMessageBinding(intent.id).submitted), 1);
      await restore(); http.state.lost = false;
      await serviceFixture(() => db, transport, secrets, logs, { assertCanSubmit }).send(intent.id, input.parameters);
      assert.equal(posts, 1, 'accepted/uncertain replay cannot duplicate provider POST');
    } finally { response.release(); await pending; http.state.lost = false; await restore(); }
  }
  console.log('Single-message authority: 10 catalog races, 5 claim-boundary races, begun POST receipt/uncertainty drain and replay passed.');
}
