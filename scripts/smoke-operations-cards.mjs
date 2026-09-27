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

  // The card surface is the only detail launcher; opening it is read-only.
  await card(103).getByRole('button', { name: 'Oda 103 odasını aç' }).tap();
  await expect(dialog.getByRole('region', { name: 'Misafir Hesabı', exact: true })).toContainText('Ece Yılmaz');
  await expect(dialog.getByRole('region', { name: 'Misafir Hesabı', exact: true })).toContainText('3.600');
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind !== 'read'))).toEqual([]);
  await close();
  await expect(card(103).getByRole('button', { name: 'Oda 103 odasını aç' })).toBeFocused();
  await expect(card(103).getByRole('button', { name: 'Ayrıntı', exact: true })).toHaveCount(0);

  // A planned stay is completed inside the workspace instead of duplicating the workflow on the card.
  await card(102).getByRole('button', { name: 'Oda 102 odasını aç' }).click();
  await expect(dialog.getByRole('button', { name: 'Giriş Yap', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'check-in').length)).toBe(0);
  await dialog.getByRole('button', { name: 'Giriş Yap' }).click();
  expect(await page.evaluate(() => window.fixtureCalls.find(call => call.kind === 'check-in').input)).toBe('stay-1');
  await close();
  await expect(card(102)).toContainText('Misafir içeride');

  // Physical status chips mutate directly on the card and never open a confirmation/workspace.
  const roomStatus = card(101).getByRole('group', { name: 'Oda 101 fiziksel durumunu değiştir', exact: true });
  await page.evaluate(() => { window.fixtureDelayRoom = true; window.fixtureFailRoom = true; });
  await roomStatus.getByRole('button', { name: 'Hazır', exact: true }).evaluate(el => { el.click(); el.click(); });
  await expect(page.locator('.confirm-dialog')).toHaveCount(0);
  await expect(page.locator('.workspace-frame')).toHaveCount(0);
  await expect(card(101)).toContainText('İşlem sürüyor');
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'room-status').length)).toBe(1);
  await page.evaluate(() => window.fixtureReleaseRoom());
  await expect(card(101).getByRole('alert')).toContainText('Oda durumu kaydedilemedi');
  await page.evaluate(() => { window.fixtureDelayRoom = false; window.fixtureFailRoom = false; });
  await roomStatus.getByRole('button', { name: 'Hazır', exact: true }).click();
  await expect(roomStatus.getByRole('button', { name: 'Hazır', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.resource-card h3').allTextContents()).toEqual(orderBefore);

  // Current guest checkout is a true card quick action: it must not open the workspace and settles the current folio.
  const paymentsBeforeCheckout = await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'payment').length);
  await card(103).getByRole('button', { name: 'Misafir çıkışı', exact: true }).click();
  const confirm = page.locator('.confirm-dialog');
  await expect(page.locator('.workspace-frame')).toHaveCount(0);
  await expect(confirm).toContainText('Ece Yılmaz');
  await expect(confirm).toContainText('Kalan hesap');
  await confirm.getByRole('button', { name: 'Çıkış ve Hesabı Kapat', exact: true }).click();
  await expect(card(103)).toContainText('Temizlik bekliyor');
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'payment').length)).toBe(paymentsBeforeCheckout + 1);
  expect((await page.evaluate(() => window.fixtureState())).folios.find(item => item.stayId === 'stay-2').status).toBe('closed');

  // Simulate the dashboard event channel, followed by an older in-flight request.
  await page.evaluate(() => {
    const old = structuredClone(window.fixtureDashboard);
    const next = structuredClone(old); next.revision += 10;
    const account = next.roomOperations?.find(item => item.roomId === 'room-104')?.accounts.find(item => item.stayId === 'stay-3');
    if (account) account.remainingMinor = 123400;
    window.fixturePublishDashboard(next); window.fixturePublishDashboard(old);
  });
  await expect(card(104)).toContainText('1.234');
  await page.evaluate(() => window.fixturePublishDashboard({ ...window.fixtureDashboard, revision: 1000, roomOperations: null }));
  await expect(card(104)).toContainText('Güncel özet alınamadı');
  await expect(card(104).getByRole('button', { name: /Misafir çıkışı|Temizliği tamamla/ })).toHaveCount(0);
  await page.close();

  const restaurant = await open('restaurant');
  const table = number => restaurant.getByRole('article', { name: `Masa ${number}`, exact: true });
  const rd = restaurant.getByRole('dialog');
  const floor = () => rd.getByRole('button', { name: "Floor'a dön", exact: true }).click();
  expect(await restaurant.evaluate(() => window.fixtureCalls)).toEqual([]);

  // Card surface opens the table without creating an order.
  await table(1).getByRole('button', { name: 'Masa 1 masasını aç' }).tap();
  await expect(rd.getByRole('button', { name: 'Sipariş Aç', exact: true })).toBeEnabled();
  expect(await restaurant.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'start'))).toEqual([]);
  await floor();
  await expect(table(1).getByRole('button', { name: 'Masa 1 masasını aç' })).toBeFocused();
  await expect(table(1).getByRole('button', { name: 'Ayrıntı', exact: true })).toHaveCount(0);

  // Quick order creation is confirmed and stays on the floor.
  await restaurant.evaluate(() => { window.fixtureDelayStart = true; });
  await table(1).getByRole('button', { name: 'Sipariş aç', exact: true }).click();
  let tableConfirm = restaurant.locator('.confirm-dialog');
  await expect(tableConfirm).toContainText('Masa 1');
  await expect(tableConfirm).toContainText('Açık adisyon');
  await tableConfirm.getByRole('button', { name: 'Sipariş aç', exact: true }).evaluate(el => { el.click(); el.click(); });
  expect(await restaurant.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'start').length)).toBe(1);
  await restaurant.evaluate(() => window.fixtureResolveStart());
  await expect(rd).toHaveCount(0);
  await expect(table(1)).toContainText('Sipariş alınıyor');

  // Service lifecycle and physical table statuses are direct chips; account close remains a guarded quick action.
  const orderStatus = table(2).getByRole('group', { name: 'Masa 2 sipariş durumu', exact: true });
  await orderStatus.getByRole('button', { name: 'Servis edildi', exact: true }).click();
  await expect(restaurant.locator('.confirm-dialog')).toHaveCount(0);
  await orderStatus.getByRole('button', { name: 'Hesap bekliyor', exact: true }).click();
  await expect(table(2).getByRole('button', { name: 'Hesabı kapat', exact: true })).toBeVisible();
  expect(await restaurant.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'status').map(call => [call.id, call.status]))).toEqual([['order-1', 'served'], ['order-1', 'payment']]);

  const tableStatus = table(4).getByRole('group', { name: 'Masa 4 durumunu değiştir', exact: true });
  await tableStatus.getByRole('button', { name: 'Boş', exact: true }).click();
  await expect(restaurant.locator('.confirm-dialog')).toHaveCount(0);
  await expect(tableStatus.getByRole('button', { name: 'Boş', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Payment close can be completed from the card, with total visible in the confirmation.
  await table(3).getByRole('button', { name: 'Hesabı kapat', exact: true }).click();
  tableConfirm = restaurant.locator('.confirm-dialog');
  await expect(tableConfirm).toContainText('450');
  await tableConfirm.getByRole('button', { name: 'Hesabı kapat', exact: true }).click();
  await expect(rd).toHaveCount(0);
  expect(await restaurant.evaluate(() => window.fixtureCalls.find(call => call.kind === 'close').id)).toBe('order-2');
  await expect(table(3)).toContainText('Servise hazır');
  await restaurant.close();

  for (const [kind, variant] of [['pension', 'rooms-only'], ['restaurant', 'tables-only']]) {
    const disabled = await open(kind, variant);
    await expect(disabled.getByRole('button', { name: /Misafir çıkışı|Sipariş aç|Hesabı kapat/ })).toHaveCount(0);
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
