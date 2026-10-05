import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { analyticsFixture } from './test-helpers/marketing-analytics-fixtures.mjs';

const f = await analyticsFixture();
let browser, server;
try {
  server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), logLevel: 'error', server: { port: 5191, host: '127.0.0.1' } }); await server.listen(); browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } }), errors = [], responses = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/analytics-fixture', async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/analytics-fixture', `<html><head><style>.d7-fixture {height:100vh;padding:1rem;box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/marketing-analytics.tsx')}"></script></body></html>`) }));
  await page.exposeFunction('__analyticsCall', async (method, args) => {
    try {
      const operations = { studio: () => f.service.snapshot(), schedules: () => ({ schedules: [], defaultTimezone: 'Europe/Istanbul', occurrences: [] }), analytics: () => f.serviceAnalytics.snapshot(...args), campaignAnalytics: () => f.serviceAnalytics.campaign(args[0]), publicationAnalytics: () => f.serviceAnalytics.publication(args[0]), refresh: () => f.serviceAnalytics.refreshPublication(args[0]),
        configuration: () => f.single.getConfiguration(), smsConfiguration: () => f.sms.getConfiguration(), campaigns: () => f.campaigns.listCampaigns(), segments: () => f.campaigns.listSegments(), templates: () => f.single.listTemplates(), campaign: () => f.campaigns.getCampaign(args[0]) };
      const value = await operations[method](); if (['analytics','campaignAnalytics','publicationAnalytics','refresh'].includes(method)) responses.push(value);
      return ['configuration','smsConfiguration'].includes(method) ? value : { ok: true, value };
    } catch (e) { return { ok: false, code: e.code, message: e.message }; }
  });
  await page.goto(`${server.resolvedUrls.local[0]}analytics-fixture`); await page.getByRole('button', { name: 'Analitik', exact: true }).click();
  await expect(page.getByLabel('Analitik genel özet')).toContainText('Kabul edilen6');
  for (const channel of ['Website','WhatsApp','SMS','Instagram']) await expect(page.getByLabel(`${channel} analitiği`, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Website analitiği')).toContainText('Ziyaret verisi toplanmıyor.');
  await expect(page.getByLabel('Website metrikleri')).toContainText('Başarısız0');
  await expect(page.getByLabel('Instagram analitiği')).toContainText('yetki doğrulanmadı');
  await page.getByText('Günlük değerleri tablo olarak göster', { exact: true }).click(); await expect(page.getByRole('table', { name: 'Hazırlama / oluşturma gününe göre sonuçlar' })).toBeVisible();
  await page.getByLabel('Tarih aralığı', { exact: true }).selectOption('7d'); await expect(page.getByRole('table', { name: 'Hazırlama / oluşturma gününe göre sonuçlar' }).locator('tbody tr')).toHaveCount(7);
  await page.getByLabel('Tarih aralığı', { exact: true }).selectOption('90d'); await expect(page.getByRole('table', { name: 'Hazırlama / oluşturma gününe göre sonuçlar' }).locator('tbody tr')).toHaveCount(90);
  await page.getByLabel('Tarih aralığı', { exact: true }).selectOption('custom'); await page.getByLabel('Başlangıç tarihi').fill('2029-12-01'); await page.getByLabel('Bitiş tarihi').fill('2029-12-02'); await page.getByRole('button', { name: 'Aralığı uygula' }).click();
  await expect(page.getByLabel('WhatsApp metrikleri')).toContainText('Kabul edilen—Henüz veri yok'); await expect(page.getByLabel('Website metrikleri')).toContainText('Aktif yayın · şu an1');
  await page.getByLabel('Tarih aralığı', { exact: true }).selectOption('30d'); await expect(page.getByLabel('Analitik genel özet')).toContainText('Kabul edilen6');
  // Analytics overview never renders names, contact, content or raw provider response.
  const overview = await page.getByLabel('Pazarlama analitiği', { exact: true }).innerText(); for (const privateValue of ['CUSTOMER_PII_PRIVATE','CAMPAIGN_NAME_PRIVATE','PUBLICATION_TITLE_PRIVATE','CONTENT_BODY_PRIVATE','CAPTION_PRIVATE','905550000001']) assert(!overview.includes(privateValue));
  await page.getByLabel('Son kampanyalar').getByRole('button', { name: 'Kampanyayı aç' }).first().click();
  await expect(page.getByLabel('Kampanya analitiği')).toBeVisible(); await expect(page.getByLabel('Kampanya metrikleri')).toContainText('Kitle5'); await expect(page.getByLabel('Kampanya metrikleri')).toContainText('Kabul edilen3');
  await page.getByRole('button', { name: 'Analitik', exact: true }).click(); await page.getByLabel('Son yayınlar').locator('.list-row').filter({ hasText: 'Website yayını' }).getByRole('button', { name: 'Yayını aç' }).click();
  await expect(page.getByLabel('Yayın analitiği')).toContainText('Ziyaret verisi toplanmıyor.'); await expect(page.getByLabel('Yayın analitiği')).toContainText('Yayın zamanı:');
  // Optional provider capability supplies 0 as a measured value and preserves failed/stale snapshots.
  f.provider(true); await page.getByRole('button', { name: 'Yayınlar', exact: true }).click();
  const publications = page.getByLabel('Yayınlar', { exact: true }).getByRole('button', { name: 'IG Fixture', exact: false }).filter({ has: page.locator('span').filter({ hasText: /^Instagram · Yayında$/ }) }); await publications.click();
  await expect(page.getByRole('button', { name: 'Sağlayıcı metriklerini yenile' })).toBeVisible();
  await page.getByRole('button', { name: 'Sağlayıcı metriklerini yenile' }).click(); await expect(page.getByLabel('Yayın metrikleri')).toContainText('Görüntülenme42'); await expect(page.getByLabel('Yayın metrikleri')).toContainText('Beğeni0'); assert.equal(f.fetchCount, 1);
  f.advanceAnalytics(16*60000); f.fail(true);
  await page.getByRole('button', { name: 'Analitik', exact: true }).click(); await page.getByRole('button', { name: 'Yayınlar', exact: true }).click(); await publications.click();
  await expect(page.getByLabel('Yayın metrikleri')).toContainText('Eski ölçüm');
  // Renderer clock follows the fixture's advanced time for the visible cooldown.
  await page.clock.setFixedTime(f.now()); await page.waitForTimeout(1100);
  await page.getByRole('button', { name: 'Sağlayıcı metriklerini yenile' }).click(); await expect(page.getByLabel('Yayın metrikleri')).toContainText('Metrik yenilenemedi'); await expect(page.getByLabel('Yayın metrikleri')).toContainText('Görüntülenme42');
  f.permission(false); await page.getByRole('button', { name: 'Analitik', exact: true }).click(); await page.getByRole('button', { name: 'Yayınlar', exact: true }).click(); await publications.click(); await expect(page.getByLabel('Yayın metrikleri')).toContainText('yetki'); await expect(page.getByRole('button', { name: 'Sağlayıcı metriklerini yenile' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Analitik', exact: true }).click(); await page.setViewportSize({ width: 640, height: 900 }); await expect(page.getByLabel('SMS analitiği')).toBeVisible(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await expect(page.getByRole('dialog')).toHaveCount(0); assert.deepEqual(errors, []);
  for (const privateValue of ['CUSTOMER_PII_PRIVATE','MESSAGE_BODY_PRIVATE','CONTENT_BODY_PRIVATE','PRIVATE_TOKEN','RAW_PROVIDER_METRIC_PRIVATE']) assert(!JSON.stringify(responses).includes(privateValue));
  mkdirSync('artifacts/marketing', { recursive: true }); await page.screenshot({ path: 'artifacts/marketing/d7-analytics-mobile.png', fullPage: true }); await page.setViewportSize({ width: 1440, height: 1080 }); await page.screenshot({ path: 'artifacts/marketing/d7-analytics.png', fullPage: true });
  console.log('D7 UI: summary, four channel cards, unavailable vs measured zero, ranges, accessible trends, canonical campaign/publication entry, provider freshness/failure/permission, privacy and responsive no-modal layout passed.');
} finally { await browser?.close(); await server?.close(); await f.dispose(); }
