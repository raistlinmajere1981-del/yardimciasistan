import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { dispatchFixture } from './test-helpers/messaging-dispatch-fixtures.mjs';
import { preference, C } from './test-helpers/messaging-campaign-fixtures.mjs';
const require = createRequire(import.meta.url);
const { messagingAccountKey } = require('../apps/desktop-app/dist-electron/business-messaging/service.js');
const accountKey = messagingAccountKey('1001', '2002');
let passed = 0;
async function scenario(name, work, policy) {
  const f = dispatchFixture(policy);
  try { await work(f); passed++; console.log(`PASS ${name}`); } finally { await f.dispose(); }
}
await scenario('atomic deterministic claim, second connection, stale fencing, paused claims', async (f) => {
  const { campaign } = await f.prepare(4);
  assert.equal(f.db.claimCampaignDispatchBatch(f.clock.now().toISOString(), 3).length, 0, 'prepared does not dispatch');
  await f.service.startCampaign(campaign.id);
  const expected = f.items(campaign.id).map((row) => row.id);
  const first = f.db.claimCampaignDispatchBatch(f.clock.now().toISOString(), 2);
  assert.deepEqual(first.map((row) => row.id), expected.slice(0, 2));
  const { claimDispatchBatch } = require('../apps/desktop-app/dist-electron/messaging-campaigns/dispatch-store.js');
  const other = new DatabaseSync(f.db.databasePath);
  const second = claimDispatchBatch(other, f.clock.now().toISOString(), 3); other.close();
  assert.deepEqual(second.map((row) => row.id), expected.slice(2));
  f.clock.advance(300001);
  assert.equal(f.db.recoverCampaignDispatchClaims(f.clock.now().toISOString(), new Date(f.clock.now().getTime() - 300000).toISOString()), 4);
  const reclaimed = f.db.claimCampaignDispatchBatch(f.clock.now().toISOString(), 1)[0];
  assert.notEqual(reclaimed.claimToken, first[0].claimToken);
  assert.equal(f.db.finishCampaignDispatchClaim(first[0].id, first[0].claimToken, { kind: 'failed', category: 'old_worker' }, f.clock.now().toISOString()), false);
  f.service.pauseCampaign(campaign.id);
  assert.equal(f.db.claimCampaignDispatchBatch(f.clock.now().toISOString(), 3).length, 0);
  f.service.cancelCampaign(campaign.id); assert.ok(f.items(campaign.id).every((row) => row.status === 'cancelled'));
  assert.equal(f.posts().length, 0);
});
for (const [mutation, expected] of [['opted_out', 'opted_out'], ['unknown', 'unknown_consent'], ['phone', 'missing_recipient'], ['deleted', 'customer_unavailable']]) {
  await scenario(`send-time ${mutation} after claim blocks POST`, async (f) => {
    const { campaign, customers } = await f.prepare(); await f.service.startCampaign(campaign.id);
    f.state.onCatalog = async () => {
      f.state.onCatalog = null;
      if (mutation === 'phone') f.raw.prepare("UPDATE customers SET phone='' WHERE id=?").run(customers[0]);
      else if (mutation === 'deleted') f.db.deleteCustomer(customers[0]);
      else f.service.savePreference(preference(customers[0], mutation));
    };
    await f.tick(f.worker());
    const row = f.items(campaign.id)[0]; assert.equal(row.status, 'skipped'); assert.equal(row.last_error, expected);
    assert.equal(row.business_message_id, null); assert.equal(f.posts().length, 0); assert.equal(f.service.getCampaign(campaign.id).campaign.status, 'completed');
  });
}
await scenario('current canonical phone/bindings, one message, delivery status independence', async (f) => {
  const { campaign, customers } = await f.prepare(); await f.service.startCampaign(campaign.id);
  f.raw.prepare('UPDATE customers SET phone=?,full_name=? WHERE id=?').run('05559998877', 'PARAMETER_PRIVATE', customers[0]);
  await f.tick(f.worker()); const row = f.items(campaign.id)[0], message = f.db.getBusinessMessage(row.business_message_id);
  assert.equal(row.status, 'dispatched'); assert.equal(message.status, 'accepted'); assert.equal(message.purpose, 'marketing');
  assert.equal(message.campaignId, campaign.id); assert.equal(message.campaignRecipientId, row.campaign_recipient_id);
  assert.equal(f.posts()[0].body.to, '905559998877'); assert.equal(f.posts()[0].body.template.components[0].parameters[0].text, 'PARAMETER_PRIVATE');
  assert.equal(f.service.getCampaign(campaign.id).campaign.status, 'completed');
  await assert.rejects(f.single.send(message.id, [['PARAMETER_PRIVATE']]), (error) => error.code === 'campaign_dispatch_only');
  f.db.applyBusinessMessageStatus({ messageId: message.id, providerMessageId: message.providerMessageId, status: 'delivered', timestamp: f.clock.now().toISOString(), accountKey });
  f.db.applyBusinessMessageStatus({ messageId: message.id, providerMessageId: message.providerMessageId, status: 'read', timestamp: f.clock.now().toISOString(), accountKey });
  assert.equal(f.items(campaign.id)[0].status, 'dispatched'); assert.equal(f.db.getBusinessMessage(message.id).status, 'read');
  for (const value of ['PARAMETER_PRIVATE', 'CUSTOMER_PRIVATE', '905559998877', 'fixture_TOKEN_only']) assert.ok(!JSON.stringify(f.logs).includes(value));
  assert.ok(f.logs.some((row) => row.event === 'messaging.dispatch.message.accepted'));
});
await scenario('durable shared rate permit; batch deferral consumes no attempt', async (f) => {
  const { campaign } = await f.prepare(3); await f.service.startCampaign(campaign.id); const worker = f.worker();
  await f.tick(worker); assert.equal(f.posts().length, 1);
  const pending = f.items(campaign.id).filter((row) => row.status === 'pending'); assert.equal(pending.length, 2);
  for (const row of pending) { assert.equal(row.attempt_count, 0); assert.equal(row.business_message_id, null); assert.equal(Date.parse(row.next_attempt_at), f.clock.now().getTime() + 3000); }
  await f.tick(worker); assert.equal(f.posts().length, 1);
  f.reopen(); f.clock.advance(3000); await f.tick(f.worker()); assert.equal(f.posts().length, 2);
  f.clock.advance(3000); await f.tick(f.worker()); assert.equal(f.posts().length, 3); assert.equal(f.service.getCampaign(campaign.id).campaign.status, 'completed');
});
await scenario('transient rejection retries same BusinessMessage; durable backoff and current contact', async (f) => {
  const { campaign, customers } = await f.prepare(); await f.service.startCampaign(campaign.id); f.state.mode = 'transient'; const worker = f.worker();
  await f.tick(worker); const row = f.items(campaign.id)[0]; assert.equal(row.status, 'pending'); assert.equal(row.attempt_count, 1);
  assert.equal(Date.parse(row.next_attempt_at), f.clock.now().getTime() + 5000); assert.equal(f.db.getMessageBinding(row.business_message_id).submitted, 0);
  await f.tick(worker); assert.equal(f.posts().length, 1);
  f.reopen(); f.clock.advance(5000); f.state.mode = 'success';
  f.raw.prepare('UPDATE customers SET phone=? WHERE id=?').run('05551112233', customers[0]);
  await f.tick(f.worker()); const retried = f.items(campaign.id)[0]; assert.equal(retried.status, 'dispatched');
  assert.equal(retried.business_message_id, row.business_message_id); assert.equal(retried.attempt_count, 2);
  assert.equal(f.posts()[0].body.biz_opaque_callback_data, f.posts()[1].body.biz_opaque_callback_data); assert.equal(f.posts()[1].body.to, '905551112233');
  assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM business_messages').get().n, 1);
});
await scenario('rate limit honors Retry-After globally, bounded max attempts', async (f) => {
  const { campaign } = await f.prepare(2); await f.service.startCampaign(campaign.id); f.state.mode = 'rate'; const worker = f.worker();
  await f.tick(worker); assert.equal(f.posts().length, 1);
  assert.ok(f.items(campaign.id).every((row) => Date.parse(row.next_attempt_at) >= f.clock.now().getTime() + 120000));
  f.clock.advance(119999); await f.tick(worker); assert.equal(f.posts().length, 1);
  f.clock.advance(1); await f.tick(worker); assert.equal(f.posts().length, 2);
  // Isolate first intent to exercise bounded retry exhaustion without ordering assumptions.
  f.raw.prepare("UPDATE messaging_outbox SET status='cancelled' WHERE campaign_id=? AND attempt_count=0").run(campaign.id);
  for (let i = 0; i < 5; i++) { f.clock.advance(1000000); await f.tick(worker); }
  assert.ok(f.items(campaign.id).every((row) => ['failed', 'cancelled'].includes(row.status)));
  assert.ok(f.items(campaign.id).filter((row) => row.status === 'failed').every((row) => row.attempt_count === 4 && row.last_error === 'max_attempts'));
  assert.equal(f.service.getCampaign(campaign.id).campaign.status, 'completed');
  for (const row of f.items(campaign.id).filter((row) => row.status === 'failed')) assert.equal(f.db.getBusinessMessage(row.business_message_id).status, 'failed');
});
await scenario('permanent rejection fails once; missing bindings/templates fail without POST', async (f) => {
  const { campaign } = await f.prepare(); await f.service.startCampaign(campaign.id); f.state.mode = 'permanent'; await f.tick(f.worker());
  const row = f.items(campaign.id)[0]; assert.equal(row.status, 'failed'); assert.equal(row.last_error, 'provider_131026');
  assert.equal(f.db.getBusinessMessage(row.business_message_id).status, 'failed'); assert.equal(f.posts().length, 1);
  await f.tick(f.worker()); assert.equal(f.posts().length, 1);
});
for (const mode of ['lost', 'timeout', 'malformed', 'unstructured_5xx']) {
  await scenario(`${mode} submission uncertainty: reconcile only, never duplicate POST`, async (f) => {
    const { campaign, customers } = await f.prepare(); await f.service.startCampaign(campaign.id); f.state.mode = mode; const worker = f.worker();
    await f.tick(worker); const first = f.items(campaign.id)[0]; assert.equal(first.status, 'pending'); assert.equal(first.last_error, 'submission_uncertain');
    assert.equal(f.db.getMessageBinding(first.business_message_id).submitted, 1); assert.equal(f.posts().length, 1);
    // Opt-out after an uncertain submission must retain receipt reconciliation, without another POST.
    f.service.savePreference(preference(customers[0], 'opted_out')); assert.equal(f.items(campaign.id)[0].status, 'pending');
    f.reopen(); f.state.mode = 'success'; f.clock.advance(5000); await f.tick(f.worker());
    assert.equal(f.posts().length, 1); assert.equal(f.items(campaign.id)[0].business_message_id, first.business_message_id);
    f.db.applyBusinessMessageStatus({ messageId: first.business_message_id, providerMessageId: `wamid.recovered_${mode}`, status: 'accepted', timestamp: f.clock.now().toISOString(), accountKey });
    f.clock.advance(10000); await f.tick(f.worker());
    assert.equal(f.items(campaign.id)[0].status, 'dispatched'); assert.equal(f.posts().length, 1); assert.equal(f.service.getCampaign(campaign.id).campaign.status, 'completed');
  });
}
await scenario('provider success before outbox commit crash recovers without second POST', async (f) => {
  const { campaign } = await f.prepare(); await f.service.startCampaign(campaign.id);
  const row = f.db.claimCampaignDispatchBatch(f.clock.now().toISOString(), 1)[0];
  const result = await f.single.dispatchCampaignItem(row.id, row.claimToken, 3000, () => true, f.clock.now);
  assert.equal(result.kind, 'accepted'); assert.equal(f.items(campaign.id)[0].status, 'claimed');
  f.reopen(); f.clock.advance(300001); await f.tick(f.worker());
  assert.equal(f.items(campaign.id)[0].status, 'dispatched'); assert.equal(f.posts().length, 1); assert.equal(f.service.getCampaign(campaign.id).campaign.status, 'completed');
});
await scenario('crash after POST before receipt persistence stays fenced', async (f) => {
  const { campaign } = await f.prepare(); await f.service.startCampaign(campaign.id);
  f.raw.exec("CREATE TRIGGER fixture_receipt_failure BEFORE UPDATE OF provider_message_id ON business_messages WHEN NEW.provider_message_id!='' BEGIN SELECT RAISE(ABORT,'simulated crash'); END;");
  await f.tick(f.worker()); const first = f.items(campaign.id)[0]; assert.equal(first.last_error, 'submission_uncertain'); assert.equal(f.posts().length, 1);
  f.raw.exec('DROP TRIGGER fixture_receipt_failure'); f.reopen(); f.clock.advance(1000000);
  for (let i = 0; i < 4; i++) { await f.tick(f.worker()); f.clock.advance(1000000); }
  assert.equal(f.posts().length, 1); assert.equal(f.items(campaign.id)[0].status, 'failed'); assert.equal(f.items(campaign.id)[0].last_error, 'submission_uncertain');
});
for (const operation of ['pause', 'cancel', 'drain']) {
  await scenario(`${operation} during in-flight HTTP does not abort; single flight`, async (f) => {
    const { campaign } = await f.prepare(2); await f.service.startCampaign(campaign.id);
    let entered, release; const submitted = new Promise((resolve) => { entered = resolve; }), gate = new Promise((resolve) => { release = resolve; });
    f.state.postGate = async () => { entered(); await gate; };
    const worker = f.worker(); worker.start(); const flight = worker.runOnce(); assert.equal(worker.runOnce(), flight); await submitted;
    let drained = false, drain;
    if (operation === 'pause') f.service.pauseCampaign(campaign.id);
    if (operation === 'cancel') f.service.cancelCampaign(campaign.id);
    if (operation === 'drain') { drain = worker.suspendAndDrain().then(() => { drained = true; }); await Promise.resolve(); assert.equal(drained, false); }
    release(); await flight; await drain; await worker.suspendAndDrain();
    assert.equal(f.posts().length, 1); assert.equal(f.items(campaign.id).filter((row) => row.status === 'dispatched').length, 1);
    if (operation === 'cancel') { assert.equal(f.items(campaign.id).filter((row) => row.status === 'cancelled').length, 1); assert.equal(f.service.getCampaign(campaign.id).campaign.status, 'cancelled'); }
    else { f.state.postGate = null; f.clock.advance(3000); if (operation === 'pause') await f.service.startCampaign(campaign.id, true); await f.tick(worker); assert.equal(f.posts().length, 2); assert.equal(f.service.getCampaign(campaign.id).campaign.status, 'completed'); }
  });
}
await scenario('provider disabled start rejects; capability disabled while catalog yields blocks POST', async (f) => {
  const { campaign } = await f.prepare();
  f.raw.exec('UPDATE business_messaging_provider_config SET enabled=0'); await assert.rejects(f.service.startCampaign(campaign.id));
  assert.equal(f.service.getCampaign(campaign.id).campaign.status, 'prepared'); f.raw.exec('UPDATE business_messaging_provider_config SET enabled=1');
  await f.service.startCampaign(campaign.id);
  f.state.onCatalog = async () => { f.raw.prepare('UPDATE business_capabilities SET is_enabled=0 WHERE capability_id=?').run(C.MESSAGING_CAMPAIGNS); };
  await f.tick(f.worker()); assert.equal(f.posts().length, 0);
});
for (const change of ['missing', 'shape', 'binding']) {
  await scenario(`send-time template ${change} fails without POST`, async (f) => {
    const { campaign, customers } = await f.prepare(); await f.service.startCampaign(campaign.id);
    if (change === 'missing') f.http.state.templates = [];
    if (change === 'shape') f.http.state.templates = [{ ...f.http.templates[0], components: [{ type: 'BODY', text: 'Changed {{customer_name}}' }] }];
    if (change === 'binding') f.raw.prepare("UPDATE customers SET full_name='' WHERE id=?").run(customers[0]);
    await f.tick(f.worker()); assert.equal(f.items(campaign.id)[0].status, 'failed'); assert.equal(f.posts().length, 0);
  });
}
for (const rateCode of [4, 80007, 130429, 131056]) {
  await scenario(`Graph throttle ${rateCode} at HTTP 400 normalizes to durable rate backoff`, async (f) => {
    const { campaign } = await f.prepare(); await f.service.startCampaign(campaign.id);
    f.state.mode = 'rate'; f.state.rateCode = rateCode; f.state.rateStatus = 400;
    await f.tick(f.worker()); const row = f.items(campaign.id)[0];
    assert.equal(row.status, 'pending'); assert.equal(row.last_error, 'rate_limit');
    assert.equal(Date.parse(row.next_attempt_at), f.clock.now().getTime() + 120000);
    assert.equal(f.db.getMessageBinding(row.business_message_id).submitted, 0);
  });
}
await scenario('cancel reconciles an existing receipt instead of reporting uncertain failure', async (f) => {
  const { campaign } = await f.prepare(); await f.service.startCampaign(campaign.id); f.state.mode = 'lost';
  await f.tick(f.worker()); const first = f.items(campaign.id)[0];
  f.db.applyBusinessMessageStatus({ messageId: first.business_message_id, providerMessageId: 'wamid.before_cancel', status: 'accepted', timestamp: f.clock.now().toISOString(), accountKey });
  f.service.cancelCampaign(campaign.id); assert.equal(f.items(campaign.id)[0].status, 'dispatched'); assert.equal(f.posts().length, 1);
});
await scenario('read-only catalog network retry is safe; session/maintenance gates suppress new claims', async (f) => {
  const { campaign } = await f.prepare(); await f.service.startCampaign(campaign.id);
  await f.tick(f.worker({ allowed: () => false })); assert.equal(f.items(campaign.id)[0].attempt_count, 0);
  f.state.onCatalog = async () => { throw new Error('fixture_TOKEN_only'); };
  await f.tick(f.worker()); assert.equal(f.items(campaign.id)[0].last_error, 'transient'); assert.equal(f.posts().length, 0);
  f.state.onCatalog = null; f.clock.advance(5000); await f.tick(f.worker());
  assert.equal(f.items(campaign.id)[0].status, 'dispatched'); assert.equal(f.posts().length, 1);
});
await scenario('atomic message attachment rollback leaves no orphan or POST', async (f) => {
  const { campaign } = await f.prepare(); await f.service.startCampaign(campaign.id);
  f.raw.exec("CREATE TRIGGER fixture_attach_failure BEFORE UPDATE OF business_message_id ON messaging_outbox BEGIN SELECT RAISE(ABORT,'attachment failure'); END;");
  await f.tick(f.worker()); assert.equal(f.posts().length, 0);
  assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM business_messages').get().n, 0);
  assert.equal(f.items(campaign.id)[0].business_message_id, null);
});
await scenario('opt-out suppresses a certainly rejected retry and cancels its canonical message', async (f) => {
  const { campaign, customers } = await f.prepare(); await f.service.startCampaign(campaign.id); f.state.mode = 'transient';
  await f.tick(f.worker()); const row = f.items(campaign.id)[0]; assert.equal(f.db.getBusinessMessage(row.business_message_id).status, 'draft');
  f.service.savePreference(preference(customers[0], 'opted_out'));
  assert.equal(f.items(campaign.id)[0].status, 'skipped'); assert.equal(f.db.getBusinessMessage(row.business_message_id).status, 'cancelled');
  f.clock.advance(1000000); f.state.mode = 'success'; await f.tick(f.worker()); assert.equal(f.posts().length, 1);
});
console.log(`Controlled campaign dispatch: ${passed}/${passed} scenarios passed. No real provider calls.`);
