import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import { marketingFixture, editorialInput, imageBytes } from './marketing-fixtures.mjs';

const require = createRequire(import.meta.url);
const core = require('../../packages/sync-core/dist');
const { BUSINESS_CAPABILITIES: C, expandBusinessCapabilities, getEnabledBusinessCapabilityDependents } = require('../../packages/shared/dist');
const { SyncCoordinator } = require('../../apps/desktop-app/dist-electron/sync-coordinator.js');
const { DESKTOP_PUBLICATIONS } = require('../../apps/desktop-app/dist-electron/desktop-publication-registry.js');
const { saveRuntimeCatalogProduct, listRuntimeOrders } = require('../../apps/desktop-app/dist-electron/commerce-runtime.js');
const { createAndroidOperationsSnapshot } = require('../../apps/desktop-app/dist-electron/android-operations-snapshot.js');
const { createBusinessAiCatalog } = require('../../apps/desktop-app/dist-electron/business-ai-catalog-service.js');
const { createPublicRoomCatalog } = require('../../apps/desktop-app/dist-electron/public-room-catalog-publication.js');
const { createPublicTableCatalog } = require('../../apps/desktop-app/dist-electron/public-table-catalog-publication.js');
const { beginRestoreReconciliation } = require('../../apps/desktop-app/dist-electron/database/restore-reconciliation-store.js');

/** Real SQLite restore staging, PHP/HTTP apply and the normal coordinator. Invoked
 * by publication-protocol; not a second aggregate verification runner.
 */
export async function verifyRestoreReconciliation({ config, hosting }) {
  const f = marketingFixture(), nativeFetch = globalThis.fetch;
  const storage = code => {
    const result = spawnSync('php', ['-r', `require $argv[1]; $db=ya_storage_open(); ${code}`, join(hosting, 'lib/storage.php')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout ? JSON.parse(result.stdout) : null;
  };
  const mutate = sql => { const db = new DatabaseSync(f.db.databasePath); try { db.exec(sql); } finally { db.close(); } };
  // This registry projection/restore fixture intentionally spans all publication kinds.
  // Synthetic rows do not represent an allowed operator profile or bypass production Settings.
  const setPublicationFixtureCapability = ({ capability, enabled }) => {
    const db = new DatabaseSync(f.db.databasePath);
    try {
      const capabilities = enabled ? expandBusinessCapabilities([capability])
        : [capability, ...getEnabledBusinessCapabilityDependents(capability, Object.values(C))];
      for (const id of capabilities) db.prepare("UPDATE business_capabilities SET is_enabled=? WHERE capability_id=?").run(enabled ? 1 : 0, id);
    } finally { db.close(); }
  };
  const orders = () => listRuntimeOrders(f.db.databasePath);
  const makeCoordinator = () => new SyncCoordinator({ database: f.db, marketingWebsite: f.publisher, getSyncConfig: () => config,
    createAndroidSnapshot: () => createAndroidOperationsSnapshot(f.db, f.db.getDashboardData()),
    createAiCatalog: () => createBusinessAiCatalog(f.db),
    createRoomCatalog: () => createPublicRoomCatalog(f.db.databasePath, f.db.getEnabledBusinessCapabilities()),
    createTableCatalog: () => createPublicTableCatalog(f.db.databasePath, f.db.getEnabledBusinessCapabilities()),
    onDashboardChanged() {}, onStatusChanged() {} });
  const compiled = new URL('../../apps/desktop-app/dist-electron/data-maintenance.js', import.meta.url);
  const maintenanceRequire = createRequire(compiled), handlers = new Map(), maintenance = {}, maintenanceErrors = [];
  let failPreparation = false;
  runInNewContext(readFileSync(compiled, 'utf8'), { exports: maintenance, Buffer, Error, process,
    setTimeout: () => ({ unref() {} }), clearTimeout,
    require: name => name === 'electron' ? {
      app: { isPackaged: true, getAppPath: () => resolve('apps/desktop-app'), getVersion: () => 'fixture', relaunch() {}, quit() {} },
      ipcMain: { removeHandler() {}, handle: (name, action) => handlers.set(name, action) }, shell: {}, session: {}
    } : name === './desktop-logger' ? { desktopLog: { info() {}, warn() {}, error: event => maintenanceErrors.push(event) } }
      : name === './data-maintenance-confirmation' ? { requestDataMaintenanceConfirmation: async () => true } : maintenanceRequire(name)
  });
  maintenance.registerDataMaintenanceIpcHandlers(() => f.db.userDataPath, { assertUnlocked() {},
    beforeMaintenance: async () => { if (failPreparation) throw new Error('restore preparation injection'); } });
  const backup = () => { const result = handlers.get('dataMaintenance:createBackup')(); assert.equal(result.ok, true, result.message); return result.backup.id; };
  const restore = async id => {
    const result = await handlers.get('dataMaintenance:restoreBackup')({ sender: {} }, id);
    assert.equal(result.ok, true, result.message);
    f.reopen(() => maintenance.applyPendingDataMaintenanceAtStartup(f.db.userDataPath));
    assert.equal(f.db.getRestoreReconciliationStatus().state, 'activation_pending');
    assert.equal(f.db.getSyncRuntimeStatus().enabled, false);
    assert.deepEqual(f.db.getPendingSyncJobs().map(j => j.jobType).sort(), Object.keys(DESKTOP_PUBLICATIONS).sort(), 'registry-to-staged restore coverage');
    assert.ok(f.db.getPendingSyncJobs().every(j => j.sourceRevision === 1), 'new epoch starts normally, not by chasing remote revisions');
  };
  const post = async (path, body, headers = {}) => {
    storage("$db->exec('DELETE FROM public_request_guard_events');");
    const response = await nativeFetch(`${config.baseUrl}/api/${path}.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  };
  let coordinator;
  // Imported Orders and acknowledged publication statuses now invalidate the
  // canonical Android projection. Let normal recovery cycles drain that work.
  const finishRecovery = async () => {
    for (let cycle = 0; cycle < 5 && f.db.getRestoreReconciliationStatus().state !== 'complete'; cycle++) {
      const result = await coordinator.run(false); assert.equal(result.ok, true, result.message);
    }
    assert.equal(f.db.getRestoreReconciliationStatus().state, 'complete');
    assert.equal(f.db.getSyncRuntimeStatus().pendingJobs, 0, 'recovery cannot complete with requeued projection work');
    const snapshot = storage("echo json_encode(ya_storage_get_publication('android_snapshot', []));");
    assert.equal(snapshot.commerce.order_counts.reduce((sum, row) => sum + row.count, 0), orders().length,
      'the completed Android projection includes replayed canonical Orders');
  };
  try {
    // B: fail midway through queuing the registry. SQLite rolls back identity,
    // cleanup and every job, not just the failing kind. Retry queues the full set.
    const atomic = new DatabaseSync(':memory:');
    try {
      atomic.exec(readFileSync('apps/desktop-app/db/schema.sql', 'utf8'));
      atomic.exec("CREATE TEMP TRIGGER fail_restore_queue BEFORE INSERT ON sync_outbox WHEN NEW.job_type='google_reviews_settings_publish' BEGIN SELECT RAISE(ABORT, 'queue crash injection'); END;");
      const before = atomic.prepare('SELECT * FROM sync_outbox').all();
      assert.throws(() => beginRestoreReconciliation(atomic, 'restore-atomic', 'desktop-atomic'), /queue crash injection/);
      assert.deepEqual(atomic.prepare('SELECT * FROM sync_outbox').all(), before);
      assert.equal(atomic.prepare('SELECT COUNT(*) AS n FROM sync_restore_reconciliation').get().n, 0);
      atomic.exec('DROP TRIGGER fail_restore_queue');
      beginRestoreReconciliation(atomic, 'restore-atomic', 'desktop-atomic');
      assert.equal(atomic.prepare('SELECT COUNT(*) AS n FROM sync_restore_publications').get().n, Object.keys(DESKTOP_PUBLICATIONS).length);
    } finally { atomic.close(); }
    const remote = await core.readRestoreSyncState(config);
    const client = f.db.getSyncRuntimeStatus().clientId;
    const activated = await core.activatePublicationSource({ ...config, clientId: client, expectedEpoch: remote.source_epoch, activationKey: `${client}:test` });
    assert.equal(activated.ok, true, activated.message);
    f.db.savePublicationSourceEpoch(config.baseUrl, activated.source_epoch);
    setPublicationFixtureCapability({ capability: C.ONLINE_SALES, enabled: true });
    setPublicationFixtureCapability({ capability: C.REQUESTS, enabled: true });
    for (const capability of [C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_RESERVATIONS, C.FOOD_TABLES, C.FOOD_MENU, C.QR_MENU, C.ANDROID, C.AI]) {
      setPublicationFixtureCapability({ capability, enabled: true });
    }
    mutate("UPDATE settings SET dealer_portal_enabled=1, online_sales_delivery_enabled=1, online_sales_pickup_enabled=1, google_place_id='restore-place-A'; UPDATE business SET name='Restore A', display_name='Restore A';");
    mutate(`UPDATE business SET publish_tables_web=1;
      INSERT INTO rooms(id,name,number,capacity,status,created_at,updated_at) VALUES ('restore-room','Room A','101',2,'available','2026-10-06','2026-10-06');
      INSERT INTO reservations(id,reservation_type,status,title,start_date,end_date,room_ids_json,created_at,updated_at)
        VALUES ('restore-block','room','approved','Private booking','2030-07-18','2030-07-20','["restore-room"]','2026-10-06','2026-10-06');
      INSERT INTO tables(id,name,capacity,created_at,updated_at) VALUES ('restore-table','Table A',4,'2026-10-06','2026-10-06');
      INSERT INTO menu_categories(id,name,created_at,updated_at) VALUES ('restore-category','Menu A','2026-10-06','2026-10-06');`);
    const productInput = { name: 'Restore product', sku: 'RESTORE-SKU', salePrice: 100, dealerPriceA: 80, dealerPriceB: 60,
      purchasePrice: 50, currency: 'TRY', unit: 'piece', taxRate: 20, trackInventory: false, isActive: true };
    const product = saveRuntimeCatalogProduct(f.db.databasePath, productInput);
    const customer = f.db.saveCustomer({ fullName: 'Restore dealer', phone: '05550001199', email: '', notes: '', tags: [],
      commercialProfile: { companyName: 'Restore dealer', dealerStatus: 'active', priceGroup: 'dealer_a' } });
    assert.equal(customer.ok, true, customer.message);
    f.db.changeDealerWebAccess(customer.savedId, 'enable');
    const invite = f.db.changeDealerWebAccess(customer.savedId, 'invite');
    const token = new URL(invite.inviteUrl).hash.slice(8);
    const asset = f.media.importBytes(imageBytes, 'upload');
    const content = f.service.saveContent(editorialInput({ mediaAssetIds: [asset.id] }));
    let pub = f.service.savePublication({ contentId: content.content.id, channel: 'website', placement: 'homepage_feature', title: 'Restore A', text: 'Backup A', mediaAssetIds: [asset.id] });
    pub = f.service.publish(pub.id, pub.revision);
    coordinator = makeCoordinator();
    let result = await coordinator.runNow(); assert.equal(result.ok, true, result.message);
    const a = backup(); // T1: no Web-owned request/order yet
    const claim = await post('dealer/claim', { invite_token: token }, { 'X-YA-Dealer': '1' });
    assert.equal(claim.status, 200); const cookie = claim.cookie.split(';')[0];
    f.service.savePublication({ ...pub, expectedRevision: pub.revision, title: 'Remote B', text: 'Newer B' });
    mutate("UPDATE business SET name='Remote B', display_name='Remote B'; UPDATE settings SET google_place_id='restore-place-B';");
    mutate("UPDATE rooms SET name='Room B'; UPDATE reservations SET end_date='2030-07-25'; UPDATE tables SET name='Table B'; UPDATE menu_categories SET name='Menu B';");
    saveRuntimeCatalogProduct(f.db.databasePath, { ...productInput, id: product.id, salePrice: 140, dealerPriceA: 90 });
    const guest = await post('order', { idempotencyKey: 'restore-guest-order-01', items: [{ productId: product.id, quantity: 2 }],
      buyer: { name: 'Restore guest', phone: '05550001234' }, delivery: { method: 'pickup' }, note: 'Original intent' });
    assert.equal(guest.status, 201, JSON.stringify(guest.body));
    const dealer = await post('dealer/order', { idempotencyKey: 'restore-dealer-order-01', items: [{ productId: product.id, quantity: 3 }], delivery: { method: 'pickup' } }, { Cookie: cookie, 'X-YA-Dealer': '1' });
    assert.equal(dealer.status, 201, JSON.stringify(dealer.body));
    // Use the public ingress to exercise receipt ownership and ack retention.
    const request = await post('request', { idempotency_key: 'restore-public-request-01', request_type: 'pension_reservation', customer_name: 'Restore request', customer_phone: '05550001334', date_text: '18 Temmuz', start_date: '2030-07-18', end_date: '2030-07-20', guest_count: 2, message: 'Contact please', source: 'web' });
    assert.equal(request.status, 201, JSON.stringify(request.body));
    result = await coordinator.runNow(); assert.equal(result.ok, true, result.message);
    const privateIdentity = { ...config, clientId: client, sourceEpoch: activated.source_epoch, sourceRevision: 999, idempotencyKey: 'restore-private-B' };
    assert.equal((await core.pushGoogleReviewsSettings({ ...privateIdentity, settings: { enabled: true, place_id: 'restore-place-B', api_key: 'RESTORE_PRIVATE_SENTINEL' } })).ok, true);
    assert.equal((await core.pushAiSettings({ ...privateIdentity, aiSettings: { enabled: true, provider: 'openai_compatible', service: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'restore-B', apiKey: 'RESTORE_PRIVATE_SENTINEL', timeoutSeconds: 30 } })).ok, true);
    const acceptedOrders = orders(); assert.equal(acceptedOrders.length, 2);
    const historicalPrices = acceptedOrders.map(o => [o.sourceReference, o.total]).sort();
    assert.equal(storage('echo $db->query("SELECT COUNT(*) FROM web_orders WHERE imported_at <> \'\'")->fetchColumn();'), 2);
    const webOwnedCounts = storage('echo json_encode([$db->query("SELECT COUNT(*) FROM web_order_submission_receipts")->fetchColumn(), $db->query("SELECT COUNT(*) FROM web_request_submission_receipts")->fetchColumn()]);');
    // Backup prices/access differ from the accepted canonical snapshots, and B has
    // newer high-water revisions plus an unrelated frozen body awaiting retry.
    saveRuntimeCatalogProduct(f.db.databasePath, { ...productInput, id: product.id, salePrice: 200, dealerPriceA: 120 });
    // Current remote access is ahead of backup, with a different consumed invite.
    // Restoring the lower revision must use new epoch authority, not resurrect T1's invite.
    const newerInvite = f.db.changeDealerWebAccess(customer.savedId, 'invite');
    const newerClaim = await post('dealer/claim', { invite_token: new URL(newerInvite.inviteUrl).hash.slice(8) }, { 'X-YA-Dealer': '1' });
    // The new invite must be published before claim.
    assert.notEqual(newerClaim.status, 200);
    result = await coordinator.runNow(); assert.equal(result.ok, true, result.message);
    const liveClaim = await post('dealer/claim', { invite_token: new URL(newerInvite.inviteUrl).hash.slice(8) }, { 'X-YA-Dealer': '1' });
    assert.equal(liveClaim.status, 200); const liveCookie = liveClaim.cookie.split(';')[0];
    f.db.queueSyncJob('marketing_website_publish');
    f.db.prepareSyncPublication('marketing_website_publish', { projection: { version: 1, enabled: false, publications: [] }, sent: [] });
    const oldEpoch = activated.source_epoch;
    failPreparation = true;
    const abortedRestore = await handlers.get('dataMaintenance:restoreBackup')({ sender: {} }, a);
    assert.equal(abortedRestore.ok, false);
    assert.equal(f.db.getSyncRuntimeStatus().clientId, client, 'preparation failure preserves current authority/DB');
    assert.equal(maintenanceErrors.at(-1).event, 'restore.republish.failed');
    assert.equal(maintenanceErrors.at(-1).scope, 'restore');
    assert.equal(maintenanceErrors.at(-1).error.message, 'restore preparation injection', 'structured diagnostic keeps the Error, not flattened text');
    failPreparation = false;
    await restore(a);
    assert.equal(orders().length, 0);
    const newClient = f.db.getSyncRuntimeStatus().clientId; assert.notEqual(newClient, client);
    const operationId = f.db.getRestoreReconciliationStatus().operationId;
    const recoveryDb = new DatabaseSync(f.db.databasePath);
    const retainedGuest = recoveryDb.prepare('SELECT * FROM sync_restore_order_snapshots WHERE web_order_id=?').get(guest.body.order_id);
    assert.ok(retainedGuest);
    recoveryDb.prepare('DELETE FROM sync_restore_order_snapshots WHERE web_order_id=?').run(guest.body.order_id);
    recoveryDb.close();
    // A: offline activation leaves durable staged work; no backup source publication.
    globalThis.fetch = async () => { throw new Error('offline injection'); };
    coordinator = makeCoordinator();
    result = await coordinator.run(false); assert.equal(result.ok, false);
    assert.equal(f.db.getRestoreReconciliationStatus().state, 'activation_pending');
    assert.equal(f.db.getSyncRuntimeStatus().pendingJobs, Object.keys(DESKTOP_PUBLICATIONS).length);
    globalThis.fetch = nativeFetch;
    // A/E: activation is accepted, exact response lost. Restart reuses the same CAS key.
    let lostActivation = false;
    globalThis.fetch = async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      const response = await nativeFetch(url, init);
      if (body.action === 'activate_publication_source' && !lostActivation) { lostActivation = true; throw new Error('activation response lost'); }
      return response;
    };
    result = await coordinator.run(false); assert.equal(result.ok, false); assert.equal(lostActivation, true);
    assert.equal(f.db.getRestoreReconciliationStatus().operationId, operationId);
    assert.equal(f.db.getRestoreReconciliationStatus().state, 'activation_pending');
    f.reopen(); coordinator = makeCoordinator();
    // C/E: some projections applied; one exact receipt lost; the rest hit an outage.
    let lostReceipt = false;
    globalThis.fetch = async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (lostReceipt && /publish_|availability-sync/.test(String(body.action ?? url))) throw new Error('partial apply offline');
      const response = await nativeFetch(url, init);
      if (body.action === 'publish_table_catalog' && !lostReceipt) { lostReceipt = true; throw new Error('publication response lost'); }
      return response;
    };
    result = await coordinator.run(false); assert.equal(lostReceipt, true); assert.equal(result.ok, false);
    assert.equal(f.db.getRestoreReconciliationStatus().state, 'reconciliation_pending');
    assert.ok(f.db.getRestoreReconciliationStatus().remainingPublications > 0);
    assert.ok(f.db.getRestoreReconciliationStatus().remainingPublications < Object.keys(DESKTOP_PUBLICATIONS).length);
    assert.equal(f.db.getSyncRuntimeStatus().webOrderCursor, 0, 'missing canonical price evidence never advances/ACKs away the history');
    assert.equal(orders().length, 0, 'missing evidence does not reprice from the restored catalog');
    const newEpoch = f.db.getRestoreReconciliationStatus().sourceEpoch;
    assert.equal(newEpoch, oldEpoch + 1);
    // D: even a previously accepted receipt from the old epoch is permanently fenced.
    globalThis.fetch = nativeFetch;
    assert.equal((await core.pushMenu({ ...config, clientId: client, sourceEpoch: oldEpoch, sourceRevision: 99999, idempotencyKey: 'restore-delayed-old', menu: { enabled: true, categories: [], items: [], updated_at: '' } })).ok, false);
    assert.equal((await core.pushAvailability({ ...config, clientId: client, sourceEpoch: oldEpoch, sourceRevision: 99999, idempotencyKey: 'restore-delayed-heartbeat',
      availability: { schema_version: 1, enabled: false, generated_at: new Date().toISOString(), rooms: [], blocks: [] } })).ok, false);
    const recovered = new DatabaseSync(f.db.databasePath);
    recovered.prepare('INSERT INTO sync_restore_order_snapshots(web_order_id,snapshot_json) VALUES (?,?)').run(retainedGuest.web_order_id, retainedGuest.snapshot_json);
    recovered.close();
    f.reopen(); mutate("UPDATE sync_outbox SET next_attempt_at=''"); coordinator = makeCoordinator();
    result = await coordinator.run(false); assert.equal(result.ok, true, result.message);
    await finishRecovery();
    assert.equal(f.db.getSyncRuntimeStatus().enabled, false, 'explicit recovery does not change passive sync preference');
    const remoteNames = storage(`$q=$db->prepare('SELECT name FROM publications WHERE source_epoch = ? ORDER BY name'); $q->execute([${newEpoch}]); echo json_encode($q->fetchAll(PDO::FETCH_COLUMN));`);
    assert.deepEqual(remoteNames, Object.values(DESKTOP_PUBLICATIONS).map(p => p.name).sort(), 'every registry kind actually applied under restored authority');
    const marketing = await nativeFetch(`${config.baseUrl}/api/marketing.php`).then(r => r.json());
    assert.equal(marketing.publications[0].title, 'Restore A'); assert.equal(marketing.publications[0].text, 'Backup A');
    const names = storage("echo json_encode(ya_storage_get_publication('business_context', []));"); assert.equal(names.business_name ?? names.businessName, 'Restore A');
    const google = storage("echo $db->query(\"SELECT config_json FROM private_publication_config WHERE name='google_reviews_settings'\")->fetchColumn();"); assert.equal(google.place_id, 'restore-place-A');
    assert.equal(google.enabled, false); assert.equal(google.api_key, '');
    const ai = storage("echo $db->query(\"SELECT config_json FROM private_publication_config WHERE name='ai_settings'\")->fetchColumn();"); assert.equal(ai.enabled, false); assert.equal(ai.api_key, '');
    assert.equal(f.db.getEnabledBusinessCapabilities().includes(C.AI), true, 'unconfigured provider withdrawal preserves installed capability/desired configuration');
    assert.equal(storage("echo json_encode(ya_storage_get_publication('room_catalog', []));").rooms[0].name, 'Room A');
    assert.equal(storage("echo json_encode(ya_storage_get_publication('table_catalog', []));").tables[0].name, 'Table A');
    assert.equal(storage("echo json_encode(ya_storage_get_publication('menu', []));").categories[0].name, 'Menu A');
    assert.equal(storage("echo json_encode(ya_storage_get_publication('public_room_availability', []));").blocks[0].end_date, '2030-07-20');
    assert.equal(storage("echo json_encode($db->query('SELECT payload_json FROM publications')->fetchAll(PDO::FETCH_COLUMN));").join('').includes('RESTORE_PRIVATE_SENTINEL'), false);
    assert.deepEqual(orders().map(o => [o.sourceReference, o.total]).sort(), historicalPrices, 'replay preserves canonical pricing, not restored current product pricing');
    assert.equal(f.db.getDashboardData().requests.length, 1);
    assert.deepEqual(storage('echo json_encode([$db->query("SELECT COUNT(*) FROM web_order_submission_receipts")->fetchColumn(), $db->query("SELECT COUNT(*) FROM web_request_submission_receipts")->fetchColumn()]);'), webOwnedCounts);
    assert.equal((await post('dealer/claim', { invite_token: token }, { 'X-YA-Dealer': '1' })).status, 400, 'consumed T1 invite stays consumed after restored epoch');
    assert.equal((await nativeFetch(`${config.baseUrl}/api/dealer/session.php`, { headers: { Cookie: liveCookie } })).status, 401, 'old epoch session is invalidated by normal access apply');
    // F: same operation restart is a no-op; another explicit restore has a fresh epoch
    // and replays the same identities with no duplicate business side effects.
    const jobsBefore = f.db.getSyncRuntimeStatus().pendingJobs;
    f.db.beginRestoreReconciliation(operationId, newClient); assert.equal(f.db.getSyncRuntimeStatus().pendingJobs, jobsBefore);
    await restore(a); coordinator = makeCoordinator();
    result = await coordinator.run(false); assert.equal(result.ok, true, result.message);
    await finishRecovery(); assert.equal(orders().length, 2);
    assert.equal(f.db.getDashboardData().requests.length, 1);
    // OFF backup: full reconciliation withdraws an enabled remote marketing/menu.
    setPublicationFixtureCapability({ capability: C.MARKETING_STUDIO, enabled: false });
    setPublicationFixtureCapability({ capability: C.QR_MENU, enabled: false });
    f.db.changeDealerWebAccess(customer.savedId, 'disable');
    const localRequest = f.db.getDashboardData().requests[0];
    assert.equal(f.db.updateRequestStatus({ requestId: localRequest.id, status: 'approved' }).ok, true);
    mutate("UPDATE commerce_orders SET status='confirmed';");
    const off = backup();
    setPublicationFixtureCapability({ capability: C.MARKETING_STUDIO, enabled: true });
    setPublicationFixtureCapability({ capability: C.QR_MENU, enabled: true });
    f.db.changeDealerWebAccess(customer.savedId, 'enable');
    const offRaceInvite = f.db.changeDealerWebAccess(customer.savedId, 'invite');
    result = await coordinator.runNow(); assert.equal(result.ok, true, result.message);
    const offRaceClaim = await post('dealer/claim', { invite_token: new URL(offRaceInvite.inviteUrl).hash.slice(8) }, { 'X-YA-Dealer': '1' });
    assert.equal(offRaceClaim.status, 200); const offRaceCookie = offRaceClaim.cookie.split(';')[0];
    await restore(off); coordinator = makeCoordinator();
    result = await coordinator.run(false); assert.equal(result.ok, true, result.message);
    await finishRecovery();
    assert.deepEqual((await nativeFetch(`${config.baseUrl}/api/marketing.php`).then(r => r.json())).publications, []);
    assert.equal(storage("echo json_encode(ya_storage_get_publication('menu', []));").enabled, false);
    assert.equal(f.db.getDashboardData().requests[0].status, 'approved', 'same-ID replay preserves restored local owner decisions');
    assert.equal(storage(`echo $db->query("SELECT enabled FROM dealer_access WHERE access_id='${invite.access.accessId}'")->fetchColumn();`), 0, 'restored disabled canonical dealer access withdraws newer remote authorization');
    assert.equal((await nativeFetch(`${config.baseUrl}/api/dealer/session.php`, { headers: { Cookie: offRaceCookie } })).status, 401);
    assert.equal(orders().length, 2); assert.equal(f.db.getDashboardData().requests.length, 1);
    assert.ok(orders().every(order => order.status === 'confirmed'), 'restored canonical order decisions survive replay');
    console.log('restore reconciliation: staged registry coverage, new epoch, offline/CAS lost response, crash/partial apply, exact receipts, request/order replay, canonical historical prices, marketing/OFF, consumed invites and session fencing PASS');
  } finally { globalThis.fetch = nativeFetch; coordinator?.stop(); f.dispose(); }
}
