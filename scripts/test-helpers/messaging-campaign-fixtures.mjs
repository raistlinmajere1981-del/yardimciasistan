import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { configuration, providerFixture, secretFixture, serviceFixture } from './business-messaging-fixtures.mjs';
const require = createRequire(import.meta.url);
const { DesktopDatabase } = require('../../apps/desktop-app/dist-electron/database.js');
export const { BUSINESS_CAPABILITIES: C } = require('../../packages/shared/dist');
export function campaignFixture(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'messaging-campaign-'));
  let db = new DesktopDatabase({ appPath: resolve('apps/desktop-app'), userDataPath: dir });
  const http = options.http ?? providerFixture(), secrets = secretFixture(), logs = [];
  const single = serviceFixture(() => db, http, secrets, logs);
  db.initialize();
  const setup = { businessName: 'Campaign Fixture', profileId: 'market', profileOptions: [C.MESSAGING_CAMPAIGNS, C.WHOLESALE], phone: '', whatsapp: '', email: '', address: '',
    webModuleUrl: 'https://example.test', syncSecret: 'fixture-campaign-secret', autoSyncEnabled: false, aiEnabled: false,
    aiProvider: 'openai_compatible', aiService: 'openai', aiProjectName: '', aiModel: '', aiBaseUrl: 'https://api.openai.com/v1', aiTimeoutSeconds: 30,
    aiApiKey: '', clearAiApiKey: false, servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] };
  const write = secrets.createMessagingSecretWrite(configuration);
  const saved = db.saveInitialSetup({ ...setup, whatsappCloud: { ...configuration, accessToken: '' } }, undefined, undefined, undefined, write);
  if (!saved.ok) throw new Error(saved.message);
  const exports = {}, compiled = new URL('../../apps/desktop-app/dist-electron/messaging-campaigns/service.js', import.meta.url);
  const campaignRequire = createRequire(compiled);
  runInNewContext(readFileSync(compiled, 'utf8'), { exports, Error, require: (name) => name === '../desktop-logger'
    ? { desktopLog: { info: (event) => logs.push(event) } } : campaignRequire(name) });
  const catalog = {
    assertAvailable: (channel, provider) => { if (channel !== 'whatsapp' || provider !== 'whatsapp_cloud' || !single.getConfiguration().configured) throw new Error('unavailable'); },
    listTemplates: () => single.listTemplates()
  };
  const service = new exports.MessagingCampaignService(() => db, catalog);
  return { get db() { return db; }, reopen: (beforeOpen) => { db.close(); beforeOpen?.(); db = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: dir }); db.initialize(); }, http, secrets, single, service, catalog, setup, logs,
    dispose: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
let phoneSequence = 0;
export function createCustomer(db, fullName, phone = `0555${String(phoneSequence++).padStart(7, '0')}`, commercialProfile) {
  const result = db.saveCustomer({ fullName, phone, email: '', notes: '', tags: [], ...(commercialProfile ? { commercialProfile } : {}) });
  if (!result.ok) throw new Error(result.message); return result.savedId;
}
export const preference = (customerId, status, channel = 'whatsapp') => ({ customerId, channel, purpose: 'marketing', status, source: 'fixture' });
export const campaignInput = (segmentId, changes = {}) => ({ name: 'Fixture campaign', purpose: 'marketing', channel: 'whatsapp', providerId: 'whatsapp_cloud',
  segmentId, templateName: 'fixture_template', templateLanguage: 'tr', bindings: [[{ type: 'customer_field', field: 'customer.fullName' }]], ...changes });
