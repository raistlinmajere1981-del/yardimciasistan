import { chooseSearchSelect } from './test-helpers/search-select.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { providerFixture, secretFixture, serviceFixture } from './test-helpers/business-messaging-fixtures.mjs';
const require = createRequire(import.meta.url), { DesktopDatabase } = require('../apps/desktop-app/dist-electron/database.js');
const { BUSINESS_CAPABILITIES: C } = require('../packages/shared/dist');
const dir = mkdtempSync(join(tmpdir(), 'messaging-ui-'));
const db = new DesktopDatabase({ appPath: resolve('apps/desktop-app'), userDataPath: dir });
const http = providerFixture(), secrets = secretFixture(), service = serviceFixture(() => db, http, secrets);
let server, browser, webCalls = 0;
try {
  db.initialize();
  const setup = { businessName: 'Fixture', profileId: 'market', profileOptions: [C.CUSTOMERS], phone: '', whatsapp: '', email: '', address: '',
    webModuleUrl: 'https://example.test', syncSecret: 'fixture-messaging-secret', autoSyncEnabled: false, aiEnabled: false,
    aiProvider: 'openai_compatible', aiService: 'openai', aiProjectName: '', aiModel: '', aiBaseUrl: 'https://api.openai.com/v1', aiTimeoutSeconds: 30,
    aiApiKey: '', clearAiApiKey: false, servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] };
  assert.equal(db.saveInitialSetup(setup).ok, true);
  assert.equal(db.saveCustomer({ fullName: 'UI Fixture Customer', phone: '05550000000', email: '', notes: '', tags: [] }).ok, true);
  server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium); const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/business-messaging-fixture', async (route) => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/business-messaging-fixture', `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/business-messaging.tsx')}"></script></body></html>`) }));
  await page.exposeFunction('__bmCall', async (method, args) => {
    if (method === 'configuration') return service.getConfiguration();
    if (method === 'test') return service.testConnection(args[0]);
    if (method === 'save') { const input = args[0], write = secrets.createMessagingSecretWrite(input.whatsappCloud);
      const result = db.saveInitialSetup({ ...input, whatsappCloud: { ...input.whatsappCloud, accessToken: '' } }, undefined, undefined, undefined, write); assert.equal(result.ok, true); return result.setupData; }
    if (method === 'web') { webCalls++; return null; }
    try { const value = method === 'templates' ? await service.listTemplates() : method === 'prepare' ? await service.prepare(args[0]) : method === 'send' ? await service.send(...args) : service.getMessage(args[0]); return { ok: true, value }; }
    catch (error) { return { ok: false, code: error.code, message: error.message }; }
  });
  await page.addInitScript((initial) => { window.__bmInitial = initial; }, { setup: db.getSetupData(), dashboard: db.getDashboardData() });
  await page.goto(`${server.resolvedUrls.local[0]}business-messaging-fixture`);
  const row = page.locator('#settings-whatsapp-business');
  const card = page.locator('.settings-service-overlay');
  await expect(row).toHaveRole('button');
  await expect(row).toHaveAccessibleName('WhatsApp Business ayarları');
  await expect(row).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await expect(row.getByRole('img')).toHaveAttribute('aria-label', 'WhatsApp Business: Kapalı');
  await expect(row.locator('button, input')).toHaveCount(0);
  await expect(row.getByLabel('Access Token')).toHaveCount(0);
  await page.getByRole('button', { name: 'Müşteriyi aç' }).click();
  await expect(page.getByRole('button', { name: 'WhatsApp Business mesajı', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: "WhatsApp'tan Yaz", exact: true }).click(); assert.equal(webCalls, 1);
  await page.keyboard.press('Escape');
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(card).toHaveRole('dialog');
  await expect(card).toHaveAccessibleName('WhatsApp Business');
  await expect(card.getByRole('switch', { name: 'WhatsApp Business servisi' })).toBeDisabled();
  await expect(card).toContainText('Hesap bilgileri eksik');
  await card.getByLabel('WABA ID', { exact: true }).fill('1001'); await card.getByLabel('Phone Number ID', { exact: true }).fill('2002');
  await card.getByLabel('Access Token', { exact: true }).fill('fixture_TOKEN_only');
  await expect(card).toContainText('Yapılandırılmış');
  await card.getByRole('switch', { name: 'WhatsApp Business servisi' }).check();
  await card.getByRole('button', { name: 'Bağlantıyı test et' }).click(); await expect(card.locator('.settings-service-detail-status')).toContainText('Hazır');
  assert.equal(service.getConfiguration().configured, false, 'connection test does not save draft');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Servisleri kaydet' }).click();
  await row.click();
  await expect(card.getByLabel('Access Token', { exact: true })).toHaveValue('');
  assert.equal(service.getConfiguration().configured, true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Müşteriyi aç' }).click();
  await expect(page.getByRole('button', { name: "WhatsApp'tan Yaz", exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'WhatsApp Business mesajı', exact: true }).click();
  await chooseSearchSelect(page, "Onaylı şablon", { value: 'fixture_template:tr' });
  await expect(page.getByRole('button', { name: 'Gönder', exact: true })).toBeDisabled();
  await page.getByLabel('body 1', { exact: true }).fill('UI_PARAMETER_PRIVATE');
  await expect(page.getByLabel('Şablon önizlemesi')).toContainText('Sipariş UI_PARAMETER_PRIVATE hazır.');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: 'Gönder', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sağlayıcı kabul etti' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gönder', exact: true })).toBeDisabled();
  const post = http.calls.filter((call) => call.method === 'POST'); assert.equal(post.length, 1);
  const id = post[0].body.biz_opaque_callback_data;
  db.applyBusinessMessageStatus({ providerMessageId: 'wamid.fixture1', messageId: id, status: 'read', timestamp: new Date().toISOString() });
  await page.evaluate(() => window.__bmNotify()); await expect(page.getByRole('status').filter({ hasText: 'Okundu' })).toBeVisible();
  await page.getByRole('button', { name: 'Çalışma alanını kapat', exact: true }).click();
  await page.keyboard.press('Escape');
  await row.click();
  await card.getByRole('switch', { name: 'WhatsApp Business servisi' }).uncheck();
  await expect(card.getByLabel('WABA ID', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Servisleri kaydet' }).click();
  await page.getByRole('button', { name: 'Müşteriyi aç' }).click();
  await expect(page.getByRole('button', { name: 'WhatsApp Business mesajı', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: "WhatsApp'tan Yaz", exact: true })).toBeVisible(); assert.deepEqual(errors, []);
  console.log('Business messaging service card, independent Web action, canonical Customer operation and single template send UI smoke passed.');
} finally { await browser?.close(); await server?.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
