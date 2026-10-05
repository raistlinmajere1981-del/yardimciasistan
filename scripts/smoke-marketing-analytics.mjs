import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { analyticsFixture } from './test-helpers/marketing-analytics-fixtures.mjs';

const f = await analyticsFixture();
const metric = (data, name) => data.metrics.find(m => m.metric === name);
const canonical = () => JSON.stringify(['business_messages','business_message_provider_bindings','messaging_campaigns','messaging_campaign_recipients','messaging_outbox','marketing_publications','instagram_publication_state'].map(table => f.sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
try {
  // No-data configuration states differ from zero, while historical facts survive configuration changes.
  const savedSms=f.sql.prepare("SELECT sender_id,enabled FROM marketing_provider_config WHERE provider_id='iletimerkezi'").get();
  f.sql.prepare("UPDATE marketing_provider_config SET sender_id='' WHERE provider_id='iletimerkezi'").run();
  let empty = f.serviceAnalytics.snapshot({ preset:'custom',startDate:'2029-12-01',endDate:'2029-12-02' }).channels.find(c=>c.channel==='sms');
  assert.equal(metric(empty,'accepted').availability,'unconfigured');
  assert.equal(metric(f.serviceAnalytics.snapshot({preset:'7d'}).channels.find(c=>c.channel==='sms'),'accepted').value,3);
  f.sql.prepare("UPDATE marketing_provider_config SET enabled=0 WHERE provider_id='iletimerkezi'").run();
  empty=f.serviceAnalytics.snapshot({preset:'custom',startDate:'2029-12-01',endDate:'2029-12-02'}).channels.find(c=>c.channel==='sms');
  assert.equal(metric(empty,'accepted').availability,'disabled');
  f.sql.prepare("UPDATE marketing_provider_config SET sender_id=?,enabled=? WHERE provider_id='iletimerkezi'").run(savedSms.sender_id,savedSms.enabled);
  const pub=f.db.getMarketingPublication(f.website.id);
  const pending=f.db.requestMarketingPublication(pub.id,pub.revision,false);
  assert.equal(metric(f.serviceAnalytics.snapshot({preset:'7d'}).channels[0],'active_publications').value,1);
  f.db.acknowledgeMarketingPublications([pending],f.now().toISOString());
  assert.equal(metric(f.serviceAnalytics.snapshot({preset:'7d'}).channels[0],'active_publications').value,0);
  const republished=f.db.requestMarketingPublication(pending.id,pending.revision,true); f.db.acknowledgeMarketingPublications([republished],f.now().toISOString());
  // Use the persisted capability ID from the authoritative shared constant.
  const shared=createRequire(import.meta.url)('../packages/shared/dist');
  f.sql.prepare('UPDATE business_capabilities SET is_enabled=0 WHERE capability_id=?').run(shared.BUSINESS_CAPABILITIES.MARKETING_STUDIO);
  assert.throws(()=>f.serviceAnalytics.snapshot({preset:'7d'}),/etkin değil/);
  f.sql.prepare('UPDATE business_capabilities SET is_enabled=1 WHERE capability_id=?').run(shared.BUSINESS_CAPABILITIES.MARKETING_STUDIO);
  const before = canonical();
  const data = f.serviceAnalytics.snapshot({ preset: '7d', timezone: 'Europe/Istanbul' }, true);
  const wa = data.channels.find(c => c.channel === 'whatsapp'), sms = data.channels.find(c => c.channel === 'sms'), website = data.channels.find(c => c.channel === 'website'), ig = data.channels.find(c => c.channel === 'instagram');
  for (const c of [wa, sms]) { for (const [name, value] of [['prepared',4],['attempted',4],['accepted',3],['delivered',2],['failed',1],['skipped',1]]) assert.equal(metric(c, name).value, value, `${c.channel}:${name}`); assert.equal(c.deliveryRate, 2/3); }
  assert.equal(metric(wa, 'read').value, 1); assert.equal(wa.readRate, 1/2);
  assert.equal(metric(sms, 'read').availability, 'unsupported'); assert.equal(metric(sms, 'read').value, null);
  const c = f.serviceAnalytics.campaign(f.campaignsAnalytics.whatsapp.id);
  assert.equal(metric(c, 'audience').value, 5); assert.equal(metric(c, 'eligible').value, 4); assert.equal(metric(c, 'read').value, 1); assert.equal(c.status, 'completed');
  assert.equal(metric(website, 'active_publications').value, 1); assert.equal(metric(website, 'published').value, 1); assert.equal(metric(website, 'failed').value, 0); assert.equal(metric(website, 'failed').availability, 'available');
  assert(!website.metrics.some(m => ['views','clicks','impressions'].includes(m.metric)));
  assert.equal(metric(ig, 'published').value, 1); assert.equal(metric(ig, 'failed').value, 1);
  assert.equal(data.summary.accepted, 6); assert.equal(data.summary.delivered, 4); assert.equal(data.summary.read, 1); assert.equal(data.summary.failed, 3); assert.equal(data.summary.published, 2);
  assert.equal(data.trends.reduce((s, t) => s + t.accepted, 0), 6); assert.equal(data.trends.reduce((s, t) => s + t.failed, 0), 3); assert.equal(data.trends.reduce((s, t) => s + t.published, 0), 2);
  const unsupportedSms = new f.MarketingAnalyticsService(() => f.db, { now: f.now, smsDelivered: false }).snapshot({ preset: '7d' }).channels.find(c => c.channel === 'sms');
  assert.equal(metric(unsupportedSms, 'delivered').value, null); assert.equal(metric(unsupportedSms, 'delivered').availability, 'unsupported'); assert.equal(unsupportedSms.deliveryRate, null); assert.equal(metric(unsupportedSms, 'accepted').value, 3);
  const noData = f.serviceAnalytics.snapshot({ preset: 'custom', startDate: '2029-12-01', endDate: '2029-12-02', timezone: 'UTC' });
  assert.equal(noData.summary.accepted, null); assert.equal(metric(noData.channels[0], 'active_publications').value, 1);
  assert.equal(metric(noData.channels.find(c => c.channel === 'whatsapp'), 'accepted').availability, 'no_data');
  for (const [preset, length] of [['7d',7],['30d',30],['90d',90]]) assert.equal(f.serviceAnalytics.snapshot({ preset, timezone: 'UTC' }).trends.length, length);
  for (const range of [{ preset: 'custom', startDate: '2030-02-30', endDate: '2030-03-01' }, { preset: 'custom', startDate: '2028-01-01', endDate: '2030-01-01' }, { preset: '7d', timezone: 'PRIVATE_BAD_ZONE' }]) assert.throws(() => f.serviceAnalytics.snapshot(range), /tarih aralığı/);
  // Inclusive local start/end with exclusive UTC upper bound, including DST-short/long days.
  const query = { preset: 'custom', startDate: '2030-01-01', endDate: '2030-01-01', timezone: 'Europe/Istanbul' };
  const start = f.serviceAnalytics.snapshot(query).range; assert.equal(start.startAt, '2029-12-31T21:00:00.000Z'); assert.equal(start.endAt, '2030-01-01T21:00:00.000Z');
  const id = f.campaignsAnalytics.whatsapp.id;
  f.sql.prepare("UPDATE messaging_campaign_recipients SET created_at=? WHERE campaign_id=?").run(start.startAt, id); assert.equal(metric(f.serviceAnalytics.snapshot(query).channels.find(c => c.channel === 'whatsapp'), 'accepted').value, 3);
  f.sql.prepare("UPDATE messaging_campaign_recipients SET created_at=? WHERE campaign_id=?").run(start.endAt, id); const boundary=f.serviceAnalytics.snapshot(query); assert.equal(metric(boundary.channels.find(c => c.channel === 'whatsapp'), 'accepted').value, null);
  // A campaign created inside the range but prepared outside it still has lifetime counts in recent entries.
  const recent=boundary.recentCampaigns.find(c=>c.id===id); assert.equal(metric(recent,'accepted').value,3); assert.equal(metric(recent,'audience').value,5);
  f.sql.prepare("UPDATE messaging_campaign_recipients SET created_at=? WHERE campaign_id=?").run(f.now().toISOString(), id);
  for (const [date, hours] of [['2030-03-10',23],['2030-11-03',25]]) { const range = f.serviceAnalytics.snapshot({ preset: 'custom', startDate: date, endDate: date, timezone: 'America/New_York' }).range; assert.equal((Date.parse(range.endAt)-Date.parse(range.startAt))/3600000, hours); }
  // Default production contract: no verified Insights grant, and no provider request on reads.
  let detail = f.serviceAnalytics.publication(f.instagramAnalytics.id); assert.equal(metric(detail, 'views').availability, 'permission_unverified'); assert.equal(detail.canRefresh, false); assert.equal(f.fetchCount, 0);
  f.provider(true); detail = f.serviceAnalytics.publication(f.instagramAnalytics.id); assert.equal(metric(detail, 'views').availability, 'no_data'); assert.equal(detail.canRefresh, true);
  const a = f.serviceAnalytics.refreshPublication(detail.id); await assert.rejects(f.serviceAnalytics.refreshPublication(detail.id), /doğrulanmış|dakika/); detail = await a;
  assert.equal(metric(detail, 'views').value, 42); assert.equal(metric(detail, 'likes').value, 0); assert.equal(metric(detail, 'likes').availability, 'available'); assert.equal(metric(detail, 'views').freshness, 'fresh');
  assert.equal(f.fetchCount, 1); f.serviceAnalytics.snapshot({ preset: '7d' }); assert.equal(f.fetchCount, 1);
  f.advanceAnalytics(16*60000); detail = f.serviceAnalytics.publication(detail.id); assert.equal(metric(detail, 'views').freshness, 'stale');
  f.fail(true); detail = await f.serviceAnalytics.refreshPublication(detail.id); assert.equal(metric(detail, 'views').value, 42); assert.equal(metric(detail, 'views').availability, 'refresh_failed'); assert.equal(metric(detail, 'views').freshness, 'stale');
  const snapshotJson = JSON.stringify(f.sql.prepare('SELECT * FROM marketing_metric_snapshots').all()); assert(!snapshotJson.includes('PRIVATE'));
  f.permission(false); detail = f.serviceAnalytics.publication(detail.id); assert.equal(metric(detail, 'views').availability, 'permission_denied'); assert.equal(metric(detail, 'views').value, null); assert.equal(detail.canRefresh, false);
  f.permission(true);
  f.adapter.accountKey='unrelated-account'; detail=f.serviceAnalytics.publication(detail.id); assert.equal(detail.canRefresh,false); assert.equal(metric(detail,'views').availability,'permission_denied'); f.adapter.accountKey='fixture-account';
  const reopened=new f.MarketingAnalyticsService(()=>f.db,{now:f.now,provider:()=>f.adapter}); assert.equal(metric(reopened.publication(detail.id),'views').value,42); assert.equal(metric(reopened.publication(detail.id),'views').freshness,'stale');
  f.advanceAnalytics(60000); f.fail(false);
  const originalFetch=f.adapter.fetchMetrics; f.adapter.fetchMetrics=async()=>[{metric:'views',value:-1,measuredAt:f.now().toISOString()}];
  detail=await f.serviceAnalytics.refreshPublication(detail.id); assert.equal(metric(detail,'views').availability,'refresh_failed'); assert.equal(metric(detail,'views').value,42); f.adapter.fetchMetrics=originalFetch;
  f.adapter.cacheKey = 'different-account'; detail = f.serviceAnalytics.publication(detail.id); assert.equal(metric(detail, 'views').value, null); f.adapter.cacheKey = 'fixture-account-generation';
  // Bounded refresh aborts an unresponsive adapter and preserves persisted observations.
  f.advanceAnalytics(60000); const fetchBeforeTimeout=f.adapter.fetchMetrics; let aborted=false;
  f.adapter.fetchMetrics=async(_target,_range,signal)=>new Promise(()=>{signal.addEventListener('abort',()=>{aborted=true;});});
  const bounded=new f.MarketingAnalyticsService(()=>f.db,{now:f.now,provider:()=>f.adapter,providerTimeoutMs:5});
  const timed=await bounded.refreshPublication(detail.id); assert.equal(aborted,true); assert.equal(metric(timed,'views').availability,'refresh_failed'); assert.equal(metric(timed,'views').value,42); f.adapter.fetchMetrics=fetchBeforeTimeout;
  const privacy = JSON.stringify([data, c, detail, f.serviceAnalytics.snapshot({preset:"7d"}), f.logs]); for (const secret of ['CUSTOMER_PII_PRIVATE','CAMPAIGN_NAME_PRIVATE','905550000001','MESSAGE_BODY_PRIVATE','TEMPLATE_PRIVATE','CONTENT_TITLE_PRIVATE','CONTENT_BODY_PRIVATE','PRIVATE_TOKEN','PRIVATE_PROVIDER_RESPONSE','RAW_PROVIDER_RESPONSE','RAW_PROVIDER_METRIC_PRIVATE']) assert(!privacy.includes(secret), secret);
  assert.equal(canonical(), before);
  assert(f.logs.some(l => l.event === 'marketing.analytics.opened')); for (const phase of ['started','succeeded','failed']) assert(f.logs.some(l => l.event === `marketing.analytics.provider_refresh.${phase}`));
  const started = f.logs.find(l => l.event === 'marketing.analytics.provider_refresh.started'), succeeded = f.logs.find(l => l.event === 'marketing.analytics.provider_refresh.succeeded'); assert.equal(started.operationId, succeeded.operationId);
  // Locked IPC never delegates; post-await gate protects responses if lock changes in flight.
  const exports = {}, handlers = new Map(), compiled = new URL('../apps/desktop-app/dist-electron/ipc/marketing-analytics-ipc.js', import.meta.url), require = createRequire(compiled);
  let locked = true, delegated = 0;
  runInNewContext(readFileSync(compiled, 'utf8'), { exports, require: name => name === 'electron' ? { ipcMain: { handle: (name, fn) => handlers.set(name, fn) } } : require(name) });
  exports.registerMarketingAnalyticsIpc({ service: { snapshot: () => { delegated++; return data; } }, assertUnlocked: () => { if (locked) throw new Error('locked'); } });
  await assert.rejects(handlers.get('marketingAnalytics:snapshot')(null, { preset: '7d' }), /locked/); assert.equal(delegated, 0); locked = false; assert.equal((await handlers.get('marketingAnalytics:snapshot')(null, { preset: '7d' })).ok, true);
  // Persistence bound, stale last observation retained, only snapshot table changes.
  f.db.saveMarketingMetricSnapshots(Array.from({ length: 1005 }, (_, i) => ({ targetId: detail.id, providerKey: 'bounded-fixture', metric: 'views', value: i, measuredAt: new Date(f.now().getTime()+i).toISOString(), expiresAt: f.now().toISOString() })), 'bounded', '');
  // Unique same target/metric/range collapses to one row; a range/account spread is still capped.
  for (let i=0; i<1005; i++) f.db.saveMarketingMetricSnapshots([{ targetId: detail.id, providerKey: `bounded-${i}`, metric: 'views', value: i, measuredAt: f.now().toISOString(), expiresAt: f.now().toISOString() }], 'bounded', '');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM marketing_metric_snapshots').get().n, 1000);
  console.log('D7 analytics: four channels, campaign counts, cumulative delivery evidence, unsupported SMS delivery, 7/30/90/custom/timezone/DST, no fake Website traffic, optional provider capabilities, stale/failure preservation, cache bound/account separation, privacy, no canonical mutation and IPC gates passed.');
} finally { await f.dispose(); }
