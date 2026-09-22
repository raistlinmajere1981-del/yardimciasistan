import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { getLocalViteExecutable } from './test-helpers/local-vite.mjs';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createSetupFixture, createDashboardFixture } from './lib/desktop-renderer-fixtures.mjs';

const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(getLocalViteExecutable(), ['--config', 'vite.renderer.config.ts', '--host', '127.0.0.1', '--port', String(port)], { cwd: 'apps/desktop-app', stdio: 'ignore' });
const output = 'artifacts/design-system';
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
  await page.addInitScript(({ setup, dashboard }) => {
    localStorage.setItem('yardimci-asistan.ui-preferences', JSON.stringify({ theme: 'light', mode: 'easy', scale: 1 }));
    const enabledCapabilities = ['core.customers','core.requests','core.business_profile','accommodation.rooms','accommodation.reservations','food_service.tables','food_service.menu','food_service.orders','service.whatsapp','service.android','service.ai'];
    let profile = { description: 'Akyaka’da aile işletmesi pansiyon ve kafe.', latitude: 37.05, longitude: 28.32, directionsNote: '', checkInTime: '14:00', checkOutTime: '11:00', breakfastStartTime: '08:00', breakfastEndTime: '10:00', features: [], policyNote: '', paymentNote: '', languages: ['Türkçe', 'English'] };
    let rooms = [
      { id: 'room_design_101', name: 'Smoke Balkonlu Oda', number: '101', nightlyPriceMinor: 240000 },
      { id: 'room_design_102', name: 'Smoke Aile Odası', number: '102', nightlyPriceMinor: 320000 }
    ];
    let updateStatus = {
      phase: 'idle',
      message: 'Güncelleme sistemi hazır.',
      currentVersion: '0.1.2',
      latestVersion: '0.1.2',
      progressPercent: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      lastCheckedAt: '',
      defaultBaseUrl: 'https://updates.example.test/stable',
      effectiveBaseUrl: 'https://updates.example.test/stable',
      customBaseUrl: '',
      autoCheckEnabled: true,
      notes: [],
      installSupported: false,
      pendingVersion: ''
    };
    window.__designCalls = [];
    window.yardimciDesktop = {
      getBootstrapData: async () => ({ appName: 'Yardımcı Asistan', version: '0.1.2', platform: 'linux', setup, databasePath: dashboard.databasePath, backupPath: dashboard.backupPath, syncSettings: { webModuleUrl: setup.webModuleUrl, hasSyncSecret: true } }),
      getSetupData: async () => setup,
      getDashboardData: async () => dashboard,
      getBusinessCapabilitySnapshot: async () => ({ businessId: 'design-fixture', profileId: setup.profileId, enabledCapabilities, capabilities: enabledCapabilities.map(capability => ({ capability, enabled: true, source: 'profile' })) }),
      getBusinessPublicProfile: async () => profile,
      saveBusinessPublicProfile: async input => { profile = input; window.__designCalls.push({ kind: 'public', input }); return { ok: true, message: 'Bilgiler kaydedildi.', profile }; },
      getRoomFolioData: async () => ({ rooms, activeStays: [], folios: [], menuCategories: [], menuItems: [] }),
      setRoomNightlyPrice: async input => {
        rooms = rooms.map(room => room.id === input.roomId ? { ...room, name: input.name, nightlyPriceMinor: input.amountMinor } : room);
        window.__designCalls.push({ kind: 'room', input });
        return { ok: true, message: 'Oda bilgileri kaydedildi.' };
      },
      listLocalBackups: async () => ({ ok: true, backups: [{ id: 'design-backup', createdAt: '2026-09-13T09:00:00Z', kind: 'manual', sizeBytes: 2048000, imageCount: 3 }] }),
      updateAppPassword: async input => { window.__designCalls.push({ kind: 'password', input }); return { ok: true, message: 'Şifre kaydedildi.', status: { passwordConfigured: true } }; },
      getUpdateStatus: async () => updateStatus,
      saveUpdatePreferences: async input => {
        updateStatus = {
          ...updateStatus,
          customBaseUrl: input.customBaseUrl,
          effectiveBaseUrl: input.customBaseUrl || updateStatus.defaultBaseUrl,
          autoCheckEnabled: input.autoCheckEnabled,
          message: 'Güncelleme ayarları kaydedildi.'
        };
        window.__designCalls.push({ kind: 'update', input });
        return { ok: true, message: 'Güncelleme ayarları kaydedildi.', status: updateStatus };
      },
      onUpdateStatusChanged: () => () => {},
      saveInitialSetup: async input => {
        Object.assign(setup, {
          businessName: input.businessName,
          profileId: input.profileId,
          phone: input.phone,
          whatsapp: input.whatsapp,
          email: input.email,
          address: input.address,
          initialCounts: input.initialCounts,
          setupRequired: false
        });
        window.__designCalls.push({ kind: 'setup', input });
        return { ok: true, message: 'Ayarlar kaydedildi.', setupData: { ...setup }, dashboardData: dashboard };
      },
      getCurrentDiagnosticSession: async () => ({
        version: 1,
        sessionId: '20260922T010000000Z-design',
        startedAt: '2026-09-22T01:00:00.000Z',
        appVersion: '0.1.7',
        electronVersion: '43.1.1',
        nodeVersion: '24.18.0',
        platform: 'linux',
        arch: 'x64',
        packaged: false,
        eventCount: 3,
        warnCount: 1,
        errorCount: 1,
        current: true,
        totalBytes: 2048
      }),
      listDiagnosticSessions: async () => [{
        version: 1,
        sessionId: '20260922T010000000Z-design',
        startedAt: '2026-09-22T01:00:00.000Z',
        appVersion: '0.1.7',
        electronVersion: '43.1.1',
        nodeVersion: '24.18.0',
        platform: 'linux',
        arch: 'x64',
        packaged: false,
        eventCount: 3,
        warnCount: 1,
        errorCount: 1,
        current: true,
        totalBytes: 2048
      }],
      readDiagnosticSession: async () => ({
        session: {
          version: 1,
          sessionId: '20260922T010000000Z-design',
          startedAt: '2026-09-22T01:00:00.000Z',
          appVersion: '0.1.7',
          electronVersion: '43.1.1',
          nodeVersion: '24.18.0',
          platform: 'linux',
          arch: 'x64',
          packaged: false,
          eventCount: 3,
          warnCount: 1,
          errorCount: 1,
          current: true,
          totalBytes: 2048
        },
        events: [
          { timestamp: '2026-09-22T01:00:01.000Z', sequence: 1, level: 'INFO', process: 'main', scope: 'startup', event: 'app.session.started', message: 'Tanılama başladı.' },
          { timestamp: '2026-09-22T01:00:02.000Z', sequence: 2, level: 'WARN', process: 'main', scope: 'sync', event: 'sync.retry', message: 'Eşitleme yeniden denenecek.' },
          { timestamp: '2026-09-22T01:00:03.000Z', sequence: 3, level: 'ERROR', process: 'renderer', scope: 'market', event: 'market.failed', message: 'Smoke hata kaydı.', error: { name: 'Error', message: 'Smoke hatası' } }
        ],
        hasMore: false
      }),
      writeDiagnosticEvent: async () => null,
      testWebConnection: async () => ({ ok: true, message: 'Bağlantı başarılı.' }),
      testAiConnection: async input => {
        window.__designCalls.push({ kind: 'ai-test', input });
        return {
          ok: true,
          message: 'Google AI Studio bağlantısı çalışıyor.',
          model: 'gemini-3.8-flash',
          models: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }]
        };
      },
      getSyncStatus: async () => ({ enabled: false, phase: 'idle', pendingJobs: 0, consecutiveFailures: 0, message: '', lastError: '' }),
      onSyncStatusChanged: () => () => {},
      onAppLockStateChanged: () => () => {},
      openExternal: async () => true
    };
  }, { setup: { ...createSetupFixture(), setupRequired: false }, dashboard: createDashboardFixture() });
  await page.goto(baseUrl);
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await expect(page.getByLabel('Giriş saati')).toHaveValue('14:00');
  const birthdaySettings = page.locator('.setup-birthday-settings');
  await expect(birthdaySettings.getByRole('heading', { name: 'Doğum Günü Mesajları', exact: true })).toBeVisible();
  await expect(birthdaySettings.getByLabel('Doğum günü mesajlarını kullan')).toBeChecked();
  await expect(birthdaySettings.getByLabel('Gönderim saati')).toHaveValue('10:00');
  await expect(birthdaySettings.getByLabel('Manuel')).toBeChecked();
  await expect(birthdaySettings.getByRole('textbox', { name: 'Mesaj {ad} ve {işletme} yer' })).toHaveValue('Doğum gününüz kutlu olsun {ad}! 🎉 {işletme} olarak sağlıklı ve güzel bir yıl dileriz.');

  const sectorType = page.getByLabel('Sektör tipi');
  await sectorType.selectOption('market');
  await expect(page.getByText('Sunulan özellikler', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Giriş saati')).toHaveCount(0);
  await expect(page.getByLabel('Kahvaltı başlangıcı')).toHaveCount(0);
  await expect(page.getByLabel('Ulaşım tarifi')).toBeVisible();
  await expect(page.getByLabel('Genel politika notu')).toBeVisible();
  await expect(page.getByLabel('Genel politika notu')).toHaveAttribute('placeholder', /İade\/değişim/);
  await expect(page.getByLabel('Ödeme notu')).toBeVisible();
  await expect(page.getByLabel('Konuşulan diller')).toBeVisible();

  await sectorType.selectOption('restaurant');
  await expect(page.getByText('Sunulan özellikler', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Wi-Fi')).toBeVisible();
  await expect(page.getByLabel('Bagaj emaneti')).toHaveCount(0);
  await expect(page.getByLabel('Havalimanı transferi')).toHaveCount(0);
  await expect(page.getByLabel('Giriş saati')).toHaveCount(0);
  await expect(page.getByLabel('Kahvaltı başlangıcı')).toHaveCount(0);

  await sectorType.selectOption('pension_restaurant');
  await expect(page.getByLabel('Giriş saati')).toHaveValue('14:00');
  await expect(page.getByLabel('Bagaj emaneti')).toBeVisible();
  await expect(page.getByLabel('Havalimanı transferi')).toBeVisible();
  await expect(page.getByLabel('Kahvaltı başlangıcı')).toBeVisible();

  const observations = [];
  await expect(page.getByLabel('Telefon', { exact: true })).toHaveValue('');
  for (const [width, height] of [[1440,1000],[1366,768],[1024,768],[900,768],[760,768],[600,800]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.content').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ animations: "disabled", path: `${output}/settings-${width}-top.png` });
    const metrics = await page.evaluate(() => {
      const box = selector => { const e = document.querySelector(selector); const b = e.getBoundingClientRect(); return { width: b.width, height: b.height }; };
      const overflows = [...document.querySelectorAll('.content, .setup-capabilities, .setup-section, .form-grid, .form-row')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className);
      return { overflows, documentOverflow: document.documentElement.scrollWidth > innerWidth + 1, phone: box('.settings-identity-section .form-field--short input'), time: box('#settings-connections input[type="time"]'), map: box('.business-location-map-viewport'), button: box('.page-header-tools button'), timeRows: new Set([...document.querySelectorAll('#settings-connections input[type="time"]')].map(el => Math.round(el.getBoundingClientRect().top))).size };
    });
    observations.push({ width, height, ...metrics });
    expect(metrics.documentOverflow, `Document overflow at ${width}`).toBe(false);
    expect(metrics.overflows, `Content overflow at ${width}`).toEqual([]);
    if (width > 760) expect(metrics.timeRows, `Four time controls share a row at ${width}`).toBe(1);
    const nav = page.getByRole('navigation', { name: 'Ayar bölümleri' });
    for (const [name, id] of [['İşletme','business'],['İşletme düzeni','operations'],['Servisler','connections'],['Uygulama','application']]) {
      await nav.getByRole('link', { name, exact: true }).click();
      const section = page.locator(`#settings-${id}`);
      await expect(section).toBeInViewport();
      if (width > 760) {
        const visibleHeading = section.locator('h2').first();
        const [headBox, navBox] = await Promise.all([visibleHeading.boundingBox(), nav.boundingBox()]);
        expect(headBox.y, `${name} obscured by nav at ${width}`).toBeGreaterThanOrEqual(navBox.y + navBox.height);
      }
      if (['connections','application','capabilities'].includes(id)) await page.screenshot({ animations: "disabled", path: `${output}/settings-${width}-${id}.png` });
    }
  }
  await page.locator('.business-location-map-viewport').scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled", path: `${output}/settings-map.png` });
  await page.getByLabel('Enlem', { exact: true }).fill('37.06');
  await page.getByLabel('Boylam', { exact: true }).fill('28.33');
  // Test actual form semantics and unchanged bridge payloads.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Uygulama loglarını aç', exact: true }).click();
  const diagnosticsDialog = page.getByRole('dialog', { name: 'Uygulama Logları' });
  await expect(diagnosticsDialog).toBeVisible();
  await expect(diagnosticsDialog.getByText('market.failed', { exact: true })).toBeVisible();
  await expect(diagnosticsDialog.getByText('Smoke hata kaydı.', { exact: true })).toBeVisible();
  await diagnosticsDialog.getByRole('button', { name: 'INFO', exact: true }).click();
  await expect(diagnosticsDialog.getByText('app.session.started', { exact: true })).toHaveCount(0);
  await diagnosticsDialog.getByRole('button', { name: 'Log görünümünü kapat' }).click();
  await expect(diagnosticsDialog).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Ayarları Kaydet', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Güncelleme Ayarlarını Kaydet', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bilgileri Kaydet', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Oda Bilgilerini Kaydet', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Şifreyi (Belirle|Değiştir)/, exact: true })).toHaveCount(0);
  await page.getByLabel('İşletme açıklaması').fill('Güncellenen açıklama');
  await page.getByLabel('Firma adı', { exact: true }).fill('Güncellenen Smoke İşletmesi');
  await birthdaySettings.getByLabel('Gönderim saati').fill('09:30');
  await birthdaySettings.getByRole('textbox', { name: 'Mesaj {ad} ve {işletme} yer' }).fill('İyi ki doğdun {ad}! {işletme}');
  await page.getByLabel('Oda 101 adı', { exact: true }).fill('Güncellenen Oda');
  await page.getByLabel('Oda 101 gecelik fiyatı', { exact: true }).fill('2750');
  await page.getByLabel('Şifre belirleyin', { exact: true }).fill('design-test-password');
  await page.getByLabel('Yeni şifre tekrar', { exact: true }).fill('design-test-password');
  await page.getByRole('textbox', { name: /Güncelleme sunucusu/ }).fill('https://updates.example.test/custom');
  await page.getByRole('button', { name: 'Ayarları Kaydet', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__designCalls.find(c => c.kind === 'public')?.input.description)).toBe('Güncellenen açıklama');
  expect(await page.evaluate(() => window.__designCalls.find(c => c.kind === 'public').input.latitude)).toBe(37.06);
  expect(await page.evaluate(() => window.__designCalls.find(c => c.kind === 'setup').input.birthdaySettings)).toEqual({
    enabled: true,
    mode: 'manual',
    sendTime: '09:30',
    messageTemplate: 'İyi ki doğdun {ad}! {işletme}'
  });
  await expect.poll(() => page.evaluate(() => window.__designCalls.find(c => c.kind === 'room')?.input.name)).toBe('Güncellenen Oda');
  await expect.poll(() => page.evaluate(() => window.__designCalls.find(c => c.kind === 'setup')?.input.businessName)).toBe('Güncellenen Smoke İşletmesi');
  const saveOrder = await page.evaluate(() => window.__designCalls.map(call => call.kind));
  expect(saveOrder.slice(0, 2)).toEqual(['setup', 'public']);
  expect(saveOrder.at(-1)).toBe('password');
  expect(saveOrder.filter(kind => kind === 'room').length).toBe(2);
  expect(saveOrder.filter(kind => kind === 'update').length).toBe(1);
  expect(await page.evaluate(() => window.__designCalls.find(call => call.kind === 'update')?.input)).toEqual({
    customBaseUrl: 'https://updates.example.test/custom',
    autoCheckEnabled: true
  });
  await expect(page.getByText('Şifre kaydedildi.', { exact: true })).toBeVisible();
  await expect(page.getByText('Ayarlar kaydedildi.', { exact: true })).toBeVisible();
  const callCountAfterSave = await page.evaluate(() => window.__designCalls.length);
  await page.getByRole('button', { name: 'Ayarları Kaydet', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__designCalls.length)).toBe(callCountAfterSave);

  await page.getByLabel('Enlem', { exact: true }).fill('91');
  await page.getByRole('button', { name: 'Ayarları Kaydet', exact: true }).click();
  await expect(page.getByText(/Müşteri bilgileri:/, { exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.__designCalls.length)).toBe(callCountAfterSave);
  await page.getByLabel('Enlem', { exact: true }).fill('37.06');

  await page.getByLabel('Oda 101 gecelik fiyatı', { exact: true }).fill('-1');
  await page.getByRole('button', { name: 'Ayarları Kaydet', exact: true }).click();
  await expect(page.getByText(/Oda yönetimi:/, { exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.__designCalls.length)).toBe(callCountAfterSave);
  await page.getByLabel('Oda 101 gecelik fiyatı', { exact: true }).fill('2750');

  await page.getByLabel('Mevcut şifre', { exact: true }).fill('design-test-password');
  await page.getByLabel('Yeni şifre', { exact: true }).fill('short');
  await page.getByLabel('Yeni şifre tekrar', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Ayarları Kaydet', exact: true }).click();
  await expect(page.getByText(/Uygulama şifresi:/, { exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.__designCalls.length)).toBe(callCountAfterSave);

  await page.getByLabel('Servis sağlayıcı').selectOption('gemini');
  const googleCredential = page.getByLabel('Google AI Studio API anahtarı veya cURL');
  const aiTestCallCountBeforePlaceholder = await page.evaluate(() => window.__designCalls.filter(call => call.kind === 'ai-test').length);
  await googleCredential.fill('curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent" -H "x-goog-api-key: $GEMINI_API_KEY"');
  await page.getByRole('button', { name: 'Bağlantıyı Dene', exact: true }).click();
  await expect(page.getByText(/yer tutucu içeriyor/i)).toBeVisible();
  expect(await page.evaluate(() => window.__designCalls.filter(call => call.kind === 'ai-test').length)).toBe(aiTestCallCountBeforePlaceholder);

  await googleCredential.fill('auth-key-smoke-1234567890');
  await page.getByRole('button', { name: 'Bağlantıyı Dene', exact: true }).click();
  await expect(page.getByText('Google AI Studio bağlantısı çalışıyor.', { exact: true })).toBeVisible();
  const aiTestInput = await page.evaluate(() => window.__designCalls.findLast(call => call.kind === 'ai-test')?.input);
  expect(aiTestInput.apiKey).toBe('auth-key-smoke-1234567890');
  expect(aiTestInput.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta');
  expect(aiTestInput.model).toBe('');
  for (const scheme of ['light','dark']) {
    await page.getByRole('radio', { name: 'Kompakt', exact: true }).click();
    await page.getByRole('radio', { name: scheme === 'dark' ? 'Koyu' : 'Açık', exact: true }).click();
    await page.locator('.content').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ animations: "disabled", path: `${output}/settings-compact-${scheme}.png` });
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
