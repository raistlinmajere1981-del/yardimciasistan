import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { spawn, spawnSync } from "node:child_process";
import { getLocalViteExecutable } from "./test-helpers/local-vite.mjs";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import process from "node:process";
import { desktopStyleAudit } from "./lib/desktop-style-audit.mjs";

const visualPass = process.env.VISUAL_PASS || "final";
const output = `artifacts/design-system/stage3b/${visualPass}`;
const preferencesKey = "yardimci-asistan.ui-preferences";
const viewports = [
  [1440, 1000],
  [1366, 768],
  [1024, 768],
  [900, 768],
  [760, 800],
  [600, 800]
];
const themes = [
  ["light", "compact"],
  ["dark", "compact"],
  ["light", "comfortable"]
];

const read = (file) => readFileSync(file, "utf8");
const lockSource = read("apps/desktop-app/src/components/security/AppLockScreen.tsx");
const lockCss = read("apps/desktop-app/src/styles/pages/lock.css");
const indexCss = read("apps/desktop-app/src/styles/index.css");
const baseCss = read("apps/desktop-app/src/styles/foundation/base.css");
const motionCss = read("apps/desktop-app/src/styles/components/motion.css");
const appearanceMotionCss = read("apps/desktop-app/src/styles/appearance/motion.css");
const menuPreviewSource = read("apps/desktop-app/src/components/menu/MenuPreview.tsx");
const menuPreviewCss = read("apps/desktop-app/src/styles/pages/menu-preview.css");
const restaurantReservationsSource = read("apps/desktop-app/src/components/operations/RestaurantReservationsWorkspace.tsx");
const dataListSource = read("apps/desktop-app/src/components/ui/DataList.tsx");

assert.match(lockCss, /position:\s*fixed/);
assert.match(lockCss, /z-index:\s*var\(--z-security\)/);
assert.match(lockCss, /var\(--color-security-(?:backdrop|surface|field|text|accent|danger|focus)\)/);
assert.match(lockSource, /role=\{phase === "checking" \? undefined : "dialog"\}/);
assert.match(lockSource, /autoComplete="current-password"/);
assert.match(lockSource, /aria-live="polite"/);
assert(!indexCss.includes('"./components/records.css"'), "records.css import must be removed");
assert(!indexCss.includes('"./components/operations.css"'), "operations.css import must be removed");
assert.equal(existsSync("apps/desktop-app/src/styles/components/records.css"), false, "records.css must be removed");
assert.equal(existsSync("apps/desktop-app/src/styles/components/operations.css"), false, "operations.css must be removed");
assert.match(motionCss, /@keyframes\s+(?:app-lock-enter|app-lock-exit|app-lock-recovery-enter|stock-image-spin|ya-health-spin)/);
assert(!/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/i.test(lockCss), "lock.css must not contain raw colors");
assert.match(appearanceMotionCss, /prefers-reduced-motion:\s*reduce/);
assert(!/prefers-reduced-motion/.test(baseCss), "base.css must not carry its own reduced-motion copy; appearance/motion.css is authoritative");
assert(!/prefers-reduced-motion/.test(lockCss), "lock.css must not carry a feature-specific reduced-motion copy; appearance/motion.css is authoritative");
assert.match(menuPreviewSource, /local-menu-preview-dialog dialog dialog--wide dialog--preview/);
assert.match(menuPreviewSource, /local-menu-preview-toolbar overlay-header/);
assert.match(menuPreviewCss, /local-menu-preview-page/);
assert.match(restaurantReservationsSource, /DataList/);
assert.match(restaurantReservationsSource, /ActionButton/);
assert.match(restaurantReservationsSource, /StatusBadge/);
assert.match(dataListSource, /list-row/);

const audit = desktopStyleAudit(collectCssFiles("apps/desktop-app/src"));
assert.equal(audit.totals.normalDomRawColor, 0, "normal desktop DOM must have no raw colors");
assert(audit.totals.intentionalRendererRawColor > 0, "MenuPreview renderer exception should be reported");
assert.equal(audit.totals.important, 0);
assert.equal(audit.totals.override, 0);
assert.equal(audit.totals.oldAlias, 0);
assert(!audit.violations.some((issue) => ["legacyImport", "orphanStylesheet", "shellOutsideLayout", "featureShellSelector"].includes(issue.kind)));

mkdirSync(output, { recursive: true });
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  getLocalViteExecutable(),
  ["--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", String(port)],
  { cwd: "apps/desktop-app", stdio: "ignore" }
);
let browser;
const observations = [];

try {
  await waitForServer(baseUrl);
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ locale: "tr-TR", viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installLockedBridge(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const lockDialog = page.getByRole("dialog", { name: "Yardımcı Asistan kilit ekranı" });
  await expect(lockDialog).toBeVisible();
  await expect(lockDialog.getByLabel("Uygulama şifresi")).toBeFocused();
  await expect(lockDialog.getByRole("button", { name: "Kilidi Aç", exact: true })).toBeEnabled();
  await expect(lockDialog.getByRole("button", { name: "Şifremi Unuttum", exact: true })).toHaveAttribute("aria-expanded", "false");
  await lockDialog.getByRole("button", { name: "Şifremi Unuttum", exact: true }).click();
  await expect(lockDialog.getByLabel("Web güvenlik anahtarı")).toBeFocused();
  await expect(lockDialog.getByRole("button", { name: "Şifreyi Sıfırla ve Aç", exact: true })).toBeVisible();

  for (const [scheme, density] of themes) {
    await setAppearance(page, scheme, density);
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await expect(lockDialog).toBeVisible();
      const metrics = await getOverflowMetrics(page);
      expect(metrics.documentOverflow, `${scheme}-${density} ${width}: document overflow`).toBe(false);
      expect(metrics.surfaceOverflow, `${scheme}-${density} ${width}: lock surface overflow`).toEqual([]);
      observations.push({ scheme, density, width, height, ...metrics });
      if (width === 1440 || width === 600) {
        await page.screenshot({
          animations: "disabled",
          path: `${output}/lock-${width}x${height}-${scheme}-${density}.png`
        });
      }
    }
  }

  if (await lockDialog.getByRole("button", { name: "Şifremi Unuttum", exact: true }).getAttribute("aria-expanded") !== "true") {
    await lockDialog.getByRole("button", { name: "Şifremi Unuttum", exact: true }).click();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.locator(".app-lock-screen").evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration))).toBeLessThan(0.001);
  await expect.poll(() => page.locator(".app-lock-recovery-form").evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration))).toBeLessThan(0.001);
  await page.screenshot({ animations: "disabled", path: `${output}/lock-reduced-motion-600x800.png` });
  expect(pageErrors).toEqual([]);
  writeFileSync(`${output}/observations.json`, JSON.stringify(observations, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

run("desktop-lock", process.execPath, ["scripts/smoke-desktop-lock.mjs"]);
run("desktop-shell", process.execPath, ["scripts/smoke-desktop-shell.mjs"]);
console.log("stage3b-final-legacy-surfaces-ok", JSON.stringify({
  lockViewports: viewports.length,
  themes: themes.length,
  normalDomRawColor: audit.totals.normalDomRawColor,
  intentionalRendererRawColor: audit.totals.intentionalRendererRawColor,
  duplicateSelectors: audit.totals.duplicateSelectors
}));

function collectCssFiles(relativeDir) {
  const files = [];
  for (const entry of readdirSync(relativeDir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;
    const child = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...collectCssFiles(child));
    else if (entry.name.endsWith(".css")) files.push(child);
  }
  return files;
}

async function installLockedBridge(page) {
  await page.addInitScript(({ key }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ version: 2, scheme: "light", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" }));
    }
    window.yardimciDesktop = {
      getAppLockStatus: async () => ({ locked: true, passwordConfigured: true, notificationCount: 7 }),
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.2",
        platform: "linux",
        syncSettings: { webModuleUrl: "https://example.test/yardimci-asistan", hasSyncSecret: true },
        databasePath: "/tmp/stage3b.sqlite",
        userDataPath: "/tmp/stage3b",
        backupPath: "/tmp/stage3b/backups",
        setup: {
          setupRequired: false,
          appPasswordConfigured: true,
          businessName: "Stage 3B",
          profileId: "market",
          phone: "",
          whatsapp: "",
          email: "",
          address: "",
          webModuleUrl: "https://example.test/yardimci-asistan",
          syncSecret: "stage3b-secret",
          autoSyncEnabled: false,
          aiEnabled: false,
          aiProvider: "openai_compatible",
          aiService: "openai",
          aiProjectName: "",
          aiModel: "",
          aiBaseUrl: "https://api.openai.com/v1",
          aiTimeoutSeconds: 30,
          aiApiKeyConfigured: false,
          aiLastPublishedAt: "",
          aiProfiles: [],
          servicePreferences: { whatsapp: true, android: true },
          initialCounts: { rooms: 0, tables: 0 },
          tableCategories: []
        }
      })
    };
  }, { key: preferencesKey });
}

async function setAppearance(page, scheme, density) {
  await page.evaluate(([nextScheme, nextDensity, key]) => {
    localStorage.setItem(key, JSON.stringify({ version: 2, scheme: nextScheme, density: nextDensity, scale: 1, accent: "coral", font: "plex", motion: "system" }));
  }, [scheme, density, preferencesKey]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme);
  await expect(page.locator("html")).toHaveAttribute("data-density", density);
}

async function getOverflowMetrics(page) {
  return page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    surfaceOverflow: [...document.querySelectorAll(".app-lock-screen, .app-lock-card, .app-lock-recovery-form")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.className)
  }));
}

function run(label, command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  assert.equal(result.status, 0, `${label} smoke failed`);
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
