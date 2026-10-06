import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { resolve } from 'node:path';
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

  const tab = name => page.getByRole('tab', { name: new RegExp('^' + name + '( ·|$)') });
  const select = name => tab(name).click();
  const save = () => page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  const discard = () => page.getByRole('button', { name: 'Değişiklikleri Geri Al', exact: true }).click();
  const guard = () => page.getByRole('dialog', { name: /değişiklikleri bekliyor/i });
  const setupCalls = () => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'setup'));
  const layoutCalls = () => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'layout'));
  const updateCalls = () => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'update-preferences'));

  await expect(page.getByRole('tablist', { name: 'Ayar kategorileri' })).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.locator('.settings-category-workspace')).toHaveCount(1);
  await expect(tab('İşletme')).toHaveAttribute('aria-selected', 'true');

  // Room settings have their own surface; pension-only must never offer a blank table surface.
  await page.goto(`${server.resolvedUrls.local[0]}settings-platform-test?profile=pension`);
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('masa yönetimi');
  await expect(page.getByRole('button', { name: 'İşletme Düzeni · Masa yönetimi', exact: true })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('');
  await select('İşletme Düzeni');
  await expect(page.locator('#settings-operations')).toHaveCount(0);
  await expect(page.locator('#settings-rooms')).toBeVisible();
  await page.goto(`${server.resolvedUrls.local[0]}settings-platform-test?profile=restaurant`);
  await select('İşletme Düzeni');
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('masa yönetimi');
  await expect(page.getByRole('button', { name: 'İşletme Düzeni · Masa yönetimi', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('');
  await expect(page.locator('#settings-operations')).toBeVisible();

  // Persisted runtime capability, not the profile preset, controls this resource/search surface.
  await page.goto(`${server.resolvedUrls.local[0]}settings-platform-test?profile=market&tables=on`);
  await select('İşletme Düzeni');
  await expect(page.locator('#settings-operations')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('masa yönetimi');
  await expect(page.getByRole('button', { name: 'İşletme Düzeni · Masa yönetimi', exact: true })).toBeVisible();
  await page.goto(`${server.resolvedUrls.local[0]}settings-platform-test?profile=restaurant&tables=off`);
  await select('İşletme Düzeni');
  await expect(page.locator('#settings-operations')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('masa yönetimi');
  await expect(page.getByRole('button', { name: 'İşletme Düzeni · Masa yönetimi', exact: true })).toHaveCount(0);
  await page.goto(`${server.resolvedUrls.local[0]}settings-platform-test`);

  // A preset round-trip is not an explicit edit of the operator's existing OFF selection.
  await page.evaluate(() => window.refreshSettings({ profileId: 'pension', profileOptions: ['accommodation.reservations'] }));
  const requestOption = page.getByLabel('Talepler', { exact: true });
  await expect(requestOption).not.toBeChecked();
  await page.getByRole('combobox', { name: /Sektör tipi/ }).selectOption('market');
  await page.getByRole('combobox', { name: /Sektör tipi/ }).selectOption('pension');
  await expect(requestOption).not.toBeChecked();
  await page.getByLabel('Firma adı', { exact: true }).fill('Round-trip Firma');
  await save();
  expect((await setupCalls()).at(-1).input.profileOptions).not.toContain('customer.requests');
  // Actual checkbox edits survive a profile round-trip; discard resets that transient selection.
  await requestOption.check();
  await page.getByRole('combobox', { name: /Sektör tipi/ }).selectOption('market');
  await page.getByRole('combobox', { name: /Sektör tipi/ }).selectOption('pension');
  await expect(requestOption).toBeChecked();
  await discard();
  await expect(requestOption).not.toBeChecked();
  await page.getByRole('combobox', { name: /Sektör tipi/ }).selectOption('market');
  await page.getByRole('combobox', { name: /Sektör tipi/ }).selectOption('pension');
  await expect(requestOption).not.toBeChecked();
  await page.goto(`${server.resolvedUrls.local[0]}settings-platform-test`);

  // First-run setup intentionally exposes only Business; the remaining categories appear after the first save.
  await page.evaluate(() => window.refreshSettings({ setupRequired: true }));
  await expect(page.getByRole('tablist', { name: 'Ayar kategorileri' }).getByRole('tab')).toHaveCount(1);
  await expect(tab('İşletme')).toBeVisible();
  await expect(tab('İşletme Düzeni')).toHaveCount(0);
  await expect(tab('Servisler')).toHaveCount(0);
  await expect(tab('Uygulama')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('görünüm');
  await expect(page.getByRole('button', { name: 'Uygulama · Görünüm', exact: true })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('');
  await page.evaluate(() => window.refreshSettings({ setupRequired: false }));
  await expect(page.getByRole('tablist', { name: 'Ayar kategorileri' }).getByRole('tab')).toHaveCount(4);

  // Customer credit is a retail-only account model and must not overlap hospitality folios/table accounts.
  await expect(page.getByLabel('Veresiye / Müşteri Hesabı', { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.refreshSettings({ profileId: 'market', profileOptions: [] }));
  await expect(page.getByLabel('Veresiye / Müşteri Hesabı', { exact: true })).toBeVisible();
  await page.evaluate(() => window.refreshSettings({ profileId: 'pension_restaurant', profileOptions: [] }));
  await expect(page.getByLabel('Veresiye / Müşteri Hesabı', { exact: true })).toHaveCount(0);

  // Online delivery is one staged Services draft under the online-sales capability.
  const deliveryForms = await page.evaluate(async () => {
    const { toSetupForm } = await import('/src/app/setup-model.ts');
    const { validateSettingsCategory } = await import('/src/app/settings-draft-model.ts');
    const setup = window.persistedSettings();
    const missingDelivery = { ...setup };
    delete missingDelivery.onlineSalesDelivery;
    return {
      defaults: [missingDelivery, { ...setup, onlineSalesDelivery: undefined }].map(input => {
        const form = toSetupForm(input);
        return { delivery: form.onlineSalesDelivery, validation: validateSettingsCategory(form, 'services') };
      }),
      explicit: [
        { pickupEnabled: true, shippingEnabled: false },
        { pickupEnabled: false, shippingEnabled: true },
        { pickupEnabled: true, shippingEnabled: true },
        { pickupEnabled: false, shippingEnabled: false }
      ].map(delivery => ({ input: delivery, output: toSetupForm({ ...setup, onlineSalesDelivery: delivery }).onlineSalesDelivery }))
    };
  });
  for (const form of deliveryForms.defaults) {
    expect(form.delivery).toEqual({ pickupEnabled: true, shippingEnabled: false });
    expect(form.validation).toBeNull();
  }
  for (const form of deliveryForms.explicit) expect(form.output).toEqual(form.input);
  await page.evaluate(() => window.refreshSettings({ profileId: 'market', profileOptions: ['channel.online_sales'], onlineSalesDelivery: undefined }));
  await select('Servisler');
  const deliverySettings = page.locator('#settings-online-delivery');
  await expect(deliverySettings).toBeVisible();
  await expect(deliverySettings.getByLabel('İşletmeden teslim', { exact: true })).toBeChecked();
  await expect(deliverySettings.getByLabel('Kargo ile gönderim', { exact: true })).not.toBeChecked();
  const deliverySetupCount = (await setupCalls()).length;
  await deliverySettings.getByLabel('Kargo ile gönderim', { exact: true }).check();
  await expect(tab('Servisler')).toContainText('Değişiklik var');
  expect((await setupCalls()).length).toBe(deliverySetupCount);
  await discard();
  await expect(deliverySettings.getByLabel('Kargo ile gönderim', { exact: true })).not.toBeChecked();
  await deliverySettings.getByLabel('İşletmeden teslim', { exact: true }).uncheck();
  await save();
  await expect(page.getByText('En az bir online satış teslimat yöntemi açık olmalı.', { exact: true })).toBeVisible();
  expect((await setupCalls()).length).toBe(deliverySetupCount);
  await deliverySettings.getByLabel('Kargo ile gönderim', { exact: true }).check();
  await save();
  expect((await setupCalls()).at(-1).input.onlineSalesDelivery).toEqual({ pickupEnabled: false, shippingEnabled: true });
  await expect(tab('Servisler')).not.toContainText('Değişiklik var');
  await page.evaluate(() => window.refreshSettings({ profileId: 'pension_restaurant', profileOptions: [], onlineSalesDelivery: { pickupEnabled: true, shippingEnabled: false } }));
  await expect(deliverySettings).toHaveCount(0);

  // Product data belongs only to the retail/barcode profile, not generic catalog users such as restaurant.
  await select('Servisler');
  await expect(page.locator('#settings-product-data')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('ürün verisi');
  await expect(page.getByRole('button', { name: 'Servisler · Ürün Verisi', exact: true })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('');
  await page.evaluate(() => window.refreshSettings({ profileId: 'market', profileOptions: [] }));
  await expect(page.locator('#settings-product-data')).toBeVisible();
  await expect(page.locator('#settings-kbs')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('ürün verisi');
  await expect(page.getByRole('button', { name: 'Servisler · Ürün Verisi', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('');
  const productService = page.locator('#settings-product-data');
  const productToggle = productService.getByRole('checkbox', { name: 'Ürün Verisi servisi', exact: true });
  const serviceSetupBefore = (await setupCalls()).length;
  await expect(productService.locator('.settings-service-card-body')).toHaveCount(0);
  await productToggle.check();
  await expect(productService.getByRole('combobox')).toBeVisible();
  await expect(productService.getByLabel('Bilinmeyen barkodu otomatik ara', { exact: true })).toBeVisible();
  await expect(productService.getByLabel('Görselleri ekle', { exact: true })).toBeVisible();
  await expect(productService).toContainText('Veri lisansı: ODbL');
  expect((await setupCalls()).length).toBe(serviceSetupBefore);
  await discard();
  await expect(productToggle).not.toBeChecked();
  await expect(productService.locator('.settings-service-card-body')).toHaveCount(0);
  await productToggle.check();
  await save();
  expect((await setupCalls()).at(-1).input.productData.enabled).toBe(true);
  await productToggle.uncheck();
  await expect(productService.locator('.settings-service-card-body')).toHaveCount(0);
  await discard();
  await expect(productToggle).toBeChecked();
  await expect(productService.getByRole('combobox')).toBeVisible();

  await page.evaluate(() => window.refreshSettings({ profileOptions: ['commerce.wholesale'] }));
  await expect(page.locator('#settings-online-delivery')).toBeVisible();
  await expect(page.locator('#settings-online-delivery')).toContainText('Bayi Sipariş Teslimatı');
  const dealerPortal = page.locator('#settings-dealer-portal');
  const dealerToggle = dealerPortal.getByRole('checkbox', { name: 'Bayi portalını etkinleştir', exact: true });
  const dealerSetupCount = (await setupCalls()).length;
  await expect(dealerPortal).toBeVisible();
  await expect(dealerToggle).not.toBeChecked();
  await dealerToggle.check();
  await expect(tab('Servisler')).toContainText('Değişiklik var');
  expect((await setupCalls()).length).toBe(dealerSetupCount);
  await discard();
  await expect(dealerToggle).not.toBeChecked();
  await dealerToggle.check(); await save();
  expect((await setupCalls()).at(-1).input.dealerPortalEnabled).toBe(true);
  await dealerToggle.uncheck(); await save();
  expect((await setupCalls()).at(-1).input.dealerPortalEnabled).toBe(false);

  const arasService = page.locator('#settings-shipping-provider');
  const arasToggle = arasService.getByRole('checkbox', { name: 'Aras Kargo servisi', exact: true });
  const arasSetupBefore = (await setupCalls()).length;
  await expect(arasService.locator('.settings-service-card-body')).toHaveCount(0);
  await arasToggle.check();
  await expect(arasService.getByText('Etkin · Yapılandırılmamış', { exact: true })).toBeVisible();
  for (const label of ['Müşteri kodu', 'Kullanıcı adı', 'Şifre', 'Ortam']) await expect(arasService.getByLabel(label, { exact: true })).toBeVisible();
  await expect(arasService.getByRole('button', { name: 'Bağlantıyı test et', exact: true })).toBeDisabled();
  expect((await setupCalls()).length).toBe(arasSetupBefore);
  await discard();
  await expect(arasToggle).not.toBeChecked();
  await expect(arasService.locator('.settings-service-card-body')).toHaveCount(0);
  await arasToggle.check();
  await save();
  expect((await setupCalls()).at(-1).input.arasShipping.enabled).toBe(true);
  await arasToggle.uncheck();
  await expect(arasService.locator('.settings-service-card-body')).toHaveCount(0);
  await discard();
  await expect(arasToggle).toBeChecked();
  await expect(arasService.getByLabel('Müşteri kodu', { exact: true })).toBeVisible();

  for (const width of [1440, 600]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => {
      const aras = document.querySelector('#settings-shipping-provider');
      const product = document.querySelector('#settings-product-data');
      const fields = [...aras.querySelectorAll('.form-grid > label')].map(node => node.getBoundingClientRect());
      const previous = aras.parentElement.previousElementSibling.getBoundingClientRect();
      const productRect = product.getBoundingClientRect();
      const nextRect = product.nextElementSibling.getBoundingClientRect();
      return {
        columns: Math.abs(fields[0].top - fields[1].top) < 1 ? 2 : 1,
        headerFields: [...aras.querySelectorAll('.settings-service-card-header input:not([type="checkbox"]), .settings-service-card-header select')].length,
        targets: [aras, product].every(card => card.querySelector('.settings-service-card-header .settings-service-toggle').getBoundingClientRect().height >= 44),
        controls: [...aras.querySelectorAll('.form-grid input, .form-grid select')].every(node => node.getBoundingClientRect().height >= 44),
        separateCards: aras.getBoundingClientRect().top > previous.bottom && nextRect.top > productRect.bottom,
        bodyX: document.querySelector('.settings-category-body').scrollWidth <= document.querySelector('.settings-category-body').clientWidth + 1
      };
    });
    expect(geometry, `service card layout ${width}`).toEqual({ columns: width > 760 ? 2 : 1, headerFields: 0, targets: true, controls: true, separateCards: true, bodyX: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.refreshSettings({ profileId: 'pension_restaurant', profileOptions: [] }));
  await expect(page.locator('#settings-product-data')).toHaveCount(0);
  await expect(page.locator('#settings-kbs')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('kimlik bildirim');
  await expect(page.getByRole('button', { name: 'Servisler · Kimlik Bildirim Sistemi', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('');
  const kbsCalls = () => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'kbs'));
  const kbsBefore = (await kbsCalls()).length;
  await page.getByLabel('Kimlik Bildirim Sistemi servisi').check();
  await page.getByLabel('KBS kullanıcı adı').fill('smoke-kbs-user');
  await page.getByLabel('KBS kullanıcı T.C. kimlik no').fill('10000000146');
  await page.getByLabel('KBS parolası').fill('smoke-kbs-password');
  await expect(tab('Servisler')).toContainText('Değişiklik var');
  expect((await kbsCalls()).length).toBe(kbsBefore);
  await save();
  expect((await kbsCalls()).length).toBe(kbsBefore + 1);
  expect((await kbsCalls()).at(-1).input).toMatchObject({
    enabled: true,
    provider: 'egm',
    username: 'smoke-kbs-user',
    authorizedIdentityNumber: '10000000146'
  });
  await expect(tab('Servisler')).not.toContainText('Değişiklik var');
  await select('İşletme');

  await expect(page.locator('#settings-public-profile')).toHaveAttribute('aria-busy', 'false');
  const googleReviewsSection = page.locator('#settings-google-reviews');
  if (await googleReviewsSection.count()) {
    await expect(googleReviewsSection).toHaveAttribute('aria-busy', 'false');
  }

  // Clean keyboard navigation remains immediate and focus follows only accepted transitions.
  await tab('İşletme').focus();
  for (const [key, selected] of [
    ['ArrowRight', 'İşletme Düzeni'],
    ['End', 'Uygulama'],
    ['Home', 'İşletme'],
    ['ArrowLeft', 'Uygulama']
  ]) {
    await page.keyboard.press(key);
    await expect(tab(selected)).toBeFocused();
    await expect(tab(selected)).toHaveAttribute('aria-selected', 'true');
  }

  // External canonical refresh must not overwrite the one active dirty draft.
  // The keyboard scenario above intentionally ends on Application, so activate Business first.
  await select('İşletme');
  await page.getByLabel('Firma adı', { exact: true }).fill('Yerel Taslak');
  await page.evaluate(() => window.refreshSettings({ businessName: 'Dış Kaynak Firma' }));
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue('Yerel Taslak');
  await discard();
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue('Dış Kaynak Firma');

  // Restore the fixture baseline before the remaining independent scenarios.
  await page.evaluate(() => window.refreshSettings({ businessName: 'İlk Firma' }));
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue('İlk Firma');

  // Dirty category: stay, discard-and-go and save-and-go all share one guard.
  await page.getByLabel('Firma adı', { exact: true }).fill('Bekleyen Firma');
  await expect(tab('İşletme')).toContainText('Değişiklik var');

  await select('Servisler');
  await expect(guard()).toBeVisible();
  for (const width of [1366, 1024, 760]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await guard().evaluate(dialog => {
      const buttons = [...dialog.querySelectorAll('button')].map(el => el.getBoundingClientRect());
      const rect = dialog.getBoundingClientRect();
      return { rows: new Set(buttons.map(rect => Math.round(rect.top))).size, fits: rect.left >= 0 && rect.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth };
    });
    expect(geometry, `confirm geometry ${width}`).toEqual({ rows: 1, fits: true });
  }
  const stay = guard().getByRole('button', { name: 'Burada kal', exact: true });
  await stay.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(guard().getByRole('button', { name: 'Kaydet ve geç', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(stay).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(guard()).toHaveCount(0);
  await expect(tab('Servisler')).toBeFocused();
  await select('Servisler');
  await page.mouse.click(2, 2);
  await expect(guard()).toHaveCount(0);
  await select('Servisler');

  await expect(tab('İşletme')).toHaveAttribute('aria-selected', 'true');
  await guard().getByRole('button', { name: 'Burada kal', exact: true }).click();
  await expect(guard()).toHaveCount(0);
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue('Bekleyen Firma');

  await select('Servisler');
  await guard().getByRole('button', { name: 'Değişiklikleri geri al ve geç', exact: true }).click();
  await expect(tab('Servisler')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Servisler')).toBeFocused();
  await select('İşletme');
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue('İlk Firma');

  await page.getByLabel('Firma adı', { exact: true }).fill('Kaydedilen Firma');
  await select('İşletme Düzeni');
  await guard().getByRole('button', { name: 'Kaydet ve geç', exact: true }).click();
  await expect(tab('İşletme Düzeni')).toHaveAttribute('aria-selected', 'true');
  expect((await setupCalls()).at(-1).input.businessName).toBe('Kaydedilen Firma');

  // Failed guarded save never completes the transition and keeps the draft.
  await select('İşletme');
  await page.getByLabel('Firma adı', { exact: true }).fill('Hata Taslağı');
  await page.evaluate(() => { window.failSetup = true; window.delaySetup = true; });
  await select('Servisler');
  await guard().getByRole('button', { name: 'Kaydet ve geç', exact: true }).click();
  await expect(guard().getByRole('button', { name: 'Kaydediliyor…' })).toBeDisabled();
  await expect(guard().getByRole('button', { name: 'Burada kal' })).toBeDisabled();
  await expect(guard().getByRole('button', { name: 'Değişiklikleri geri al ve geç' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.mouse.click(2, 2);
  await expect(guard()).toBeVisible();
  await expect(tab('İşletme')).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => { window.delaySetup = false; window.finishSetup(); });
  await expect(guard()).toBeVisible();
  await expect(tab('İşletme')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.global-message-bar')).toContainText('Test kayıt hatası');
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue('Hata Taslağı');
  await page.evaluate(() => { window.failSetup = false; });
  await guard().getByRole('button', { name: 'Değişiklikleri geri al ve geç', exact: true }).click();
  await expect(tab('Servisler')).toHaveAttribute('aria-selected', 'true');

  // Search transitions obey the same guard; query/focus changes only after acceptance.
  await select('İşletme');
  await page.getByLabel('Firma adı', { exact: true }).fill('Arama Taslağı');
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('görünüm');
  const appearanceResult = page.getByRole('button', { name: 'Uygulama · Görünüm', exact: true });
  await appearanceResult.click();
  await expect(guard()).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Ayarlarda ara' })).toHaveValue('görünüm');
  await guard().getByRole('button', { name: 'Burada kal', exact: true }).click();
  await expect(tab('İşletme')).toHaveAttribute('aria-selected', 'true');

  await appearanceResult.click();
  await guard().getByRole('button', { name: 'Değişiklikleri geri al ve geç', exact: true }).click();
  await expect(tab('Uygulama')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', { name: 'Ayarlarda ara' })).toHaveValue('');
  await expect(page.locator('#settings-appearance')).toBeFocused();

  // Appearance joins the Application draft and is not applied until category save.
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'system');
  await page.getByRole('radio', { name: 'Koyu', exact: true }).check();
  await expect(tab('Uygulama')).toContainText('Değişiklik var');
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'system');
  await discard();
  await expect(page.getByRole('group', { name: 'Renk düzeni' }).getByRole('radio', { name: 'Sistem', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'system');
  await expect(tab('Uygulama')).not.toContainText('Değişiklik var');

  await page.getByRole('radio', { name: 'Koyu', exact: true }).check();
  await save();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  await expect(tab('Uygulama')).not.toContainText('Değişiklik var');

  // Update preferences use the same category footer and baseline comparison.
  const updateInput = page.getByLabel('Güncelleme sunucusu');
  await updateInput.fill('https://new-update.example.test');
  await expect(tab('Uygulama')).toContainText('Değişiklik var');
  await updateInput.fill('https://example.test/updates');
  await expect(tab('Uygulama')).not.toContainText('Değişiklik var');

  await updateInput.fill('https://new-update.example.test');
  await page.evaluate(() => { window.failUpdate = true; });
  await save();
  await expect(page.locator('.global-message-bar')).toContainText('Güncelleme tercih hatası');
  await expect(updateInput).toHaveValue('https://new-update.example.test');
  await page.evaluate(() => { window.failUpdate = false; });
  await save();
  expect((await updateCalls()).at(-1).input.customBaseUrl).toBe('https://new-update.example.test');
  await expect(tab('Uygulama')).not.toContainText('Değişiklik var');

  await page.getByRole('button', { name: 'Varsayılana Dön', exact: true }).click();
  await expect(tab('Uygulama')).toContainText('Değişiklik var');
  const beforeResetSave = (await updateCalls()).length;
  await save();
  expect((await updateCalls()).length).toBe(beforeResetSave + 1);
  expect((await updateCalls()).at(-1).input.customBaseUrl).toBe('');

  // Appearance draft joins the same leave guard; discard restores committed values.
  await page.getByRole('group', { name: 'Yoğunluk' }).getByRole('radio', { name: 'Kompakt', exact: true }).check();
  await expect(tab('Uygulama')).toContainText('Değişiklik var');
  await select('İşletme');
  await expect(guard()).toBeVisible();
  await guard().getByRole('button', { name: 'Değişiklikleri geri al ve geç', exact: true }).click();
  await expect(tab('İşletme')).toHaveAttribute('aria-selected', 'true');
  await select('Uygulama');
  await expect(page.getByRole('group', { name: 'Yoğunluk' }).getByRole('radio', { name: 'Rahat', exact: true })).toBeChecked();
  await expect(tab('Uygulama')).not.toContainText('Değişiklik var');

  // Operations is one collection draft: room + room details + table categories, one footer save.
  await select('İşletme Düzeni');
  const roomRows = page.locator('.room-management-row');
  await expect(roomRows).toHaveCount(1);
  await roomRows.first().getByRole('button', { name: 'Detaylar', exact: true }).click();
  const roomDialog = page.getByRole('dialog', { name: 'Oda bilgilerini düzenle' });
  await expect(roomDialog).toBeVisible();
  await expect(roomDialog).toHaveClass(/form-dialog/);
  await expect(roomDialog.locator('.panel')).toHaveCount(2);
  await roomDialog.getByLabel('Oda adı').fill('Deniz Oda');
  await roomDialog.getByLabel('Oda numarası').fill('A1');
  await roomDialog.getByLabel('Kapasite').fill('3');
  await roomDialog.getByLabel('Kat / konum').fill('2. kat');
  await roomDialog.getByLabel('Yatak bilgisi').fill('1 çift kişilik + 1 tek kişilik yatak');
  await roomDialog.getByLabel('Gecelik fiyat').fill('1750');
  await roomDialog.getByLabel('Açıklama').fill('Kaydedilmemiş oda taslağı korunmalı.');
  await page.evaluate(() => window.refreshSettings({}));
  await expect(roomDialog.getByLabel('Oda adı')).toHaveValue('Deniz Oda');
  await expect(roomDialog.getByLabel('Oda numarası')).toHaveValue('A1');
  await expect(roomDialog.getByLabel('Kapasite')).toHaveValue('3');
  await expect(roomDialog.getByLabel('Kat / konum')).toHaveValue('2. kat');
  await expect(roomDialog.getByLabel('Yatak bilgisi')).toHaveValue('1 çift kişilik + 1 tek kişilik yatak');
  await expect(roomDialog.getByLabel('Gecelik fiyat')).toHaveValue('1750');
  await expect(roomDialog.getByLabel('Açıklama')).toHaveValue('Kaydedilmemiş oda taslağı korunmalı.');
  await roomDialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(roomDialog).toHaveCount(0);
  await expect(roomRows.first()).toContainText('Deniz Oda');
  await expect(roomRows.first()).toContainText('2 yatak');
  await expect(roomRows.first()).toContainText('1.750,00');
  await expect(roomRows.first()).toContainText('2. kat');

  const beforeLayoutSave = (await layoutCalls()).length;
  await page.getByRole('button', { name: 'Oda Ekle', exact: true }).click();
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  expect((await layoutCalls()).length).toBe(beforeLayoutSave);
  await expect(roomRows).toHaveCount(2);
  await roomRows.last().getByRole('button', { name: 'Detaylar', exact: true }).click();
  await expect(roomDialog).toBeVisible();
  await roomDialog.getByLabel('Oda adı').fill('Bahçe Oda');
  await roomDialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(roomDialog).toHaveCount(0);
  await save();
  await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'layout').length)).toBe(beforeLayoutSave + 1);
  const savedLayout = (await layoutCalls()).at(-1).input;
  expect(savedLayout.rooms).toHaveLength(2);
  expect(savedLayout.rooms[0]).toMatchObject({
    id: 'room-1',
    name: 'Deniz Oda',
    number: 'A1',
    capacity: 3,
    bedInfo: '1 çift kişilik + 1 tek kişilik yatak',
    floor: '2. kat',
    nightlyPriceMinor: 175000,
    outOfService: false
  });
  expect(savedLayout.rooms[1]).toMatchObject({ name: 'Bahçe Oda', nightlyPriceMinor: 0, outOfService: false });
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  // Out-of-service is a staged BusinessLayout field, not an instant mutation.
  const outOfServiceBox = page.getByLabel('Oda A1 hizmet dışı', { exact: true });
  await expect(outOfServiceBox).toBeVisible();
  await expect(outOfServiceBox).not.toBeChecked();
  const roomMediaPanel = page.getByLabel('Oda medyaları');
  await expect(roomMediaPanel.getByRole('combobox')).toHaveCount(0);
  await roomRows.first().click();
  await expect(roomMediaPanel.getByText('Oda A1 · Deniz Oda', { exact: true })).toBeVisible();
  await outOfServiceBox.check();
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  expect((await layoutCalls()).length).toBe(beforeLayoutSave + 1);
  await save();
  await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'layout').length)).toBe(beforeLayoutSave + 2);
  const outOfServiceSaved = (await layoutCalls()).at(-1).input;
  expect(outOfServiceSaved.rooms[0]).toMatchObject({ id: 'room-1', outOfService: true });
  expect(outOfServiceSaved.rooms[1]).toMatchObject({ outOfService: false });
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');
  await expect(page.getByLabel('Oda A1 hizmet dışı', { exact: true })).toBeChecked();

  // Uncheck stages a return to service; discard restores the saved out-of-service state.
  await page.getByLabel('Oda A1 hizmet dışı', { exact: true }).uncheck();
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  await discard();
  await expect(page.getByLabel('Oda A1 hizmet dışı', { exact: true })).toBeChecked();
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  // Return to service persists as outOfService=false through the same staged save.
  await page.getByLabel('Oda A1 hizmet dışı', { exact: true }).uncheck();
  await save();
  await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'layout').length)).toBe(beforeLayoutSave + 3);
  expect((await layoutCalls()).at(-1).input.rooms[0]).toMatchObject({ id: 'room-1', outOfService: false });
  await expect(page.getByLabel('Oda A1 hizmet dışı', { exact: true })).not.toBeChecked();

  // Room media is staged with the operations category: add dirties without a
  // layout write, save commits the staging, discard restores canonical media.
  const tableMediaPanel = page.getByLabel('Masa medyaları');
  const mediaCommitCalls = () => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'room-media-commit'));
  await roomMediaPanel.getByRole('button', { name: 'Fotoğraf / video ekle', exact: true }).click();
  await expect(roomMediaPanel.locator('.room-media-card')).toHaveCount(1);
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  expect((await layoutCalls()).length).toBe(beforeLayoutSave + 3);
  await save();
  expect((await mediaCommitCalls()).length).toBe(1);
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');
  await expect(roomMediaPanel.locator('.room-media-card')).toHaveCount(1);

  await roomMediaPanel.getByRole('button', { name: 'Fotoğraf / video ekle', exact: true }).click();
  await expect(roomMediaPanel.locator('.room-media-card')).toHaveCount(2);
  await select('İşletme');
  await expect(guard()).toBeVisible();
  await guard().getByRole('button', { name: 'Değişiklikleri geri al ve geç', exact: true }).click();
  await expect(tab('İşletme')).toHaveAttribute('aria-selected', 'true');
  await select('İşletme Düzeni');
  await expect(roomMediaPanel.locator('.room-media-card')).toHaveCount(1);
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  // Failed media discard must preserve unrelated layout edits as well as keep
  // the category dirty; a second successful discard clears both atomically
  // from the user's point of view.
  await roomMediaPanel.getByRole('button', { name: 'Fotoğraf / video ekle', exact: true }).click();
  await outOfServiceBox.check();
  await page.evaluate(() => {
    window.__settingsOriginalMediaDiscard = window.yardimciDesktop.discardRoomMediaDraft;
    window.yardimciDesktop.discardRoomMediaDraft = async () => ({
      ok: false,
      message: 'Medya geri alma testi başarısız.',
      dirty: true,
      changed: false
    });
  });
  await discard();
  await expect(page.locator('.global-message-bar')).toContainText('Medya geri alma testi başarısız.');
  await expect(outOfServiceBox).toBeChecked();
  await expect(roomMediaPanel.locator('.room-media-card')).toHaveCount(2);
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  await page.evaluate(() => {
    window.yardimciDesktop.discardRoomMediaDraft = window.__settingsOriginalMediaDiscard;
    delete window.__settingsOriginalMediaDiscard;
  });
  await discard();
  await expect(outOfServiceBox).not.toBeChecked();
  await expect(roomMediaPanel.locator('.room-media-card')).toHaveCount(1);
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  // Add -> remove is net-zero dirty; removing an existing room is staged and discard restores it.
  await page.getByRole('button', { name: 'Oda Ekle', exact: true }).click();
  await page.getByRole('button', { name: 'Yeni Oda satırını kaldır', exact: true }).click();
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  const firstRoomRemove = page.getByRole('button', { name: /Oda A1 satırını kaldır/ });
  await firstRoomRemove.click();
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  await discard();
  await expect(page.getByLabel('Oda özetleri').getByText('Deniz Oda', { exact: true })).toBeVisible();

  // Public table details are staged inside Business Layout and persist only
  // through the category footer, never directly from the editor dialog.
  const tableRows = page.locator('.table-public-resource-row');
  await expect(tableRows).toHaveCount(2);
  // Masa medya seçimi listeden yapılır: satıra tıklayınca panel seçili masayı gösterir.
  await tableRows.nth(1).locator('strong').click();
  await expect(tableMediaPanel.getByText('Salon 2 · Salon', { exact: true })).toBeVisible();
  await tableRows.nth(1).getByRole('button', { name: 'Detaylar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Masa bilgilerini düzenle' }).getByRole('button', { name: 'Vazgeç', exact: true }).click();

  const beforeTableProfileSave = (await layoutCalls()).length;
  await tableRows.first().locator('strong').click();
  await expect(tableMediaPanel.getByText('Salon 1 · Salon', { exact: true })).toBeVisible();
  await tableRows.first().getByRole('button', { name: 'Detaylar', exact: true }).click();
  const tableDialog = page.getByRole('dialog', { name: 'Masa bilgilerini düzenle' });
  await expect(tableDialog).toBeVisible();
  await tableDialog.getByLabel('Kapasite').fill('6');
  await tableDialog.getByLabel('Sigara kullanımı').selectOption('outdoor_only');
  await tableDialog.getByRole('checkbox', { name: 'Açık alan', exact: true }).check();
  await tableDialog.getByRole('checkbox', { name: 'Deniz manzarası', exact: true }).check();
  await tableDialog.getByLabel('Açıklama').fill('Deniz tarafında geniş aile masası.');
  await page.evaluate(() => window.refreshSettings({}));
  await expect(tableDialog.getByLabel('Kapasite')).toHaveValue('6');
  await expect(tableDialog.getByLabel('Açıklama')).toHaveValue('Deniz tarafında geniş aile masası.');
  await expect(tableDialog.getByRole('checkbox', { name: 'Açık alan', exact: true })).toBeChecked();
  await expect(tableDialog.getByRole('checkbox', { name: 'Deniz manzarası', exact: true })).toBeChecked();
  await tableDialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(tableDialog).toHaveCount(0);
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  expect((await layoutCalls()).length).toBe(beforeTableProfileSave);
  await save();
  expect((await layoutCalls()).length).toBe(beforeTableProfileSave + 1);
  expect((await layoutCalls()).at(-1).input.tables[0]).toMatchObject({
    id: 'table-1',
    capacity: 6,
    description: 'Deniz tarafında geniş aile masası.',
    features: ['outdoor', 'sea_view'],
    smokingPolicy: 'outdoor_only'
  });
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  // Table media uses the same staged category contract as room media.
  const tableMediaCommitCalls = () => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'table-media-commit'));
  await expect(tableMediaPanel.locator('.room-media-card')).toHaveCount(0);
  await tableMediaPanel.getByRole('button', { name: 'Fotoğraf / video ekle', exact: true }).click();
  await expect(tableMediaPanel.locator('.room-media-card')).toHaveCount(1);
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  expect((await tableMediaCommitCalls()).length).toBe(0);
  await save();
  expect((await tableMediaCommitCalls()).length).toBe(1);
  await expect(tableMediaPanel.locator('.room-media-card')).toHaveCount(1);
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  await tableMediaPanel.getByRole('button', { name: 'Fotoğraf / video ekle', exact: true }).click();
  await expect(tableMediaPanel.locator('.room-media-card')).toHaveCount(2);
  await discard();
  await expect(tableMediaPanel.locator('.room-media-card')).toHaveCount(1);
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  // Room/table web publication toggles are staged with Business Layout.
  const roomPublication = page.getByRole('checkbox', { name: 'Oda web yayını', exact: true });
  const tablePublication = page.getByRole('checkbox', { name: 'Masa web yayını', exact: true });
  await expect(roomPublication).toBeChecked();
  await expect(tablePublication).not.toBeChecked();
  const beforePublicationSave = (await layoutCalls()).length;
  await roomPublication.uncheck();
  await tablePublication.check();
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  expect((await layoutCalls()).length).toBe(beforePublicationSave);
  await save();
  expect((await layoutCalls()).length).toBe(beforePublicationSave + 1);
  expect((await layoutCalls()).at(-1).input.publication).toEqual({ rooms: false, tables: true });
  await expect(roomPublication).not.toBeChecked();
  await expect(tablePublication).toBeChecked();
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  await roomPublication.check();
  await tablePublication.uncheck();
  await discard();
  await expect(roomPublication).not.toBeChecked();
  await expect(tablePublication).toBeChecked();
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  // Invalid table collection is rejected locally and never reaches persistence.
  const beforeInvalidLayout = (await layoutCalls()).length;
  await page.getByLabel('Kategori adı').first().fill('');
  await save();
  await expect(page.getByRole('alert')).toContainText('Her masa kategorisinin bir adı olmalı.');
  expect((await layoutCalls()).length).toBe(beforeInvalidLayout);
  await discard();

  // Services validation also blocks guarded transition until corrected/discarded.
  await select('Servisler');
  await page.getByLabel('Web eşitleme adresi').fill('invalid-url');
  await select('İşletme');
  await guard().getByRole('button', { name: 'Kaydet ve geç', exact: true }).click();
  await expect(guard()).toBeVisible();
  await expect(page.getByText(/Web modül adresi/)).toBeVisible();
  await guard().getByRole('button', { name: 'Değişiklikleri geri al ve geç', exact: true }).click();
  await expect(tab('İşletme')).toHaveAttribute('aria-selected', 'true');

  // Leaving Settings through app navigation uses the same active-category guard.
  await select('Servisler');
  await page.getByLabel('Web eşitleme adresi').fill('https://leave-guard.example.test');
  expect(await page.evaluate(() => window.requestSettingsPageLeave())).toBe(false);
  await expect(guard()).toBeVisible();
  expect(await page.evaluate(() => window.settingsPageLeaveCompleted)).toBe(false);
  await guard().getByRole('button', { name: 'Burada kal', exact: true }).click();
  expect(await page.evaluate(() => window.settingsPageLeaveCompleted)).toBe(false);
  await expect(page.getByLabel('Web eşitleme adresi')).toHaveValue('https://leave-guard.example.test');

  expect(await page.evaluate(() => window.requestSettingsPageLeave())).toBe(false);
  await guard().getByRole('button', { name: 'Değişiklikleri geri al ve geç', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.settingsPageLeaveCompleted)).toBe(true);
  await expect(page.getByLabel('Web eşitleme adresi')).not.toHaveValue('https://leave-guard.example.test');

  // The fixture records page-leave completion without actually unmounting Settings,
  // so return to Business explicitly before continuing in-page scenarios.
  await select('İşletme');

  // Business public profile participates in the same category save and stops transition on failure.
  await page.getByLabel('İşletme açıklaması').fill('Profil Taslağı');
  await page.evaluate(() => { window.failProfile = true; });
  await select('İşletme Düzeni');
  await guard().getByRole('button', { name: 'Kaydet ve geç', exact: true }).click();
  await expect(guard()).toBeVisible();
  await expect(page.locator('.global-message-bar')).toContainText('Profil hatası');
  await page.evaluate(() => { window.failProfile = false; });
  await guard().getByRole('button', { name: 'Kaydet ve geç', exact: true }).click();
  await expect(tab('İşletme Düzeni')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'profile').at(-1).input.description)).toBe('Profil Taslağı');

  // Website map selection uses the existing Business staged save/discard lifecycle.
  await select('İşletme');
  await expect(page.getByLabel('Harita gösterimi', { exact: true })).toHaveValue('manual');
  await expect(page.getByLabel('Google Maps embed bağlantısı', { exact: true })).toHaveCount(0);
  await page.getByLabel('Harita gösterimi', { exact: true }).selectOption('google_maps_embed');
  await page.getByLabel('Google Maps embed bağlantısı', { exact: true }).fill('https://evil.test/maps/embed?pb=x');
  const profileCallCount = await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'profile').length);
  await save();
  await expect(page.locator('.global-message-bar')).toContainText('Google Maps embed bağlantısı geçerli');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'profile').length)).toBe(profileCallCount);
  await discard();
  await expect(page.getByLabel('Harita gösterimi', { exact: true })).toHaveValue('manual');
  await page.getByLabel('Harita gösterimi', { exact: true }).selectOption('google_maps_embed');
  const embedUrl = 'https://www.google.com/maps/embed?pb=!1m18!2m3';
  await page.getByLabel('Google Maps embed bağlantısı', { exact: true }).fill(embedUrl);
  await save();
  await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'profile').at(-1).input.mapDisplayMode)).toBe('google_maps_embed');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'profile').at(-1).input.googleMapsEmbedUrl)).toBe(embedUrl);
  await page.getByLabel('Harita gösterimi', { exact: true }).selectOption('manual');
  await save();
  await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'profile').at(-1).input.mapDisplayMode)).toBe('manual');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'profile').at(-1).input.googleMapsEmbedUrl)).toBe(embedUrl);

  // Google reviews stays inside Business settings, validates the live Google connection and saves with the category.
  await select('İşletme');
  await page.getByLabel('Google yorumlarını web sitesinde göster').check();
  await page.getByLabel('Google Place ID').fill('ChIJBlackSeaFixture');
  await page.getByLabel('Places API anahtarı').fill('smoke-google-key-not-secret');
  await page.getByRole('button', { name: 'Google Bağlantısını Dene', exact: true }).click();
  await expect(page.locator('#settings-google-reviews')).toContainText('BlackSea Pansiyon');
  await page.locator('.settings-category-actions').getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.locator('.global-message-bar')).toContainText('İşletme kaydedildi.');
  await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'google-reviews').length)).toBe(1);
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'google-reviews').at(-1).input.placeId)).toBe('ChIJBlackSeaFixture');

  // Action controls remain action-based and do not dirty Application.
  await select('Uygulama');
  await page.getByRole('button', { name: 'Güncellemeleri Kontrol Et', exact: true }).click();
  await page.getByLabel('Şifre belirleyin', { exact: true }).fill('abcdefg');
  await page.getByLabel('Yeni şifre tekrar').fill('abcdefg');
  await page.getByRole('button', { name: 'Şifreyi Kaydet', exact: true }).click();
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'password').length)).toBe(1);
  await expect(tab('Uygulama')).not.toContainText('Değişiklik var');

  await page.getByLabel('Mevcut şifre', { exact: true }).fill('abcdefg');
  await page.getByRole('button', { name: 'Şifreyi Kaldır', exact: true }).click();
  const passwordConfirm = page.getByRole('dialog', { name: 'Uygulama şifresini kaldır' });
  await expect(passwordConfirm.locator('.action-button-danger')).toHaveText('Şifreyi Kaldır');
  await passwordConfirm.getByRole('button', { name: 'Vazgeç' }).click();
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'password').length)).toBe(1);
  await page.getByRole('button', { name: 'Şifreyi Kaldır', exact: true }).click();
  await passwordConfirm.getByRole('button', { name: 'Şifreyi Kaldır' }).click();
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'password').at(-1).input)).toEqual({ currentPassword: 'abcdefg', newPassword: '' });
  await page.getByRole('button', { name: 'Tüm Verileri Sıfırla', exact: true }).click();
  const resetConfirm = page.getByRole('dialog', { name: 'Tüm Verileri Sıfırla' });
  await expect(resetConfirm.locator('.action-button-danger')).toHaveText('Tüm Verileri Sıfırla');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'reset').length)).toBe(0);
  await page.getByRole('button', { name: 'Tüm Verileri Sıfırla', exact: true }).click();
  await resetConfirm.getByRole('button', { name: 'Tüm Verileri Sıfırla' }).click();
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'reset').length)).toBe(1);

  await page.evaluate(() => window.refreshSettings({ aiApiKeyConfigured: true, aiEnabled: true }));
  await select('Servisler');
  await page.getByRole('button', { name: 'Kayıtlı Anahtarı Sil', exact: true }).click();
  const keyConfirm = page.getByRole('dialog', { name: 'Kayıtlı anahtarı sil' });
  await expect(keyConfirm.locator('.action-button-danger')).toHaveText('Anahtarı Sil');
  await page.keyboard.press('Escape');
  await expect(tab('Servisler')).not.toContainText('Değişiklik var');
  const callsBeforeKeyDelete = (await setupCalls()).length;
  await page.getByRole('button', { name: 'Kayıtlı Anahtarı Sil', exact: true }).click();
  await keyConfirm.getByRole('button', { name: 'Anahtarı Sil' }).click();
  // Silme staged: AI kapanır ve yalnız header görünür; gerçek silme kategori Kaydet ile olur.
  await expect(page.locator('.setup-ai-section')).toContainText('Kapalı');
  await expect(page.getByRole('button', { name: 'Anahtar silinecek' })).toHaveCount(0);
  await expect(tab('Servisler')).toContainText('Değişiklik var');
  expect((await setupCalls()).length).toBe(callsBeforeKeyDelete);
  await save();
  expect((await setupCalls()).at(-1).input.clearAiApiKey).toBe(true);

  // Staff permission checkboxes are staged and committed as one batch write.
  await page.evaluate(() => window.refreshSettings({ servicePreferences: { whatsapp: false, android: true } }));
  await select('Servisler');
  const permissionGroups = page.getByRole('group', { name: 'Görev alanları' });
  const firstPermissionBox = permissionGroups.getByRole('checkbox').first();
  await expect(firstPermissionBox).toBeVisible();
  const androidBatchCalls = () => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'android-permissions'));
  const batchBefore = (await androidBatchCalls()).length;
  const initiallyChecked = await firstPermissionBox.isChecked();
  await firstPermissionBox.click();
  await expect(tab('Servisler')).toContainText('Değişiklik var');
  expect((await androidBatchCalls()).length).toBe(batchBefore);
  await save();
  expect((await androidBatchCalls()).length).toBe(batchBefore + 1);
  expect((await androidBatchCalls()).at(-1).input[0].deviceId).toBe('android-smoke-staff-01');
  await expect(tab('Servisler')).not.toContainText('Değişiklik var');

  await firstPermissionBox.click();
  await expect(tab('Servisler')).toContainText('Değişiklik var');
  await discard();
  await expect(firstPermissionBox).toBeChecked({ checked: !initiallyChecked });
  await expect(tab('Servisler')).not.toContainText('Değişiklik var');
  await page.evaluate(() => window.refreshSettings({ servicePreferences: { whatsapp: false, android: false } }));

  // Responsive body remains bounded after the new footer/dialog architecture.
  for (const width of [1440, 1024, 900, 760, 600]) {
    await page.setViewportSize({ width, height: 900 });
    for (const category of ['İşletme', 'İşletme Düzeni', 'Servisler', 'Uygulama']) {
      await select(category);
      await expect(page.getByRole('tabpanel')).toHaveCount(1);
      const geometry = await page.evaluate(() => {
        const body = document.querySelector('.settings-category-body');
        const nav = document.querySelector('[role="tablist"]');
        const top = nav.getBoundingClientRect().top;
        body.scrollTop = body.scrollHeight;
        return {
          documentX: document.documentElement.scrollWidth <= innerWidth + 1,
          documentY: document.documentElement.scrollHeight <= innerHeight + 1,
          bodyX: body.scrollWidth <= body.clientWidth + 1,
          scroll: getComputedStyle(body).overflowY,
          navStable: nav.getBoundingClientRect().top === top
        };
      });
      expect(geometry, `${width}/${category}`).toEqual({
        documentX: true,
        documentY: true,
        bodyX: true,
        scroll: 'auto',
        navStable: true
      });
      await expect(page.getByRole('tablist')).toBeInViewport();
      await expect(guard()).toHaveCount(0);
    }
  }

  expect(errors).toEqual([]);
  console.log('settings-platform-smoke-ok: single dirty category guard, business layout collection, category save surfaces and responsive geometry');
} finally {
  await browser?.close();
  await server.close();
}
