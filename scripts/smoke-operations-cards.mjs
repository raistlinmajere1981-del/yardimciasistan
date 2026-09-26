import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { installPensionWorkspaceFixture } from './test-helpers/pension-workspace-fixture.mjs';
import { installRestaurantWorkspaceFixture } from './test-helpers/restaurant-workspace-fixture.mjs';
import { seedOperationsCardScene } from './test-helpers/operations-card-scenes.mjs';
import { createCompactUiFixture } from './lib/desktop-renderer-fixtures.mjs';
const screenshots = resolve('artifacts/screenshots/operations-ui-v3');
mkdirSync(screenshots, { recursive: true });
const server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), server: { port: 0 } });
await server.listen();
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const errors = [];
  async function open(kind, variant = 'all') {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/cards-test', async route => {
      const html = await server.transformIndexHtml('/cards-test', `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve(`scripts/fixtures/${kind}-workspace.tsx`)}"></script></body></html>`);
      await route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.addInitScript(kind === 'pension' ? installPensionWorkspaceFixture : installRestaurantWorkspaceFixture, { dashboard: createCompactUiFixture(), variant });
    await page.goto(`${server.resolvedUrls.local[0]}cards-test`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(page.locator('.resource-card').first()).toBeVisible();
    await page.evaluate(seedOperationsCardScene, { kind });
    return page;
  }
  const page = await open('pension');
  const card = number => page.getByRole('article', { name: `Oda ${number}`, exact: true });
  const dialog = page.getByRole('dialog');
  const close = () => dialog.getByRole('button', { name: 'Çalışma alanını kapat', exact: true }).click();
  const orderBefore = await page.locator('.resource-card h3').allTextContents();
  await expect(card(103)).toContainText('Mevcut misafir');
  await expect(card(103)).toContainText('Ece Yılmaz');
  await expect(card(103)).toContainText('Önceki misafir · Selin Aras');
  await card(103).getByRole('button', { name: 'Oda 103 odasını aç' }).tap();
  await expect(dialog).toHaveCount(1);
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind !== 'read'))).toEqual([]);
  await close();
  await expect(card(103).getByRole('button', { name: 'Oda 103 odasını aç' })).toBeFocused();
  await card(103).getByRole('button', { name: 'Hesap', exact: true }).click();
  await expect(dialog.getByRole('tabpanel', { name: 'Hesap' })).toContainText('Ece Yılmaz');
  await expect(dialog.getByRole('tabpanel', { name: 'Hesap' })).toContainText('3.600');
  await close();
  await card(104).getByRole('button', { name: 'Önceki hesabı tahsil et' }).click();
  await expect(dialog.getByRole('heading', { name: 'Ödeme Al', exact: true })).toBeVisible();
  await dialog.getByLabel('Ödeme tutarı', { exact: true }).fill('50');
  await page.evaluate(() => { window.fixtureDelayReads = true; });
  await dialog.getByRole('button', { name: 'Ödemeyi Kaydet', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.fixtureReads.length)).toBe(1);
  await page.evaluate(() => {
    const folios = window.fixtureState().folios;
    const folio = folios.find(item => item.id === 'folio-stay-3');
    folio.remainingMinor = 75000; folio.paidTotalMinor = 10000;
    window.fixtureSetFolios(folios);
  });
  await expect(card(104)).toContainText('750');
  await page.evaluate(() => window.fixtureReads[0].resolve());
  await expect.poll(() => page.evaluate(() => window.fixtureReads.length)).toBe(2);
  await page.evaluate(() => { window.fixtureDelayReads = false; window.fixtureReads[1].resolve(); });
  await expect(dialog.getByRole('tabpanel', { name: 'Hesap' })).toContainText('750');
  expect(await page.evaluate(() => window.fixtureCalls.find(call => call.kind === 'payment').input.folioId)).toBe('folio-stay-3');
  await close();
  await expect(card(104)).toContainText('750');
  await card(102).getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Girişi Tamamla', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'check-in').length)).toBe(0);
  await dialog.getByRole('button', { name: 'Girişi Tamamla' }).click();
  expect(await page.evaluate(() => window.fixtureCalls.find(call => call.kind === 'check-in').input)).toBe('stay-1');
  await close();
  await expect(card(102)).toContainText('Misafir içeride');
  await page.evaluate(() => { window.fixtureDelayRoom = true; window.fixtureFailRoom = true; });
  await card(101).getByRole('button', { name: 'Temizliği tamamla' }).evaluate(el => { el.click(); el.click(); });
  await expect(card(101)).toContainText('İşlem sürüyor');
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'room-status').length)).toBe(1);
  await page.evaluate(() => window.fixtureReleaseRoom());
  await expect(card(101).getByRole('alert')).toContainText('Oda durumu kaydedilemedi');
  await page.evaluate(() => { window.fixtureDelayRoom = false; window.fixtureFailRoom = false; });
  await card(101).getByRole('button', { name: 'Temizliği tamamla' }).click();
  await expect(card(101)).toContainText('Hazır');
  expect(await page.locator('.resource-card h3').allTextContents()).toEqual(orderBefore);
  // Simulate the dashboard event channel, followed by an older in-flight request.
  await page.evaluate(() => {
    const old = structuredClone(window.fixtureDashboard);
    const next = structuredClone(old); next.revision += 10;
    next.roomOperations.find(item => item.roomId === 'room-103').accounts.find(item => item.stayId === 'stay-2').remainingMinor = 123400;
    window.fixturePublishDashboard(next); window.fixturePublishDashboard(old);
  });
  await expect(card(103)).toContainText('1.234');
  await page.evaluate(() => window.fixturePublishDashboard({ ...window.fixtureDashboard, revision: 1000, roomOperations: null }));
  await expect(card(103)).toContainText('Güncel özet alınamadı');
  await expect(card(103).getByRole('button', { name: 'Hesap', exact: true })).toHaveCount(0);
  await page.close();

  const restaurant = await open('restaurant');
  const table = number => restaurant.getByRole('article', { name: `Masa ${number}`, exact: true });
  const rd = restaurant.getByRole('dialog');
  const floor = () => rd.getByRole('button', { name: "Floor'a dön", exact: true }).click();
  expect(await restaurant.evaluate(() => window.fixtureCalls)).toEqual([]); // No per-card reads, history cache, or implicit writes.
  await table(1).getByRole('button', { name: 'Masa 1 masasını aç' }).tap();
  await expect(rd.getByRole('button', { name: 'Sipariş Başlat', exact: true })).toBeEnabled();
  expect(await restaurant.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'start'))).toEqual([]);
  await floor();
  await expect(table(1).getByRole('button', { name: 'Masa 1 masasını aç' })).toBeFocused();
  await restaurant.evaluate(() => { window.fixtureDelayStart = true; });
  await table(1).getByRole('button', { name: 'Sipariş başlat', exact: true }).evaluate(el => { el.click(); el.click(); });
  expect(await restaurant.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'start').length)).toBe(1);
  await restaurant.evaluate(() => window.fixtureResolveStart());
  await expect(rd).toHaveCount(1);
  await expect(rd.getByLabel('Sipariş için ürün ara')).toBeFocused();
  await floor();
  await expect(table(1)).toContainText('Sipariş alınıyor');
  await table(2).getByRole('button', { name: 'Servis edildi', exact: true }).click();
  await expect(table(2).getByRole('button', { name: 'Hesabı aç', exact: true })).toBeVisible();
  await table(2).getByRole('button', { name: 'Hesabı aç', exact: true }).click();
  await expect(table(2).getByRole('button', { name: 'Tahsilat', exact: true })).toBeVisible();
  expect(await restaurant.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'status').map(call => [call.id, call.status]))).toEqual([['order-1', 'served'], ['order-1', 'payment']]);
  await table(3).getByRole('button', { name: 'Tahsilat', exact: true }).click();
  await expect(rd.getByRole('tab', { name: 'Hesap', exact: true })).toHaveAttribute('aria-selected', 'true');
  await rd.getByRole('button', { name: 'Ödendi / Kapat', exact: true }).click();
  await expect(rd).toHaveCount(0);
  expect(await restaurant.evaluate(() => window.fixtureCalls.find(call => call.kind === 'close').id)).toBe('order-2');
  await expect(table(3)).toContainText('Servise hazır');
  await restaurant.close();

  for (const [kind, variant] of [['pension', 'rooms-only'], ['restaurant', 'tables-only']]) {
    const disabled = await open(kind, variant);
    await expect(disabled.getByRole('button', { name: /Giriş yap|Sipariş başlat|Tahsilat|Hesap$/ })).toHaveCount(0);
    expect(await disabled.evaluate(() => window.fixtureCalls)).toEqual([]);
    await disabled.close();
  }
  for (const kind of ['pension', 'restaurant']) {
    const visual = await open(kind);
    for (const [width, height] of [[1366, 768], [1920, 1080]]) for (const scheme of ['light', 'dark']) for (const density of ['comfortable', 'compact']) {
      const dense = density === 'compact';
      await visual.evaluate(seedOperationsCardScene, { kind, dense });
      await visual.setViewportSize({ width, height });
      await visual.evaluate(({ scheme, density }) => { document.documentElement.dataset.colorScheme = scheme; document.documentElement.dataset.density = density; document.documentElement.dataset.motion = "system"; document.documentElement.dataset.font = "plex"; }, { scheme, density });
      await expect(visual.locator('.operations-board__pane')).toHaveCount(3);
      expect(await visual.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await visual.locator('.resource-card button').evaluateAll(items => items.every(el => el.getBoundingClientRect().height >= 44))).toBe(true);
      expect(await visual.locator('button button').count()).toBe(0);
      await visual.screenshot({ animations: "disabled", path: `${screenshots}/${kind}-${width}-${scheme}-${density}-${dense ? 'dense' : 'few'}.png` });
      if (kind === 'pension') {
        await visual.locator('.resource-card').nth(2).scrollIntoViewIfNeeded();
        await visual.screenshot({ animations: 'disabled', path: `${screenshots}/${kind}-accounts-${width}-${scheme}-${density}.png` });
      }
      await visual.locator('.resource-card').nth(2).getByRole('button', { name: / aç$/ }).click();
      const overlay = visual.getByRole('dialog');
      await expect(overlay).toHaveClass(/workspace-frame--centered/);
      const box = await overlay.boundingBox();
      expect(box.x).toBeGreaterThan(0); expect(box.y).toBeGreaterThan(0);
      expect(box.x + box.width).toBeLessThan(width); expect(box.y + box.height).toBeLessThan(height);
      await visual.screenshot({ animations: "disabled", path: `${screenshots}/${kind}-overlay-${width}-${scheme}-${density}.png` });
      await visual.keyboard.press('Escape');
    }
    await visual.emulateMedia({ reducedMotion: 'reduce' });
    expect(await visual.locator('.resource-card').first().evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.002);
    await visual.setViewportSize({ width: 600, height: 800 });
    expect(await visual.locator('.operations-board').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
    expect(await visual.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await visual.screenshot({ animations: "disabled", path: `${screenshots}/${kind}-600-stacked.png` });
    await visual.close();
  }
  expect(errors).toEqual([]);
  console.log(`operations-cards-ok: priorities/forms, exact account/order identity, read-only details, deduplication, refresh/staleness, capability gates, focus/touch, appearance matrix; screenshots: ${screenshots}`);
} finally { await browser?.close(); await server.close(); }
