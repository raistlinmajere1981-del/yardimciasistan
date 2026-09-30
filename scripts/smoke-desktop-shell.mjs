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
  page.on('pageerror', error => errors.push(error.message));
  // Stable local tiles: the visual test does not depend on OSM/network availability.
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edece6"/><path d="M0 40L256 200M40 0L180 256" stroke="#fff" stroke-width="10"/></svg>' }));
  await page.addInitScript(({ setup, dashboard, report, allCapabilities }) => {
    localStorage.setItem('yardimci-asistan.ui-preferences', JSON.stringify({ version: 2, scheme: 'light', density: 'comfortable', scale: 1, accent: 'coral', font: 'plex', motion: 'system' }));
    const enabledCapabilities = allCapabilities;
    let profile = { description: 'Akyaka’da aile işletmesi pansiyon ve kafe.', latitude: 37.05, longitude: 28.32, directionsNote: '', checkInTime: '14:00', checkOutTime: '11:00', breakfastStartTime: '08:00', breakfastEndTime: '10:00', features: [], policyNote: '', paymentNote: '', languages: ['Türkçe', 'English'], socialLinks: [] };
    window.__designCalls = [];
    window.yardimciDesktop = {
      getBootstrapData: async () => ({ appName: 'Yardımcı Asistan', version: '0.1.2', platform: 'linux', setup, databasePath: dashboard.databasePath, backupPath: dashboard.backupPath, syncSettings: { webModuleUrl: setup.webModuleUrl, hasSyncSecret: true } }),
      commerce: {
        listProducts: async () => [],
        listCategories: async () => [],
        setBarcodeScanMode: async () => true,
        consumePendingBarcodeScans: async () => []
      },
      getReportData: async () => report,
      getFinanceData: async () => ({ generatedAt: '', currency: 'TRY', todayIncomeMinor: 0, todayExpenseMinor: 0, todayNetMinor: 0, outstandingPensionMinor: 0, recentEntries: [], pensionBalances: [] }),
      openTableOrder: async tableId => ({ ok: true, message: 'Adisyon açıldı.', order: { id: `stage1-${tableId}`, tableId, tableName: dashboard.tables.find(table => table.id === tableId).name, status: 'open', openedAt: '2026-09-14T09:00:00Z', closedAt: '', subtotal: 0, discountTotal: 0, total: 0, note: '', itemCount: 0, items: [], createdAt: '2026-09-14T09:00:00Z', updatedAt: '2026-09-14T09:00:00Z' } }),
      getSetupData: async () => setup,
      getDashboardData: async () => dashboard,
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
  await page.goto(baseUrl);
  const observations = [];
  const screens = [['Ana Ekran','Bugün ne var?'],['Müşteri İşleri','Müşteri İşleri'],['Takvim','Takvim'],['Pansiyon','Pansiyon'],['Restoran','Restoran'],['Menü','Menü'],['Kasa','Kasa'],['Market','Market'],['Ayarlar','Ayarlar']];
  for (const [width, height] of [[1440,1000],[1366,768],[1024,768],[900,768]]) {
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
        await page.getByRole('button', { name: 'Elle Talep Ekle', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Yeni talep ekle', exact: true });
        await checkOverlay(dialog, 'request-drawer');
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
    await page.getByRole('tablist', { name: 'Ayar kategorileri' }).getByRole('tab', { name: 'Uygulama', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Uygulama', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('radio', { name: 'Kompakt', exact: true }).click();
    await page.getByRole('radio', { name: scheme === 'dark' ? 'Koyu' : 'Açık', exact: true }).click();
    if (density === 'comfortable') await page.getByRole('radio', { name: 'Rahat', exact: true }).click();
    // Appearance is staged: apply through the category save before asserting.
    await page.locator('.settings-category-actions').getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', scheme);
    await expect(page.locator('html')).toHaveAttribute('data-density', density);
    expect(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme)).toBe(scheme);
    await page.locator('.sidebar').getByRole('button', { name: 'Ana Ekran', exact: true }).click();
    await page.screenshot({ path: `${output}/shell-${scheme}-${density}.png` });
  }
  // Leaving Settings from the real sidebar must use the same dirty-category guard.
  await page.locator('.sidebar').getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await page.getByRole('tab', { name: 'İşletme', exact: true }).click();
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

  await page.locator('.sidebar').getByRole('button', { name: 'Ana Ekran', exact: true }).click();
  await expect(page.locator('.global-message-bar')).toHaveCount(0);
  await expect(page.locator('.page-header__notice')).toHaveCount(1);
  await expect(page.getByText('Şimdi Eşitle', { exact: true })).toHaveCount(0);
  const headerHeightWithoutNotice = await page.locator('.page-header').evaluate((element) => element.getBoundingClientRect().height);

  const syncIndicator = page.getByRole('button', { name: /Eşitleme durumu:/ });
  await expect(syncIndicator).toBeVisible();
  await syncIndicator.click();
  await expect(page.locator('.global-message-bar')).toHaveCount(0);
  await expect(page.getByText('Eşitleme tamamlandı.', { exact: true })).toHaveCount(0);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('yardimci-asistan:app-status', {
      detail: { state: 'error', message: 'Smoke merkezi hata mesajı.' }
    }));
  });
  await expect(page.locator('.global-message-bar')).toContainText('Smoke merkezi hata mesajı.');
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
