import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createCapabilitySnapshotFixture } from "./capability-smoke-fixture.mjs";

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
    browser = await chromium.launch();

    await verifyFreshSetup(browser, baseUrl);
    await verifyEmbeddedSettings(browser, baseUrl);
    await verifyLegacyPreferenceMigration(browser, baseUrl);
    await verifyMalformedPreferenceMigration(browser, baseUrl);

    console.log(`desktop-easy-mode-ok: ${baseUrl}`);
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

async function verifyFreshSetup(activeBrowser, rendererUrl) {
  const context = await createIsolatedContext(activeBrowser);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    expect(await page.evaluate(() => window.__easyModeSmokeInitialPreferenceRecord)).toBeNull();
    await expect(page.getByRole("heading", { name: "Uygulama Görünümü" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "easy");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => ({
      inline: document.documentElement.style.colorScheme,
      computed: getComputedStyle(document.documentElement).colorScheme
    }))).toEqual({ inline: "light", computed: "light" });

    const easyCard = page.getByRole("radio", { name: /Büyük ve Sade Görünüm/ });
    const proCard = page.getByRole("radio", { name: /Kompakt ve Gelişmiş Görünüm/ });
    await expect(easyCard).toBeVisible();
    await expect(easyCard).toHaveAttribute("aria-checked", "true");
    await expect(easyCard).toHaveAttribute("tabindex", "0");
    await expect(proCard).toBeVisible();
    await expect(proCard).toHaveAttribute("aria-checked", "false");
    await expect(proCard).toHaveAttribute("tabindex", "-1");
    const modeCardGeometry = await page.locator(".appearance-mode-card").evaluateAll((cards) => cards.map((card) => {
      const description = card.querySelector("small");
      return {
        height: card.getBoundingClientRect().height,
        descriptionDisplay: description ? getComputedStyle(description).display : "missing"
      };
    }));
    expect(modeCardGeometry).toHaveLength(2);
    modeCardGeometry.forEach((card, index) => {
      expect(card.height, `Appearance mode card ${index + 1} should be at least 72px tall.`).toBeGreaterThanOrEqual(72);
      expect(card.descriptionDisplay, `Appearance mode card ${index + 1} description should be vertically separated.`).toBe("block");
    });
    expect(await page.evaluate(() => {
      const modes = document.querySelector(".appearance-mode-options");
      const businessIdentitySection = document.querySelector(".settings-identity-section");
      return Boolean(modes && businessIdentitySection && (modes.compareDocumentPosition(businessIdentitySection) & Node.DOCUMENT_POSITION_FOLLOWING));
    })).toBe(true);

    await expect(page.getByLabel("Karanlık tema")).toHaveCount(0);
    await expect(page.getByLabel("Arayüz ölçeği")).toBeVisible();

    await easyCard.focus();
    await easyCard.press("ArrowRight");
    await expect(proCard).toBeFocused();
    await expect(proCard).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Karanlık tema")).toBeVisible();
    await proCard.press("ArrowDown");
    await expect(easyCard).toBeFocused();
    await expect(easyCard).toHaveAttribute("aria-checked", "true");
    await easyCard.press("ArrowLeft");
    await expect(proCard).toBeFocused();
    await proCard.press("ArrowUp");
    await expect(easyCard).toBeFocused();
    await easyCard.press("End");
    await expect(proCard).toBeFocused();
    await proCard.press("Home");
    await expect(easyCard).toBeFocused();
    await expect(easyCard).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Karanlık tema")).toHaveCount(0);

    const actualTokens = await readRootTokens(page, Object.keys(EASY_ROOT_TOKENS));
    expect(normalizeTokenMap(actualTokens)).toEqual(normalizeTokenMap(EASY_ROOT_TOKENS));

    const lightThemeEasyTokens = await readRootTokens(page, EASY_THEME_INVARIANT_TOKENS);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    const darkThemeEasyTokens = await readRootTokens(page, EASY_THEME_INVARIANT_TOKENS);
    expect(normalizeTokenMap(darkThemeEasyTokens)).toEqual(normalizeTokenMap(lightThemeEasyTokens));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });

    const easyMeasurements = await page.evaluate(() => {
      const primaryControl = document.querySelector(".setup-primary");
      const pageSurface = document.querySelector(".setup-form-surface");
      const businessNameControl = document.querySelector(".settings-identity-section input");
      const businessNameLabel = businessNameControl?.closest("label");
      const appearanceHelper = document.querySelector(".appearance-controls small");
      const moduleToggle = document.querySelector(".settings-modules-section .setup-toggle-grid label");
      const categoryLabel = document.querySelector(".table-category-row label");
      const categoryControl = document.querySelector(".table-category-row input");
      const settingsLevelControl = document.querySelector(".settings-level-tabs button");
      if (
        !(primaryControl instanceof HTMLElement)
        || !(pageSurface instanceof HTMLElement)
        || !(businessNameControl instanceof HTMLElement)
        || !(businessNameLabel instanceof HTMLElement)
        || !(appearanceHelper instanceof HTMLElement)
        || !(moduleToggle instanceof HTMLElement)
        || !(categoryLabel instanceof HTMLElement)
        || !(categoryControl instanceof HTMLElement)
        || !(settingsLevelControl instanceof HTMLElement)
      ) {
        throw new Error("Easy mode measurement targets were not rendered.");
      }
      const surfaceStyles = getComputedStyle(pageSurface);
      return {
        bodyFontSize: Number.parseFloat(getComputedStyle(document.body).fontSize),
        primaryControlHeight: primaryControl.getBoundingClientRect().height,
        businessNameControlHeight: businessNameControl.getBoundingClientRect().height,
        businessNameLabelFontSize: Number.parseFloat(getComputedStyle(businessNameLabel).fontSize),
        helperFontSize: Number.parseFloat(getComputedStyle(appearanceHelper).fontSize),
        moduleToggleHeight: moduleToggle.getBoundingClientRect().height,
        categoryLabelFontSize: Number.parseFloat(getComputedStyle(categoryLabel).fontSize),
        categoryControlHeight: categoryControl.getBoundingClientRect().height,
        settingsLevelControlHeight: settingsLevelControl.getBoundingClientRect().height,
        pagePadding: [
          surfaceStyles.paddingTop,
          surfaceStyles.paddingRight,
          surfaceStyles.paddingBottom,
          surfaceStyles.paddingLeft
        ].map(Number.parseFloat)
      };
    });
    expect(easyMeasurements.bodyFontSize).toBeGreaterThanOrEqual(17);
    expect(easyMeasurements.primaryControlHeight).toBeGreaterThanOrEqual(44);
    expect(easyMeasurements.businessNameControlHeight).toBeGreaterThanOrEqual(44);
    expect(easyMeasurements.businessNameLabelFontSize).toBeGreaterThanOrEqual(17);
    expect(easyMeasurements.helperFontSize).toBeGreaterThanOrEqual(15);
    expect(easyMeasurements.moduleToggleHeight).toBeGreaterThanOrEqual(44);
    expect(easyMeasurements.categoryLabelFontSize).toBeGreaterThanOrEqual(13.5);
    expect(easyMeasurements.categoryControlHeight).toBeGreaterThanOrEqual(44);
    expect(easyMeasurements.settingsLevelControlHeight).toBeGreaterThanOrEqual(44);
    expect(Math.min(...easyMeasurements.pagePadding)).toBeGreaterThanOrEqual(24);

    await expect.poll(() => readStoredPreferences(page)).toEqual({
      theme: "light",
      scale: 1,
      mode: "easy"
    });
    mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: join(screenshotDirectory, "desktop-easy-mode-first-setup.png"),
      fullPage: true
    });

    await proCard.click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "pro");
    await expect(proCard).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Arayüz ölçeği")).toBeVisible();
    await expect(page.getByLabel("Karanlık tema")).toBeVisible();
    await expect.poll(() => readStoredPreferences(page)).toEqual({
      theme: "light",
      scale: 1,
      mode: "pro"
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Uygulama Görünümü" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "pro");
    await expect(page.getByRole("radio", { name: /Kompakt ve Gelişmiş Görünüm/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1");
    await expect(page.getByLabel("Karanlık tema")).not.toBeChecked();
    expect(await readStoredPreferences(page)).toEqual({ theme: "light", scale: 1, mode: "pro" });
    expect(pageErrors).toEqual([]);
  } catch (error) {
    await reportScenarioFailure("fresh setup", page, pageErrors);
    throw error;
  } finally {
    await context.close();
  }
}

async function verifyEmbeddedSettings(activeBrowser, rendererUrl) {
  const context = await createIsolatedContext(
    activeBrowser,
    { theme: "dark", scale: 1, mode: "easy" },
    false
  );
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: "Ayarlar", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "easy");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
    expect(await page.locator(".page-content").evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop))).toBeGreaterThanOrEqual(24);
    await expect(page.locator(".system-health-item.tone-ok").first()).toHaveCSS("color", "rgb(79, 157, 118)");

    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ayarlar", exact: true, level: 1 })).toBeVisible();
    await expect(page.locator(".setup-shell.is-embedded")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Uygulama Görünümü" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Büyük ve Sade Görünüm/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Karanlık tema")).toHaveCount(0);

    const embeddedMeasurements = await page.evaluate(() => {
      const input = document.querySelector(".settings-identity-section input");
      const label = input?.closest("label");
      const tab = document.querySelector(".settings-level-tabs button");
      if (!(input instanceof HTMLElement) || !(label instanceof HTMLElement) || !(tab instanceof HTMLElement)) {
        throw new Error("Embedded easy settings controls were not rendered.");
      }
      return {
        inputHeight: input.getBoundingClientRect().height,
        labelFontSize: Number.parseFloat(getComputedStyle(label).fontSize),
        tabHeight: tab.getBoundingClientRect().height
      };
    });
    expect(embeddedMeasurements.inputHeight).toBeGreaterThanOrEqual(44);
    expect(embeddedMeasurements.labelFontSize).toBeGreaterThanOrEqual(17);
    expect(embeddedMeasurements.tabHeight).toBeGreaterThanOrEqual(44);
    expect(pageErrors).toEqual([]);
  } catch (error) {
    await reportScenarioFailure("embedded settings", page, pageErrors);
    throw error;
  } finally {
    await context.close();
  }
}

async function verifyLegacyPreferenceMigration(activeBrowser, rendererUrl) {
  const legacyPreferences = { theme: "dark", scale: 1.1 };
  const context = await createIsolatedContext(activeBrowser, legacyPreferences);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    expect(JSON.parse(await page.evaluate(() => window.__easyModeSmokeInitialPreferenceRecord))).toEqual(legacyPreferences);
    await expect(page.getByRole("heading", { name: "Uygulama Görünümü" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "pro");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("radio", { name: /Kompakt ve Gelişmiş Görünüm/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1.1");
    await expect(page.getByLabel("Karanlık tema")).toBeChecked();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    await expect.poll(() => readStoredPreferences(page)).toEqual({
      theme: "dark",
      scale: 1.1,
      mode: "pro"
    });
    expect(pageErrors).toEqual([]);
  } catch (error) {
    await reportScenarioFailure("legacy preferences", page, pageErrors);
    throw error;
  } finally {
    await context.close();
  }
}

async function verifyMalformedPreferenceMigration(activeBrowser, rendererUrl) {
  const malformedPreferences = "{not-valid-json";
  const context = await createIsolatedContext(activeBrowser, malformedPreferences);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    expect(await page.evaluate(() => window.__easyModeSmokeInitialPreferenceRecord)).toBe(malformedPreferences);
    await expect(page.getByRole("heading", { name: "Uygulama Görünümü" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "pro");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("radio", { name: /Kompakt ve Gelişmiş Görünüm/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1");
    await expect(page.getByLabel("Karanlık tema")).not.toBeChecked();
    await expect.poll(() => readStoredPreferences(page)).toEqual({
      theme: "light",
      scale: 1,
      mode: "pro"
    });
    expect(pageErrors).toEqual([]);
  } catch (error) {
    await reportScenarioFailure("malformed preferences", page, pageErrors);
    throw error;
  } finally {
    await context.close();
  }
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
    window.__easyModeSmokeInitialPreferenceRecord = localStorage.getItem(preferenceKey);
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "easy-mode-smoke",
        platform: "linux",
        syncSettings: { webModuleUrl: setupData.webModuleUrl, hasSyncSecret: true },
        databasePath: dashboardData.databasePath,
        userDataPath: "/tmp/yardimci-asistan-easy-mode-smoke",
        backupPath: dashboardData.backupPath,
        setup: setupData
      }),
      getDashboardData: async () => dashboardData,
      getSetupData: async () => setupData,
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
        clientId: "easy-mode-smoke",
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
    capabilitySnapshot: createCapabilitySnapshotFixture(setupData, "easy-mode-smoke-business"),
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
    businessType: "pension_restaurant",
    phone: "+905321234567",
    whatsapp: "+905321234567",
    email: "smoke@example.test",
    address: "Smoke adresi",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "easy-mode-smoke-secret",
    autoSyncEnabled: true,
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
    modules: {
      rooms: true,
      tables: true,
      qrMenu: true,
      whatsapp: true,
      android: true
    },
    initialCounts: { rooms: 2, tables: 2 },
    tableCategories: [
      { name: "Bahçe", tableCount: 1 },
      { name: "Salon", tableCount: 1 }
    ]
  };
}

function createEmptyDashboardFixture() {
  return {
    databasePath: "/tmp/yardimci-asistan-easy-mode-smoke.sqlite",
    backupPath: "/tmp/yardimci-asistan-easy-mode-smoke-backups",
    webModuleUrl: "https://example.test/yardimci-asistan",
    requests: [],
    rooms: [],
    tables: [],
    reservations: [],
    dailyTasks: [],
    customers: [],
    customerRoomStays: [],
    androidDevices: [],
    paymentWaitingTableOrders: [],
    androidActionFailures: [],
    menu: { categories: [], items: [], updated_at: "" },
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

const EASY_ROOT_TOKENS = {
  "--bg": "#fff8ee",
  "--surface-1": "#fffdf7",
  "--surface-2": "#ffffff",
  "--surface-3": "#fbf3e2",
  "--surface-4": "#f3e9d6",
  "--ink": "#2b2723",
  "--ink-muted": "#6b6259",
  "--ink-dim": "#a39c8f",
  "--border": "rgba(43, 39, 35, 0.10)",
  "--border-strong": "rgba(43, 39, 35, 0.18)",
  "--border-focus": "#d97a4d",
  "--primary": "#d97a4d",
  "--primary-dim": "#c2673d",
  "--primary-bg": "rgba(217, 122, 77, 0.12)",
  "--primary-border": "rgba(217, 122, 77, 0.28)",
  "--status-green": "#4f9d76",
  "--status-green-bg": "rgba(79, 157, 118, 0.12)",
  "--status-amber": "#d9a441",
  "--status-amber-bg": "rgba(217, 164, 65, 0.14)",
  "--status-red": "#c4594c",
  "--status-red-bg": "rgba(196, 89, 76, 0.12)",
  "--status-blue": "#5b86ad",
  "--status-blue-bg": "rgba(91, 134, 173, 0.12)",
  "--sidebar-bg": "#fffdf7",
  "--sidebar-active-bg": "rgba(217, 122, 77, 0.12)",
  "--sidebar-active-border": "rgba(217, 122, 77, 0.32)",
  "--nav-text": "#6b6259",
  "--nav-text-active": "#d97a4d",
  "--text-xs": "0.85rem",
  "--text-sm": "0.95rem",
  "--text-base": "1.0625rem",
  "--text-md": "1.125rem",
  "--text-lg": "1.3rem",
  "--text-xl": "1.5rem",
  "--text-2xl": "1.85rem",
  "--space-1": "6px",
  "--space-2": "10px",
  "--space-3": "14px",
  "--space-4": "18px",
  "--space-5": "24px",
  "--space-6": "30px",
  "--space-8": "40px",
  "--space-10": "48px",
  "--radius-sm": "8px",
  "--radius-md": "10px",
  "--radius-lg": "14px",
  "--radius-xl": "18px",
  "--shadow-sm": "0 1px 3px rgba(43, 39, 35, 0.08)",
  "--shadow-md": "0 4px 10px rgba(43, 39, 35, 0.08)",
  "--shadow-lg": "0 8px 20px rgba(43, 39, 35, 0.10)",
  "--shadow-xl": "0 16px 36px rgba(43, 39, 35, 0.12)",
  "--sidebar-width": "224px",
  "--page-header-height": "64px",
  "--page-padding": "24px",
  "--control-height": "46px"
};

const EASY_THEME_INVARIANT_TOKENS = [
  ...Object.keys(EASY_ROOT_TOKENS),
  "--paper",
  "--field",
  "--surface-tint",
  "--surface-alt",
  "--surface-disabled",
  "--muted",
  "--line",
  "--control-border",
  "--primary-solid",
  "--primary-soft",
  "--primary-line",
  "--accent",
  "--blue",
  "--blue-solid",
  "--blue-soft",
  "--yellow",
  "--warning-soft",
  "--warning-line",
  "--warning-ink",
  "--green",
  "--green-solid",
  "--green-soft",
  "--red",
  "--danger-soft",
  "--danger-line",
  "--neutral-strong"
];

await runSmoke();
