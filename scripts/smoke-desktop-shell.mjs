import { catalogPageFixture } from "./test-helpers/catalog-page-fixture.ts";
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { getLocalViteExecutable } from './test-helpers/local-vite.mjs';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createSetupFixture, createReportFixture, createCompactUiFixture } from './lib/desktop-renderer-fixtures.mjs';

import { BUSINESS_CAPABILITIES } from '@yardimci-asistan/shared';

const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(getLocalViteExecutable(), ['--config', 'vite.renderer.config.ts', '--host', '127.0.0.1', '--port', String(port)], { cwd: 'apps/desktop-app', stdio: 'ignore' });
const output = 'artifacts/design-system/stage1';
mkdirSync(output, { recursive: true });
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(baseUrl)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ locale: "tr-TR" });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error); });
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  // Stable local tiles: the visual test does not depend on OSM/network availability.
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edece6"/><path d="M0 40L256 200M40 0L180 256" stroke="#fff" stroke-width="10"/></svg>' }));
  await page.addInitScript({ content: `window.__catalogPageFixture = ${catalogPageFixture.toString()};` });
  await page.addInitScript(({ setup, dashboard, report, allCapabilities }) => {
    localStorage.setItem('yardimci-asistan.ui-preferences', JSON.stringify({ version: 2, scheme: 'light', density: 'comfortable', scale: 1, accent: 'coral', font: 'plex', motion: 'system' }));
    const enabledCapabilities = allCapabilities;
    let profile = { description: 'Akyaka’da aile işletmesi pansiyon ve kafe.', latitude: 37.05, longitude: 28.32, directionsNote: '', checkInTime: '14:00', checkOutTime: '11:00', breakfastStartTime: '08:00', breakfastEndTime: '10:00', features: [], policyNote: '', paymentNote: '', languages: ['Türkçe', 'English'], socialLinks: [] };
    window.__designCalls = [];
    window.__holdCustomerRead = false;
    window.__failCustomerRead = false;
    window.__customerReadCount = 0;
    window.__customerPageOverride = '';
    window.__syncOriginalCustomers = structuredClone(dashboard.customers);
    let dashboardRevision = dashboard.revision;
    const dashboardListeners = new Set();
    window.__pushDashboard = changes => {
      Object.assign(dashboard, changes, { revision: ++dashboardRevision });
      for (const listener of dashboardListeners) listener(structuredClone(dashboard));
    };
    window.__pushStaleDashboard = () => {
      const stale = structuredClone(dashboard);
      stale.revision = dashboardRevision - 1;
      stale.customers[0].fullName = 'Eski yanıt';
      for (const listener of dashboardListeners) listener(stale);
    };
    window.yardimciDesktop = {
      getBootstrapData: async () => ({ appName: 'Yardımcı Asistan', version: '0.1.2', platform: 'linux', setup, databasePath: dashboard.databasePath, backupPath: dashboard.backupPath, syncSettings: { webModuleUrl: setup.webModuleUrl, hasSyncSecret: true } }),
      commerce: {
        listProducts: async options => window.__catalogPageFixture([], options),
        listCategories: async () => [],
        setBarcodeScanMode: async () => true,
        consumePendingBarcodeScans: async () => []
      },
      getReportData: async () => report,
      getFinanceData: async () => ({ generatedAt: '', currency: 'TRY', todayIncomeMinor: 0, todayExpenseMinor: 0, todayNetMinor: 0, outstandingPensionMinor: 0, recentEntries: [], pensionBalances: [] }),
      openTableOrder: async tableId => ({ ok: true, message: 'Adisyon açıldı.', order: { id: `stage1-${tableId}`, tableId, tableName: dashboard.tables.find(table => table.id === tableId).name, status: 'open', openedAt: '2026-09-14T09:00:00Z', closedAt: '', subtotal: 0, discountTotal: 0, total: 0, note: '', itemCount: 0, items: [], createdAt: '2026-09-14T09:00:00Z', updatedAt: '2026-09-14T09:00:00Z' } }),
      getSetupData: async () => setup,
      getInstagramConfiguration: async () => ({ providerId: 'instagram_api', enabled: false, accountId: '', username: '',
        expiresAt: '', apiVersion: 'v25.0', hasSecret: false, configured: false }),
      getDashboardData: async () => structuredClone({ ...dashboard, revision: ++dashboardRevision }),
      onDashboardDataChanged: listener => { dashboardListeners.add(listener); return () => dashboardListeners.delete(listener); },
      listCustomers: async ({ search }) => {
        window.__customerReadCount += 1;
        if (window.__holdCustomerRead) await new Promise(resolve => { window.__finishCustomerRead = resolve; });
        if (window.__failCustomerRead) throw new Error('Müşteri okuma fixture hatası.');
        const items = dashboard.customers.filter(customer => customer.fullName.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
          .map((customer, index) => window.__customerPageOverride && index === 0 ? { ...customer, fullName: window.__customerPageOverride } : customer);
        return { items, total: dashboard.customers.length, matched: items.length,
          context: { stays: dashboard.customerRoomStays, reservations: dashboard.reservations, notifications: dashboard.hospitalityNotifications } };
      },
      getBusinessCapabilitySnapshot: async () => ({ businessId: 'design-fixture', profileId: setup.profileId, enabledCapabilities, capabilities: enabledCapabilities.map(capability => ({ capability, enabled: true, source: 'profile' })) }),
      getBusinessPublicProfile: async () => profile,
      saveBusinessPublicProfile: async input => { profile = input; window.__designCalls.push({ kind: 'public', input }); return { ok: true, message: 'Bilgiler kaydedildi.', profile }; },
      getGoogleReviewsSettings: async () => ({ enabled: false, placeId: '', apiKeyConfigured: false, lastPublishedAt: '', publicationPending: false }),
      saveGoogleReviewsSettings: async input => ({
        ok: true,
        message: 'Google yorumları ayarları kaydedildi.',
        settings: {
          enabled: input.enabled,
          placeId: input.placeId,
          apiKeyConfigured: Boolean(input.apiKey),
          lastPublishedAt: '',
          publicationPending: false
        }
      }),
      testGoogleReviewsConnection: async () => ({
        ok: true,
        message: 'Google Places bağlantısı doğrulandı.',
        name: 'Smoke İşletmesi',
        rating: 4.8,
        userRatingCount: 12
      }),
      getBusinessLayout: async () => ({
        capabilities: { rooms: true, tables: true },
        rooms: dashboard.rooms.map((room, index) => ({
          id: room.id,
          name: room.name,
          number: room.number,
          capacity: room.capacity,
          bedInfo: room.bedInfo,
          floor: room.floor,
          features: [],
          description: room.description,
          priceNote: room.priceNote,
          nightlyPriceMinor: 0,
          currency: 'TRY',
          sortOrder: index + 1,
          canRemove: true,
          removeBlockReason: ''
        })),
        tableCategories: [...new Set(dashboard.tables.map(table => table.area))].map(name => ({
          name,
          tableCount: dashboard.tables.filter(table => table.area === name).length
        }))
      }),
      saveBusinessLayout: async input => {
        window.__designCalls.push({ kind: 'layout', input });
        return {
          ok: true,
          message: 'İşletme düzeni kaydedildi.',
          layout: await window.yardimciDesktop.getBusinessLayout()
        };
      },
      getRoomFolioData: async () => ({ rooms: [], activeStays: [], folios: [], menuCategories: [], menuItems: [] }),
      getKbsSettings: async () => ({ enabled: false, provider: "egm", facilityCode: "", username: "", authorizedIdentityNumber: "", passwordConfigured: false }),
      saveKbsSettings: async (input) => ({ ok: true, message: "KBS ayarları kaydedildi.", settings: { enabled: input.enabled, provider: input.provider, facilityCode: input.facilityCode, username: input.username, authorizedIdentityNumber: input.authorizedIdentityNumber, passwordConfigured: Boolean(input.password) } }),
      testKbsConnection: async () => ({ ok: false, message: "Smoke modunda KBS bağlantısı denenemez." }),
      inspectEgmKbsSession: async () => ({ ok: false, message: "Smoke modunda EGM oturumu yok." }),
      prepareEgmKbsLogin: async () => ({ ok: false, message: "Smoke modunda EGM girişi hazırlanamaz." }),
      listRoomMedia: async () => [],
      addRoomMedia: async () => ({ ok: true, message: 'Medya eklendi.', media: [] }),
      updateRoomMedia: async () => ({ ok: true, message: 'Medya güncellendi.', media: [] }),
      deleteRoomMedia: async () => ({ ok: true, message: 'Medya kaldırıldı.', media: [] }),
      listLocalBackups: async () => ({ ok: true, backups: [{ id: 'design-backup', createdAt: '2026-09-13T09:00:00Z', kind: 'manual', sizeBytes: 2048000, imageCount: 3 }] }),
      updateAppPassword: async input => { window.__designCalls.push({ kind: 'password', input }); return { ok: true, message: 'Şifre kaydedildi.', status: { passwordConfigured: true } }; },
      testWebConnection: async () => ({ ok: true, message: 'Bağlantı başarılı.' }),
      getSyncStatus: async () => ({
        enabled: true,
        clientId: 'shell-smoke',
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: '',
        lastSuccessAt: '',
        lastError: '',
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: '',
        phase: 'idle',
        message: 'Otomatik eşitleme hazır.'
      }),
      runSyncNow: async () => ({
        ok: true,
        message: 'Eşitleme tamamlandı.',
        pulledRequests: 0,
        pulledActions: 0,
        appliedActions: 0,
        failedActions: 0,
        publishedJobs: 0,
        status: {
          enabled: true,
          clientId: 'shell-smoke',
          requestCursor: 0,
          acknowledgedCursor: 0,
          lastAttemptAt: '2026-09-30T16:15:00Z',
          lastSuccessAt: '2026-09-30T16:15:00Z',
          lastError: '',
          consecutiveFailures: 0,
          pendingJobs: 0,
          nextRetryAt: '',
          phase: 'success',
          message: 'Eşitleme tamamlandı.'
        }
      }),
      onSyncStatusChanged: () => () => {},
      onAppLockStateChanged: () => () => {},
      openExternal: async () => true
    };
  }, { setup: { ...createSetupFixture(), setupRequired: false }, dashboard: createCompactUiFixture(), report: createReportFixture(), allCapabilities: Object.values(BUSINESS_CAPABILITIES) });
  // Hold the initial lazy page module to make even a one-frame fallback observable.
  let releaseDashboard;
  const dashboardGate = new Promise(resolve => { releaseDashboard = resolve; });
  let dashboardRequested = false;
  await page.route('**/pages/DashboardPage.tsx', async route => {
    dashboardRequested = true;
    await dashboardGate;
    await route.continue();
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => dashboardRequested).toBe(true);
  await expect(page.locator('.content')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Sayfa açılıyor' })).toHaveCount(0);
  releaseDashboard();
  await expect(page.getByRole('heading', { name: 'Bugün ne var?', level: 1, exact: true })).toBeVisible();

  // Page reads keep their busy guard and render neither loading text nor false empty states.
  await page.evaluate(() => { window.__holdCustomerRead = true; });
  await page.locator('.sidebar').getByRole('button', { name: 'Müşteri İşleri', exact: true }).click();
  const customers = page.getByRole('region', { name: 'Müşteri yönetimi', exact: true });
  const customerList = customers.locator('[aria-busy]');
  const search = customers.getByRole('textbox', { name: 'Ara', exact: true });
  await expect(customerList).toHaveAttribute('aria-busy', 'true');
  await expect(customers.getByText(/yükleniyor|Müşteri bulunamadı/i)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => typeof window.__finishCustomerRead)).toBe('function');
  await page.evaluate(() => { window.__finishCustomerRead(); window.__finishCustomerRead = null; });
  await expect(customerList).toHaveAttribute('aria-busy', 'false');
  const firstCustomer = await customers.locator('.customer-record-row__open').first().textContent();
  await search.fill('fixture-no-matching-customer');
  await expect(customerList).toHaveAttribute('aria-busy', 'true');
  await expect(customers.getByRole('button', { name: firstCustomer, exact: true })).toBeVisible();
  await expect(customers.getByText(/yükleniyor|Müşteri bulunamadı/i)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => typeof window.__finishCustomerRead)).toBe('function');
  await page.evaluate(() => { window.__finishCustomerRead(); window.__finishCustomerRead = null; });
  await expect(customerList).toHaveAttribute('aria-busy', 'false');
  await expect(customers.getByText('Müşteri bulunamadı.', { exact: true })).toBeVisible();
  await page.evaluate(() => { window.__failCustomerRead = true; });
  await search.fill(firstCustomer);
  await expect(customerList).toHaveAttribute('aria-busy', 'true');
  await expect(customers.getByText(/yükleniyor|Müşteri bulunamadı/i)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => typeof window.__finishCustomerRead)).toBe('function');
  await page.evaluate(() => { window.__finishCustomerRead(); window.__finishCustomerRead = null; });
  await expect(customers.getByRole('alert')).toHaveText('Müşteri okuma fixture hatası.');
  await expect(customers.getByText('Müşteri bulunamadı.', { exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.__holdCustomerRead = false; window.__failCustomerRead = false; });
  await search.fill('');
  await expect(customerList).toHaveAttribute('aria-busy', 'false');
  await expect(customers.getByRole('alert')).toHaveCount(0);
  console.log('desktop-loading-cleanup-ok: delayed lazy page, initial read, retained rows, confirmed empty result and read failure');
  // Background invalidation reads must not replace focused DOM, reset scroll or toggle loading.
  await search.focus();
  await search.evaluate(element => { window.__focusedSearch = element; });
  await customerList.evaluate(element => {
    element.style.flex = 'none'; element.style.height = '40px'; element.style.overflow = 'auto';
    element.scrollTop = 20; window.__customerScrollTop = element.scrollTop;
    window.__customerBusyStarts = 0;
    new MutationObserver(records => {
      for (const record of records) if (record.oldValue === 'false') window.__customerBusyStarts += 1;
    }).observe(element, { attributes: true, attributeFilter: ['aria-busy'], attributeOldValue: true });
  });
  const readsBeforeSync = await page.evaluate(() => window.__customerReadCount);
  await page.evaluate(() => window.__pushDashboard({}));
  // The page read runs after a 150ms debounce; poll instead of assuming a fixed idle slice.
  await expect.poll(() => page.evaluate(() => window.__customerReadCount)).toBe(readsBeforeSync + 1);
  await page.getByRole('button', { name: /^Eşitleme durumu:/ }).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__customerReadCount)).toBe(readsBeforeSync + 1);
  await search.focus();
  await page.evaluate(() => window.__pushDashboard({ backupPath: '/fixture-unrelated-backup' }));
  await expect.poll(() => page.evaluate(() => window.__customerReadCount)).toBe(readsBeforeSync + 2);
  expect(await page.evaluate(() => window.__customerBusyStarts)).toBe(0);
  expect(await search.evaluate(element => document.activeElement === element && window.__focusedSearch === element)).toBe(true);
  expect(await customerList.evaluate(element => element.scrollTop === window.__customerScrollTop)).toBe(true);
  await page.evaluate(() => window.__pushDashboard({ customers: window.__syncOriginalCustomers.map((customer, index) =>
    index === 0 ? { ...customer, fullName: 'Sync güncel müşteri' } : customer) }));
  await expect(customers.getByRole('button', { name: 'Sync güncel müşteri', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__customerReadCount)).toBe(readsBeforeSync + 3);
  await page.evaluate(() => window.__pushStaleDashboard());
  await expect.poll(() => page.evaluate(() => window.__customerReadCount)).toBe(readsBeforeSync + 4);
  await expect(customers.getByRole('button', { name: 'Sync güncel müşteri', exact: true })).toBeVisible();
  await expect(customers.getByText('Eski yanıt', { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.__pushDashboard({ customers: window.__syncOriginalCustomers }));
  await expect(customers.getByRole('button', { name: firstCustomer, exact: true })).toBeVisible();
  await page.evaluate(() => { window.__customerPageOverride = 'Sayfalı müşteri güncellendi'; window.__pushDashboard({}); });
  await expect(customers.getByRole('button', { name: 'Sayfalı müşteri güncellendi', exact: true })).toBeVisible();
  await page.evaluate(() => { window.__customerPageOverride = ''; window.__pushDashboard({}); });
  await expect(customers.getByRole('button', { name: firstCustomer, exact: true })).toBeVisible();
  await customerList.evaluate(element => element.removeAttribute('style'));
  expect(await page.evaluate(async () => {
    const { createDesktopDashboardProjector } = await import('/src/app/capability-projection.ts');
    const source = await window.yardimciDesktop.getDashboardData();
    const snapshot = JSON.stringify(source);
    const enabled = (await window.yardimciDesktop.getBusinessCapabilitySnapshot()).enabledCapabilities;
    const project = createDesktopDashboardProjector();
    const first = project(source, enabled);
    const same = project(structuredClone({ ...source, revision: source.revision + 1 }), enabled);
    const stable = first.customers === same.customers && first.rooms === same.rooms && same.revision > first.revision;
    const denied = project(source, []);
    return { stable, denied: denied.customers.length === 0 && denied.rooms.length === 0, intact: JSON.stringify(source) === snapshot };
  })).toEqual({ stable: true, denied: true, intact: true });
  console.log('desktop-sync-stability-ok: automatic/manual sync, unrelated changes, focus, scroll, real updates and stale-reply fence');
  const observations = [];
  const screens = [['Ana Ekran','Bugün ne var?'],['Müşteri İşleri','Müşteri İşleri'],['Takvim','Takvim'],['Pansiyon','Pansiyon'],['Restoran','Restoran'],['Menü','Menü'],['Kasa','Kasa'],['Satış','Satış'],['Ayarlar','Ayarlar']];
  for (const [width, height] of [[1440,1000],[1280,720],[1366,768],[1024,768],[900,768]]) {
    await page.setViewportSize({ width, height });
    for (const [index, [name, title]] of screens.entries()) {
      await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.content').evaluate(el => el.scrollTop = 0);
      await page.screenshot({ animations: 'disabled', path: `${output}/${width}-${index + 1}.png` });
      const metrics = await page.evaluate(() => {
        const content = document.querySelector('.content');
        const header = document.querySelector('.page-header').getBoundingClientRect();
        const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
        const viewport = content.getBoundingClientRect();
        const overflows = [...document.querySelectorAll('.page-toolbar, .page-header, .panel')].filter(el => el.clientWidth && el.scrollWidth > el.clientWidth + 1).map(el => el.className);
        return { documentOverflow: document.documentElement.scrollWidth > innerWidth + 1, contentOverflow: content.scrollWidth > content.clientWidth + 1, overlap: sidebar.right > viewport.left + 1, overflows, headerHeight: header.height, pagePadding: getComputedStyle(document.querySelector('.page-content')).paddingLeft };
      });
      observations.push({ width, name, ...metrics });
      writeFileSync(`${output}/viewports.json`, JSON.stringify(observations, null, 2));
      expect(metrics.documentOverflow, `${name} document at ${width}`).toBe(false);
      expect(metrics.contentOverflow, `${name} content at ${width}`).toBe(false);
      expect(metrics.overlap, `${name} overlap at ${width}`).toBe(false);
      expect(metrics.overflows, `${name} shared surface at ${width}`).toEqual([]);
      const checkOverlay = async (dialog, suffix) => {
        await expect(dialog).toBeVisible();
        const bounds = await dialog.boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
        await page.screenshot({ path: `${output}/${width}-${suffix}.png` });
      };
      if (name === 'Müşteri İşleri') {
        await page.getByRole('navigation', { name: 'Müşteri işleri görünümü' }).getByRole('button', { name: 'Talepler', exact: true }).click();
        await page.getByRole('button', { name: 'Talimat Ekle', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Yeni talimat', exact: true });
        await checkOverlay(dialog, 'request-workspace');
        await dialog.getByRole('button', { name: 'Formu kapat', exact: true }).click();
        await expect(dialog).toHaveCount(0);
      }
      if (name === 'Restoran') {
        const card = page.locator('.resource-card').filter({ hasText: 'Bahçe Masası 1' });
        await card.getByRole('button', { name: /masasını aç/ }).click();
        const workspace = page.locator('.workspace-page-frame');
        await expect(workspace).toBeVisible();
        expect(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: `${output}/${width}-table-workspace.png` });
        await workspace.getByRole('button', { name: 'Masa çalışma alanını kapat', exact: true }).click();
        await expect(workspace).toHaveCount(0);
      }
      if (name === 'Menü') {
        await page.getByRole('button', { name: 'Önizle', exact: true }).click();
        const preview = page.getByRole('dialog', { name: 'Yerel Menü Önizlemesi' });
        await checkOverlay(preview, 'preview-dialog');
        await preview.getByRole('button', { name: 'Önizlemeyi kapat', exact: true }).click();
        await page.getByRole('button', { name: 'AI ile Stok Ekle', exact: true }).click();
        const stock = page.getByRole('dialog', { name: 'AI ile Stok Ekle' });
        await checkOverlay(stock, 'stock-dialog');
        await stock.getByRole('button', { name: 'Analiz Et', exact: true }).scrollIntoViewIfNeeded();
        await expect(stock.getByRole('button', { name: 'Analiz Et', exact: true })).toBeInViewport();
        await stock.getByRole('button', { name: 'Stok görseli ekranını kapat', exact: true }).click();
      }
      await page.locator('.content').evaluate(el => el.scrollTop = el.scrollHeight);
      expect((await page.locator('.page-header').boundingBox()).y).toBeGreaterThanOrEqual(0);
    }
    await page.getByRole('button', { name: 'Menüyü daralt', exact: true }).click();
    await expect(page.locator('.sidebar')).toHaveClass(/is-collapsed/);
    await page.locator('.sidebar').getByRole('button', { name: 'Ana Ekran', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bugün ne var?', exact: true })).toBeVisible();
    await page.screenshot({ path: `${output}/${width}-collapsed.png` });
    await page.getByRole('button', { name: 'Menüyü genişlet', exact: true }).click();
  }
  for (const [scheme, density] of [['light','compact'],['dark','compact'],['light','comfortable']]) {
    await page.locator('.sidebar').getByRole('button', { name: 'Ayarlar', exact: true }).click();
    await page.getByRole('button', { name: 'Görünüm', exact: true }).click();
    await page.getByRole('radio', { name: 'Kompakt', exact: true }).click();
    await page.getByRole('radio', { name: scheme === 'dark' ? 'Koyu' : 'Açık', exact: true }).click();
    if (density === 'comfortable') await page.getByRole('radio', { name: 'Rahat', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', scheme);
    await expect(page.locator('html')).toHaveAttribute('data-density', density);
    expect(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme)).toBe(scheme);
    await page.locator('.sidebar').getByRole('button', { name: 'Ana Ekran', exact: true }).click();
    await page.screenshot({ path: `${output}/shell-${scheme}-${density}.png` });
  }
  // Leaving Settings from the real sidebar must protect the business draft.
  await page.locator('.sidebar').getByRole('button', { name: 'Ayarlar', exact: true }).click();
  const persistedBusinessName = await page.getByLabel('Firma adı', { exact: true }).inputValue();
  await page.getByLabel('Firma adı', { exact: true }).fill('Sidebar guard taslağı');
  await page.locator('.sidebar').getByRole('button', { name: 'Ana Ekran', exact: true }).click();
  const leaveDialog = page.getByRole('dialog', { name: /İşletme değişiklikleri bekliyor/ });
  await expect(leaveDialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ayarlar', level: 1, exact: true })).toBeVisible();
  await leaveDialog.getByRole('button', { name: 'Burada kal', exact: true }).click();
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue('Sidebar guard taslağı');
  await page.locator('.sidebar').getByRole('button', { name: 'Ana Ekran', exact: true }).click();
  await leaveDialog.getByRole('button', { name: 'Değişiklikleri geri al ve geç', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bugün ne var?', level: 1, exact: true })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await expect(page.getByLabel('Firma adı', { exact: true })).toHaveValue(persistedBusinessName);
  await page.locator('.sidebar').getByRole('button', { name: 'Ana Ekran', exact: true }).click();
  // Isolate sync-silent: central success auto-clears, wait for idle before asserting silence.
  await expect(page.locator('.global-message-bar')).toHaveCount(0, { timeout: 10000 });

  await page.locator('.sidebar').getByRole('button', { name: 'Ana Ekran', exact: true }).click();
  await expect(page.locator('.global-message-bar')).toHaveCount(0);
  await expect(page.locator('.page-header__notice')).toHaveCount(1);
  await expect(page.getByText('Şimdi Eşitle', { exact: true })).toHaveCount(0);
  // Compare both endpoints at the same desktop viewport width.
  await page.setViewportSize({ width: 1440, height: 900 });
  const headerHeightWithoutNotice = await page.locator('.page-header').evaluate((element) => element.getBoundingClientRect().height);
  const messageFrame = page.locator('.page-header__message-frame');
  await expect(messageFrame).toBeVisible();
  await expect(messageFrame).toContainText('Hazır');
  const headerGroupGeometry = async () => page.locator('.page-header').evaluate(header => {
    const indicator = header.querySelector('.page-header__notice .sync-status-indicator');
    const frame = header.querySelector('.page-header__message-frame');
    const group = header.querySelector('.page-header__notice');
    const i = indicator.getBoundingClientRect(), f = frame.getBoundingClientRect();
    const g = group.getBoundingClientRect(), h = header.getBoundingClientRect();
    return {
      indicatorLeft: i.left,
      frameLeft: f.left,
      frameWidth: f.width,
      indicatorInFrame: i.left >= f.left && i.right <= f.right && i.top >= f.top && i.bottom <= f.bottom,
      symmetricSides: Math.abs((f.left - h.left) - (h.right - f.right)) < 9,
      centerDelta: Math.abs((g.left + g.right) / 2 - (h.left + h.right) / 2),
      borderColor: getComputedStyle(frame).borderTopColor,
      noOverflow: frame.scrollWidth <= frame.clientWidth + 1
    };
  });
  const idleGeometry = await headerGroupGeometry();
  expect(idleGeometry.indicatorInFrame).toBe(true);
  expect(idleGeometry.symmetricSides).toBe(true);
  expect(idleGeometry.centerDelta).toBeLessThan(9);
  // The right-hand tools keep one visual family; embedded sync uses the green frame palette.
  // Measure the idle visual state, not a button left hovered by earlier interactions.
  await page.mouse.move(1, 1);
  const iconFamily = await page.locator('.page-header__actions button.topbar-control').evaluateAll(buttons =>
    buttons.map(button => {
      const css = getComputedStyle(button);
      return {
        label: button.getAttribute('aria-label'),
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
        background: css.backgroundColor,
        borderRadius: css.borderRadius,
        borderWidth: css.borderTopWidth
      };
    })
  );
  expect(iconFamily.length).toBeGreaterThanOrEqual(4);
  for (const button of iconFamily) {
    expect(button.width).toBeCloseTo(44, 0);
    expect(button.height).toBeCloseTo(44, 0);
    expect(button.background).toBe(iconFamily[0].background);
    expect(button.borderRadius).toBe(iconFamily[0].borderRadius);
    expect(button.borderWidth).toBe(iconFamily[0].borderWidth);
  }
  const syncVisual = await page.locator('.page-header__message-frame .sync-status-indicator').evaluate(button => ({
    width: button.getBoundingClientRect().width,
    height: button.getBoundingClientRect().height,
    background: getComputedStyle(button).backgroundColor,
    color: getComputedStyle(button).color
  }));
  expect(syncVisual.width).toBeCloseTo(44, 0);
  expect(syncVisual.height).toBeCloseTo(44, 0);
  expect(syncVisual.background).not.toBe(iconFamily[0].background);
  for (const width of [1650, 1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.locator('.page-header').evaluate(header => {
      const group = header.querySelector('.page-header__notice').getBoundingClientRect();
      const tools = header.querySelector('.page-header__actions').getBoundingClientRect();
      const bounds = header.getBoundingClientRect();
      return {
        height: bounds.height,
        overlaps: group.right > tools.left + 1,
        centerDelta: Math.abs((group.left + group.right) / 2 - (bounds.left + bounds.right) / 2),
        frameWidth: header.querySelector('.page-header__message-frame').getBoundingClientRect().width
      };
    });
    expect(geometry.overlaps).toBe(false);
    expect(geometry.centerDelta).toBeLessThan(9);
    expect(geometry.height).toBeLessThan(95);
    if (width === 1650) expect(geometry.frameWidth).toBeGreaterThan(760);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  const syncIndicator = page.getByRole('button', { name: /Eşitleme durumu:/ });
  await expect(syncIndicator).toBeVisible();
  await syncIndicator.click();
  await expect(page.locator('.global-message-bar')).toHaveCount(0);
  await expect(page.getByText('Eşitleme tamamlandı.', { exact: true })).toHaveCount(0);

  // Short/long feedback must update only the frame content, never its position.
  for (const width of [1650, 1440, 900, 700]) {
    await page.setViewportSize({ width, height: 900 });
    const baseline = await headerGroupGeometry();
    for (const message of ['Kısa bilgi.', 'Çok uzun işlem bildirimi: ' + 'detay '.repeat(35)]) {
      await page.evaluate(text => {
        window.dispatchEvent(new CustomEvent('yardimci-asistan:app-status', {
          detail: { state: 'info', message: text }
        }));
      }, message);
      await expect(messageFrame).toContainText(message);
      const changed = await headerGroupGeometry();
      expect(changed.indicatorLeft).toBeCloseTo(baseline.indicatorLeft, 1);
      expect(changed.frameLeft).toBeCloseTo(baseline.frameLeft, 1);
      expect(changed.frameWidth).toBeCloseTo(baseline.frameWidth, 1);
      expect(changed.borderColor).toBe(baseline.borderColor);
      expect(changed.noOverflow).toBe(true);
      expect(changed.centerDelta).toBeLessThan(9);
      if (message.length > 100) {
        const wrap = await messageFrame.locator('.global-message-bar__message').evaluate(el => {
          const css = getComputedStyle(el);
          return {
            lineClamp: css.webkitLineClamp,
            height: el.getBoundingClientRect().height,
            lineHeight: parseFloat(css.lineHeight),
            title: el.title
          };
        });
        expect(wrap.lineClamp).toBe('2');
        expect(wrap.height).toBeGreaterThan(wrap.lineHeight + 1);
        expect(wrap.height).toBeLessThanOrEqual(2 * wrap.lineHeight + 1);
        expect(wrap.title).toBe(message.trim());
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('yardimci-asistan:app-status', {
      detail: { state: 'error', message: 'Smoke merkezi hata mesajı.' }
    }));
  });
  await expect(page.locator('.global-message-bar')).toContainText('Smoke merkezi hata mesajı.');
  // Sync and feedback share a centered topbar group, not the right-hand tools.
  const centerGeometry = await page.locator('.page-header').evaluate(header => {
    const sync = header.querySelector('.page-header__notice .sync-status-indicator');
    const message = header.querySelector('.global-message-bar');
    if (!sync || !message) return null;
    const a = header.getBoundingClientRect(), b = sync.getBoundingClientRect(), c = message.getBoundingClientRect();
    return {
      centerDelta: Math.abs((b.left + c.right) / 2 - (a.left + a.right) / 2),
      indicatorBeforeMessage: b.right <= c.left,
      fontSize: parseFloat(getComputedStyle(message).fontSize),
      indicatorInActions: Boolean(header.querySelector('.page-header__actions .sync-status-indicator'))
    };
  });
  expect(centerGeometry).not.toBeNull();
  expect(centerGeometry.indicatorBeforeMessage).toBe(true);
  expect(centerGeometry.indicatorInActions).toBe(false);
  expect(centerGeometry.centerDelta).toBeLessThan(9);
  expect(centerGeometry.fontSize).toBeGreaterThanOrEqual(15);
  const errorGeometry = await headerGroupGeometry();
  expect(errorGeometry.indicatorInFrame).toBe(true);
  expect(errorGeometry.symmetricSides).toBe(true);
  expect(errorGeometry.indicatorLeft).toBeCloseTo(idleGeometry.indicatorLeft, 1);
  expect(errorGeometry.frameLeft).toBeCloseTo(idleGeometry.frameLeft, 1);
  expect(errorGeometry.frameWidth).toBeCloseTo(idleGeometry.frameWidth, 1);
  expect(errorGeometry.borderColor).toBe(idleGeometry.borderColor);
  const headerHeightWithNotice = await page.locator('.page-header').evaluate((element) => element.getBoundingClientRect().height);
  expect(Math.abs(headerHeightWithNotice - headerHeightWithoutNotice)).toBeLessThan(0.5);

  await page.locator('.sidebar').getByRole('button', { name: 'Ayarlar', exact: true }).focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
  expect(errors).toEqual([]);
  console.log('desktop-shell-smoke-ok', JSON.stringify(observations));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
