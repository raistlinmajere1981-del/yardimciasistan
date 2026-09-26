import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getBusinessProfile } from "@yardimci-asistan/shared";
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
    browser = await launchChromiumForSmoke(chromium);

    await verifyFreshSetup(browser, baseUrl);
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

async function verifyFreshSetup(activeBrowser, rendererUrl) {
  const context = await createIsolatedContext(activeBrowser);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    expect(await page.evaluate(() => window.__appearanceSmokeInitialPreferenceRecord)).toBeNull();
    await page.getByRole("tab", { name: "Uygulama", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Görünüm", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "system");
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "coral");
    await expect(page.locator("html")).toHaveAttribute("data-font", "plex");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "system");
    expect(await page.evaluate(() => ({
      inline: document.documentElement.style.colorScheme,
      computed: getComputedStyle(document.documentElement).colorScheme
    }))).toEqual({ inline: "light dark", computed: "light dark" });

    await expect(page.getByText("Büyük ve Sade Görünüm", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Kompakt ve Gelişmiş Görünüm", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Karanlık tema")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Sistem", exact: true }).first()).toBeChecked();
    await expect(page.getByRole("radio", { name: "Rahat", exact: true })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Mercan", exact: true })).toBeChecked();
    await expect(page.getByRole("radio", { name: "IBM Plex Sans", exact: true })).toBeChecked();
    await expect(page.getByLabel("Arayüz ölçeği")).toBeVisible();

    const actualTokens = await readRootTokens(page, THEME_SEMANTIC_TOKENS);
    expect(Object.values(actualTokens).every((value) => value.trim().length > 0)).toBe(true);

    const lightSystemTokens = await readRootTokens(page, THEME_SEMANTIC_TOKENS);
    await page.getByRole("radio", { name: "Koyu", exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
    expect(await page.evaluate(() => ({
      inline: document.documentElement.style.colorScheme,
      computed: getComputedStyle(document.documentElement).colorScheme
    }))).toEqual({ inline: "dark", computed: "dark" });
    const darkThemeTokens = await readRootTokens(page, THEME_SEMANTIC_TOKENS);
    expect(normalizeTokenMap(darkThemeTokens)).not.toEqual(normalizeTokenMap(lightSystemTokens));
    expect(darkThemeTokens["--color-bg-surface"]).not.toBe(lightSystemTokens["--color-bg-surface"]);
    expect(darkThemeTokens["--color-text"]).not.toBe(lightSystemTokens["--color-text"]);
    await expect.poll(() => readStoredPreferences(page)).toEqual({
      version: 2,
      scheme: "dark",
      density: "comfortable",
      scale: 1,
      accent: "coral",
      font: "plex",
      motion: "system"
    });

    await page.getByRole("radio", { name: "Açık", exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");

    await page.getByRole("tab", { name: "İşletme", exact: true }).click();
    await expect(page.getByLabel("Firma adı", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Uygulama", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Rahat", exact: true })).toBeChecked();
    expect(await page.locator(".settings-category-body").evaluate((surface) => surface.scrollWidth <= surface.clientWidth + 1)).toBe(true);

    await expect.poll(() => readStoredPreferences(page)).toEqual({
      version: 2,
      scheme: "light",
      density: "comfortable",
      scale: 1,
      accent: "coral",
      font: "plex",
      motion: "system"
    });
    mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: join(screenshotDirectory, "desktop-appearance-first-setup.png"),
      fullPage: true
    });

    await page.getByRole("radio", { name: "Kompakt", exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
    await expect(page.getByRole("radio", { name: "Kompakt", exact: true })).toBeChecked();
    await expect(page.getByLabel("Arayüz ölçeği")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Koyu", exact: true })).not.toBeChecked();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
    await expect.poll(() => readStoredPreferences(page)).toEqual({
      version: 2,
      scheme: "light",
      density: "compact",
      scale: 1,
      accent: "coral",
      font: "plex",
      motion: "system"
    });

    await page.getByRole("radio", { name: "Koyu", exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    await expect.poll(() => readStoredPreferences(page)).toEqual({
      version: 2,
      scheme: "dark",
      density: "compact",
      scale: 1,
      accent: "coral",
      font: "plex",
      motion: "system"
    });

    await page.getByRole("radio", { name: "Mavi", exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "blue");
    const blueAccentTokens = await readRootTokens(page, ["--color-accent", "--color-focus"]);
    expect(blueAccentTokens["--color-accent"]).not.toBe(darkThemeTokens["--color-accent"]);
    await page.getByRole("radio", { name: "Mercan", exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "coral");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Uygulama", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Görünüm", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "coral");
    await expect(page.getByRole("radio", { name: "Kompakt", exact: true })).toBeChecked();
    await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1");
    await expect(page.getByRole("radio", { name: "Koyu", exact: true })).toBeChecked();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    expect(await readStoredPreferences(page)).toEqual({ version: 2, scheme: "dark", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" });
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
    { version: 2, scheme: "dark", density: "comfortable", scale: 1, accent: "coral", font: "plex", motion: "system" },
    false
  );
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: "Ayarlar", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    expect(await page.locator(".page-content").evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop))).toBeGreaterThanOrEqual(24);
    await expect(page.locator(".system-health-item.tone-ok").first()).toBeVisible();

    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ayarlar", exact: true, level: 1 })).toBeVisible();
    await expect(page.locator(".settings-workspace")).toBeVisible();
    await page.getByRole("tab", { name: "Uygulama", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Görünüm", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Rahat", exact: true })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Koyu", exact: true })).toBeChecked();
    await expect(page.getByLabel("Arayüz ölçeği")).toBeVisible();

    await expect(page.getByRole("tablist", { name: "Ayar kategorileri" }).getByRole("tab")).toHaveCount(4);
    await page.getByRole("tab", { name: "İşletme", exact: true }).click();
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
  const context = await createIsolatedContext(activeBrowser, legacyPreferences);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    expect(JSON.parse(await page.evaluate(() => window.__appearanceSmokeInitialPreferenceRecord))).toEqual(legacyPreferences);
    await page.getByRole("tab", { name: "Uygulama", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Görünüm", exact: true })).toBeVisible();
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
  const context = await createIsolatedContext(activeBrowser, malformedPreferences);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    expect(await page.evaluate(() => window.__appearanceSmokeInitialPreferenceRecord)).toBe(malformedPreferences);
    await page.getByRole("tab", { name: "Uygulama", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Görünüm", exact: true })).toBeVisible();
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
        syncSettings: { webModuleUrl: setupData.webModuleUrl, hasSyncSecret: true },
        databasePath: dashboardData.databasePath,
        userDataPath: "/tmp/yardimci-asistan-appearance-smoke",
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
    syncSecret: "appearance-smoke-secret",
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
