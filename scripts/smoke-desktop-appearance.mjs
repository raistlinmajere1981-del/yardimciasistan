import { expandSettingsStructure } from "./test-helpers/settings-ui.mjs";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getBusinessProfile } from "@yardimci-asistan/shared";
import { createCapabilitySnapshotFixture } from "./test-helpers/business-capability-fixtures.mjs";

const UI_PREFERENCES_KEY = "yardimci-asistan.ui-preferences";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDirectory);
const desktopAppRoot = join(projectRoot, "apps", "desktop-app");
const screenshotDirectory = join(projectRoot, "artifacts", "screenshots");
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const server = spawn(
  npxCommand,
  ["vite", "--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", String(port)],
  {
    cwd: desktopAppRoot,
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let browser;
let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

async function runSmoke() {
  try {
    await waitForUrl(baseUrl);
    browser = await launchChromiumForSmoke(chromium);

    await verifyFirstSetupCategoryGate(browser, baseUrl);
    await verifyFreshPreferences(browser, baseUrl);
    await verifyEmbeddedSettings(browser, baseUrl);
    await verifyLegacyPreferenceRecordIsDiscarded(browser, baseUrl);
    await verifyMalformedPreferenceRecord(browser, baseUrl);

    console.log(`desktop-appearance-ok: ${baseUrl}`);
  } catch (error) {
    if (serverOutput.trim()) {
      console.error(serverOutput.trim());
    }
    throw error;
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }
}

async function verifyFirstSetupCategoryGate(activeBrowser, rendererUrl) {
  const context = await createIsolatedContext(activeBrowser);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    expect(await page.evaluate(() => window.__appearanceSmokeInitialPreferenceRecord)).toBeNull();
    await expect(page.getByRole("tablist", { name: "Ayar kategorileri" })).toHaveCount(0);
    await expect(page.getByLabel("Sektör tipi")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Uygulama", exact: true })).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "system");
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
    expect(pageErrors).toEqual([]);
  } catch (error) {
    await reportScenarioFailure("first setup category gate", page, pageErrors);
    throw error;
  } finally {
    await context.close();
  }
}

async function verifyFreshPreferences(activeBrowser, rendererUrl) {
  const context = await createIsolatedContext(activeBrowser, undefined, false);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);
  const defaults = { version: 2, scheme: "system", density: "comfortable", scale: 1, accent: "coral", font: "plex", motion: "system" };
  const trigger = page.getByRole("button", { name: "Görünüm", exact: true });
  const panel = page.getByRole("dialog", { name: "Görünüm", exact: true });
  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => window.__appearanceSmokeInitialPreferenceRecord)).toBeNull();
    await waitForBootstrap(page);
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("group", { name: "Renk düzeni" }).getByRole("radio", { name: "Sistem", exact: true })).toBeFocused();
    await expect(panel.getByRole("button", { name: "Kaydet", exact: true })).toHaveCount(0);
    // Text labels and blank panel areas are inside the popover, not outside clicks.
    await panel.getByText("Açık", { exact: true }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("radio", { name: "Açık", exact: true })).toBeChecked();
    await panel.locator(".appearance-popover-header h2").click();
    await expect(panel).toBeVisible();
    const controls = panel.locator(".appearance-controls");
    const controlsBox = await controls.boundingBox();
    expect(controlsBox).not.toBeNull();
    await controls.click({ position: { x: Math.floor(controlsBox.width - 4), y: 4 } });
    await expect(panel).toBeVisible();
    await panel.getByRole("group", { name: "Renk düzeni" }).getByRole("radio", { name: "Sistem", exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "system");
    await expect.poll(() => readStoredPreferences(page)).toEqual(defaults);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light");
    await expect.poll(() => readStoredPreferences(page)).toEqual({ ...defaults, scheme: "light" });
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "system");
    const lightTokens = await readRootTokens(page, THEME_SEMANTIC_TOKENS);
    expect(Object.values(lightTokens).every(value => value.trim().length > 0)).toBe(true);

    // No web secret, setup save or network is available: preferences still persist.
    await page.evaluate(() => {
      window.yardimciDesktop.saveInitialSetup = () => { throw new Error("Appearance must not save setup"); };
      window.yardimciDesktop.publishSnapshot = () => { throw new Error("Appearance must not publish"); };
    });
    await context.setOffline(true);
    const next = { ...defaults };
    for (const [field, label, value] of [
      ["scheme", "Koyu", "dark"], ["density", "Kompakt", "compact"],
      ["accent", "Mavi", "blue"], ["font", "Sistem", "system"],
      ["motion", "Azaltılmış", "reduced"]
    ]) {
      const group = field === "font" ? panel.getByRole("group", { name: "Yazı tipi" }) : panel;
      await group.getByRole("radio", { name: label, exact: true }).check();
      next[field] = value;
      await expect(page.locator("html")).toHaveAttribute(`data-${field === "scheme" ? "color-scheme" : field}`, value);
      await expect.poll(() => readStoredPreferences(page)).toEqual(next);
    }
    await panel.getByLabel("Arayüz ölçeği").selectOption("1.2");
    next.scale = 1.2;
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).zoom)).toBe("1.2");
    await expect.poll(() => readStoredPreferences(page)).toEqual(next);
    const darkTokens = await readRootTokens(page, THEME_SEMANTIC_TOKENS);
    expect(normalizeTokenMap(darkTokens)).not.toEqual(normalizeTokenMap(lightTokens));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await context.setOffline(false);

    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Uygulama", exact: true })).toHaveCount(0);
    await expect(page.locator("#settings-appearance")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /^Uygulama/ })).toHaveCount(0);
    await trigger.click();
    await panel.getByRole("radio", { name: "Yeşil", exact: true }).check();
    next.accent = "green";
    await expect.poll(() => readStoredPreferences(page)).toEqual(next);
    await expect(page.getByRole("tab", { name: /^Uygulama/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expandSettingsStructure(page);
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForBootstrap(page);
    await trigger.click();
    await expect(panel.getByRole("radio", { name: "Koyu", exact: true })).toBeChecked();
    await expect(panel.getByRole("radio", { name: "Kompakt", exact: true })).toBeChecked();
    await expect(panel.getByLabel("Arayüz ölçeği")).toHaveValue("1.2");
    await expect.poll(() => readStoredPreferences(page)).toEqual(next);
    await page.setViewportSize({ width: 1366, height: 768 });
    // Resizing while CSS zoom is active can require a layout frame before bounds settle.
    await expect.poll(() => panel.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.left >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
    })).toBe(true);
    await panel.getByRole("button", { name: "Varsayılanlara dön", exact: true }).click();
    await expect.poll(() => readStoredPreferences(page)).toEqual(defaults);
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "system");
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
    await expect(page.locator("html")).toHaveAttribute("data-font", "plex");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "system");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "coral");
    await expect(panel.getByLabel("Arayüz ölçeği")).toHaveValue("1");
    await page.setViewportSize({ width: 1366, height: 768 });
    expect(await panel.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight && el.scrollWidth <= el.clientWidth + 1;
    })).toBe(true);
    expect(await panel.locator(".appearance-option").evaluateAll(options => options.every(el => el.getBoundingClientRect().height >= 44))).toBe(true);
    mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: join(screenshotDirectory, "desktop-appearance-fresh-preferences.png"), fullPage: true });
    await panel.getByRole("button", { name: "Görünümü kapat" }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.locator(".page-header__title").click();
    await expect(panel).toHaveCount(0);
    await trigger.click();
    await page.getByRole("button", { name: "Uygulama loglarını aç" }).focus();
    await expect(panel).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  } catch (error) {
    await reportScenarioFailure("fresh preferences", page, pageErrors);
    throw error;
  } finally {
    await context.close();
  }
}

async function verifyEmbeddedSettings(activeBrowser, rendererUrl) {
  const context = await createIsolatedContext(
    activeBrowser,
    { version: 2, scheme: "dark", density: "comfortable", scale: 1, accent: "coral", font: "plex", motion: "system" },
    false
  );
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    await waitForBootstrap(page);
    await expect(page.getByRole("button", { name: "Ayarlar", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    // The unified compact shell intentionally uses 16px page padding; keep it readable without wasting vertical space.
    expect(await page.locator(".page-content").evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop))).toBeGreaterThanOrEqual(16);
    await expect(page.locator(".system-health-item.tone-success").first()).toBeVisible();

    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ayarlar", exact: true, level: 1 })).toBeVisible();
    await expect(page.locator(".settings-workspace")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Uygulama", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Görünüm", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Görünüm", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Rahat", exact: true })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Koyu", exact: true })).toBeChecked();
    await expect(page.getByLabel("Arayüz ölçeği")).toBeVisible();

    await expect(page.getByRole("tablist", { name: "Ayar kategorileri" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expandSettingsStructure(page);
    await expect(page.getByLabel("Firma adı", { exact: true })).toBeVisible();
    expect(await page.locator(".setup-capabilities").evaluate((surface) => surface.scrollWidth <= surface.clientWidth + 1)).toBe(true);
    expect(pageErrors).toEqual([]);
  } catch (error) {
    await reportScenarioFailure("embedded settings", page, pageErrors);
    throw error;
  } finally {
    await context.close();
  }
}

async function verifyLegacyPreferenceRecordIsDiscarded(activeBrowser, rendererUrl) {
  const legacyPreferences = { theme: "dark", mode: "easy", scale: 1.1 };
  const context = await createIsolatedContext(activeBrowser, legacyPreferences, false);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    expect(JSON.parse(await page.evaluate(() => window.__appearanceSmokeInitialPreferenceRecord))).toEqual(legacyPreferences);
    await waitForBootstrap(page);
    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Uygulama", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Görünüm", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Görünüm", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "system");
    await expect(page.getByRole("radio", { name: "Rahat", exact: true })).toBeChecked();
    await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1");
    await expect(page.getByRole("radio", { name: "Sistem", exact: true }).first()).toBeChecked();
    await expect.poll(() => readStoredPreferences(page)).toEqual({
      version: 2,
      scheme: "system",
      density: "comfortable",
      scale: 1,
      accent: "coral",
      font: "plex",
      motion: "system"
    });
    expect(pageErrors).toEqual([]);
  } catch (error) {
    await reportScenarioFailure("legacy preference record", page, pageErrors);
    throw error;
  } finally {
    await context.close();
  }
}

async function verifyMalformedPreferenceRecord(activeBrowser, rendererUrl) {
  const malformedPreferences = "{not-valid-json";
  const context = await createIsolatedContext(activeBrowser, malformedPreferences, false);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    expect(await page.evaluate(() => window.__appearanceSmokeInitialPreferenceRecord)).toBe(malformedPreferences);
    await waitForBootstrap(page);
    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Uygulama", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Görünüm", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Görünüm", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "system");
    await expect(page.getByRole("radio", { name: "Rahat", exact: true })).toBeChecked();
    await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1");
    await expect(page.getByRole("radio", { name: "Sistem", exact: true }).first()).toBeChecked();
    await expect.poll(() => readStoredPreferences(page)).toEqual({
      version: 2,
      scheme: "system",
      density: "comfortable",
      scale: 1,
      accent: "coral",
      font: "plex",
      motion: "system"
    });
    expect(pageErrors).toEqual([]);
  } catch (error) {
    await reportScenarioFailure("malformed preferences", page, pageErrors);
    throw error;
  } finally {
    await context.close();
  }
}

async function waitForBootstrap(page) {
  // Fixture bootstrap resolves async after first render; on settle the app
  // redirects once (dashboard when setup is complete) and no further
  // redirects occur, so sidebar navigation sticks afterwards. The fixture
  // business name only renders after bootstrap (default is empty).
  await expect(page.locator(".brand-business-name", { hasText: "Deniz Çiçeği Pansiyon & Kafe" })).toBeVisible();
}

async function createIsolatedContext(activeBrowser, initialPreferences, setupRequired = true) {
  const context = await activeBrowser.newContext({ viewport: { width: 1440, height: 1000 } });
  const setupData = createSetupFixture(setupRequired);
  await context.addInitScript(({ capabilitySnapshot, dashboardData, setupData, preferenceKey, preferenceSeed }) => {
    if (preferenceSeed !== null && localStorage.getItem(preferenceKey) === null) {
      localStorage.setItem(
        preferenceKey,
        typeof preferenceSeed === "string" ? preferenceSeed : JSON.stringify(preferenceSeed)
      );
    }
    window.__appearanceSmokeInitialPreferenceRecord = localStorage.getItem(preferenceKey);
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "appearance-smoke",
        platform: "linux",
        syncSettings: { webModuleUrl: setupData.webModuleUrl, hasSyncSecret: false },
        databasePath: dashboardData.databasePath,
        userDataPath: "/tmp/yardimci-asistan-appearance-smoke",
        backupPath: dashboardData.backupPath,
        setup: setupData
      }),
      getDashboardData: async () => dashboardData,
      getSetupData: async () => setupData,
      getGoogleReviewsSettings: async () => ({ enabled: false, placeId: "", apiKeyConfigured: false, lastPublishedAt: "", publicationPending: false }),
      saveGoogleReviewsSettings: async (input) => ({
        ok: true,
        message: "Google yorumları ayarları kaydedildi.",
        settings: { enabled: input.enabled, placeId: input.placeId, apiKeyConfigured: Boolean(input.apiKey), lastPublishedAt: "", publicationPending: false }
      }),
      testGoogleReviewsConnection: async () => ({ ok: true, message: "Google Places bağlantısı doğrulandı.", name: "Smoke İşletme", rating: 4.8, userRatingCount: 12 }),
      getKbsSettings: async () => ({ enabled: false, provider: "egm", facilityCode: "", username: "", authorizedIdentityNumber: "", passwordConfigured: false }),
      saveKbsSettings: async (input) => ({ ok: true, message: "KBS ayarları kaydedildi.", settings: { enabled: input.enabled, provider: input.provider, facilityCode: input.facilityCode, username: input.username, authorizedIdentityNumber: input.authorizedIdentityNumber, passwordConfigured: Boolean(input.password) } }),
      testKbsConnection: async () => ({ ok: false, message: "Smoke modunda KBS bağlantısı denenemez." }),
      inspectEgmKbsSession: async () => ({ ok: false, message: "Smoke modunda EGM oturumu yok." }),
      prepareEgmKbsLogin: async () => ({ ok: false, message: "Smoke modunda EGM girişi hazırlanamaz." }),
      getRoomFolioData: async () => ({
        generatedAt: "",
        rooms: [],
        activeStays: [],
        folios: [],
        menuCategories: [],
        menuItems: []
      }),
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "appearance-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "",
        lastSuccessAt: "",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Hazır"
      }),
      onSyncStatusChanged: () => () => {}
    };
  }, {
    capabilitySnapshot: createCapabilitySnapshotFixture(setupData, "appearance-smoke-business"),
    dashboardData: createEmptyDashboardFixture(),
    setupData,
    preferenceKey: UI_PREFERENCES_KEY,
    preferenceSeed: initialPreferences ?? null
  });
  return context;
}

function createSetupFixture(setupRequired = true) {
  return {
    setupRequired,
    appPasswordConfigured: false,
    businessName: "Deniz Çiçeği Pansiyon & Kafe",
    profileId: "pension_restaurant",
    profileOptions: [...getBusinessProfile("pension_restaurant").defaultOptionalCapabilities],
    phone: "+905321234567",
    whatsapp: "+905321234567",
    email: "smoke@example.test",
    address: "Smoke adresi",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "",
    autoSyncEnabled: true,
    localNetworkEnabled: true,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "",
    aiTimeoutSeconds: 30,
    aiApiKeyConfigured: false,
    aiLastPublishedAt: "",
    aiProfiles: [],
    productData: {
      enabled: true,
      provider: "open_food_facts",
      autoSearchUnknownBarcode: true,
      includeImages: true
    },
    servicePreferences: {
      whatsapp: true,
      android: true
    },
    initialCounts: { rooms: 2, tables: 2 },
    tableCategories: [
      { name: "Bahçe", tableCount: 1 },
      { name: "Salon", tableCount: 1 }
    ],
    birthdaySettings: {
      enabled: true,
      mode: "manual",
      sendTime: "10:00",
      messageTemplate: "Doğum gününüz kutlu olsun {ad}! 🎉 {işletme} olarak sağlıklı ve güzel bir yıl dileriz."
    }
  };
}

function createEmptyDashboardFixture() {
  return {
    revision: 1,
    roomOperations: null,
    tableOperations: null,
    databasePath: "/tmp/yardimci-asistan-appearance-smoke.sqlite",
    backupPath: "/tmp/yardimci-asistan-appearance-smoke-backups",
    webModuleUrl: "https://example.test/yardimci-asistan",
    requests: [],
    preparedWhatsAppMessages: [],
    rooms: [],
    tables: [],
    reservations: [],
    dailyTasks: [],
    customers: [],
    customerRoomStays: [],
    hospitalityNotifications: [],
    kbsOverview: {
      enabled: false,
      configured: false,
      provider: "egm",
      pendingCount: 0,
      failedCount: 0,
      sentCount: 0,
      checkedInGuestCount: 0,
      activeUnsentCount: 0,
      activeMissingIdentityCount: 0
    },
    androidDevices: [],
    paymentWaitingTableOrders: [],
    androidActionFailures: [],
    menu: { categories: [], items: [], updated_at: "" },
    attention: {
      pendingRequests: 0,
      pendingReservations: 0,
      paymentWaitingTables: 0,
      overdueTasks: 0,
      incompleteTasks: 0,
      outOfStockItems: 0,
      lowStockItems: 0,
      totalCount: 0,
      items: []
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
    },
    birthdayOverview: {
      enabled: true,
      mode: "manual",
      today: "2026-07-18",
      candidates: [],
      dueCount: 0,
      preparedCount: 0,
      sentCount: 0,
      invalidPhoneCount: 0,
      waitingCount: 0,
      failedCount: 0
    }
  };
}

function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function reportScenarioFailure(name, page, pageErrors) {
  const bodyText = await page.locator("body").innerText().catch(() => "<body unavailable>");
  console.error(`${name} scenario failed. Page errors: ${JSON.stringify(pageErrors)}`);
  console.error(`Rendered text: ${bodyText.slice(0, 1200)}`);
}

async function readStoredPreferences(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), UI_PREFERENCES_KEY);
}

async function readRootTokens(page, tokenNames) {
  return page.evaluate((names) => {
    const styles = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(name).trim()]));
  }, tokenNames);
}

function normalizeTokenMap(tokens) {
  return Object.fromEntries(Object.entries(tokens).map(([name, value]) => [
    name,
    value.replace(/\s+/g, " ").replace(/0\.(\d*?)0(?=[),])/g, "0.$1").trim()
  ]));
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
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Desktop renderer exited before becoming ready (code ${server.exitCode}).`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The renderer is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Desktop renderer did not become ready: ${url}`);
}

// Verify semantic theme decisions without freezing palette hex codes or old pixels.
const THEME_SEMANTIC_TOKENS = [
  "--color-bg-app", "--color-bg-surface", "--color-bg-panel", "--color-bg-field",
  "--color-text", "--color-text-muted", "--color-accent", "--color-focus",
  "--color-border", "--color-danger", "--color-warning", "--color-success",
  "--text-base", "--space-1", "--radius-control", "--control-height-md"
];

await runSmoke();
