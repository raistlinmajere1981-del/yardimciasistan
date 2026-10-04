import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { campaignFixture, createCustomer, preference, campaignInput } from './messaging-campaign-fixtures.mjs';
import { providerFixture } from './business-messaging-fixtures.mjs';

export function dispatchFixture(policy = {}) {
  const http = providerFixture(), fetchProvider = http.fetchImpl;
  const state = { mode: 'success', rateCode: 130429, rateStatus: 429, onCatalog: null, postGate: null };
  http.fetchImpl = async (url, init) => {
    if (String(url).includes('/message_templates') && state.onCatalog) await state.onCatalog();
    if (init.method !== 'POST') return fetchProvider(url, init);
    if (state.postGate) await state.postGate();
    if (state.mode === 'success') return fetchProvider(url, init);
    http.calls.push({ url: String(url), method: 'POST', body: JSON.parse(init.body) });
    if (state.mode === 'transient') return Response.json({ error: { code: 2, is_transient: true, message: 'PARAMETER_PRIVATE fixture_TOKEN_only' } }, { status: 503 });
    if (state.mode === 'rate') return Response.json({ error: { code: state.rateCode } }, { status: state.rateStatus, headers: { 'retry-after': '120' } });
    if (state.mode === 'permanent') return Response.json({ error: { code: 131026 } }, { status: 400 });
    if (state.mode === 'timeout') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('PARAMETER_PRIVATE')), { once: true }));
    if (state.mode === 'malformed') return new Response('{invalid', { status: 200 });
    if (state.mode === 'unstructured_5xx') return new Response('unavailable', { status: 503 });
    throw new Error('fixture_TOKEN_only network lost');
  };
  const fixture = campaignFixture({ http });
  const raw = new DatabaseSync(fixture.db.databasePath);
  let timestamp = Date.parse('2030-01-01T00:00:00.000Z');
  const clock = { now: () => new Date(timestamp), advance: (ms) => { timestamp += ms; } };
  const compiled = new URL('../../apps/desktop-app/dist-electron/messaging-campaigns/dispatch-service.js', import.meta.url), workerRequire = createRequire(compiled), exports = {};
  runInNewContext(readFileSync(compiled, 'utf8'), { exports, Error, Date, setTimeout, clearTimeout,
    require: (name) => name === '../desktop-logger' ? { desktopLog: { info: (event) => fixture.logs.push(event), error: (event) => fixture.logs.push(event), warn: (event) => fixture.logs.push(event) } } : workerRequire(name) });
  const workers = [];
  const worker = (options = {}) => {
    const value = new exports.CampaignDispatchService(() => fixture.db, fixture.single, { allowed: () => true, now: clock.now, policy, ...options }); workers.push(value); return value;
  };
  const tick = async (value) => { value.start(); await value.runOnce(); await value.suspendAndDrain(); };
  async function prepare(count = 1, changes = {}) {
    const customers = Array.from({ length: count }, (_, i) => createCustomer(fixture.db, `CUSTOMER_PRIVATE ${i}`));
    for (const id of customers) fixture.service.savePreference(preference(id, 'opted_in'));
    const segment = fixture.service.saveSegment({ name: 'All', filterDefinition: { version: 1, rules: [] } });
    const campaign = fixture.service.createCampaign(campaignInput(segment.id, changes));
    await fixture.service.prepareCampaign(campaign.id);
    return { campaign, customers };
  }
  return { ...fixture, get db() { return fixture.db; }, state, raw, clock, worker, tick, prepare,
    items: (id) => raw.prepare('SELECT * FROM messaging_outbox WHERE campaign_id=? ORDER BY next_attempt_at,created_at,id').all(id),
    posts: () => http.calls.filter((row) => row.method === 'POST'),
    dispose: async () => { for (const value of workers) await value.suspendAndDrain(); raw.close(); fixture.dispose(); } };
}
