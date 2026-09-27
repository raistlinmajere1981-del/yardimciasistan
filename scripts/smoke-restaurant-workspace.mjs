import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { installRestaurantWorkspaceFixture } from './test-helpers/restaurant-workspace-fixture.mjs';
import { captureOperationWorkspace } from './test-helpers/operation-workspace-screenshots.mjs';
import { chooseSearchSelect } from './test-helpers/search-select.mjs';
import { createCompactUiFixture } from './lib/desktop-renderer-fixtures.mjs';

const server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), server: { port: 0 } });
await server.listen();
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const errors = [];
  async function open(variant = 'all') {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/restaurant-test', async route => {
      const html = await server.transformIndexHtml('/restaurant-test', `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/restaurant-workspace.tsx')}"></script></body></html>`);
      await route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.addInitScript(installRestaurantWorkspaceFixture, { dashboard: createCompactUiFixture(), variant });
    await page.goto(`${server.resolvedUrls.local[0]}restaurant-test`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Bahçe 1 masasını aç' })).toBeVisible();
    return page;
  }
  const page = await open(), dialog = page.getByRole('dialog');
  const button = name => page.getByRole('button', { name, exact: true });
  const state = () => page.evaluate(() => window.fixtureState());
  const board = page.getByRole('region', { name: 'Restoran operasyonları', exact: true });
  await expect(board.locator('.operations-board__pane')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Restoran rezervasyonları', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Masalar paneli', exact: true })).toBeVisible();
  expect(await page.locator('.operations-board__pane--center .operations-board__pane-body').evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.getByLabel('Masa grubu').selectOption('Bahçe');
  await button('Bahçe 1 masasını aç').focus(); await page.keyboard.press('Enter');
  await expect(dialog).toHaveClass(/workspace-frame--centered/);
  await expect(dialog.getByRole('heading', { level: 2 })).toBeFocused();
  await expect(dialog.locator('.workspace-tabs')).toHaveCount(0);
  await expect(dialog.getByRole('region', { name: 'Menü', exact: true })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Masa, Müşteri ve Hesap', exact: true })).toBeVisible();
  await expect(button('Sipariş Aç')).toBeEnabled();
  expect((await state()).orders).toHaveLength(0);
  expect(await page.evaluate(() => window.fixtureCalls.some(call => call.kind === 'start'))).toBe(false);
  const customerPanel = dialog.getByRole('region', { name: 'Masa müşterisi', exact: true });
  const customerSelect = customerPanel.getByLabel('Müşteri seç', { exact: true });
  const customerCalls = () => page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'customer'));
  expect(await customerCalls()).toEqual([]);
  await expect(customerSelect).toBeVisible();
  await chooseSearchSelect(customerPanel, 'Müşteri seç', /Pilot Misafir/);
  expect(await customerCalls()).toEqual([]);
  await page.evaluate(() => { window.fixtureDelayCustomer = true; });
  await button('Müşteriyi Bağla').evaluate(element => { element.click(); element.click(); });
  await expect.poll(async () => (await customerCalls()).length).toBe(1);
  expect(await customerCalls()).toEqual([{ kind: 'customer', tableId: 'table-a', customerId: 'customer-a' }]);
  await expect(button('Müşteriyi Bağla')).toBeDisabled();
  await page.evaluate(() => { window.fixtureDelayCustomer = false; window.fixtureResolveCustomer(); });
  await expect(customerPanel.locator('p')).toHaveText('Pilot Misafir');
  expect((await state()).orders).toEqual([]);
  await chooseSearchSelect(customerPanel, 'Müşteri seç', /İkinci Misafir/);
  await button('Müşteriyi Değiştir').click();
  await expect(customerPanel.locator('p')).toHaveText('İkinci Misafir');
  await button('Bağı Kaldır').click();
  await expect(customerPanel.locator('p')).toHaveText('Masaya bağlı müşteri yok.');
  expect((await state()).dashboard.tables[0].currentCustomerId).toBe('');
  await expect(customerSelect).toContainText('Müşteri seçin');
  await captureOperationWorkspace(page, 'table-empty');
  await button('Sipariş Aç').click();
  await button('Çay ürününü siparişe ekle').click();
  await expect(button('Tükenen ürününü siparişe ekle')).toBeDisabled();
  await button('Çay adetini artır').click(); expect((await state()).orders[0].total).toBe(50);
  await button('Çay adetini azalt').click();
  const note = dialog.getByLabel('Çay notu');
  await page.evaluate(() => { window.fixtureDelayNote = true; });
  await note.fill('İlk'); await note.press('Tab');
  await expect.poll(() => page.evaluate(() => typeof window.fixtureResolveNote)).toBe('function');
  await note.fill('Son not');
  await page.evaluate(() => { window.fixtureDelayNote = false; window.fixtureResolveNote(); });
  await expect.poll(async () => (await state()).orders[0].items[0].note).toBe('Son not');
  await button('Geçmiş').click(); await button('← Masaya dön').click(); await expect(note).toHaveValue('Son not');
  const unchangedOrder = structuredClone((await state()).orders[0]);
  await chooseSearchSelect(customerPanel, 'Müşteri seç', /Pilot Misafir/);
  await button('Müşteriyi Bağla').click();
  await expect(customerPanel.locator('p')).toHaveText('Pilot Misafir');
  expect((await state()).orders[0]).toEqual(unchangedOrder);
  await button('Bağı Kaldır').click();
  await captureOperationWorkspace(page, 'table-active');
  await note.fill('Escape ile kaydet'); await note.press('Escape');
  await expect(dialog).toHaveCount(0); expect((await state()).orders[0].items[0].note).toBe('Escape ile kaydet');
  await expect(button('Bahçe 1 masasını aç')).toBeFocused();
  await expect(page.getByLabel('Masa grubu')).toHaveValue('Bahçe');
  await button('Bahçe 1 masasını aç').click();
  await expect(note).toHaveValue('Escape ile kaydet');
  await page.evaluate(() => { window.fixtureFailNote = true; });
  await note.fill('Kaybolmamalı'); await note.press('Escape');
  await expect(dialog.getByRole('alert')).toHaveText('Not reddedildi.');
  expect(await page.evaluate(() => window.fixtureOpen('table-b'))).toBe(false);
  await button('Ödendi / Kapat').click();
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'close').length)).toBe(0);
  await page.evaluate(() => { window.fixtureFailNote = false; window.fixtureFailClose = true; });
  await button('Ödendi / Kapat').click(); await expect(dialog.getByRole('alert')).toHaveText('Kapatma reddedildi.');
  expect((await state()).finance).toBe(0);
  await page.evaluate(() => { window.fixtureFailClose = false; window.fixtureDelayClose = true; });
  await button('Ödendi / Kapat').click(); await expect(button("Floor'a dön")).toBeDisabled();
  expect(await page.evaluate(() => window.fixtureOpen('table-b'))).toBe(false);
  expect((await state()).finance).toBe(0);
  await page.evaluate(() => { window.fixtureDelayClose = false; window.fixtureResolveClose(); });
  await expect(dialog).toHaveCount(0); expect((await state()).finance).toBe(1);
  await button('Bahçe 1 masasını aç').click(); await button('Geçmiş').click();
  await expect(dialog.getByRole('region', { name: 'Masa geçmişi' })).toContainText('Ödendi');
  await button("Floor'a dön").click();

  await button('Yeni Rezervasyon').click();
  await expect(dialog).toHaveClass(/form-dialog/); await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
  await chooseSearchSelect(dialog, 'Masa', /Bahçe 1/);
  await dialog.getByLabel('Not', { exact: true }).fill('Korunan rezervasyon notu');
  await button('Yeni Müşteri Ekle').click();
  await dialog.getByLabel('Ad soyad', { exact: true }).fill('Yeni Pilot Misafir');
  await dialog.getByLabel('Telefon', { exact: true }).fill('05551112233');
  await button('Kaydet ve Seç').click();
  await expect(dialog.getByLabel('Masa', { exact: true })).toContainText('Bahçe 1');
  await expect(dialog.getByLabel('Müşteri', { exact: true })).toContainText('Yeni Pilot Misafir');
  await expect(dialog.getByLabel('Not', { exact: true })).toHaveValue('Korunan rezervasyon notu');
  await button('Rezervasyonu Kaydet').click(); await expect(dialog).toHaveCount(0);
  expect((await state()).dashboard.reservations[0].tableIds).toEqual(['table-a']);
  expect((await state()).orders).toHaveLength(1);
  await page.evaluate(() => {
    const tables = structuredClone(window.fixtureState().dashboard.tables);
    tables[0].currentReservationId = 'reservation-a'; window.fixturePatch({ tables });
  });
  const reservationsBeforeCustomer = structuredClone((await state()).dashboard.reservations);
  const callsBeforeReservationOpen = (await customerCalls()).length;
  await button('Bahçe 1 masasını aç').click();
  await expect(customerSelect).toContainText('Yeni Pilot Misafir');
  await expect(button('Müşteriyi Bağla')).toBeEnabled();
  expect((await customerCalls()).length).toBe(callsBeforeReservationOpen);
  await button('Müşteriyi Bağla').click();
  await expect(customerPanel.locator('p')).toHaveText('Yeni Pilot Misafir');
  await chooseSearchSelect(customerPanel, 'Müşteri seç', /İkinci Misafir/); await button('Müşteriyi Değiştir').click();
  await button('Bağı Kaldır').click();
  expect((await state()).dashboard.reservations).toEqual(reservationsBeforeCustomer);
  expect((await state()).dashboard.tables[0].currentReservationId).toBe('reservation-a');
  await expect(dialog.getByRole('region', { name: 'Masa, Müşteri ve Hesap', exact: true })).toContainText('Rezervasyon ·');
  await button('Sipariş Aç').click(); await button('Çay ürününü siparişe ekle').click();
  await button('Çay satırını sil').click(); expect((await state()).orders[0].items).toHaveLength(0);
  await button('Çay ürününü siparişe ekle').click(); await note.fill('Odaya aktarım notu');
  await dialog.getByRole('group', { name: 'Sipariş durumu', exact: true }).getByRole('button', { name: 'Hesap bekliyor', exact: true }).click();
  await expect(dialog.getByLabel('Oda hesabı', { exact: true })).toBeVisible();
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
  await dialog.getByLabel('Oda hesabı', { exact: true }).click();
  await dialog.getByRole('dialog', { name: 'Oda hesabı seçici', exact: true }).getByRole('option').first().click();
  await page.evaluate(() => { window.fixtureFailTransfer = true; });
  await button('Odaya Yaz').click(); await expect(dialog.getByRole('alert')).toHaveText('Aktarım reddedildi.');
  const stock = (await state()).dashboard.menu.items[0].stock_quantity;
  await page.evaluate(() => { window.fixtureFailTransfer = false; window.fixtureDelayTransfer = true; });
  await button('Odaya Yaz').click(); await expect(button("Floor'a dön")).toBeDisabled();
  await page.evaluate(() => { window.fixtureDelayTransfer = false; window.fixtureResolveTransfer(); });
  await expect(dialog).toHaveCount(0);
  const transferred = await state(); expect(transferred.transfers).toBe(1); expect(transferred.finance).toBe(1);
  expect(transferred.orders[0].items[0].note).toBe('Odaya aktarım notu'); expect(transferred.dashboard.menu.items[0].stock_quantity).toBe(stock);

  // A delayed customer reply (and repeated dashboard delivery) cannot roll back a newer projection.
  await button('Bahçe 1 masasını aç').click();
  await chooseSearchSelect(customerPanel, 'Müşteri seç', /Pilot Misafir/);
  await page.evaluate(() => { window.fixtureDelayCustomer = true; });
  await button('Müşteriyi Bağla').click();
  await expect.poll(() => page.evaluate(() => typeof window.fixtureResolveCustomer)).toBe('function');
  await page.evaluate(() => {
    const tables = structuredClone(window.fixtureState().dashboard.tables);
    tables[0].currentCustomerId = 'customer-b'; window.fixturePatch({ tables });
  });
  await expect(customerPanel.locator('p')).toHaveText('İkinci Misafir');
  await page.evaluate(() => { window.fixtureDelayCustomer = false; window.fixtureResolveCustomer(); });
  await expect(button('Bağı Kaldır')).toBeEnabled();
  await page.evaluate(() => window.fixturePublishDashboard(window.fixtureCustomerResponse));
  await expect(customerPanel.locator('p')).toHaveText('İkinci Misafir');
  await button('Bağı Kaldır').click();
  await button("Floor'a dön").click();

  // Read completion from an earlier entity cannot overwrite the new workspace.
  await page.evaluate(() => { window.fixtureDelayRead = true; });
  await button('Bahçe 1 masasını aç').click();
  await expect.poll(() => page.evaluate(() => typeof window.fixtureResolveRead)).toBe('function');
  await page.evaluate(() => { window.fixtureDelayRead = false; window.fixtureOpen('table-b'); });
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Salon 1');
  await page.evaluate(() => window.fixtureResolveRead());
  await expect(button('Sipariş Aç')).toBeEnabled(); await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Salon 1');
  await button("Floor'a dön").click();
  for (const variant of ['tables-only', 'no-menu', 'no-customers', 'no-reservations', 'no-transfer', 'no-catalog']) {
    const variantPage = await open(variant), surface = variantPage.getByRole('dialog');
    if (variant === 'no-reservations') await expect(variantPage.getByRole('region', { name: 'Restoran rezervasyonları', exact: true })).toHaveCount(0);
    await variantPage.getByRole('button', { name: 'Bahçe 1 masasını aç' }).click();
    if (variant === 'no-customers') {
      await expect(surface.getByRole('region', { name: 'Masa müşterisi' })).toHaveCount(0);
      await expect(surface.getByLabel('Müşteri seç', { exact: true })).toHaveCount(0);
      expect(await variantPage.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'customer'))).toEqual([]);
    }
    if (variant === 'tables-only') {
      await expect(surface.locator('.workspace-tabs')).toHaveCount(0);
      expect(await variantPage.evaluate(() => window.fixtureCalls)).toEqual([]);
      await chooseSearchSelect(surface, 'Müşteri seç', /Pilot Misafir/);
      await surface.getByRole('button', { name: 'Müşteriyi Bağla', exact: true }).click();
      await expect(surface.getByRole('region', { name: 'Masa müşterisi' }).locator('p')).toHaveText('Pilot Misafir');
      expect(await variantPage.evaluate(() => window.fixtureState().orders)).toEqual([]);
      expect(await variantPage.evaluate(() => window.fixtureCalls)).toEqual([{ kind: 'customer', tableId: 'table-a', customerId: 'customer-a' }]);
    } else {
      await surface.getByRole('button', { name: 'Sipariş Aç' }).click();
      if (variant === 'no-menu') await expect(surface.getByLabel('Sipariş için ürün ara')).toHaveCount(0);
      if (variant === 'no-transfer') await expect(surface.getByRole('button', { name: 'Odaya Yaz' })).toHaveCount(0);
    }
    await variantPage.close();
  }
  await page.getByLabel('Masa grubu').selectOption('all'); await button('Salon 1 masasını aç').click();
  await button('Sipariş Aç').click(); await button('Çay ürününü siparişe ekle').click();

  for (const [width, height, scheme, density, scale] of [[1366, 768, 'light', 'compact', 1], [1024, 768, 'dark', 'comfortable', 1.1], [600, 800, 'light', 'comfortable', 1]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(({ scheme, density, scale }) => { document.documentElement.dataset.colorScheme = scheme; document.documentElement.dataset.density = density; document.documentElement.style.setProperty('--ui-scale', String(scale)); document.documentElement.style.zoom = String(scale); }, { scheme, density, scale });
    const bounds = await dialog.boundingBox(); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 2); expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 2);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

  }
  // Security lock destroys the workspace: pending mutation results cannot update a new entity.
  await page.evaluate(() => { window.fixtureDelayNote = true; });
  await note.fill('Kilit öncesi'); await note.press('Tab');
  await expect.poll(() => page.evaluate(() => typeof window.fixtureResolveNote)).toBe('function');
  await page.evaluate(() => window.fixtureLock(true));
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => { window.fixtureDelayNote = false; window.fixtureResolveNote(); window.fixtureLock(false); });
  await expect(button('Bahçe 1 masasını aç')).toBeVisible();
  await page.evaluate(() => { window.fixtureDelayRead = true; });
  await button('Bahçe 1 masasını aç').click();
  await page.evaluate(() => { window.oldRead = window.fixtureResolveRead; window.fixtureDelayRead = false; window.fixtureOpen('table-b'); });
  await expect(button('Ödendi / Kapat')).toBeEnabled();
  await page.evaluate(() => { window.fixtureRejectRead = true; window.oldRead(); });
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Salon 1');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await button("Floor'a dön").click();
  // Single canonical UI close caller; duplicate surfaces are absent.
  await expect(page.locator('.restaurant-order-drawer, .restaurant-room-transfer__dialog')).toHaveCount(0);
  const controller = readFileSync('apps/desktop-app/src/components/restaurant/use-table-order-controller.ts', 'utf8');
  expect(controller.match(/bridge\(\)\.closeTableOrder\(/g)).toHaveLength(1);
  expect(errors).toEqual([]);
  console.log('restaurant-workspace-ok: inspection/start, items, notes/flush/races, close, customer context, reservation, transfer, floor/focus, capabilities, appearance');
} finally { await browser?.close(); await server.close(); }
