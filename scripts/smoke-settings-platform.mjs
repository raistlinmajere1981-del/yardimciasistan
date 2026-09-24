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

  await page.route('**/settings-platform-test', async route => {
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

  // Dirty category: stay, discard-and-go and save-and-go all share one guard.
  await select('İşletme');
  await page.getByLabel('Firma adı', { exact: true }).fill('Bekleyen Firma');
  await expect(tab('İşletme')).toContainText('Değişiklik var');

  await select('Servisler');
  await expect(guard()).toBeVisible();
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
  await page.evaluate(() => { window.failSetup = true; });
  await select('Servisler');
  await guard().getByRole('button', { name: 'Kaydet ve geç', exact: true }).click();
  await expect(guard()).toBeVisible();
  await expect(tab('İşletme')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Test kayıt hatası', { exact: true })).toBeVisible();
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

  // Appearance is immediate and does not dirty Application.
  await page.getByRole('radio', { name: 'Koyu', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  await expect(tab('Uygulama')).not.toContainText('Değişiklik var');

  // Update preferences now use the category footer and baseline comparison.
  const updateInput = page.getByLabel('Güncelleme sunucusu');
  await updateInput.fill('https://new-update.example.test');
  await expect(tab('Uygulama')).toContainText('Değişiklik var');
  await updateInput.fill('https://example.test/updates');
  await expect(tab('Uygulama')).not.toContainText('Değişiklik var');

  await updateInput.fill('https://new-update.example.test');
  await page.evaluate(() => { window.failUpdate = true; });
  await save();
  await expect(page.getByText('Güncelleme tercih hatası', { exact: true })).toBeVisible();
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

  // Operations is one collection draft: room + room details + table categories, one footer save.
  await select('İşletme Düzeni');
  await expect(page.getByLabel('Oda 101 adı', { exact: true })).toHaveValue('Oda 101');
  await page.getByLabel('Oda 101 adı', { exact: true }).fill('Deniz Oda');
  await page.getByLabel('Oda 101 gecelik fiyatı').fill('1750');
  await page.getByRole('button', { name: 'Detaylar', exact: true }).click();
  const roomDialog = page.getByRole('dialog', { name: 'Oda bilgilerini düzenle' });
  await expect(roomDialog).toBeVisible();
  await roomDialog.getByLabel('Oda numarası').fill('A1');
  await roomDialog.getByLabel('Kapasite').fill('3');
  await roomDialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(roomDialog).toHaveCount(0);

  const beforeLayoutSave = (await layoutCalls()).length;
  await page.getByRole('button', { name: 'Oda Ekle', exact: true }).click();
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  expect((await layoutCalls()).length).toBe(beforeLayoutSave);

  const newRoom = page.getByLabel('Yeni Oda adı', { exact: true });
  await expect(newRoom).toBeVisible();
  await newRoom.fill('Bahçe Oda');
  await save();
  await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'layout').length)).toBe(beforeLayoutSave + 1);
  const savedLayout = (await layoutCalls()).at(-1).input;
  expect(savedLayout.rooms).toHaveLength(2);
  expect(savedLayout.rooms[0]).toMatchObject({ id: 'room-1', name: 'Deniz Oda', number: 'A1', capacity: 3, nightlyPriceMinor: 175000 });
  expect(savedLayout.rooms[1]).toMatchObject({ name: 'Bahçe Oda', nightlyPriceMinor: 0 });
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  // Add -> remove is net-zero dirty; removing an existing room is staged and discard restores it.
  await page.getByRole('button', { name: 'Oda Ekle', exact: true }).click();
  await page.getByRole('button', { name: 'Yeni Oda satırını kaldır', exact: true }).click();
  await expect(tab('İşletme Düzeni')).not.toContainText('Değişiklik var');

  const firstRoomRemove = page.getByRole('button', { name: /Oda A1 satırını kaldır/ });
  await firstRoomRemove.click();
  await expect(tab('İşletme Düzeni')).toContainText('Değişiklik var');
  await discard();
  await expect(page.getByLabel('Oda A1 adı', { exact: true })).toHaveValue('Deniz Oda');

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
  await expect(page.locator('#settings-public-profile').getByRole('alert')).toHaveText('Profil hatası');
  await page.evaluate(() => { window.failProfile = false; });
  await guard().getByRole('button', { name: 'Kaydet ve geç', exact: true }).click();
  await expect(tab('İşletme Düzeni')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'profile').at(-1).input.description)).toBe('Profil Taslağı');

  // Action controls remain action-based and do not dirty Application.
  await select('Uygulama');
  await page.getByRole('button', { name: 'Güncellemeleri Kontrol Et', exact: true }).click();
  await page.getByLabel('Şifre belirleyin', { exact: true }).fill('abcdefg');
  await page.getByLabel('Yeni şifre tekrar').fill('abcdefg');
  await page.getByRole('button', { name: 'Şifreyi Kaydet', exact: true }).click();
  expect(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'password').length)).toBe(1);
  await expect(tab('Uygulama')).not.toContainText('Değişiklik var');

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
