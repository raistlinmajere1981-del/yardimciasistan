import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), server: { port: 0 } });
await server.listen();
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/profile-transition-test*", async route => {
    const fixture = new URL(route.request().url()).searchParams.has("runtime")
      ? "profile-transition-runtime" : "settings-platform";
    await route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/profile-transition-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve(`scripts/fixtures/${fixture}.tsx`)}"></script></body></html>`) });
  });
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.abort());
  const visit = query => page.goto(`${server.resolvedUrls.local[0]}profile-transition-test${query}`);
  await visit("?profile=pension");
  const select = page.getByRole("combobox", { name: /Sektör tipi/ });
  const options = page.locator("#settings-options");
  const save = page.getByRole("button", { name: "Kaydet", exact: true });
  const revert = page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true });
  const warning = page.getByText("İşletme tipi değiştirildi. Kaydettiğinizde yeni işletme tipinin varsayılan özellikleri uygulanacak.", { exact: true });
  await page.evaluate(() => window.refreshSettings({ profileOptions: ["messaging.campaigns"], servicePreferences: { whatsapp: false, android: true }, productData: { ...window.persistedSettings().productData, enabled: true } }));
  await expect(options.getByLabel("Talepler", { exact: true })).not.toBeChecked();
  const before = await page.evaluate(() => structuredClone(window.persistedSettings()));
  const beforeRuntime = await page.evaluate(() => window.fixtureRuntimeCapabilities());
  const beforeCalls = await page.evaluate(() => structuredClone(window.settingsCalls));
  // Fetch the real registry through Vite, not a second list of preset defaults.
  const registry = await page.evaluate(async sharedPath => {
    const shared = await import("/src/app/setup-model.ts");
    const { getBusinessProfiles } = await import(sharedPath);
    return getBusinessProfiles().map(profile => ({ ...profile, preview: shared.createProfileOptionDefaults(profile.id) }));
  }, `/@fs/${resolve("packages/shared/types/business-capabilities.ts")}`);
  for (const profile of registry.filter(profile => profile.id !== before.profileId)) {
    await select.selectOption(profile.id);
    await expect(warning).toBeVisible();
    for (const capability of profile.optionalCapabilities) {
      const checkbox = options.locator(`input[value="${capability}"]`);
      await expect(checkbox).toBeDisabled();
      expect(await checkbox.isChecked()).toBe(profile.preview.includes(capability));
    }
    expect(await page.evaluate(() => window.persistedSettings())).toEqual(before);
    expect(await page.evaluate(() => window.fixtureRuntimeCapabilities())).toEqual(beforeRuntime);
    expect(await page.evaluate(() => window.settingsCalls)).toEqual(beforeCalls);
  }
  await revert.click();
  await expect(select).toHaveValue(before.profileId);
  await expect(warning).toHaveCount(0);
  await expect(options.getByLabel("WhatsApp / SMS Kampanyaları", { exact: true })).toBeChecked();
  expect(await page.evaluate(() => window.persistedSettings())).toEqual(before);
  expect(await page.evaluate(() => window.fixtureRuntimeCapabilities())).toEqual(beforeRuntime);
  expect(await page.evaluate(() => window.settingsCalls)).toEqual(beforeCalls);

  await select.selectOption("market");
  await page.evaluate(() => { window.failSetup = true; });
  await save.click();
  await expect(warning).toBeVisible();
  expect(await page.evaluate(() => window.persistedSettings())).toEqual(before);
  await page.evaluate(() => { window.failSetup = false; });
  await save.click();
  await expect(warning).toHaveCount(0);
  await expect(options.getByLabel("Satın alma", { exact: true })).toBeEnabled();
  await expect(options.getByLabel("Satın alma", { exact: true })).toBeChecked();
  await expect(options.getByLabel("WhatsApp / SMS Kampanyaları", { exact: true })).not.toBeChecked();
  await options.getByLabel("WhatsApp / SMS Kampanyaları", { exact: true }).check();
  await save.click();
  await select.selectOption("pension");
  await save.click();
  await expect(options.getByLabel("Talepler", { exact: true })).toBeChecked();
  await expect(options.getByLabel("WhatsApp / SMS Kampanyaları", { exact: true })).not.toBeChecked();

  // Matrix navigation uses canonical capability sets; changing profile labels cannot affect it.
  const navigation = await page.evaluate(async registry => {
    const { buildNavigation } = await import("/src/app/navigation.ts");
    return registry.map(profile => ({ profile: profile.id,
      defaults: buildNavigation({ enabledCapabilities: profile.defaultCapabilities }).map(item => item.id),
      renamed: buildNavigation({ profileId: "not-a-profile", enabledCapabilities: profile.defaultCapabilities }).map(item => item.id) }));
  }, registry);
  for (const row of navigation) {
    expect(row.defaults).toEqual(row.renamed);
    const capabilities = registry.find(profile => profile.id === row.profile).defaultCapabilities;
    for (const [surface, capability] of [["pension", "accommodation.rooms"], ["restaurant", "food_service.tables"],
      ["menu", "food_service.menu"], ["marketing", "marketing.studio"]]) {
      expect(row.defaults.includes(surface)).toBe(capabilities.includes(capability));
    }
    for (const surface of ["dashboard", "customerWork", "calendar", "reports", "settings"]) expect(row.defaults).toContain(surface);
  }

  await visit("?runtime");
  const runtime = page.getByLabel("Runtime profile", { exact: true });
  const nav = page.getByLabel("Runtime navigation", { exact: true });
  const expectSales = visible => expect.poll(async () => (await nav.textContent()).split(",").includes("market")).toBe(visible);
  await expect(runtime).toHaveText("pension");
  await expectSales(false);
  await page.evaluate(() => { window.holdCapabilityRead(); window.oldRead = window.readCapabilities(); });
  await page.evaluate(() => { window.saving = window.saveProfile("market"); });
  await expect(runtime).toHaveText("pension");
  await page.evaluate(() => { window.releaseCapabilityRead(); });
  await expect(runtime).toHaveText("pension");
  await page.evaluate(() => { window.finishProfileSave(); });
  await expect(runtime).toHaveText("market");
  await expectSales(true);
  await expect(nav).not.toContainText("pension");
  // The older read returns AFTER a successful canonical refresh as well.
  await page.evaluate(() => { window.holdCapabilityRead(); window.oldRead = window.readCapabilities(); window.saving = window.saveProfile("restaurant"); });
  await page.evaluate(() => { window.finishProfileSave(); });
  await expect(runtime).toHaveText("restaurant");
  await expectSales(false);
  await page.evaluate(async () => { window.releaseCapabilityRead(); await window.oldRead; });
  await expect(runtime).toHaveText("restaurant");
  await expectSales(false);
  await expect(nav).not.toContainText("pension");
  // A capability removal also fences a previously captured eligible Sales response.
  await page.evaluate(async () => {
    await window.changeRuntimeCapability("commerce.orders", true);
    await window.changeRuntimeCapability("commerce.wholesale", true);
  });
  await expectSales(true);
  await page.evaluate(() => { window.holdCapabilityRead(); window.oldRead = window.readCapabilities(); });
  await page.evaluate(async () => { await window.changeRuntimeCapability("commerce.wholesale", false); });
  await expectSales(false);
  await page.evaluate(async () => { window.releaseCapabilityRead(); await window.oldRead; });
  await expectSales(false);
  await page.evaluate(() => { window.saving = window.saveProfile("market", true); });
  await page.evaluate(() => { window.finishProfileSave(); });
  await expect(runtime).toHaveText("restaurant");
  await page.evaluate(() => { window.failCapabilityRefresh(); window.saving = window.saveProfile("market"); });
  await page.evaluate(() => { window.finishProfileSave(); });
  await expect(runtime).toHaveText("unavailable");
  await expect(nav).not.toContainText("restaurant");
  expect(errors).toEqual([]);
  console.log("profile-transition-ui-smoke-ok: registry previews, disabled controls, revert, save, navigation, stale reads and fail-closed refresh");
} finally { await browser?.close(); await server.close(); }
