import {expect} from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { openMarketingWorkspaceBrowser } from './test-helpers/marketing-workspace-browser.mjs';
import { analyticsFixture } from './test-helpers/marketing-analytics-fixtures.mjs';

const f = await analyticsFixture();
let browser;
try {
  const ui = await openMarketingWorkspaceBrowser(f); browser = {close: ui.close};
  const {page, errors, responses} = ui;
  await page.getByRole('button', { name: 'Analitik', exact: true }).click();
  await expect(page.getByLabel('Analitik genel özet')).toContainText('Gönderilen mesaj6');
  for (const channel of ['Web sitesi','WhatsApp Business','SMS','Instagram']) await expect(page.getByLabel(`${channel} analitiği`, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Web sitesi analitiği')).toContainText('Ziyaret verisi toplanmıyor.');
  await expect(page.getByLabel('Web sitesi metrikleri')).toContainText('Başarısız0');
  await expect(page.getByLabel('Instagram analitiği')).toContainText('Ölçüm izni doğrulanmadı');
  await expect(page.getByLabel('Analitik genel özet')).toContainText('Onaylanan yayın2');
  await expect(page.getByLabel('Analitik genel özet')).toContainText('Kullanılan kanal4');
  await expect(page.getByLabel('Analitik genel özet')).not.toContainText('Aktif kampanya');
  await page.getByRole('button', {name:'Ölçümler nasıl okunur?'}).click();
  await expect(page.getByRole('dialog', {name:'Ölçümler nasıl okunur?'})).toContainText('iki yayın sayılır');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Ölçümler nasıl okunur?'})).toBeFocused();
  const openDailyTable = async () => { await page.getByText('Günlük değerleri tablo olarak göster', {exact:true}).click(); };
  const chooseDate = async (label, value) => {
    await page.getByRole('button', {name:label, exact:true}).click();
    const picker = page.getByRole('dialog', {name:label + ' seçici'}), month = value.slice(0,7);
    for(let i=0; i<4 && await picker.getAttribute('data-picker-month') !== month; i++) {
      const current = await picker.getAttribute('data-picker-month');
      await picker.getByRole('button', {name:current < month ? 'Sonraki ay' : 'Önceki ay'}).click();
    }
    await picker.locator(`[data-date="${value}"]`).click();
  };
  await page.getByLabel('Tarih aralığı', { exact: true }).selectOption('7d'); await expect(page.getByLabel('Analitik genel özet')).toContainText('Gönderilen mesaj6'); await openDailyTable(); await expect(page.getByRole('table', { name: 'Hazırlama / oluşturma gününe göre sonuçlar' }).locator('tbody tr')).toHaveCount(7);
  await page.getByLabel('Tarih aralığı', { exact: true }).selectOption('90d'); await expect(page.getByLabel('Analitik genel özet')).toContainText('Gönderilen mesaj6'); await openDailyTable(); await expect(page.getByRole('table', { name: 'Hazırlama / oluşturma gününe göre sonuçlar' }).locator('tbody tr')).toHaveCount(90);
  await page.getByLabel('Tarih aralığı', { exact: true }).selectOption('custom'); await chooseDate('Başlangıç tarihi','2029-12-01'); await chooseDate('Bitiş tarihi','2029-12-02'); await page.getByRole('button', { name: 'Aralığı uygula' }).click();
  await expect(page.getByLabel('WhatsApp Business metrikleri')).toContainText('Bu aralıkta gönderim verisi yok.'); await expect(page.getByLabel('Analitik genel özet')).toContainText('Kullanılan kanal—'); await expect(page.getByLabel('Son sonuçlar')).toContainText('Bu aralıkta henüz sonuç yok.'); await expect(page.getByLabel('Zaman içindeki sonuçlar').locator('svg')).toHaveCount(0);
  await page.getByLabel('Tarih aralığı', { exact: true }).selectOption('30d'); await expect(page.getByLabel('Analitik genel özet')).toContainText('Gönderilen mesaj6');
  // Analytics overview never renders names, contact, content or raw provider response.
  const overview = await page.getByLabel('Pazarlama analitiği', { exact: true }).innerText(); for (const privateValue of ['CUSTOMER_PII_PRIVATE','CAMPAIGN_NAME_PRIVATE','PUBLICATION_TITLE_PRIVATE','CONTENT_BODY_PRIVATE','CAPTION_PRIVATE','905550000001']) assert(!overview.includes(privateValue));
  await page.getByLabel('Son sonuçlar').locator('.list-row').filter({hasText:'WhatsApp Business gönderimi'}).getByRole('button', { name: 'Sonucu aç' }).click();
  await page.getByRole('button',{name:'Teslim ve okunma sonuçları',exact:true}).click(); await expect(page.getByLabel('Kampanya analitiği')).toBeVisible(); await expect(page.getByLabel('Kampanya metrikleri')).toContainText('Kitle5'); await expect(page.getByLabel('Kampanya metrikleri')).toContainText('Gönderilen3');
  await page.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click(); await page.getByLabel('Son sonuçlar').locator('.list-row').filter({ hasText: 'Web sitesi yayını' }).getByRole('button', { name: 'Sonucu aç' }).click();
  await expect(page.getByLabel('Yayın analitiği')).toContainText('Ziyaret verisi toplanmıyor.'); await expect(page.getByRole('region',{name:'Geçmiş',exact:true})).toContainText('Yayınlandı');
  // Optional provider capability supplies 0 as a measured value and preserves failed/stale snapshots.
  await page.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click();
  const openInstagram = async () => {
    await page.getByLabel('Son sonuçlar').locator('.list-row').filter({hasText:'Instagram yayını'}).filter({hasText:'Yayınlandı'}).getByRole('button',{name:'Sonucu aç'}).click();
  };
  f.provider(true); await openInstagram();
  await expect(page.getByRole('button', { name: 'Sağlayıcı metriklerini yenile' })).toBeVisible();
  await page.getByRole('button', { name: 'Sağlayıcı metriklerini yenile' }).click(); await expect(page.getByLabel('Yayın metrikleri')).toContainText('Görüntülenme42'); await expect(page.getByLabel('Yayın metrikleri')).toContainText('Beğeni0'); assert.equal(f.fetchCount, 1);
  f.advanceAnalytics(16*60000); f.fail(true);
  await page.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click(); await openInstagram();
  await expect(page.getByLabel('Yayın metrikleri')).toContainText('Eski ölçüm');
  await page.clock.setFixedTime(f.now()); await page.waitForTimeout(1100);
  await page.getByRole('button', { name: 'Sağlayıcı metriklerini yenile' }).click(); await expect(page.getByLabel('Yayın metrikleri')).toContainText('Metrik yenilenemedi'); await expect(page.getByLabel('Yayın metrikleri')).toContainText('Görüntülenme42');
  f.permission(false); await page.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click(); await openInstagram(); await expect(page.getByLabel('Yayın metrikleri')).toContainText('Ölçüm izni'); await expect(page.getByRole('button', { name: 'Sağlayıcı metriklerini yenile' })).toHaveCount(0);
  await page.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click(); await page.setViewportSize({ width: 640, height: 900 }); await expect(page.getByLabel('SMS analitiği')).toBeVisible(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await expect(page.getByRole('dialog')).toHaveCount(0); assert.deepEqual(errors, []);
  for (const privateValue of ['CUSTOMER_PII_PRIVATE','MESSAGE_BODY_PRIVATE','CONTENT_BODY_PRIVATE','PRIVATE_TOKEN','RAW_PROVIDER_METRIC_PRIVATE']) assert(!JSON.stringify(responses).includes(privateValue));
  mkdirSync('artifacts/marketing', { recursive: true }); await page.screenshot({ path: 'artifacts/marketing/d7-analytics-mobile.png', fullPage: true }); await page.setViewportSize({ width: 1440, height: 1080 }); await page.screenshot({ path: 'artifacts/marketing/d7-analytics.png', fullPage: true });
  // Deactivating an existing provider removes its card, help text and historical aggregates from this active-services view.
  f.sql.prepare("UPDATE business_messaging_provider_config SET enabled=0 WHERE provider_id='whatsapp_cloud'").run();
  await page.getByRole('button',{name:'Sonuçları yenile',exact:true}).click();
  await expect(page.getByLabel('WhatsApp Business analitiği',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Analitik genel özet')).toContainText('Gönderilen mesaj3');
  await expect(page.getByLabel('Analitik genel özet')).not.toContainText('WhatsApp');
  await expect(page.getByLabel('Son sonuçlar')).not.toContainText('WhatsApp Business gönderimi');
  f.sql.prepare("UPDATE marketing_provider_config SET enabled=0 WHERE provider_id='iletimerkezi'").run();
  await page.getByRole('button',{name:'Sonuçları yenile',exact:true}).click();
  await expect(page.getByLabel('SMS analitiği',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Analitik genel özet')).not.toContainText('Gönderilen mesaj');
  await expect(page.getByLabel('Zaman içindeki sonuçlar')).not.toContainText('Gönderilen mesaj');
  await expect(page.getByLabel('Son sonuçlar')).not.toContainText('SMS gönderimi');
  console.log('D7 UI: summary, four channel cards, unavailable vs measured zero, ranges, accessible trends, canonical campaign/publication entry, provider freshness/failure/permission, privacy and responsive no-modal layout passed.');
} finally { await browser?.close(); await f.dispose(); }
