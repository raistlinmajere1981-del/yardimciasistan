import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { getLocalViteExecutable } from './test-helpers/local-vite.mjs';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { chooseDate } from './test-helpers/date-time-picker.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createSetupFixture, createReportFixture, createCompactUiFixture } from './lib/desktop-renderer-fixtures.mjs';

import { BUSINESS_CAPABILITIES } from '@yardimci-asistan/shared';

const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(getLocalViteExecutable(), ['--config', 'vite.renderer.config.ts', '--host', '127.0.0.1', '--port', String(port)], { cwd: 'apps/desktop-app', stdio: 'ignore' });
const output = `artifacts/design-system/stage2a/${process.env.VISUAL_PASS || 'final'}`;
mkdirSync(output, { recursive: true });
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(baseUrl)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ locale: "tr-TR" });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Stable local tiles: the visual test does not depend on OSM/network availability.
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edece6"/><path d="M0 40L256 200M40 0L180 256" stroke="#fff" stroke-width="10"/></svg>' }));
  await page.addInitScript(({ setup, dashboard, report, allCapabilities }) => {
    localStorage.setItem('yardimci-asistan.ui-preferences', JSON.stringify({ version: 2, scheme: 'light', density: 'comfortable', scale: 1, accent: 'coral', font: 'plex', motion: 'system' }));
    const enabledCapabilities = allCapabilities;
    let profile = { description: 'Akyaka’da aile işletmesi pansiyon ve kafe.', latitude: 37.05, longitude: 28.32, directionsNote: '', checkInTime: '14:00', checkOutTime: '11:00', breakfastStartTime: '08:00', breakfastEndTime: '10:00', features: [], policyNote: '', paymentNote: '', languages: ['Türkçe', 'English'], socialLinks: [] };
    window.__designCalls = [];
    dashboard.customers = dashboard.customers.map(customer => ({ identityType: "", identityNumber: "", nationality: "", birthDate: "", gender: "", documentSerialNumber: "", documentExpiryDate: "", birthPlace: "", motherName: "", fatherName: "", issuingAuthority: "", address: "", stayCount: 0, ...customer }));
    dashboard.rooms[0].status = 'occupied';
    for (const [index, status] of ['available', 'maintenance', 'out_of_service'].entries()) dashboard.rooms.push({ ...dashboard.rooms[0], id: `stage2-room-${index}`, name: `Ek Oda ${index + 1}`, number: String(105 + index), status });
    const stay = { id: 'stage2-stay', customerId: dashboard.customers[0].id, customerName: dashboard.customers[0].fullName, customerPhone: dashboard.customers[0].phone, roomId: dashboard.rooms[0].id, roomName: dashboard.rooms[0].name, roomNumber: '101', reservationId: '', status: 'checked_in', checkInDate: '2026-09-14', checkOutDate: '2026-09-16', guestCount: 2, nightlyPriceMinor: 150000, currency: 'TRY', folioId: 'stage2-folio', notes: 'Geç giriş, kahvaltı dahil.', createdAt: '2026-09-14T09:00:00Z', updatedAt: '2026-09-14T09:00:00Z' };
    dashboard.customerRoomStays = [stay];
    if (localStorage.getItem("stage2a.empty-tasks")) dashboard.dailyTasks = [];
    const folio = { id: 'stage2-folio', stayId: stay.id, roomId: stay.roomId, roomName: stay.roomName, roomNumber: '101', customerId: stay.customerId, customerName: stay.customerName, reservationId: '', status: 'open', guestCount: 2, checkInDate: stay.checkInDate, plannedCheckOutDate: stay.checkOutDate, nights: 2, nightlyPriceMinor: 150000, currency: 'TRY', lodgingTotalMinor: 300000, lodgingManualOverride: false, extrasTotalMinor: 0, chargeTotalMinor: 300000, paidTotalMinor: 50000, remainingMinor: 250000, creditMinor: 0, openedAt: stay.createdAt, closedAt: '', note: '', items: [], payments: [{ id: 'stage2-payment', amountMinor: 50000, paymentMethod: 'cash', paidAt: stay.createdAt, origin: 'direct' }] };
    const folioData = { generatedAt: stay.createdAt, rooms: dashboard.rooms.map(room => ({ ...room, nightlyPriceMinor: 150000, currency: 'TRY' })), activeStays: [stay], folios: [folio], menuCategories: [{ id: 'tea', name: 'İçecekler' }], menuItems: [{ id: 'tea-item', categoryId: 'tea', categoryName: 'İçecekler', name: 'Çay', description: '', priceMinor: 5000, currency: 'TRY', stockQuantity: null, stockConsumptionQuantity: 1, stockUnit: 'adet' }] };
    let businessLayout = {
      capabilities: { rooms: true, tables: true },
      rooms: dashboard.rooms.map((room, index) => ({
        id: room.id,
        name: room.name,
        number: room.number ?? "",
        capacity: room.capacity ?? 2,
        bedInfo: room.bedInfo ?? "",
        floor: room.floor ?? "",
        features: room.features ?? [],
        description: room.description ?? "",
        priceNote: room.priceNote ?? "",
        nightlyPriceMinor: 150000,
        currency: "TRY",
        sortOrder: index + 1,
        outOfService: room.status === "out_of_service",
        canRemove: room.status !== "occupied" && room.status !== "reserved",
        removeBlockReason: room.status === "occupied" || room.status === "reserved" ? "Oda durumu aktif kullanım gösteriyor." : ""
      })),
      tableCategories: [...new Set(dashboard.tables.map(table => table.area || "Genel"))].map(name => ({
        name,
        tableCount: dashboard.tables.filter(table => (table.area || "Genel") === name).length
      }))
    };
    const record = (kind, input) => { window.__designCalls.push({ kind, input }); return { ok: true, message: 'Kaydedildi.', dashboardData: dashboard, savedId: input.id || 'stage2-customer' }; };
    window.yardimciDesktop = {
      getBootstrapData: async () => ({ appName: 'Yardımcı Asistan', version: '0.1.2', platform: 'linux', setup, databasePath: dashboard.databasePath, backupPath: dashboard.backupPath, syncSettings: { webModuleUrl: setup.webModuleUrl, hasSyncSecret: true } }),
      commerce: { listProducts: async () => [], listCategories: async () => [], getCustomerCreditAccount: async id => ({ customer: { ...dashboard.customers.find(customer => customer.id === id), businessId: 'fixture', deletedAt: '' }, balances: [{ currency: 'TRY', amountMinor: 45000 }], entries: [] }) },
      deleteCustomer: async id => { window.__designCalls.push({ kind: "delete-customer", input: id }); return { ok: false, message: "Aktif konaklaması olan müşteri silinemez." }; },
      saveCustomer: async input => {
        window.__designCalls.push({ kind: 'customer', input });
        const savedId = input.id || 'stage2-customer';
        const existing = dashboard.customers.find(customer => customer.id === savedId);
        const template = existing || dashboard.customers[0];
        const savedCustomer = {
          ...template,
          ...input,
          id: savedId,
          source: existing?.source || 'manual',
          requestCount: existing?.requestCount || 0,
          reservationCount: existing?.reservationCount || 0,
          stayCount: existing?.stayCount || 0,
          lastContactAt: existing?.lastContactAt || '',
          createdAt: existing?.createdAt || '2026-09-14T09:00:00Z',
          updatedAt: '2026-09-14T09:00:00Z'
        };
        dashboard.customers = existing
          ? dashboard.customers.map(customer => customer.id === savedId ? savedCustomer : customer)
          : [...dashboard.customers, savedCustomer];
        return { ok: true, message: 'Kaydedildi.', dashboardData: dashboard, savedId };
      },
      saveManualReservation: async input => record('reservation', input),
      assignCustomerRoom: async input => record('assignment', input),
      saveRoomPublicDetails: async input => record('room', input),
      updateRoomStatus: async (id, status) => record('room-status', { id, status }),
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
      getBusinessLayout: async () => structuredClone(businessLayout),
      listRoomMedia: async () => [],
      addRoomMedia: async () => ({ ok: true, message: 'Medya eklendi.', media: [] }),
      updateRoomMedia: async () => ({ ok: true, message: 'Medya güncellendi.', media: [] }),
      deleteRoomMedia: async () => ({ ok: true, message: 'Medya kaldırıldı.', media: [] }),
      saveBusinessLayout: async input => {
        if (input.rooms) {
          businessLayout = {
            ...businessLayout,
            rooms: input.rooms.map((room, index) => ({
              id: room.id || `stage2-layout-room-${index + 1}`,
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
              removeBlockReason: ""
            }))
          };
        }
        if (input.tableCategories) {
          businessLayout = {
            ...businessLayout,
            tableCategories: input.tableCategories.map(({ name, tableCount }) => ({ name, tableCount }))
          };
        }
        window.__designCalls.push({ kind: "layout", input });
        return { ok: true, message: "İşletme düzeni kaydedildi.", layout: structuredClone(businessLayout) };
      },
      getRoomFolioData: async () => folioData,
      openRoomFolio: async () => ({ ok: true, message: 'Hesap açıldı.', data: folioData, folioId: folio.id }),
      updateRoomFolio: async input => { window.__designCalls.push({ kind: 'folio', input }); return { ok: true, message: 'Kaydedildi.', data: folioData, folioId: folio.id }; },
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
  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ animations: 'disabled', path: `${output}/${page.viewportSize().width}-${name}.png` });
    const metrics = await page.evaluate(() => {
      const content = document.querySelector('.content');
      const dialog = [...document.querySelectorAll('[aria-modal="true"]')].at(-1);
      const bounds = dialog?.getBoundingClientRect();
      return { documentOverflow: document.documentElement.scrollWidth > innerWidth + 1, contentOverflow: content.scrollWidth > content.clientWidth + 1,
        surfaces: [...document.querySelectorAll('.record-workspace, .card, .panel, .page-toolbar, .form-row, .drawer, .overlay-body')].filter(el => el.clientWidth && el.scrollWidth > el.clientWidth + 1).map(el => el.className),
        dialogOverflow: bounds ? bounds.left < 0 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1 : false };
    });
    observations.push({ width: page.viewportSize().width, name, ...metrics });
    writeFileSync(`${output}/viewports.json`, JSON.stringify(observations, null, 2));
    expect(metrics.documentOverflow, name).toBe(false);
    expect(metrics.contentOverflow, name).toBe(false);
    expect(metrics.dialogOverflow, name).toBe(false);
    expect(metrics.surfaces, name).toEqual([]);
  };
  const closeDialog = async () => {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const buttons = dialog.locator('button:visible:enabled');
    await buttons.first().focus();
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  };
  const closeHospitalityWorkspace = async () => {
    const workspace = page.locator('.workspace-page-frame');
    await expect(workspace).toBeVisible();
    await workspace.getByRole('button', { name: 'Çalışma alanını kapat', exact: true }).click();
    await expect(workspace).toHaveCount(0);
  };
  for (const [width, height] of [[1440,1000],[1366,768],[1024,768],[900,768],[600,800]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.sidebar').getByRole('button', { name: 'Müşteri İşleri', exact: true }).click();
    const customerViews = page.getByRole('navigation', { name: 'Müşteri işleri görünümü' });
    await expect(customerViews.getByRole('button')).toHaveCount(3);
    await customerViews.getByRole('button', { name: 'Talepler', exact: true }).click();
    await expect(page.locator('.request-filter-tabs').getByRole('tab')).toHaveCount(2);
    await capture('requests');
    await page.getByRole('button', { name: 'Elle Talep Ekle', exact: true }).click();
    await capture('request-editor');
    await closeDialog();
    await customerViews.getByRole('button', { name: 'Müşteriler', exact: true }).click();
    await capture('customers');
    await page.locator('.customer-record-row').first().click();
    const customerWorkspace = page.getByRole('dialog');
    await expect(customerWorkspace).toBeVisible();
    await capture('customer-workspace');
    const deleteCount = await page.evaluate(() => window.__designCalls.filter(c => c.kind === 'delete-customer').length);
    await customerWorkspace.getByRole('button', { name: 'Müşteriyi Sil' }).click();
    const deleteConfirm = page.getByRole('dialog', { name: 'Silme onayı' });
    await expect(deleteConfirm.locator('.action-button-danger')).toHaveText('Sil');
    await expect(deleteConfirm).toContainText('müşteri kaydı silinsin mi?');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__designCalls.filter(c => c.kind === 'delete-customer').length)).toBe(deleteCount);
    await customerWorkspace.getByRole('button', { name: 'Müşteriyi Sil' }).click();
    await deleteConfirm.getByRole('button', { name: 'Sil', exact: true }).click();
    await expect(customerWorkspace.getByRole('alert')).toHaveText('Müşteri silinemedi. Yeniden deneyin.');
    await expect(page.getByText('Aktif konaklaması olan müşteri silinemez.', { exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => window.__designCalls.filter(c => c.kind === 'delete-customer').length)).toBe(deleteCount + 1);

    await customerWorkspace.getByRole('tab', { name: 'Bilgiler', exact: true }).click();
    await capture('customer-editor');
    const nameBounds = await customerWorkspace.getByLabel('Ad soyad', { exact: true }).boundingBox();
    const phoneBounds = await customerWorkspace.getByLabel('Telefon', { exact: true }).boundingBox();
    if (width > 760) expect(phoneBounds.width).toBeLessThan(nameBounds.width);
    else expect(Math.abs(phoneBounds.width - nameBounds.width)).toBeLessThan(2);
    await customerWorkspace.getByLabel('Adres', { exact: true }).scrollIntoViewIfNeeded();
    await capture('customer-identity');
    await customerWorkspace.getByRole('tab', { name: 'Hesap', exact: true }).click();
    await customerWorkspace.getByRole('button', { name: 'Tahsilat Al', exact: true }).click();
    await capture('customer-credit-form');
    await customerWorkspace.getByRole('form', { name: 'Tahsilat', exact: true }).getByLabel('Tutar', { exact: true }).fill('99999');
    await expect(customerWorkspace.getByRole('alert').filter({ hasText: 'Bu tutar mevcut borçtan büyük.' })).toBeVisible();
    await customerWorkspace.getByRole('form', { name: 'Tahsilat', exact: true }).getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await customerWorkspace.getByRole('tab', { name: 'Özet', exact: true }).click();
    await customerWorkspace.getByRole('button', { name: 'Konaklama Başlat', exact: true }).click();
    const roomAssignmentWorkspace = page.locator('.workspace-page-frame');
    await expect(roomAssignmentWorkspace).toBeVisible();
    await capture('room-assignment');
    await roomAssignmentWorkspace.getByRole('button', { name: 'Çalışma alanını kapat', exact: true }).click();
    await expect(roomAssignmentWorkspace).toHaveCount(0);
    await expect(page.getByLabel('Ara', { exact: true })).toBeVisible();
    await page.getByLabel('Ara', { exact: true }).fill('no-match-stage2a');
    await expect(page.getByText('Müşteri bulunamadı.', { exact: true })).toBeVisible();
    await capture('customers-empty');
    await page.getByLabel('Ara', { exact: true }).fill('');
    await customerViews.getByRole('button', { name: 'Talepler', exact: true }).click();
    await page.locator('.request-filter-tabs').getByRole('tab', { name: /Yanıt bekleyen · \d+/ }).click();
    await capture('waiting');
    await page.locator('.sidebar').getByRole('button', { name: 'Pansiyon', exact: true }).click();
    await page.locator('.content').evaluate(el => el.scrollTop = 0);
    await capture('pension');
  await page.getByRole('button', { name: 'Yeni Rezervasyon', exact: true }).click();
    await capture('reservation-editor');
    await page.getByRole('dialog').getByRole('button', { name: 'Yeni Müşteri Ekle', exact: true }).click();
    await capture('quick-customer');
    await closeDialog();
    const reservationRow = page.getByLabel('Rezervasyon listesi', { exact: true }).getByRole('article').first();
    await expect(reservationRow.locator('summary')).toHaveCount(0);
    await reservationRow.getByRole('button', { name: 'Düzenle', exact: true }).click();
    await capture('reservation-edit');
    await expect(page.getByRole('dialog').getByLabel('Giriş tarihi', { exact: true })).toBeDisabled();
    await closeDialog();
    await chooseDate(page.getByLabel('Rezervasyon yönetimi', { exact: true }), 'Tarih', '2030-01-01');
    await capture('reservations-empty');
    await page.getByRole('button', { name: 'Filtreyi Temizle', exact: true }).click();
    await page.getByRole('button', { name: 'Yeni İş', exact: true }).click();
    await capture('daily-task-editor');
    await closeDialog();
    await capture('rooms');
    const unavailableRoom = page.getByRole('button', { name: 'Ek Oda 3 odasını aç', exact: true });
    await expect(page.getByRole('article').filter({ has: unavailableRoom })).toContainText('Hizmet dışı');
    await expect(page.getByLabel('Oda yönetimi', { exact: true }).getByRole('combobox')).toHaveCount(0);
    await page.getByLabel('Oda yönetimi', { exact: true }).getByRole('button', { name: /odasını aç$/ }).first().click();
    const roomWorkspace = page.locator('.workspace-page-frame');
    await expect(roomWorkspace).toBeVisible();
    await capture('room-workspace');
    await expect(roomWorkspace.getByRole('region', { name: 'Misafir Hesabı', exact: true })).toBeVisible();
    await capture('folio-account');
    await expect(roomWorkspace.getByLabel('Ödeme tutarı', { exact: true })).toBeVisible();
    await capture('folio-payment');
    const checkoutButton = roomWorkspace.getByRole('region', { name: 'Günlük Oda İşlemleri', exact: true })
      .getByRole('button', { name: 'Misafir Çıkışı', exact: true });
    await checkoutButton.scrollIntoViewIfNeeded();
    await checkoutButton.click();
    const checkoutConfirmation = page.getByRole('dialog', { name: 'Misafir çıkışı', exact: true });
    await expect(checkoutConfirmation).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(checkoutConfirmation).toContainText('Çıkış tamamlanır');
    await capture('checkout-confirmation');
    await checkoutConfirmation.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await expect(checkoutConfirmation).toHaveCount(0);
    await closeHospitalityWorkspace();
    await page.locator('.sidebar').getByRole('button', { name: 'Ayarlar', exact: true }).click();
    await page.getByRole('tablist', { name: 'Ayar kategorileri' }).getByRole('tab', { name: 'İşletme Düzeni', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'İşletme Düzeni', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel('Oda adı ve fiyatları').getByRole('button', { name: 'Detaylar', exact: true }).first().click();
    await capture('room-editor');
    await closeDialog();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.sidebar').getByRole('button', { name: 'Müşteri İşleri', exact: true }).click();
  await page.getByRole('navigation', { name: 'Müşteri işleri görünümü' }).getByRole('button', { name: 'Müşteriler', exact: true }).click();
  await page.getByRole('button', { name: 'Yeni Müşteri', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Ad soyad', { exact: true }).fill('Migration Misafiri');
  await page.getByRole('dialog').getByLabel('Telefon', { exact: true }).fill('05321234567');
  await page.getByRole('button', { name: 'Müşteri Kartını Kaydet', exact: true }).click();
  const createdCustomerWorkspace = page.getByRole('dialog', { name: 'Migration Misafiri' });
  await expect(createdCustomerWorkspace).toBeVisible();
  const customerCall = await page.evaluate(() => window.__designCalls.find(call => call.kind === 'customer'));
  expect(customerCall.input.fullName).toBe('Migration Misafiri');
  expect(customerCall.input.phone).toBe('05321234567');
  await createdCustomerWorkspace.getByRole('button', { name: 'Çalışma alanını kapat', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Pansiyon', exact: true }).click();
  await page.getByRole('button', { name: 'Yeni Rezervasyon', exact: true }).click();
  await chooseDate(page.getByRole('dialog'), 'Giriş tarihi', '2026-10-01');
  await chooseDate(page.getByRole('dialog'), 'Çıkış tarihi', '2026-10-03');
  await page.getByRole('dialog').getByLabel('Kişi sayısı', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Rezervasyonu Kaydet', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const reservationCall = await page.evaluate(() => window.__designCalls.find(call => call.kind === 'reservation'));
  expect(reservationCall.input).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-03', guestCount: 2 });
  await page.evaluate(() => localStorage.setItem('stage2a.empty-tasks', 'true'));
  await page.reload();
  for (const name of ['Pansiyon', 'Restoran']) {
    await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    const tasks = page.getByLabel('Günlük işler', { exact: true });
    await expect(tasks.getByText('Günlük iş yok.', { exact: true })).toBeVisible();
    await expect(tasks.getByRole('button', { name: 'Yeni İş', exact: true })).toBeEnabled();
    await capture(`${name}-empty-tasks`);
  }
  await page.evaluate(() => localStorage.removeItem('stage2a.empty-tasks'));
  await page.reload();
  for (const [scheme, density] of [['light','compact'],['dark','compact'],['light','comfortable']]) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.locator('.sidebar').getByRole('button', { name: 'Ayarlar', exact: true }).click();
    await page.getByRole('tablist', { name: 'Ayar kategorileri' }).getByRole('tab', { name: 'Uygulama', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Uygulama', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('radio', { name: 'Kompakt', exact: true }).click();
    await page.getByRole('radio', { name: scheme === 'dark' ? 'Koyu' : 'Açık', exact: true }).click();
    if (density === 'comfortable') await page.getByRole('radio', { name: 'Rahat', exact: true }).click();
    for (const name of ['Müşteri İşleri', 'Pansiyon']) {
      await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
      await capture(`${name}-${scheme}-${density}`);
    }
  }
  expect(errors).toEqual([]);
  console.log('desktop-customer-pension-smoke-ok', observations.length, 'surfaces');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
