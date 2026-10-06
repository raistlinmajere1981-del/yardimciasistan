import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { campaignFixture, campaignInput, createCustomer, preference } from './test-helpers/messaging-campaign-fixtures.mjs';
const fixture = campaignFixture(), { service, single, db, http } = fixture;
let server, browser, webCalls = 0;
try {
  const allowed = createCustomer(db, 'UI Campaign Customer');
  createCustomer(db, 'Unknown');
  const denied = createCustomer(db, 'Denied'); service.savePreference(preference(denied, 'opted_out'));
  const missing = createCustomer(db, 'Missing', ''); service.savePreference(preference(missing, 'opted_in'));
  server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), logLevel: 'error', server: { port: 0, strictPort: false, host: '127.0.0.1' } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } }), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/campaign-fixture', async (route) => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/campaign-fixture', `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/messaging-campaigns.tsx')}"></script></body></html>`) }));
  await page.exposeFunction('__campaignCall', async (method, args) => {
    if (method === 'configuration') return single.getConfiguration();
    if (method === 'web') { webCalls++; return null; }
    try {
      const functions = { channels: () => fixture.marketingChannels(), templates: () => single.listTemplates(), preference: () => service.getPreference(...args), savePreference: () => service.savePreference(args[0]),
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
  await page.getByRole('button', { name: 'Hedef kitleyi aç', exact: true }).click();
  await page.getByLabel('Hedef kitle adı', { exact: true }).fill('UI All customers');
  await page.getByRole('button', { name: 'Hedef kitleyi kaydet ve seç', exact: true }).click();
  await page.getByRole('button', { name: 'Uygun alıcıları kontrol et', exact: true }).click();
  const counts = page.getByLabel('Hedef kitle önizlemesi', { exact: true });
  await expect(counts).toContainText('Toplam4'); await expect(counts).toContainText('Gönderime uygun1');
  await expect(counts).toContainText('İzni bilinmiyor1'); await expect(counts).toContainText('İzin vermeyen1'); await expect(counts).toContainText('Telefonu geçersiz1');
  assert.equal(service.listCampaigns().length, 0, 'audience preview creates no campaign');
  await page.getByRole('button', { name: 'Çalışma alanını kapat', exact: true }).click();
  const audience = service.listSegments().find(a => a.name === 'UI All customers');
  service.createCampaign(campaignInput(audience.id, {name: 'UI Marketing campaign'}));
  await page.getByRole('button', { name: 'Durumu yenile', exact: true }).click();
  await page.getByRole('button', { name: 'Aç', exact: true }).click();
  const workspace = page.getByLabel('Gönderim ayrıntıları', { exact: true });
  await expect(workspace).toContainText('Taslak');
  await page.getByRole('button', { name: 'Gönderime hazırla', exact: true }).click();
  await expect(workspace).toContainText('Gönderime hazır');
  await expect(workspace).toContainText('Hedef kitle4'); await expect(workspace).toContainText('Uygun1');
  await expect(workspace).toContainText('Atlanan3'); await expect(workspace).toContainText('Bekleyen1');
  await expect(page.getByRole('button', { name: 'Gönderime hazırla', exact: true })).toBeDisabled();
  mkdirSync('artifacts/messaging-campaigns', { recursive: true });
  await page.screenshot({ path: 'artifacts/messaging-campaigns/prepared.png' });
  await page.getByRole('button', { name: 'Çalışma alanını kapat', exact: true }).click();
  await page.getByRole('button', { name: 'Müşteri tercihini aç' }).click(); await expect(preferenceSelect).toHaveValue('opted_in');
  await preferenceSelect.selectOption('opted_out'); await expect(page.getByText('Pazarlama tercihi kaydedildi.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'WhatsApp Business mesajı', exact: true })).toBeVisible();
  await page.getByRole('button', { name: "WhatsApp'tan Yaz", exact: true }).click(); assert.equal(webCalls, 1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Durumu yenile', exact: true }).click(); await page.getByRole('button', { name: 'Aç', exact: true }).click();
  await expect(workspace).toContainText('Bekleyen0'); await expect(workspace).toContainText('Atlanan4');
  await page.getByRole('button', { name: 'Gönderimi iptal et', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', {name:'Gönderimi iptal et',exact:true}).click();
  await expect(workspace).toContainText('İptal edildi');
  assert.equal(http.calls.filter((call) => call.method === 'POST').length, 0); assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  console.log('Audience selection, permission preview, canonical delivery prepare/cancel, Customer consent and no-send UI passed.');
} finally { await browser?.close(); await server?.close(); fixture.dispose(); }
