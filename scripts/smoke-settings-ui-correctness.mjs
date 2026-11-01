import { verifySettingsStyleParity, verifySettingsAppearanceParity } from "./test-helpers/settings-style-parity.mjs";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), server: { port: 0, strictPort: false } });
await server.listen();
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
  page.setDefaultTimeout(7000);
  page.setDefaultNavigationTimeout(30000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/settings-correctness-test*", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/settings-correctness-test",
    `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/settings-platform.tsx")}"></script></body></html>`) }));
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.abort());
  const visit = query => page.goto(`${server.resolvedUrls.local[0]}settings-correctness-test${query}`);
  await visit("");
  const expandStructure = async () => {
    const toggle = page.getByRole("button", { name: /^İşletme Yapısı ve Özellikler/ });
    if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  };
  const reopenSettings = async () => {
    const previousContent = await page.locator("#settings-structure-content").elementHandle();
    await page.evaluate(() => window.reopenSettings());
    // Wait for the React keyed remount before touching the new accordion.
    await expect.poll(() => previousContent.evaluate(element => element.isConnected)).toBe(false);
  };
  // Persisted availability controls presentation; a draft toggle/test cannot.
  for (const profile of ["restaurant", "market"]) {
    await visit(`?profile=${profile}&webVisibility=on`);
    await expandStructure();
    const labels = profile === "restaurant" ? ["Talepler", "QR Menü", "Online Satış"] : ["Talepler", "Online Satış"];
    const options = page.locator("#settings-options");
    const assertWebOptions = async available => {
      await expandStructure();
      await expect(options).toBeVisible();
      for (const label of labels) {
        const control = options.getByRole("checkbox", {name: label, exact: true});
        if (available) await expect(control).toBeChecked();
        else await expect(control).toHaveCount(0);
      }
      const search = page.getByRole("searchbox", {name: "Ayarlarda ara"});
      for (const term of ["qr", "talepler", "online satış", "teslimat", ...(profile === "market" ? ["portal"] : [])]) {
        await search.fill(term);
        if (!available) await expect(page.locator(".settings-search-results button")).toHaveCount(0);
      }
      await search.fill("");
      await expect(options.getByRole("checkbox", {name: profile === "market" ? "Bayi / Toptan Satış" : "Masa rezervasyonları", exact: true})).toBeChecked();
      await expect(page.locator("#settings-online-delivery")).toHaveCount(available ? 1 : 0);
      if (profile === "market") await expect(page.locator("#settings-dealer-portal")).toHaveCount(available ? 1 : 0);
      for (const id of ["settings-gallery-button", "settings-public-details", "settings-social-links"]) {
        await expect(page.locator(`#${id}`)).toHaveCount(available ? 1 : 0);
      }
      for (const term of ["galeri", "harita", "google maps", "kahvaltı", "sosyal medya", "fotoğraf", "video"]) {
        await search.fill(term);
        if (!available) await expect(page.locator(".settings-search-results button")).toHaveCount(0);
      }
      await search.fill("");
    };
    const savedOptions = await page.evaluate(() => window.persistedSettings().profileOptions);
    const toggle = page.locator("#settings-web").getByLabel("Etkin", {exact: true});
    const save = () => page.locator(".settings-page-actions").getByRole("button", {name: "Kaydet", exact: true}).click();
    await assertWebOptions(true);
    await toggle.uncheck();
    await assertWebOptions(true); // persisted enabled, draft disabled
    await save();
    await expect.poll(() => page.evaluate(() => window.persistedSettings().webModuleUrl)).toBe("");
    await assertWebOptions(false);
    expect(await page.evaluate(() => window.persistedSettings().profileOptions)).toEqual(savedOptions);
    await reopenSettings();
    await expandStructure();
    await assertWebOptions(false);
    await toggle.check();
    await page.getByLabel("Web eşitleme adresi", {exact: true}).fill("https://visibility.test/module");
    await page.getByLabel("Web güvenlik anahtarı", {exact: true}).fill("visibility-test-secret");
    await assertWebOptions(false); // unsaved address cannot expose publishers
    await save(); // verification required
    await assertWebOptions(false);
    await page.getByRole("button", {name: "Bağlan", exact: true}).click();
    await expect(page.locator(".settings-web-indicator")).toHaveText("Bağlantı doğrulandı");
    await assertWebOptions(false); // test is not a save
    await page.getByLabel("Otomatik eşitle", {exact: true}).uncheck();
    await save();
    await expect.poll(() => page.evaluate(() => window.persistedSettings().webModuleUrl)).toBe("https://visibility.test/module");
    await assertWebOptions(true); // manual-only connection is still Web
    await reopenSettings();
    await expandStructure();
    await assertWebOptions(true);
    expect(await page.evaluate(() => window.persistedSettings().autoSyncEnabled)).toBe(false);
    expect(await page.evaluate(() => window.persistedSettings().profileOptions)).toEqual(savedOptions);
  }

  // Web-only Settings are absent on a fresh local start. Local resource edits
  // still stage, discard and save; connecting with automatic sync off restores Web UI.
  for (const [profile, kind, title, detailTitle] of [
    ["pension", "rooms", "Oda Yönetimi", "Oda bilgilerini düzenle"],
    ["restaurant", "tables", "Masa Yönetimi", "Masa bilgilerini düzenle"]
  ]) {
    await visit(`?profile=${profile}&web=off`);
    await expect(page.locator("#settings-web")).toBeVisible();
    for (const label of ["Firma adı", "Telefon", "WhatsApp", "E-posta", "Adres"]) {
      await expect(page.getByRole("textbox", {name: label, exact: true})).toBeVisible();
    }
    for (const id of ["settings-gallery-button", "settings-public-details", "settings-social-links"]) {
      await expect(page.locator(`#${id}`)).toHaveCount(0);
    }
    await expandStructure();
    for (const id of ["settings-translation", "settings-speech", "settings-dictation"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    const localSearch = page.getByRole("searchbox", {name: "Ayarlarda ara"});
    await localSearch.fill("telefon");
    await expect(page.locator(".settings-search-results").getByRole("button", {name: "İşletme Bilgileri", exact: true})).toBeVisible();
    await localSearch.fill("");
    await page.locator(`#settings-${kind}-button`).click();
    const management = page.getByRole("dialog", {name: title, exact: true});
    await expect(management).toBeVisible();
    await expect(management.locator(".resource-management-publication-toggle")).toHaveCount(0);
    await expect(management.locator(".resource-management-media-pane")).toHaveCount(0);
    await expect(management.getByRole("button", {name: /medyalarını seç/})).toHaveCount(0);
    for (const width of [1440, 900, 480]) {
      await page.setViewportSize({width, height: 900});
      expect(await management.locator(".resource-management-shell").evaluate(shell => {
        const main = shell.querySelector(".resource-management-main-pane"), style = getComputedStyle(main);
        return shell.classList.contains("is-local-only") && getComputedStyle(shell).gridTemplateColumns.split(" ").length === 1
          && style.borderInlineEndWidth === "0px" && style.borderBottomWidth === "0px"
          && shell.scrollWidth <= shell.clientWidth + 1;
      })).toBe(true);
    }
    await page.setViewportSize({width: 1440, height: 900});
    await management.locator(".room-management-details-button").first().click();
    const detail = page.getByRole("dialog", {name: detailTitle, exact: true});
    await detail.getByLabel("Kapasite", {exact: true}).fill("7");
    await detail.getByRole("button", {name: "Kaydet", exact: true}).click();
    await management.getByRole("button", {name: "Değişiklikleri Geri Al", exact: true}).click();
    await management.locator(".room-management-details-button").first().click();
    await expect(detail.getByLabel("Kapasite", {exact: true})).toHaveValue(kind === "rooms" ? "2" : "4");
    await detail.getByLabel("Kapasite", {exact: true}).fill("6");
    await detail.getByRole("button", {name: "Kaydet", exact: true}).click();
    if (kind === "rooms") await management.getByRole("checkbox", {name: "Oda 101 hizmette", exact: true}).uncheck();
    await management.getByRole("button", {name: "Kaydet", exact: true}).click();
    await expect(management.getByRole("button", {name: "Kaydet", exact: true})).toBeDisabled();
    const saved = await page.evaluate(() => window.settingsCalls.find(call => call.kind === "layout").input);
    expect(saved[kind][0].capacity).toBe(6);
    if (kind === "rooms") expect(saved.rooms[0].outOfService).toBe(true);
    expect(await page.evaluate(() => window.settingsCalls.filter(call => ["profile-read", "room-media-read", "table-media-read", "profile"].includes(call.kind)))).toHaveLength(0);
    await management.getByRole("button", {name: "Kapat", exact: true}).click();

    const connected = {webModuleUrl: "https://manual.test/module", syncSecret: "manual-secret", autoSyncEnabled: false};
    await page.evaluate(patch => window.refreshSettings(patch), connected);
    const description = page.locator('textarea[placeholder="İşletmenizi müşteriye kısa ve net biçimde anlatın."]');
    await expect(description).toHaveValue("İlk açıklama");
    await expect(page.locator("#settings-social-links")).toBeVisible();
    await page.locator(`#settings-${kind}-button`).click();
    await expect(management.locator(".resource-management-publication-toggle")).toBeVisible();
    await expect(management.locator(".resource-management-publication-toggle input")).toBeChecked({checked: kind === "rooms"});
    await expect(management.locator(".resource-management-media-pane")).toBeVisible();
    await management.getByRole("button", {name: "Kapat", exact: true}).click();
    await localSearch.fill("galeri");
    await page.locator(".settings-search-results").getByRole("button", {name: "Galeri Yönetimi", exact: true}).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", {name: "Galeri Yönetimi", exact: true})).toBeVisible();
    await page.evaluate(() => window.refreshSettings({webModuleUrl: "", syncSecret: ""}));
    await expect(page.getByRole("dialog", {name: "Galeri Yönetimi", exact: true})).toHaveCount(0);
    await page.evaluate(patch => window.refreshSettings(patch), connected);
    await expect(description).toHaveValue("İlk açıklama");
    await expect(page.getByRole("dialog", {name: "Galeri Yönetimi", exact: true})).toHaveCount(0);
    await description.fill("Korunan profil taslağı");
    await page.evaluate(() => window.refreshSettings({webModuleUrl: "", syncSecret: ""}));
    await expect(description).toHaveCount(0);
    await expect(page.locator(".settings-page-actions")).toContainText("Kaydedilmemiş işletme değişiklikleri");
    await page.evaluate(patch => window.refreshSettings(patch), connected);
    await expect(description).toHaveValue("Korunan profil taslağı");
    expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "profile-read"))).toHaveLength(1);
    await page.locator(".settings-page-actions").getByRole("button", {name: "Değişiklikleri Geri Al", exact: true}).click();
    await expect(description).toHaveValue("İlk açıklama");
    expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "profile"))).toHaveLength(0);
  }
  await visit("");
  const tab = name => page.getByRole("tab", { name, exact: true });
  const info = page.locator('#settings-public-profile');
  await expect(info.getByRole('heading', { name: 'İşletme Bilgileri', exact: true })).toHaveCount(1);
  await expect(info.locator('.settings-panel')).toHaveCount(0);
  for (const label of ['Firma adı', 'Telefon', 'WhatsApp', 'E-posta', 'Adres']) {
    await expect(info.getByLabel(label, { exact: true })).toHaveCount(1);
  }
  await expect(info.locator('textarea[placeholder="İşletmenizi müşteriye kısa ve net biçimde anlatın."]')).toHaveCount(1);
  await expect(info.locator('input[placeholder="Türkçe, English, Deutsch"]')).toHaveCount(1);
  await expect(info.locator('#settings-social-links')).toHaveCount(1);
  await expect(info.locator('#settings-google-reviews')).toHaveCount(0);

  // Every subsection shares the outer panel's inset across themes and densities.
  for (const width of [900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scheme of ['Açık', 'Koyu']) {
      for (const density of ['Rahat', 'Kompakt']) {
        await page.getByRole('button', { name: 'Görünüm', exact: true }).click();
        await page.getByRole('radio', { name: scheme, exact: true }).check();
        await page.getByRole('radio', { name: density, exact: true }).check();
        await page.keyboard.press('Escape');
        const spacing = await info.evaluate(panel => {
          const body = panel.querySelector(':scope > .settings-panel-body');
          const bounds = body.getBoundingClientRect(), style = getComputedStyle(body);
          const padding = parseFloat(style.paddingInlineStart);
          const contact = panel.querySelector('.settings-business-contact');
          const details = panel.querySelector('#settings-public-details');
          const social = panel.querySelector('#settings-social-links');
          const inputs = [...panel.querySelectorAll('.settings-business-contact input')];
          const controls = [...inputs, panel.querySelector('#settings-rooms-button'),
            panel.querySelector('#settings-tables-button'), details, social].filter(Boolean);
          return {
            padded: padding > 0 && parseFloat(style.paddingBlockStart) > 0 && parseFloat(style.paddingBlockEnd) > 0,
            aligned: [contact, details, social].every(node => Math.abs(node.getBoundingClientRect().left - bounds.left - padding) < 1),
            contained: controls.every(node => { const r = node.getBoundingClientRect(); return r.left >= bounds.left + padding - 1 && r.right <= bounds.right - padding + 1; }),
            overflow: panel.scrollWidth > panel.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1
          };
        });
        await verifySettingsStyleParity(page, `business-${width}-${scheme}-${density}`);
        expect(spacing, `${width}px ${scheme} ${density}`).toEqual({ padded: true, aligned: true, contained: true, overflow: false });
      }
    }
  }

  // Search gets its accessible label without using a whole separate heading row.
  const searchBox = page.getByRole("searchbox", { name: "Ayarlarda ara" });
  await expect(searchBox).toHaveAttribute("placeholder", "Ayarlarda ara");
  const searchBounds = await searchBox.boundingBox();
  const utilityBounds = await page.getByRole("button", { name: "Güvenlik" }).boundingBox();
  expect(Math.abs((searchBounds.y + searchBounds.height / 2) - (utilityBounds.y + utilityBounds.height / 2))).toBeLessThan(15);

  // Room/table management and details use mutually exclusive dialogs, not stacked modals.
  // A detail save only stages changes; the owner layout Save/Discard remains authoritative.
  for (const kind of ["rooms", "tables"]) {
    const managementTitle = kind === "rooms" ? "Oda Yönetimi" : "Masa Yönetimi";
    const detailTitle = kind === "rooms" ? "Oda bilgilerini düzenle" : "Masa bilgilerini düzenle";
    await page.locator(kind === "rooms" ? "#settings-rooms-button" : "#settings-tables-button").click();
    const management = page.getByRole("dialog", { name: managementTitle, exact: true });
    await expect(management).toBeVisible();
    if (kind === "rooms") {
      const roomList = management.getByLabel("Oda özetleri");
      const firstRoom = roomList.locator(".room-management-row").first();
      const service = firstRoom.getByRole("checkbox", { name: "Oda 101 hizmette", exact: true });
      await expect(roomList.getByText("Oda / Durum", { exact: true })).toBeVisible();
      await expect(service).toBeChecked();
      await expect(firstRoom.getByText("Hizmette", { exact: true })).toBeVisible();
      await service.uncheck();
      await expect(service).not.toBeChecked();
      await expect(firstRoom.getByText("Hizmet dışı", { exact: true })).toBeVisible();
      await expect(management.getByText("Kaydedilmemiş değişiklikler", { exact: true })).toBeVisible();
      await expect(management.getByRole("button", { name: "Kaydet", exact: true })).toBeEnabled();
      // Toggling service must not change the media selection or save immediately.
      await expect(firstRoom).toHaveAttribute("aria-pressed", "true");
      await service.check();
      await expect(firstRoom.getByText("Hizmette", { exact: true })).toBeVisible();
      await expect(management.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
    }
    await verifySettingsAppearanceParity(page, `${kind}-management`);
    const managementBounds = await management.boundingBox();
    const shell = management.locator(".resource-management-shell");
    const shellBounds = await shell.boundingBox();
    expect(managementBounds.height).toBeLessThan(0.85 * 900);
    expect(managementBounds.height - shellBounds.height).toBeLessThan(195);
    const before = await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "layout").length);
    await management.locator(".room-management-details-button").first().click();
    const detail = page.getByRole("dialog", { name: detailTitle, exact: true });
    await expect(detail).toBeVisible();
    await expect(management).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(detail.getByText("Temel bilgiler", { exact: true })).toHaveCount(0);
    await expect(detail.getByText("Müşteriye açık bilgiler", { exact: true })).toHaveCount(0);
    await expect(detail.getByText("Oda kimliği, kapasite ve yatak düzeni", { exact: true })).toHaveCount(0);
    if (kind === "rooms") {
      const basic = detail.locator(".room-public-basic-grid");
      await expect(basic).toHaveCount(1);
      const cells = await basic.locator(":scope > label").all();
      expect(cells.length).toBe(8);
      const b = await Promise.all(cells.slice(0, 6).map(cell => cell.boundingBox()));
      expect(new Set(b.slice(0, 3).map(r => Math.round(r.y))).size).toBe(1);
      expect(new Set(b.slice(3, 6).map(r => Math.round(r.y))).size).toBe(1);
      expect(b[0].y).toBeLessThan(b[3].y);
      const desc = await basic.getByLabel("Açıklama", { exact: true }).boundingBox();
      const note = await basic.getByLabel("Fiyat notu", { exact: true }).boundingBox();
      expect(desc.y).toBeGreaterThan(b[5].y);
      expect(note.y).toBeGreaterThan(desc.y);
      expect(desc.width).toBeGreaterThan(b[0].width * 2);
    } else {
      await expect(detail.getByLabel("Sigara kullanımı")).toHaveCount(0);
      const smoking = detail.getByRole("checkbox", { name: "Sigara içiliyor", exact: true });
      await expect(smoking).toBeVisible();
      await smoking.check();
      await expect(smoking).toBeChecked();
    }
    await verifySettingsStyleParity(page, `${kind}-details`);
    const detailBounds = await detail.boundingBox();
    expect(detailBounds.width).toBeLessThan(managementBounds.width);
    expect(detailBounds.height).toBeLessThan(0.9 * 900);
    const capacity = detail.getByLabel("Kapasite", { exact: true });
    const previous = await capacity.inputValue();
    await capacity.fill(previous === "5" ? "6" : "5");
    await detail.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(management).toBeVisible();
    await expect(management.getByText("Kaydedilmemiş değişiklikler", { exact: true })).toBeVisible();
    const closeManagement = management.getByRole("button", { name: "Kapat", exact: true });
    await expect(closeManagement).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(management).toBeVisible();
    await page.mouse.click(6,6);
    await expect(management).toBeVisible();
    await expect(management.getByRole("button", { name: "Kaydet ve geç" })).toHaveCount(0);
    expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "layout").length)).toBe(before);
    await management.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
    await expect(management.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
    await expect(closeManagement).toBeEnabled();
    await closeManagement.click();
    await expect(management).toHaveCount(0);
  }

  // Global update projection must reflect the bridge, including unverified/error states.
  await expect(page.locator(".page-header-tools > #header-updates + .appearance-menu")).toHaveCount(1);
  await expect(page.locator(".sidebar #header-updates")).toHaveCount(0);
  const updateTrigger = page.locator('#header-updates');
  await expect(updateTrigger).toContainText('Henüz kontrol edilmedi');
  for (const [patch, text] of [
    [{ phase: 'checking' }, 'Kontrol ediliyor'],
    [{ phase: 'up-to-date', lastCheckedAt: '' }, 'Henüz kontrol edilmedi'],
    [{ phase: 'up-to-date', lastCheckedAt: '2026-01-01T12:00:00Z' }, 'Güncel'],
    [{ phase: 'available', currentVersion: '2.0.2', latestVersion: '2.0.3' }, 'Güncelleme var'],
    [{ phase: 'ready' }, 'Kuruluma hazır'],
    [{ phase: 'error' }, 'Güncelleme hatası']
  ]) {
    await page.evaluate(patch => window.emitUpdateStatus(patch), patch);
    await expect(updateTrigger).toContainText(text);
  }
  await page.evaluate(() => window.reopenSettings());
  await updateTrigger.click();
  const updateSurface = page.locator('#header-updates-panel');
  await expect(updateSurface.locator('.settings-update-summary')).toHaveCount(1);
  await expect(updateSurface.locator('.settings-panel-header')).toHaveCount(0);
  await expect(updateSurface.getByLabel('Otomatik güncellemeleri kontrol et', { exact: true })).toBeVisible();
  await expect(updateSurface.getByText('Otomatik kontrol', { exact: true })).toHaveCount(0);
  for (const name of ['Güncelleme adresini varsayılana döndür']) {
    const iconButton = updateSurface.getByRole('button', { name, exact: true });
    await expect(iconButton).toHaveAttribute('title', /.+/);
    await expect(iconButton.locator('svg')).toHaveCount(1);
    await expect(iconButton).toHaveText('');
  }
  const addressRow = updateSurface.locator('.settings-update-address-row');
  const resetAddress = addressRow.getByRole('button', { name: 'Güncelleme adresini varsayılana döndür' });
  await expect(addressRow.getByLabel('Güncelleme sunucusu')).toBeVisible();
  await expect(updateSurface.getByRole('button', { name: 'Değişiklikleri Geri Al', exact: true })).toHaveCount(0);
  const checkUpdate = updateSurface.getByRole('button', { name: 'Güncellemeleri Kontrol Et' });
  await expect(checkUpdate).toHaveText('Güncellemeleri Kontrol Et');
  await expect(checkUpdate.locator('svg')).toHaveCount(0);
  const saveUpdate = updateSurface.getByRole('button', { name: 'Güncelleme Tercihlerini Kaydet' });
  await expect(saveUpdate).toHaveText('Kaydet');
  await expect(saveUpdate.locator('svg')).toHaveCount(0);
  const inputBox = await addressRow.getByLabel('Güncelleme sunucusu').boundingBox();
  const resetBox = await resetAddress.boundingBox();
  expect(resetBox.x).toBeGreaterThanOrEqual(inputBox.x + inputBox.width);
  await page.evaluate(() => window.emitUpdateStatus({ phase: 'available', installSupported: true, notes: ['Fixture release note'] }));
  await expect(updateSurface).toContainText('Fixture release note');
  await updateSurface.getByRole('button', { name: 'Güncellemeyi İndir', exact: true }).click();
  await updateSurface.getByRole('button', { name: 'Yeniden Başlat ve Güncelle', exact: true }).click();
  expect(await page.evaluate(() => window.settingsCalls.filter(c => ['update-download', 'update-install'].includes(c.kind)).map(c => c.kind))).toEqual(['update-download', 'update-install']);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.emitUpdateStatus({ phase: 'idle' }));
  for (const width of [900, 1366]) {
    await page.setViewportSize({ width, height: 768 });
    await page.getByRole('button', { name: 'Görünüm', exact: true }).click();
    await page.getByLabel('Arayüz ölçeği').selectOption('1.1');
    await page.keyboard.press('Escape');
    for (const id of ['header-updates', 'settings-security-button', 'settings-data-button']) {
      await page.locator(`#${id}`).click();
      const panel = page.locator(`#${id}-panel`);
      await expect(panel).toBeVisible();
      await verifySettingsStyleParity(page, `${id}-${width}-scaled`);
      const rect = await panel.boundingBox();
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width + 1);
      expect(rect.y + rect.height).toBeLessThanOrEqual(769);
      if (id === 'header-updates') {
        await panel.getByText('Otomatik güncellemeleri kontrol et', { exact: true }).click();
        await panel.getByText('Otomatik güncellemeleri kontrol et', { exact: true }).click();
      }
      if (id === 'settings-security-button') await panel.getByText('Yeni şifre tekrar', { exact: true }).click();
      await panel.locator('header').first().click({ position: { x: 5, y: 5 } });
      await expect(panel).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(`#${id}`)).toBeFocused();
    }
  }
  await page.getByRole('button', { name: 'Görünüm', exact: true }).click();
  await page.getByLabel('Arayüz ölçeği').selectOption('1');
  await page.keyboard.press('Escape');
  await page.getByRole('searchbox', { name: 'Ayarlarda ara' }).fill('parola');
  await page.getByRole('button', { name: 'Uygulama Şifresi', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Güvenlik', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Veriler', exact: true }).click();
  await expect(page.locator('.backup-manager')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('.backup-manager')).toHaveCount(0);
  await visit('?firstRun=on');
  await page.evaluate(() => window.refreshSettings({ syncSecret: '' }));
  await page.getByRole('button', { name: 'Güvenlik', exact: true }).click();
  await expect(page.getByLabel('Şifre belirleyin', { exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Veriler', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Yedek Al', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tüm Verileri Sıfırla', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await visit('');
  await page.setViewportSize({ width: 1440, height: 900 });
  const assertLayout = async (rooms, tables) => {
    await expect(tab("İşletme Düzeni")).toHaveCount(0);
    await expect(page.locator("#settings-rooms-button")).toHaveCount(rooms ? 1 : 0);
    await expect(page.locator("#settings-tables-button")).toHaveCount(tables ? 1 : 0);
    for (const [enabled, id, name, toggle] of [[rooms, 'settings-rooms', 'Oda Ekle', 'Oda web yayını'], [tables, 'settings-operations', 'Kategori Ekle', 'Masa web yayını']]) {
      if (!enabled) continue;
      await page.locator(id === 'settings-rooms' ? '#settings-rooms-button' : '#settings-tables-button').click();
      const header = page.locator(`#${id} .resource-management-pane-header`);
      await expect(header.getByRole('button', { name, exact: true })).toBeEnabled();
      const webAvailable = await page.evaluate(() => Boolean(window.persistedSettings().webModuleUrl && window.persistedSettings().syncSecret));
      if (webAvailable) await expect(header.getByRole('checkbox', { name: toggle, exact: true })).toBeVisible();
      else {
        await expect(header.getByRole('checkbox', { name: toggle, exact: true })).toHaveCount(0);
        await expect(page.locator(`#${id} .resource-management-media-pane`)).toHaveCount(0);
      }
      await expect(page.locator(`#${id} .resource-management-content`).getByRole('button', { name, exact: true })).toHaveCount(0);
      const assertActionsInOneRow = async () => {
        if (!webAvailable) return;
        await expect.poll(() => header.evaluate(el => {
          const label = el.querySelector('.resource-management-publication-toggle').getBoundingClientRect();
          const button = el.querySelector('.resource-management-header-actions button').getBoundingClientRect();
          return button.left >= label.right && Math.abs((label.top + label.bottom) / 2 - (button.top + button.bottom) / 2) < 1;
        })).toBe(true);
      };
      await assertActionsInOneRow();
      const viewport = page.viewportSize();
      await page.setViewportSize({ width: 480, height: 900 });
      await expect(header.getByRole('button', { name, exact: true })).toBeEnabled();
      await expect.poll(() => header.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await assertActionsInOneRow();
      await page.setViewportSize(viewport);
      await page.keyboard.press("Escape");
    }
  };
  // A clean first run cannot edit layout before setup exists. The first save must
  // activate the correct resource surface without navigating away or reopening.
  for (const [query, rooms, tables] of [
    ["pension", true, false], ["restaurant", false, true], ["market", false, false],
    ["market&wholesale=on", false, false]
  ]) {
    await visit(`?profile=${query}&firstRun=on`);
    await expect(page.locator("#settings-panel-business")).toBeVisible();
    await expect(tab("İşletme Düzeni")).toHaveCount(0);
    await expect(page.getByLabel("Firma adı", { exact: true })).toHaveValue("");
    await expect(page.locator("#settings-web").getByLabel("Etkin", { exact: true })).not.toBeChecked();
    await expect(page.getByLabel("Web güvenlik anahtarı", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kaydet", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.persistedSettings().setupRequired)).toBe(false);
    await assertLayout(rooms, tables);
    // Assert loaded data/actions, not only headings: an empty stale controller
    // must not look like a working layout surface or silently ignore a save.
    if (rooms) {
      await page.locator("#settings-rooms-button").click();
      await page.getByRole("button", { name: "Oda Ekle", exact: true }).click();
      await page.getByRole("dialog", { name: "Oda Yönetimi" }).getByRole("button", { name: "Kaydet", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(call => call.kind === "layout").length)).toBe(1);
    }
    if (tables) {
      await page.locator("#settings-tables-button").click();
      await expect(page.getByText("Henüz masa kategorisi yok.", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Kategori Ekle", exact: true }).click();
      await page.getByLabel("Kategori adı", { exact: true }).fill("First-run salon");
      await page.getByRole("dialog", { name: "Masa Yönetimi" }).getByRole("button", { name: "Kaydet", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(call => call.kind === "layout").length)).toBe(1);
    }
    if (rooms || tables) await page.keyboard.press("Escape");
    await page.evaluate(() => window.reopenSettings());
    await assertLayout(rooms, tables);
    if (rooms) { await page.locator("#settings-rooms-button").click(); await expect(page.locator(".room-management-row")).toHaveCount(1); await page.keyboard.press("Escape"); }
    if (tables) { await page.locator("#settings-tables-button").click(); await expect(page.getByLabel("Kategori adı", { exact: true })).toHaveValue("First-run salon"); await page.keyboard.press("Escape"); }
  }

  // Offline first run accepts a preselected sector without a name, phone, secret or test.
  await visit("?profile=pension&firstRun=on");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.persistedSettings().setupRequired)).toBe(false);
  expect(await page.evaluate(() => window.persistedSettings().businessName)).toBe("");
  expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "web-test").length)).toBe(0);
  expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "web-probe" || call.kind === "web-connect-source").length)).toBe(0);
  await page.evaluate(() => window.reopenSettings());
  await expect(page.locator("#settings-web").getByLabel("Etkin", { exact: true })).not.toBeChecked();

  // Web participates in the shared draft, leave guard and save/discard even after setup.
  await expect(page.getByRole("button", { name: "Tercihleri kaydet", exact: true })).toHaveCount(0);
  await page.locator("#settings-web").getByLabel("Etkin", { exact: true }).check();
  await page.getByLabel("Web eşitleme adresi", { exact: true }).fill("https://first-run.test/module/");
  await page.getByLabel("Web güvenlik anahtarı", { exact: true }).fill("first-run-tested-secret");
  await page.getByLabel("Otomatik eşitle", { exact: true }).check();
  const webToggle = page.locator("#settings-web").getByLabel("Etkin", { exact: true });
  await webToggle.uncheck();
  await expect(page.locator("#settings-web input")).toHaveCount(1);
  await expect(page.locator("#settings-web button, #settings-web small")).toHaveCount(0);
  await webToggle.check();
  await expect(page.getByLabel("Web eşitleme adresi", { exact: true })).toHaveValue("https://first-run.test/module/");
  await expect(page.getByLabel("Web güvenlik anahtarı", { exact: true })).toHaveValue("first-run-tested-secret");
  expect(await page.evaluate(() => window.requestSettingsPageLeave())).toBe(false);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Burada kal", exact: true }).click();
  expect(await page.evaluate(() => window.settingsPageLeaveCompleted)).toBe(false);
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(webToggle).not.toBeChecked();
  await webToggle.check();
  await expect(page.getByLabel("Web eşitleme adresi", { exact: true })).toHaveValue("");
  await page.getByLabel("Web eşitleme adresi", { exact: true }).fill("https://first-run.test/module/");
  await page.getByLabel("Web güvenlik anahtarı", { exact: true }).fill("first-run-tested-secret");
  await page.getByLabel("Otomatik eşitle", { exact: true }).check();
  const setupCount = await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "setup").length);
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.locator(".global-message-bar")).toContainText("Bağlan ile doğrulayın");
  expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "setup").length)).toBe(setupCount);
  await page.evaluate(() => { window.failWebTest = true; });
  await page.getByRole("button", { name: "Bağlan", exact: true }).click();
  await expect(page.locator(".global-message-bar")).toContainText("başarısız");
  expect(await page.evaluate(() => window.persistedSettings().webModuleUrl)).toBe("");
  expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "web-connect-source").length)).toBe(0);
  await page.evaluate(() => { window.failWebTest = false; window.failWebSource = true; });
  await page.getByRole("button", { name: "Bağlan", exact: true }).click();
  await expect(page.locator(".global-message-bar")).toContainText("reddedildi");
  expect(await page.evaluate(() => window.persistedSettings().webModuleUrl)).toBe("");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.locator(".global-message-bar")).toContainText("Bağlan ile doğrulayın");
  expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "setup").length)).toBe(setupCount);
  await page.evaluate(() => { window.failWebSource = false; });
  await page.getByRole("button", { name: "Bağlan", exact: true }).click();
  await expect(page.locator(".settings-web-indicator")).toHaveText("Bağlantı doğrulandı");
  expect(await page.evaluate(() => window.persistedSettings().webModuleUrl)).toBe("");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.persistedSettings().webModuleUrl)).toBe("https://first-run.test/module/");
  expect(await page.evaluate(() => window.settingsCalls.filter(call => ["web-test", "web-connect-source", "setup"].includes(call.kind)).slice(-3).map(call => call.kind))).toEqual(["web-test", "web-connect-source", "setup"]);

  // Editing a tested connection invalidates its proof; Revert restores the saved probe state.
  await page.getByLabel("Web güvenlik anahtarı", { exact: true }).fill("changed-after-test-secret");
  await page.evaluate(() => window.refreshSettings({ localNetworkEnabled: !window.persistedSettings().localNetworkEnabled }));
  await expect(page.getByLabel("Web güvenlik anahtarı", { exact: true })).toHaveValue("changed-after-test-secret");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.locator(".global-message-bar")).toContainText("Bağlan ile doğrulayın");
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(page.getByLabel("Web güvenlik anahtarı", { exact: true })).toHaveValue("first-run-tested-secret");
  await expect(page.locator(".settings-web-indicator")).toHaveText("Bağlantı doğrulandı");
  await webToggle.uncheck();
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(webToggle).toBeChecked();
  await expect(page.getByLabel("Web güvenlik anahtarı", { exact: true })).toHaveValue("first-run-tested-secret");

  // Configured but unreachable hosting cannot block a local sync preference save.
  await page.evaluate(() => { window.failWebTest = true; window.webSaveWarning = true; window.settingsCalls.length = 0; });
  await page.getByLabel("Otomatik eşitle", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.persistedSettings().autoSyncEnabled)).toBe(false);
  await expect(page.locator(".global-message-bar")).toContainText("web yayını başarısız");
  await page.evaluate(() => { window.webSaveWarning = false; });
  await page.getByLabel("Otomatik eşitle", { exact: true }).check();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.persistedSettings().autoSyncEnabled)).toBe(true);
  expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "web-test" || call.kind === "web-connect-source").length)).toBe(0);
  await page.locator("#settings-web").getByLabel("Etkin", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.persistedSettings().webModuleUrl)).toBe("");
  expect(await page.evaluate(() => window.persistedSettings().syncSecret)).toBe("");
  await page.evaluate(() => window.reopenSettings());
  await expect(page.locator("#settings-web").getByLabel("Etkin", { exact: true })).not.toBeChecked();
  await webToggle.check();
  await expect(page.getByLabel("Web güvenlik anahtarı", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(webToggle).not.toBeChecked();

  await visit("?profile=restaurant&firstRun=on");
  await page.locator("#settings-web").getByLabel("Etkin", { exact: true }).check();
  await page.getByLabel("Web eşitleme adresi", { exact: true }).fill("https://setup.test/module");
  await page.getByLabel("Web güvenlik anahtarı", { exact: true }).fill("setup-tested-secret");
  await page.getByRole("button", { name: "Bağlan", exact: true }).click();
  await expect(page.locator(".settings-web-indicator")).toHaveText("Bağlantı doğrulandı");
  expect(await page.evaluate(() => window.persistedSettings().setupRequired)).toBe(true);
  expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "setup").length)).toBe(0);
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.persistedSettings().setupRequired)).toBe(false);
  expect(await page.evaluate(() => window.persistedSettings().webModuleUrl)).toBe("https://setup.test/module");

  await visit("?profile=restaurant&firstRun=on");
  const sector = page.getByRole("combobox", { name: /Sektör tipi/ });
  await sector.selectOption("market");
  await expect(tab("İşletme Düzeni")).toHaveCount(0);
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(sector).toHaveValue("restaurant");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await assertLayout(false, true);
  await expandStructure();
  await sector.selectOption("market");
  // Unsaved profile changes/revert must not replace persisted runtime authority.
  await expect(page.locator("#settings-tables-button")).toBeVisible();
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(sector).toHaveValue("restaurant");
  await assertLayout(false, true);
  const saveSector = async () => {
    await page.locator(".settings-page-actions").getByRole("button", { name: "Kaydet", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Değişiklikler kaydedilip uygulama yeniden başlatılsın mı?" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Kaydet ve Yeniden Başlat" }).click();
  };
  for (const [profileId, rooms, tables] of [["market", false, false], ["pension", true, false], ["restaurant", false, true]]) {
    await expandStructure();
    await sector.selectOption(profileId);
    await saveSector();
    await expect.poll(() => page.evaluate(() => window.persistedSettings().profileId)).toBe(profileId);
    await assertLayout(rooms, tables);
  }

  // A late previous-profile read cannot restore its capabilities/empty draft.
  await expandStructure();
  await page.evaluate(() => {
    const read = window.yardimciDesktop.getBusinessLayout;
    window.yardimciDesktop.getBusinessLayout = async () => {
      window.yardimciDesktop.getBusinessLayout = read;
      const snapshot = await read();
      await new Promise(resolve => { window.finishOldLayoutRead = resolve; });
      return snapshot;
    };
  });
  await sector.selectOption("pension");
  await saveSector();
  await expect.poll(() => page.evaluate(() => typeof window.finishOldLayoutRead)).toBe("function");
  await sector.selectOption("restaurant");
  await saveSector();
  await assertLayout(false, true);
  await page.evaluate(async () => { window.finishOldLayoutRead(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await expect(page.getByRole("heading", { name: "Oda Yönetimi", exact: true })).toHaveCount(0);
  await page.locator("#settings-tables-button").click();
  await page.getByRole("button", { name: "Kategori Ekle", exact: true }).click();
  await page.getByLabel("Kategori adı", { exact: true }).fill("Current profile salon");
  const tableCloseAfterSave = page.getByRole("dialog", { name: "Masa Yönetimi" }).getByRole("button", { name: "Kapat", exact: true });
  await expect(tableCloseAfterSave).toBeDisabled();
  await page.locator('.settings-layout-overlay > footer').getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(call => call.kind === "layout").length)).toBe(1);
  await expect(tableCloseAfterSave).toBeEnabled();
  await tableCloseAfterSave.click();

  await visit("");
  const address = page.getByLabel("Adres", { exact: true });
  await address.fill("Yeni taslak adres Ankara");
  await expect(page.locator(".business-public-profile-address-lookup").getByText("Yeni taslak adres Ankara", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Adresten bul", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.settingsCalls.find(call => call.kind === "geocode")?.address)).toBe("Yeni taslak adres Ankara");
  expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "setup").length)).toBe(0);
  await expect(page.locator(".business-location-map-picker")).toBeVisible();
  await tab("Google Maps").click();
  await expect(page.getByLabel("Google Maps embed bağlantısı", { exact: true })).toBeVisible();
  await expect(page.getByText("Google Maps'teki Haritayı paylaş / Yerleştirme bağlantısını kullanın.", { exact: true })).toHaveCount(0);
  expect(await page.getByLabel("Google Maps embed bağlantısı", { exact: true }).evaluate(input =>
    input.getBoundingClientRect().top > input.parentElement.querySelector("span").getBoundingClientRect().bottom)).toBe(true);
  await expect(page.getByRole("button", { name: "Adresten bul", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Enlem", { exact: true })).toHaveCount(0);
  await tab("Manuel harita").click();
  await expect(page.getByLabel("Google Maps embed bağlantısı", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Enlem", { exact: true })).toBeVisible();

  for (const profile of ["market", "market&wholesale=on"]) {
    await visit(`?profile=${profile}`);
    await expect(tab("İşletme Düzeni")).toHaveCount(0);
    await expect(page.locator("#settings-panel-business")).toBeVisible();
  }
  for (const [query, rooms, tables] of [["?profile=pension", true, false], ["?profile=restaurant", false, true], ["?profile=pension_restaurant", true, true]]) {
    await visit(query);
    await assertLayout(rooms, tables);
  }
  await visit("?profile=market");
  await page.evaluate(() => window.refreshSettings({ profileOptions: [] }));
  await expandStructure();
  const options = page.locator("#settings-options");
  const marketingOption = options.getByRole("checkbox", { name: "Pazarlama", exact: true });
  const campaignOption = options.getByRole("checkbox", { name: "WhatsApp / SMS Kampanyaları", exact: true });
  const optionLayout = () => options.locator(".settings-profile-option").evaluateAll(labels => labels.map(label => ({
    text: label.querySelector("span")?.textContent,
    top: label.getBoundingClientRect().top
  })));
  const layoutBefore = await optionLayout();
  await expect(marketingOption).not.toBeChecked();
  await expect(marketingOption).toBeEnabled();
  await campaignOption.check();
  await expect(marketingOption).toBeChecked();
  await expect(marketingOption).toBeDisabled();
  await expect(options.getByText("Pazarlama dahil", { exact: true })).toHaveCount(0);
  expect(await optionLayout()).toEqual(layoutBefore);
  await campaignOption.uncheck();
  await expect(marketingOption).not.toBeChecked();
  await expect(marketingOption).toBeEnabled();
  await marketingOption.check();
  await campaignOption.check();
  await campaignOption.uncheck();
  await expect(marketingOption).toBeChecked();
  await expect(marketingOption).toBeEnabled();
  await marketingOption.uncheck();
  await campaignOption.check();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  expect(await page.evaluate(() => window.persistedSettings().profileOptions)).toEqual(["messaging.campaigns"]);
  expect(await page.evaluate(() => window.fixtureRuntimeCapabilities())).toContain("marketing.studio");
  await page.evaluate(() => window.refreshSettings({ profileOptions: ["commerce.wholesale", "channel.online_sales", "marketing.studio"], onlineSalesDeliveryEnabled: true }));
  // Service-specific overlay/save coverage lives in the Settings platform smoke.
  await page.locator("#header-updates").click();
  for (const [remote, phase, arrow] of [["2.0.1", "up-to-date", false], ["2.0.2", "up-to-date", false], ["2.0.3", "available", true]]) {
    await page.evaluate(({ remote, phase }) => { window.yardimciDesktop.checkForUpdates = async () => ({ phase, message: "Fixture version", currentVersion: "2.0.2", latestVersion: remote, defaultBaseUrl: "https://example.test/updates", customBaseUrl: "", autoCheckEnabled: true, notes: [], installSupported: true }); }, { remote, phase });
    await page.getByRole("button", { name: "Güncellemeleri Kontrol Et", exact: true }).click();
    const header = page.locator("#settings-updates .settings-update-summary");
    if (arrow) await expect(header).toContainText(`2.0.2 → ${remote}`);
    else await expect(header).not.toContainText("→");
    await expect(page.getByRole("button", { name: "Güncellemeyi İndir", exact: true })).toHaveCount(arrow ? 1 : 0);
  }
  expect(errors).toEqual([]);
  console.log("settings-ui-correctness-smoke-ok: clean first-run profiles, save/reopen, profile change/revert and late layout reads; unsaved address, map controls, capability gates, cards, independent AI models and version presentation");
} finally { await browser?.close(); await server.close(); }
