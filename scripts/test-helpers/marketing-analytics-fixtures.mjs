import { DatabaseSync } from 'node:sqlite';
import { multichannelFixture } from './marketing-multichannel-fixtures.mjs';
import { createCustomer, campaignInput, preference } from './messaging-campaign-fixtures.mjs';
import { editorialInput } from './marketing-fixtures.mjs';

export async function analyticsFixture() {
  const f = multichannelFixture(), sql = new DatabaseSync(f.db.databasePath);
  let instant = Date.parse('2030-01-01T12:00:00.000Z'), fetchCount = 0, fail = false, permission = true, providerEnabled = false;
  const now = () => new Date(instant), stamp = now().toISOString();
  const customers = Array.from({ length: 5 }, () => createCustomer(f.db, 'CUSTOMER_PII_PRIVATE'));
  for (const channel of ['whatsapp','sms']) for (const id of customers.slice(0, 4)) f.campaigns.savePreference(preference(id, 'opted_in', channel));
  const segment = f.campaigns.saveSegment({ name: 'PRIVATE_SEGMENT', filterDefinition: { version: 1, rules: [] } });
  const campaigns = {};
  for (const channel of ['whatsapp','sms']) {
    const c = f.campaigns.createCampaign(campaignInput(segment.id, { channel, providerId: channel === 'sms' ? 'iletimerkezi' : 'whatsapp_cloud', name: 'CAMPAIGN_NAME_PRIVATE', ...(channel === 'sms' ? { text: 'MESSAGE_BODY_PRIVATE', templateName: '', templateLanguage: '', bindings: [] } : {}) }));
    await f.campaigns.prepareCampaign(c.id); campaigns[channel] = c;
    const rows = sql.prepare("SELECT * FROM messaging_outbox WHERE campaign_id=? ORDER BY id").all(c.id);
    for (const [index, row] of rows.entries()) {
      const m = f.db.prepareBusinessMessage({ providerId: row.provider_id, messageKind: channel === 'sms' ? 'text' : 'template', customerId: row.customer_id, recipient: '905550000001', templateName: 'TEMPLATE_PRIVATE', templateLanguage: 'tr', intentHash: 'hash', accountKey: 'fixture-account', campaignId: c.id, campaignRecipientId: row.campaign_recipient_id });
      f.db.claimBusinessMessage(m.id);
      if (index < 3) {
        const providerMessageId = `${channel}_${index}`;
        f.db.applyBusinessMessageStatus({ providerId: row.provider_id, providerMessageId, messageId: m.id, status: 'accepted', timestamp: stamp });
        if (index > 0) f.db.applyBusinessMessageStatus({ providerId: row.provider_id, providerMessageId, status: channel === 'whatsapp' && index === 2 ? 'read' : 'delivered', timestamp: stamp });
      } else f.db.failBusinessMessage(m.id, 'provider_failed', 'PRIVATE_PROVIDER_RESPONSE');
      sql.prepare("UPDATE messaging_outbox SET business_message_id=?,status=?,attempt_count=1 WHERE id=?").run(m.id, index < 3 ? 'dispatched' : 'failed', row.id);
    }
    sql.prepare("UPDATE messaging_campaigns SET status='completed' WHERE id=?").run(c.id);
  }
  const content = f.service.saveContent(editorialInput({ title: 'CONTENT_TITLE_PRIVATE', masterText: 'CONTENT_BODY_PRIVATE' }));
  let website = f.db.saveMarketingPublication({ contentId: content.content.id, channel: 'website', placement: 'homepage_feature', title: 'PUBLICATION_TITLE_PRIVATE', text: 'CONTENT_BODY_PRIVATE', mediaAssetIds: [] });
  website = f.db.requestMarketingPublication(website.id, website.revision, true); f.db.acknowledgeMarketingPublications([website], stamp);
  const instagram = f.publication(), failedInstagram = f.publication();
  sql.prepare("UPDATE marketing_publications SET status='published',published_at=? WHERE id=?").run(stamp, instagram.id);
  sql.prepare("UPDATE marketing_publications SET status='failed' WHERE id=?").run(failedInstagram.id);
  sql.prepare("INSERT INTO instagram_publication_state(publication_id,account_key,provider_media_id) VALUES(?,?,?)").run(instagram.id, 'fixture-account', '20001');
  for (const table of ['messaging_campaigns','messaging_campaign_recipients','messaging_outbox','marketing_publications']) sql.prepare(`UPDATE ${table} SET created_at=?,updated_at=?`).run(stamp, stamp);
  const adapter = {
    channel: 'instagram', accountKey: 'fixture-account', cacheKey: 'fixture-account-generation',
    supportedMetrics: () => [{ metric: 'views', availability: permission ? 'available' : 'permission_denied', rawResponse:'RAW_PROVIDER_RESPONSE', accessToken:'PRIVATE_TOKEN' }, { metric: 'likes', availability: permission ? 'available' : 'permission_denied' }],
    fetchMetrics: async () => { fetchCount++; if (fail) throw new Error('PRIVATE_TOKEN RAW_PROVIDER_RESPONSE CONTENT_BODY_PRIVATE'); return [{ metric: 'views', value: 42, measuredAt: now().toISOString(), providerMetric: 'RAW_PROVIDER_METRIC_PRIVATE' }, { metric: 'likes', value: 0, measuredAt: now().toISOString() }]; }
  };
  const { MarketingAnalyticsService } = f.load('marketing/analytics-service');
  const service = new MarketingAnalyticsService(() => f.db, { now, provider: () => providerEnabled ? adapter : undefined });
  return { ...f, sql, now, serviceAnalytics: service, MarketingAnalyticsService, campaignsAnalytics: campaigns, website, instagramAnalytics: instagram,
    adapter, get fetchCount() { return fetchCount; }, provider: value => { providerEnabled = value; }, permission: value => { permission = value; }, fail: value => { fail = value; }, setTime: value => { instant = Date.parse(value); }, advanceAnalytics: ms => { instant += ms; },
    dispose: async () => { sql.close(); await f.dispose(); } };
}
