import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { seedOperationsCardScene } from './test-helpers/operations-card-scenes.mjs';
import { captureOperationWorkspace } from './test-helpers/operation-workspace-screenshots.mjs';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { installPensionWorkspaceFixture } from './test-helpers/pension-workspace-fixture.mjs';
import { chooseDate } from './test-helpers/date-time-picker.mjs';
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
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/pension-test', async route => {
      const html = await server.transformIndexHtml('/pension-test', `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/pension-workspace.tsx')}"></script></body></html>`);
      await route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.addInitScript(installPensionWorkspaceFixture, { dashboard: createCompactUiFixture(), variant });
    await page.goto(`${server.resolvedUrls.local[0]}pension-test`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Pilot 101 odasını aç' })).toBeVisible();
    return page;
  }
  const page = await open();
  const button = name => page.getByRole('button', { name, exact: true });
  const modal = page.getByRole('dialog');
  const workspace = page.locator('.workspace-page-frame');
  const board = page.getByRole('region', { name: 'Pansiyon operasyonları', exact: true });
  await expect(board.locator('.operations-board__pane')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Pansiyon rezervasyonları', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Odalar paneli', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pansiyon günlük işleri', exact: true })).toBeVisible();
  const bounds = await board.boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(769);
  expect(await page.locator('.operations-board__pane--center .operations-board__pane-body').evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
  expect(await page.getByLabel('Rezervasyon yönetimi').locator('.data-records').evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
  expect(await page.getByLabel('Günlük işler', { exact: true }).locator('.data-records').evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const pilot101 = page.getByRole('article', { name: 'Pilot 101', exact: true });
  await expect(pilot101.getByRole('group', { name: 'Pilot 101 fiziksel durumunu değiştir', exact: true })
    .getByRole('button', { name: 'Temizlik', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(pilot101.getByRole('group', { name: 'Pilot 101 fiziksel durumunu değiştir', exact: true })
    .getByRole('button', { name: 'Hizmet dışı', exact: true })).toHaveCount(0);
  await expect(pilot101).toContainText('Yaklaşan rezervasyon');
  const pilot103 = page.getByRole('article', { name: 'Pilot 103', exact: true });
  await expect(pilot103.getByRole('group', { name: 'Pilot 103 fiziksel durumunu değiştir', exact: true })
    .getByRole('button', { name: 'Bakımda', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(pilot103.getByRole('group', { name: 'Pilot 103 fiziksel durumunu değiştir', exact: true })
    .getByRole('button', { name: 'Hizmet dışı', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Pilot 103', exact: true })).toContainText('Yaklaşan rezervasyon');
  await page.getByLabel('Rezervasyon yönetimi').getByRole('group', { name: 'Durum', exact: true }).getByRole('button', { name: 'Onaylandı', exact: true }).click();
  await page.getByLabel('Günlük işler', { exact: true }).getByRole('group', { name: 'Durum', exact: true }).getByRole('button', { name: 'Tümü', exact: true }).click();
  await button('Oda Ata / Düzenle').first().click();
  await chooseSearchSelect(modal, 'Oda', /Pilot 102/);
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  await button('Atamayı Kaydet').click();
  await expect(modal).toHaveCount(0);
  expect(await page.evaluate(() => window.fixtureState().dashboard.customerRoomStays.length)).toBe(0);
  await page.getByLabel('Rezervasyon yönetimi').getByRole('button', { name: 'Giriş Yap', exact: true }).first().click();
  await expect(workspace.getByRole('tab')).toHaveCount(0);
  await button('Çalışma alanını kapat').click();
  await button('Pilot 102 odasını aç').click();
  const stayPanel = workspace.getByRole('region', { name: 'Misafirler ve Konaklama', exact: true });
  const operations = workspace.locator('#room-operations');
  const account = workspace.getByRole('region', { name: 'Hesap', exact: true });
  await expect(stayPanel.getByLabel('Oda misafir slotları', { exact: true })).toBeVisible();
  await expect(stayPanel.getByRole('button', { name: /boş misafir slotu/ }).first()).toBeVisible();
  await expect(workspace.getByLabel('Fiziksel oda durumu')).toBeVisible();
  await expect(operations.getByRole('button', { name: 'Hizmet dışı', exact: true })).toHaveCount(0);
  await expect(account.getByRole('region', { name: 'Önceki hesaplar' })).toHaveCount(0);
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => !['read', 'assignment'].includes(call.kind)))).toEqual([]);
  await captureOperationWorkspace(page, 'room-empty');
  await chooseSearchSelect(stayPanel, 'Atanacak rezervasyon', /Pilot rezervasyon 0/);
  await expect(operations.getByLabel('Atanacak rezervasyon')).toHaveCount(0);
  await button('Rezervasyonu Ata').click();
  expect(await page.evaluate(() => window.fixtureState().dashboard.customerRoomStays.length)).toBe(0);
  await chooseSearchSelect(stayPanel, 'İlgili rezervasyon', /Kompakt Misafir 1.*Beklenen 1 kişi/);
  const entryForm = stayPanel.getByRole('form', { name: 'Misafir girişi', exact: true });
  await expect(entryForm).toContainText('Beklenen 1 kişi');
  const callsBeforeEntry = await page.evaluate(() => window.fixtureCalls.length);
  await entryForm.getByRole('button', { name: /Giriş Yap/, exact: false }).click();
  await expect(stayPanel.getByRole('button', { name: /Kompakt Misafir 1 misafir slotu/ })).toBeVisible();
  expect(await page.evaluate(() => window.fixtureState().dashboard.customerRoomStays[0].reservationId)).toBe('booking-0');
  expect(await page.evaluate(() => window.fixtureState().dashboard.customerRoomStays[0].status)).toBe('checked_in');
  expect(await page.evaluate(() => window.fixtureState().dashboard.rooms.find(room => room.id === 'room-102').status)).toBe('occupied');
  await expect(account.locator('[data-folio-id]')).toHaveCount(1);
  await expect(stayPanel.getByRole('region', { name: 'Konaklama işlemleri', exact: true })).toBeVisible();
  await expect(stayPanel.locator('summary').filter({ hasText: 'Konaklama işlemleri' })).toHaveCount(0);
  expect(await page.evaluate(() => window.fixtureState().dashboard.customerRoomStays[0].guests)).toHaveLength(1);
  const entryCalls = await page.evaluate((before) => window.fixtureCalls.slice(before).map(call => call.kind), callsBeforeEntry);
  expect(entryCalls[0]).toBe('linked');
  // Individual departure must expose untransferred restaurant bills; the last
  // guest sees the same shared-account summary as group checkout.
  await page.evaluate(() => {
    const state = window.fixtureState();
    const customerId = state.dashboard.customerRoomStays[0].customerId;
    window.fixturePatch({ tables: [{ ...state.dashboard.tables[0], id: 'departure-table', currentCustomerId: customerId }],
      tableOperations: [{ tableId: 'departure-table', order: { id: 'departure-order', status: 'open' } }] });
  });
  await stayPanel.getByRole('button', { name: /Kompakt Misafir 1 misafir slotu/ }).click();
  await stayPanel.getByRole('button', { name: 'Misafir Çıkışı', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('1 açık restoran adisyonu');
  await expect(page.getByText('Kalan hesap', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  expect(await page.evaluate(() => window.fixtureState().dashboard.customerRoomStays[0].status)).toBe('checked_in');
  await page.evaluate(() => {
    const state = window.fixtureState();
    const stay = state.dashboard.customerRoomStays[0];
    stay.guests.push({ ...stay.guests[0], id: 'remaining-guest', customerId: 'remaining-customer', customerName: 'Kalan Misafir' });
    stay.guestCount = 2;
    window.fixturePatch({ customerRoomStays: state.dashboard.customerRoomStays });
  });
  await chooseSearchSelect(stayPanel, 'Yeni ana misafir', /Kalan Misafir/);
  await stayPanel.getByRole('button', { name: 'Misafir Çıkışı', exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText('1 açık restoran adisyonu');
  await expect(page.getByText('Kalan hesap', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await page.evaluate(() => {
    const state = window.fixtureState();
    state.dashboard.customerRoomStays[0].guests.pop();
    state.dashboard.customerRoomStays[0].guestCount = 1;
    window.fixturePatch({ customerRoomStays: state.dashboard.customerRoomStays, tableOperations: [] });
  });
  expect(entryCalls).not.toContain('open-account');
  expect(entryCalls).not.toContain('check-in');
  // Başka odada aktif müşteri, müşteri listesinde Oda bilgisiyle disabled görünür.
  await page.evaluate(() => {
    const current = window.fixtureState();
    window.fixturePatch({ rooms: current.dashboard.rooms.map(room => room.id === 'room-101' ? { ...room, status: 'available' } : room) });
  });
  await button('Çalışma alanını kapat').click();
  await button('Pilot 101 odasını aç').click();
  // Başka odada aktif müşteri, misafir listesinde disabled görünür.
  const otherStayPanel = workspace.getByRole('region', { name: 'Misafirler ve Konaklama', exact: true });
  await otherStayPanel.getByRole('button', { name: /boş misafir slotu/ }).first().click();
  await otherStayPanel.getByLabel('Misafir ekle', { exact: true }).click();
  const customerPicker = page.getByRole('dialog', { name: 'Misafir ekle seçici', exact: true });
  const activeOption = customerPicker.getByRole('option', { name: /Aktif konaklaması var/ });
  await expect(activeOption).toBeVisible();
  await expect(activeOption).toBeDisabled();
  await expect(activeOption).toContainText('Kompakt Misafir 1');
  await page.keyboard.press('Escape');
  await button('Çalışma alanını kapat').click();
  await page.evaluate(() => {
    const current = window.fixtureState();
    window.fixturePatch({ rooms: current.dashboard.rooms.map(room => room.id === 'room-101' ? { ...room, status: 'cleaning' } : room) });
  });
  await button('Pilot 102 odasını aç').click();
  await expect(workspace.getByRole('button', { name: 'Çıkışı Tamamla', exact: true })).toBeVisible();
  await expect(operations.getByRole('button', { name: 'Çıkışı Tamamla', exact: true })).toHaveCount(0);
  await expect(account.getByLabel('Ödeme tutarı')).toBeVisible();
  const stayDates = stayPanel.getByRole('region', { name: 'Konaklama tarihleri', exact: true });
  await expect(stayDates).toBeVisible();
  const dateBounds = await stayDates.boundingBox();
  const slotBounds = await stayPanel.getByLabel('Oda misafir slotları', { exact: true }).boundingBox();
  expect(dateBounds.y).toBeLessThan(slotBounds.y);

  const lodgingRow = account.locator('.room-account-editable-row').filter({ hasText: 'Konaklama' });
  await lodgingRow.getByRole('button', { name: 'Düzenle', exact: true }).click();
  await lodgingRow.getByLabel('Konaklama tutarı', { exact: true }).fill('250');
  await lodgingRow.getByRole('button', { name: 'Uygula', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.fixtureState().folios[0].lodgingTotalMinor)).toBe(25000);

  const discountRow = account.locator('.room-account-editable-row').filter({ hasText: 'İndirim' });
  await discountRow.getByRole('button', { name: 'Düzenle', exact: true }).click();
  await discountRow.getByLabel('İndirim tutarı', { exact: true }).fill('10');
  await discountRow.getByRole('button', { name: 'Uygula', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.fixtureState().folios[0].items.find(item => item.kind === 'discount')?.lineTotalMinor)).toBe(-1000);
  await expect(operations.locator('.room-folio-line-list').getByText('İndirim', { exact: true })).toHaveCount(0);
  await captureOperationWorkspace(page, 'room-occupied');
  await chooseSearchSelect(operations, 'Ürün / hizmet', /Çay/);
  await button('Ürünü Ekle').click();
  await expect(operations.getByLabel('Odaya eklenenler')).toContainText('Çay');
  await expect(account.getByLabel('Odaya eklenenler')).toHaveCount(0);
  expect(await page.evaluate(() => window.fixtureState().menu[0].stockQuantity)).toBe(9);
  await button('Çay miktarını artır').click();
  await expect.poll(() => page.evaluate(() => window.fixtureState().menu[0].stockQuantity)).toBe(8);
  await button('Çay miktarını azalt').click(); await button('Çay kalemini çıkar').click();
  await expect.poll(() => page.evaluate(() => window.fixtureState().menu[0].stockQuantity)).toBe(10);
  await operations.getByLabel('Açıklama').fill('Ek yatak');
  await operations.getByLabel('Ek ücret', { exact: true }).fill('50');
  await button('Ana Sayfa').click();
  await expect(page.getByRole('heading', { name: 'Ana Sayfa', exact: true })).toBeVisible();
  await expect(workspace).toBeHidden();
  await button('Pansiyon').click();
  await expect(workspace).toBeVisible();
  await expect(operations.getByLabel('Açıklama')).toHaveValue('Ek yatak');
  await expect(operations.getByLabel('Ek ücret', { exact: true })).toHaveValue('50');
  await button('Geçmiş').click();
  await expect(workspace.getByRole('region', { name: 'Oda geçmişi' })).toContainText('tam geçmiş değildir');
  await button("← Pilot 102'e dön").click();
  await expect(operations.getByLabel('Açıklama')).toHaveValue('Ek yatak');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(operations.getByLabel('Açıklama')).toHaveValue('Ek yatak');
  await page.keyboard.press('Escape'); await expect(workspace).toBeVisible();
  expect(await page.evaluate(() => window.fixtureOpen('room-101'))).toBe(false);
  await button('Ek Ücreti Ekle').click();
  await expect(operations.getByLabel('Odaya eklenenler')).toContainText('Ek yatak');
  const remainingBeforeCheckout = await page.evaluate(() => window.fixtureState().folios[0].remainingMinor);
  const paymentCallsBeforeCheckout = await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'payment').length);
  // Physical departure never invents a payment: settle the shared account first, then check out.
  await account.getByLabel('Ödeme tutarı').fill(String(remainingBeforeCheckout / 100));
  await account.getByRole('button', { name: 'Ödemeyi Kaydet', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.fixtureState().folios[0].remainingMinor)).toBe(0);
  await workspace.getByRole('button', { name: 'Çıkışı Tamamla', exact: true }).click();
  const checkoutConfirm = page.getByRole('dialog', { name: 'Misafir çıkışı', exact: true });
  await expect(checkoutConfirm).toContainText('Kalan hesap');
  await expect(checkoutConfirm).toContainText('hesap kapanır');
  await expect(checkoutConfirm.getByRole('group', { name: 'Çıkış ödeme yöntemi', exact: true })).toHaveCount(0);
  await checkoutConfirm.getByRole('button', { name: 'Tüm Misafirlerin Çıkışını Yap', exact: true }).click();
  const state = await page.evaluate(() => window.fixtureState());
  expect(state.dashboard.customerRoomStays[0].status).toBe('checked_out');
  expect(state.dashboard.rooms[1].status).toBe('cleaning');
  expect(state.folios[0].status).toBe('closed');
  const checkoutPayment = (await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'payment'))).at(-1);
  expect(checkoutPayment.input.amountMinor).toBe(remainingBeforeCheckout);
  expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'payment').length)).toBe(paymentCallsBeforeCheckout + 1);
  await expect(account.getByRole('region', { name: 'Mevcut konaklama hesabı' })).toContainText('Aktif misafir hesabı yok');
  await expect(account.getByRole('region', { name: 'Önceki hesaplar' })).toHaveCount(0);
  const roomCondition = workspace.getByRole('group', { name: 'Fiziksel oda durumu', exact: true });
  await roomCondition.getByRole('button', { name: 'Hazır', exact: true }).click();
  await expect(roomCondition.getByRole('button', { name: 'Hazır', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await button('Çalışma alanını kapat').click();
  await expect(workspace).toHaveCount(0);
  await expect(button('Pilot 102 odasını aç')).toBeVisible();

  // Out-of-service rooms leave daily operations: no chips, read-only card and workspace guidance.
  await page.evaluate(() => {
    const state = window.fixtureState();
    window.fixturePatch({ rooms: state.dashboard.rooms.map(room => room.id === 'room-102' ? { ...room, status: 'out_of_service' } : room) });
  });
  const outOfServiceCard = page.getByRole('article', { name: 'Pilot 102', exact: true });
  await expect(outOfServiceCard).toContainText('Hizmet dışı');
  await expect(outOfServiceCard.getByRole('group', { name: 'Pilot 102 fiziksel durumunu değiştir', exact: true })).toHaveCount(0);
  await expect(outOfServiceCard.getByRole('button', { name: 'Hizmet dışı', exact: true })).toHaveCount(0);
  await expect(outOfServiceCard.locator('.resource-card__out-of-service')).toContainText('Hizmet dışı');
  await button('Pilot 102 odasını aç').click();
  const outOperations = workspace.locator('#room-operations');
  await expect(outOperations).toContainText('Oda hizmet dışı. Ayarlar > İşletme Düzeni > Oda Yönetimi');
  await expect(workspace.getByLabel('Fiziksel oda durumu')).toHaveCount(0);
  await expect(outOperations.getByRole('button', { name: 'Hizmet dışı', exact: true })).toHaveCount(0);
  await button('Çalışma alanını kapat').click();
  await page.evaluate(() => {
    const state = window.fixtureState();
    window.fixturePatch({ rooms: state.dashboard.rooms.map(room => room.id === 'room-102' ? { ...room, status: 'available' } : room) });
  });
  await expect(page.getByRole('article', { name: 'Pilot 102', exact: true })
    .getByRole('group', { name: 'Pilot 102 fiziksel durumunu değiştir', exact: true })).toBeVisible();

  await button('Müşteriler').click();
  const customerEntry = page.locator('.customer-record-row').first(); await customerEntry.click();
  const customerDialog = page.getByRole('dialog');
  await customerDialog.getByLabel('Konaklama odası').selectOption('room-102'); await button('Konaklama Başlat').click();
  await expect(customerDialog).toHaveCount(0);
  await expect(workspace).toBeVisible();
  const manualEntryForm = workspace.getByRole('form', { name: 'Misafir girişi', exact: true });
  await expect(manualEntryForm.getByRole('button', { name: 'Kompakt Misafir 1 misafir slotu', exact: true })).toBeVisible();
  await chooseDate(workspace, 'Giriş tarihi', '2031-01-01'); await chooseDate(workspace, 'Çıkış tarihi', '2031-01-02');
  await manualEntryForm.getByRole('button', { name: /Giriş Yap/, exact: false }).click();
  await expect.poll(() => page.evaluate(() => window.fixtureState().dashboard.customerRoomStays.length)).toBe(2);
  expect((await page.evaluate(() => window.fixtureState())).dashboard.customerRoomStays[1].reservationId).toBe('');
  expect((await page.evaluate(() => window.fixtureState())).dashboard.customerRoomStays[1].status).toBe('checked_in');
  expect((await page.evaluate(() => window.fixtureState())).dashboard.rooms.find(room => room.id === 'room-102').status).toBe('occupied');
  await button('Çalışma alanını kapat').click();
  await expect(page.getByRole('heading', { name: 'Müşteriler', exact: true })).toBeVisible();
  await expect(customerEntry).toBeVisible();
  await button('Pansiyon').click();
  // Old entity success/error/finally and same-entity out-of-order refresh cannot win.
  await page.evaluate(() => { window.fixtureDelayReads = true; });
  await button('Pilot 101 odasını aç').click();
  await expect.poll(() => page.evaluate(() => window.fixtureReads.length)).toBe(1);
  await page.evaluate(() => window.fixtureOpen('room-102'));
  await expect.poll(() => page.evaluate(() => window.fixtureReads.length)).toBe(2);
  await page.evaluate(() => window.fixtureReads[1].resolve());
  await expect(account).toContainText('Kompakt Misafir 1');
  await page.evaluate(() => window.fixtureReads[0].resolve({ folios: [] }));
  await expect(account.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => window.fixtureRefresh());
  await expect.poll(() => page.evaluate(() => window.fixtureReads.length)).toBe(3);
  await page.evaluate(() => window.fixtureRefresh());
  await expect.poll(() => page.evaluate(() => window.fixtureReads.length)).toBe(4);
  await page.evaluate(() => window.fixtureReads[2].reject(new Error('stale refresh failure')));
  await expect(account.getByText('Hesap hazırlanıyor…', { exact: true })).toBeVisible();
  await expect(account.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => window.fixtureReads[3].resolve());
  await expect(account.getByText('Hesap hazırlanıyor…', { exact: true })).toHaveCount(0);
  await button('Çalışma alanını kapat').click();
  for (const variant of ['no-folio', 'no-menu', 'rooms-only']) {
    const variantPage = await open(variant), workspace = variantPage.locator('.workspace-page-frame');
    await variantPage.getByRole('button', { name: 'Pilot 102 odasını aç' }).click();
    await expect(workspace.getByRole('tab')).toHaveCount(0);
    if (variant !== 'no-menu') expect(await variantPage.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'read').length)).toBe(0);
    if (variant === 'rooms-only') await expect(workspace.getByRole('button', { name: /Giriş Yap/ })).toHaveCount(0);
    else {
      await workspace.getByRole('button', { name: /boş misafir slotu/ }).first().click();
      await chooseSearchSelect(workspace, 'Misafir ekle', /^Kompakt Misafir 1(?:\s|$)/);
      if (variant === 'no-menu') await variantPage.evaluate(() => { window.fixtureFailOpening = true; });
      await workspace.getByRole('button', { name: /Giriş Yap/, exact: false }).click();
      if (variant === 'no-menu') {
        const failed = await variantPage.evaluate(() => window.fixtureState());
        expect(failed.dashboard.customerRoomStays).toHaveLength(0);
        expect(failed.folios).toHaveLength(0);
        expect(failed.dashboard.rooms.find(room => room.id === 'room-102').status).toBe('available');
        await expect(workspace.getByRole('button', { name: 'Kompakt Misafir 1 misafir slotu', exact: true })).toBeVisible();
        await variantPage.evaluate(() => { window.fixtureFailOpening = false; });
        await workspace.getByRole('button', { name: /Giriş Yap/ }).click();
        const retried = await variantPage.evaluate(() => window.fixtureState());
        expect(retried.dashboard.customerRoomStays).toHaveLength(1);
        expect(retried.folios).toHaveLength(1);
        const requests = await variantPage.evaluate(() => window.fixtureCalls.filter(call => call.kind === 'manual').map(call => call.input.requestId));
        expect(requests).toHaveLength(2);
        expect(requests[0]).toBe(requests[1]);
        await expect(workspace.getByRole('button', { name: 'Hesabı Aç', exact: true })).toHaveCount(0);
        await expect(workspace.getByLabel('Ürün / hizmet')).toHaveCount(0);
        await expect(workspace.getByRole('button', { name: 'Ödemeyi Kaydet' })).toBeEnabled();
      } else expect(await variantPage.evaluate(() => window.fixtureCalls.some(call => call.kind === 'open-account'))).toBe(false);
    }
    await variantPage.close();
  }
  const slotPage = await open(), slotWorkspace = slotPage.locator('.workspace-page-frame');
  await slotPage.getByRole('button', { name: 'Pilot 102 odasını aç' }).click();
  const slotStayPanel = slotWorkspace.getByRole('region', { name: 'Misafirler ve Konaklama', exact: true });
  await slotStayPanel.getByRole('button', { name: /boş misafir slotu/ }).first().click();
  await chooseSearchSelect(slotStayPanel, 'Misafir ekle', /^Kompakt Misafir 1(?:\s|$)/);
  await slotWorkspace.getByRole('button', { name: /Giriş Yap/, exact: false }).click();
  await slotPage.evaluate(() => {
    const state = window.fixtureState();
    const base = state.dashboard.customers[0];
    window.fixturePatch({
      customers: [
        ...state.dashboard.customers,
        { ...base, id: 'extra-guest-2', fullName: 'Ek Misafir 2', phone: '5550000002' },
        { ...base, id: 'extra-guest-3', fullName: 'Ek Misafir 3', phone: '5550000003' }
      ]
    });
  });

  await slotStayPanel.getByRole('button', { name: '+ Slot Ekle', exact: true }).click();
  await expect(slotStayPanel.getByRole('button', { name: '1. ek slotu kaldır', exact: true })).toBeVisible();
  await slotStayPanel.getByRole('button', { name: '1. ek slotu kaldır', exact: true }).click();
  await expect(slotStayPanel.getByRole('button', { name: '1. ek slotu kaldır', exact: true })).toHaveCount(0);

  await slotStayPanel.getByRole('button', { name: '+ Slot Ekle', exact: true }).click();
  await slotStayPanel.getByRole('button', { name: '3. boş misafir slotu', exact: true }).click();
  await chooseSearchSelect(slotStayPanel, 'Misafir ekle', /^Ek Misafir 2(?:\s|$)/);
  await expect.poll(() => slotPage.evaluate(() => window.fixtureState().dashboard.customerRoomStays[0].guestCount)).toBe(2);

  await slotStayPanel.getByRole('button', { name: '+ Slot Ekle', exact: true }).click();
  await slotStayPanel.getByRole('button', { name: '3. boş misafir slotu', exact: true }).click();
  await chooseSearchSelect(slotStayPanel, 'Misafir ekle', /^Ek Misafir 3(?:\s|$)/);
  await expect.poll(() => slotPage.evaluate(() => window.fixtureState().dashboard.customerRoomStays[0].guestCount)).toBe(3);
  await expect(slotStayPanel.getByRole('button', { name: 'Ek Misafir 3 misafir slotu', exact: true })).toBeVisible();
  await expect(slotWorkspace).toContainText('3 kişi · 2 kişilik oda');
  await slotPage.close();

  const safety = await open(), safetyWorkspace = safety.locator('.workspace-page-frame');
  await safety.evaluate(seedOperationsCardScene, { kind: 'pension' });
  await safety.getByRole('button', { name: 'Oda 106 odasını aç' }).click();
  await expect(safetyWorkspace.getByRole('button', { name: /boş misafir slotu/ }).first()).toBeVisible();
  expect(await safety.evaluate(() => window.fixtureCalls.filter(call => call.kind !== 'read'))).toEqual([]);
  await captureOperationWorkspace(safety, 'room-empty');
  const sameSurface = await safetyWorkspace.locator('.operation-surface').elementHandle();
  for (const mode of ['summary', 'stay', 'account']) {
    await safety.evaluate(mode => window.fixtureOpen('room-106', { mode }), mode);
    await expect(safetyWorkspace.getByRole('tab')).toHaveCount(0);
    expect(await sameSurface.evaluate(element => element.isConnected && !element.hidden)).toBe(true);
  }
  await safetyWorkspace.getByRole('button', { name: 'Çalışma alanını kapat' }).click();
  await safety.getByRole('button', { name: 'Oda 103 odasını aç' }).click();
  const currentAccount = safetyWorkspace.getByRole('region', { name: 'Mevcut konaklama hesabı', exact: true });
  const priorAccounts = safetyWorkspace.getByRole('region', { name: 'Önceki hesaplar', exact: true });
  await expect(currentAccount.locator('[data-folio-id]')).toHaveAttribute('data-folio-id', 'folio-stay-2');
  await expect(currentAccount.locator('[data-stay-id]')).toHaveAttribute('data-stay-id', 'stay-2');
  await expect(priorAccounts.locator('[data-folio-id]')).toHaveAttribute('data-folio-id', 'folio-old-stay-2');
  await expect(priorAccounts).toContainText('Ece Yılmaz');
  await expect(priorAccounts).not.toContainText('Selin Aras');
  await expect(safetyWorkspace.getByText('Bu müşterinin önceki borcu · ₺1.250,00', { exact: true })).toBeVisible();
  await expect(currentAccount).not.toContainText('Selin Aras');
  await captureOperationWorkspace(safety, 'room-occupied');
  await safety.evaluate(() => window.fixtureOpen('room-103', { mode: 'account', action: 'payment', folioId: 'folio-old-stay-2', stayId: 'old-stay-2' }));
  await expect(priorAccounts.getByLabel('Ödeme tutarı')).toBeFocused();
  await priorAccounts.getByLabel('Ödeme tutarı').fill('50');
  await priorAccounts.getByRole('button', { name: 'Ödemeyi Kaydet' }).click();
  await expect.poll(() => safety.evaluate(() => window.fixtureState().folios.find(folio => folio.id === 'folio-old-stay-2').remainingMinor)).toBe(120000);
  expect(await safety.evaluate(() => window.fixtureCalls.find(call => call.kind === 'payment').input.folioId)).toBe('folio-old-stay-2');
  await expect(currentAccount.locator('[data-folio-id]')).toHaveAttribute('data-folio-id', 'folio-stay-2');
  await expect(currentAccount).toContainText('3.600');
  for (const [width, height, scale] of [[1024, 768, 1.1], [600, 800, 1]]) {
    await safety.setViewportSize({ width, height });
    await safety.evaluate(scale => { document.documentElement.style.setProperty('--ui-scale', String(scale)); document.documentElement.style.zoom = String(scale); }, scale);
    expect(await safetyWorkspace.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await safetyWorkspace.getByRole('button', { name: 'Geçmiş', exact: true }).click();
    await safetyWorkspace.getByRole('button', { name: "← Oda 103'e dön" }).click();
  }
  await safetyWorkspace.getByRole('button', { name: 'Çalışma alanını kapat' }).click();
  await safety.setViewportSize({ width: 1366, height: 768 });
  for (const condition of ['cleaning', 'maintenance', 'conflict']) {
    await safety.evaluate(condition => {
      const data = window.fixtureState().dashboard;
      const rooms = data.rooms.map(room => room.id === 'room-102' ? { ...room, status: condition === 'conflict' ? 'reserved' : condition } : room);
      const stays = data.customerRoomStays.filter(stay => stay.id !== 'conflicting-stay');
      if (condition === 'conflict') stays.push({ ...stays.find(stay => stay.id === 'stay-1'), id: 'conflicting-stay' });
      window.fixturePatch({ rooms, customerRoomStays: stays });
    }, condition);
    await safety.getByRole('button', { name: 'Oda 102 odasını aç' }).click();
    await expect(safetyWorkspace.getByRole('button', { name: /Giriş Yap/, exact: false })).toHaveCount(0);
    await expect(safetyWorkspace).toContainText(condition === 'conflict' ? 'Oda kayıtlarında çakışma var' : 'Giriş için oda hazır ve boş olmalı.');
    await safetyWorkspace.getByRole('button', { name: 'Çalışma alanını kapat' }).click();
  }
  await safety.close();
  expect(errors).toEqual([]);
  console.log('pension-workspace-smoke-ok: persistent page session, explicit mutations, assignment/stays, account/payment, history, guards, capabilities, stale results');
} finally { await browser?.close(); await server.close(); }
