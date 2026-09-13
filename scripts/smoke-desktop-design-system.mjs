import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createSetupFixture, createDashboardFixture } from './lib/desktop-renderer-fixtures.mjs';

const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', '--config', 'vite.renderer.config.ts', '--host', '127.0.0.1', '--port', String(port)], { cwd: 'apps/desktop-app', stdio: 'ignore' });
const output = 'artifacts/design-system';
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
  await page.addInitScript(({ setup, dashboard }) => {
    localStorage.setItem('yardimci-asistan.ui-preferences', JSON.stringify({ theme: 'light', mode: 'easy', scale: 1 }));
    const enabledCapabilities = ['core.customers','core.requests','core.business_profile','accommodation.rooms','accommodation.reservations','food_service.tables','food_service.menu','food_service.orders','service.whatsapp','service.android','service.ai'];
    let profile = { description: 'Akyaka’da aile işletmesi pansiyon ve kafe.', latitude: 37.05, longitude: 28.32, directionsNote: '', checkInTime: '14:00', checkOutTime: '11:00', breakfastStartTime: '08:00', breakfastEndTime: '10:00', features: [], policyNote: '', paymentNote: '', languages: ['Türkçe', 'English'] };
    window.__designCalls = [];
    window.yardimciDesktop = {
      getBootstrapData: async () => ({ appName: 'Yardımcı Asistan', version: '0.1.2', platform: 'linux', setup, databasePath: dashboard.databasePath, backupPath: dashboard.backupPath, syncSettings: { webModuleUrl: setup.webModuleUrl, hasSyncSecret: true } }),
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
  }, { setup: { ...createSetupFixture(), setupRequired: false }, dashboard: createDashboardFixture() });
  await page.goto(baseUrl);
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await expect(page.getByLabel('Giriş saati')).toHaveValue('14:00');
  const observations = [];
  await expect(page.getByLabel('Telefon', { exact: true })).toHaveValue('+905321234567');
  for (const [width, height] of [[1440,1000],[1366,768],[1024,768],[900,768],[760,768],[600,800]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.content').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ animations: "disabled", path: `${output}/settings-${width}-top.png` });
    const metrics = await page.evaluate(() => {
      const box = selector => { const e = document.querySelector(selector); const b = e.getBoundingClientRect(); return { width: b.width, height: b.height }; };
      const overflows = [...document.querySelectorAll('.content, .setup-capabilities, .setup-section, .form-grid, .form-row')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className);
      return { overflows, documentOverflow: document.documentElement.scrollWidth > innerWidth + 1, phone: box('.settings-identity-section .form-field--short input'), time: box('input[type="time"]'), map: box('.business-location-map-viewport'), button: box('.business-public-profile-heading button'), timeRows: new Set([...document.querySelectorAll('input[type="time"]')].map(el => Math.round(el.getBoundingClientRect().top))).size };
    });
    observations.push({ width, height, ...metrics });
    expect(metrics.documentOverflow, `Document overflow at ${width}`).toBe(false);
    expect(metrics.overflows, `Content overflow at ${width}`).toEqual([]);
    if (width > 760) expect(metrics.timeRows, `Four time controls share a row at ${width}`).toBe(1);
    const nav = page.getByRole('navigation', { name: 'Ayar bölümleri' });
    for (const [name, id] of [['İşletmem','business'],['Müşteri bilgileri','public'],['İşletme düzeni','operations'],['Bağlantılar','connections'],['Uygulama','application'],['Bakım','maintenance']]) {
      await nav.getByRole('link', { name, exact: true }).click();
      const section = page.locator(`#settings-${id}`);
      await expect(section).toBeInViewport();
      if (width > 760) {
        const visibleHeading = section.locator('h2').first();
        const [headBox, navBox] = await Promise.all([visibleHeading.boundingBox(), nav.boundingBox()]);
        expect(headBox.y, `${name} obscured by nav at ${width}`).toBeGreaterThanOrEqual(navBox.y + navBox.height);
      }
      if (['public','connections','application','maintenance'].includes(id)) await page.screenshot({ animations: "disabled", path: `${output}/settings-${width}-${id}.png` });
    }
  }
  await page.locator('.business-location-map-viewport').scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled", path: `${output}/settings-map.png` });
  await page.getByLabel('Enlem', { exact: true }).fill('37.06');
  await page.getByLabel('Boylam', { exact: true }).fill('28.33');
  // Test actual form semantics and unchanged bridge payloads.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('İşletme açıklaması').fill('Güncellenen açıklama');
  await page.getByRole('button', { name: 'Bilgileri Kaydet', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__designCalls.find(c => c.kind === 'public')?.input.description)).toBe('Güncellenen açıklama');
  expect(await page.evaluate(() => window.__designCalls.find(c => c.kind === 'public').input.latitude)).toBe(37.06);
  await page.getByLabel('Şifre belirleyin', { exact: true }).fill('design-test-password');
  await page.getByLabel('Yeni şifre tekrar', { exact: true }).fill('design-test-password');
  await page.getByRole('button', { name: 'Şifreyi Belirle', exact: true }).click();
  await expect(page.getByText('Şifre kaydedildi.', { exact: true })).toBeVisible();
  for (const theme of ['light','dark']) {
    await page.getByRole('radio', { name: /Kompakt ve Gelişmiş/ }).click();
    await page.getByLabel('Karanlık tema').setChecked(theme === 'dark');
    await page.locator('.content').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ animations: "disabled", path: `${output}/settings-pro-${theme}.png` });
  }
  // Focus ring remains visible with keyboard navigation.
  await page.getByRole('navigation', { name: 'Ayar bölümleri' }).getByRole('link').first().focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
  expect(errors).toEqual([]);
  writeFileSync(`${output}/viewports.json`, JSON.stringify(observations, null, 2));
  console.log('desktop-design-system-smoke-ok', JSON.stringify(observations));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
