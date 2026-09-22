import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { spawn } from "node:child_process";
import { getLocalViteExecutable } from "./test-helpers/local-vite.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import process from "node:process";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { createDashboardConversionFixture, createSetupFixture } from "./lib/desktop-renderer-fixtures.mjs";

const visualPass = process.env.VISUAL_PASS || "final";
const output = `artifacts/design-system/stage3a/${visualPass}`;
const preferencesKey = "yardimci-asistan.ui-preferences";
const viewports = [
  [1440, 1000],
  [1366, 768],
  [1024, 768],
  [900, 768],
  [600, 800]
];
const appearances = [
  ["light", "compact"],
  ["dark", "compact"],
  ["light", "comfortable"]
];
const enabledCapabilities = Object.values(BUSINESS_CAPABILITIES);
const request = {
  id: "stage3a-request-001",
  customer_id: "stage3a-customer-001",
  source: "web_form",
  request_type: "pension_reservation",
  status: "new",
  customer_name: "Stage 3A Misafir",
  customer_phone: "+905321234567",
  date_text: "18-20 Eylül",
  start_date: "2026-09-18",
  end_date: "2026-09-20",
  time: "",
  guest_count: 2,
  adult_count: 2,
  child_count: 0,
  message: "Balkonlu oda ve erken giriş hakkında bilgi almak istiyorum.",
  ai_summary: "İki kişilik balkonlu oda talebi.",
  ai_suggested_reply: "Merhaba, talebiniz için teşekkür ederiz. Müsaitliği kontrol edip size dönüş yapacağız.",
  whatsapp_message: "Merhaba, talebiniz için teşekkür ederiz. Müsaitliği kontrol edip size dönüş yapacağız.",
  assigned_to: "",
  priority: "normal",
  sync_status: "synced",
  created_at: "2026-09-15T10:00:00+03:00",
  updated_at: "2026-09-15T10:00:00+03:00"
};

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  getLocalViteExecutable(),
  ["--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", String(port)],
  { cwd: "apps/desktop-app", stdio: "ignore" }
);

mkdirSync(output, { recursive: true });
const observations = { messages: [], setup: [], settings: [] };
let browser;

try {
  await waitForServer(baseUrl);
  browser = await launchChromiumForSmoke(chromium);
  const dashboard = {
    ...createDashboardConversionFixture(),
    requests: [request]
  };
  const setupData = { ...createSetupFixture(), setupRequired: false };
  const pageErrors = [];
  const messagesPage = await browser.newPage({ locale: "tr-TR", viewport: { width: 1440, height: 1000 } });
  messagesPage.on("pageerror", (error) => pageErrors.push(error.message));
  await installBridge(messagesPage, { setupData, dashboardData: dashboard, enabledCapabilities });
  await messagesPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(messagesPage.locator("html")).toHaveAttribute("data-density", "compact");

  await messagesPage.getByRole("button", { name: "Mesajlar", exact: true }).click();
  await expect(messagesPage.getByRole("heading", { name: "Mesajlar" })).toBeVisible();
  await expect(messagesPage.locator(".message-toolbar")).toBeVisible();
  await expect(messagesPage.locator(".whatsapp-request-panel")).toBeVisible();
  await expect(messagesPage.locator(".whatsapp-copy-panel")).toBeVisible();
  await expect(messagesPage.locator(".whatsapp-request-list .message-request-row")).toHaveCount(1);
  await expect(messagesPage.locator(".whatsapp-request-panel .status-badge")).toBeVisible();
  for (const action of ["Hazır Mesajı Kopyala", "WhatsApp Linkini Aç", "Müşteriyi Ara", "Mesajı Sil", "AI ile Yenile"]) {
    await expect(messagesPage.getByRole("button", { name: action, exact: true })).toBeVisible();
  }
  await expect(messagesPage.locator(".whatsapp-copy-panel .status-badge")).toBeVisible();
  await assertNoOverflow(messagesPage, "messages", observations.messages);

  // The AI workspace is reached through the existing dashboard action. This
  // exercises the presentation states without changing the AI request path.
  await messagesPage.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  await messagesPage.getByRole("button", { name: "Günü değerlendir", exact: true }).click();
  await expect(messagesPage.locator(".ai-workspace")).toBeVisible();
  await expect(messagesPage.locator(".ai-tool-panel")).toBeVisible();
  await expect(messagesPage.locator(".ai-result-panel")).toBeVisible();
  await expect(messagesPage.locator(".ai-workspace .action-button")).toBeVisible();
  await expect(messagesPage.locator(".ai-workspace .status-badge").first()).toBeVisible();
  await messagesPage.getByRole("button", { name: "AI Sonucunu Hazırla", exact: true }).click();
  await expect(messagesPage.getByRole("heading", { name: "Günlük değerlendirme" })).toBeVisible();
  await expect(messagesPage.locator(".ai-workspace-message")).toHaveAttribute("role", "status");

  // The real webview element stays mounted while the selected workspace is
  // hidden, then becomes visible again with its state marker intact.
  await messagesPage.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await expect(messagesPage.locator(".whatsapp-webview")).toHaveAttribute("partition", "persist:yardimci-whatsapp");
  await expect(messagesPage.locator(".whatsapp-webview")).toHaveAttribute("src", "https://web.whatsapp.com/");
  const webviewLayout = await messagesPage.locator(".whatsapp-webview-frame").evaluate((frame) => {
    const webview = frame.querySelector(".whatsapp-webview");
    if (!webview) return null;
    const frameRect = frame.getBoundingClientRect();
    const webviewRect = webview.getBoundingClientRect();
    const style = getComputedStyle(webview);
    return {
      position: style.position,
      display: style.display,
      frameWidth: frameRect.width,
      frameHeight: frameRect.height,
      webviewWidth: webviewRect.width,
      webviewHeight: webviewRect.height,
      contained:
        webviewRect.left >= frameRect.left - 1
        && webviewRect.top >= frameRect.top - 1
        && webviewRect.right <= frameRect.right + 1
        && webviewRect.bottom <= frameRect.bottom + 1
    };
  });
  expect(webviewLayout, "WhatsApp webview layout").not.toBeNull();
  expect(webviewLayout.position, "WhatsApp webview must stay in normal layout flow").not.toBe("absolute");
  expect(webviewLayout.frameWidth).toBeGreaterThan(0);
  expect(webviewLayout.frameHeight).toBeGreaterThan(0);
  expect(webviewLayout.webviewWidth).toBeGreaterThan(0);
  expect(webviewLayout.webviewHeight).toBeGreaterThan(0);
  expect(webviewLayout.contained, "WhatsApp webview must remain inside its panel").toBe(true);
  await messagesPage.locator(".whatsapp-webview").evaluate((element) => { element.dataset.stage3aMarker = "persistent"; });
  await messagesPage.getByRole("button", { name: "Güvenli Moda Dön", exact: true }).click();
  await expect(messagesPage.locator(".message-mode-content.is-hidden .whatsapp-webview")).toHaveCount(1);
  await messagesPage.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await expect(messagesPage.locator(".whatsapp-webview")).toHaveAttribute("data-stage3a-marker", "persistent");
  await messagesPage.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  await expect(messagesPage.locator(".persistent-messages-page.is-hidden .whatsapp-webview")).toHaveCount(1);
  await messagesPage.getByRole("button", { name: "Mesajlar", exact: true }).click();
  await expect(messagesPage.locator(".whatsapp-webview")).toHaveAttribute("data-stage3a-marker", "persistent");

  for (const [width, height] of viewports) {
    await messagesPage.setViewportSize({ width, height });
    await messagesPage.getByRole("tab", { name: "Mesaj Hazırla", exact: true }).click();
    await assertNoOverflow(messagesPage, `messages ${width}`, observations.messages);
    await messagesPage.screenshot({ animations: "disabled", path: `${output}/messages-${width}x${height}-light-compact.png` });
  }
  await messagesPage.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await messagesPage.setViewportSize({ width: 600, height: 800 });
  await assertNoOverflow(messagesPage, "messages web 600", observations.messages);
  await messagesPage.screenshot({ animations: "disabled", path: `${output}/messages-web-600x800-light-compact.png` });

  for (const [scheme, density] of appearances.slice(1)) {
    await setAppearance(messagesPage, scheme, density);
    await messagesPage.getByRole("button", { name: "Mesajlar", exact: true }).click();
    for (const [width, height] of viewports) {
      await messagesPage.setViewportSize({ width, height });
      await expect(messagesPage.locator(".messages-page")).toBeVisible();
      await assertNoOverflow(messagesPage, `messages ${scheme}-${density} ${width}`, observations.messages);
      if (width === 1440) {
        await messagesPage.screenshot({ animations: "disabled", path: `${output}/messages-1440x1000-${scheme}-${density}.png` });
      }
    }
  }

  // Settings remains an embedded consumer of SetupForm. Verify its shell and
  // section navigation after the onboarding-oriented form changes.
  await setAppearance(messagesPage, "light", "compact");
  await messagesPage.setViewportSize({ width: 1440, height: 1000 });
  await messagesPage.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(messagesPage.locator(".setup-shell.is-embedded")).toBeVisible();
  await expect(messagesPage.locator(".setup-footer")).toHaveCount(0);
  await expect(messagesPage.getByRole("navigation", { name: "Ayar bölümleri" })).toBeVisible();
  await assertFormSizeContract(messagesPage, "settings");
  for (const [width, height] of viewports) {
    await messagesPage.setViewportSize({ width, height });
    await assertNoOverflow(messagesPage, `settings ${width}`, observations.settings);
    if (width === 1440 || width === 600) {
      await messagesPage.screenshot({ animations: "disabled", path: `${output}/settings-${width}x${height}-light-compact.png` });
    }
  }

  const setupPage = await browser.newPage({ locale: "tr-TR", viewport: { width: 1440, height: 1000 } });
  setupPage.on("pageerror", (error) => pageErrors.push(error.message));
  await installBridge(setupPage, {
    setupData: {
      ...createSetupFixture(),
      setupRequired: true,
      businessName: "",
      phone: "",
      whatsapp: "",
      address: ""
    },
    dashboardData: dashboard,
    enabledCapabilities
  });
  await setupPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(setupPage.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(setupPage.getByRole("heading", { name: "Ayarlar", exact: true, level: 1 })).toBeVisible();
  await expect(setupPage.locator(".setup-shell.is-embedded")).toBeVisible();
  await expect(setupPage.locator(".setup-shell")).toHaveClass(/is-initial-setup/);
  await expect(setupPage.locator(".setup-hero")).toHaveCount(0);
  await expect(setupPage.getByRole("navigation", { name: "Ayar bölümleri" })).toBeVisible();
  await expect(setupPage.getByRole("navigation", { name: "Ayar bölümleri" }).getByRole("link", { name: "İşletme", exact: true })).toHaveAttribute("href", "#settings-business");
  await expect(setupPage.getByRole("navigation", { name: "Ayar bölümleri" }).getByRole("link")).toHaveCount(4);
  await expect(setupPage.getByRole("navigation", { name: "Kurulum bölümleri" })).toHaveCount(0);
  await expect(setupPage.locator(".setup-progress")).toHaveCount(0);
  await expect(setupPage.locator(".setup-form-surface .setup-section")).toHaveCount(3);
  await expect(setupPage.locator(".setup-footer")).toHaveCount(0);
  await expect(setupPage.getByRole("button", { name: "Ayarları Kaydet", exact: true })).toBeVisible();
  await expect(setupPage.getByRole("button", { name: "Kurulumu Kaydet", exact: true })).toHaveCount(0);
  await expect(setupPage.getByRole("textbox", { name: "Firma adı", exact: true })).toHaveValue("");
  await expect(setupPage.getByRole("textbox", { name: "Firma adı", exact: true })).toHaveAttribute("placeholder", "İşletme adı");
  await expect(setupPage.getByRole("textbox", { name: "Telefon", exact: true })).toHaveValue("");
  await expect(setupPage.getByRole("textbox", { name: "Telefon", exact: true })).toHaveAttribute("placeholder", "+90 5xx xxx xx xx");
  await expect(setupPage.getByRole("textbox", { name: "WhatsApp", exact: true })).toHaveValue("");
  await expect(setupPage.getByRole("textbox", { name: "WhatsApp", exact: true })).toHaveAttribute("placeholder", "+90 5xx xxx xx xx");
  await expect(setupPage.getByLabel("Adres", { exact: true })).toHaveAttribute("placeholder", "İşletme adresi");
  await assertFormSizeContract(setupPage, "setup");
  await setupPage.getByRole("button", { name: "Bağlantıyı Dene", exact: true }).first().click();
  await expect(setupPage.getByText("OpenAI bağlantısı çalışıyor.", { exact: true })).toBeVisible();
  await expect(setupPage.locator(".setup-ai-actions .setup-connection-message").last()).toHaveAttribute("role", "status");

  for (const [width, height] of viewports) {
    await setupPage.setViewportSize({ width, height });
    await setupPage.evaluate(() => window.scrollTo(0, 0));
    await assertNoOverflow(setupPage, `setup ${width}`, observations.setup);
    await setupPage.screenshot({ animations: "disabled", path: `${output}/setup-${width}x${height}-light-compact.png` });
  }
  for (const [scheme, density] of appearances.slice(1)) {
    await setAppearance(setupPage, scheme, density);
    for (const [width, height] of viewports) {
      await setupPage.setViewportSize({ width, height });
      await setupPage.evaluate(() => window.scrollTo(0, 0));
      await expect(setupPage.locator(".setup-shell.is-embedded")).toBeVisible();
      await assertNoOverflow(setupPage, `setup ${scheme}-${density} ${width}`, observations.setup);
      if (width === 1440) {
        await setupPage.screenshot({ animations: "disabled", path: `${output}/setup-1440x1000-${scheme}-${density}.png` });
      }
    }
  }

  expect(pageErrors, "Renderer page errors").toEqual([]);
  writeFileSync(`${output}/observations.json`, JSON.stringify(observations, null, 2));
  console.log("stage3a-messages-setup-ok", JSON.stringify(observations));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

async function installBridge(page, { setupData, dashboardData, enabledCapabilities }) {
  await page.addInitScript(({ setup, dashboard, capabilities, preferenceStorageKey }) => {
    if (!window.localStorage.getItem(preferenceStorageKey)) {
      window.localStorage.setItem(preferenceStorageKey, JSON.stringify({ version: 2, scheme: "light", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" }));
    }
    const currentDashboardData = dashboard;
    const profile = {
      description: "Akyaka’da aile işletmesi pansiyon ve kafe.",
      latitude: 37.05,
      longitude: 28.32,
      directionsNote: "",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      breakfastStartTime: "08:00",
      breakfastEndTime: "10:00",
      features: [],
      policyNote: "",
      paymentNote: "",
      languages: ["Türkçe", "English"]
    };
    const snapshot = {
      businessId: "stage3a-fixture",
      profileId: setup.profileId,
      enabledCapabilities: capabilities,
      capabilities: capabilities.map((capability) => ({ capability, enabled: true, source: "profile" }))
    };
    const setupResult = (nextSetup) => ({
      ...nextSetup,
      setupRequired: false
    });
    window.yardimciDesktop = {
      getAppLockStatus: async () => ({ locked: false, passwordConfigured: false, notificationCount: 0 }),
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.2",
        platform: "linux",
        syncSettings: { webModuleUrl: setup.webModuleUrl, hasSyncSecret: true },
        databasePath: "/tmp/stage3a.sqlite",
        userDataPath: "/tmp/stage3a",
        backupPath: "/tmp/stage3a/backups",
        setup
      }),
      getSetupData: async () => setup,
      getDashboardData: async () => currentDashboardData,
      getBusinessCapabilitySnapshot: async () => snapshot,
      getBusinessPublicProfile: async () => profile,
      saveBusinessPublicProfile: async (input) => ({ ok: true, message: "Bilgiler kaydedildi.", profile: input }),
      geocodeBusinessAddress: async () => ({ ok: true, results: [] }),
      getRoomFolioData: async () => ({ rooms: [], activeStays: [], folios: [], menuCategories: [], menuItems: [] }),
      listLocalBackups: async () => ({ ok: true, backups: [] }),
      updateAppPassword: async () => ({ ok: true, message: "Şifre kaydedildi.", status: { locked: false, passwordConfigured: true, notificationCount: 0 } }),
      testWebConnection: async () => ({ ok: true, message: "Web bağlantısı çalışıyor." }),
      testAiConnection: async (input) => ({ ok: true, message: `${input.service === "openrouter" ? "OpenRouter" : "OpenAI"} bağlantısı çalışıyor.`, model: input.model || "stage3a-model", models: [] }),
      revealAiApiKey: async () => ({ ok: true, apiKey: "stage3a-secret" }),
      getAiWorkspaceHistory: async () => [],
      generateAiWorkspace: async (input) => {
        const selected = currentDashboardData.requests.find((candidate) => candidate.id === input.requestId);
        return {
          ok: true,
          message: "AI sonucu hazır. Göndermeden önce kontrol edin.",
          entry: {
            id: "stage3a-ai-entry",
            mode: input.mode,
            requestId: input.requestId,
            requestLabel: selected?.customer_name || "Günlük işletme",
            instructions: input.instructions,
            content: "Bugünün öncelikleri ve açık müşteri talepleri kontrol edilmeli.",
            summary: "İşletme öncelikleri hazırlandı.",
            missingFields: [],
            provider: "openai",
            model: "stage3a-model",
            fallback: false,
            createdAt: "2026-09-15T10:30:00+03:00"
          }
        };
      },
      saveAiWorkspaceResult: async () => ({ ok: true, message: "AI sonucu kaydedildi.", dashboardData: currentDashboardData }),
      createOwnerReplySuggestion: async (requestId) => ({ ok: true, message: "Cevap taslağı hazır.", requestId, summary: "Talep özeti", suggestedReply: "Size kısa süre içinde dönüş yapacağız.", missingFields: [], dashboardData: currentDashboardData }),
      markWhatsAppMessageSent: async () => ({ ok: true, message: "Mesaj kaydedildi.", dashboardData: currentDashboardData }),
      deleteWhatsAppMessage: async () => ({ ok: true, message: "Hazır mesaj silindi.", dashboardData: currentDashboardData }),
      onDashboardDataChanged: () => () => {},
      getSyncStatus: async () => ({ enabled: false, phase: "idle", pendingJobs: 0, consecutiveFailures: 0, message: "", lastError: "" }),
      onSyncStatusChanged: () => () => {},
      onAppLockStateChanged: () => () => {},
      openExternal: async () => true,
      setUiScale: () => undefined,
      saveInitialSetup: async () => ({ ok: true, message: "Ayarlar kaydedildi.", setupData: setupResult(setup), dashboardData: currentDashboardData }),
      createManualBackup: async () => ({ ok: true, message: "Yedek oluşturuldu.", dashboardData: currentDashboardData }),
      pushAndroidSnapshot: async () => ({ ok: true, message: "Android ayarları yayınlandı." }),
      setBusinessCapability: async () => snapshot,
      clearBusinessCapabilityOverride: async () => snapshot,
      applyBusinessProfile: async () => snapshot,
      setAutoSyncEnabled: async () => ({ enabled: false, phase: "idle", pendingJobs: 0, consecutiveFailures: 0, message: "", lastError: "" }),
      pullRequests: async () => ({ ok: true, message: "Talepler alındı.", requests: [], count: 0 }),
      markRequestsSynced: async () => ({ ok: true, count: 0 }),
      runSyncNow: async () => ({ ok: true, message: "Eşitleme tamamlandı.", status: { enabled: false, phase: "idle", pendingJobs: 0, consecutiveFailures: 0, message: "", lastError: "" } }),
      commerce: {
        listCustomerCreditAccounts: async () => [],
        getCustomerCreditAccount: async () => ({ balances: [], entries: [] })
      }
    };
  }, { setup: setupData, dashboard: dashboardData, capabilities: enabledCapabilities, preferenceStorageKey: preferencesKey });
}

async function setAppearance(page, scheme, density) {
  await page.evaluate(([nextScheme, nextDensity, key]) => {
    localStorage.setItem(key, JSON.stringify({ version: 2, scheme: nextScheme, density: nextDensity, scale: 1, accent: "coral", font: "plex", motion: "system" }));
  }, [scheme, density, preferencesKey]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme);
  await expect(page.locator("html")).toHaveAttribute("data-density", density);
}

async function assertNoOverflow(page, label, collection) {
  const metrics = await page.evaluate(() => {
    const selectors = [
      ".content",
      ".messages-page",
      ".message-mode-content:not(.is-hidden)",
      ".whatsapp-workspace",
      ".setup-shell.is-embedded",
      ".setup-form-surface",
      ".setup-section",
      ".setup-capabilities",
      ".form-grid",
      ".form-row",
      ".setup-footer"
    ];
    const overflowElements = selectors.flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.className || element.tagName.toLowerCase());
    return {
      documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      overflowElements
    };
  });
  expect(metrics.documentOverflow, `${label}: document overflow`).toBe(false);
  expect(metrics.overflowElements, `${label}: surface overflow`).toEqual([]);
  collection.push({ label, ...metrics });
}

async function assertFormSizeContract(page, label) {
  const result = await page.evaluate(() => {
    const fields = (selector) => [...document.querySelectorAll(selector)].map((element) => ({
      className: element.className,
      width: element.getBoundingClientRect().width
    }));
    return {
      businessName: fields(".settings-identity-section .form-field--long"),
      sector: fields(".settings-identity-section .form-field--medium"),
      phone: fields(".settings-identity-section .form-field--short"),
      timeout: fields(".setup-ai-section .form-field--short"),
      url: fields(".settings-web-section .form-field--long")
    };
  });
  expect(result.businessName.length, `${label}: long business field`).toBeGreaterThan(0);
  expect(result.sector.length, `${label}: medium sector field`).toBeGreaterThan(0);
  expect(result.phone.length, `${label}: short phone field`).toBeGreaterThan(0);
  expect(result.timeout.length, `${label}: short timeout field`).toBeGreaterThan(0);
  expect(result.url.length, `${label}: long URL field`).toBeGreaterThan(0);
  if (await page.evaluate(() => window.innerWidth > 760)) {
    expect(result.businessName[0].width, `${label}: long field should exceed medium`).toBeGreaterThan(result.sector[0].width);
    expect(result.sector[0].width, `${label}: medium field should exceed short`).toBeGreaterThan(result.phone[0].width);
  }
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Renderer server did not start at ${url}`);
}
