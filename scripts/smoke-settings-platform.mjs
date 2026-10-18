import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { cancelSettingsService, saveSettingsService } from './test-helpers/settings-ui.mjs';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';

const server = await createServer({
  root: resolve('apps/desktop-app'),
  configFile: resolve('apps/desktop-app/vite.renderer.config.ts'),
  server: { port: 0, strictPort: false }
});
await server.listen();

let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.route('**/settings-platform-test*', async route => {
    const html = await server.transformIndexHtml(
      '/settings-platform-test',
      '<html><body><div id="root"></div><script type="module" src="/@fs/' +
        resolve('scripts/fixtures/settings-platform.tsx') +
        '"></script></body></html>'
    );
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.abort());
  await page.goto(`${server.resolvedUrls.local[0]}settings-platform-test`);

  const visit = query => page.goto(`${server.resolvedUrls.local[0]}settings-platform-test${query}`);
  const structure = page.getByRole('button', { name: /^İşletme Yapısı ve Özellikler/ });
  const expand = async () => { if (await structure.getAttribute('aria-expanded') === 'false') await structure.click(); };
  const manage = async id => {
    await expand();
    await page.locator(`#${id}`).getByRole('button').click();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    return page.locator('.settings-service-overlay');
  };
  const businessSave = () => page.locator('.settings-page-actions').getByRole('button', { name: 'Kaydet', exact: true }).click();
  const setupCalls = () => page.evaluate(() => window.settingsCalls.filter(call => call.kind === 'setup'));
  const cancel = () => cancelSettingsService(page);
  const serviceSave = () => saveSettingsService(page);
  const search = page.getByRole('searchbox', { name: 'Ayarlarda ara' });
  const openSearchResult = async (term, resultTitle, overlayTitle = resultTitle) => {
    await search.fill(term);
    await page.locator('.settings-search-results').getByRole('button', { name: resultTitle, exact: true }).click();
    await expect(page.getByRole('dialog', { name: overlayTitle, exact: true })).toBeVisible();
  };
  await expect(page.getByRole('tablist', { name: 'Ayar kategorileri' })).toHaveCount(0);
  await expect(structure).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Sektör tipi')).toBeHidden();
  await expect(page.getByLabel('Firma adı', { exact: true })).toBeVisible();
  await expect(page.locator('#settings-web')).toBeVisible();
  await expand();
  await expect(page.getByLabel('Sektör tipi')).toBeVisible();
  const expectedServices = ['settings-google-reviews', 'settings-ai', 'settings-speech', 'settings-dictation', 'settings-whatsapp', 'settings-android', 'settings-kbs'];
  for (const id of expectedServices) {
    const row = page.locator(`#${id}`);
    await expect(row).toHaveClass('settings-service-row');
    await expect(row.getByRole('button')).toHaveCount(1);
    await expect(row.locator('input, textarea, select')).toHaveCount(0);
    await expect(row.getByRole('img')).toHaveAttribute('aria-label', /Etkin|Kapalı/);
    await expect(row.getByRole('button')).toHaveText('');
    await expect(row.locator('[aria-label="Canlı kontrol durumu"]')).toHaveCount(0);
    await expect(row).not.toContainText(/Test edilmedi|Test kullanılamıyor|Hazır/);
  }
  await expect(page.locator('.settings-service-card')).toHaveCount(0);
  for (const [width, columns] of [[1440, 4], [1200, 3], [900, 2], [600, 1]]) {
    await page.setViewportSize({ width, height: 900 });
    const grid = page.locator('.settings-services-grid');
    expect(await grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(columns);
    const layout = await grid.evaluate(node => {
      const rows = [...node.querySelectorAll('.settings-service-row')].map(row => row.getBoundingClientRect());
      const box = node.getBoundingClientRect();
      return { contained: rows.every(row => row.left >= box.left && row.right <= box.right + 1),
        compact: rows.every(row => row.height <= 64), aligned: Math.max(...rows.map(row => row.height)) - Math.min(...rows.map(row => row.height)) <= 1 };
    });
    expect(layout, `${width}px service grid`).toEqual({ contained: true, compact: true, aligned: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // Actual provider calls occur only after explicit tests; opening a row never claims verification.
  expect(await page.evaluate(() => window.settingsCalls.filter(call => /-test$/.test(call.kind)).length)).toBe(0);
  await page.evaluate(() => window.refreshSettings({ whatsapp: '+905555551111' }));
  await page.getByLabel('Firma adı', { exact: true }).fill('Unsaved business');
  await page.getByRole('textbox', { name: /İşletme açıklaması/ }).fill('Unsaved public profile');
  let overlay = await manage('settings-whatsapp');
  const whatsapp = overlay.getByRole('switch', { name: 'WhatsApp servisi' });
  const originalWhatsapp = await whatsapp.isChecked();
  await whatsapp.setChecked(!originalWhatsapp);
  // External owner refreshes must not leave clean services stale behind a dirty one.
  await page.evaluate(() => window.refreshSettings({ localNetworkEnabled: !window.persistedSettings().localNetworkEnabled }));
  const statusBeforeClose = await page.locator('.global-message-bar').allTextContents();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeVisible();
  const decision = overlay.getByRole('alertdialog', { name: 'WhatsApp değişiklikleri bekliyor' });
  await expect(decision).toBeVisible();
  expect(await page.locator('.global-message-bar').allTextContents()).toEqual(statusBeforeClose);
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(overlay.locator('form')).toHaveAttribute('inert', '');
  await expect(decision.getByRole('button', { name: 'Burada kal', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await decision.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(decision).toHaveCount(0);
  await expect(overlay).toBeVisible();
  await expect(whatsapp).toBeChecked({ checked: !originalWhatsapp });
  await expect(page.locator('#settings-whatsapp').getByRole('img')).toHaveAttribute('aria-label', /Bekliyor/);
  await expect(overlay.getByLabel('Canlı kontrol durumu')).toHaveText('Test kullanılamıyor');
  await overlay.getByRole('button', { name: 'Formu kapat', exact: true }).click();
  await expect(decision).toBeVisible();
  await decision.getByRole('button', { name: 'Değişiklikleri geri al ve kapat', exact: true }).click();
  await expect(overlay).toHaveCount(0);
  expect(await setupCalls()).toHaveLength(0);
  overlay = await manage('settings-android');
  await expect(overlay.getByLabel('Yerel ağ bağlantısı')).toBeChecked({ checked: await page.evaluate(() => window.persistedSettings().localNetworkEnabled) });
  await cancel();
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue('Unsaved business');
  await expect(page.getByRole('textbox', { name: /İşletme açıklaması/ })).toHaveValue('Unsaved public profile');
  expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === 'profile'))).toHaveLength(0);
  overlay = await manage('settings-whatsapp');
  await expect(overlay.getByRole('switch', { name: 'WhatsApp servisi' })).toBeChecked({ checked: originalWhatsapp });
  await overlay.getByRole('switch', { name: 'WhatsApp servisi' }).setChecked(!originalWhatsapp);
  await page.evaluate(() => { window.failSetup = true; });
  await overlay.getByRole('button', { name: 'Formu kapat', exact: true }).click();
  await expect(decision).toBeVisible();
  await decision.getByRole('button', { name: 'Kaydet ve kapat', exact: true }).click();
  await expect(overlay).toBeVisible();
  await expect(decision).toHaveCount(0);
  await expect(overlay.getByRole('switch')).toBeChecked({ checked: !originalWhatsapp });
  await expect(overlay.getByLabel('Canlı kontrol durumu')).toHaveText('Test kullanılamıyor');
  await expect(page.locator('.global-message-bar')).toContainText('Test kayıt hatası');
  await page.mouse.click(5, 5);
  await expect(decision).toBeVisible();
  await decision.getByRole('button', { name: 'Burada kal', exact: true }).click();
  await expect(decision).toHaveCount(0);
  await page.evaluate(() => { window.failSetup = false; });
  // A different persisted writer may advance a clean owner before this Save reads latest.
  await page.evaluate(() => { window.persistedSettings().localNetworkEnabled = !window.persistedSettings().localNetworkEnabled; });
  // This save must not include or discard the pending business fields.
  await page.keyboard.press('Escape');
  await expect(decision).toBeVisible();
  await decision.getByRole('button', { name: 'Kaydet ve kapat', exact: true }).click();
  await expect(overlay).toHaveCount(0);
  expect((await setupCalls()).at(-1).input.businessName).toBe('İlk Firma');
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue('Unsaved business');
  overlay = await manage('settings-android');
  await expect(overlay.getByLabel('Yerel ağ bağlantısı')).toBeChecked({ checked: await page.evaluate(() => window.persistedSettings().localNetworkEnabled) });
  await cancel();
  await businessSave();
  expect((await setupCalls()).at(-1).input.businessName).toBe('Unsaved business');
  expect(await page.evaluate(() => window.settingsCalls.find(call => call.kind === 'profile').input.description)).toBe('Unsaved public profile');
  // Each overlay cancels independently; Google is a service with its dedicated persistence bridge.
  await page.getByLabel('Firma adı', { exact: true }).fill('Still unsaved');
  overlay = await manage('settings-google-reviews');
  await overlay.getByRole('switch').check();
  await overlay.getByLabel('Google Place ID').fill('fixture-place');
  await overlay.getByLabel('Places API anahtarı').fill('fixture-key');
  await overlay.getByRole('button', { name: 'Google Bağlantısını Dene' }).click();
  await expect(overlay.locator('.settings-service-detail-status')).toContainText('Hazır');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'google-reviews-test').length)).toBe(1);
  await overlay.getByLabel('Google Place ID').fill('changed-place');
  await expect(overlay.locator('.settings-service-detail-status')).toContainText('Test edilmedi');
  await cancel();
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'google-reviews').length)).toBe(0);
  overlay = await manage('settings-google-reviews');
  await expect(overlay.getByLabel('Google Place ID')).toHaveValue('');
  await overlay.getByRole('switch').check();
  await overlay.getByLabel('Google Place ID').fill('fixture-place');
  await overlay.getByLabel('Places API anahtarı').fill('fixture-key');
  await overlay.getByRole('button', { name: 'Google Bağlantısını Dene' }).click();
  const setupBeforeGoogle = (await setupCalls()).length;
  await page.evaluate(() => { window.failGoogleReviewsSave = true; });
  await serviceSave();
  await expect(overlay).toBeVisible();
  await expect(overlay.getByLabel('Google Place ID')).toHaveValue('fixture-place');
  await expect(page.locator('.global-message-bar.is-error')).toContainText('Google yorumları kayıt hatası.');
  await expect(overlay.getByLabel('Canlı kontrol durumu')).toHaveText('Hazır');
  await page.evaluate(() => { window.failGoogleReviewsSave = false; });
  await serviceSave();
  expect((await setupCalls()).length).toBe(setupBeforeGoogle);
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue('Still unsaved');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'google-reviews').length)).toBe(2);
  // TTS/STT are separate owners. No unsupported test calls are fabricated.
  overlay = await manage('settings-speech');
  const ttsSwitch = overlay.getByRole('switch');
  const originalTts = await ttsSwitch.isChecked();
  await ttsSwitch.setChecked(!originalTts);
  await expect(overlay.getByRole('slider', { name: /Konuşma hızı/ })).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Sesleri Yenile' })).toBeVisible();
  await cancel();
  overlay = await manage('settings-speech');
  await expect(overlay.getByRole('switch')).toBeChecked({ checked: originalTts });
  await cancel();
  overlay = await manage('settings-dictation');
  await expect(overlay.getByRole('switch')).toBeDisabled();
  await expect(overlay.getByLabel('Canlı kontrol durumu')).toHaveText('Test kullanılamıyor');
  await cancel();
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'dictation-test').length)).toBe(0);
  overlay = await manage('settings-kbs');
  await overlay.getByRole('button', { name: /KBS Girişini Dene|Bağlantısını Dene/ }).first().click();
  await expect(overlay.getByLabel('Canlı kontrol durumu')).not.toHaveText('Hazır');
  expect(await page.evaluate(() => window.settingsCalls.some(c => /send.*kbs|kbs.*send/.test(c.kind)))).toBe(false);
  await cancel();
  // Service availability allows configuration; device actions require committed Android activation.
  expect(await page.evaluate(() => window.fixtureRuntimeCapabilities())).not.toContain('service.android');
  await search.fill('Telefon Kurulumu');
  await expect(page.locator('.settings-search-results').getByRole('button')).toHaveCount(0);
  await search.fill('');
  overlay = await manage('settings-android');
  await overlay.getByRole('switch').check();
  await serviceSave();
  expect(await page.evaluate(() => window.persistedSettings().servicePreferences.android)).toBe(true);
  expect(await page.evaluate(() => window.fixtureRuntimeCapabilities())).toContain('service.android');
  await expect(page.locator('#settings-android').getByRole('img')).toHaveAttribute('data-state', 'active');
  // Synonyms and titles may differ. Both paths must open the canonical service owner.
  for (const [term, resultTitle, overlayTitle] of [
    ['places', 'Google Yorumları'], ['ai', 'AI Yardımcı'], ['AI', 'AI Yardımcı'],
    ['AI Bağlantısını Dene', 'AI Bağlantısını Dene', 'AI Yardımcı'],
    ['companion', 'Android'], ['Telefon Kurulumu', 'Telefon Kurulumu', 'Android'],
    ['tts', 'Metin Seslendirme'], ['stt', 'Konuşmadan Metne'],
    ['KBS', 'Kimlik Bildirim Sistemi', 'Kimlik Bildirim Sistemi (KBS)'], ['doğum günü', 'WhatsApp']
  ]) {
    await openSearchResult(term, resultTitle, overlayTitle);
    await cancel();
  }
  // Keyboard focus is trapped and restored; geometry at the minimum supported desktop size.
  await page.setViewportSize({ width: 900, height: 768 });
  await expand();
  const trigger = page.locator('#settings-android').getByRole('button');
  await trigger.focus(); await page.keyboard.press('Enter');
  overlay = page.locator('.settings-service-overlay');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'Kaydet', exact: true }).focus();
  await page.keyboard.press('Tab');
  expect(await overlay.evaluate(el => el.contains(document.activeElement))).toBe(true);
  const geometry = await overlay.evaluate(el => {
    const r = el.getBoundingClientRect(), body = el.querySelector('.workspace-frame__body');
    return { fits: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1,
      scrolls: getComputedStyle(body).overflowY === 'auto' };
  });
  expect(geometry).toEqual({ fits: true, scrolls: true });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  // Every normal visit starts collapsed; setup is always expanded, including without service capabilities.
  await visit('?profile=market&firstRun=on&missingRuntime');
  await expect(structure).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Sektör tipi')).toBeVisible();
  await expect(page.locator('.settings-service-row')).toHaveCount(0);
  await page.getByLabel('Otomatik eşitle', { exact: true }).uncheck();
  await page.getByLabel('Web güvenlik anahtarı', { exact: true }).fill('');
  await businessSave();
  await expect.poll(() => page.evaluate(() => window.persistedSettings().setupRequired)).toBe(false);
  await expect(structure).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => window.persistedSettings().businessName)).toBe('');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'web-test').length)).toBe(0);
  await visit('?profile=market&wholesale=on&online=on');
  await expand();
  // Registered extensions retain their visibility gates and their own save owner.
  await page.evaluate(() => window.refreshSettings({ profileOptions: ['commerce.wholesale', 'channel.online_sales', 'messaging.campaigns', 'marketing.studio'] }));
  for (const id of ['settings-dealer-portal', 'settings-online-delivery', 'settings-marketing-sms', 'settings-marketing-instagram', 'settings-whatsapp-business', 'settings-product-data']) {
    overlay = await manage(id);
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole('button', { name: 'Kaydet', exact: true })).toBeEnabled();
    await cancel();
  }
  for (const [term, title] of [['bayi', 'Bayi Web Erişimi'], ['aras', 'Teslimat ve Gönderim'],
    ['sms', 'SMS / İleti Merkezi'], ['instagram', 'Instagram'], ['waba', 'WhatsApp Business']]) {
    await openSearchResult(term, title);
    await cancel();
  }
  overlay = await manage('settings-marketing-sms');
  await overlay.getByLabel('SMS API Key', { exact: true }).fill('fixture-sms-key');
  await overlay.getByLabel('SMS API Hash', { exact: true }).fill('fixture-sms-hash');
  await overlay.getByLabel('SMS Sender ID', { exact: true }).fill('FIXTURE');
  await overlay.getByRole('button', { name: 'Başlık listesini yenile', exact: true }).click();
  await expect(overlay.locator('.settings-service-detail-status')).toContainText('Test edilmedi');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'sms-test'))).toHaveLength(0);
  await overlay.getByRole('button', { name: 'Bağlantıyı test et', exact: true }).click();
  await expect(overlay.locator('.settings-service-detail-status')).toContainText('Hazır');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'sms-test'))).toHaveLength(1);
  await overlay.getByLabel('SMS Sender ID', { exact: true }).fill('CHANGED');
  await expect(overlay.locator('.settings-service-detail-status')).toContainText('Test edilmedi');
  await cancel();
  await search.fill('barkod');
  await page.locator('.settings-search-results').getByRole('button', { name: 'Ürün Verisi' }).click();
  overlay = page.locator('.settings-service-overlay');
  await expect(page.getByRole('dialog', { name: 'Ürün Verisi', exact: true })).toBeVisible();
  const productToggle = overlay.getByRole('switch');
  await productToggle.setChecked(!await productToggle.isChecked());
  await serviceSave();
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'setup').length)).toBe(1);
  await visit('?profile=restaurant');
  await expand();
  await expect(page.locator('#settings-kbs')).toHaveCount(0);
  await expect(page.locator('#settings-product-data')).toHaveCount(0);
  await expect(page.locator('#settings-tables-button')).toBeVisible();
  await expect(page.locator('#settings-rooms-button')).toHaveCount(0);
  for (const term of ['KBS', 'Google Yorumları', 'barkod', 'Telefon Kurulumu']) {
    await search.fill(term);
    await expect(page.locator('.settings-search-results').getByRole('button')).toHaveCount(0);
  }
  await visit('?missingRuntime');
  for (const term of ['AI', 'Android', 'KBS', 'Google Yorumları', 'barkod', 'Telefon Kurulumu']) {
    await search.fill(term);
    await expect(page.locator('.settings-search-results').getByRole('button')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  console.log('settings-platform-smoke-ok: unified page, independent service save/discard, provider tests, first run, collapse, search, keyboard and viewport');
} finally {
  await browser?.close();
  await server.close();
}
