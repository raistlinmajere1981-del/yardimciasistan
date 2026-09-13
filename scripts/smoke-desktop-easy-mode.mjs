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
    await verifyPartialPreferenceRecord(browser, baseUrl);
    await verifyMalformedPreferenceRecord(browser, baseUrl);

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
    await expect(easyCard.locator("small")).toBeVisible();
    await expect(proCard.locator("small")).toBeVisible();
    expect(await page.evaluate(() => {
      const modes = document.querySelector(".appearance-mode-options");
      const businessIdentitySection = document.querySelector(".settings-identity-section");
      return Boolean(modes && businessIdentitySection && (businessIdentitySection.compareDocumentPosition(modes) & Node.DOCUMENT_POSITION_FOLLOWING));
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

    const actualTokens = await readRootTokens(page, EASY_THEME_INVARIANT_TOKENS);
    expect(Object.values(actualTokens).every((value) => value.trim().length > 0)).toBe(true);

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

    await expect(page.getByLabel("Firma adı", { exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Büyük ve Sade Görünüm/ })).toBeChecked();
    expect(await page.locator(".setup-form-surface").evaluate((surface) => surface.scrollWidth <= surface.clientWidth + 1)).toBe(true);

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
    await expect(page.locator(".system-health-item.tone-ok").first()).toBeVisible();

    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ayarlar", exact: true, level: 1 })).toBeVisible();
    await expect(page.locator(".setup-shell.is-embedded")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Uygulama Görünümü" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Büyük ve Sade Görünüm/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Karanlık tema")).toHaveCount(0);

    await expect(page.getByRole("navigation", { name: "Ayar bölümleri" }).getByRole("link")).toHaveCount(6);
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

async function verifyPartialPreferenceRecord(activeBrowser, rendererUrl) {
  const partialPreferences = { theme: "dark", scale: 1.1 };
  const context = await createIsolatedContext(activeBrowser, partialPreferences);
  const page = await context.newPage();
  const pageErrors = trackPageErrors(page);

  try {
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });

    expect(JSON.parse(await page.evaluate(() => window.__easyModeSmokeInitialPreferenceRecord))).toEqual(partialPreferences);
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
    await reportScenarioFailure("partial preferences", page, pageErrors);
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
    profileId: "pension_restaurant",
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
    servicePreferences: {
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

// Easy remains a light appearance regardless of the stored pro theme.
// Verify semantic decisions, without freezing palette hex codes or old pixels.
const EASY_THEME_INVARIANT_TOKENS = [
  "--color-bg-app", "--color-bg-surface", "--color-bg-panel", "--color-bg-field",
  "--color-text", "--color-text-muted", "--color-accent", "--color-focus",
  "--color-border", "--color-danger", "--color-warning", "--color-success",
  "--text-base", "--space-1", "--radius-control", "--control-height-md"
];

await runSmoke();
