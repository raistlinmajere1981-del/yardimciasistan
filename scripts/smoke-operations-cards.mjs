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
  async function open(kind, variant = 'all', hasTouch = true) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, hasTouch });
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
  const workspace = page.locator('.workspace-page-frame');
  const close = () => workspace.getByRole('button', { name: 'Çalışma alanını kapat', exact: true }).click();
  const orderBefore = await page.locator('.resource-card h3').allTextContents();
  await expect(card(101).locator('.resource-card__image')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(card(103)).toContainText('Konaklayanlar · 2 kişi');
  await expect(card(103)).toContainText('Ece Yılmaz');
  await expect(page.locator('.resource-card').getByText(/Önceki misafir/)).toHaveCount(0);

  // The card surface is the only detail launcher; opening it is read-only.
  await card(103).getByRole('button', { name: 'Oda 103 odasını aç' }).tap();
  await expect(workspace.getByRole('region', { name: 'Hesap', exact: true })).toContainText('Ece Yılmaz');
  await expect(workspace.getByRole('region', { name: 'Hesap', exact: true })).toContainText('3.600');
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind !== 'read'))).toEqual([]);
  await close();
  await expect(card(103).getByRole('button', { name: 'Oda 103 odasını aç' })).toBeVisible();
  await expect(card(103).getByRole('button', { name: 'Ayrıntı', exact: true })).toHaveCount(0);

  // Non-interactive card body is also a launcher; embedded controls keep their own click target.
  await card(103).locator('.resource-card__facts').click();
  await expect(workspace).toBeVisible();
  await close();

  // A planned stay is completed inside the workspace instead of duplicating the workflow on the card.
  await card(102).getByRole('button', { name: 'Oda 102 odasını aç' }).click();
  await expect(workspace.getByRole('button', { name: 'Giriş Yap', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'check-in').length)).toBe(0);
  await workspace.getByRole('button', { name: 'Giriş Yap' }).click();
  expect(await page.evaluate(() => window.fixtureCalls.find(call => call.kind === 'check-in').input)).toBe('stay-1');
  await close();
  await expect(card(102)).toContainText('Misafir içeride');

  // Physical status chips mutate directly on the card and never open a confirmation/workspace.
  const roomStatus = card(101).getByRole('group', { name: 'Oda 101 fiziksel durumunu değiştir', exact: true });
  await expect(roomStatus.getByRole('button', { name: 'Hizmet dışı', exact: true })).toHaveCount(0);
  await expect(roomStatus.getByRole('button', { name: 'Hazır', exact: true })).toBeVisible();
  await expect(roomStatus.getByRole('button', { name: 'Temizlik', exact: true })).toBeVisible();
  await expect(roomStatus.getByRole('button', { name: 'Bakımda', exact: true })).toBeVisible();
  await page.evaluate(() => { window.fixtureDelayRoom = true; window.fixtureFailRoom = true; });
  await roomStatus.getByRole('button', { name: 'Hazır', exact: true }).evaluate(el => { el.click(); el.click(); });
  await expect(page.locator('.confirm-dialog')).toHaveCount(0);
  await expect(page.locator('.workspace-page-frame')).toHaveCount(0);
  await expect(card(101)).toContainText('İşlem sürüyor');
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'room-status').length)).toBe(1);
  await page.evaluate(() => window.fixtureReleaseRoom());
  await expect(card(101).getByRole('alert')).toContainText('Oda durumu kaydedilemedi');
  await page.evaluate(() => { window.fixtureDelayRoom = false; window.fixtureFailRoom = false; });
  await roomStatus.getByRole('button', { name: 'Hazır', exact: true }).click();
  await expect(roomStatus.getByRole('button', { name: 'Hazır', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.resource-card h3').allTextContents()).toEqual(orderBefore);

  // Out-of-service is structural, not a daily chip: the card shows a read-only indicator and cannot reactivate.
  await page.evaluate(() => {
    const state = window.fixtureState();
    const rooms = state.dashboard.rooms.map(room => room.id === 'room-101' ? { ...room, status: 'out_of_service' } : room);
    window.fixturePatch({ rooms });
  });
  await expect(card(101)).toContainText('Hizmet dışı');
  await expect(card(101).getByRole('group', { name: 'Oda 101 fiziksel durumunu değiştir', exact: true })).toHaveCount(0);
  await expect(card(101).getByRole('button', { name: 'Hizmet dışı', exact: true })).toHaveCount(0);
  await expect(card(101).locator('.resource-card__out-of-service')).toContainText('Hizmet dışı');
  await page.evaluate(() => {
    const state = window.fixtureState();
    const rooms = state.dashboard.rooms.map(room => room.id === 'room-101' ? { ...room, status: 'cleaning' } : room);
    window.fixturePatch({ rooms });
  });
  await expect(card(101).getByRole('group', { name: 'Oda 101 fiziksel durumunu değiştir', exact: true })).toBeVisible();

  // Card checkout is a real quick action: it never opens the workspace and can settle current + same-customer prior debt.
  const paymentsBeforeCheckout = await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'payment').length);
  await card(103).getByRole('button', { name: 'Misafir çıkışı', exact: true }).click();
  await expect(page.locator('.workspace-page-frame')).toHaveCount(0);
  const confirm = page.getByRole('dialog', { name: 'Misafir çıkışı', exact: true });
  await expect(confirm).toContainText('Ece Yılmaz');
  await expect(confirm).toContainText('Kalan hesap');
  await confirm.getByRole('checkbox', { name: /Mevcut hesabı tahsil et ve kapat/ }).check();
  await confirm.getByRole('checkbox', { name: /Bu müşterinin eski borçlarını da tahsil et/ }).check();
  await confirm.getByLabel('Çıkış ödeme yöntemi').selectOption('card');
  await confirm.getByRole('button', { name: 'Tüm Misafirlerin Çıkışını Yap', exact: true }).click();
  await expect(page.getByText(/seçilen hesaplar tahsil edilip kapatıldı/)).toBeVisible();
  await expect(workspace).toHaveCount(0);
  await expect(card(103).getByRole('group', { name: 'Oda 103 fiziksel durumunu değiştir', exact: true })
    .getByRole('button', { name: 'Temizlik', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const checkoutPayments = await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'payment').slice(-2));
  expect(checkoutPayments).toHaveLength(2);
  expect(checkoutPayments.map(call => call.input.paymentMethod)).toEqual(['card', 'card']);
  expect(new Set(checkoutPayments.map(call => call.input.folioId))).toEqual(new Set(['folio-stay-2', 'folio-old-stay-2']));
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'payment').length)).toBe(paymentsBeforeCheckout + 2);
  expect((await page.evaluate(() => window.fixtureState())).folios.find(item => item.stayId === 'stay-2').status).toBe('closed');

  // Simulate the dashboard event channel, followed by an older in-flight request.
  // Prior-account balances are intentionally no longer rendered on cards; use the active stay summary
  // so this assertion remains about revision ordering rather than removed presentation.
  await page.evaluate(() => {
    const old = structuredClone(window.fixtureDashboard);
    const next = structuredClone(old); next.revision += 10;
    const stay = next.roomOperations?.find(item => item.roomId === 'room-102')?.stays.find(item => item.id === 'stay-1');
    if (stay) stay.customerName = 'Revision Misafir';
    window.fixturePublishDashboard(next); window.fixturePublishDashboard(old);
  });
  await expect(card(102)).toContainText('Revision Misafir');
  await page.evaluate(() => window.fixturePublishDashboard({ ...window.fixtureDashboard, revision: 1000, roomOperations: null }));
  await expect(card(104)).toContainText('Güncel özet alınamadı');
  await expect(card(104).getByRole('button', { name: /Misafir çıkışı|Temizliği tamamla/ })).toHaveCount(0);
  await page.close();

  const restaurant = await open('restaurant');
  const table = number => restaurant.getByRole('article', { name: `Masa ${number}`, exact: true });
  const rworkspace = restaurant.locator('.workspace-page-frame');
  const floor = () => rworkspace.getByRole('button', { name: 'Masa çalışma alanını kapat', exact: true }).click();
  expect(await restaurant.evaluate(() => window.fixtureCalls)).toEqual([]);
  await expect(table(1).locator('.resource-card__image')).toHaveAttribute('src', /^data:image\/svg\+xml/);

  // Card surface opens the table without creating an order.
  await table(1).getByRole('button', { name: 'Masa 1 masasını aç' }).tap();
  await expect(rworkspace.getByText('Aktif adisyon yok.')).toBeVisible();
  expect(await restaurant.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'start'))).toEqual([]);
  await floor();
  await expect(table(1).getByRole('button', { name: 'Masa 1 masasını aç' })).toBeVisible();
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
  await expect(rworkspace).toHaveCount(0);
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
  await expect(rworkspace).toHaveCount(0);
  expect(await restaurant.evaluate(() => window.fixtureCalls.find(call => call.kind === 'close').id)).toBe('order-2');
  await expect(table(3)).toContainText('Servise hazır');
  await restaurant.close();

  // Inventory is optional: persisted zero stock must not block hospitality menus when tracking is disabled.
  const noInventoryRestaurant = await open('restaurant', 'no-inventory');
  await noInventoryRestaurant.getByRole('article', { name: 'Masa 1', exact: true })
    .getByRole('button', { name: 'Masa 1 masasını aç' }).click();
  const noInventoryTableWorkspace = noInventoryRestaurant.locator('.workspace-page-frame');
  const noInventoryMenu = noInventoryTableWorkspace.getByRole('region', { name: 'Sipariş menüsü', exact: true });
  const exhaustedOrderButton = noInventoryMenu.getByRole('button', { name: 'Tükenen ürününü siparişe ekle', exact: true });
  await expect(exhaustedOrderButton).toBeEnabled();
  await expect(noInventoryMenu.getByText(/Stokta yok|Stok:/)).toHaveCount(0);
  await exhaustedOrderButton.click();
  await expect.poll(() => noInventoryRestaurant.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'add').length)).toBe(1);
  expect((await noInventoryRestaurant.evaluate(() => window.fixtureState())).dashboard.menu.items.find(item => item.id === 'menu-b').stock_quantity).toBe(0);
  await noInventoryRestaurant.close();

  const noInventoryPension = await open('pension', 'no-inventory');
  await noInventoryPension.evaluate(seedOperationsCardScene, { kind: 'pension' });
  await noInventoryPension.getByRole('article', { name: 'Oda 103', exact: true })
    .getByRole('button', { name: 'Oda 103 odasını aç' }).click();
  const noInventoryRoomWorkspace = noInventoryPension.locator('.workspace-page-frame');
  const noInventoryRoomMenu = noInventoryRoomWorkspace.getByRole('region', { name: 'Oda hesabı menüsü', exact: true });
  const roomTeaButton = noInventoryRoomMenu.getByRole('button', { name: 'Çay ürününü oda hesabına ekle', exact: true });
  await expect(roomTeaButton).toBeEnabled();
  await expect(noInventoryRoomMenu.getByText(/Stokta yok|Stok:/)).toHaveCount(0);
  await roomTeaButton.click();
  await expect.poll(() => noInventoryPension.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'menu').length)).toBe(1);
  expect((await noInventoryPension.evaluate(() => window.fixtureState())).menu[0].stockQuantity).toBe(0);
  await noInventoryPension.close();

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
      const overlay = visual.locator('.workspace-page-frame');
      await expect(overlay).toBeVisible();
      expect(await overlay.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await visual.screenshot({ animations: "disabled", path: `${screenshots}/${kind}-overlay-${width}-${scheme}-${density}.png` });
      await overlay.getByRole('button', { name: /alışma alanını kapat/i }).click();
      await expect(overlay).toHaveCount(0);
    }
    await visual.emulateMedia({ reducedMotion: 'reduce' });
    expect(await visual.locator('.resource-card').first().evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.002);
    await visual.setViewportSize({ width: 600, height: 800 });
    expect(await visual.locator('.operations-board').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
    expect(await visual.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await visual.screenshot({ animations: "disabled", path: `${screenshots}/${kind}-600-stacked.png` });
    await visual.close();
  }
  // Mouse choices are compact; touch and primary actions retain full targets.
  for (const kind of ['pension', 'restaurant']) {
    const mouse = await open(kind, 'all', false);
    for (const scheme of ['light', 'dark']) for (const density of ['compact', 'comfortable']) {
      await mouse.evaluate(({ scheme, density }) => {
        document.documentElement.dataset.colorScheme = scheme;
        document.documentElement.dataset.density = density;
      }, { scheme, density });
      const chip = mouse.locator('.resource-card__status .choice-chips button').first();
      await expect(chip).toBeVisible();
      expect(await chip.evaluate(el => el.getBoundingClientRect().height)).toBe(density === 'compact' ? 34 : 38);
      await chip.focus();
      expect(await chip.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
      const selected = mouse.locator('.choice-chips button[aria-pressed="true"]').first();
      const selectedColor = await selected.evaluate(el => getComputedStyle(el).backgroundColor);
      await selected.hover();
      expect(await selected.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(selectedColor);
      expect(await mouse.locator('.resource-card__actions .action-button').evaluateAll(items => items.length > 0 && items.every(el => el.getBoundingClientRect().height >= 44))).toBe(true);
      for (const width of [900, 640]) {
        await mouse.setViewportSize({ width, height: 800 });
        expect(await mouse.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await mouse.locator('.operations-board__pane--center .operations-board__pane-body').evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
        await mouse.screenshot({ animations: 'disabled', path: `${screenshots}/${kind}-mouse-${width}-${scheme}-${density}.png` });
      }
      await mouse.setViewportSize({ width: 1366, height: 768 });
    }
    await mouse.close();
  }
  expect(errors).toEqual([]);
  console.log(`operations-cards-ok: priorities/forms, exact account/order identity, read-only details, deduplication, refresh/staleness, capability gates, focus/touch, appearance matrix; screenshots: ${screenshots}`);
} finally { await browser?.close(); await server.close(); }
