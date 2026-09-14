import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createSetupFixture, createReportFixture, createCompactUiFixture } from './lib/desktop-renderer-fixtures.mjs';

import { BUSINESS_CAPABILITIES } from '@yardimci-asistan/shared';

const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', '--config', 'vite.renderer.config.ts', '--host', '127.0.0.1', '--port', String(port)], { cwd: 'apps/desktop-app', stdio: 'ignore' });
const output = 'artifacts/design-system/stage1';
mkdirSync(output, { recursive: true });
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(baseUrl)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch();
  const page = await browser.newPage({ locale: "tr-TR" });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Stable local tiles: the visual test does not depend on OSM/network availability.
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edece6"/><path d="M0 40L256 200M40 0L180 256" stroke="#fff" stroke-width="10"/></svg>' }));
  await page.addInitScript(({ setup, dashboard, report, allCapabilities }) => {
    localStorage.setItem('yardimci-asistan.ui-preferences', JSON.stringify({ theme: 'light', mode: 'easy', scale: 1 }));
    const enabledCapabilities = allCapabilities;
    let profile = { description: 'Akyaka’da aile işletmesi pansiyon ve kafe.', latitude: 37.05, longitude: 28.32, directionsNote: '', checkInTime: '14:00', checkOutTime: '11:00', breakfastStartTime: '08:00', breakfastEndTime: '10:00', features: [], policyNote: '', paymentNote: '', languages: ['Türkçe', 'English'] };
    window.__designCalls = [];
    window.yardimciDesktop = {
      getBootstrapData: async () => ({ appName: 'Yardımcı Asistan', version: '0.1.2', platform: 'linux', setup, databasePath: dashboard.databasePath, backupPath: dashboard.backupPath, syncSettings: { webModuleUrl: setup.webModuleUrl, hasSyncSecret: true } }),
      commerce: { listProducts: async () => [], listCategories: async () => [] },
      getReportData: async () => report,
      getFinanceData: async () => ({ generatedAt: '', currency: 'TRY', todayIncomeMinor: 0, todayExpenseMinor: 0, todayNetMinor: 0, outstandingPensionMinor: 0, recentEntries: [], pensionBalances: [] }),
      openTableOrder: async tableId => ({ ok: true, message: 'Adisyon açıldı.', order: { id: `stage1-${tableId}`, tableId, tableName: dashboard.tables.find(table => table.id === tableId).name, status: 'open', openedAt: '2026-09-14T09:00:00Z', closedAt: '', subtotal: 0, discountTotal: 0, total: 0, note: '', itemCount: 0, items: [], createdAt: '2026-09-14T09:00:00Z', updatedAt: '2026-09-14T09:00:00Z' } }),
      getSetupData: async () => setup,
      getDashboardData: async () => dashboard,
      getBusinessCapabilitySnapshot: async () => ({ businessId: 'design-fixture', profileId: setup.profileId, enabledCapabilities, capabilities: enabledCapabilities.map(capability => ({ capability, enabled: true, source: 'profile' })) }),
      getBusinessPublicProfile: async () => profile,
      saveBusinessPublicProfile: async input => { profile = input; window.__designCalls.push({ kind: 'public', input }); return { ok: true, message: 'Bilgiler kaydedildi.', profile }; },
      getRoomFolioData: async () => ({ rooms: [], activeStays: [], folios: [], menuCategories: [], menuItems: [] }),
      listLocalBackups: async () => ({ ok: true, backups: [{ id: 'design-backup', createdAt: '2026-09-13T09:00:00Z', kind: 'manual', sizeBytes: 2048000, imageCount: 3 }] }),
      updateAppPassword: async input => { window.__designCalls.push({ kind: 'password', input }); return { ok: true, message: 'Şifre kaydedildi.', status: { passwordConfigured: true } }; },
      testWebConnection: async () => ({ ok: true, message: 'Bağlantı başarılı.' }),
      getSyncStatus: async () => ({ enabled: false, phase: 'idle', pendingJobs: 0, consecutiveFailures: 0, message: '', lastError: '' }),
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
        await page.getByRole('button', { name: 'Elle Talep Ekle', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Yeni talep ekle', exact: true });
        await checkOverlay(dialog, 'request-drawer');
        await dialog.getByRole('button', { name: 'Elle talep formunu kapat', exact: true }).click();
        await expect(dialog).toHaveCount(0);
      }
      if (name === 'Restoran') {
        const card = page.locator('.restaurant-table-card').filter({ hasText: 'Bahçe Masası 1' });
        await card.getByRole('button', { name: 'Sipariş Aç', exact: true }).click();
        const dialog = page.locator('.restaurant-order-drawer');
        await checkOverlay(dialog, 'order-drawer');
        await dialog.getByRole('button', { name: "Sipariş drawer'ını kapat", exact: true }).click();
        await expect(dialog).toHaveCount(0);
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
  for (const [theme, mode] of [['light','pro'],['dark','pro'],['light','easy']]) {
    await page.locator('.sidebar').getByRole('button', { name: 'Ayarlar', exact: true }).click();
    await page.getByRole('radio', { name: /Kompakt ve Gelişmiş/ }).click();
    await page.getByLabel('Karanlık tema').setChecked(theme === 'dark');
    if (mode === 'easy') await page.getByRole('radio', { name: /Büyük ve Sade/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
    expect(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme)).toBe(theme);
    await page.locator('.sidebar').getByRole('button', { name: 'Ana Ekran', exact: true }).click();
    await page.screenshot({ path: `${output}/shell-${theme}-${mode}.png` });
  }
  await page.locator('.sidebar').getByRole('button', { name: 'Ayarlar', exact: true }).focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
  expect(errors).toEqual([]);
  console.log('desktop-shell-smoke-ok', JSON.stringify(observations));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
