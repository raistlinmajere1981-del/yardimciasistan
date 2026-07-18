import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
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
  expect(Math.abs(serviceBox.y - studioButtonBox.y)).toBeLessThanOrEqual(3);
  expect(studioButtonBox.x).toBeGreaterThan(serviceBox.x + serviceBox.width);
  expect(Math.abs(curlInputBox.y - connectionButtonBox.y)).toBeLessThanOrEqual(4);
  expect(showButtonBox.x).toBeLessThan(connectionButtonBox.x);
  await page.getByLabel("Google AI Studio cURL bağlantısı").fill("curl https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent -H 'X-goog-api-key: AQ.smoke-key'");
  await expect(page.getByRole("button", { name: "Bağlantıyı Dene" })).toBeEnabled();
  await page.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  expect(await page.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator(".nav-item")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "AI Yardımcı", exact: true })).toHaveCount(0);
  await expect(page.getByText("Web eşitleme adresi")).toHaveCount(0);
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
  const liveMenuPreview = page.getByLabel("Canlı menü önizlemesi");
  await expect(liveMenuPreview).toBeVisible();
  await expect(liveMenuPreview.getByText("Yerel Serpme Kahvaltı", { exact: true })).toBeVisible();
  await liveMenuPreview.getByRole("button", { name: "Tüm Ürünler" }).click();
  await expect(liveMenuPreview.getByRole("button", { name: "Tüm Ürünler" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Ürün adı").fill("Canlı Serpme Kahvaltı");
  await expect(liveMenuPreview.getByText("Canlı Serpme Kahvaltı", { exact: true })).toBeVisible();
  await page.getByLabel("Ürün adı").fill("Yerel Serpme Kahvaltı");
  await liveMenuPreview.getByRole("button", { name: "Mobil önizleme" }).click();
  await expect(liveMenuPreview.locator(".menu-live-stage")).toHaveClass(/is-mobile/);
  await liveMenuPreview.getByRole("button", { name: "Masaüstü önizlemesi" }).click();
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
  await expect(page.locator(".whatsapp-copy-panel").getByRole("heading", { name: "Smoke Misafir" })).toBeVisible();
  await expect(page.locator(".whatsapp-copy-panel .detail-category-label")).toHaveText("Hazır yanıt");
  await expect(page.locator(".whatsapp-copy-panel .panel-heading p")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hazır Mesajı Kopyala" })).toBeVisible();
  await expect(page.getByText("AI ile mesajı düzenle", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI Araçları", exact: true })).toHaveCount(0);
  await expect(page.locator(".whatsapp-webview-frame")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Güvenli Mod" })).toHaveAttribute("aria-selected", "true");
  const [safeRequestPanelBox, safeCopyPanelBox] = await Promise.all([
    page.locator(".whatsapp-request-panel").boundingBox(),
    page.locator(".whatsapp-copy-panel").boundingBox()
  ]);
  expect(safeRequestPanelBox).not.toBeNull();
  expect(safeCopyPanelBox).not.toBeNull();
  expect(Math.abs(safeRequestPanelBox.height - safeCopyPanelBox.height)).toBeLessThanOrEqual(1);
  expect(safeRequestPanelBox.width).toBeGreaterThanOrEqual(280);
  expect(safeRequestPanelBox.width).toBeLessThanOrEqual(320);
  const preparedMessageBox = await page.getByLabel("Hazır WhatsApp mesajı").boundingBox();
  expect(preparedMessageBox).not.toBeNull();
  expect(preparedMessageBox.height).toBeGreaterThanOrEqual(110);
  expect(preparedMessageBox.height).toBeLessThanOrEqual(150);
  expect(await page.getByLabel("Hazır WhatsApp mesajı").evaluate((field) => getComputedStyle(field).overflowY)).toBe("auto");
  await page.screenshot({ path: "artifacts/screenshots/desktop-messages-safe-mode.png", fullPage: true });
  await page.getByRole("tab", { name: /WhatsApp Web Modu/ }).click();
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
  expect(readFileSync("apps/desktop-app/src/App.tsx", "utf8")).toContain("allowpopups");
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("webpreferences", "contextIsolation=yes,nodeIntegration=no");
  await page.locator(".whatsapp-webview").evaluate((element) => { element.dataset.persistenceMarker = "webview-kept-alive"; });
  await webControlBar.getByRole("button", { name: "Güvenli Moda Dön" }).click();
  await expect(page.getByRole("tab", { name: /Güvenli Mod/ })).toHaveAttribute("aria-selected", "true");
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
  expect(livePanelBox.x).toBeGreaterThan(requestPanelBox.x + requestPanelBox.width);
  expect(Math.abs(livePanelBox.y - requestPanelBox.y)).toBeLessThanOrEqual(1);
  expect(requestPanelBox.width).toBeGreaterThanOrEqual(280);
  expect(requestPanelBox.width).toBeLessThanOrEqual(320);
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
  await conversionPage.getByRole("button", { name: "Reddet", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Reddet", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await expect(conversionPage.locator(".request-detail-actions .action-button")).toHaveCount(3);
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
  await conversionPage.getByLabel("Ara", { exact: true }).fill("Smoke");
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
  await expect(roomWithoutReservationCard.locator(".compact-reservation-line")).toContainText("Manuel rezerve");
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
    dashboardData: createCompactUiFixture()
  });
  await compactPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

  await expect(compactPage.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await compactPage.evaluate(() => getComputedStyle(document.documentElement).zoom)).toBe("1");
  const [sidebarWidth, expandedContentWidth, pageHeaderHeight] = await Promise.all([
    compactPage.locator(".sidebar").evaluate((sidebar) => sidebar.getBoundingClientRect().width),
    compactPage.locator(".content").evaluate((content) => content.getBoundingClientRect().width),
    compactPage.locator(".page-header").evaluate((header) => header.getBoundingClientRect().height)
  ]);
  expect(sidebarWidth).toBeGreaterThanOrEqual(198);
  expect(sidebarWidth).toBeLessThanOrEqual(202);
  expect(pageHeaderHeight).toBeGreaterThanOrEqual(54);
  expect(pageHeaderHeight).toBeLessThanOrEqual(60);

  await compactPage.getByRole("button", { name: "Menüyü daralt" }).click();
  await expect(compactPage.locator(".desktop-shell")).toHaveClass(/is-sidebar-collapsed/);
  await expect(compactPage.locator(".sidebar")).toHaveClass(/is-collapsed/);
  await expect(compactPage.locator(".brand-copy")).toBeHidden();
  await expect(compactPage.getByRole("button", { name: "Pansiyon", exact: true })).toBeVisible();
  const [collapsedSidebarWidth, collapsedContentWidth, collapsedNavLabelsHidden] = await Promise.all([
    compactPage.locator(".sidebar").evaluate((sidebar) => sidebar.getBoundingClientRect().width),
    compactPage.locator(".content").evaluate((content) => content.getBoundingClientRect().width),
    compactPage.locator(".nav-item span").evaluateAll((labels) => labels.every((label) => getComputedStyle(label).display === "none"))
  ]);
  expect(collapsedSidebarWidth).toBeGreaterThanOrEqual(62);
  expect(collapsedSidebarWidth).toBeLessThanOrEqual(66);
  expect(collapsedContentWidth).toBeGreaterThanOrEqual(expandedContentWidth + 130);
  expect(collapsedNavLabelsHidden).toBe(true);
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
  const attentionBoxes = await compactPage.locator(".dashboard-attention-card").evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { width: box.width, height: box.height, y: box.y };
  }));
  expect(attentionBoxes).toHaveLength(3);
  expect(new Set(attentionBoxes.map((box) => Math.round(box.y))).size).toBe(1);
  expect(attentionBoxes.every((box) => box.width >= 190)).toBe(true);
  expect(attentionBoxes.every((box) => box.height >= 92 && box.height <= 104)).toBe(true);
  const dashboardRowHeights = await dashboardPriorityRows.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(dashboardRowHeights.every((height) => height >= 60 && height <= 84)).toBe(true);
  expect(await dashboardPriorityRows.evaluateAll((rows) => rows.every((row) => row.querySelectorAll("button").length === 1))).toBe(true);
  const firstPriorityDescription = dashboardPriorityRows.first().locator(".dashboard-priority-description");
  await expect(firstPriorityDescription).toBeVisible();
  expect(await firstPriorityDescription.evaluate((note) => getComputedStyle(note).whiteSpace)).toBe("nowrap");
  const lastDashboardRow = await dashboardPriorityRows.last().boundingBox();
  expect(lastDashboardRow).not.toBeNull();
  expect(lastDashboardRow.y + lastDashboardRow.height).toBeLessThanOrEqual(768);
  await expect(compactPage.locator(".dashboard-timeline-list li")).toHaveCount(4);
  await expect(compactPage.locator(".dashboard-capacity-list > div")).toHaveCount(3);
  const lastDashboardSidePanel = await compactPage.locator(".dashboard-side .panel").last().boundingBox();
  expect(lastDashboardSidePanel).not.toBeNull();
  expect(lastDashboardSidePanel.y + lastDashboardSidePanel.height).toBeLessThanOrEqual(768);
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
  await aiOnlyPage.addInitScript(({ setupData, dashboardData }) => {
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
      getAiWorkspaceHistory: async () => []
    };
  }, {
    setupData: {
      ...createSetupFixture(),
      setupRequired: false,
      modules: { ...createSetupFixture().modules, whatsapp: false }
    },
    dashboardData: createCompactUiFixture()
  });
  await aiOnlyPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await aiOnlyPage.getByRole("button", { name: "Kompakt Misafir 1 talebini yanıtla" }).click();
  await expect(aiOnlyPage.getByRole("heading", { name: "Mesajlar", exact: true })).toBeVisible();
  await expect(aiOnlyPage.getByLabel("Talep / müşteri")).toHaveValue("compact_request_1");

  await compactPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await compactPage.getByRole("button", { name: /Kompakt Misafir 4/ }).click();
  const customerRequestRows = compactPage.locator(".requests-workspace .manager-row");
  await expect(customerRequestRows).toHaveCount(8);
  const [customerRowBoxes, customerListBox, customerMasterPanelBox, customerTabsBox] = await Promise.all([
    customerRequestRows.evaluateAll((rows) => rows.map((row) => {
      const box = row.getBoundingClientRect();
      return { y: box.y, height: box.height };
    })),
    compactPage.locator(".requests-workspace .operations-list").boundingBox(),
    compactPage.locator(".requests-workspace .operations-list-panel").boundingBox(),
    compactPage.locator(".customer-work-tabs").boundingBox()
  ]);
  expect(customerListBox).not.toBeNull();
  expect(customerMasterPanelBox).not.toBeNull();
  expect(customerTabsBox).not.toBeNull();
  expect(customerRowBoxes.every((box) => box.height >= 48 && box.height <= 56)).toBe(true);
  expect(customerRowBoxes.every((box) => box.y >= customerListBox.y - 1 && box.y + box.height <= customerListBox.y + customerListBox.height + 1)).toBe(true);
  expect(customerMasterPanelBox.width).toBeGreaterThanOrEqual(280);
  expect(customerMasterPanelBox.width).toBeLessThanOrEqual(320);
  expect(customerTabsBox.height).toBeLessThanOrEqual(42);
  const requestDetailHeight = await compactPage.locator(".request-detail-panel").evaluate((panel) => panel.getBoundingClientRect().height);
  expect(requestDetailHeight).toBeLessThan(420);
  await expect(compactPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await expect(compactPage.locator(".request-detail-actions .action-button")).toHaveCount(3);
  await expect(compactPage.getByRole("dialog", { name: "Yeni talep ekle" })).toHaveCount(0);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-customer-work-1366x768.png" });

  await compactPage.getByRole("tab", { name: "Müşteriler" }).click();
  const compactCustomerRows = compactPage.locator(".customers-workspace .manager-row");
  await expect(compactCustomerRows).toHaveCount(8);
  const [compactCustomerRowBoxes, compactCustomerListBox] = await Promise.all([
    compactCustomerRows.evaluateAll((rows) => rows.map((row) => {
      const box = row.getBoundingClientRect();
      return { y: box.y, height: box.height };
    })),
    compactPage.locator(".customers-workspace .operations-list").boundingBox()
  ]);
  expect(compactCustomerListBox).not.toBeNull();
  expect(compactCustomerRowBoxes.every((box) => box.height >= 48 && box.height <= 56)).toBe(true);
  expect(compactCustomerRowBoxes.every((box) => box.y >= compactCustomerListBox.y - 1 && box.y + box.height <= compactCustomerListBox.y + compactCustomerListBox.height + 1)).toBe(true);

  await compactPage.getByRole("button", { name: "Pansiyon", exact: true }).click();
  await expect(compactPage.getByRole("heading", { name: "Bugünkü Konaklama Özeti" })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Rezervasyon Takibi" })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Anlık Oda Durumu" })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Günlük Konaklama İşleri" })).toBeVisible();
  const pensionMetricBoxes = await compactPage.locator(".pension-page .operation-summary-grid .metric-card").evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { height: box.height, y: box.y };
  }));
  expect(pensionMetricBoxes).toHaveLength(4);
  expect(new Set(pensionMetricBoxes.map((box) => Math.round(box.y))).size).toBe(1);
  expect(pensionMetricBoxes.every((box) => box.height >= 60 && box.height <= 72)).toBe(true);
  const reservationRows = compactPage.locator(".reservation-record-row");
  await expect(reservationRows).toHaveCount(3);
  const reservationHeights = await reservationRows.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(reservationHeights.every((height) => height >= 64 && height <= 76)).toBe(true);
  await expect(reservationRows.first().locator(".compact-action-bar > button")).toHaveCount(2);
  await reservationRows.first().locator("summary").click();
  await expect(reservationRows.first().getByRole("button", { name: "Reddet" })).toBeVisible();
  await expect(reservationRows.first().getByRole("button", { name: "İptal Et" })).toBeVisible();
  await reservationRows.first().locator("summary").click();
  const roomCardHeights = await compactPage.locator(".resource-compact-card").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
  expect(roomCardHeights.every((height) => height >= 92 && height <= 120)).toBe(true);
  const compactRoomCards = compactPage.getByLabel("Oda yönetimi").locator(".resource-compact-card");
  await expect(compactRoomCards.first().locator(".compact-status-actions .is-active")).toHaveCount(0);
  await expect(compactRoomCards.first().getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(compactRoomCards.nth(3).getByRole("button", { name: "Temizlik", exact: true })).toHaveAttribute("aria-pressed", "true");
  const firstRoomCard = await compactPage.locator(".resource-compact-card").first().boundingBox();
  expect(firstRoomCard).not.toBeNull();
  expect(firstRoomCard.y + firstRoomCard.height).toBeLessThanOrEqual(768);
  const pensionTaskRows = compactPage.locator(".pension-tasks-section .task-record-row");
  await expect(pensionTaskRows).toHaveCount(2);
  const pensionTaskHeights = await pensionTaskRows.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(pensionTaskHeights.every((height) => height >= 56 && height <= 76)).toBe(true);
  const firstPensionTask = await pensionTaskRows.first().boundingBox();
  expect(firstPensionTask).not.toBeNull();
  const [pensionSummaryBox, reservationsPanelBox, roomsPanelBox, pensionTasksPanelBox, reservationFiltersBox, roomGridBox, pensionTaskFiltersBox] = await Promise.all([
    compactPage.locator(".pension-summary-panel").boundingBox(),
    compactPage.locator(".pension-reservations-section").boundingBox(),
    compactPage.locator(".pension-rooms-section").boundingBox(),
    compactPage.locator(".pension-tasks-section").boundingBox(),
    compactPage.locator(".pension-reservations-section .reservation-filters").boundingBox(),
    compactPage.locator(".pension-rooms-section .compact-resource-grid").boundingBox(),
    compactPage.locator(".pension-tasks-section .task-filters").boundingBox()
  ]);
  expect(pensionSummaryBox).not.toBeNull();
  expect(reservationsPanelBox).not.toBeNull();
  expect(roomsPanelBox).not.toBeNull();
  expect(pensionTasksPanelBox).not.toBeNull();
  expect(reservationFiltersBox).not.toBeNull();
  expect(roomGridBox).not.toBeNull();
  expect(pensionTaskFiltersBox).not.toBeNull();
  expect(Math.abs(reservationsPanelBox.y - roomsPanelBox.y)).toBeLessThanOrEqual(1);
  expect(reservationsPanelBox.width).toBeGreaterThan(roomsPanelBox.width);
  expect(roomsPanelBox.x).toBeGreaterThan(reservationsPanelBox.x + reservationsPanelBox.width);
  expect(pensionTasksPanelBox.y).toBeGreaterThanOrEqual(reservationsPanelBox.y + reservationsPanelBox.height + 10);
  expect(Math.abs(pensionTasksPanelBox.x - reservationsPanelBox.x)).toBeLessThanOrEqual(1);
  expect(pensionTasksPanelBox.width).toBeGreaterThan(reservationsPanelBox.width);
  expect(reservationFiltersBox.x).toBeGreaterThanOrEqual(reservationsPanelBox.x);
  expect(reservationFiltersBox.x + reservationFiltersBox.width).toBeLessThanOrEqual(reservationsPanelBox.x + reservationsPanelBox.width);
  expect(roomGridBox.x).toBeGreaterThanOrEqual(roomsPanelBox.x);
  expect(roomGridBox.x + roomGridBox.width).toBeLessThanOrEqual(roomsPanelBox.x + roomsPanelBox.width);
  expect(pensionTaskFiltersBox.x).toBeGreaterThanOrEqual(pensionTasksPanelBox.x);
  expect(pensionTaskFiltersBox.x + pensionTaskFiltersBox.width).toBeLessThanOrEqual(pensionTasksPanelBox.x + pensionTasksPanelBox.width);
  expect(pensionTasksPanelBox.y).toBeLessThan(768);
  expect(await compactPage.locator(".pension-reservations-section").evaluate((panel) => getComputedStyle(panel).borderTopWidth)).toBe("1px");
  await compactPage.waitForTimeout(50);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-pension-1366x768.png" });

  await compactPage.getByRole("button", { name: "Restoran", exact: true }).click();
  await expect(compactPage.getByRole("heading", { name: "Bugünkü Servis Özeti" })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Masa Durumu", exact: true })).toBeVisible();
  await expect(compactPage.getByRole("heading", { name: "Servis İşleri" })).toBeVisible();
  const restaurantMetricBoxes = await compactPage.locator(".restaurant-page .operation-summary-grid .metric-card").evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { height: box.height, y: box.y };
  }));
  expect(restaurantMetricBoxes).toHaveLength(4);
  expect(new Set(restaurantMetricBoxes.map((box) => Math.round(box.y))).size).toBe(1);
  expect(restaurantMetricBoxes.every((box) => box.height >= 60 && box.height <= 72)).toBe(true);
  const firstTableHeight = await compactPage.locator(".table-compact-card").first().evaluate((card) => card.getBoundingClientRect().height);
  const firstTaskHeight = await compactPage.locator(".task-record-row").first().evaluate((card) => card.getBoundingClientRect().height);
  expect(firstTableHeight).toBeGreaterThanOrEqual(72);
  expect(firstTableHeight).toBeLessThanOrEqual(100);
  expect(firstTaskHeight).toBeGreaterThanOrEqual(82);
  expect(firstTaskHeight).toBeLessThanOrEqual(116);
  const compactTableCards = compactPage.locator(".table-compact-card");
  const compactTableBoxes = await compactTableCards.evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { x: box.x, y: box.y, height: box.height };
  }));
  expect(new Set(compactTableBoxes.map((box) => Math.round(box.x))).size).toBe(2);
  expect(compactTableBoxes.every((box) => box.y + box.height <= 768)).toBe(true);
  await expect(compactTableCards.first().locator(".compact-status-actions button")).toHaveCount(4);
  for (const [index, label] of ["Boş", "Dolu", "Rezerve", "Hesap"].entries()) {
    await expect(compactTableCards.nth(index).getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(compactTableCards.nth(index).locator(".compact-status-actions .is-active")).toHaveCount(1);
  }
  await expect(compactPage.locator(".task-record-row").first().locator(".compact-action-bar > button")).toHaveCount(1);
  await compactPage.locator(".task-record-row").first().locator("summary").click();
  await expect(compactPage.locator(".task-record-row").first().getByRole("button", { name: "İptal Et" })).toBeVisible();
  await compactPage.locator(".task-record-row").first().locator("summary").click();
  const [restaurantSummaryBox, tablesPanelBox, restaurantTasksPanelBox, tableGridBox, restaurantTaskFiltersBox] = await Promise.all([
    compactPage.locator(".restaurant-summary-panel").boundingBox(),
    compactPage.locator(".restaurant-tables-section").boundingBox(),
    compactPage.locator(".restaurant-tasks-section").boundingBox(),
    compactPage.locator(".restaurant-tables-section .compact-resource-grid").boundingBox(),
    compactPage.locator(".restaurant-tasks-section .task-filters").boundingBox()
  ]);
  expect(restaurantSummaryBox).not.toBeNull();
  expect(tablesPanelBox).not.toBeNull();
  expect(restaurantTasksPanelBox).not.toBeNull();
  expect(tableGridBox).not.toBeNull();
  expect(restaurantTaskFiltersBox).not.toBeNull();
  expect(Math.abs(tablesPanelBox.y - restaurantTasksPanelBox.y)).toBeLessThanOrEqual(1);
  expect(tablesPanelBox.width).toBeGreaterThan(restaurantTasksPanelBox.width);
  expect(restaurantTasksPanelBox.x).toBeGreaterThan(tablesPanelBox.x + tablesPanelBox.width);
  expect(tableGridBox.x).toBeGreaterThanOrEqual(tablesPanelBox.x);
  expect(tableGridBox.x + tableGridBox.width).toBeLessThanOrEqual(tablesPanelBox.x + tablesPanelBox.width);
  expect(restaurantTaskFiltersBox.x).toBeGreaterThanOrEqual(restaurantTasksPanelBox.x);
  expect(restaurantTaskFiltersBox.x + restaurantTaskFiltersBox.width).toBeLessThanOrEqual(restaurantTasksPanelBox.x + restaurantTasksPanelBox.width);
  expect(await compactPage.locator(".restaurant-tables-section").evaluate((panel) => getComputedStyle(panel).borderTopWidth)).toBe("1px");
  await compactPage.getByRole("button", { name: "Pansiyon", exact: true }).click();
  await compactPage.getByRole("button", { name: "Restoran", exact: true }).click();
  await expect(compactPage.getByRole("heading", { name: "Servis İşleri" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-restaurant-1366x768.png" });

  const firstOrderCard = compactPage.getByLabel("Masa yönetimi").locator(".table-compact-card").nth(0);
  const secondOrderCard = compactPage.getByLabel("Masa yönetimi").locator(".table-compact-card").nth(1);
  const reservedOrderCard = compactPage.getByLabel("Masa yönetimi").locator(".table-compact-card").nth(2);
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

  await expect(secondOrderCard.locator(".status-badge")).toHaveText("Dolu");
  await expect(secondOrderCard.locator(".table-order-state-summary")).toContainText("Masa: Dolu");
  await expect(secondOrderCard.locator(".table-order-state-summary")).toContainText("Adisyon: Açık");
  await expect(secondOrderCard.locator(".table-order-summary")).toContainText("1 ürün");
  await expect(secondOrderCard.locator(".table-order-summary")).toContainText("90");
  await expect(secondOrderCard.locator(".compact-status-actions")).toHaveCount(0);
  await expect(secondOrderCard.getByRole("button", { name: "Rezerve", exact: true })).toHaveCount(0);
  await expect(secondOrderCard.getByRole("button", { name: "Siparişi Aç", exact: true })).toBeVisible();
  await expect(secondOrderCard.getByRole("button", { name: "Hesap Bekliyor", exact: true })).toBeVisible();
  await expect(secondOrderCard.getByRole("button", { name: "Ödendi / Kapat", exact: true })).toBeVisible();

  await secondOrderCard.getByRole("button", { name: "Siparişi Aç", exact: true }).click();
  const polishedOrderDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Salon Masası 2" });
  await expect(polishedOrderDrawer.getByRole("group", { name: "Sipariş kaydetme" })).toBeVisible();
  await expect(polishedOrderDrawer.getByRole("group", { name: "Adisyon akışı" })).toBeVisible();
  await expect(polishedOrderDrawer.getByRole("group", { name: "Adisyon kapatma" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-table-order-drawer-polish-1366x768.png" });
  await polishedOrderDrawer.getByRole("group", { name: "Adisyon akışı" }).getByRole("button", { name: "Hazırlanıyor", exact: true }).click();
  await expect(polishedOrderDrawer.getByRole("button", { name: "Hazırlanıyor", exact: true })).toHaveAttribute("aria-pressed", "true");
  await polishedOrderDrawer.getByRole("button", { name: "Sipariş drawer'ını kapat" }).click();
  await expect(polishedOrderDrawer).toHaveCount(0);
  await expect(secondOrderCard.locator(".table-order-state-summary")).toContainText("Masa: Dolu");
  await expect(secondOrderCard.locator(".table-order-state-summary")).toContainText("Adisyon: Hazırlanıyor");
  await expect(secondOrderCard.getByRole("button", { name: "Rezerve", exact: true })).toHaveCount(0);

  await secondOrderCard.getByRole("button", { name: "Hesap Bekliyor", exact: true }).click();
  await expect(secondOrderCard.locator(".table-order-state-summary")).toContainText("Adisyon: Hesap bekliyor");
  await expect(secondOrderCard.locator(".status-badge")).toHaveText("Hesap");
  await expect(secondOrderCard.locator(".table-order-state-summary")).toContainText("Masa: Hesap");
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-table-order-polish-1366x768.png" });
  await secondOrderCard.getByRole("button", { name: "Ödendi / Kapat", exact: true }).click();
  await expect(secondOrderCard.locator(".table-order-state-summary")).toHaveCount(0);
  await expect(secondOrderCard.getByRole("button", { name: "Sipariş Aç", exact: true })).toBeVisible();
  await expect(secondOrderCard.locator(".status-badge")).toHaveText("Boş");
  await expect(secondOrderCard.getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "true");

  await expect(reservedOrderCard.locator(".status-badge")).toHaveText("Rezerve");
  await reservedOrderCard.getByRole("button", { name: "Sipariş Aç", exact: true }).click();
  const reservedOrderDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Bahçe Masası 3" });
  await expect(reservedOrderDrawer).toBeVisible();
  await expect(reservedOrderCard.locator(".status-badge")).toHaveText("Dolu");
  await expect(reservedOrderCard.locator(".table-order-state-summary")).toContainText("Masa: Dolu");
  await reservedOrderDrawer.getByRole("group", { name: "Adisyon akışı" }).getByRole("button", { name: "Hazırlanıyor", exact: true }).click();
  await reservedOrderDrawer.getByRole("button", { name: "Sipariş drawer'ını kapat" }).click();
  await expect(reservedOrderDrawer).toHaveCount(0);
  await expect(reservedOrderCard.locator(".table-order-state-summary")).toContainText("Masa: Dolu");
  await expect(reservedOrderCard.locator(".table-order-state-summary")).toContainText("Adisyon: Hazırlanıyor");
  await reservedOrderCard.getByRole("button", { name: "Hesap Bekliyor", exact: true }).click();
  await expect(reservedOrderCard.locator(".status-badge")).toHaveText("Hesap");
  await expect(reservedOrderCard.locator(".table-order-state-summary")).toContainText("Masa: Hesap");
  await reservedOrderCard.getByRole("button", { name: "Ödendi / Kapat", exact: true }).click();
  await expect(reservedOrderCard.locator(".table-order-state-summary")).toHaveCount(0);
  await expect(reservedOrderCard.locator(".status-badge")).toHaveText("Boş");
  await expect(reservedOrderCard.getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "true");

  await expect(firstOrderCard.locator(".status-badge")).toHaveText("Dolu");
  await firstOrderCard.getByRole("button", { name: "Siparişi Aç", exact: true }).click();
  const cancelledOrderDrawer = compactPage.getByRole("dialog", { name: "Masa Siparişi — Bahçe Masası 1" });
  await cancelledOrderDrawer.getByRole("group", { name: "Adisyon kapatma" }).getByRole("button", { name: "İptal", exact: true }).click();
  await expect(cancelledOrderDrawer).toHaveCount(0);
  await expect(firstOrderCard.locator(".table-order-state-summary")).toHaveCount(0);
  await expect(firstOrderCard.locator(".status-badge")).toHaveText("Boş");
  await expect(firstOrderCard.getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "true");

  await compactPage.getByRole("button", { name: "Menü", exact: true }).click();
  await expect(compactPage.getByRole("button", { name: "Menü", exact: true })).toHaveAttribute("aria-current", "page");
  const compactLiveMenuPreview = compactPage.getByLabel("Canlı menü önizlemesi");
  await compactLiveMenuPreview.getByRole("button", { name: "Sıcaklar" }).click();
  await expect(compactPage.locator(".category-panel .manager-row[aria-pressed='true']")).toContainText("Sıcaklar");
  await expect(compactLiveMenuPreview.getByRole("button", { name: "Sıcaklar" })).toHaveAttribute("aria-pressed", "true");
  await compactLiveMenuPreview.getByRole("button", { name: "Tüm Ürünler" }).click();
  await expect(compactLiveMenuPreview.getByRole("button", { name: "Tüm Ürünler" })).toHaveAttribute("aria-pressed", "true");
  await compactPage.locator(".category-panel .manager-row").filter({ hasText: "Kahvaltı" }).click();
  await expect(compactLiveMenuPreview.getByRole("button", { name: "Kahvaltı" })).toHaveAttribute("aria-pressed", "true");
  const menuRowHeights = await compactPage.locator(".menu-management-grid .manager-row").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(menuRowHeights.length).toBeGreaterThanOrEqual(5);
  expect(menuRowHeights.every((height) => height >= 48 && height <= 64), `Menü satır yükseklikleri: ${menuRowHeights.join(", ")}`).toBe(true);
  const [menuGridBox, categoryPanelBox, productPanelBox, itemEditorBox, livePreviewBox, categorySaveBox, itemSaveBox, itemDescriptionBox, categoryDetailsBox, itemDetailsBox] = await Promise.all([
    compactPage.locator(".menu-management-grid").boundingBox(),
    compactPage.locator(".category-panel").boundingBox(),
    compactPage.locator(".product-panel").boundingBox(),
    compactPage.locator(".item-editor-panel").boundingBox(),
    compactPage.locator(".menu-live-panel").boundingBox(),
    compactPage.getByRole("button", { name: "Kategoriyi Kaydet" }).boundingBox(),
    compactPage.getByRole("button", { name: "Ürünü Kaydet" }).boundingBox(),
    compactPage.getByLabel("Açıklama").last().boundingBox(),
    compactPage.locator(".category-details").boundingBox(),
    compactPage.locator(".item-details").boundingBox()
  ]);
  expect(menuGridBox).not.toBeNull();
  expect(categoryPanelBox).not.toBeNull();
  expect(productPanelBox).not.toBeNull();
  expect(itemEditorBox).not.toBeNull();
  expect(livePreviewBox).not.toBeNull();
  expect(categorySaveBox).not.toBeNull();
  expect(itemSaveBox).not.toBeNull();
  expect(itemDescriptionBox).not.toBeNull();
  expect(categoryDetailsBox).not.toBeNull();
  expect(itemDetailsBox).not.toBeNull();
  expect(Math.abs(productPanelBox.x - categoryPanelBox.x)).toBeLessThanOrEqual(1);
  expect(productPanelBox.y).toBeGreaterThan(categoryPanelBox.y + categoryPanelBox.height);
  expect(itemEditorBox.x).toBeGreaterThan(categoryPanelBox.x + categoryPanelBox.width);
  expect(livePreviewBox.x).toBeGreaterThan(itemEditorBox.x + itemEditorBox.width);
  expect(Math.max(categoryPanelBox.y, itemEditorBox.y, livePreviewBox.y) - Math.min(categoryPanelBox.y, itemEditorBox.y, livePreviewBox.y)).toBeLessThanOrEqual(1);
  expect([categoryPanelBox, productPanelBox, itemEditorBox, livePreviewBox, categorySaveBox, itemSaveBox].every((box) => box.y + box.height <= 768)).toBe(true);
  expect(itemDescriptionBox.height).toBeLessThanOrEqual(64);
  expect(categoryDetailsBox.height).toBeLessThanOrEqual(36);
  expect(itemDetailsBox.height).toBeLessThanOrEqual(36);
  await expect(compactPage.locator(".menu-management-grid .manager-row[aria-pressed='true']")).toHaveCount(2);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-menu-1366x768.png" });

  await compactPage.getByRole("button", { name: "Mesajlar", exact: true }).click();
  const preparedMessageHeight = await compactPage.getByLabel("Hazır WhatsApp mesajı").evaluate((field) => field.getBoundingClientRect().height);
  expect(preparedMessageHeight).toBeGreaterThanOrEqual(110);
  expect(preparedMessageHeight).toBeLessThanOrEqual(150);
  const compactMessageRows = compactPage.locator(".whatsapp-request-list .manager-row");
  await expect(compactMessageRows).toHaveCount(8);
  const [compactRequestPanelBox, compactCopyPanelBox, compactMessageListBox, compactMessageRowBoxes, messageModeBox] = await Promise.all([
    compactPage.locator(".whatsapp-request-panel").boundingBox(),
    compactPage.locator(".whatsapp-copy-panel").boundingBox(),
    compactPage.locator(".whatsapp-request-list").boundingBox(),
    compactMessageRows.evaluateAll((rows) => rows.map((row) => {
      const box = row.getBoundingClientRect();
      return { y: box.y, height: box.height };
    })),
    compactPage.locator(".message-mode-switch").boundingBox()
  ]);
  expect(compactRequestPanelBox).not.toBeNull();
  expect(compactCopyPanelBox).not.toBeNull();
  expect(compactMessageListBox).not.toBeNull();
  expect(messageModeBox).not.toBeNull();
  expect(Math.abs(compactRequestPanelBox.height - compactCopyPanelBox.height)).toBeLessThanOrEqual(1);
  expect(compactRequestPanelBox.width).toBeGreaterThanOrEqual(280);
  expect(compactRequestPanelBox.width).toBeLessThanOrEqual(320);
  expect(messageModeBox.height).toBeLessThanOrEqual(42);
  expect(compactMessageRowBoxes.every((box) => box.height >= 48 && box.height <= 56)).toBe(true);
  expect(compactMessageRowBoxes.every((box) => box.y >= compactMessageListBox.y - 1 && box.y + box.height <= compactMessageListBox.y + compactMessageListBox.height + 1)).toBe(true);
  await expect(compactPage.locator(".whatsapp-copy-panel").getByRole("heading", { name: "Kompakt Misafir 1" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-messages-1366x768.png" });

  await compactPage.getByRole("tab", { name: /WhatsApp Web Modu/ }).click();
  const compactWebControlBar = compactPage.locator(".whatsapp-web-control-bar");
  const [compactWebRequestPanelBox, compactLivePanelBox, compactControlBarBox, compactWebviewFrameBox] = await Promise.all([
    compactPage.locator(".message-mode-content:not(.is-hidden) .whatsapp-request-panel").boundingBox(),
    compactPage.locator(".whatsapp-live-panel").boundingBox(),
    compactWebControlBar.boundingBox(),
    compactPage.locator(".whatsapp-webview-frame").boundingBox()
  ]);
  expect(compactWebRequestPanelBox).not.toBeNull();
  expect(compactLivePanelBox).not.toBeNull();
  expect(compactControlBarBox).not.toBeNull();
  expect(compactWebviewFrameBox).not.toBeNull();
  expect(compactLivePanelBox.x).toBeGreaterThan(compactWebRequestPanelBox.x + compactWebRequestPanelBox.width);
  expect(Math.abs(compactLivePanelBox.y - compactWebRequestPanelBox.y)).toBeLessThanOrEqual(1);
  expect(compactLivePanelBox.y + compactLivePanelBox.height).toBeLessThanOrEqual(768);
  expect(compactWebviewFrameBox.y).toBeGreaterThan(compactControlBarBox.y + compactControlBarBox.height);
  expect(compactWebviewFrameBox.height).toBeGreaterThanOrEqual(300);
  await expect(compactWebControlBar).toContainText("Kompakt Misafir 1");
  await expect(compactWebControlBar).toContainText("+90 532 123 00 01");
  await expect(compactWebControlBar.getByRole("button", { name: "Hazır Mesajı Kopyala" })).toBeVisible();
  await expect(compactWebControlBar.getByRole("button", { name: "Müşteri Numarasına Git" })).toBeVisible();
  await expect(compactWebControlBar.getByRole("button", { name: "Dışarıda Aç" })).toBeVisible();
  await expect(compactWebControlBar.getByRole("button", { name: "Güvenli Moda Dön" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-whatsapp-web-1366x768.png" });
  await compactWebControlBar.getByRole("button", { name: "Güvenli Moda Dön" }).click();
  await expect(compactPage.getByRole("tab", { name: "Güvenli Mod" })).toHaveAttribute("aria-selected", "true");

  await compactPage.reload({ waitUntil: "domcontentloaded" });
  await expect(compactPage.locator(".nav-item")).toHaveCount(7);
  await compactPage.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(compactPage.getByRole("button", { name: "Ayarlar", exact: true })).toHaveAttribute("aria-current", "page");
  expect(await compactPage.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(compactPage.getByRole("button", { name: "Ayarları Kaydet", exact: true })).toHaveCount(1);
  await expect(compactPage.locator(".setup-footer")).toHaveCount(0);
  const basicSettingsBoxes = await compactPage.locator(".settings-basic-grid > .setup-section").evaluateAll((sections) => sections.map((section) => {
    const box = section.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  expect(basicSettingsBoxes).toHaveLength(4);
  expect(new Set(basicSettingsBoxes.map((box) => Math.round(box.x))).size).toBe(2);
  expect(basicSettingsBoxes.every((box) => box.y + box.height <= 768)).toBe(true);
  await compactPage.getByRole("tab", { name: "Gelişmiş Ayarlar" }).click();
  await compactPage.getByRole("tab", { name: "Temel Ayarlar" }).click();
  await expect(compactPage.getByRole("heading", { name: "Uygulama Görünümü" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-settings-1366x768.png" });
  await compactPage.getByRole("tab", { name: "Gelişmiş Ayarlar" }).click();
  await expect(compactPage.getByRole("heading", { name: "Web Bağlantısı", exact: true })).toBeVisible();
  await expect(compactPage.getByLabel("Web eşitleme adresi")).toBeVisible();
  await expect(compactPage.getByLabel("Web güvenlik anahtarı")).toBeVisible();
  await expect(compactPage.getByLabel("Servis sağlayıcı")).toBeVisible();
  const advancedSettingsBoxes = await compactPage.locator(".settings-advanced-grid > .setup-section").evaluateAll((sections) => sections.map((section) => {
    const box = section.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  expect(advancedSettingsBoxes).toHaveLength(3);
  expect(advancedSettingsBoxes.every((box) => box.y + box.height <= 768)).toBe(true);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-settings-advanced-1366x768.png" });
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
    pulledRequest: createPulledRequestFixture()
  });
  await pullPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(pullPage.locator(".dashboard-attention-card").first().locator("strong")).toHaveText("0");
  await pullPage.getByRole("button", { name: "Şimdi Eşitle" }).click();
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
  await setupPage.getByLabel("Web eşitleme adresi").fill("https://yardimciasistan.alwaysdata.net/yardimci-asistan");
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
      waitingRequests: 0,
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
      waitingRequests: 1,
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
    priority: index === 0 ? "high" : "normal",
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
    status: ["available", "occupied", "reserved", "payment"][index],
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
      waitingRequests: requests.filter((request) => ["new", "seen", "waiting_owner", "pending", "in_progress"].includes(request.status)).length,
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
