import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { dispatchFixture } from './test-helpers/messaging-dispatch-fixtures.mjs';
import { campaignInput, createCustomer } from './test-helpers/messaging-campaign-fixtures.mjs';
const f = dispatchFixture();
let server, browser;
try {
  createCustomer(f.db, 'Unknown');
  const { campaign, customers } = await f.prepare(2);
  f.raw.exec('UPDATE business_messaging_provider_config SET enabled=0');
  server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } }), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/dispatch-fixture', async (route) => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/dispatch-fixture', `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/messaging-campaigns.tsx')}"></script></body></html>`) }));
  await page.exposeFunction('__campaignCall', async (method, args) => {
    if (method === 'configuration') return f.single.getConfiguration();
    try {
      const actions = { templates: () => f.single.listTemplates(), campaigns: () => f.service.listCampaigns(), segments: () => f.service.listSegments(),
        campaign: () => f.service.getCampaign(args[0]), start: () => f.service.startCampaign(args[0]), pause: () => f.service.pauseCampaign(args[0]),
        resume: () => f.service.startCampaign(args[0], true), cancel: () => f.service.cancelCampaign(args[0]) };
      return { ok: true, value: await actions[method]() };
    } catch (error) { return { ok: false, code: error.code ?? 'operation_failed', message: error.message }; }
  });
  await page.addInitScript((initial) => { window.__campaignInitial = initial; }, { dashboard: f.db.getDashboardData(), customerId: customers[0] });
  await page.goto(`${server.resolvedUrls.local[0]}dispatch-fixture`);
  await page.getByRole('button', { name: 'Aç', exact: true }).click();
  const workspace = page.getByLabel('Kampanya çalışma alanı', { exact: true }), counts = page.getByLabel('Hazırlanan kitle', { exact: true });
  await expect(workspace).toContainText('Hazırlandı'); await expect(page.getByRole('button', { name: 'Gönderimi Başlat', exact: true })).toBeDisabled();
  assert.equal(f.posts().length, 0);
  f.raw.exec('UPDATE business_messaging_provider_config SET enabled=1');
  const refresh = () => page.evaluate(() => window.dispatchEvent(new Event('fixture-campaigns-changed')));
  await refresh(); await expect(page.getByRole('button', { name: 'Gönderimi Başlat', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Gönderimi Başlat', exact: true }).click();
  await expect(workspace).toContainText('Gönderim sürüyor'); await expect(page.getByRole('button', { name: 'Duraklat', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Gönderimi Başlat', exact: true })).toHaveCount(0);
  const worker = f.worker(); await f.tick(worker); await refresh();
  await expect(counts).toContainText('Eşleşen3'); await expect(counts).toContainText('Atlanan1');
  await expect(counts).toContainText('Gönderim kabul edildi1'); await expect(counts).toContainText('Bekleyen outbox1');
  await expect(workspace).toContainText('2/3 kayıt sonuçlandı.');
  await expect(page.getByRole('progressbar', { name: 'Kampanya ilerlemesi' })).toHaveAttribute('value', '2');
  await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
  await expect(workspace).toContainText('Duraklatıldı'); await expect(page.getByRole('button', { name: 'Devam Et', exact: true })).toBeEnabled();
  await f.tick(worker); assert.equal(f.posts().length, 1);
  await page.getByRole('button', { name: 'Devam Et', exact: true }).click(); await expect(workspace).toContainText('Gönderim sürüyor');
  f.clock.advance(3000); await f.tick(worker); await refresh();
  await expect(workspace).toContainText('Tamamlandı'); await expect(counts).toContainText('Gönderim kabul edildi2');
  await expect(counts).toContainText('Bekleyen outbox0'); await expect(workspace).toContainText('3/3 kayıt sonuçlandı.');
  for (const name of ['Gönderimi Başlat', 'Duraklat', 'Devam Et', 'Kampanyayı iptal et']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  assert.equal(f.service.getCampaign(campaign.id).campaign.status, 'completed');
  mkdirSync('artifacts/messaging-dispatch', { recursive: true });
  await page.screenshot({ path: 'artifacts/messaging-dispatch/completed.png' });
  const next = f.service.createCampaign(campaignInput(campaign.segmentId, { name: 'Cancel fixture' }));
  await f.service.prepareCampaign(next.id); await refresh();
  await page.getByRole('button', { name: 'Kampanya listesi', exact: true }).click();
  await page.locator('.campaign-list-row').filter({ hasText: 'Cancel fixture' }).getByRole('button', { name: 'Aç', exact: true }).click();
  await page.getByRole('button', { name: 'Gönderimi Başlat', exact: true }).click(); await expect(workspace).toContainText('Gönderim sürüyor');
  await page.getByRole('button', { name: 'Kampanyayı iptal et', exact: true }).click(); await expect(workspace).toContainText('İptal edildi');
  await f.tick(worker); assert.equal(f.posts().length, 2);
  const uncertain = f.service.createCampaign(campaignInput(campaign.segmentId, { name: 'Uncertain fixture' }));
  await f.service.prepareCampaign(uncertain.id); await f.service.startCampaign(uncertain.id);
  f.state.mode = 'lost';
  for (let i = 0; i < 8; i++) { f.clock.advance(1000000); await f.tick(worker); }
  await refresh(); await page.getByRole('button', { name: 'Kampanya listesi', exact: true }).click();
  await page.locator('.campaign-list-row').filter({ hasText: 'Uncertain fixture' }).getByRole('button', { name: 'Aç', exact: true }).click();
  await expect(workspace).toContainText('Tamamlandı'); await expect(counts).toContainText('Başarısız2');
  await expect(page.getByLabel('Gönderim hata özeti', { exact: true })).toContainText('Sağlayıcı sonucu belirsiz; tekrar gönderilmedi: 2');
  assert.equal(f.posts().length, 4, 'two uncertain intents never duplicate POST');
  await expect(workspace).not.toContainText('CUSTOMER_PRIVATE');
  await expect(page.getByRole('button', { name: /şimdi gönder|send now/i })).toHaveCount(0);
  assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => localStorage.length), 0);
  console.log('Campaign start/pause/resume/cancel, unavailable provider, acceptance counts, terminal progress and event refresh UI passed.');
} finally { await browser?.close(); await server?.close(); await f.dispose(); }
