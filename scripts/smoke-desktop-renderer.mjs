import { createReportFixture, createSetupFixture, createDashboardFixture, createDashboardConversionFixture, createCompactUiFixture, createPulledRequestFixture, createBusinessCapabilitySnapshotFixture } from "./lib/desktop-renderer-fixtures.mjs";
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { getLocalViteExecutable } from "./test-helpers/local-vite.mjs";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { readFileSync } from "node:fs";
import http from "node:http";

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(getLocalViteExecutable(), ["--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: "apps/desktop-app",
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForUrl(baseUrl);

  const browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.addInitScript(({ setupData, dashboardData, reportData, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ theme: "dark", scale: 1 }));
    }
    let currentDashboardData = dashboardData;
    const mutateDevice = (deviceId, mutation, message) => {
      const devices = currentDashboardData.androidDevices.map((device) => device.deviceId === deviceId ? mutation(device) : device);
      currentDashboardData = { ...currentDashboardData, androidDevices: devices };
      return { ok: true, message, devices };
    };
    window.__openedExternalUrls = [];
    window.__stockImageAnalysisCalls = [];
    window.__stockImageApplyCalls = [];
    window.__reportRanges = [];
    window.__reportAiCalls = [];
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: { webModuleUrl: setupData.webModuleUrl, hasSyncSecret: true },
        databasePath: dashboardData.databasePath,
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: dashboardData.backupPath,
        setup: setupData
      }),
      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      onSyncStatusChanged: () => () => {},
      getReportData: async (range) => {
        window.__reportRanges.push(range);
        return {
          ok: true,
          data: {
            ...reportData,
            period: {
              preset: range.preset,
              label: range.label,
              startDate: range.startDate,
              endDate: range.endDate
            }
          }
        };
      },
      generateReportAiComment: async (input) => {
        window.__reportAiCalls.push(input);
        return {
          ok: true,
          content: "Seçilen dönemde 8 adisyon kapatıldı ve restoran cirosu ₺6.400 oldu."
        };
      },
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "desktop-smoke",
        requestCursor: 1,
        acknowledgedCursor: 1,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "Smoke sync bağlantısına ulaşılamadı.",
        consecutiveFailures: 2,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "offline",
        message: "Smoke sync bağlantısına ulaşılamadı."
      }),
      analyzeStockImage: async (input) => {
        window.__stockImageAnalysisCalls.push({
          importId: input.importId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          byteLength: input.bytes.byteLength
        });
        return {
          ok: true,
          message: "Görsel analiz edildi. Stoklar değişmeden önce satırları kontrol edin.",
          importId: input.importId,
          imageHash: "a".repeat(64),
          duplicateWarning: true,
          analysis: {
            document: {
              supplier_name: "Smoke Tedarikçi",
              invoice_number: "FTR-2026-42",
              invoice_date: "2026-07-22",
              document_confidence: "high"
            },
            lines: [
              {
                raw_text: "12 adet Yerel Serpme Kahvaltı",
                matched_menu_item_id: "item_local_preview",
                matched_menu_item_name: "Yerel Serpme Kahvaltı",
                suggested_quantity: 12,
                source_quantity_text: "12 adet",
                confidence: "high",
                needs_review_reason: null
              },
              {
                raw_text: "1 koli bilinmeyen ürün",
                matched_menu_item_id: null,
                matched_menu_item_name: null,
                suggested_quantity: null,
                source_quantity_text: "1 koli",
                confidence: "low",
                needs_review_reason: "Koli adede çevrilemedi."
              },
              {
                raw_text: "Kaşarlı Köfte 3 KG",
                matched_menu_item_id: "item_gram_preview",
                matched_menu_item_name: "Kaşarlı Köfte",
                suggested_quantity: 3000,
                source_quantity_text: "3 KG",
                confidence: "high",
                needs_review_reason: null
              }
            ]
          }
        };
      },
      cancelStockImageAnalysis: async () => true,
      applyStockImageImport: async (input) => {
        window.__stockImageApplyCalls.push(input);
        const additions = new Map();
        for (const line of input.lines) {
          additions.set(line.menu_item_id, (additions.get(line.menu_item_id) || 0) + line.quantity);
        }
        currentDashboardData = {
          ...currentDashboardData,
          menu: {
            ...currentDashboardData.menu,
            items: currentDashboardData.menu.items.map((item) => additions.has(item.id)
              ? { ...item, stock_quantity: item.stock_quantity + additions.get(item.id) }
              : item)
          }
        };
        return {
          ok: true,
          message: "2 stok satırı güncellendi.",
          importId: input.importId,
          appliedLineCount: input.lines.length,
          totalQuantity: input.lines.reduce((total, line) => total + line.quantity, 0),
          dashboardData: currentDashboardData
        };
      },
      setAndroidDeviceRole: async (deviceId, role) => mutateDevice(deviceId, (device) => ({
        ...device,
        role,
        permissions: role === "admin"
          ? [...new Set([...device.permissions, "table_order.close_paid", "settings.view", "settings.edit", "android_devices.view", "android_devices.manage"])]
          : device.permissions.filter((permission) => !["table_order.close_paid", "settings.view", "settings.edit", "android_devices.view", "android_devices.manage"].includes(permission))
      }), role === "admin" ? "Telefon yönetici yapıldı." : "Telefon personel yapıldı."),
      setAndroidDevicePermissionGroups: async (deviceId, permissionGroups) => mutateDevice(deviceId, (device) => ({
        ...device,
        permissionGroups,
        permissions: permissionGroups.cashier
          ? [...new Set([...device.permissions, "table_order.close_paid"])]
          : device.permissions.filter((permission) => permission !== "table_order.close_paid")
      }), "Telefon görev alanları güncellendi."),
      setAndroidDeviceActive: async (deviceId, active) => mutateDevice(deviceId, (device) => ({ ...device, isActive: active, revokedAt: active ? "" : device.revokedAt }), active ? "Telefon yeniden aktif edildi." : "Telefon pasifleştirildi."),
      resetAndroidDevicePermissions: async (deviceId) => mutateDevice(deviceId, (device) => ({
        ...device,
        permissionGroups: { service_orders: true, cashier: false, rooms_tasks: true, customer_reservation: false }
      }), "Telefon görev alanları varsayılana döndürüldü."),
      revokeAndroidDevice: async (deviceId) => mutateDevice(deviceId, (device) => ({ ...device, isActive: false, revokedAt: new Date().toISOString() }), "Telefon kaldırıldı ve erişimi kapatıldı."),
      getAiWorkspaceHistory: async () => [],
      markWhatsAppMessageSent: async () => ({ ok: false, message: "smoke" }),
      openExternal: async (url) => {
        window.__openedExternalUrls.push(url);
        return true;
      }
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345", aiApiKeyConfigured: false },
    dashboardData: createDashboardConversionFixture(),
    reportData: createReportFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture({ ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345", aiApiKeyConfigured: false })
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "pro");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.ui-preferences")))).toEqual({
    theme: "dark",
    scale: 1,
    mode: "pro"
  });
  const notificationBell = page.getByRole("button", { name: /Bildirimler, \d+ uyarı/ });
  await expect(notificationBell).toBeVisible();
  await notificationBell.click();
  const notificationCenter = page.getByRole("dialog", { name: "Bildirim merkezi" });
  await expect(notificationCenter.getByText("Yeni müşteri talebi", { exact: true })).toBeVisible();
  await expect(notificationCenter.getByText("Rezervasyon onay bekliyor", { exact: true })).toBeVisible();
  await expect(notificationCenter.getByText("Masa hesap bekliyor", { exact: true })).toBeVisible();
  await expect(notificationCenter.getByText(/Günlük iş (?:bekliyor|gecikti)/)).toHaveCount(2);
  await expect(notificationCenter.getByText("Web bağlantı sorunu", { exact: true })).toBeVisible();
  await expect(notificationCenter.getByText("Android işlemi uygulanamadı", { exact: true })).toBeVisible();
  await notificationCenter.locator(".notification-item", { hasText: "Yeni müşteri talebi" }).getByRole("button", { name: /ilgili sayfaya git/ }).click();
  await expect(page.getByRole("heading", { name: "Müşteri İşleri", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ayarlar" }).click();
  const settings = page.locator(".setup-capabilities");
  const sectionNav = settings.getByRole("navigation", { name: "Ayar bölümleri" });
  await expect(sectionNav.getByRole("link")).toHaveCount(5);
  for (const [name, target] of [
    ["İşletme", "settings-business"],
    ["İşletme düzeni", "settings-operations"],
    ["Servisler", "settings-connections"],
    ["Uygulama", "settings-application"],
    ["Özellikler", "settings-capabilities"]
  ]) {
    await expect(sectionNav.getByRole("link", { name, exact: true })).toHaveAttribute("href", `#${target}`);
    await expect(settings.locator(`#${target}`)).toBeVisible();
  }
  await expect(settings.getByRole("tab", { name: /Temel Ayarlar|Gelişmiş Ayarlar/ })).toHaveCount(0);
  await expect(settings.getByRole("heading", { name: "İşletme", exact: true })).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Müşteriye Açık Bilgiler" })).toBeVisible();
  await expect(settings.getByRole("heading", { name: "İşletme Düzeni" })).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Servisler", exact: true })).toBeVisible();
  await expect(settings.locator(".settings-service-card", { hasText: "Web Modülü" })).toBeVisible();
  await expect(settings.locator(".settings-service-card", { hasText: "AI Yardımcı" })).toBeVisible();
  await expect(settings.locator(".settings-capability-group-card")).toHaveCount(4);
  await expect(settings.getByRole("switch", { name: "Odalar: Açık" })).toBeVisible();
  await expect(settings.getByRole("switch", { name: "Stok: Açık" })).toBeVisible();
  await expect(settings.getByRole("switch", { name: "Barkod: Kapalı" })).toBeVisible();
  const roomsCapability = settings.locator(".settings-capability-row", { hasText: "Odalar" });
  await expect(roomsCapability.getByText("Bağımlı", { exact: true })).toBeVisible();
  await expect(roomsCapability.getByRole("switch")).toBeDisabled();
  await expect(settings.getByText(/accommodation\.reservations|commerce\.inventory|retail\.barcode/)).toHaveCount(0);
  expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const tableCategoryEditor = page.locator(".table-category-editor");
  await expect(tableCategoryEditor.getByText("Masa kategorileri", { exact: true })).toBeVisible();
  await expect(tableCategoryEditor.locator(".table-category-row")).toHaveCount(2);
  await expect(tableCategoryEditor.locator(".table-category-heading > span")).toHaveText("2 masa");
  await expect(tableCategoryEditor.locator(".table-category-row").nth(0).getByRole("textbox")).toHaveValue("Bahçe");
  await expect(tableCategoryEditor.locator(".table-category-row").nth(1).getByRole("textbox")).toHaveValue("Salon");
  await tableCategoryEditor.getByRole("button", { name: "Kategori Ekle" }).click();
  await expect(tableCategoryEditor.locator(".table-category-row")).toHaveCount(3);
  await tableCategoryEditor.locator(".table-category-row").nth(2).getByRole("textbox").fill("Teras");
  await expect(tableCategoryEditor.locator(".table-category-heading > span")).toHaveText("3 masa");
  await tableCategoryEditor.getByRole("button", { name: "Teras satırını kaldır" }).click();
  await expect(tableCategoryEditor.locator(".table-category-row")).toHaveCount(2);
  const androidDeviceSection = page.locator(".settings-android-devices-section");
  await expect(androidDeviceSection.getByRole("heading", { name: "Telefon Kurulumu" })).toBeVisible();
  await expect(androidDeviceSection.getByRole("button", { name: "USB Cihazları Yenile" })).toBeVisible();
  await expect(androidDeviceSection.getByRole("heading", { name: "Cihazlar ve Yetkiler" })).toBeVisible();
  await expect(androidDeviceSection.getByText("Smoke Personel Telefonu", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("Personel", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("Servis + Oda işleri", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText(/izin ·|Hesap kapatamaz|table_order\.close_paid/)).toHaveCount(0);
  const cashierGroup = androidDeviceSection.getByRole("checkbox", { name: /Kasa \/ Hesap/ });
  await expect(cashierGroup).not.toBeChecked();
  await cashierGroup.check();
  await expect(androidDeviceSection.getByText("Servis + Kasa + Oda işleri", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("Telefon görev alanları güncellendi.", { exact: true })).toBeVisible();
  await androidDeviceSection.getByRole("button", { name: "Yönetici Yap" }).click();
  await expect(androidDeviceSection.getByText("Yönetici", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("Etkin yeteneklerde tüm izinler", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByRole("checkbox")).toHaveCount(0);
  await androidDeviceSection.getByRole("button", { name: "Personel Yap" }).click();
  await expect(androidDeviceSection.getByText("Telefon personel yapıldı.", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByRole("checkbox", { name: /Kasa \/ Hesap/ })).toBeChecked();
  await androidDeviceSection.getByRole("button", { name: "Yetkileri Sıfırla" }).click();
  await expect(androidDeviceSection.getByText("Telefon görev alanları varsayılana döndürüldü.", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("Servis + Oda işleri", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByRole("checkbox", { name: /Kasa \/ Hesap/ })).not.toBeChecked();
  await androidDeviceSection.getByRole("button", { name: "Yönetici Yap" }).click();
  await expect(androidDeviceSection.getByText("Yönetici", { exact: true })).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("android-smok…ce-001");
    await dialog.accept();
  });
  await androidDeviceSection.getByRole("button", { name: "Kaldır" }).click();
  await expect(androidDeviceSection.getByText("Telefon kaldırıldı ve erişimi kapatıldı.", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.locator(".android-device-list")).toHaveCount(0);
  await expect(androidDeviceSection.getByText("0 cihaz", { exact: true })).toBeVisible();
  const removedDevices = androidDeviceSection.locator(".android-removed-devices");
  await expect(removedDevices.getByText("Kaldırılan cihazlar", { exact: true })).toBeVisible();
  await removedDevices.locator("summary").click();
  await expect(removedDevices.locator(".android-removed-device-row").getByText("Smoke Personel Telefonu", { exact: true })).toBeVisible();
  await expect(removedDevices.getByText("Yönetici", { exact: true })).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("android-smok…ce-001");
    expect(dialog.message()).toContain("Yönetici rolü");
    await dialog.accept();
  });
  await removedDevices.getByRole("button", { name: /Smoke Personel Telefonu.*cihazını geri yükle/ }).click();
  await expect(androidDeviceSection.locator(".android-device-list").getByText("Smoke Personel Telefonu", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.locator(".android-device-list").getByText("Yönetici", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("Etkin yeteneklerde tüm izinler", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("1 cihaz", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.locator(".android-removed-devices")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ayarları Kaydet", exact: true })).toHaveCount(1);
  await expect(page.locator(".setup-footer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Panele Dön" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "İşletme", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Görünüm", exact: true })).toBeVisible();
  await expect(page.getByText("Firma Bilgileri", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Modüller", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Kapasite ve Yardımcı", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Büyük ve Sade Görünüm/ })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Kompakt ve Gelişmiş Görünüm" })).toBeChecked();
  await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1");
  await expect(page.getByLabel("Karanlık tema")).toBeChecked();
  await page.getByLabel("Arayüz ölçeği").selectOption("1.1");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "pro");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).zoom)).toBe("1.1");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.ui-preferences")))).toEqual({ theme: "dark", scale: 1.1, mode: "pro" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Ayarlar" }).click();
  await expect(page.getByRole("radio", { name: "Kompakt ve Gelişmiş Görünüm" })).toBeChecked();
  await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1.1");
  await expect(page.getByLabel("Karanlık tema")).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "pro");
  await page.screenshot({ path: "artifacts/screenshots/desktop-settings-dark.png", fullPage: true });
  await page.getByLabel("Arayüz ölçeği").selectOption("1");
  await page.locator("label.appearance-theme-toggle").click();
  await expect(page.getByLabel("Karanlık tema")).not.toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "pro");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.ui-preferences")))).toEqual({ theme: "light", scale: 1, mode: "pro" });
  await page.locator("label.appearance-theme-toggle").click();
  await expect(page.getByLabel("Karanlık tema")).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("label.appearance-theme-toggle").click();
  await expect(page.getByLabel("Karanlık tema")).not.toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "pro");
  await page.getByRole("button", { name: "Ayarlar" }).click();
  await page.locator(".setup-ai-section").getByRole("checkbox").check();
  await expect(page.getByLabel("Servis sağlayıcı")).toBeEnabled();
  await page.locator(".setup-ai-section").getByRole("checkbox").uncheck();
  await expect(page.getByLabel("Servis sağlayıcı")).toBeDisabled();
  await page.locator(".setup-ai-section").getByRole("checkbox").check();
  await expect(page.locator(".settings-web-section .setup-section-title > p")).toHaveCount(0);
  await expect(page.getByText("AI Bağlantısı", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Bu Bilgisayar", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Demo sitenin kurulu web modülü kullanılır; sonuna api/sync.php eklemeyin.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Seçtiğiniz bağlantı masaüstündeki cevap taslaklarında kullanılır ve kaydettiğinizde web modülüne güvenli biçimde uygulanır.", { exact: true })).toHaveCount(0);
  await page.getByLabel("Servis sağlayıcı").selectOption("gemini");
  await expect(page.getByText("Google AI Studio hızlı kurulum", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Google AI Studio'yu Aç" })).toBeVisible();
  await expect(page.getByLabel("Google AI Studio cURL bağlantısı")).toBeVisible();
  await expect(page.getByLabel("Model adı")).toHaveAttribute("placeholder", "Bağlantı kontrolünden sonra listelenir");
  await expect(page.getByLabel("Model adı")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Bağlantıyı Dene" })).toBeDisabled();
  await expect(page.locator(".setup-ai-section").getByRole("button", { name: "Google AI Studio'yu Aç" })).toBeEnabled();
  await expect(page.locator(".setup-ai-section").getByRole("button", { name: "Göster" })).toBeEnabled();
  await expect(page.locator(".setup-ai-section").getByRole("button", { name: "Bağlantıyı Dene" })).toBeDisabled();
  await page.getByLabel("Google AI Studio cURL bağlantısı").fill("curl https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent -H 'X-goog-api-key: AQ.smoke-key'");
  await expect(page.getByRole("button", { name: "Bağlantıyı Dene" })).toBeEnabled();
  await page.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  expect(await page.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator(".nav-item")).toHaveCount(9);
  await expect(page.getByRole("button", { name: "AI Yardımcı", exact: true })).toHaveCount(0);
  await expect(page.getByText("Web eşitleme adresi")).toHaveCount(0);
  await expect(page.getByText("Yerel kayıt dosyası")).toHaveCount(0);
  await expect(page.getByText("Yedek klasörü")).toHaveCount(0);
  await page.getByRole("button", { name: "Kasa", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kasa", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText("Bugün Gelen", { exact: true })).toBeVisible();
  await expect(page.getByText("Bugün Çıkan", { exact: true })).toBeVisible();
  await expect(page.getByText("Bugünkü Fark", { exact: true })).toBeVisible();
  await expect(page.getByText("Bekleyen Alacak", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gelir Ekle", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gider Ekle", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Menü", exact: true })).toBeVisible();
  await expect(page.locator(".page-header-copy > p")).toHaveText("Kategori ve ürünleri düzenleyip web menüsünü yayınlayın.");
  await expect(page.getByRole("heading", { name: "Kategoriler", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ürünler", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ürün Detayı", exact: true })).toBeVisible();
  const stockImageTrigger = page.getByRole("button", { name: "AI ile Stok Ekle", exact: true });
  await expect(stockImageTrigger).toBeVisible();
  await stockImageTrigger.click();
  const stockImageDialog = page.getByRole("dialog", { name: "AI ile Stok Ekle" });
  await expect(stockImageDialog).toBeVisible();
  await expect(stockImageDialog.getByText(/uygulama görseli kalıcı saklamaz/)).toBeVisible();
  await expect(stockImageDialog.getByRole("button", { name: "Analiz Et" })).toBeDisabled();
  await stockImageDialog.locator(".stock-image-file-input").setInputFiles({
    name: "smoke-fatura.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
  });
  const stockImagePreview = stockImageDialog.getByAltText("Seçilen fatura veya fiş önizlemesi");
  await expect(stockImagePreview).toBeVisible();
  await expect.poll(() => stockImagePreview.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await stockImageDialog.getByRole("button", { name: "Analiz Et" }).click();
  await expect(stockImageDialog.getByText("Smoke Tedarikçi", { exact: true })).toBeVisible();
  await expect(stockImageDialog.locator(".stock-image-row")).toHaveCount(3);
  await expect(stockImageDialog.getByRole("button", { name: "Stokları Güncelle" })).toBeDisabled();
  await stockImageDialog.locator(".stock-image-row").nth(1).getByRole("button", { name: "Yok say" }).click();
  await stockImageDialog.getByRole("button", { name: "Manuel satır ekle" }).click();
  const manualStockLine = stockImageDialog.locator(".stock-image-row").last();
  await manualStockLine.locator("select").selectOption("item_local_preview");
  await manualStockLine.locator("input[type='number']").fill("4");
  await stockImageDialog.getByRole("checkbox").check();
  await expect(stockImageDialog.getByRole("button", { name: "Stokları Güncelle" })).toBeEnabled();
  await page.screenshot({ path: "artifacts/screenshots/desktop-stock-image-review.png", fullPage: true });
  await stockImageDialog.getByRole("button", { name: "Stokları Güncelle" }).click();
  await expect(stockImageDialog.getByRole("heading", { name: "Stok girişi tamamlandı" })).toBeVisible();
  await expect(stockImageDialog.getByText("3 satırda 16 adet + 3.000 g stok eklendi.", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__stockImageAnalysisCalls.at(-1)?.mimeType)).toBe("image/jpeg");
  await expect.poll(() => page.evaluate(() => window.__stockImageApplyCalls.at(-1))).toMatchObject({
    imageHash: "a".repeat(64),
    duplicateWarningAcknowledged: true,
    lines: [
      { menu_item_id: "item_local_preview", quantity: 12 },
      { menu_item_id: "item_gram_preview", quantity: 3000 },
      { menu_item_id: "item_local_preview", quantity: 4 }
    ]
  });
  await stockImageDialog.getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(stockImageDialog).toHaveCount(0);
  await expect(page.locator(".menu-category-panel .menu-panel-heading .status-badge")).toHaveText(/\d+ kayıt/);
  await expect(page.locator(".menu-product-panel .menu-panel-heading .status-badge")).toHaveText(/\d+ kayıt/);
  await expect(page.locator(".menu-category-panel .menu-panel-heading p")).toHaveText("Menüdeki ürün gruplarını yönetin.");
  await expect(page.getByRole("button", { name: "Kategoriyi Kaydet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ürünü Kaydet" })).toBeVisible();
  await page.locator(".menu-category-panel .menu-record").filter({ hasText: "Yerel Kahvaltı" }).first().click();
  await expect(page.getByRole("button", { name: "Kategoriyi Sil" })).toBeVisible();
  await page.locator(".menu-product-panel .menu-record").filter({ hasText: "Yerel Serpme Kahvaltı" }).first().click();
  await expect(page.getByRole("button", { name: "Ürünü Sil" })).toBeVisible();
  await page.getByRole("button", { name: "Ürünü Sil" }).click();
  const menuDeleteDialog = page.getByRole("dialog", { name: "Ürünü sil" });
  await expect(menuDeleteDialog).toBeVisible();
  await expect(menuDeleteDialog.getByText(/ürünü menüden silinecek\./)).toBeVisible();
  await menuDeleteDialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(menuDeleteDialog).toHaveCount(0);
  await page.getByLabel("Ürün adı").fill("Canlı Serpme Kahvaltı");
  await expect(page.getByRole("button", { name: "Önizle", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Önizle", exact: true }).click();
  const localMenuPreview = page.getByRole("dialog", { name: "Yerel Menü Önizlemesi" });
  await expect(localMenuPreview).toBeVisible();
  await expect(localMenuPreview.getByText("Canlı Serpme Kahvaltı", { exact: true })).toBeVisible();
  await expect(localMenuPreview.getByText("Gizli Menü Ürünü", { exact: true })).toHaveCount(0);
  await localMenuPreview.getByRole("button", { name: "Tüm Ürünler" }).click();
  await expect(localMenuPreview.getByRole("button", { name: "Tüm Ürünler" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.__openedExternalUrls)).toEqual([]);
  await page.screenshot({ path: "artifacts/screenshots/desktop-local-menu-preview.png", fullPage: true });
  await localMenuPreview.getByRole("button", { name: "Önizlemeyi kapat" }).click();
  await expect(localMenuPreview).toHaveCount(0);
  await page.getByLabel("Ürün adı").fill("Yerel Serpme Kahvaltı");
  await expect(page.getByRole("button", { name: "Web'e Yayınla", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Yayınla", exact: true })).toHaveCount(0);
  await expect(page.locator(".menu-category-panel").getByLabel("Sıra", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/desktop-qr-menu-manager.png", fullPage: true });

  await expect(page.locator(".menu-management-grid")).toBeVisible();

  await page.getByRole("button", { name: "Mesajlar" }).click();
  expect(await page.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.getByRole("heading", { name: "Mesajlar" })).toBeVisible();
  await expect(page.getByText("İletişim", { exact: true })).toHaveCount(0);
  await expect(page.locator(".whatsapp-request-panel .panel-heading")).toContainText("Talepler");
  await expect(page.locator(".whatsapp-request-panel .panel-heading .status-badge")).toHaveText(/\d+ kayıt/);
  await expect(page.locator(".whatsapp-request-panel .panel-heading p")).toHaveCount(0);
  await expect(page.locator(".whatsapp-copy-panel").getByRole("heading", { name: "Smoke Misafir" })).toBeVisible();
  await expect(page.locator(".whatsapp-copy-panel .message-detail-category-label")).toHaveText("Hazır yanıt");
  await expect(page.locator(".whatsapp-copy-panel .panel-heading p")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hazır Mesajı Kopyala" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mesajı Sil" })).toBeVisible();
  await expect(page.getByText("AI ile mesajı düzenle", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI Araçları", exact: true })).toHaveCount(0);
  await expect(page.locator(".whatsapp-webview-frame")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Mesaj Hazırla" })).toHaveAttribute("aria-selected", "true");
  expect(await page.getByLabel("Hazır WhatsApp mesajı").evaluate((field) => getComputedStyle(field).overflowY)).toBe("auto");
  await page.screenshot({ path: "artifacts/screenshots/desktop-messages-safe-mode.png", fullPage: true });
  await page.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await expect(page.getByText("WhatsApp Web modu isteğe bağlıdır.", { exact: false })).toHaveCount(0);
  await expect(page.locator(".whatsapp-live-panel .panel-heading p")).toHaveCount(0);
  await expect(page.locator(".whatsapp-live-panel .panel-heading .status-badge")).toHaveCount(0);
  await expect(page.locator(".whatsapp-send-status")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Smoke Misafir" })).toBeVisible();
  const webControlBar = page.locator(".whatsapp-web-control-bar");
  await expect(webControlBar).toContainText("+90 532 123 45 67");
  await expect(webControlBar.getByText("Hazır mesaj var", { exact: true })).toBeVisible();
  await expect(webControlBar.getByRole("button", { name: "Hazır Mesajı Kopyala" })).toBeVisible();
  await expect(webControlBar.getByRole("button", { name: "Müşteri Numarasına Git" })).toBeVisible();
  await expect(webControlBar.getByRole("button", { name: "Dışarıda Aç" })).toBeVisible();
  await expect(webControlBar.getByRole("button", { name: "Güvenli Moda Dön" })).toBeVisible();
  await expect(webControlBar.getByRole("button", { name: "Onayla ve Gönder" })).toBeVisible();
  await expect(page.locator(".whatsapp-webview-frame")).toBeVisible();
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("src", "https://web.whatsapp.com/");
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("partition", "persist:yardimci-whatsapp");
  expect(readFileSync("apps/desktop-app/src/components/messages/MessageWorkspaces.tsx", "utf8")).toContain("allowpopups");
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("webpreferences", "contextIsolation=yes,nodeIntegration=no");
  await page.locator(".whatsapp-webview").evaluate((element) => { element.dataset.persistenceMarker = "webview-kept-alive"; });
  await webControlBar.getByRole("button", { name: "Güvenli Moda Dön" }).click();
  await expect(page.getByRole("tab", { name: "Mesaj Hazırla" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".message-mode-content.is-hidden .whatsapp-webview")).toHaveCount(1);
  await page.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("data-persistence-marker", "webview-kept-alive");
  await page.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  await expect(page.locator(".persistent-messages-page.is-hidden .whatsapp-webview")).toHaveCount(1);
  await page.getByRole("button", { name: "Mesajlar", exact: true }).click();
  await expect(page.getByRole("tab", { name: "WhatsApp", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("data-persistence-marker", "webview-kept-alive");

  expect(await page.locator(".whatsapp-webview").evaluate((element) => getComputedStyle(element).display)).toBe("flex");
  await page.screenshot({ path: "artifacts/screenshots/desktop-whatsapp-workspace.png", fullPage: true });
  await page.getByRole("button", { name: "Müşteri Numarasına Git" }).click();
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute(
    "src",
    /^https:\/\/web\.whatsapp\.com\/send\?phone=905321234567&text=/
  );
  await page.locator(".whatsapp-webview").evaluate((element) => {
    let executionCount = 0;
    Object.defineProperty(element, "getURL", {
      configurable: true,
      value: () => element.getAttribute("src") || ""
    });
    Object.defineProperty(element, "executeJavaScript", {
      configurable: true,
      value: async (code) => {
        executionCount += 1;
        if (executionCount === 1) {
          if (!code.includes("message_mismatch") || !code.includes("location.origin")) {
            throw new Error("WhatsApp DOM inspection guards are missing");
          }
          return {
            ok: true,
            code: "ready",
            message: "Sohbet ve mesaj doğrulandı.",
            chatTitle: "Demo Misafir",
            composerText: "Hazır mesaj"
          };
        }
        if (!code.includes("approval_changed") || !code.includes("sendControl.click()")) {
          throw new Error("WhatsApp approved send guards are missing");
        }
        return {
          ok: true,
          code: "sent",
          message: "Gönderim tamamlandı.",
          chatTitle: "Demo Misafir"
        };
      }
    });
  });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("WhatsApp Web üzerinden mesaj gönderilecek");
    expect(dialog.message()).toContain("Açık sohbet: Demo Misafir");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Onayla ve Gönder" }).click();
  await expect(page.locator(".whatsapp-send-status")).toContainText("Mesaj WhatsApp Web'e gönderildi");

  const conversionPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await conversionPage.addInitScript(({ setupData, dashboardData, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ theme: "light", scale: 1, mode: "pro" }));
    }
    let currentDashboardData = dashboardData;
    window.__identityAnalysisCalls = [];
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: {
          webModuleUrl: setupData.webModuleUrl,
          hasSyncSecret: true
        },
        databasePath: "/tmp/yardimci-asistan.sqlite",
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: "/tmp/yardimci-asistan/backups",
        setup: setupData
      }),
      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "renderer-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: () => () => {},
      saveInitialSetup: async () => ({ ok: false, message: "smoke" }),
      createManualRequest: async (input) => {
        const savedId = "request_manual_smoke_001";
        const request = {
          id: savedId,
          customer_id: "customer_manual_smoke_001",
          source: "manual",
          request_type: input.requestType,
          status: "new",
          customer_name: input.customerName,
          customer_phone: "+905553334466",
          date_text: input.dateText,
          start_date: input.startDate,
          end_date: input.endDate,
          time: input.time,
          guest_count: input.guestCount,
          adult_count: 0,
          child_count: 0,
          message: input.message,
          ai_summary: "",
          ai_suggested_reply: "",
          whatsapp_message: "Merhaba, talebinizi aldık. Detayları kontrol edip size dönüş yapacağız.",
          assigned_to: "",
          priority: input.priority,
          sync_status: "local_only",
          created_at: "2026-07-11T10:20:00+03:00",
          updated_at: "2026-07-11T10:20:00+03:00"
        };
        currentDashboardData = {
          ...currentDashboardData,
          summary: {
            ...currentDashboardData.summary,
            newRequests: currentDashboardData.summary.newRequests + 1,
            waitingRequests: currentDashboardData.summary.waitingRequests + 1
          },
          requests: [request, ...currentDashboardData.requests],
          customers: [
            ...currentDashboardData.customers,
            {
              id: request.customer_id,
              fullName: input.customerName,
              phone: request.customer_phone,
              email: "",
              source: "manual",
              notes: input.message,
              tags: ["manuel", "talep"],
              lastContactAt: "2026-07-11T10:20:00+03:00",
              identityType: "",
              identityNumber: "",
              nationality: "",
              birthDate: "",
              gender: "",
              documentSerialNumber: "",
              documentExpiryDate: "",
              birthPlace: "",
              motherName: "",
              fatherName: "",
              issuingAuthority: "",
              address: "",
              requestCount: 1,
              reservationCount: 0,
              stayCount: 0,
              updatedAt: "2026-07-11T10:20:00+03:00"
            }
          ]
        };
        return {
          ok: true,
          message: "Manuel talep kaydedildi.",
          savedId,
          dashboardData: currentDashboardData
        };
      },
      analyzeIdentityImage: async (input) => {
        window.__identityAnalysisCalls.push({
          fileName: input.fileName,
          mimeType: input.mimeType,
          byteLength: input.bytes.byteLength
        });
        return {
          ok: true,
          message: "Kimlik bilgileri okundu. Kaydetmeden önce kontrol edin.",
          analysis: {
            document_type: "passport",
            document_side: "front",
            confidence: "high",
            fields: {
              full_name: "Kimlik Smoke",
              identity_type: "passport",
              identity_number: "U12345678",
              nationality: "Türkiye",
              birth_date: "1991-04-23",
              gender: "female",
              document_serial_number: "PASS-7788",
              document_expiry_date: "2031-04-23",
              birth_place: "Muğla",
              mother_name: "",
              father_name: "",
              issuing_authority: "Türkiye Cumhuriyeti",
              address: ""
            },
            warnings: []
          }
        };
      },
      saveCustomer: async (input) => {
        const savedId = input.id || "customer_manual_card_smoke_001";
        const now = "2026-07-28T12:00:00+03:00";
        const previous = currentDashboardData.customers.find((customer) => customer.id === savedId);
        const savedCustomer = {
          id: savedId,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          source: previous?.source || "manual",
          notes: input.notes,
          tags: input.tags,
          lastContactAt: previous?.lastContactAt || now,
          identityType: input.identityType,
          identityNumber: input.identityNumber,
          nationality: input.nationality,
          birthDate: input.birthDate,
          gender: input.gender,
          documentSerialNumber: input.documentSerialNumber,
          documentExpiryDate: input.documentExpiryDate,
          birthPlace: input.birthPlace,
          motherName: input.motherName,
          fatherName: input.fatherName,
          issuingAuthority: input.issuingAuthority,
          address: input.address,
          requestCount: previous?.requestCount || 0,
          reservationCount: previous?.reservationCount || 0,
          stayCount: previous?.stayCount || 0,
          updatedAt: now
        };
        currentDashboardData = {
          ...currentDashboardData,
          customers: previous
            ? currentDashboardData.customers.map((customer) => customer.id === savedId ? savedCustomer : customer)
            : [savedCustomer, ...currentDashboardData.customers]
        };
        return {
          ok: true,
          message: previous ? "Müşteri kartı güncellendi." : "Müşteri kartı oluşturuldu.",
          savedId,
          dashboardData: currentDashboardData
        };
      },
      assignCustomerRoom: async (input) => {
        const savedId = "customer_room_stay_smoke_001";
        const customer = currentDashboardData.customers.find((item) => item.id === input.customerId);
        const room = currentDashboardData.rooms.find((item) => item.id === input.roomId);
        const now = "2026-07-28T12:10:00+03:00";
        const stay = {
          id: savedId,
          customerId: customer.id,
          customerName: customer.fullName,
          customerPhone: customer.phone,
          roomId: room.id,
          roomName: room.name,
          roomNumber: room.number,
          reservationId: "",
          status: input.status,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          guestCount: input.guestCount,
          notes: input.notes,
          source: "desktop_manual",
          checkedInAt: input.status === "checked_in" ? now : "",
          checkedOutAt: "",
          createdAt: now,
          updatedAt: now
        };
        currentDashboardData = {
          ...currentDashboardData,
          customerRoomStays: [stay, ...currentDashboardData.customerRoomStays],
          customers: currentDashboardData.customers.map((item) => item.id === customer.id
            ? { ...item, stayCount: item.stayCount + 1, updatedAt: now }
            : item),
          rooms: currentDashboardData.rooms.map((item) => item.id === room.id
            ? { ...item, status: input.status === "checked_in" ? "occupied" : "reserved", updatedAt: now }
            : item)
        };
        return {
          ok: true,
          message: "Müşteri oda kaydı oluşturuldu.",
          savedId,
          dashboardData: currentDashboardData
        };
      },
      updateCustomerRoomStayStatus: async ({ stayId, status }) => {
        const stay = currentDashboardData.customerRoomStays.find((item) => item.id === stayId);
        const now = "2026-07-28T12:20:00+03:00";
        const roomStatus = status === "checked_in"
          ? "occupied"
          : status === "planned"
            ? "reserved"
            : status === "checked_out"
              ? "cleaning"
              : "available";
        currentDashboardData = {
          ...currentDashboardData,
          customerRoomStays: currentDashboardData.customerRoomStays.map((item) => item.id === stayId
            ? {
                ...item,
                status,
                checkedInAt: status === "checked_in" ? (item.checkedInAt || now) : item.checkedInAt,
                checkedOutAt: status === "checked_out" ? now : "",
                updatedAt: now
              }
            : item),
          rooms: currentDashboardData.rooms.map((room) => room.id === stay.roomId
            ? { ...room, status: roomStatus, updatedAt: now }
            : room)
        };
        return {
          ok: true,
          message: "Konaklama durumu güncellendi.",
          savedId: stayId,
          dashboardData: currentDashboardData
        };
      },
      convertRequestToReservation: async (requestId) => {
        currentDashboardData = {
          ...currentDashboardData,
          summary: {
            ...currentDashboardData.summary,
            newRequests: 0,
            waitingRequests: 0
          },
          requests: currentDashboardData.requests.map((request) => request.id === requestId ? { ...request, status: "converted_to_reservation" } : request)
        };
        return {
          ok: true,
          message: "Talep rezervasyona çevrildi ve onaylandı.",
          reservationId: "reservation_smoke_001",
          dashboardData: currentDashboardData
        };
      },
      updateRequestStatus: async ({ requestId, status }) => {
        currentDashboardData = {
          ...currentDashboardData,
          requests: currentDashboardData.requests.map((request) => request.id === requestId ? { ...request, status } : request)
        };
        return { ok: true, message: "Talep durumu güncellendi.", dashboardData: currentDashboardData };
      },
      updateRoomStatus: async ({ roomId, status }) => ({
        ok: true,
        message: "Oda durumu güncellendi.",
        dashboardData: {
          ...dashboardData,
          rooms: dashboardData.rooms.map((room) => room.id === roomId ? { ...room, status } : room)
        }
      }),
      updateTableStatus: async ({ tableId, status }) => ({
        ok: true,
        message: "Masa durumu güncellendi.",
        dashboardData: {
          ...dashboardData,
          tables: dashboardData.tables.map((table) => table.id === tableId ? { ...table, status } : table)
        }
      }),
      updateReservationStatus: async ({ reservationId, status }) => ({
        ok: true,
        message: "Rezervasyon durumu güncellendi.",
        dashboardData: {
          ...dashboardData,
          reservations: dashboardData.reservations.map((reservation) => reservation.id === reservationId ? { ...reservation, status } : reservation)
        }
      }),
      updateDailyTaskStatus: async ({ taskId, status }) => ({
        ok: true,
        message: "Günlük iş durumu güncellendi.",
        dashboardData: {
          ...dashboardData,
          dailyTasks: dashboardData.dailyTasks.map((task) => task.id === taskId ? { ...task, status } : task)
        }
      }),
      createManualBackup: async () => {
        const backup = {
          id: "backup-smoke-001",
          createdAt: "2026-07-11T10:16:00+03:00",
          kind: "manual",
          folderName: "yardimci-asistan-smoke",
          folderPath: "/tmp/yardimci-asistan/backups/yardimci-asistan-smoke",
          databaseFileName: "yardimci-asistan.sqlite",
          imageCount: 0,
          sizeBytes: 4096
        };
        return {
          ok: true,
          message: "Yerel veritabanı yedeği oluşturuldu.",
          backupDirectory: "/tmp/yardimci-asistan/backups",
          backup,
          backups: [backup]
        };
      },
      createOwnerReplySuggestion: async (requestId) => ({
        ok: true,
        message: "AI cevap taslağı yenilendi.",
        requestId,
        summary: "Smoke Misafir için balkonlu oda talebi.",
        suggestedReply: "Merhaba Smoke Misafir, talebinizi aldık. Müsaitlik ve fiyat bilgisi işletme sahibi tarafından kontrol edilip size dönüş yapılacaktır.",
        missingFields: [],
        dashboardData: {
          ...dashboardData,
          requests: dashboardData.requests.map((request) =>
            request.id === requestId
              ? {
                  ...request,
                  ai_summary: "Smoke Misafir için balkonlu oda talebi.",
                  ai_suggested_reply: "Merhaba Smoke Misafir, talebinizi aldık. Müsaitlik ve fiyat bilgisi işletme sahibi tarafından kontrol edilip size dönüş yapılacaktır."
                }
              : request
          )
        }
      }),
      getAiWorkspaceHistory: async () => [],
      generateAiWorkspace: async (input) => ({
        ok: true,
        message: "AI sonucu hazırlandı. Düzenleyip kullanabilirsiniz.",
        entry: {
          id: "ai_conv_smoke_001",
          mode: input.mode,
          requestId: input.requestId,
          requestLabel: input.mode === "daily" ? "Günlük işletme özeti" : "Smoke Misafir • Pansiyon rezervasyonu",
          instructions: input.instructions,
          content: input.mode === "daily"
            ? "Öncelikler\n• Yeni talepleri kontrol edin.\nRiskler\n• Bekleyen rezervasyonları değerlendirin."
            : "Merhaba Smoke Misafir, talebinizi aldık. Müsaitlik ve fiyat bilgisi kontrol edilip size dönüş yapılacaktır.",
          summary: input.mode === "daily" ? "Günlük işletme değerlendirmesi" : "Smoke Misafir için balkonlu oda talebi.",
          missingFields: [],
          provider: "openai_compatible",
          model: "smoke-model",
          fallback: false,
          createdAt: "2026-07-13T15:30:00+03:00"
        }
      }),
      saveAiWorkspaceResult: async (input) => ({
        ok: true,
        message: input.mode === "summary" ? "AI özeti talebe kaydedildi." : "AI cevap taslağı talebe kaydedildi.",
        requestId: input.requestId,
        dashboardData
      }),
      pullRequests: async () => ({ ok: true, count: 0, requests: [] }),
      markRequestsSynced: async () => ({ ok: true, count: 0 }),
      pushMenu: async () => ({ ok: true, category_count: 0, item_count: 0 }),
      pushAndroidSnapshot: async () => ({
        ok: true,
        message: "Android özeti yayınlandı.",
        published_at: "2026-07-11T10:17:00+03:00",
        updated_at: "2026-07-11T10:17:00+03:00",
        task_count: 2
      }),
      saveMenuCategory: async () => ({ ok: false, message: "smoke" }),
      saveMenuItem: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345" },
    dashboardData: createDashboardConversionFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture({ ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345" })
  });
  await conversionPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(conversionPage.locator("html")).toHaveAttribute("data-mode", "pro");
  await conversionPage.getByRole("button", { name: "Ayarlar" }).click();
  await expect(conversionPage.getByRole("button", { name: "Yedek Al" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Yedek Al" }).click();
  await expect(conversionPage.locator(".settings-data-maintenance-section .backup-row")).toHaveCount(1);
  await expect(conversionPage.locator(".settings-data-maintenance-section").getByText("Yerel veritabanı yedeği oluşturuldu.")).toBeVisible();
  await expect(conversionPage.locator(".settings-data-maintenance-section").getByText("yardimci-asistan-smoke", { exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("heading", { name: "Telefon Kurulumu" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "USB Cihazları Yenile" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Android'e Yayınla" })).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "AI Cevap Hazırla" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "AI Cevap Hazırla" }).click();
  await conversionPage.getByRole("button", { name: "WhatsApp'tan Yaz" }).click();
  await expect(conversionPage.getByLabel("Hazır WhatsApp mesajı")).toHaveValue(/Merhaba Smoke Misafir/);
  await expect(conversionPage.getByRole("button", { name: "AI Araçları", exact: true })).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "AI ile Yenile" }).click();
  await expect(conversionPage.getByText("Hazır mesaj yenilendi. Göndermeden önce kontrol edin.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await conversionPage.getByRole("tab", { name: "Müşteriler" }).click();
  await conversionPage.getByRole("button", { name: "Geçmişi Özetle" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Mesajlar" })).toBeVisible();
  await expect(conversionPage.getByText("AI önerileri")).toBeVisible();
  await conversionPage.getByLabel("Ek talimat isteğe bağlı").fill("Kısa ve samimi yaz.");
  await conversionPage.getByRole("button", { name: "AI Sonucunu Hazırla" }).click();
  await expect(conversionPage.getByLabel("AI sonucu")).toHaveValue(/Merhaba Smoke Misafir/);
  await expect(conversionPage.getByText("AI sonucu hazırlandı. Düzenleyip kullanabilirsiniz.")).toBeVisible();
  await conversionPage.screenshot({ path: "artifacts/screenshots/desktop-ai-workspace.png", fullPage: true });
  await conversionPage.getByRole("button", { name: "Talebe Kaydet" }).click();
  await expect(conversionPage.getByText("AI özeti talebe kaydedildi.")).toBeVisible();
  await conversionPage.getByRole("tab", { name: /Günü değerlendir/ }).click();
  await expect(conversionPage.getByLabel("Talep / müşteri")).toBeDisabled();
  await conversionPage.getByRole("button", { name: "AI Sonucunu Hazırla" }).click();
  await expect(conversionPage.getByLabel("AI sonucu")).toHaveValue(/Öncelikler/);
  await expect(conversionPage.getByRole("button", { name: "Talebe Kaydet" })).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await conversionPage.getByRole("button", { name: /Smoke Misafir Pansiyon rezervasyonu/ }).click();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Rezervasyona Çevir" }).click();
  await expect(conversionPage.getByLabel("Talep yönetimi").getByText("Rezervasyona çevrildi", { exact: true })).toBeVisible();
  await expect(conversionPage.getByText("Talep rezervasyona çevrildi ve onaylandı.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await expect(conversionPage.getByRole("heading", { name: "Müşteri İşleri" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyonu Aç" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Reddet", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("dialog", { name: "Yeni talep ekle" })).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "Elle Talep Ekle" }).click();
  const manualRequestDrawer = conversionPage.getByRole("dialog", { name: "Yeni talep ekle" });
  await expect(manualRequestDrawer).toBeVisible();
  await manualRequestDrawer.getByLabel("Ad soyad").fill("Manuel Smoke");
  await manualRequestDrawer.getByLabel("Telefon").fill("0555 333 44 66");
  await manualRequestDrawer.getByLabel("Tarih notu").fill("Bu akşam");
  await manualRequestDrawer.getByLabel("Kişi sayısı").fill("3");
  await manualRequestDrawer.getByLabel("Not", { exact: true }).fill("Telefonla alınan bahçe masası talebi.");
  await manualRequestDrawer.getByText("Detaylı bilgi", { exact: true }).click();
  await manualRequestDrawer.getByLabel("Giriş tarihi").fill("2026-07-18");
  await manualRequestDrawer.getByLabel("Saat").fill("21:00");
  await manualRequestDrawer.getByRole("button", { name: "Manuel Talep Kaydet" }).click();
  await expect(conversionPage.getByLabel("Talep yönetimi").getByText("Manuel talep kaydedildi.")).toBeVisible();
  await manualRequestDrawer.getByRole("button", { name: "Elle talep formunu kapat" }).click();
  await expect(manualRequestDrawer).toHaveCount(0);
  await expect(conversionPage.getByRole("heading", { name: "Manuel Smoke" })).toBeVisible();
  await conversionPage.locator(".request-detail-panel").getByText("Diğer işlemler", { exact: true }).click();
  await conversionPage.getByRole("button", { name: "Reddet", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Reddet", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Talebi Sil" })).toBeVisible();
  await expect(conversionPage.locator(".request-primary-actions .action-button")).toHaveCount(4);
  await conversionPage.getByRole("button", { name: "Yeniden Aç" }).click();
  await conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" }).click();
  await expect(conversionPage.getByText("Talep durumu güncellendi.")).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Reddet", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await conversionPage.getByRole("tab", { name: "Müşteriler" }).click();
  await expect(conversionPage.getByLabel("Müşteri yönetimi")).toBeVisible();
  await expect(conversionPage.getByRole("heading", { name: "Smoke Misafir" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Müşteriyi Sil" })).toBeVisible();
  await conversionPage.getByLabel("Ara", { exact: true }).fill("Smoke");
  await expect(conversionPage.getByText("Balkonlu oda için bilgi almak istiyorum.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Restoran" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Restoran" })).toBeVisible();
  await expect(conversionPage.getByText("Oda 101 giriş hazırlığı")).toHaveCount(0);
  await expect(conversionPage.getByText("Bahçe masası kontrolü")).toBeVisible();
  const smokeTableCard = conversionPage.getByLabel("Masa yönetimi").locator(".restaurant-table-card").filter({ hasText: "Smoke Bahçe Masası" });
  const smokeTableStatus = smokeTableCard.getByRole("combobox", { name: "Smoke Bahçe Masası durumunu değiştir" });
  await expect(smokeTableStatus).toHaveValue("available");
  await conversionPage.getByRole("button", { name: "Tamamla" }).first().click();
  await expect(conversionPage.getByText("Günlük iş durumu güncellendi.")).toBeVisible();
  await smokeTableStatus.selectOption("bill_waiting");
  await expect(conversionPage.getByText("Masa durumu güncellendi.")).toBeVisible();
  await expect(smokeTableStatus).toHaveValue("bill_waiting");
  await conversionPage.getByRole("button", { name: "Pansiyon" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Pansiyon" })).toBeVisible();
  await expect(conversionPage.getByText("Oda 101 giriş hazırlığı")).toBeVisible();
  const roomCard = conversionPage.getByLabel("Oda yönetimi").locator(".room-card").filter({ hasText: "Smoke Balkonlu Oda" });
  await expect(roomCard.locator(".status-badge")).toHaveText("Rezerve");
  await expect(roomCard).toContainText("Smoke Misafir - 2 gece");
  const smokeRoomStatus = roomCard.getByRole("combobox", { name: "Smoke Balkonlu Oda durumunu değiştir" });
  await expect(smokeRoomStatus).toHaveValue("reserved");
  const roomWithoutReservationCard = conversionPage.getByLabel("Oda yönetimi").locator(".room-card").filter({ hasText: "Smoke Aile Odası" });
  await expect(roomWithoutReservationCard.locator(".status-badge")).toHaveText("Rezerve");
  await expect(roomWithoutReservationCard).toContainText("Manuel rezerve");
  await smokeRoomStatus.selectOption("occupied");
  await expect(conversionPage.getByText("Oda durumu güncellendi.")).toBeVisible();
  await expect(smokeRoomStatus).toHaveValue("occupied");
  const reservationWorkspace = conversionPage.getByLabel("Rezervasyon yönetimi");
  await expect(reservationWorkspace.getByLabel("Durum")).toBeVisible();
  await expect(reservationWorkspace.getByText("GG.AA.YYYY", { exact: true })).toBeVisible();
  await expect(reservationWorkspace.locator(".localized-date-display")).toHaveCount(0);
  await reservationWorkspace.getByLabel("Tarih").fill("2026-07-18");
  await expect(reservationWorkspace.getByLabel("Tarih")).toHaveValue("2026-07-18");
  await expect(conversionPage.getByText(/1\s*görünen kayıt/)).toBeVisible();
  await reservationWorkspace.getByLabel("Durum").selectOption("pending");
  await expect(conversionPage.getByText(/1\s*görünen kayıt/)).toBeVisible();
  await conversionPage.getByRole("button", { name: "Onayla" }).first().click();
  await expect(conversionPage.getByText("Rezervasyon durumu güncellendi.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Filtreyi Temizle" }).click();
  await expect(conversionPage.getByRole("button", { name: "WhatsApp", exact: true }).first()).toBeVisible();
  await conversionPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await conversionPage.getByRole("tab", { name: "Müşteriler" }).click();
  await conversionPage.getByRole("button", { name: "Yeni Müşteri" }).click();
  const customerEditor = conversionPage.getByRole("dialog", { name: "Yeni müşteri ekle" });
  await expect(customerEditor).toBeVisible();
  await customerEditor.locator('input[type="file"]').setInputFiles({
    name: "smoke-identity.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  });
  await expect(customerEditor.getByLabel("Ad soyad")).toHaveValue("Kimlik Smoke");
  await expect(customerEditor.getByLabel("Kimlik / pasaport no")).toHaveValue("U12345678");
  await expect(customerEditor.getByLabel("Doğum tarihi")).toHaveValue("1991-04-23");
  await customerEditor.getByLabel("Telefon").fill("+905551112244");
  await customerEditor.getByLabel("Not", { exact: true }).fill("Resepsiyondan manuel oluşturulan müşteri kartı.");
  await customerEditor.getByRole("button", { name: "Müşteri Kartını Kaydet" }).click();
  await expect(customerEditor).toHaveCount(0);
  await expect(conversionPage.getByRole("heading", { name: "Kimlik Smoke" })).toBeVisible();
  await expect(conversionPage.getByText("U12345678", { exact: true })).toBeVisible();
  await expect.poll(() => conversionPage.evaluate(() => window.__identityAnalysisCalls.length)).toBe(1);

  await conversionPage.getByRole("button", { name: "Pansiyon", exact: true }).click();
  const assignableRoomCard = conversionPage.getByLabel("Oda yönetimi").locator(".room-card").filter({ hasText: "Smoke Aile Odası" });
  await assignableRoomCard.getByRole("button", { name: "Müşteri Ata" }).click();
  const assignmentDrawer = conversionPage.getByRole("dialog", { name: "Odaya müşteri ata" });
  await assignmentDrawer.getByLabel("Müşteri").selectOption("customer_manual_card_smoke_001");
  await assignmentDrawer.getByLabel("Giriş tarihi").fill("2026-08-01");
  await assignmentDrawer.getByLabel("Çıkış tarihi").fill("2026-08-03");
  await assignmentDrawer.getByLabel("Kişi sayısı").fill("2");
  await assignmentDrawer.getByLabel("Konaklama notu").fill("Manuel resepsiyon ataması.");
  await assignmentDrawer.getByRole("button", { name: "Odaya Ata" }).click();
  await expect(assignmentDrawer).toHaveCount(0);
  await conversionPage.getByText("Konaklama Geçmişini Göster", { exact: true }).click();
  const staysWorkspace = conversionPage.getByLabel("Konaklama arşivi");
  await expect(staysWorkspace.getByText("Kimlik Smoke · Oda 102")).toBeVisible();
  await staysWorkspace.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(staysWorkspace.locator(".status-badge", { hasText: "Giriş yaptı" })).toBeVisible();
  await staysWorkspace.getByRole("button", { name: "Çıkış Yap" }).click();
  await staysWorkspace.getByLabel("Durum").selectOption("all");
  await expect(staysWorkspace.locator(".status-badge", { hasText: "Çıkış yaptı" })).toBeVisible();
  await expect(assignableRoomCard.locator(".status-badge")).toHaveText("Temizlik");

  const compactPage = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await compactPage.addInitScript(({ setupData, dashboardData, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ theme: "light", scale: 1, mode: "pro" }));
    }
    let tableOrders = [];
    let currentDashboardData = dashboardData;
    window.__tableOrderAdds = [];
    window.__tableOrderNoteSaves = [];
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const saveOrder = (order, message) => {
      const subtotal = order.items.reduce((sum, item) => sum + item.lineTotal, 0);
      const saved = {
        ...order,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal,
        total: subtotal,
        updatedAt: new Date().toISOString()
      };
      tableOrders = tableOrders.some((item) => item.id === saved.id)
        ? tableOrders.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...tableOrders];
      return { ok: true, message, order: saved };
    };
    const withTableStatus = (result, tableId, status) => {
      const tables = currentDashboardData.tables.map((table) => table.id === tableId
        ? { ...table, status, updatedAt: new Date().toISOString() }
        : table);
      currentDashboardData = {
        ...currentDashboardData,
        tables,
        summary: {
          ...currentDashboardData.summary,
          availableTables: tables.filter((table) => table.isActive && table.status === "available").length
        }
      };
      return { ...result, dashboardData: currentDashboardData };
    };
    const createOrder = (tableId) => {
      const table = currentDashboardData.tables.find((item) => item.id === tableId);
      const now = new Date().toISOString();
      return {
        id: `order_${tableId}`,
        tableId,
        tableName: table.name,
        status: "open",
        openedAt: now,
        closedAt: "",
        subtotal: 0,
        discountTotal: 0,
        total: 0,
        note: "",
        itemCount: 0,
        items: [],
        createdAt: now,
        updatedAt: now
      };
    };
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: { webModuleUrl: setupData.webModuleUrl, hasSyncSecret: true },
        databasePath: dashboardData.databasePath,
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: dashboardData.backupPath,
        setup: setupData
      }),
      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "renderer-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: () => () => {},
      getRoomFolioData: async () => ({
        generatedAt: "",
        rooms: [],
        activeStays: [],
        folios: [],
        menuCategories: [],
        menuItems: []
      }),
      listTableOrders: async () => tableOrders,
      getActiveTableOrder: async (tableId) => tableOrders.find((order) => order.tableId === tableId && ["open", "preparing", "served", "payment"].includes(order.status)) ?? null,
      openTableOrder: async (tableId) => {
        await wait(tableId === "compact_table_1" ? 180 : 10);
        const existing = tableOrders.find((order) => order.tableId === tableId && ["open", "preparing", "served", "payment"].includes(order.status));
        const result = existing
          ? { ok: true, message: "Aktif adisyon yüklendi.", order: existing }
          : saveOrder(createOrder(tableId), "Adisyon açıldı.");
        return withTableStatus(result, tableId, existing?.status === "payment" ? "bill_waiting" : "occupied");
      },
      addTableOrderItem: async (orderId, menuItemId, quantity, note) => {
        const order = tableOrders.find((item) => item.id === orderId);
        const menuItem = currentDashboardData.menu.items.find((item) => item.id === menuItemId);
        const now = new Date().toISOString();
        window.__tableOrderAdds.push({ orderId, tableId: order.tableId, menuItemId });
        return saveOrder({
          ...order,
          items: [...order.items, {
            id: `line_${order.tableId}_${order.items.length + 1}`,
            orderId,
            menuItemId,
            productName: menuItem.name,
            unitPrice: menuItem.price,
            currency: menuItem.currency,
            quantity,
            lineTotal: menuItem.price * quantity,
            note,
            status: "open",
            createdAt: now,
            updatedAt: now
          }]
        }, "Ürün adisyona eklendi.");
      },
      updateTableOrderItemNote: async (itemId, note) => {
        await wait(40);
        const order = tableOrders.find((item) => item.items.some((line) => line.id === itemId));
        window.__tableOrderNoteSaves.push({ itemId, note, tableId: order.tableId });
        return saveOrder({
          ...order,
          items: order.items.map((item) => item.id === itemId ? { ...item, note } : item)
        }, "Ürün notu kaydedildi.");
      },
      updateTableOrderStatus: async (orderId, status) => {
        const order = tableOrders.find((item) => item.id === orderId);
        return withTableStatus(
          saveOrder({ ...order, status }, "Adisyon durumu güncellendi."),
          order.tableId,
          status === "payment" ? "bill_waiting" : "occupied"
        );
      },
      closeTableOrder: async (orderId, status) => {
        const order = tableOrders.find((item) => item.id === orderId);
        return withTableStatus(
          saveOrder({ ...order, status, closedAt: new Date().toISOString() }, "Adisyon kapatıldı."),
          order.tableId,
          "available"
        );
      },
      getAiWorkspaceHistory: async () => [],
      markWhatsAppMessageSent: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "compact-smoke-secret" },
    dashboardData: createCompactUiFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture({ ...createSetupFixture(), setupRequired: false, syncSecret: "compact-smoke-secret" })
  });
  await compactPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

  await expect(compactPage.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(compactPage.locator("html")).toHaveAttribute("data-mode", "pro");
  expect(await compactPage.evaluate(() => getComputedStyle(document.documentElement).zoom)).toBe("1");

  await compactPage.getByRole("button", { name: "Menüyü daralt" }).click();
  await expect(compactPage.locator(".desktop-shell")).toHaveClass(/is-sidebar-collapsed/);
  await expect(compactPage.locator(".sidebar")).toHaveClass(/is-collapsed/);
  await expect(compactPage.locator(".brand-copy")).toBeHidden();
  await expect(compactPage.getByRole("button", { name: "Pansiyon", exact: true })).toBeVisible();
  await expect.poll(() => compactPage.evaluate(() => localStorage.getItem("yardimci-asistan.sidebar-collapsed"))).toBe("true");
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-sidebar-collapsed-1366x768.png" });

  await compactPage.reload({ waitUntil: "domcontentloaded" });
  await expect(compactPage.getByRole("button", { name: "Menüyü genişlet" })).toBeVisible();
  await compactPage.getByRole("button", { name: "Menüyü genişlet" }).click();
  await expect(compactPage.locator(".desktop-shell")).not.toHaveClass(/is-sidebar-collapsed/);
  await expect.poll(() => compactPage.evaluate(() => localStorage.getItem("yardimci-asistan.sidebar-collapsed"))).toBe("false");

  const dashboardPriorityRows = compactPage.locator(".dashboard-priority-item");
  await expect(dashboardPriorityRows).toHaveCount(6);
  await expect(compactPage.getByRole("heading", { name: "11 konu ilgi bekliyor." })).toBeVisible();
  expect(await dashboardPriorityRows.evaluateAll((rows) => rows.every((row) => row.querySelectorAll("button").length === 1))).toBe(true);
  const firstPriorityDescription = dashboardPriorityRows.first().locator(".dashboard-priority-description");
  await expect(firstPriorityDescription).toBeVisible();
  expect(await firstPriorityDescription.evaluate((note) => getComputedStyle(note).whiteSpace)).toBe("nowrap");
  await expect(compactPage.locator(".dashboard-timeline-list li")).toHaveCount(4);
  await expect(compactPage.locator(".dashboard-capacity-list > div")).toHaveCount(3);
  expect(await compactPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(dashboardPriorityRows.first().getByRole("heading")).toHaveText("Kompakt Misafir 1");
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-dashboard-1366x768.png" });
  await compactPage.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await expect(compactPage.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await compactPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-dashboard-light-1366x768.png" });
  await compactPage.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));

  await compactPage.getByRole("button", { name: "Kompakt Misafir 1 rezervasyonunu incele" }).click();
  await expect(compactPage.getByRole("heading", { name: "Müşteri İşleri", exact: true })).toBeVisible();
  await expect(compactPage.locator(".request-detail-panel").getByRole("heading", { name: "Kompakt Misafir 1" })).toBeVisible();
  await compactPage.getByRole("button", { name: "Ana Ekran", exact: true }).click();

  const aiOnlyPage = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await aiOnlyPage.addInitScript(({ setupData, dashboardData, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ theme: "light", scale: 1, mode: "pro" }));
    }
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: { webModuleUrl: setupData.webModuleUrl, hasSyncSecret: true },
        databasePath: dashboardData.databasePath,
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: dashboardData.backupPath,
        setup: setupData
      }),
      getDashboardData: async () => dashboardData,
      getSetupData: async () => setupData,
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "ai-only-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: () => () => {},
      getAiWorkspaceHistory: async () => []
    };
  }, {
    setupData: {
      ...createSetupFixture(),
      setupRequired: false,
      servicePreferences: { ...createSetupFixture().servicePreferences, whatsapp: false }
    },
    dashboardData: createCompactUiFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture({
      ...createSetupFixture(),
      setupRequired: false,
      servicePreferences: { ...createSetupFixture().servicePreferences, whatsapp: false }
    })
  });
  await aiOnlyPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(aiOnlyPage.locator("html")).toHaveAttribute("data-mode", "pro");
  const aiOnlyRequestPriority = aiOnlyPage.locator(".dashboard-priority-item.priority-request").filter({ hasText: "Kompakt Misafir 1" });
  await aiOnlyRequestPriority.getByRole("button").click();
  await expect(aiOnlyPage.getByRole("heading", { name: "Mesajlar", exact: true })).toBeVisible();
  await expect(aiOnlyPage.getByLabel("Talep / müşteri")).toHaveValue("compact_request_1");

  await compactPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await compactPage.getByRole("button", { name: /Kompakt Misafir 4/ }).click();
  const customerRequestRows = compactPage.locator(".requests-workspace .list-row--button");
  await expect(customerRequestRows).toHaveCount(8);
  await compactPage.locator(".request-detail-panel").getByText("Diğer işlemler", { exact: true }).click();
  await expect(compactPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await expect(compactPage.getByRole("button", { name: "Talebi Sil" })).toBeVisible();
  await expect(compactPage.locator(".request-primary-actions .action-button")).toHaveCount(4);
  await expect(compactPage.getByRole("dialog", { name: "Yeni talep ekle" })).toHaveCount(0);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-customer-work-1366x768.png" });

  await compactPage.getByRole("tab", { name: "Müşteriler" }).click();
  const compactCustomerRows = compactPage.locator(".customers-workspace .list-row--button");
  await expect(compactCustomerRows).toHaveCount(8);

  await compactPage.getByRole("button", { name: "Pansiyon", exact: true }).click();
  await expect(compactPage.getByRole("heading", { name: "Konaklama durumu" })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Rezervasyon Takibi" })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Anlık Oda Durumu" })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Günlük Konaklama İşleri" })).toBeVisible();
  const reservationRows = compactPage.locator(".reservation-record-row");
  await expect(reservationRows).toHaveCount(3);
  await expect(reservationRows.first().locator(".list-row__actions > button")).toHaveCount(2);
  await reservationRows.first().locator("summary").click();
  await expect(reservationRows.first().getByRole("button", { name: "Reddet" })).toBeVisible();
  await expect(reservationRows.first().getByRole("button", { name: "İptal Et" })).toBeVisible();
  await reservationRows.first().locator("summary").click();
  const compactRoomCards = compactPage.getByLabel("Oda yönetimi").locator(".room-card");
  await expect(compactRoomCards.first().getByRole("combobox")).toHaveAccessibleName(/durumunu değiştir/);
  await expect(compactRoomCards.first().getByRole("combobox")).not.toHaveValue("available");
  await expect(compactRoomCards.nth(3).getByRole("combobox")).toHaveValue("cleaning");
  const pensionTaskRows = compactPage.locator(".pension-tasks-section .task-record-row");
  await expect(pensionTaskRows).toHaveCount(2);
  await expect(compactPage.locator(".pension-archive-details").last()).not.toHaveAttribute("open", "");
  await expect(compactPage.getByRole("heading", { name: "Rezervasyon Takibi", exact: true })).toBeVisible();
  await compactPage.waitForTimeout(50);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-pension-1366x768.png" });

  await compactPage.getByRole("button", { name: "Restoran", exact: true }).click();
  await expect(compactPage.getByRole("heading", { name: "Bugün", exact: true })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Masalar", exact: true })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Yapılacak İşler" })).toBeVisible();
  const compactTableCards = compactPage.locator(".restaurant-table-card");
  await expect(compactPage.locator(".table-area-heading h3")).toHaveText(["Bahçe", "Salon"]);
  for (const [tableName, status] of [
    ["Bahçe Masası 1", "available"],
    ["Salon Masası 2", "occupied"],
    ["Bahçe Masası 3", "reserved"],
    ["Salon Masası 4", "bill_waiting"]
  ]) {
    const tableCard = compactTableCards.filter({ hasText: tableName });
    await expect(tableCard.getByRole("combobox", { name: `${tableName} durumunu değiştir` })).toHaveValue(status);
  }
  await expect(compactPage.locator(".task-record-row").first().locator(".list-row__actions > button")).toHaveCount(1);
  await compactPage.locator(".task-record-row").first().locator("summary").click();
  await expect(compactPage.locator(".task-record-row").first().getByRole("button", { name: "İptal Et" })).toBeVisible();
  await compactPage.locator(".task-record-row").first().locator("summary").click();
  expect(await compactPage.locator(".restaurant-tables-section").evaluate((panel) => getComputedStyle(panel).borderTopWidth)).toBe("1px");
  await compactPage.getByRole("button", { name: "Pansiyon", exact: true }).click();
  await compactPage.getByRole("button", { name: "Restoran", exact: true }).click();
  await expect(compactPage.getByRole("heading", { name: "Yapılacak İşler" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-restaurant-1366x768.png" });

  const tableManagement = compactPage.locator(".restaurant-table-area-list");
  const firstOrderCard = tableManagement.locator(".restaurant-table-card").filter({ hasText: "Bahçe Masası 1" });
  const secondOrderCard = tableManagement.locator(".restaurant-table-card").filter({ hasText: "Salon Masası 2" });
  const reservedOrderCard = tableManagement.locator(".restaurant-table-card").filter({ hasText: "Bahçe Masası 3" });
  await firstOrderCard.getByRole("button", { name: "Sipariş Aç", exact: true }).click();
  const firstOrderDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Bahçe Masası 1" });
  await expect(firstOrderDrawer).toBeVisible();
  await firstOrderDrawer.getByRole("button", { name: "Sipariş drawer'ını kapat" }).click();
  await expect(firstOrderDrawer).toHaveCount(0);

  await secondOrderCard.getByRole("button", { name: "Sipariş Aç", exact: true }).click();
  const secondOrderDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Salon Masası 2" });
  await expect(secondOrderDrawer).toBeVisible();
  await compactPage.waitForTimeout(220);
  await expect(secondOrderDrawer).toBeVisible();
  await secondOrderDrawer.getByRole("button", { name: "Menü Ürünü 1 ürününü siparişe ekle" }).click();
  await expect.poll(() => compactPage.evaluate(() => window.__tableOrderAdds.at(-1)?.tableId)).toBe("compact_table_2");
  const smokeOrderNote = secondOrderDrawer.getByLabel("Menü Ürünü 1 notu");
  await smokeOrderNote.fill("Escape öncesi kalıcı not");
  await smokeOrderNote.press("Escape");
  await expect(secondOrderDrawer).toHaveCount(0);
  await expect.poll(() => compactPage.evaluate(() => window.__tableOrderNoteSaves.at(-1))).toMatchObject({
    tableId: "compact_table_2",
    note: "Escape öncesi kalıcı not"
  });

  await expect(secondOrderCard.locator(".restaurant-table-card__header .status-badge")).toHaveText("Dolu");
  await expect(secondOrderCard.locator(".restaurant-table-card__order-state")).toContainText("Aktif adisyon");
  await expect(secondOrderCard.locator(".restaurant-table-card__order-state .status-badge")).toHaveText("Açık");
  await expect(secondOrderCard.locator(".restaurant-table-card__summary")).toContainText("1 ürün");
  await expect(secondOrderCard.locator(".restaurant-table-card__summary")).toContainText("90");
  await expect(secondOrderCard.getByRole("button", { name: "Siparişi Aç", exact: true })).toBeVisible();
  await expect(secondOrderCard.getByRole("button", { name: "Hesap İste", exact: true })).toBeVisible();
  await expect(secondOrderCard.getByRole("button", { name: "Ödendi / Kapat", exact: true })).toHaveCount(0);

  await secondOrderCard.getByRole("button", { name: "Siparişi Aç", exact: true }).click();
  const polishedOrderDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Salon Masası 2" });
  const polishedOrderStatus = polishedOrderDrawer.getByLabel("Sipariş durumu");
  await expect(polishedOrderStatus).toBeVisible();
  await expect(polishedOrderDrawer.getByRole("button", { name: "Ödendi / Kapat" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-table-order-drawer-polish-1366x768.png" });
  await polishedOrderStatus.selectOption("preparing");
  await expect(polishedOrderStatus).toHaveValue("preparing");
  await polishedOrderDrawer.getByRole("button", { name: "Sipariş drawer'ını kapat" }).click();
  await expect(polishedOrderDrawer).toHaveCount(0);
  await expect(secondOrderCard.locator(".restaurant-table-card__header .status-badge")).toHaveText("Dolu");
  await expect(secondOrderCard.locator(".restaurant-table-card__order-state .status-badge")).toHaveText("Hazırlanıyor");

  await secondOrderCard.getByRole("button", { name: "Siparişi Aç", exact: true }).click();
  const paymentOrderDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Salon Masası 2" });
  await paymentOrderDrawer.getByLabel("Sipariş durumu").selectOption("payment");
  await expect(paymentOrderDrawer.getByLabel("Sipariş durumu")).toHaveValue("payment");
  await paymentOrderDrawer.getByRole("button", { name: "Sipariş drawer'ını kapat" }).click();
  await expect(paymentOrderDrawer).toHaveCount(0);
  await expect(secondOrderCard.locator(".restaurant-table-card__order-state .status-badge")).toHaveText("Hesap bekliyor");
  await expect(secondOrderCard.locator(".restaurant-table-card__header .status-badge")).toHaveText("Hesap");
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-table-order-polish-1366x768.png" });
  await secondOrderCard.getByRole("button", { name: "Siparişi Aç", exact: true }).click();
  const paidOrderDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Salon Masası 2" });
  await paidOrderDrawer.getByRole("button", { name: "Ödendi / Kapat", exact: true }).click();
  await expect(paidOrderDrawer).toHaveCount(0);
  await expect(secondOrderCard.locator(".restaurant-table-card__order-state")).toHaveCount(0);
  await expect(secondOrderCard.getByRole("button", { name: "Sipariş Aç", exact: true })).toBeVisible();
  await expect(secondOrderCard.locator(".status-badge")).toHaveText("Boş");
  await expect(secondOrderCard.getByRole("combobox", { name: "Salon Masası 2 durumunu değiştir" })).toHaveValue("available");

  await expect(reservedOrderCard.locator(".restaurant-table-card__header .status-badge")).toHaveText("Rezerve");
  await reservedOrderCard.getByRole("button", { name: "Sipariş Aç", exact: true }).click();
  const reservedOrderDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Bahçe Masası 3" });
  await expect(reservedOrderDrawer).toBeVisible();
  await expect(reservedOrderCard.locator(".restaurant-table-card__header .status-badge")).toHaveText("Dolu");
  await reservedOrderDrawer.getByLabel("Sipariş durumu").selectOption("preparing");
  await reservedOrderDrawer.getByRole("button", { name: "Sipariş drawer'ını kapat" }).click();
  await expect(reservedOrderDrawer).toHaveCount(0);
  await expect(reservedOrderCard.locator(".restaurant-table-card__header .status-badge")).toHaveText("Dolu");
  await expect(reservedOrderCard.locator(".restaurant-table-card__order-state .status-badge")).toHaveText("Hazırlanıyor");
  await reservedOrderCard.getByRole("button", { name: "Siparişi Aç", exact: true }).click();
  const reservedPaymentDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Bahçe Masası 3" });
  await reservedPaymentDrawer.getByLabel("Sipariş durumu").selectOption("payment");
  await reservedPaymentDrawer.getByRole("button", { name: "Sipariş drawer'ını kapat" }).click();
  await expect(reservedPaymentDrawer).toHaveCount(0);
  await expect(reservedOrderCard.locator(".restaurant-table-card__header .status-badge")).toHaveText("Hesap");
  await expect(reservedOrderCard.locator(".restaurant-table-card__order-state .status-badge")).toHaveText("Hesap bekliyor");
  await reservedOrderCard.getByRole("button", { name: "Siparişi Aç", exact: true }).click();
  const reservedPaidDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Bahçe Masası 3" });
  await reservedPaidDrawer.getByRole("button", { name: "Ödendi / Kapat", exact: true }).click();
  await expect(reservedPaidDrawer).toHaveCount(0);
  await expect(reservedOrderCard.locator(".restaurant-table-card__order-state")).toHaveCount(0);
  await expect(reservedOrderCard.locator(".restaurant-table-card__header .status-badge")).toHaveText("Boş");
  await expect(reservedOrderCard.getByRole("combobox", { name: "Bahçe Masası 3 durumunu değiştir" })).toHaveValue("available");

  await expect(firstOrderCard.locator(".restaurant-table-card__header .status-badge")).toHaveText("Dolu");
  await firstOrderCard.getByRole("button", { name: "Siparişi Aç", exact: true }).click();
  const cancelledOrderDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Bahçe Masası 1" });
  await cancelledOrderDrawer.getByText("Diğer", { exact: true }).click();
  await cancelledOrderDrawer.getByRole("button", { name: "Adisyonu İptal Et", exact: true }).click();
  await expect(cancelledOrderDrawer).toHaveCount(0);
  await expect(firstOrderCard.locator(".restaurant-table-card__order-state")).toHaveCount(0);
  await expect(firstOrderCard.locator(".restaurant-table-card__header .status-badge")).toHaveText("Boş");
  await expect(firstOrderCard.getByRole("combobox", { name: "Bahçe Masası 1 durumunu değiştir" })).toHaveValue("available");

  await compactPage.getByRole("button", { name: "Menü", exact: true }).click();
  await expect(compactPage.getByRole("button", { name: "Menü", exact: true })).toHaveAttribute("aria-current", "page");
  await compactPage.locator(".menu-category-panel .menu-record").filter({ hasText: "Sıcaklar" }).click();
  await expect(compactPage.locator(".menu-category-panel .menu-record[aria-pressed='true']")).toContainText("Sıcaklar");
  await compactPage.getByRole("button", { name: "Önizle", exact: true }).click();
  const compactMenuPreview = compactPage.getByRole("dialog", { name: "Yerel Menü Önizlemesi" });
  await expect(compactMenuPreview).toBeVisible();
  await compactMenuPreview.getByRole("button", { name: "Sıcaklar", exact: true }).click();
  await expect(compactMenuPreview.getByRole("button", { name: "Sıcaklar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await compactMenuPreview.getByRole("button", { name: "Tüm Ürünler" }).click();
  await expect(compactMenuPreview.getByRole("button", { name: "Tüm Ürünler" })).toHaveAttribute("aria-pressed", "true");
  await compactMenuPreview.getByRole("button", { name: "Önizlemeyi kapat" }).click();
  await expect(compactMenuPreview).toHaveCount(0);
  await compactPage.locator(".menu-category-panel .menu-record").filter({ hasText: "Kahvaltı" }).click();
  await expect(compactPage.locator(".menu-category-panel .menu-record[aria-pressed='true']")).toContainText("Kahvaltı");
  await expect(compactPage.locator(".menu-category-form")).toBeVisible();
  await expect(compactPage.locator(".menu-item-details")).toBeVisible();
  await expect(compactPage.locator(".menu-management-grid .menu-record[aria-pressed='true']")).toHaveCount(2);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-menu-1366x768.png" });

  await compactPage.getByRole("button", { name: "Mesajlar", exact: true }).click();
  const compactMessageRows = compactPage.locator(".whatsapp-request-list .message-request-row");
  await expect(compactMessageRows).toHaveCount(8);
  await expect(compactPage.locator(".whatsapp-copy-panel").getByRole("heading", { name: "Kompakt Misafir 1" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-messages-1366x768.png" });

  await compactPage.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  const compactWebControlBar = compactPage.locator(".whatsapp-web-control-bar");
  await expect(compactWebControlBar).toContainText("Kompakt Misafir 1");
  await expect(compactWebControlBar).toContainText("+90 532 123 00 01");
  await expect(compactWebControlBar.getByRole("button", { name: "Hazır Mesajı Kopyala" })).toBeVisible();
  await expect(compactWebControlBar.getByRole("button", { name: "Müşteri Numarasına Git" })).toBeVisible();
  await expect(compactWebControlBar.getByRole("button", { name: "Dışarıda Aç" })).toBeVisible();
  await expect(compactWebControlBar.getByRole("button", { name: "Güvenli Moda Dön" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-whatsapp-web-1366x768.png" });
  await compactWebControlBar.getByRole("button", { name: "Güvenli Moda Dön" }).click();
  await expect(compactPage.getByRole("tab", { name: "Mesaj Hazırla" })).toHaveAttribute("aria-selected", "true");

  await compactPage.reload({ waitUntil: "domcontentloaded" });
  await expect(compactPage.locator(".nav-item")).toHaveCount(9);
  await compactPage.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(compactPage.getByRole("button", { name: "Ayarlar", exact: true })).toHaveAttribute("aria-current", "page");
  expect(await compactPage.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(compactPage.getByRole("button", { name: "Ayarları Kaydet", exact: true })).toHaveCount(1);
  await expect(compactPage.locator(".setup-footer")).toHaveCount(0);
  await expect(compactPage.getByRole("navigation", { name: "Ayar bölümleri" }).getByRole("link")).toHaveCount(5);
  await expect(compactPage.getByRole("heading", { name: "İşletme", exact: true })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Müşteriye Açık Bilgiler" })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "İşletme Düzeni" })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Uygulama Şifresi" })).toBeVisible();
  await expect(compactPage.locator(".settings-service-card", { hasText: "Android" })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Görünüm" })).toBeVisible();
  expect(await compactPage.locator(".setup-capabilities").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-settings-1366x768.png" });
  await expect(compactPage.locator(".settings-service-card", { hasText: "Web Modülü" })).toBeVisible();
  await expect(compactPage.getByLabel("Web eşitleme adresi")).toBeVisible();
  await expect(compactPage.getByLabel("Web güvenlik anahtarı")).toBeVisible();
  await expect(compactPage.getByLabel("Servis sağlayıcı")).toBeVisible();
  expect(await compactPage.locator(".content").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-settings-advanced-1366x768.png" });
  await compactPage.setViewportSize({ width: 900, height: 768 });
  await compactPage.getByRole("navigation", { name: "Ayar bölümleri" }).getByRole("link", { name: "Uygulama" }).click();
  await expect(compactPage.locator("#settings-application")).toBeInViewport();
  expect(await compactPage.locator(".content").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-settings-900x768.png" });
  await compactPage.close();

  const pullPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await pullPage.addInitScript(({ setupData, dashboardData, pulledRequest, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ theme: "light", scale: 1, mode: "pro" }));
    }
    let currentDashboardData = dashboardData;
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: {
          webModuleUrl: setupData.webModuleUrl,
          hasSyncSecret: true
        },
        databasePath: "/tmp/yardimci-asistan.sqlite",
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: "/tmp/yardimci-asistan/backups",
        setup: setupData
      }),
      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "renderer-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: () => () => {},
      saveInitialSetup: async () => ({ ok: false, message: "smoke" }),
      createManualBackup: async () => ({ ok: false, message: "smoke" }),
      createManualRequest: async () => ({ ok: false, message: "smoke" }),
      convertRequestToReservation: async () => ({ ok: false, message: "smoke" }),
      updateRequestStatus: async () => ({ ok: false, message: "smoke" }),
      updateRoomStatus: async () => ({ ok: false, message: "smoke" }),
      updateTableStatus: async () => ({ ok: false, message: "smoke" }),
      updateReservationStatus: async () => ({ ok: false, message: "smoke" }),
      updateDailyTaskStatus: async () => ({ ok: false, message: "smoke" }),
      createOwnerReplySuggestion: async () => ({ ok: false, message: "smoke" }),
      pullRequests: async () => {
        currentDashboardData = {
          ...dashboardData,
          summary: {
            ...dashboardData.summary,
            newRequests: 1,
            waitingRequests: 1
          },
          requests: [pulledRequest],
          customers: [
            ...dashboardData.customers,
            {
              id: pulledRequest.customer_id,
              fullName: pulledRequest.customer_name,
              phone: pulledRequest.customer_phone,
              email: "",
              source: "web_form",
              notes: pulledRequest.message,
              tags: ["web", "sync"],
              lastContactAt: pulledRequest.created_at,
              requestCount: 1,
              reservationCount: 0,
              updatedAt: pulledRequest.updated_at
            }
          ]
        };
        return {
          ok: true,
          message: "Talepler alındı.",
          requests: [pulledRequest],
          count: 1,
          pulled_at: "2026-07-11T10:45:00+03:00"
        };
      },
      markRequestsSynced: async () => ({ ok: true, count: 1 }),
      pushMenu: async () => ({ ok: false, message: "smoke" }),
      pushAndroidSnapshot: async () => ({ ok: false, message: "smoke" }),
      saveMenuCategory: async () => ({ ok: false, message: "smoke" }),
      saveMenuItem: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345" },
    dashboardData: createDashboardFixture(),
    pulledRequest: createPulledRequestFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture({ ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345" })
  });
  await pullPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(pullPage.locator("html")).toHaveAttribute("data-mode", "pro");
  await expect(pullPage.locator(".dashboard-attention-card").first().locator("strong")).toHaveText("0");
  await pullPage.getByRole("button", { name: "Şimdi Eşitle", exact: true }).click();
  await expect(pullPage.getByText("1 talep alındı.")).toBeVisible();
  await expect(pullPage.getByRole("heading", { name: "Web Sync Smoke" })).toBeVisible();
  await expect(pullPage.getByText("Bahçe masa için canlı web talebi.")).toBeVisible();
  await pullPage.screenshot({ path: "artifacts/screenshots/desktop-web-pull-flow.png", fullPage: true });

  const setupPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupPage.addInitScript(({ setupData, dashboardData, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ theme: "light", scale: 1, mode: "pro" }));
    }
    window.__aiConnectionTestCount = 0;
    const storedAiApiKeys = {
      openai: "sk-openai-stored-smoke"
    };
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: {
          webModuleUrl: setupData.webModuleUrl,
          hasSyncSecret: true
        },
        databasePath: "/tmp/yardimci-asistan.sqlite",
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: "/tmp/yardimci-asistan/backups",
        setup: setupData
      }),
      getDashboardData: async () => dashboardData,
      getSetupData: async () => setupData,
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "renderer-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: () => () => {},
      saveInitialSetup: async (input) => {
        for (const profile of input.aiProfiles || []) {
          if (profile.clearApiKey) {
            delete storedAiApiKeys[profile.service];
          } else if (profile.apiKey) {
            storedAiApiKeys[profile.service] = profile.apiKey;
          }
        }
        const savedProfiles = (input.aiProfiles || []).map((profile) => ({
          service: profile.service,
          projectName: profile.projectName,
          baseUrl: profile.baseUrl,
          model: profile.model,
          modelOptions: profile.modelOptions || [],
          timeoutSeconds: profile.timeoutSeconds,
          apiKeyConfigured: Boolean(profile.apiKey)
            || Boolean(setupData.aiProfiles?.find((saved) => saved.service === profile.service)?.apiKeyConfigured)
            || (profile.service === setupData.aiService && setupData.aiApiKeyConfigured),
          updatedAt: "2026-07-12T10:00:00.000Z"
        }));
        return {
          ok: true,
          message: "Ayarlar kaydedildi ve AI bağlantısı web sitesinde güncellendi.",
          setupData: {
            ...setupData,
            setupRequired: false,
            businessName: input.businessName,
            profileId: input.profileId,
            phone: input.phone,
            whatsapp: input.whatsapp,
            email: input.email,
            address: input.address,
            webModuleUrl: input.webModuleUrl,
            syncSecret: input.syncSecret,
            aiEnabled: input.aiEnabled,
            aiProvider: input.aiProvider,
            aiService: input.aiService,
            aiProjectName: input.aiProjectName,
            aiBaseUrl: input.aiBaseUrl,
            aiModel: input.aiModel,
            aiTimeoutSeconds: input.aiTimeoutSeconds,
            aiApiKeyConfigured: Boolean(input.aiApiKey) || setupData.aiApiKeyConfigured,
            aiLastPublishedAt: "2026-07-12T10:00:00.000Z",
            aiProfiles: savedProfiles,
            servicePreferences: input.servicePreferences,
            initialCounts: input.initialCounts
          },
          dashboardData: {
            ...dashboardData,
            webModuleUrl: input.webModuleUrl
          },
          aiWebSync: {
            ok: true,
            message: "AI ayarları web modülüne uygulandı.",
            published_at: "2026-07-12T10:00:00.000Z"
          }
        };
      },
      revealAiApiKey: async (service) => storedAiApiKeys[service]
        ? { ok: true, apiKey: storedAiApiKeys[service] }
        : { ok: false, message: "Bu sağlayıcı için kayıtlı bir API anahtarı bulunamadı." },
      testAiConnection: async (input) => {
        window.__aiConnectionTestCount += 1;
        if (input.service === "gemini") {
          return {
            ok: true,
            message: "Google AI Studio bağlantısında gemini-3.5-flash modeliyle görsel girişi doğrulandı; 2 uygun Gemini modeli bulundu. Kullanmak için ayarları kaydedin.",
            model: "gemini-3.5-flash",
            models: [
              { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
              { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" }
            ]
          };
        }
        return {
          ok: true,
          message: `${input.service === "openrouter" ? "OpenRouter" : "AI servisi"} bağlantısı çalışıyor.`,
          model: input.model,
          models: []
        };
      },
      createManualBackup: async () => ({
        ok: true,
        message: "Yerel veritabanı yedeği oluşturuldu.",
        backupDirectory: "/tmp/yardimci-asistan/backups",
        backupFileName: "yardimci-asistan-setup-smoke.sqlite",
        backupFilePath: "/tmp/yardimci-asistan/backups/yardimci-asistan-setup-smoke.sqlite",
        createdAt: "2026-07-11T10:16:00+03:00",
        dashboardData
      }),
      createManualRequest: async () => ({ ok: false, message: "smoke" }),
      pullRequests: async () => ({ ok: true, count: 0, requests: [] }),
      markRequestsSynced: async () => ({ ok: true, count: 0 }),
      convertRequestToReservation: async () => ({ ok: false, message: "smoke" }),
      updateRequestStatus: async () => ({ ok: false, message: "smoke" }),
      updateRoomStatus: async () => ({ ok: false, message: "smoke" }),
      updateTableStatus: async () => ({ ok: false, message: "smoke" }),
      updateReservationStatus: async () => ({ ok: false, message: "smoke" }),
      updateDailyTaskStatus: async () => ({ ok: false, message: "smoke" }),
      pushMenu: async () => ({ ok: true, category_count: 0, item_count: 0 }),
      pushAndroidSnapshot: async () => ({ ok: false, message: "smoke" }),
      pushAiSettings: async () => ({ ok: false, message: "smoke" }),
      saveMenuCategory: async () => ({ ok: false, message: "smoke" }),
      saveMenuItem: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: createSetupFixture(),
    dashboardData: createDashboardFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture(createSetupFixture())
  });
  await setupPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(setupPage.locator("html")).toHaveAttribute("data-mode", "pro");
  await expect(setupPage.getByRole("heading", { name: "Ayarlar", exact: true, level: 1 })).toBeVisible();
  await expect(setupPage.getByRole("button", { name: "Ayarlar", exact: true })).toBeVisible();
  await expect(setupPage.locator(".setup-shell")).toHaveClass(/is-initial-setup/);
  await expect(setupPage.getByLabel("Firma adı")).toHaveValue("");
  await expect(setupPage.getByLabel("Oda sayısı")).toBeVisible();
  const storedOpenAiKeyInput = setupPage.getByLabel("AI güvenlik anahtarı");
  await expect(storedOpenAiKeyInput).toHaveValue("********************");
  await expect(setupPage.getByText("Kayıtlı bağlantı anahtarı maskelenir; Göster ile görüntüleyebilirsiniz.")).toBeVisible();
  await setupPage.getByRole("button", { name: "Göster" }).click();
  await expect(storedOpenAiKeyInput).toHaveValue("sk-openai-stored-smoke");
  await setupPage.getByRole("button", { name: "Gizle" }).click();
  await expect(storedOpenAiKeyInput).toHaveValue("********************");
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("openrouter");
  await expect(setupPage.getByLabel("Bağlantı adresi")).toHaveValue("https://openrouter.ai/api/v1");
  await setupPage.getByLabel("Model adı").fill("smoke/provider-model");
  await setupPage.getByLabel("AI güvenlik anahtarı").fill("openrouter-smoke-secret");
  await setupPage.getByRole("button", { name: "Bağlantıyı Dene" }).click();
  await expect(setupPage.getByText("OpenRouter bağlantısı çalışıyor.")).toBeVisible();
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("gemini");
  await setupPage.getByLabel("Google AI Studio cURL bağlantısı").fill("curl https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent -H 'X-goog-api-key: AQ.smoke-key'");
  await setupPage.getByRole("button", { name: "Bağlantıyı Dene" }).click();
  await expect(setupPage.getByText(/görsel girişi doğrulandı; 2 uygun Gemini modeli bulundu/)).toBeVisible();
  await expect(setupPage.getByText("2 görsel ve metin modeli hazır; kalıcı olması için ayarları kaydedin.")).toBeVisible();
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("gemini-3.5-flash");
  expect(await setupPage.evaluate(() => window.__aiConnectionTestCount)).toBe(2);
  await setupPage.getByLabel("Model adı").selectOption("gemini-3.1-flash-lite");
  await setupPage.waitForTimeout(100);
  expect(await setupPage.evaluate(() => window.__aiConnectionTestCount)).toBe(2);
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("openrouter");
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("smoke/provider-model");
  await expect(setupPage.getByLabel("AI güvenlik anahtarı")).toHaveValue("openrouter-smoke-secret");
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("gemini");
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("gemini-3.1-flash-lite");
  await expect(setupPage.getByText("2 görsel ve metin modeli hazır; kalıcı olması için ayarları kaydedin.")).toBeVisible();
  await setupPage.screenshot({ path: "artifacts/screenshots/desktop-first-run-settings.png", fullPage: true });
  await setupPage.getByLabel("Web eşitleme adresi").fill("https://yardimciasistan.alwaysdata.net/yardimci-asistan");
  await setupPage.getByLabel("Firma adı").fill("Smoke Pansiyon");
  await setupPage.getByRole("button", { name: "Ayarları Kaydet" }).click();
  await expect(setupPage.getByRole("heading", { name: "Ayarlar", exact: true, level: 1 })).toBeVisible();
  await expect(setupPage.locator(".setup-shell")).not.toHaveClass(/is-initial-setup/);
  await expect(setupPage.getByLabel("Servis sağlayıcı")).toHaveValue("gemini");
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("gemini-3.1-flash-lite");
  await expect(setupPage.getByText("2 görsel ve metin modeli bu sağlayıcı altında kayıtlı.")).toBeVisible();
  const storedGeminiKeyInput = setupPage.getByLabel("Google AI Studio cURL bağlantısı");
  await expect(storedGeminiKeyInput).toHaveValue("********************");
  await expect(setupPage.getByText("Kayıtlı bağlantı anahtarı maskelenir; Göster ile görüntüleyebilir veya yeni cURL yapıştırabilirsiniz.")).toBeVisible();
  await setupPage.getByRole("button", { name: "Göster" }).click();
  await expect(storedGeminiKeyInput).toHaveValue("AQ.smoke-key");
  await setupPage.getByRole("button", { name: "Gizle" }).click();
  await expect(storedGeminiKeyInput).toHaveValue("********************");
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("openrouter");
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("smoke/provider-model");
  const storedOpenRouterKeyInput = setupPage.getByLabel("AI güvenlik anahtarı");
  await expect(storedOpenRouterKeyInput).toHaveValue("********************");
  await setupPage.getByRole("button", { name: "Göster" }).click();
  await expect(storedOpenRouterKeyInput).toHaveValue("openrouter-smoke-secret");
  await setupPage.getByRole("button", { name: "Gizle" }).click();
  await expect(storedOpenRouterKeyInput).toHaveValue("********************");

  await browser.close();
  console.log(`desktop-renderer-ok: ${baseUrl}`);
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  server.kill();
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const freePort = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(freePort));
    });
  });
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Renderer server is still starting.
    }

    await delay(100);
  }

  throw new Error(`Desktop renderer did not become ready: ${url}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
