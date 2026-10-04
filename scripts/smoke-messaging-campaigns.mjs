import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { C, campaignFixture, campaignInput, createCustomer, preference } from './test-helpers/messaging-campaign-fixtures.mjs';
const require = createRequire(import.meta.url);
const { getBusinessProfiles } = require('../packages/shared/dist');
const fixture = campaignFixture(), { db, service, http, single, logs, catalog } = fixture;
const raw = new DatabaseSync(db.databasePath);
const count = (table, campaignId) => Number(raw.prepare(`SELECT COUNT(*) AS n FROM ${table}${campaignId ? ' WHERE campaign_id=?' : ''}`).get(...(campaignId ? [campaignId] : [])).n);
const outbox = (id) => raw.prepare('SELECT * FROM messaging_outbox WHERE campaign_id=? ORDER BY customer_id').all(id);
const recipients = (id) => raw.prepare('SELECT * FROM messaging_campaign_recipients WHERE campaign_id=? ORDER BY customer_id').all(id);
const failCode = (code) => (error) => error.code === code;
try {
  for (const profile of getBusinessProfiles()) {
    assert.ok(profile.optionalCapabilities.includes(C.MESSAGING_CAMPAIGNS));
    assert.ok(!profile.defaultCapabilities.includes(C.MESSAGING_CAMPAIGNS));
  }
  const allowed = createCustomer(db, 'CUSTOMER_PRIVATE');
  const unknown = createCustomer(db, 'Unknown');
  const denied = createCustomer(db, 'Denied');
  const noPhone = createCustomer(db, 'Missing', '');
  const invalidPhone = createCustomer(db, 'Invalid phone');
  // Existing/imported canonical data may have an unusable phone even though current UI validates writes.
  raw.prepare('UPDATE customers SET phone=? WHERE id=?').run('bad', invalidPhone);
  const dealer = createCustomer(db, 'Dealer', '05551111111', { companyName: 'COMPANY_PRIVATE', dealerStatus: 'active', priceGroup: 'dealer_a' });
  const deleted = createCustomer(db, 'Deleted');
  assert.equal(db.deleteCustomer(deleted).ok, true);
  assert.equal(service.getPreference(unknown, 'whatsapp', 'marketing').status, 'unknown');
  assert.equal(count('customer_messaging_preferences'), 0, 'default unknown is read-only');
  service.savePreference(preference(allowed, 'opted_in')); service.savePreference(preference(denied, 'opted_out'));
  service.savePreference(preference(noPhone, 'opted_in')); service.savePreference(preference(invalidPhone, 'opted_in')); service.savePreference(preference(dealer, 'opted_in'));
  service.savePreference(preference(allowed, 'opted_out', 'sms'));
  assert.equal(service.getPreference(allowed, 'whatsapp', 'marketing').status, 'opted_in', 'consent is channel-specific');
  assert.throws(() => service.savePreference({ ...preference(allowed, 'opted_in'), purpose: 'operational' }), failCode('invalid_purpose'));
  assert.throws(() => service.savePreference({ ...preference(allowed, 'opted_in'), note: 'x'.repeat(501) }), failCode('invalid_input'));
  const all = service.saveSegment({ name: 'All', filterDefinition: { version: 1, rules: [] } });
  const dealerSegment = service.saveSegment({ name: 'Active dealers', filterDefinition: { version: 1, rules: [{ field: 'dealerStatus', operator: 'eq', value: 'active' }] } });
  assert.equal(service.previewSegment(dealerSegment.id, 'whatsapp').matchedCount, 1);
  const noPhoneSegment = service.saveSegment({ name: 'No phone', filterDefinition: { version: 1, rules: [{ field: 'phone', operator: 'absent' }] } });
  assert.equal(service.previewSegment(noPhoneSegment.id, 'whatsapp').missingRecipientCount, 1);
  const sourceSegment = service.saveSegment({ name: 'Manual with phone', filterDefinition: { version: 1, rules: [{ field: 'source', operator: 'eq', value: 'manual' }, { field: 'phone', operator: 'present' }] } });
  assert.equal(service.previewSegment(sourceSegment.id, 'whatsapp').matchedCount, 5);
  for (const filterDefinition of [
    { version: 1, rules: [{ field: 'phone', operator: 'sql', value: 'DROP TABLE customers' }] },
    { version: 1, rules: [{ field: 'full_name', operator: 'eq', value: 'CUSTOMER_PRIVATE' }] },
    { version: 1, rules: [{ field: 'source', operator: 'eq', value: 'malicious' }] },
    { version: 1, rules: [], sql: 'SELECT * FROM customers' },
    { version: 2, rules: [] }, { version: 1, rules: [{ field: 'phone', operator: 'present' }, { field: 'phone', operator: 'absent' }] }
  ]) assert.throws(() => service.saveSegment({ name: 'Bad', filterDefinition }), failCode('invalid_filter'));
  const summary = service.previewSegment(all.id, 'whatsapp');
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), { matchedCount: 6, eligibleCount: 2, unknownConsentCount: 1, optedOutCount: 1, missingRecipientCount: 2 });
  assert.equal(count('messaging_campaign_recipients'), 0); assert.equal(count('messaging_outbox'), 0);
  const created = service.createCampaign(campaignInput(all.id)); assert.equal(created.status, 'draft');
  assert.deepEqual(service.previewCampaign(created.id), summary);
  assert.throws(() => service.createCampaign(campaignInput(all.id, { purpose: 'operational' })), failCode('invalid_campaign'));
  assert.throws(() => service.createCampaign(campaignInput(all.id, { bindings: [[{ type: 'expression', value: 'customer.phone' }]] })), failCode('invalid_bindings'));
  assert.throws(() => service.createCampaign(campaignInput(all.id, { bindings: [[{ type: 'customer_field', field: 'customer.phone' }]] })), failCode('invalid_bindings'));
  const unsupported = service.createCampaign(campaignInput(all.id, { templateName: 'media_template', bindings: [[], []] }));
  await assert.rejects(service.prepareCampaign(unsupported.id), failCode('unsupported_template'));
  const missingTemplate = service.createCampaign(campaignInput(all.id, { templateLanguage: 'zz' }));
  await assert.rejects(service.prepareCampaign(missingTemplate.id), failCode('missing_template'));
  const missingParams = service.createCampaign(campaignInput(all.id, { bindings: [[]] }));
  await assert.rejects(service.prepareCampaign(missingParams.id), failCode('invalid_bindings'));
  const missingCompany = service.createCampaign(campaignInput(all.id, { bindings: [[{ type: 'customer_field', field: 'commercial.companyName' }]] }));
  await assert.rejects(service.prepareCampaign(missingCompany.id), failCode('invalid_input'));
  assert.equal(count('messaging_campaign_recipients', missingCompany.id), 0); assert.equal(count('messaging_outbox', missingCompany.id), 0);
  const badChannel = service.createCampaign(campaignInput(all.id, { channel: 'sms' }));
  await assert.rejects(service.prepareCampaign(badChannel.id), /unavailable/);
  const noProvider = service.createCampaign(campaignInput(all.id, { providerId: undefined }));
  await assert.rejects(service.prepareCampaign(noProvider.id), failCode('missing_provider'));
  // A storage failure after recipient insert rolls back the whole audience/outbox/status transaction.
  const atomic = service.createCampaign(campaignInput(all.id));
  raw.exec("CREATE TRIGGER fixture_prepare_failure BEFORE INSERT ON messaging_outbox BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  await assert.rejects(service.prepareCampaign(atomic.id), /fixture failure/);
  assert.equal(service.getCampaign(atomic.id).campaign.status, 'draft'); assert.equal(count('messaging_campaign_recipients', atomic.id), 0); assert.equal(outbox(atomic.id).length, 0);
  raw.exec('DROP TRIGGER fixture_prepare_failure');
  const prepared = await service.prepareCampaign(created.id);
  assert.equal(prepared.campaign.status, 'prepared'); assert.equal(prepared.matchedCount, 6); assert.equal(prepared.eligibleCount, 2); assert.equal(prepared.pendingOutboxCount, 2); assert.equal(prepared.skippedCount, 4);
  const audience = recipients(created.id), items = outbox(created.id);
  const reasons = new Map(audience.map((row) => [row.customer_id, row.skip_reason]));
  assert.equal(reasons.get(unknown), 'unknown_consent'); assert.equal(reasons.get(denied), 'opted_out'); assert.equal(reasons.get(noPhone), 'missing_recipient'); assert.equal(reasons.get(invalidPhone), 'missing_recipient');
  assert.equal(reasons.get(allowed), ''); assert.equal(reasons.has(deleted), false);
  assert.equal(new Set(items.map((row) => row.operation_key)).size, 2);
  for (const item of items) { assert.equal(item.status, 'pending'); assert.equal(item.attempt_count, 0); assert.equal(item.business_message_id, null); assert.equal(item.next_attempt_at, ''); }
  assert.equal(count('business_messages'), 0, 'D2 does not create D1 messages');
  assert.equal(http.calls.filter((call) => call.method === 'POST').length, 0, 'no provider POST anywhere in D2');
  // Audience frozen despite segment edits and new canonical Customers.
  service.saveSegment({ id: all.id, name: 'Changed', filterDefinition: { version: 1, rules: [{ field: 'phone', operator: 'absent' }] } });
  createCustomer(db, 'Later member');
  await service.prepareCampaign(created.id); assert.deepEqual(recipients(created.id), audience); assert.deepEqual(outbox(created.id), items);
  const originalAvailable = catalog.assertAvailable; catalog.assertAvailable = () => { throw new Error('offline'); };
  assert.equal((await service.prepareCampaign(created.id)).pendingOutboxCount, 2, 'prepared replay needs no provider/network'); catalog.assertAvailable = originalAvailable;
  assert.throws(() => service.previewCampaign(created.id), failCode('not_draft'));
  // Channel-specific opt-out immediately suppresses pending intent. No membership removal or revival.
  service.savePreference(preference(allowed, 'opted_out'));
  assert.equal(outbox(created.id).find((row) => row.customer_id === allowed).status, 'skipped');
  assert.equal(recipients(created.id).find((row) => row.customer_id === allowed).skip_reason, 'opted_out');
  assert.equal(service.getCampaign(created.id).eligibleCount, 2, 'preparation decision remains historical');
  assert.equal(service.getCampaign(created.id).pendingOutboxCount, 1);
  service.savePreference(preference(allowed, 'opted_in')); await service.prepareCampaign(created.id);
  assert.equal(outbox(created.id).find((row) => row.customer_id === allowed).status, 'skipped');
  assert.equal(recipients(created.id).length, 6);
  service.savePreference(preference(dealer, 'unknown'));
  assert.equal(outbox(created.id).find((row) => row.customer_id === dealer).last_error, 'unknown_consent');
  // Concurrent prepare and consent mutation while approved catalog request yields.
  service.savePreference(preference(dealer, 'opted_in'));
  const racing = service.createCampaign(campaignInput(dealerSegment.id));
  const originalList = catalog.listTemplates;
  let release; catalog.listTemplates = () => new Promise((resolve) => { release = async () => resolve(await originalList()); });
  const pending = service.prepareCampaign(racing.id); service.savePreference(preference(dealer, 'opted_out')); await release(); await pending;
  assert.equal(outbox(racing.id).length, 0); assert.equal(recipients(racing.id)[0].skip_reason, 'opted_out'); catalog.listTemplates = originalList;
  service.savePreference(preference(dealer, 'opted_in'));
  const cancelledWhileLoading = service.createCampaign(campaignInput(dealerSegment.id));
  catalog.listTemplates = () => new Promise((resolve) => { release = async () => resolve(await originalList()); });
  const cancelledPreparation = service.prepareCampaign(cancelledWhileLoading.id);
  service.cancelCampaign(cancelledWhileLoading.id); await release();
  await assert.rejects(cancelledPreparation, failCode('not_draft'));
  assert.equal(recipients(cancelledWhileLoading.id).length, 0); assert.equal(outbox(cancelledWhileLoading.id).length, 0);
  const disabledWhileLoading = service.createCampaign(campaignInput(dealerSegment.id));
  const disabledPreparation = service.prepareCampaign(disabledWhileLoading.id);
  raw.prepare('UPDATE business_capabilities SET is_enabled=0 WHERE capability_id=?').run(C.MESSAGING_CAMPAIGNS); await release();
  await assert.rejects(disabledPreparation, failCode('feature_disabled'));
  assert.equal(recipients(disabledWhileLoading.id).length, 0); assert.equal(outbox(disabledWhileLoading.id).length, 0);
  raw.prepare('UPDATE business_capabilities SET is_enabled=1 WHERE capability_id=?').run(C.MESSAGING_CAMPAIGNS);
  catalog.listTemplates = originalList;
  const concurrent = service.createCampaign(campaignInput(dealerSegment.id));
  await Promise.all([service.prepareCampaign(concurrent.id), service.prepareCampaign(concurrent.id)]);
  assert.equal(outbox(concurrent.id).length, 1); assert.equal(recipients(concurrent.id).length, 1);
  // Close/reopen another raw connection to exercise durable storage without a worker.
  const restarted = new DatabaseSync(db.databasePath);
  assert.equal(restarted.prepare("SELECT status FROM messaging_outbox WHERE campaign_id=?").get(concurrent.id).status, 'pending');
  assert.equal(restarted.prepare("SELECT status FROM messaging_campaigns WHERE id=?").get(concurrent.id).status, 'prepared'); restarted.close();
  const cancelPending = service.createCampaign(campaignInput(dealerSegment.id, { bindings: [[{ type: 'customer_field', field: 'commercial.companyName' }]] }));
  await service.prepareCampaign(cancelPending.id); assert.equal(outbox(cancelPending.id)[0].status, 'pending');
  service.cancelCampaign(cancelPending.id); assert.equal(outbox(cancelPending.id)[0].status, 'cancelled'); assert.equal(recipients(cancelPending.id)[0].status, 'cancelled');
  service.cancelCampaign(cancelPending.id); assert.equal(outbox(cancelPending.id).length, 1);
  assert.equal(db.deleteCustomer(dealer).ok, true); assert.equal(outbox(concurrent.id)[0].last_error, 'customer_unavailable');
  const cancelled = service.cancelCampaign(concurrent.id); assert.equal(cancelled.campaign.status, 'cancelled');
  await assert.rejects(service.prepareCampaign(concurrent.id), failCode('not_draft'));
  const cancelledDraft = service.cancelCampaign(atomic.id); assert.equal(cancelledDraft.campaign.status, 'cancelled'); assert.equal(outbox(atomic.id).length, 0);
  // D1's single-message semantics remain independent of marketing consent.
  service.savePreference(preference(allowed, 'opted_out'));
  const singleInput = { customerId: allowed, templateName: 'fixture_template', templateLanguage: 'tr', parameters: [['PARAMETER_PRIVATE']] };
  const intent = await single.prepare(singleInput); assert.equal((await single.send(intent.id, singleInput.parameters)).status, 'accepted');
  assert.equal(http.calls.filter((call) => call.method === 'POST').length, 1);
  for (const event of ['segment.preview', 'consent.updated', 'campaign.created', 'campaign.prepared', 'campaign.cancelled', 'outbox.prepared']) assert.ok(logs.some((row) => row.event === `messaging.${event}`));
  for (const privateValue of ['CUSTOMER_PRIVATE', 'COMPANY_PRIVATE', 'PARAMETER_PRIVATE', '905550000000', 'fixture_TOKEN_only']) assert.ok(!JSON.stringify(logs).includes(privateValue));
  assert.ok(!JSON.stringify(logs).includes('filterDefinition')); assert.ok(!JSON.stringify(logs).includes('customerId'));
  const handlers = new Map(), exports = {}; let locked = true;
  const ipcFile = new URL('../apps/desktop-app/dist-electron/ipc/messaging-campaigns-ipc.js', import.meta.url), ipcRequire = createRequire(ipcFile);
  runInNewContext(readFileSync(ipcFile, 'utf8'), { exports, Error, require: (name) => name === 'electron' ? { ipcMain: { handle: (channel, action) => handlers.set(channel, action) } } : ipcRequire(name) });
  exports.registerMessagingCampaignsIpc({ service, assertUnlocked: () => { if (locked) throw new Error('locked'); } });
  for (const handler of handlers.values()) await assert.rejects(handler(null), /locked/);
  assert.equal([...handlers.keys()].some((channel) => /send|dispatch|claim/i.test(channel)), false);
  locked = false;
  assert.equal((await handlers.get('messagingCampaigns:campaign')(null, created.id)).ok, true);
  raw.prepare('UPDATE business_capabilities SET is_enabled=0 WHERE capability_id=?').run(C.MESSAGING_CAMPAIGNS);
  assert.throws(() => service.listCampaigns(), failCode('feature_disabled'));
  assert.equal((await handlers.get('messagingCampaigns:segments')(null)).code, 'feature_disabled');
  assert.equal(service.getPreference(allowed, 'whatsapp', 'marketing').status, 'opted_out', 'consent is Customer-owned when campaigns disabled');
  console.log('Campaign consent, typed segments, immutable atomic audience, durable idempotent pending outbox, privacy, IPC gates and D1 boundary passed.');
} finally { raw.close(); fixture.dispose(); }
