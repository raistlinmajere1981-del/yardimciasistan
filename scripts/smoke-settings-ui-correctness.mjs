import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), server: { port: 0, strictPort: false } });
await server.listen();
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
  page.setDefaultTimeout(7000);
  page.setDefaultNavigationTimeout(30000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/settings-correctness-test*", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/settings-correctness-test",
    `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/settings-platform.tsx")}"></script></body></html>`) }));
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.abort());
  const visit = query => page.goto(`${server.resolvedUrls.local[0]}settings-correctness-test${query}`);
  await visit("");
  const tab = name => page.getByRole("tab", { name, exact: true });
  const assertLayout = async (rooms, tables) => {
    await expect(tab("İşletme Düzeni")).toHaveCount(rooms || tables ? 1 : 0);
    if (!rooms && !tables) {
      await expect(page.locator("#settings-panel-operations")).toHaveCount(0);
      return;
    }
    await tab("İşletme Düzeni").click();
    await expect(page.getByRole("heading", { name: "Oda Yönetimi", exact: true })).toHaveCount(rooms ? 1 : 0);
    await expect(page.getByRole("heading", { name: "Masa Yönetimi", exact: true })).toHaveCount(tables ? 1 : 0);
    if (rooms) await expect(page.getByRole("button", { name: "Oda Ekle", exact: true })).toBeEnabled();
    if (tables) await expect(page.getByRole("button", { name: "Kategori Ekle", exact: true })).toBeEnabled();
  };
  // A clean first run cannot edit layout before setup exists. The first save must
  // activate the correct resource surface without navigating away or reopening.
  for (const [query, rooms, tables] of [
    ["pension", true, false], ["restaurant", false, true], ["market", false, false],
    ["market&wholesale=on", false, false]
  ]) {
    await visit(`?profile=${query}&firstRun=on&category=operations`);
    await expect(page.locator("#settings-panel-business")).toBeVisible();
    await expect(tab("İşletme Düzeni")).toHaveCount(0);
    await expect(page.getByLabel("Firma adı", { exact: true })).toHaveValue("");
    await page.getByLabel("Firma adı", { exact: true }).fill("First-run fixture");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.persistedSettings().setupRequired)).toBe(false);
    await assertLayout(rooms, tables);
    // Assert loaded data/actions, not only headings: an empty stale controller
    // must not look like a working layout surface or silently ignore a save.
    if (rooms) {
      await page.getByRole("button", { name: "Oda Ekle", exact: true }).click();
      await page.getByRole("button", { name: "Kaydet", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(call => call.kind === "layout").length)).toBe(1);
    }
    if (tables) {
      await expect(page.getByText("Henüz masa kategorisi yok.", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Kategori Ekle", exact: true }).click();
      await page.getByLabel("Kategori adı", { exact: true }).fill("First-run salon");
      await page.getByRole("button", { name: "Kaydet", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(call => call.kind === "layout").length)).toBe(1);
    }
    await page.evaluate(() => window.reopenSettings());
    await assertLayout(rooms, tables);
    if (rooms) await expect(page.locator(".room-management-row")).toHaveCount(1);
    if (tables) await expect(page.getByLabel("Kategori adı", { exact: true })).toHaveValue("First-run salon");
  }

  await visit("?profile=restaurant&firstRun=on");
  const sector = page.getByRole("combobox", { name: /Sektör tipi/ });
  await sector.selectOption("market");
  await expect(tab("İşletme Düzeni")).toHaveCount(0);
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(sector).toHaveValue("restaurant");
  await page.getByLabel("Firma adı", { exact: true }).fill("Transition fixture");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await assertLayout(false, true);
  await tab("İşletme").click();
  await sector.selectOption("market");
  // Unsaved profile changes/revert must not replace persisted runtime authority.
  await expect(tab("İşletme Düzeni")).toBeVisible();
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(sector).toHaveValue("restaurant");
  await assertLayout(false, true);
  for (const [profileId, rooms, tables] of [["market", false, false], ["pension", true, false], ["restaurant", false, true]]) {
    await tab("İşletme").click();
    await sector.selectOption(profileId);
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.persistedSettings().profileId)).toBe(profileId);
    await assertLayout(rooms, tables);
  }

  // A late previous-profile read cannot restore its capabilities/empty draft.
  await tab("İşletme").click();
  await page.evaluate(() => {
    const read = window.yardimciDesktop.getBusinessLayout;
    window.yardimciDesktop.getBusinessLayout = async () => {
      window.yardimciDesktop.getBusinessLayout = read;
      const snapshot = await read();
      await new Promise(resolve => { window.finishOldLayoutRead = resolve; });
      return snapshot;
    };
  });
  await sector.selectOption("pension");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.finishOldLayoutRead)).toBe("function");
  await sector.selectOption("restaurant");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await assertLayout(false, true);
  await page.evaluate(async () => { window.finishOldLayoutRead(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await expect(page.getByRole("heading", { name: "Oda Yönetimi", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Kategori Ekle", exact: true }).click();
  await page.getByLabel("Kategori adı", { exact: true }).fill("Current profile salon");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.settingsCalls.filter(call => call.kind === "layout").length)).toBe(1);

  await visit("");
  const address = page.getByLabel("Adres", { exact: true });
  await address.fill("Yeni taslak adres Ankara");
  await expect(page.locator(".business-public-profile-address-lookup").getByText("Yeni taslak adres Ankara", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Adresten bul", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.settingsCalls.find(call => call.kind === "geocode")?.address)).toBe("Yeni taslak adres Ankara");
  expect(await page.evaluate(() => window.settingsCalls.filter(call => call.kind === "setup").length)).toBe(0);
  await expect(page.locator(".business-location-map-picker")).toBeVisible();
  await tab("Google Maps").click();
  await expect(page.getByLabel("Google Maps embed bağlantısı", { exact: true })).toBeVisible();
  await expect(page.getByText("Google Maps'teki Haritayı paylaş / Yerleştirme bağlantısını kullanın.", { exact: true })).toHaveCount(0);
  expect(await page.getByLabel("Google Maps embed bağlantısı", { exact: true }).evaluate(input =>
    input.getBoundingClientRect().top > input.parentElement.querySelector("span").getBoundingClientRect().bottom)).toBe(true);
  await expect(page.getByRole("button", { name: "Adresten bul", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Enlem", { exact: true })).toHaveCount(0);
  await tab("Manuel harita").click();
  await expect(page.getByLabel("Google Maps embed bağlantısı", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Enlem", { exact: true })).toBeVisible();

  for (const profile of ["market", "market&wholesale=on"]) {
    await visit(`?profile=${profile}&category=operations`);
    await expect(tab("İşletme Düzeni")).toHaveCount(0);
    await expect(page.locator("#settings-panel-business")).toBeVisible();
  }
  for (const query of ["?profile=pension", "?profile=restaurant", "?profile=pension_restaurant"]) {
    await visit(query);
    await expect(tab("İşletme Düzeni")).toBeVisible();
  }
  await visit("?profile=market");
  await page.evaluate(() => window.refreshSettings({ profileOptions: [] }));
  const options = page.locator("#settings-options");
  await expect(options.getByRole("checkbox", { name: "Pazarlama", exact: true })).not.toBeChecked();
  await options.getByRole("checkbox", { name: "WhatsApp / SMS Kampanyaları", exact: true }).check();
  await expect(options.getByRole("checkbox", { name: "Pazarlama", exact: true })).toHaveCount(0);
  await expect(options.getByText("Pazarlama dahil", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  expect(await page.evaluate(() => window.persistedSettings().profileOptions)).toEqual(["messaging.campaigns"]);
  expect(await page.evaluate(() => window.fixtureRuntimeCapabilities())).toContain("marketing.studio");
  await page.evaluate(() => window.refreshSettings({ profileOptions: ["commerce.wholesale", "channel.online_sales", "marketing.studio"], onlineSalesDeliveryEnabled: true }));
  await tab("Servisler").click();
  const web = page.locator("#settings-web");
  await expect(web.getByRole("button")).toHaveCount(1);
  await expect(web.getByRole("button", { name: "Web Bağlantısını Dene", exact: true })).toBeVisible();
  await page.evaluate(() => { window.yardimciDesktop.testMarketingWebsiteConnection = async () => { throw new Error("Legacy website test must not be called by Settings"); }; });
  await web.getByLabel("Web eşitleme adresi", { exact: true }).fill("https://draft.test/web-module/");
  await web.getByLabel("Web güvenlik anahtarı", { exact: true }).fill("draft-web-fixture-secret");
  await web.getByRole("button", { name: "Web Bağlantısını Dene", exact: true }).click();
  await expect(web.getByRole("status")).toContainText("Fixture web bağlantısı doğrulandı.");
  expect(await page.evaluate(() => window.settingsCalls.find(call => call.kind === "web-test").input)).toEqual({ baseUrl: "https://draft.test/web-module", syncSecret: "draft-web-fixture-secret" });
  expect(await page.evaluate(() => window.persistedSettings().webModuleUrl)).not.toBe("https://draft.test/web-module/");
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  const dealer = page.locator("#settings-dealer-portal");
  await expect(dealer.locator(".settings-service-card-body")).toHaveCount(0);
  await dealer.getByRole("checkbox", { name: "Bayi Web Erişimi servisi" }).check();
  await expect(dealer.locator(".settings-service-card-body")).toBeVisible();
  await dealer.getByRole("checkbox", { name: "Bayi Web Erişimi servisi" }).uncheck();
  await expect(dealer.locator(".settings-service-card-body")).toHaveCount(0);
  const delivery = page.locator("#settings-online-delivery");
  await delivery.getByRole("checkbox", { name: "Teslimat ve Gönderim servisi" }).uncheck();
  await expect(delivery.getByLabel("İşletmeden teslim", { exact: true })).toHaveCount(0);
  await delivery.getByRole("checkbox", { name: "Teslimat ve Gönderim servisi" }).check();
  await delivery.getByLabel("Kargo ile gönderim", { exact: true }).check();
  await expect(delivery.getByRole("alert")).toContainText("kargo sağlayıcısının");
  const provider = delivery.getByRole("region", { name: "Aras Kargo", exact: true });
  await expect(provider).toBeVisible();
  await expect(provider.getByRole("checkbox", { name: "Aras Kargo servisi", exact: true })).toHaveCount(0);
  await expect(provider.getByText("Yapılandırılmadı", { exact: true })).toBeVisible();
  await provider.getByLabel("Müşteri kodu", { exact: true }).fill("fixture-code");
  await provider.getByLabel("Kullanıcı adı", { exact: true }).fill("fixture-user");
  await provider.getByLabel("Şifre", { exact: true }).fill("fixture-password");
  await expect(provider.getByText("Test edilmedi", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.failShippingTest = true; });
  await provider.getByRole("button", { name: "Bağlantıyı test et", exact: true }).click();
  await expect(provider.getByRole("status")).toContainText("Fixture bağlantı hatası");
  await expect(provider.getByText("Test edilmedi", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.failShippingTest = false; });
  await provider.getByRole("button", { name: "Bağlantıyı test et", exact: true }).click();
  await expect(provider.getByText("Hazır", { exact: true })).toBeVisible();
  await provider.getByLabel("Kullanıcı adı", { exact: true }).fill("changed-user");
  await expect(provider.getByText("Test edilmedi", { exact: true })).toBeVisible();
  await delivery.getByLabel("Kargo ile gönderim", { exact: true }).uncheck();
  await expect(provider).toHaveCount(0);
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();

  const ai = page.locator("#settings-ai");
  await ai.getByRole("checkbox", { name: "AI Yardımcı servisi" }).check();
  await ai.getByLabel("Model adı", { exact: true }).fill("gpt-4.1");
  await ai.getByLabel("AI güvenlik anahtarı", { exact: true }).fill("fixture-ai-key");
  await expect(ai.getByLabel("Görsel üretim modeli", { exact: true })).toHaveValue("");
  await ai.getByLabel("Görsel üretim modeli", { exact: true }).selectOption("gpt-image-1");
  await expect(ai.getByLabel("Model adı", { exact: true })).toHaveValue("gpt-4.1");
  await ai.getByRole("button", { name: "Bağlantıyı Dene", exact: true }).click();
  await expect(ai.locator("#settings-ai-test")).toHaveClass(/sync-success/);
  await ai.getByLabel("Görsel üretim modeli", { exact: true }).selectOption("");
  await expect(ai.locator("#settings-ai-test")).toHaveClass(/sync-idle/);
  await ai.getByLabel("Model adı", { exact: true }).fill("gpt-4.2");
  await expect(ai.getByLabel("Görsel üretim modeli", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await tab("Uygulama").click();
  for (const [remote, phase, arrow] of [["2.0.1", "current", false], ["2.0.2", "current", false], ["2.0.3", "available", true]]) {
    await page.evaluate(({ remote, phase }) => { window.yardimciDesktop.checkForUpdates = async () => ({ phase, message: "Fixture version", currentVersion: "2.0.2", latestVersion: remote, defaultBaseUrl: "https://example.test/updates", customBaseUrl: "", autoCheckEnabled: true, notes: [], installSupported: true }); }, { remote, phase });
    await page.getByRole("button", { name: "Güncellemeleri Kontrol Et", exact: true }).click();
    const header = page.locator("#settings-updates .settings-panel-header");
    if (arrow) await expect(header).toContainText(`2.0.2 → ${remote}`);
    else await expect(header).not.toContainText("→");
    await expect(page.getByRole("button", { name: "Güncellemeyi İndir", exact: true })).toHaveCount(arrow ? 1 : 0);
  }
  expect(errors).toEqual([]);
  console.log("settings-ui-correctness-smoke-ok: clean first-run profiles, save/reopen, profile change/revert and late layout reads; unsaved address, map controls, capability gates, cards, independent AI models and version presentation");
} finally { await browser?.close(); await server.close(); }
