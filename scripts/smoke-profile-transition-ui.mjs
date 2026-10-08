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
  await page.evaluate(() => window.refreshSettings({ profileOptions: ["messaging.campaigns"], servicePreferences: { whatsapp: false, android: true } }));
  await expect(options.getByLabel("Talepler", { exact: true })).not.toBeChecked();
  const before = await page.evaluate(() => structuredClone(window.persistedSettings()));
  const beforeRuntime = await page.evaluate(() => window.fixtureRuntimeCapabilities());
  const beforeCalls = await page.evaluate(() => structuredClone(window.settingsCalls));
  // Fetch the real registry through Vite, not a second list of preset defaults.
  const registry = await page.evaluate(async sharedPath => {
    const { getBusinessProfiles, getEnabledBusinessCapabilityDependents } = await import(sharedPath);
    return getBusinessProfiles().map(profile => ({ ...profile, preview: profile.defaultOptionalCapabilities,
      choices: profile.optionalCapabilities.filter(option => getEnabledBusinessCapabilityDependents(option, profile.defaultOptionalCapabilities).length === 0) }));
  }, `/@fs/${resolve("packages/shared/types/business-capabilities.ts")}`);
  for (const profile of registry.filter(profile => profile.id !== before.profileId)) {
    await select.selectOption(profile.id);
    await expect(warning).toBeVisible();
    for (const capability of profile.optionalCapabilities) {
      const checkbox = options.locator(`input[value="${capability}"]`);
      if (profile.choices.includes(capability)) {
        await expect(checkbox).toBeDisabled();
        expect(await checkbox.isChecked()).toBe(profile.preview.includes(capability));
      } else await expect(checkbox).toHaveCount(0);
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
  await expect(options.getByLabel("Satın alma", { exact: true })).toHaveCount(0);
  await expect(options.getByLabel("Tedarikçiler", { exact: true })).toBeEnabled();
  await expect(options.getByLabel("Tedarikçiler", { exact: true })).toBeChecked();
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

  // Exercise real Settings controls for every registry option; no checkbox graph copy.
  for (const profile of registry) {
    await visit(`?profile=${profile.id}`);
    for (const feature of profile.optionalCapabilities) {
      await page.evaluate(() => window.refreshSettings({ profileOptions: [] }));
      const persisted = await page.evaluate(() => structuredClone(window.persistedSettings()));
      const calls = await page.evaluate(() => window.settingsCalls.length);
      const featureControl = options.locator(`input[value="${feature}"]`);
      await featureControl.check();
      const expected = await page.evaluate(async ({ path, id, feature }) => {
        const shared = await import(path);
        return shared.getBusinessProfileSelectionCapabilities(id, [feature]);
      }, { path: `/@fs/${resolve("packages/shared/types/business-capabilities.ts")}`, id: profile.id, feature });
      for (const option of profile.optionalCapabilities) {
        const checkbox = options.locator(`input[value="${option}"]`);
        if (option !== feature && expected.includes(option)) await expect(checkbox).toHaveCount(0);
        else expect(await checkbox.isChecked()).toBe(option === feature);
      }
      expect(await page.evaluate(() => window.persistedSettings())).toEqual(persisted);
      expect(await page.evaluate(() => window.settingsCalls.length)).toBe(calls);
      await featureControl.uncheck();
      for (const option of profile.optionalCapabilities) await expect(options.locator(`input[value="${option}"]`)).not.toBeChecked();
      await expect(save).toBeDisabled();
    }
  }
  await visit("?profile=market");
  await page.evaluate(() => window.refreshSettings({ profileOptions: [] }));
  const purchasing = options.locator('input[value="retail.purchasing"]');
  const suppliers = options.locator('input[value="retail.suppliers"]');
  await suppliers.check();
  await expect(purchasing).toHaveCount(0);
  await expect(options.getByText("Satın alma dahil", { exact: true })).toBeVisible();
  await suppliers.uncheck();
  await expect(suppliers).not.toBeChecked();
  await expect(save).toBeDisabled();
  await purchasing.check();
  await suppliers.check();
  await suppliers.uncheck();
  await expect(purchasing).toBeChecked();
  await revert.click();
  await suppliers.check();
  await save.click();
  expect(await page.evaluate(() => window.persistedSettings().profileOptions)).toEqual(["retail.suppliers"]);
  await page.evaluate(() => window.reopenSettings());
  await expect(purchasing).toHaveCount(0);
  await suppliers.uncheck();
  await expect(purchasing).not.toBeChecked();
  await revert.click();
  await expect(suppliers).toBeChecked();
  await expect(purchasing).toHaveCount(0);
  await page.evaluate(() => window.refreshSettings({ profileOptions: [] }));
  await options.locator('input[value="messaging.campaigns"]').check();
  await expect(options.locator('input[value="marketing.studio"]')).toHaveCount(0);
  await options.locator('input[value="messaging.campaigns"]').uncheck();
  await expect(options.locator('input[value="messaging.campaigns"]')).not.toBeChecked();
  await expect(save).toBeDisabled();
  await options.locator('input[value="marketing.studio"]').check();
  await options.locator('input[value="messaging.campaigns"]').check();
  await expect(options.locator('input[value="marketing.studio"]')).toHaveCount(0);
  await save.click();
  await page.evaluate(() => window.reopenSettings());
  await options.locator('input[value="messaging.campaigns"]').uncheck();
  await expect(options.locator('input[value="marketing.studio"]')).toBeChecked();
  await revert.click();
  await page.evaluate(() => window.refreshSettings({ profileOptions: [] }));
  await page.getByRole("tab", { name: "Servisler", exact: true }).click();
  await expect(page.locator("#settings-marketing-sms")).toHaveCount(0);
  await expect(page.locator("#settings-marketing-instagram")).toHaveCount(0);
  await expect(page.locator("#settings-online-delivery")).toHaveCount(0);
  await page.getByRole("tab", { name: "İşletme", exact: true }).click();
  await options.locator('input[value="messaging.campaigns"]').check();
  await options.locator('input[value="channel.online_sales"]').check();
  await save.click();
  await page.getByRole("tab", { name: "Servisler", exact: true }).click();
  await expect(page.locator("#settings-marketing-sms")).toBeVisible();
  await expect(page.locator("#settings-marketing-instagram")).toBeVisible();
  await expect(page.locator("#settings-online-delivery").getByRole("checkbox", { name: "Teslimat ve Gönderim servisi", exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => window.persistedSettings().sms.enabled)).toBe(false);
  expect(await page.evaluate(() => window.persistedSettings().instagram.enabled)).toBe(false);

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
  await page.evaluate(() => { window.saving = window.saveProfile("market"); });
  await page.evaluate(() => { window.finishProfileSave(); });
  await expectSales(true);
  await page.evaluate(() => { window.holdCapabilityRead(); window.oldRead = window.readCapabilities(); });
  await page.evaluate(() => { window.saving = window.saveProfile("restaurant"); });
  await page.evaluate(() => { window.finishProfileSave(); });
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
