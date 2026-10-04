import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { campaignFixture, createCustomer, preference } from './test-helpers/messaging-campaign-fixtures.mjs';
const fixture = campaignFixture(), { service, single, db, http } = fixture;
let server, browser, webCalls = 0;
try {
  const allowed = createCustomer(db, 'UI Campaign Customer');
  createCustomer(db, 'Unknown');
  const denied = createCustomer(db, 'Denied'); service.savePreference(preference(denied, 'opted_out'));
  const missing = createCustomer(db, 'Missing', ''); service.savePreference(preference(missing, 'opted_in'));
  server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } }), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/campaign-fixture', async (route) => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/campaign-fixture', `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/messaging-campaigns.tsx')}"></script></body></html>`) }));
  await page.exposeFunction('__campaignCall', async (method, args) => {
    if (method === 'configuration') return single.getConfiguration();
    if (method === 'web') { webCalls++; return null; }
    try {
      const functions = { templates: () => single.listTemplates(), preference: () => service.getPreference(...args), savePreference: () => service.savePreference(args[0]),
        segments: () => service.listSegments(), saveSegment: () => service.saveSegment(args[0]), previewSegment: () => service.previewSegment(...args),
        campaigns: () => service.listCampaigns(), create: () => service.createCampaign(args[0]), campaign: () => service.getCampaign(args[0]),
        preview: () => service.previewCampaign(args[0]), prepare: () => service.prepareCampaign(args[0]), cancel: () => service.cancelCampaign(args[0]) };
      return { ok: true, value: await functions[method]() };
    } catch (error) { return { ok: false, code: error.code ?? 'operation_failed', message: error.message }; }
  });
  await page.addInitScript((initial) => { window.__campaignInitial = initial; }, { dashboard: db.getDashboardData(), customerId: allowed });
  await page.goto(`${server.resolvedUrls.local[0]}campaign-fixture`);
  await page.getByRole('button', { name: 'Müşteri tercihini aç' }).click();
  const preferenceSelect = page.getByRole('combobox', { name: 'WhatsApp pazarlama', exact: true });
  await expect(preferenceSelect).toBeEnabled(); await expect(preferenceSelect).toHaveValue('unknown');
  await preferenceSelect.selectOption('opted_in'); await expect(page.getByText('Pazarlama tercihi kaydedildi.', { exact: true })).toBeVisible();
  assert.equal(service.getPreference(allowed, 'whatsapp', 'marketing').status, 'opted_in');
  await page.getByRole('button', { name: 'Çalışma alanını kapat', exact: true }).click();
  await page.getByRole('button', { name: 'Segmentler', exact: true }).click();
  await page.getByLabel('Segment adı', { exact: true }).fill('UI All customers');
  await page.getByRole('button', { name: 'Segmenti kaydet', exact: true }).click();
  await expect(page.getByText('Segment kaydedildi.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Segmenti önizle', exact: true }).click();
  const counts = page.getByLabel('Kitle önizlemesi', { exact: true });
  await expect(counts).toContainText('Eşleşen4'); await expect(counts).toContainText('Uygun1');
  await expect(counts).toContainText('İzin bilinmiyor1'); await expect(counts).toContainText('İzin vermiyor1'); await expect(counts).toContainText('Telefon eksik/geçersiz1');
  await page.getByRole('button', { name: 'Yeni kampanya', exact: true }).click();
  await page.getByLabel('Kampanya adı', { exact: true }).fill('UI Marketing campaign');
  await page.getByRole('combobox', { name: 'Segment', exact: true }).selectOption({ label: 'UI All customers' });
  await page.getByRole('combobox', { name: 'Onaylı şablon', exact: true }).selectOption('fixture_template');
  await page.getByRole('combobox', { name: 'Şablon dili', exact: true }).selectOption('tr');
  await page.getByRole('combobox', { name: 'body 1 bağlantısı', exact: true }).selectOption('customer.fullName');
  // Inline discard guard preserves the draft when returning to editing.
  await page.getByRole('button', { name: 'Kampanya listesi', exact: true }).click();
  await expect(page.getByLabel('Kaydedilmemiş değişiklikler', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Düzenlemeye dön', exact: true }).click();
  await expect(page.getByLabel('Kampanya adı', { exact: true })).toHaveValue('UI Marketing campaign');
  await page.getByRole('button', { name: 'Kitleyi önizle', exact: true }).click(); await expect(counts).toContainText('Uygun1');
  assert.equal(service.listCampaigns().length, 0, 'preview creates no campaign');
  await page.getByRole('button', { name: 'Taslağı kaydet', exact: true }).click();
  await expect(page.getByLabel('Kampanya çalışma alanı', { exact: true })).toContainText('Taslak');
  await page.getByRole('button', { name: 'Hazırla', exact: true }).click();
  await expect(page.getByLabel('Kampanya çalışma alanı', { exact: true })).toContainText('Hazırlandı');
  const prepared = page.getByLabel('Hazırlanan kitle', { exact: true });
  await expect(prepared).toContainText('Eşleşen4'); await expect(prepared).toContainText('Hazırlamada uygun1'); await expect(prepared).toContainText('Atlanan3'); await expect(prepared).toContainText('Bekleyen outbox1');
  await expect(page.getByRole('button', { name: /şimdi gönder|send now|gönder/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hazırla', exact: true })).toHaveCount(0);
  mkdirSync('artifacts/messaging-campaigns', { recursive: true });
  await page.screenshot({ path: 'artifacts/messaging-campaigns/prepared.png' });
  await page.getByRole('button', { name: 'Müşteri tercihini aç' }).click(); await expect(preferenceSelect).toHaveValue('opted_in');
  await preferenceSelect.selectOption('opted_out'); await expect(page.getByText('Pazarlama tercihi kaydedildi.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'WhatsApp Business mesajı', exact: true })).toBeVisible();
  await page.getByRole('button', { name: "WhatsApp'tan Yaz", exact: true }).click(); assert.equal(webCalls, 1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Durumu yenile', exact: true }).click(); await expect(prepared).toContainText('Bekleyen outbox0'); await expect(prepared).toContainText('Atlanan4');
  await page.getByRole('button', { name: 'Kampanyayı iptal et', exact: true }).click(); await expect(page.getByLabel('Kampanya çalışma alanı', { exact: true })).toContainText('İptal edildi');
  assert.equal(http.calls.filter((call) => call.method === 'POST').length, 0); assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  console.log('Campaign and segment editors, preview counts, prepare/cancel, frozen state, Customer consent, existing single actions and no-send UI passed.');
} finally { await browser?.close(); await server?.close(); fixture.dispose(); }
