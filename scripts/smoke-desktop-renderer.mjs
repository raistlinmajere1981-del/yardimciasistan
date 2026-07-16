import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import http from "node:http";
import process from "node:process";

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("npx", ["vite", "--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", String(port)], {
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

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.addInitScript(({ setupData, dashboardData }) => {
    window.__openedExternalUrls = [];
    window.yardimciDesktop = {
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
      getAiWorkspaceHistory: async () => [],
      markWhatsAppMessageSent: async () => ({ ok: false, message: "smoke" }),
      openExternal: async (url) => {
        window.__openedExternalUrls.push(url);
        return true;
      }
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345", aiApiKeyConfigured: false },
    dashboardData: createDashboardConversionFixture()
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Ayarlar" }).click();
  await expect(page.getByRole("button", { name: "Ayarları Kaydet", exact: true })).toHaveCount(1);
  await expect(page.locator(".setup-footer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Panele Dön" })).toHaveCount(0);
  await expect(page.getByText("İşletme", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Görünüm", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Firma Bilgileri", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Modüller", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Kapasite ve Yardımcı", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1");
  await page.getByLabel("Arayüz ölçeği").selectOption("1.1");
  await page.getByLabel("Karanlık tema").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).zoom)).toBe("1.1");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.ui-preferences")))).toEqual({ theme: "dark", scale: 1.1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Ayarlar" }).click();
  await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1.1");
  await expect(page.getByLabel("Karanlık tema")).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "artifacts/screenshots/desktop-settings-dark.png", fullPage: true });
  await page.getByLabel("Arayüz ölçeği").selectOption("1");
  await page.getByLabel("Karanlık tema").uncheck();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.ui-preferences")))).toEqual({ theme: "light", scale: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Ayarlar" }).click();
  await page.getByLabel("AI cevap önerileri açık").check();
  await page.getByRole("tab", { name: "Gelişmiş Ayarlar" }).click();
  await expect(page.getByText("Web Bağlantısı", { exact: true })).toHaveCount(0);
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
  const [serviceBox, studioButtonBox, curlInputBox, showButtonBox, connectionButtonBox] = await Promise.all([
    page.locator(".setup-ai-service-field select").boundingBox(),
    page.locator(".setup-ai-studio-help button").boundingBox(),
    page.locator(".setup-ai-curl-field input").boundingBox(),
    page.locator(".setup-ai-curl-field button").boundingBox(),
    page.locator(".setup-ai-actions.is-inline > button").boundingBox()
  ]);
  expect(serviceBox).not.toBeNull();
  expect(studioButtonBox).not.toBeNull();
  expect(curlInputBox).not.toBeNull();
  expect(showButtonBox).not.toBeNull();
  expect(connectionButtonBox).not.toBeNull();
  expect(Math.abs(serviceBox.y - studioButtonBox.y)).toBeLessThanOrEqual(2);
  expect(studioButtonBox.x).toBeGreaterThan(serviceBox.x + serviceBox.width);
  expect(Math.abs(curlInputBox.y - connectionButtonBox.y)).toBeLessThanOrEqual(2);
  expect(showButtonBox.x).toBeLessThan(connectionButtonBox.x);
  await page.getByLabel("Google AI Studio cURL bağlantısı").fill("curl https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent -H 'X-goog-api-key: AQ.smoke-key'");
  await expect(page.getByRole("button", { name: "Bağlantıyı Dene" })).toBeEnabled();
  await page.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  expect(await page.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator(".nav-item")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "AI Yardımcı", exact: true })).toHaveCount(0);
  await expect(page.getByText("Web modül adresi")).toHaveCount(0);
  await expect(page.getByText("Yerel kayıt dosyası")).toHaveCount(0);
  await expect(page.getByText("Yedek klasörü")).toHaveCount(0);
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Menü", exact: true })).toBeVisible();
  await expect(page.locator(".page-header-copy > p")).toHaveText("Kategori ve ürünleri düzenleyip web menüsünü yayınlayın.");
  await expect(page.getByRole("heading", { name: "Kategoriler", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ürünler", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ürün Detayı", exact: true })).toBeVisible();
  await expect(page.locator(".menu-list-panel .panel-heading .status-badge")).toHaveText([/\d+ kayıt/, /\d+ kayıt/]);
  await expect(page.locator(".menu-management-grid .panel-heading p")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kategoriyi Kaydet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ürünü Kaydet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Önizle", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Önizle", exact: true }).click();
  const localMenuPreview = page.getByRole("dialog", { name: "Yerel Menü Önizlemesi" });
  await expect(localMenuPreview).toBeVisible();
  await expect(localMenuPreview.getByText("Yerel Serpme Kahvaltı", { exact: true })).toBeVisible();
  await expect(localMenuPreview.getByText("Gizli Menü Ürünü", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__openedExternalUrls)).toEqual([]);
  await page.screenshot({ path: "artifacts/screenshots/desktop-local-menu-preview.png", fullPage: true });
  await localMenuPreview.getByRole("button", { name: "Önizlemeyi kapat" }).click();
  await expect(localMenuPreview).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Web'e Yayınla", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Yayınla", exact: true })).toHaveCount(0);
  await expect(page.locator(".menu-list-panel").first().getByText("Sıra", { exact: true })).toBeHidden();
  await page.screenshot({ path: "artifacts/screenshots/desktop-qr-menu-manager.png", fullPage: true });

  await expect(page.locator(".menu-management-grid")).toBeVisible();

  await page.getByRole("button", { name: "Mesajlar" }).click();
  expect(await page.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.getByRole("heading", { name: "Mesajlar" })).toBeVisible();
  await expect(page.getByText("İletişim", { exact: true })).toHaveCount(0);
  await expect(page.locator(".whatsapp-request-panel .panel-heading")).toContainText("Talepler");
  await expect(page.locator(".whatsapp-request-panel .panel-heading .status-badge")).toHaveText(/\d+ kayıt/);
  await expect(page.locator(".whatsapp-request-panel .panel-heading p")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hazır Mesaj" })).toBeVisible();
  await expect(page.locator(".whatsapp-copy-panel .panel-heading p")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hazır Mesajı Kopyala" })).toBeVisible();
  await expect(page.getByText("AI ile mesajı düzenle", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI Araçları", exact: true })).toHaveCount(0);
  await expect(page.locator(".whatsapp-webview-frame")).toHaveCount(0);
  const [safeRequestPanelBox, safeCopyPanelBox] = await Promise.all([
    page.locator(".whatsapp-request-panel").boundingBox(),
    page.locator(".whatsapp-copy-panel").boundingBox()
  ]);
  expect(safeRequestPanelBox).not.toBeNull();
  expect(safeCopyPanelBox).not.toBeNull();
  expect(Math.abs(safeRequestPanelBox.height - safeCopyPanelBox.height)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "artifacts/screenshots/desktop-messages-safe-mode.png", fullPage: true });
  await page.getByRole("tab", { name: /WhatsApp Web Modu/ }).click();
  await expect(page.getByText("WhatsApp Web modu isteğe bağlıdır.", { exact: false })).toHaveCount(0);
  await expect(page.locator(".whatsapp-live-panel .panel-heading p")).toHaveCount(0);
  await expect(page.locator(".whatsapp-live-panel .panel-heading .status-badge")).toHaveCount(0);
  await expect(page.locator(".whatsapp-send-status")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Smoke Misafir" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Müşteri Numarasına Git" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Onayla ve Gönder" })).toBeVisible();
  await expect(page.locator(".whatsapp-webview-frame")).toBeVisible();
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("src", "https://web.whatsapp.com/");
  await page.locator(".whatsapp-webview").evaluate((element) => { element.dataset.persistenceMarker = "webview-kept-alive"; });
  await page.getByRole("tab", { name: /Güvenli Mod/ }).click();
  await expect(page.locator(".message-mode-content.is-hidden .whatsapp-webview")).toHaveCount(1);
  await page.getByRole("tab", { name: /WhatsApp Web Modu/ }).click();
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("data-persistence-marker", "webview-kept-alive");
  await page.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  await expect(page.locator(".persistent-messages-page.is-hidden .whatsapp-webview")).toHaveCount(1);
  await page.getByRole("button", { name: "Mesajlar", exact: true }).click();
  await expect(page.getByRole("tab", { name: /WhatsApp Web Modu/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("data-persistence-marker", "webview-kept-alive");

  const [requestPanelBox, livePanelBox, webviewFrameBox, webviewBox] = await Promise.all([
    page.locator(".message-mode-content:not(.is-hidden) .whatsapp-request-panel").boundingBox(),
    page.locator(".whatsapp-live-panel").boundingBox(),
    page.locator(".whatsapp-webview-frame").boundingBox(),
    page.locator(".whatsapp-webview").boundingBox()
  ]);
  expect(requestPanelBox).not.toBeNull();
  expect(livePanelBox).not.toBeNull();
  expect(webviewFrameBox).not.toBeNull();
  expect(webviewBox).not.toBeNull();
  expect(livePanelBox.y).toBeGreaterThan(requestPanelBox.y + requestPanelBox.height);
  expect(Math.abs(livePanelBox.x - requestPanelBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(livePanelBox.width - requestPanelBox.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(webviewBox.width - webviewFrameBox.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(webviewBox.height - webviewFrameBox.height)).toBeLessThanOrEqual(2);
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
  await conversionPage.addInitScript(({ setupData, dashboardData }) => {
    let currentDashboardData = dashboardData;
    window.yardimciDesktop = {
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
            newRequests: currentDashboardData.summary.newRequests + 1
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
              requestCount: 1,
              reservationCount: 0,
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
      convertRequestToReservation: async (requestId) => {
        currentDashboardData = {
          ...currentDashboardData,
          summary: {
            ...currentDashboardData.summary,
            newRequests: 0
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
      createManualBackup: async () => ({
        ok: true,
        message: "Yerel veritabanı yedeği oluşturuldu.",
        backupDirectory: "/tmp/yardimci-asistan/backups",
        backupFileName: "yardimci-asistan-smoke.sqlite",
        backupFilePath: "/tmp/yardimci-asistan/backups/yardimci-asistan-smoke.sqlite",
        createdAt: "2026-07-11T10:16:00+03:00",
        dashboardData
      }),
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
    dashboardData: createDashboardConversionFixture()
  });
  await conversionPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await conversionPage.getByRole("button", { name: "Ayarlar" }).click();
  await conversionPage.getByRole("tab", { name: "Gelişmiş Ayarlar" }).click();
  await expect(conversionPage.getByRole("button", { name: "Yedek Al" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Yedek Al" }).click();
  await expect(conversionPage.getByText("yardimci-asistan-smoke.sqlite")).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Android'e Yayınla" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Android'e Yayınla" }).click();
  await expect(conversionPage.getByText("2 günlük iş ile Android özeti yayınlandı.")).toBeVisible();
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
  await expect(conversionPage.getByRole("button", { name: "Talebe Kaydet" })).toBeDisabled();
  await conversionPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Rezervasyona Çevir" }).click();
  await expect(conversionPage.getByText("Rezervasyona çevrildi", { exact: true })).toBeVisible();
  await expect(conversionPage.getByText("Talep rezervasyona çevrildi ve onaylandı.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await expect(conversionPage.getByRole("heading", { name: "Müşteri İşleri" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyonu Aç" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Reddet", exact: true })).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "Elle Talep Ekle" }).click();
  await conversionPage.getByLabel("Ad soyad").fill("Manuel Smoke");
  await conversionPage.getByLabel("Telefon").fill("0555 333 44 66");
  await conversionPage.getByLabel("Tarih notu").fill("Bu akşam");
  await conversionPage.getByLabel("Kişi sayısı").fill("3");
  await conversionPage.getByLabel("Not", { exact: true }).fill("Telefonla alınan bahçe masası talebi.");
  await conversionPage.getByText("Detaylı bilgi", { exact: true }).click();
  await conversionPage.getByLabel("Giriş tarihi").fill("2026-07-18");
  await conversionPage.getByLabel("Saat").fill("21:00");
  await conversionPage.getByRole("button", { name: "Manuel Talep Kaydet" }).click();
  await expect(conversionPage.getByLabel("Talep yönetimi").getByText("Manuel talep kaydedildi.")).toBeVisible();
  await expect(conversionPage.getByRole("heading", { name: "Manuel Smoke" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Reddet", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Reddet", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Yeniden Aç" }).click();
  await conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" }).click();
  await expect(conversionPage.getByText("Talep durumu güncellendi.")).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Reddet", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await conversionPage.getByRole("tab", { name: "Müşteriler" }).click();
  await expect(conversionPage.getByLabel("Müşteri yönetimi")).toBeVisible();
  await expect(conversionPage.getByRole("heading", { name: "Smoke Misafir" })).toBeVisible();
  await conversionPage.getByLabel("Ara").fill("Smoke");
  await expect(conversionPage.getByText("Balkonlu oda için bilgi almak istiyorum.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Restoran" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Restoran" })).toBeVisible();
  await expect(conversionPage.getByText("Oda 101 giriş hazırlığı")).toHaveCount(0);
  await expect(conversionPage.getByText("Bahçe masası kontrolü")).toBeVisible();
  const smokeTableCard = conversionPage.getByLabel("Masa yönetimi").locator(".table-compact-card").filter({ hasText: "Smoke Bahçe Masası" });
  await expect(smokeTableCard.getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(smokeTableCard.getByRole("button", { name: "Hesap", exact: true })).toHaveAttribute("aria-pressed", "false");
  await conversionPage.getByRole("button", { name: "Tamamla" }).first().click();
  await expect(conversionPage.getByText("Günlük iş durumu güncellendi.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Hesap" }).first().click();
  await expect(conversionPage.getByText("Masa durumu güncellendi.")).toBeVisible();
  await expect(smokeTableCard.getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(smokeTableCard.getByRole("button", { name: "Hesap", exact: true })).toHaveAttribute("aria-pressed", "true");
  await conversionPage.getByRole("button", { name: "Pansiyon" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Pansiyon" })).toBeVisible();
  await expect(conversionPage.getByText("Oda 101 giriş hazırlığı")).toBeVisible();
  const roomCard = conversionPage.getByLabel("Oda yönetimi").locator(".resource-compact-card").filter({ hasText: "Smoke Balkonlu Oda" });
  await expect(roomCard.locator(".status-badge")).toHaveText("Rezerve");
  await expect(roomCard.locator(".compact-reservation-line")).toContainText("Smoke Misafir - 2 gece");
  await expect(roomCard.locator(".compact-status-actions .is-active")).toHaveCount(0);
  await expect(roomCard.getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "false");
  const roomWithoutReservationCard = conversionPage.getByLabel("Oda yönetimi").locator(".resource-compact-card").filter({ hasText: "Smoke Aile Odası" });
  await expect(roomWithoutReservationCard.locator(".status-badge")).toHaveText("Rezerve");
  await expect(roomWithoutReservationCard.locator(".compact-reservation-line")).toContainText("Aktif rezervasyon yok");
  await expect(roomWithoutReservationCard.locator(".compact-status-actions .is-active")).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "Dolu" }).first().click();
  await expect(conversionPage.getByText("Oda durumu güncellendi.")).toBeVisible();
  await expect(roomCard.getByRole("button", { name: "Dolu", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(roomCard.getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "false");
  const reservationWorkspace = conversionPage.getByLabel("Rezervasyon yönetimi");
  await expect(reservationWorkspace.getByLabel("Durum")).toBeVisible();
  await expect(conversionPage.locator(".reservation-filters").getByText("Gün / Ay / Yıl", { exact: true })).toBeVisible();
  await expect(reservationWorkspace.locator(".localized-date-display")).toHaveText("Tarih seç");
  await reservationWorkspace.getByLabel("Tarih").fill("2026-07-18");
  await expect(reservationWorkspace.locator(".localized-date-display")).toHaveText("18.07.2026");
  await expect(conversionPage.getByText(/1\s*görünen kayıt/)).toBeVisible();
  await reservationWorkspace.getByLabel("Durum").selectOption("pending");
  await expect(conversionPage.getByText(/1\s*görünen kayıt/)).toBeVisible();
  await conversionPage.getByRole("button", { name: "Onayla" }).first().click();
  await expect(conversionPage.getByText("Rezervasyon durumu güncellendi.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Filtreyi Temizle" }).click();
  await expect(conversionPage.getByRole("button", { name: "WhatsApp", exact: true }).first()).toBeVisible();

  const compactPage = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await compactPage.addInitScript(({ setupData, dashboardData }) => {
    window.yardimciDesktop = {
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
      getAiWorkspaceHistory: async () => [],
      markWhatsAppMessageSent: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "compact-smoke-secret" },
    dashboardData: createCompactUiFixture()
  });
  await compactPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

  await expect(compactPage.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await compactPage.evaluate(() => getComputedStyle(document.documentElement).zoom)).toBe("1");
  const [sidebarWidth, pageHeaderHeight] = await Promise.all([
    compactPage.locator(".sidebar").evaluate((sidebar) => sidebar.getBoundingClientRect().width),
    compactPage.locator(".page-header").evaluate((header) => header.getBoundingClientRect().height)
  ]);
  expect(sidebarWidth).toBeGreaterThanOrEqual(198);
  expect(sidebarWidth).toBeLessThanOrEqual(202);
  expect(pageHeaderHeight).toBeGreaterThanOrEqual(54);
  expect(pageHeaderHeight).toBeLessThanOrEqual(60);

  const dashboardRequestRows = compactPage.locator(".dashboard-request-row");
  await expect(dashboardRequestRows).toHaveCount(8);
  const metricBoxes = await compactPage.locator(".metric-card").evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { width: box.width, height: box.height, y: box.y };
  }));
  expect(metricBoxes).toHaveLength(6);
  expect(new Set(metricBoxes.map((box) => Math.round(box.y))).size).toBe(2);
  expect(metricBoxes.every((box) => box.width >= 300)).toBe(true);
  expect(Math.min(...metricBoxes.map((box) => box.height))).toBeGreaterThanOrEqual(78);
  expect(Math.max(...metricBoxes.map((box) => box.height))).toBeLessThanOrEqual(90);
  const dashboardRowHeights = await dashboardRequestRows.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(dashboardRowHeights.every((height) => height <= 96)).toBe(true);
  await expect(dashboardRequestRows.first().locator("button")).toHaveCount(2);
  const firstRequestNote = dashboardRequestRows.first().locator(".line-clamp-1");
  expect(await firstRequestNote.evaluate((note) => getComputedStyle(note).whiteSpace)).toBe("nowrap");
  expect(await firstRequestNote.evaluate((note) => note.scrollWidth > note.clientWidth)).toBe(true);
  const fifthDashboardRow = await dashboardRequestRows.nth(4).boundingBox();
  expect(fifthDashboardRow).not.toBeNull();
  expect(fifthDashboardRow.y + fifthDashboardRow.height).toBeLessThanOrEqual(768);
  const lastDashboardSummaryPanel = await compactPage.locator(".dashboard-operations .panel").last().boundingBox();
  expect(lastDashboardSummaryPanel).not.toBeNull();
  expect(lastDashboardSummaryPanel.y + lastDashboardSummaryPanel.height).toBeLessThanOrEqual(768);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-dashboard-1366x768.png" });

  await compactPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await compactPage.getByRole("button", { name: /Kompakt Misafir 4/ }).click();
  const customerRequestRows = compactPage.locator(".requests-workspace .manager-row");
  await expect(customerRequestRows).toHaveCount(8);
  const customerRowHeights = await customerRequestRows.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(customerRowHeights.every((height) => height <= 60)).toBe(true);
  const requestDetailHeight = await compactPage.locator(".request-detail-panel").evaluate((panel) => panel.getBoundingClientRect().height);
  expect(requestDetailHeight).toBeLessThan(420);
  await expect(compactPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-customer-work-1366x768.png" });

  await compactPage.getByRole("button", { name: "Pansiyon", exact: true }).click();
  const reservationRows = compactPage.locator(".reservation-record-row");
  await expect(reservationRows).toHaveCount(3);
  const reservationHeights = await reservationRows.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(reservationHeights.every((height) => height >= 72 && height <= 96)).toBe(true);
  await expect(reservationRows.first().locator(".compact-action-bar button")).toHaveCount(2);
  await reservationRows.first().locator("summary").click();
  await expect(reservationRows.first().getByRole("button", { name: "Reddet" })).toBeVisible();
  await expect(reservationRows.first().getByRole("button", { name: "İptal Et" })).toBeVisible();
  await reservationRows.first().locator("summary").click();
  const roomCardHeights = await compactPage.locator(".resource-compact-card").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
  expect(Math.max(...roomCardHeights)).toBeLessThan(170);
  const compactRoomCards = compactPage.getByLabel("Oda yönetimi").locator(".resource-compact-card");
  await expect(compactRoomCards.first().locator(".compact-status-actions .is-active")).toHaveCount(0);
  await expect(compactRoomCards.first().getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(compactRoomCards.nth(3).getByRole("button", { name: "Temizlik", exact: true })).toHaveAttribute("aria-pressed", "true");
  const firstRoomCard = await compactPage.locator(".resource-compact-card").first().boundingBox();
  expect(firstRoomCard).not.toBeNull();
  expect(firstRoomCard.y + firstRoomCard.height).toBeLessThanOrEqual(768);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-pension-1366x768.png" });

  await compactPage.getByRole("button", { name: "Restoran", exact: true }).click();
  const firstTableHeight = await compactPage.locator(".table-compact-card").first().evaluate((card) => card.getBoundingClientRect().height);
  const firstTaskHeight = await compactPage.locator(".task-record-row").first().evaluate((card) => card.getBoundingClientRect().height);
  expect(firstTableHeight).toBeLessThan(150);
  expect(firstTaskHeight).toBeLessThan(120);
  const compactTableCards = compactPage.locator(".table-compact-card");
  await expect(compactTableCards.first().locator(".compact-status-actions button")).toHaveCount(4);
  for (const [index, label] of ["Boş", "Dolu", "Rezerve", "Hesap"].entries()) {
    await expect(compactTableCards.nth(index).getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(compactTableCards.nth(index).locator(".compact-status-actions .is-active")).toHaveCount(1);
  }
  await expect(compactPage.locator(".task-record-row").first().locator(".compact-action-bar button")).toHaveCount(1);
  await compactPage.locator(".task-record-row").first().locator("summary").click();
  await expect(compactPage.locator(".task-record-row").first().getByRole("button", { name: "İptal Et" })).toBeVisible();
  await compactPage.locator(".task-record-row").first().locator("summary").click();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-restaurant-1366x768.png" });

  await compactPage.getByRole("button", { name: "Menü", exact: true }).click();
  const menuRowHeights = await compactPage.locator(".menu-management-grid .manager-row").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(menuRowHeights.length).toBeGreaterThanOrEqual(8);
  expect(menuRowHeights.every((height) => height >= 50 && height <= 60)).toBe(true);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-menu-1366x768.png" });

  await compactPage.getByRole("button", { name: "Mesajlar", exact: true }).click();
  const preparedMessageHeight = await compactPage.getByLabel("Hazır WhatsApp mesajı").evaluate((field) => field.getBoundingClientRect().height);
  expect(preparedMessageHeight).toBeGreaterThanOrEqual(110);
  expect(preparedMessageHeight).toBeLessThanOrEqual(180);
  await expect(compactPage.locator(".whatsapp-request-list .manager-row")).toHaveCount(8);
  const [compactRequestPanelBox, compactCopyPanelBox, compactRequestScroll] = await Promise.all([
    compactPage.locator(".whatsapp-request-panel").boundingBox(),
    compactPage.locator(".whatsapp-copy-panel").boundingBox(),
    compactPage.locator(".whatsapp-request-list").evaluate((list) => ({
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight
    }))
  ]);
  expect(compactRequestPanelBox).not.toBeNull();
  expect(compactCopyPanelBox).not.toBeNull();
  expect(Math.abs(compactRequestPanelBox.height - compactCopyPanelBox.height)).toBeLessThanOrEqual(1);
  expect(compactRequestScroll.scrollHeight).toBeGreaterThan(compactRequestScroll.clientHeight);
  await compactPage.locator(".whatsapp-request-list").evaluate((list) => { list.scrollTop = list.scrollHeight; });
  expect(await compactPage.locator(".whatsapp-request-list").evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-messages-1366x768.png" });

  await compactPage.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await compactPage.locator(".content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const settingsSectionBox = await compactPage.locator(".setup-section").last().boundingBox();
  expect(settingsSectionBox).not.toBeNull();
  await expect(compactPage.locator(".setup-footer")).toHaveCount(0);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-settings-1366x768.png" });
  await compactPage.close();

  const pullPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await pullPage.addInitScript(({ setupData, dashboardData, pulledRequest }) => {
    let currentDashboardData = dashboardData;
    window.yardimciDesktop = {
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
            newRequests: 1
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
    pulledRequest: createPulledRequestFixture()
  });
  await pullPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(pullPage.getByText("Henüz yeni talep yok.")).toBeVisible();
  await pullPage.getByRole("button", { name: "Web Taleplerini Çek" }).click();
  await expect(pullPage.getByText("1 talep alındı.")).toBeVisible();
  await expect(pullPage.getByRole("heading", { name: "Web Sync Smoke" })).toBeVisible();
  await expect(pullPage.getByText("Bahçe masa için canlı web talebi.")).toBeVisible();
  await pullPage.screenshot({ path: "artifacts/screenshots/desktop-web-pull-flow.png", fullPage: true });

  const setupPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupPage.addInitScript(({ setupData, dashboardData }) => {
    window.__aiConnectionTestCount = 0;
    window.yardimciDesktop = {
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
      saveInitialSetup: async (input) => ({
        ok: true,
        message: "Ayarlar kaydedildi ve AI bağlantısı web sitesinde güncellendi.",
        setupData: {
          ...setupData,
          setupRequired: false,
          businessName: input.businessName,
          businessType: input.businessType,
          phone: input.phone,
          whatsapp: input.whatsapp,
          email: input.email,
          address: input.address,
          webModuleUrl: input.webModuleUrl,
          syncSecret: input.syncSecret,
          aiEnabled: input.aiEnabled,
          aiProvider: input.aiProvider,
          aiService: input.aiService,
          aiBaseUrl: input.aiBaseUrl,
          aiModel: input.aiModel,
          aiTimeoutSeconds: input.aiTimeoutSeconds,
          aiApiKeyConfigured: Boolean(input.aiApiKey) || setupData.aiApiKeyConfigured,
          aiLastPublishedAt: "2026-07-12T10:00:00.000Z",
          modules: input.modules,
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
      }),
      testAiConnection: async (input) => {
        window.__aiConnectionTestCount += 1;
        if (input.service === "gemini") {
          return {
            ok: true,
            message: "Google AI Studio bağlantısı doğrulandı; 2 kullanılabilir Gemini modeli bulundu.",
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
    dashboardData: createDashboardFixture()
  });
  await setupPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(setupPage.getByRole("heading", { name: "İşletme panelini kullanıma hazırlayın." })).toBeVisible();
  await expect(setupPage.getByLabel("Firma adı")).toHaveValue("Deniz Çiçeği Pansiyon & Kafe");
  await setupPage.getByRole("tab", { name: "Gelişmiş Ayarlar" }).click();
  await expect(setupPage.getByText("Anahtar bu cihazda güvenli biçimde kayıtlı.")).toBeVisible();
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("openrouter");
  await expect(setupPage.getByLabel("Bağlantı adresi")).toHaveValue("https://openrouter.ai/api/v1");
  await setupPage.getByLabel("Model adı").fill("smoke/provider-model");
  await setupPage.getByRole("button", { name: "Bağlantıyı Dene" }).click();
  await expect(setupPage.getByText("OpenRouter bağlantısı çalışıyor.")).toBeVisible();
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("gemini");
  await setupPage.getByLabel("Google AI Studio cURL bağlantısı").fill("curl https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent -H 'X-goog-api-key: AQ.smoke-key'");
  await setupPage.getByRole("button", { name: "Bağlantıyı Dene" }).click();
  await expect(setupPage.getByText(/2 kullanılabilir Gemini modeli bulundu/)).toBeVisible();
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("gemini-3.5-flash");
  expect(await setupPage.evaluate(() => window.__aiConnectionTestCount)).toBe(2);
  await setupPage.getByLabel("Model adı").selectOption("gemini-3.1-flash-lite");
  await setupPage.waitForTimeout(100);
  expect(await setupPage.evaluate(() => window.__aiConnectionTestCount)).toBe(2);
  await setupPage.screenshot({ path: "artifacts/screenshots/desktop-setup-wizard.png", fullPage: true });
  await setupPage.getByLabel("Web modül adresi").fill("https://yardimciasistan.alwaysdata.net/yardimci-asistan");
  await setupPage.getByRole("tab", { name: "Temel Ayarlar" }).click();
  await setupPage.getByLabel("Firma adı").fill("Smoke Pansiyon");
  await setupPage.getByRole("button", { name: "Kurulumu Kaydet" }).click();
  await expect(setupPage.getByRole("heading", { name: "Bugün ne var?" })).toBeVisible();

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

function createSetupFixture() {
  return {
    setupRequired: true,
    businessName: "Deniz Çiçeği Pansiyon & Kafe",
    businessType: "pension_restaurant",
    phone: "+905321234567",
    whatsapp: "+905321234567",
    email: "merhaba@denizcicegi.example",
    address: "Sahil Yolu No: 18, Akyaka / Muğla",
    webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
    syncSecret: "change-this-secret",
    aiEnabled: true,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "smoke-model",
    aiTimeoutSeconds: 30,
    aiApiKeyConfigured: true,
    aiLastPublishedAt: "",
    modules: {
      rooms: true,
      tables: true,
      qrMenu: true,
      whatsapp: true,
      android: true
    },
    initialCounts: {
      rooms: 2,
      tables: 2
    }
  };
}

function createDashboardFixture() {
  return {
    databasePath: "/tmp/yardimci-asistan.sqlite",
    backupPath: "/tmp/yardimci-asistan/backups",
    webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
    requests: [],
    rooms: [
      {
        id: "room_smoke_101",
        name: "Smoke Balkonlu Oda",
        number: "101",
        capacity: 2,
        bedInfo: "1 çift kişilik yatak",
        floor: "1. Kat",
        status: "available",
        features: ["Klima", "Balkon"],
        description: "Renderer smoke oda kaydı.",
        priceNote: "",
        isActive: true,
        sortOrder: 1,
        activeReservationTitle: "Smoke Misafir - 2 gece",
        updatedAt: "2026-07-11T10:00:00+03:00"
      },
      {
        id: "room_smoke_102",
        name: "Smoke Aile Odası",
        number: "102",
        capacity: 4,
        bedInfo: "1 çift kişilik yatak + 2 tek kişilik yatak",
        floor: "1. Kat",
        status: "reserved",
        features: ["Klima"],
        description: "Aktif rezervasyonu olmayan smoke oda kaydı.",
        priceNote: "",
        isActive: true,
        sortOrder: 2,
        activeReservationTitle: "Eski rezervasyon başlığı",
        updatedAt: "2026-07-11T10:00:00+03:00"
      }
    ],
    tables: [
      {
        id: "table_smoke_001",
        name: "Smoke Bahçe Masası",
        area: "Bahçe",
        capacity: 4,
        status: "available",
        currentCustomerId: "",
        currentReservationId: "reservation_smoke_001",
        activeReservationTitle: "Smoke Misafir - akşam",
        notes: "",
        isActive: true,
        sortOrder: 1,
        updatedAt: "2026-07-11T10:00:00+03:00"
      }
    ],
    reservations: [
      {
        id: "reservation_smoke_001",
        requestId: "request_smoke_001",
        customerId: "customer_smoke_001",
        customerName: "Smoke Misafir",
        customerPhone: "+905321234567",
        reservationType: "room",
        status: "pending",
        title: "Smoke Misafir - 2 gece",
        startDate: "2026-07-18",
        endDate: "2026-07-20",
        time: "",
        guestCount: 2,
        adultCount: 2,
        childCount: 0,
        roomIds: ["room_smoke_101"],
        tableIds: [],
        notes: "Balkonlu oda istedi.",
        priceNote: "Fiyat işletme sahibi tarafından verilecek.",
        paymentStatus: "not_required",
        updatedAt: "2026-07-11T10:15:00+03:00"
      }
    ],
    dailyTasks: [
      {
        id: "task_smoke_001",
        title: "Oda 101 giriş hazırlığı",
        description: "Smoke Misafir için giriş hazırlığı.",
        taskType: "check_in",
        status: "pending",
        dueDate: "2026-07-18",
        dueTime: "14:00",
        relatedType: "reservation",
        relatedId: "reservation_smoke_001",
        updatedAt: "2026-07-11T10:15:00+03:00"
      },
      {
        id: "task_smoke_002",
        title: "Bahçe masası kontrolü",
        description: "Akşam servisi öncesi masa kontrolü.",
        taskType: "table_reservation",
        status: "pending",
        dueDate: "2026-07-18",
        dueTime: "18:00",
        relatedType: "table",
        relatedId: "table_smoke_001",
        updatedAt: "2026-07-11T10:15:00+03:00"
      }
    ],
    customers: [
      {
        id: "customer_smoke_001",
        fullName: "Smoke Misafir",
        phone: "+905321234567",
        email: "",
        source: "web_form",
        notes: "Balkonlu oda için bilgi almak istiyor.",
        tags: ["smoke", "pansiyon"],
        lastContactAt: "2026-07-11T10:15:00+03:00",
        requestCount: 1,
        reservationCount: 1,
        updatedAt: "2026-07-11T10:15:00+03:00"
      }
    ],
    menu: {
      categories: [],
      items: [],
      updated_at: "2026-07-10T10:00:00+03:00"
    },
    summary: {
      newRequests: 0,
      pendingDailyTasks: 0,
      availableRooms: 0,
      totalRooms: 0,
      availableTables: 0,
      pendingReservations: 0,
      preparedWhatsAppMessages: 0,
      activeMenuCategories: 0,
      availableMenuItems: 0
    }
  };
}

function createDashboardConversionFixture() {
  return {
    ...createDashboardFixture(),
    requests: [
      {
        id: "request_smoke_001",
        customer_id: "",
        source: "web_form",
        request_type: "pension_reservation",
        status: "new",
        customer_name: "Smoke Misafir",
        customer_phone: "+905321234567",
        date_text: "18-20 Temmuz",
        start_date: "2026-07-18",
        end_date: "2026-07-20",
        time: "",
        guest_count: 2,
        adult_count: 2,
        child_count: 0,
        message: "Balkonlu oda için bilgi almak istiyorum.",
        ai_summary: "2 kişilik balkonlu oda talebi.",
        ai_suggested_reply: "Merhaba, müsaitliği kontrol edip dönüş yapacağız.",
        whatsapp_message: "Merhaba, müsaitliği kontrol edip dönüş yapacağız.",
        assigned_to: "",
        priority: "normal",
        sync_status: "synced",
        created_at: "2026-07-11T10:15:00+03:00",
        updated_at: "2026-07-11T10:15:00+03:00"
      }
    ],
    menu: {
      categories: [
        {
          id: "category_local_preview",
          name: "Yerel Kahvaltı",
          description: "Henüz webde yayınlanmamış yerel kategori.",
          is_active: true,
          sort_order: 10,
          created_at: "2026-07-16T10:00:00+03:00",
          updated_at: "2026-07-16T10:30:00+03:00"
        },
        {
          id: "category_hidden_preview",
          name: "Pasif Kategori",
          description: "Önizlemede gösterilmemeli.",
          is_active: false,
          sort_order: 20,
          created_at: "2026-07-16T10:00:00+03:00",
          updated_at: "2026-07-16T10:30:00+03:00"
        }
      ],
      items: [
        {
          id: "item_local_preview",
          category_id: "category_local_preview",
          name: "Yerel Serpme Kahvaltı",
          description: "Yalnızca uygulamadaki güncel kayıttan gelen ürün.",
          price: 525,
          currency: "TRY",
          image_url: "",
          is_available: true,
          is_featured: true,
          allergens: ["süt"],
          tags: ["yerel", "yeni"],
          sort_order: 10,
          created_at: "2026-07-16T10:00:00+03:00",
          updated_at: "2026-07-16T10:30:00+03:00"
        },
        {
          id: "item_hidden_preview",
          category_id: "category_local_preview",
          name: "Gizli Menü Ürünü",
          description: "Mevcut olmadığı için önizlemede gösterilmemeli.",
          price: 100,
          currency: "TRY",
          image_url: "",
          is_available: false,
          is_featured: false,
          allergens: [],
          tags: [],
          sort_order: 20,
          created_at: "2026-07-16T10:00:00+03:00",
          updated_at: "2026-07-16T10:30:00+03:00"
        }
      ],
      updated_at: "2026-07-16T10:30:00+03:00"
    },
    summary: {
      ...createDashboardFixture().summary,
      newRequests: 1,
      activeMenuCategories: 1,
      availableMenuItems: 1
    }
  };
}

function createCompactUiFixture() {
  const base = createDashboardConversionFixture();
  const requestTemplate = base.requests[0];
  const reservationTemplate = base.reservations[0];
  const roomTemplate = base.rooms[0];
  const tableTemplate = base.tables[0];
  const taskTemplate = base.dailyTasks[0];
  const statuses = ["new", "answered", "new", "rejected", "new", "answered", "new", "closed"];
  const requests = Array.from({ length: 8 }, (_, index) => ({
    ...requestTemplate,
    id: `compact_request_${index + 1}`,
    customer_id: `compact_customer_${index + 1}`,
    request_type: index % 2 === 0 ? "pension_reservation" : "restaurant_reservation",
    status: statuses[index],
    customer_name: `Kompakt Misafir ${index + 1}`,
    customer_phone: `+9053212300${String(index + 1).padStart(2, "0")}`,
    date_text: index % 2 === 0 ? "18-20 Temmuz" : "Bu akşam 20:30",
    guest_count: (index % 4) + 1,
    message: "Uzun talep notunun liste kartını büyütmeden ilk satırda kesilmesi ve detay alanında okunabilmesi kontrol ediliyor.",
    ai_summary: "Tarih, kişi sayısı ve tercih bilgilerini içeren iki satırı geçmeyen kompakt AI özeti.",
    created_at: `2026-07-${String(10 + index).padStart(2, "0")}T10:15:00+03:00`,
    updated_at: `2026-07-${String(10 + index).padStart(2, "0")}T10:15:00+03:00`
  }));
  const rooms = Array.from({ length: 4 }, (_, index) => ({
    ...roomTemplate,
    id: `compact_room_${index + 1}`,
    name: index % 2 === 0 ? "Balkonlu Standart Oda" : "Aile Odası",
    number: String(101 + index),
    capacity: index % 2 === 0 ? 2 : 4,
    status: index === 3 ? "cleaning" : "available",
    description: "Odanın uzun açıklaması kartı büyütmeden tek satırda gösterilir.",
    sortOrder: index + 1
  }));
  const reservations = Array.from({ length: 3 }, (_, index) => ({
    ...reservationTemplate,
    id: `compact_reservation_${index + 1}`,
    requestId: requests[index].id,
    customerId: requests[index].customer_id,
    customerName: requests[index].customer_name,
    customerPhone: requests[index].customer_phone,
    status: index === 1 ? "approved" : "pending",
    title: `${requests[index].customer_name} - ${index + 1} gece`,
    startDate: `2026-07-${18 + index}`,
    endDate: `2026-07-${20 + index}`,
    guestCount: index + 2,
    roomIds: [rooms[index].id],
    notes: "Balkon tercihi ve geç giriş notu uzun kart oluşturmadan özetlenir."
  }));
  const tables = Array.from({ length: 4 }, (_, index) => ({
    ...tableTemplate,
    id: `compact_table_${index + 1}`,
    name: `${index % 2 === 0 ? "Bahçe" : "Salon"} Masası ${index + 1}`,
    area: index % 2 === 0 ? "Bahçe" : "Salon",
    capacity: index % 2 === 0 ? 4 : 2,
    status: ["available", "occupied", "reserved", "bill_waiting"][index],
    currentReservationId: index === 2 ? reservations[0].id : "",
    activeReservationTitle: index === 2 ? `${requests[0].customer_name} - akşam` : "",
    notes: "Servis öncesi kısa masa notu.",
    sortOrder: index + 1
  }));
  const dailyTasks = Array.from({ length: 6 }, (_, index) => ({
    ...taskTemplate,
    id: `compact_task_${index + 1}`,
    title: index < 3 ? `Oda ${101 + index} hazırlığı` : `${tables[index - 3].name} kontrolü`,
    description: "Operasyon notu liste satırında tek satır olarak kalır ve gerektiğinde detay açılır.",
    taskType: index < 3 ? "check_in" : "table_reservation",
    status: index === 2 ? "done" : "pending",
    dueDate: "2026-07-18",
    dueTime: `${String(14 + index).padStart(2, "0")}:00`,
    relatedType: index < 3 ? "reservation" : "table",
    relatedId: index < 3 ? reservations[index].id : tables[index - 3].id
  }));
  const categories = Array.from({ length: 6 }, (_, index) => ({
    id: `compact_category_${index + 1}`,
    name: ["Kahvaltı", "Sıcaklar", "Atıştırmalıklar", "Tatlılar", "Sıcak İçecekler", "Soğuk İçecekler"][index],
    description: "Kompakt kategori açıklaması.",
    is_active: index !== 5,
    sort_order: (index + 1) * 10,
    created_at: "2026-07-10T10:00:00+03:00",
    updated_at: "2026-07-10T10:00:00+03:00"
  }));
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: `compact_item_${index + 1}`,
    category_id: categories[index % categories.length].id,
    name: `Menü Ürünü ${index + 1}`,
    description: "Uzun ürün açıklaması kendi alanında kaydırılabilir kalır.",
    price: 90 + index * 15,
    currency: "TRY",
    image_url: "",
    is_available: index !== 9,
    is_featured: index < 2,
    allergens: index % 2 === 0 ? ["gluten"] : [],
    tags: ["smoke"],
    sort_order: (index + 1) * 10,
    created_at: "2026-07-10T10:00:00+03:00",
    updated_at: "2026-07-10T10:00:00+03:00"
  }));

  return {
    ...base,
    requests,
    rooms,
    tables,
    reservations,
    dailyTasks,
    customers: requests.map((request, index) => ({
      id: request.customer_id,
      fullName: request.customer_name,
      phone: request.customer_phone,
      email: `misafir${index + 1}@example.test`,
      source: request.source,
      notes: request.message,
      tags: ["kompakt", index % 2 === 0 ? "pansiyon" : "restoran"],
      lastContactAt: request.updated_at,
      requestCount: 1,
      reservationCount: index < reservations.length ? 1 : 0,
      updatedAt: request.updated_at
    })),
    menu: { categories, items, updated_at: "2026-07-15T10:00:00+03:00" },
    summary: {
      ...base.summary,
      newRequests: requests.filter((request) => request.status === "new").length,
      pendingDailyTasks: dailyTasks.filter((task) => task.status === "pending").length,
      availableRooms: 1,
      totalRooms: rooms.length,
      availableTables: tables.filter((table) => table.status === "available").length,
      pendingReservations: reservations.filter((reservation) => reservation.status === "pending").length,
      preparedWhatsAppMessages: requests.length,
      activeMenuCategories: categories.filter((category) => category.is_active).length,
      availableMenuItems: items.filter((item) => item.is_available).length
    }
  };
}

function createPulledRequestFixture() {
  return {
    id: "request_web_pull_smoke_001",
    customer_id: "customer_web_pull_smoke_001",
    source: "web_form",
    request_type: "restaurant_reservation",
    status: "new",
    customer_name: "Web Sync Smoke",
    customer_phone: "+905551112233",
    date_text: "Bu akşam",
    start_date: "2026-07-18",
    end_date: "",
    time: "20:30",
    guest_count: 4,
    adult_count: 4,
    child_count: 0,
    message: "Bahçe masa için canlı web talebi.",
    ai_summary: "",
    ai_suggested_reply: "",
    whatsapp_message: "Merhaba, masa talebinizi aldık. Uygunluğu kontrol edip size dönüş yapacağız.",
    assigned_to: "",
    priority: "normal",
    sync_status: "synced",
    synced_at: "2026-07-11T10:45:00+03:00",
    created_at: "2026-07-11T10:44:00+03:00",
    updated_at: "2026-07-11T10:45:00+03:00"
  };
}
