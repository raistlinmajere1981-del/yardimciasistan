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
    localStorage.setItem('yardimci-asistan.ui-preferences', JSON.stringify({ version: 2, scheme: 'light', density: 'comfortable', scale: 1, accent: 'coral', font: 'plex', motion: 'system' }));
    const enabledCapabilities = ['core.customers','core.requests','core.business_profile','accommodation.rooms','accommodation.reservations','food_service.tables','food_service.menu','food_service.orders','service.whatsapp','service.android','service.ai'];
    let profile = { description: 'Akyaka’da aile işletmesi pansiyon ve kafe.', latitude: 37.05, longitude: 28.32, directionsNote: '', checkInTime: '14:00', checkOutTime: '11:00', breakfastStartTime: '08:00', breakfastEndTime: '10:00', features: [], policyNote: '', paymentNote: '', languages: ['Türkçe', 'English'], socialLinks: [] };
    let rooms = [
      { id: 'room_design_101', name: 'Smoke Balkonlu Oda', number: '101', capacity: 2, bedInfo: '1 çift kişilik yatak', floor: '1', features: [], description: '', priceNote: '', nightlyPriceMinor: 240000, currency: 'TRY', sortOrder: 1, outOfService: false, canRemove: true, removeBlockReason: '' },
      { id: 'room_design_102', name: 'Smoke Aile Odası', number: '102', capacity: 4, bedInfo: '1 çift + 2 tek kişilik yatak', floor: '1', features: [], description: '', priceNote: '', nightlyPriceMinor: 320000, currency: 'TRY', sortOrder: 2, outOfService: false, canRemove: true, removeBlockReason: '' }
    ];
    let businessLayout = {
      capabilities: { rooms: true, tables: true },
      rooms,
      tables: dashboard.tables.map((table, index) => ({
        id: table.id,
        name: table.name,
        area: table.area || 'Genel',
        capacity: table.capacity ?? 4,
        description: '',
        features: [],
        smokingPolicy: 'unspecified',
        sortOrder: index + 1
      })),
      publication: { rooms: false, tables: false },
      tableCategories: [...new Set(dashboard.tables.map(table => table.area || 'Genel'))].map(name => ({
        name,
        tableCount: dashboard.tables.filter(table => (table.area || 'Genel') === name).length
      }))
    };
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
      getBusinessLayout: async () => structuredClone(businessLayout),
      getKbsSettings: async () => ({ enabled: false, provider: "egm", facilityCode: "", username: "", authorizedIdentityNumber: "", passwordConfigured: false }),
      saveKbsSettings: async (input) => ({ ok: true, message: "KBS ayarları kaydedildi.", settings: { enabled: input.enabled, provider: input.provider, facilityCode: input.facilityCode, username: input.username, authorizedIdentityNumber: input.authorizedIdentityNumber, passwordConfigured: Boolean(input.password) } }),
      testKbsConnection: async () => ({ ok: false, message: "Smoke modunda KBS bağlantısı denenemez." }),
      inspectEgmKbsSession: async () => ({ ok: false, message: "Smoke modunda EGM oturumu yok." }),
      prepareEgmKbsLogin: async () => ({ ok: false, message: "Smoke modunda EGM girişi hazırlanamaz." }),
      listRoomMedia: async () => [],
      addRoomMedia: async () => ({ ok: true, message: 'Medya eklendi.', media: [] }),
      updateRoomMedia: async () => ({ ok: true, message: 'Medya güncellendi.', media: [] }),
      deleteRoomMedia: async () => ({ ok: true, message: 'Medya kaldırıldı.', media: [] }),
      saveBusinessLayout: async input => {
        if (input.rooms) {
          rooms = input.rooms.map((room, index) => ({
            id: room.id || `room_design_new_${index + 1}`,
            name: room.name,
            number: room.number,
            capacity: room.capacity,
            bedInfo: room.bedInfo,
            floor: room.floor,
            features: [...room.features],
            description: room.description,
            priceNote: room.priceNote,
            nightlyPriceMinor: room.nightlyPriceMinor,
            currency: room.currency,
            sortOrder: index + 1,
            outOfService: room.outOfService === true,
            canRemove: true,
            removeBlockReason: ''
          }));
        }
        businessLayout = {
          ...businessLayout,
          rooms,
          tableCategories: input.tableCategories
            ? input.tableCategories.map(({ name, tableCount }) => ({ name, tableCount }))
            : businessLayout.tableCategories
        };
        window.__designCalls.push({ kind: 'layout', input });
        return { ok: true, message: 'İşletme düzeni kaydedildi.', layout: structuredClone(businessLayout) };
      },
      getRoomFolioData: async () => ({ rooms, activeStays: [], folios: [], menuCategories: [], menuItems: [] }),
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
  }, { setup: { ...createSetupFixture(), setupRequired: false, businessName: "Smoke İşletmesi", syncSecret: "design-fixture-secret", whatsapp: "+905550000000" }, dashboard: createDashboardFixture() });
  await page.goto(baseUrl);
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Giriş saati', exact: true })).toHaveAttribute('data-picker-value', '14:00');
  await page.getByRole("tab", { name: "Servisler", exact: true }).click();
  const birthdaySettings = page.locator('.setup-birthday-settings');
  await expect(birthdaySettings.getByRole('heading', { name: 'Doğum Günü Mesajları', exact: true })).toBeVisible();
  await expect(birthdaySettings.getByLabel('Doğum günü mesajlarını kullan')).toBeChecked();
  await expect(birthdaySettings.getByRole('textbox', { name: 'Mesaj {ad} ve {işletme} yer tutucuları desteklenir.' })).toHaveValue('Doğum gününüz kutlu olsun {ad}! 🎉 {işletme} olarak sağlıklı ve güzel bir yıl dileriz.');

  await page.getByRole("tab", { name: "İşletme", exact: true }).click();
  const sectorType = page.getByLabel('Sektör tipi');
  await sectorType.selectOption('market');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kaydet', exact: true })).toBeDisabled();
  await expect(page.getByText('Sunulan özellikler', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Giriş saati')).toHaveCount(0);
  await expect(page.getByLabel('Kahvaltı başlangıcı')).toHaveCount(0);
  await expect(page.getByLabel('Ulaşım tarifi')).toBeVisible();
  await expect(page.getByLabel('Genel politika notu')).toBeVisible();
  await expect(page.getByLabel('Genel politika notu')).toHaveAttribute('placeholder', /İade\/değişim/);
  await expect(page.getByLabel('Ödeme notu')).toBeVisible();
  await expect(page.getByLabel('Konuşulan diller')).toBeVisible();

  await sectorType.selectOption('restaurant');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kaydet', exact: true })).toBeDisabled();
  await expect(page.getByText('Sunulan özellikler', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Wi-Fi')).toBeVisible();
  await expect(page.getByLabel('Bagaj emaneti')).toHaveCount(0);
  await expect(page.getByLabel('Havalimanı transferi')).toHaveCount(0);
  await expect(page.getByLabel('Giriş saati')).toHaveCount(0);
  await expect(page.getByLabel('Kahvaltı başlangıcı')).toHaveCount(0);

  await sectorType.selectOption('pension_restaurant');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kaydet', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Giriş saati', exact: true })).toHaveAttribute('data-picker-value', '14:00');
  await expect(page.getByLabel('Bagaj emaneti')).toBeVisible();
  await expect(page.getByLabel('Havalimanı transferi')).toBeVisible();
  await expect(page.getByLabel('Kahvaltı başlangıcı')).toBeVisible();

  const observations = [];
  await expect(page.getByLabel('Telefon', { exact: true })).toHaveValue('');
  for (const [width, height] of [[1440,1000],[1366,768],[1024,768],[900,768],[760,768],[600,800]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    for (const name of ['İşletme', 'İşletme Düzeni', 'Servisler', 'Uygulama']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(page.getByRole('tabpanel')).toHaveCount(1);
      const metrics = await page.evaluate(() => ({
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1,
        overflows: [...document.querySelectorAll('.content, .setup-capabilities, .settings-category-body, .setup-section, .form-grid, .form-row')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className)
      }));
      observations.push({ width, height, category: name, ...metrics });
      expect(metrics.documentOverflow, `Document overflow at ${width}/${name}`).toBe(false);
      expect(metrics.overflows, `Content overflow at ${width}/${name}`).toEqual([]);
      await expect(page.getByRole('tablist')).toBeInViewport();
      await page.screenshot({ animations: 'disabled', path: `${output}/settings-${width}-${name}.png` });
    }
  }
  await page.getByRole('tab', { name: 'İşletme', exact: true }).click();
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
  await diagnosticsDialog.getByLabel('Ara', { exact: true }).fill('market.failed');
  await diagnosticsDialog.getByRole('button', { name: 'Çalışma alanını genişlet' }).click();
  await expect(diagnosticsDialog.getByLabel('Ara', { exact: true })).toHaveValue('market.failed');
  await diagnosticsDialog.getByRole('button', { name: 'Ortalanmış görünüme dön' }).click();
  await diagnosticsDialog.getByRole('button', { name: 'Log görünümünü kapat' }).click();
  await expect(page.getByRole('button', { name: 'Uygulama loglarını aç', exact: true })).toBeFocused();
  await expect(diagnosticsDialog).toHaveCount(0);

  // Staged resources now participate in their owning category save surface.
  await page.evaluate(() => { window.__designCalls = []; });
  await page.getByLabel('İşletme açıklaması').fill('Güncellenen açıklama');
  await page.getByLabel('Firma adı', { exact: true }).fill('Güncellenen Smoke İşletmesi');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  expect(await page.evaluate(() => window.__designCalls.map(c => c.kind))).toEqual(['setup', 'public']);
  await expect.poll(() => page.evaluate(() => window.__designCalls.find(c => c.kind === 'public')?.input.description)).toBe('Güncellenen açıklama');
  expect(await page.evaluate(() => window.__designCalls.find(c => c.kind === 'public').input.latitude)).toBe(37.06);

  await page.getByRole('tab', { name: 'Servisler', exact: true }).click();
  await birthdaySettings.getByRole('textbox', { name: 'Mesaj {ad} ve {işletme} yer tutucuları desteklenir.' }).fill('İyi ki doğdun {ad}! {işletme}');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  expect(await page.evaluate(() => window.__designCalls.filter(c => c.kind === 'setup').at(-1).input.birthdaySettings)).toEqual({
    enabled: true, mode: 'manual', sendTime: '10:00', messageTemplate: 'İyi ki doğdun {ad}! {işletme}'
  });

  await page.getByRole('tab', { name: 'İşletme Düzeni', exact: true }).click();
  const designRoomRows = page.locator('.room-management-row');
  await expect(designRoomRows).toHaveCount(2);
  await designRoomRows.first().getByRole('button', { name: 'Detaylar', exact: true }).click();
  const designRoomDialog = page.getByRole('dialog', { name: 'Oda bilgilerini düzenle' });
  await expect(designRoomDialog).toBeVisible();
  await designRoomDialog.getByLabel('Oda adı').fill('Güncellenen Oda');
  await designRoomDialog.getByLabel('Gecelik fiyat').fill('2750');
  await designRoomDialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(designRoomDialog).toHaveCount(0);
  await page.locator('.settings-category-actions').getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__designCalls.find(c => c.kind === 'layout')?.input.rooms?.[0]?.name)).toBe('Güncellenen Oda');
  await expect.poll(() => page.evaluate(() => window.__designCalls.find(c => c.kind === 'setup')?.input.businessName)).toBe('Güncellenen Smoke İşletmesi');

  await page.getByRole('tab', { name: 'Uygulama', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kaydet', exact: true })).toBeDisabled();
  await page.getByLabel('Şifre belirleyin', { exact: true }).fill('design-test-password');
  await page.getByLabel('Yeni şifre tekrar', { exact: true }).fill('design-test-password');
  await page.getByRole('textbox', { name: /Güncelleme sunucusu/ }).fill('https://updates.example.test/custom');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.getByRole('button', { name: 'Şifreyi Kaydet', exact: true }).click();
  const saveOrder = await page.evaluate(() => window.__designCalls.map(call => call.kind));
  expect(saveOrder.slice(0, 2)).toEqual(['setup', 'public']);
  expect(saveOrder.at(-1)).toBe('password');
  expect(saveOrder.filter(kind => kind === 'layout').length).toBe(1);
  expect(saveOrder.filter(kind => kind === 'update').length).toBe(1);
  expect(await page.evaluate(() => window.__designCalls.find(call => call.kind === 'update')?.input)).toEqual({ customBaseUrl: 'https://updates.example.test/custom', autoCheckEnabled: true });
  await expect(page.getByText('Şifre kaydedildi.', { exact: true })).toBeVisible();

  const callCountAfterSave = await page.evaluate(() => window.__designCalls.length);
  await page.getByRole('tab', { name: 'İşletme', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kaydet', exact: true })).toBeDisabled();
  await page.getByLabel('Enlem', { exact: true }).fill('91');
  await page.getByRole('tab', { name: 'Servisler', exact: true }).click();
  const sharedConfirm = page.getByRole('dialog', { name: /değişiklikleri bekliyor/ });
  const previousScheme = await page.evaluate(() => document.documentElement.dataset.colorScheme);
  const previousViewport = page.viewportSize();
  for (const scheme of ['dark', 'light']) {
    await page.evaluate(scheme => { document.documentElement.dataset.colorScheme = scheme; }, scheme);
    for (const width of [1366, 1024, 760, 360]) {
      await page.setViewportSize({ width, height: 768 });
      await expect(sharedConfirm).toBeVisible();
      const geometry = await sharedConfirm.evaluate(dialog => {
        const rect = dialog.getBoundingClientRect();
        const buttons = [...dialog.querySelectorAll('button')].map(button => button.getBoundingClientRect());
        const styles = getComputedStyle(dialog);
        return { fits: rect.left >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 && dialog.scrollWidth <= dialog.clientWidth + 1,
          rows: new Set(buttons.map(rect => Math.round(rect.top))).size,
          border: parseFloat(styles.borderTopWidth) > 0, shadow: styles.boxShadow !== 'none' };
      });
      expect(geometry.fits, `${scheme}/${width}`).toBe(true);
      expect(geometry.border && geometry.shadow).toBe(true);
      if (width >= 760) expect(geometry.rows, `${scheme}/${width} actions`).toBe(1);
      await sharedConfirm.screenshot({ path: `${output}/confirm-${scheme}-${width}.png` });
    }
  }
  await page.evaluate(scheme => { document.documentElement.dataset.colorScheme = scheme; }, previousScheme);
  await page.setViewportSize(previousViewport);
  await sharedConfirm.getByRole('button', { name: 'Burada kal' }).click();

  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.locator('#settings-public-profile').getByRole('alert').first()).toBeVisible();
  expect(await page.evaluate(() => window.__designCalls.length)).toBe(callCountAfterSave);
  await page.getByRole('button', { name: 'Değişiklikleri Geri Al', exact: true }).click();

  await page.getByRole('tab', { name: 'İşletme Düzeni', exact: true }).click();
  await designRoomRows.first().getByRole('button', { name: 'Detaylar', exact: true }).click();
  await expect(designRoomDialog).toBeVisible();
  const roomPriceInput = designRoomDialog.getByLabel('Gecelik fiyat', { exact: true });
  const roomPriceBefore = await roomPriceInput.inputValue();
  await roomPriceInput.fill('-1');
  // MoneyInput rejects the sign at keystroke level: the last valid value stays,
  // the draft remains clean, so save/discard stay disabled and nothing persists.
  await expect(roomPriceInput).toHaveValue(roomPriceBefore);
  await designRoomDialog.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await expect(designRoomDialog).toHaveCount(0);
  await expect(page.locator('.settings-category-actions').getByRole('button', { name: 'Kaydet', exact: true })).toBeDisabled();
  await expect(page.locator('.settings-category-actions').getByRole('button', { name: 'Değişiklikleri Geri Al', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.__designCalls.length)).toBe(callCountAfterSave);

  await page.getByRole('tab', { name: 'Uygulama', exact: true }).click();
  await page.getByLabel('Mevcut şifre', { exact: true }).fill('design-test-password');
  await page.getByLabel('Yeni şifre', { exact: true }).fill('short');
  await page.getByLabel('Yeni şifre tekrar', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Şifreyi Kaydet', exact: true }).click();
  await expect(page.locator('#settings-password').getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => window.__designCalls.length)).toBe(callCountAfterSave);
  await page.getByRole('tab', { name: 'Servisler', exact: true }).click();
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
  await page.getByRole('button', { name: 'Değişiklikleri Geri Al', exact: true }).click();
  await page.getByRole('tab', { name: 'Uygulama', exact: true }).click();
  for (const scheme of ['light','dark']) {
    await page.getByRole('radio', { name: 'Kompakt', exact: true }).click();
    await page.getByRole('radio', { name: scheme === 'dark' ? 'Koyu' : 'Açık', exact: true }).click();
    // Appearance is staged: apply through the category save so captures show the applied theme.
    await page.locator('.settings-category-actions').getByRole('button', { name: 'Kaydet', exact: true }).click();
    await page.locator('.content').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ animations: "disabled", path: `${output}/settings-compact-${scheme}.png` });
  }
  // Focus ring remains visible with keyboard navigation.
  await page.getByRole('tablist', { name: 'Ayar kategorileri' }).getByRole('tab').first().focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
  // Simulate an app-level lock request while the native modal makes shell controls inert.
  await page.getByRole('button', { name: 'Uygulama loglarını aç', exact: true }).click();
  await page.locator('.app-lock-trigger').evaluate(button => button.click());
  await expect(page.getByRole('dialog', { name: 'Yardımcı Asistan kilit ekranı' })).toBeVisible();
  await expect(diagnosticsDialog).toHaveCount(0);
  expect(errors).toEqual([]);
  writeFileSync(`${output}/viewports.json`, JSON.stringify(observations, null, 2));
  console.log('desktop-design-system-smoke-ok', JSON.stringify(observations));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
