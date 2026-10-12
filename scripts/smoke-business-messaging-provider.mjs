import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { credentials, configuration, providerFixture, secretFixture, serviceFixture, statusSyncFixture } from './test-helpers/business-messaging-fixtures.mjs';
import { verifySendAuthorityRaces } from './test-helpers/business-messaging-send-races.mjs';
const require = createRequire(import.meta.url);
const { DesktopDatabase } = require('../apps/desktop-app/dist-electron/database.js');
const { WhatsAppCloudProviderAdapter } = require('../apps/desktop-app/dist-electron/business-messaging/whatsapp-cloud-provider.js');
const { BUSINESS_CAPABILITIES: C } = require('../packages/shared/dist');
const http = providerFixture(), secrets = secretFixture(), logs = [];
const adapter = new WhatsAppCloudProviderAdapter(credentials, { fetchImpl: http.fetchImpl, timeoutMs: 100 });
assert.ok((await adapter.testConnection()).displayPhoneNumber);
assert.ok(http.calls.every((call) => call.method === 'GET'), 'connection check is read-only');
http.state.mismatch = true;
await assert.rejects(adapter.testConnection(), (error) => error.code === 'account_mismatch'); http.state.mismatch = false;
const invalid = new WhatsAppCloudProviderAdapter(credentials, { fetchImpl: async () => Response.json({ error: { code: 190, message: credentials.accessToken } }, { status: 401 }) });
await assert.rejects(invalid.testConnection(), (error) => error.code === 'provider_190' && !error.message.includes(credentials.accessToken));
http.state.malformed = true; await assert.rejects(adapter.testConnection(), (error) => error.code === 'invalid_response'); http.state.malformed = false;
const timeout = new WhatsAppCloudProviderAdapter(credentials, { timeoutMs: 10, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('secret')))) });
await assert.rejects(timeout.testConnection(), (error) => error.code === 'timeout');
const oversized = new WhatsAppCloudProviderAdapter(credentials, { fetchImpl: async () => new Response('x'.repeat(1048577)) });
await assert.rejects(oversized.testConnection(), (error) => error.code === 'response_too_large');
const catalog = await adapter.listTemplates(); assert.equal(catalog.length, 3); assert.equal(catalog.find((item) => item.name === 'media_template').supported, false);
assert.deepEqual(catalog.find((item) => item.name === 'named_template').components[0].parameters, ['first_name']);
let pages = 0;
const paging = new WhatsAppCloudProviderAdapter(credentials, { fetchImpl: async (url) => {
  pages++; if (pages === 1) return Response.json({ data: [], paging: { next: 'https://attacker.test/?access_token=private', cursors: { after: 'opaque' } } });
  assert.equal(new URL(url).hostname, 'graph.facebook.com'); assert.equal(new URL(url).searchParams.get('after'), 'opaque');
  return Response.json({ data: http.templates });
} });
assert.equal((await paging.listTemplates()).length, 3); assert.equal(pages, 2);
const dir = mkdtempSync(join(tmpdir(), 'business-messaging-'));
const db = new DesktopDatabase({ appPath: resolve('apps/desktop-app'), userDataPath: dir }); let raw;
try {
  db.initialize();
  const setup = { businessName: 'Messaging Fixture', profileId: 'market', profileOptions: [C.CUSTOMERS], phone: '', whatsapp: '', email: '', address: '',
    webModuleUrl: 'https://example.test', syncSecret: 'messaging-fixture-secret', autoSyncEnabled: false, aiEnabled: false,
    aiProvider: 'openai_compatible', aiService: 'openai', aiProjectName: '', aiModel: '', aiBaseUrl: 'https://api.openai.com/v1', aiTimeoutSeconds: 30,
    aiApiKey: '', clearAiApiKey: false, servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] };
  assert.equal(db.saveInitialSetup(setup).ok, true);
  const service = serviceFixture(() => db, http, secrets, logs);
  assert.equal(service.getConfiguration().configured, false); assert.equal((await service.testConnection()).ok, false);
  const write = secrets.createMessagingSecretWrite(configuration); assert.equal(secrets.decryptMessagingSecret(write.encryptedValue), credentials.accessToken);
  assert.ok(!write.encryptedValue.includes(credentials.accessToken));
  secrets.setBackend('basic_text'); assert.throws(() => secrets.createMessagingSecretWrite(configuration), /güvenli/); secrets.setBackend('gnome_libsecret');
  secrets.setAvailable(false); assert.throws(() => secrets.createMessagingSecretWrite(configuration), /güvenli/); secrets.setAvailable(true);
  assert.equal(db.saveInitialSetup({ ...setup, whatsappCloud: { ...configuration, accessToken: '' } }, undefined, undefined, undefined, write).ok, true);
  assert.equal(service.getConfiguration().configured, true);
  assert.ok(!JSON.stringify(db.getSetupData()).includes(credentials.accessToken)); assert.ok(!JSON.stringify(service.getConfiguration()).includes('encrypted'));
  assert.ok(!('accessToken' in service.getConfiguration()));
  raw = new DatabaseSync(db.databasePath);
  const stored = raw.prepare('SELECT * FROM business_messaging_provider_config').get();
  assert.throws(() => db.saveInitialSetup({ ...setup, whatsappCloud: configuration }), /ana süreçte/);
  assert.deepEqual(raw.prepare('SELECT * FROM business_messaging_provider_config').get(), stored, 'setup rolls back plaintext bypass');
  assert.equal((await service.testConnection()).ok, true);
  const customer = db.saveCustomer({ fullName: 'CUSTOMER_PRIVATE', phone: '05550000000', email: '', notes: '', tags: [] });
  assert.equal(customer.ok, true); const customerId = customer.savedId;
  const canonicalBefore = raw.prepare('SELECT * FROM customers WHERE id=?').get(customerId);
  const ordersBefore = raw.prepare('SELECT * FROM commerce_orders').all();
  const salesBefore = raw.prepare('SELECT * FROM commerce_sales').all();
  const input = { customerId, templateName: 'fixture_template', templateLanguage: 'tr', parameters: [['PARAMETER_PRIVATE']] };
  const intent = await service.prepare({ ...input, providerMessageId: 'fake.client.reference', recipient: '19999999999' }); assert.equal(intent.status, 'draft'); assert.equal(intent.providerMessageId, '');
  const sent = await service.send(intent.id, input.parameters); assert.equal(sent.status, 'accepted'); assert.equal(sent.providerMessageId, 'wamid.fixture1');
  await service.send(intent.id, input.parameters); assert.equal(http.calls.filter((call) => call.method === 'POST').length, 1);
  await assert.rejects(service.send(intent.id, [['changed']]), (error) => error.code === 'intent_conflict');
  assert.ok(!readFileSync(db.databasePath).includes(Buffer.from('PARAMETER_PRIVATE')), 'parameter values are not persisted');
  const sentBody = http.calls.find((call) => call.method === 'POST').body;
  assert.equal(sentBody.biz_opaque_callback_data, intent.id); assert.equal(sentBody.to, '905550000000');
  const rejected = await service.prepare(input); http.state.reject = true;
  assert.equal((await service.send(rejected.id, input.parameters)).failureCode, 'provider_131026'); http.state.reject = false;
  await service.send(rejected.id, input.parameters); assert.equal(http.calls.filter((call) => call.method === 'POST').length, 2);
  const duplicate = await service.prepare(input); http.state.duplicate = true;
  assert.equal((await service.send(duplicate.id, input.parameters)).failureCode, 'duplicate_provider_response'); http.state.duplicate = false;
  assert.equal(service.getMessage(intent.id).status, 'accepted');
  const malformedSend = await service.prepare(input);
  const originalHttp = http.fetchImpl;
  // Invalid acceptance response is uncertain and cannot trigger a repeated POST.
  const brokenSendHttp = { fetchImpl: (url, init) => init.method === 'POST' ? Promise.resolve(Response.json({ messages: [{ id: 'fake' }] })) : originalHttp(url, init) };
  const brokenService = serviceFixture(() => db, brokenSendHttp, secrets, logs);
  assert.equal((await brokenService.send(malformedSend.id, input.parameters)).failureCode, 'invalid_response');
  assert.equal((await brokenService.send(malformedSend.id, input.parameters)).status, 'failed');
  const stale = await service.prepare(input);
  raw.prepare('UPDATE customers SET phone=? WHERE id=?').run('05551111111', customerId);
  await assert.rejects(service.send(stale.id, input.parameters), (error) => error.code === 'recipient_changed');
  raw.prepare('UPDATE customers SET phone=? WHERE id=?').run(canonicalBefore.phone, customerId);
  assert.equal(db.getBusinessMessage(stale.id).status, 'draft');
  const lost = await service.prepare(input); http.state.lost = true;
  assert.equal((await service.send(lost.id, input.parameters)).status, 'failed'); http.state.lost = false;
  const restarted = serviceFixture(() => db, http, secrets, logs);
  const posts = http.calls.filter((call) => call.method === 'POST').length;
  await restarted.send(lost.id, input.parameters); assert.equal(http.calls.filter((call) => call.method === 'POST').length, posts);
  const accountKey = String(db.getMessageBinding(lost.id).account_key), timestamp = new Date().toISOString();
  assert.equal(db.applyBusinessMessageStatus({ providerMessageId: 'wamid.recovered', messageId: lost.id, accountKey, status: 'delivered', timestamp }).status, 'delivered');
  db.applyBusinessMessageStatus({ providerMessageId: 'wamid.recovered', accountKey, status: 'read', timestamp });
  const read = db.getBusinessMessage(lost.id);
  assert.deepEqual(db.applyBusinessMessageStatus({ providerMessageId: 'wamid.recovered', accountKey, status: 'read', timestamp }), read, 'duplicate webhook is idempotent');
  assert.equal(db.applyBusinessMessageStatus({ providerMessageId: 'wamid.recovered', accountKey, status: 'accepted', timestamp }).status, 'read');
  assert.equal(db.getBusinessMessage(lost.id).acceptedAt, timestamp, 'late acceptance records its milestone without downgrading read');
  assert.equal(db.applyBusinessMessageStatus({ providerMessageId: 'wamid.recovered', accountKey, status: 'failed', timestamp }).status, 'read');
  assert.equal(db.applyBusinessMessageStatus({ providerMessageId: 'wamid.unknown', accountKey, status: 'read', timestamp }), null);
  assert.equal(db.applyBusinessMessageStatus({ providerMessageId: 'wamid.fixture1', accountKey: 'wrong', status: 'read', timestamp }), null);
  const queued = await service.prepare(input); assert.equal(db.claimBusinessMessage(queued.id), true);
  const fail = db.applyBusinessMessageStatus({ providerMessageId: 'wamid.failed', messageId: queued.id, accountKey, status: 'failed', failureCode: 'provider_131026', timestamp }); assert.equal(fail.status, 'failed');
  assert.equal(db.applyBusinessMessageStatus({ providerMessageId: 'wamid.failed', accountKey, status: 'accepted', timestamp }).status, 'failed', 'late sent/acceptance does not erase confirmed provider failure');
  const named = await service.prepare({ ...input, templateName: 'named_template', templateLanguage: 'en_US' });
  await service.send(named.id, input.parameters);
  assert.equal(http.calls.at(-1).body.template.components[0].parameters[0].parameter_name, 'first_name');
  let release; http.state.delay = new Promise((resolve) => { release = resolve; });
  const concurrent = await service.prepare(input); const pending = service.send(concurrent.id, input.parameters);
  await new Promise((resolve) => setTimeout(resolve, 15)); await service.send(concurrent.id, input.parameters); release(); await pending; http.state.delay = null;
  assert.equal(http.calls.filter((call) => call.body?.biz_opaque_callback_data === concurrent.id).length, 1);
  const crash = await service.prepare(input); db.claimBusinessMessage(crash.id);
  assert.equal((await restarted.send(crash.id, input.parameters)).status, 'queued');
  assert.equal(http.calls.filter((call) => call.body?.biz_opaque_callback_data === crash.id).length, 0);
  // Actual status transport: apply before ACK, lost ACK replays, unknown ids safely ACKed.
  let ackFailed = true, acks = 0, changed = 0;
  const rows = [{ seq: 1, providerMessageId: sent.providerMessageId, accountKey, status: 'delivered', timestamp }, { seq: 2, providerMessageId: 'wamid.unknown', accountKey, status: 'read', timestamp }];
  const sync = statusSyncFixture(() => db, () => changed++, async (_url, init) => {
    if (init.method === 'GET') return Response.json({ ok: true, statuses: acks ? [] : rows });
    assert.equal(db.getBusinessMessage(intent.id).status, 'delivered');
    if (ackFailed) { ackFailed = false; throw new Error('sensitive network failure'); }
    assert.deepEqual(JSON.parse(init.body).ack, [1, 2]); acks++; return Response.json({ ok: true });
  }, logs);
  const config = { baseUrl: 'https://example.test', syncSecret: 'messaging-fixture-secret' };
  assert.ok(await sync.pull(config)); assert.equal(await sync.pull(config), ''); assert.equal(acks, 1); assert.equal(changed, 2);
  assert.deepEqual(raw.prepare('SELECT * FROM customers WHERE id=?').get(customerId), canonicalBefore);
  assert.deepEqual(raw.prepare('SELECT * FROM commerce_orders').all(), ordersBefore); assert.deepEqual(raw.prepare('SELECT * FROM commerce_sales').all(), salesBefore);
  await verifySendAuthorityRaces({ db, raw, http, secrets, logs, input });
  const serialized = JSON.stringify(logs);
  for (const sensitive of [credentials.accessToken, 'fixture_ROTATED_only', '905550000000', 'PARAMETER_PRIVATE', 'CUSTOMER_PRIVATE', config.syncSecret]) assert.ok(!serialized.includes(sensitive));
  for (const event of ['connection.test', 'template.list', 'send.started', 'send.succeeded', 'send.failed', 'webhook.status']) assert.ok(logs.some((row) => row.event === `business-messaging.${event}`));
  secrets.setAvailable(false); assert.equal(service.getConfiguration().configured, false); secrets.setAvailable(true);
  const clear = secrets.createMessagingSecretWrite({ ...configuration, clearAccessToken: true });
  assert.equal(db.saveInitialSetup({ ...setup, whatsappCloud: { ...configuration, accessToken: '', clearAccessToken: true } }, undefined, undefined, undefined, clear).ok, false,
    'cannot persist enabled configuration without its required secret');
  assert.equal(db.saveInitialSetup({ ...setup, whatsappCloud: { ...configuration, enabled: false, accessToken: '', clearAccessToken: true } }, undefined, undefined, undefined, clear).ok, true);
  assert.equal(service.getConfiguration().hasSecret, false);
  // Actual IPC handlers enforce the session gate before service reads/mutations.
  const handlers = new Map(), ipcExports = {}; let locked = true, notified = 0;
  const ipcRequire = createRequire(new URL('../apps/desktop-app/dist-electron/ipc/business-messaging-ipc.js', import.meta.url));
  runInNewContext(readFileSync(new URL('../apps/desktop-app/dist-electron/ipc/business-messaging-ipc.js', import.meta.url), 'utf8'), { exports: ipcExports,
    require: (name) => name === 'electron' ? { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } } : ipcRequire(name) });
  ipcExports.registerBusinessMessagingIpc({ service, assertUnlocked: () => { if (locked) throw new Error('locked'); }, onChanged: () => notified++ });
  for (const [channel, handler] of handlers) {
    if (['businessMessaging:configuration','businessMessaging:testConnection'].includes(channel)) assert.throws(() => handler(null), /locked/);
    else await assert.rejects(handler(null), /locked/);
  }
  locked = false; assert.equal(handlers.get('businessMessaging:configuration')(null).hasSecret, false);
  assert.equal((await handlers.get('businessMessaging:send')(null, intent.id, input.parameters)).value.providerMessageId, 'wamid.fixture1'); assert.equal(notified, 1);

  console.log('Business messaging provider, encrypted credentials, intents, idempotency, status sync and privacy smoke passed.');
} finally { raw?.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
