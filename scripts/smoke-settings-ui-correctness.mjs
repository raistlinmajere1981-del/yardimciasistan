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
  for (const query of ["?profile=pension", "?profile=restaurant", "?profile=market&tables=on"]) {
    await visit(query);
    await expect(tab("İşletme Düzeni")).toBeVisible();
  }
  await visit("?profile=market");
  await page.evaluate(() => window.refreshSettings({ profileOptions: [] }));
  const options = page.locator("#settings-options");
  await expect(options.getByRole("checkbox", { name: "Pazarlama", exact: true })).not.toBeChecked();
  await options.getByRole("checkbox", { name: "WhatsApp / SMS Kampanyaları", exact: true }).check();
  await expect(options.getByRole("checkbox", { name: "Pazarlama", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  expect(await page.evaluate(() => window.persistedSettings().profileOptions)).toEqual(["messaging.campaigns"]);
  expect(await page.evaluate(() => window.requiredCapabilities())).not.toContain("marketing.studio");
  await page.evaluate(() => window.refreshSettings({ profileOptions: ["commerce.wholesale", "channel.online_sales", "marketing.studio"] }));
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
  console.log("settings-ui-correctness-smoke-ok: unsaved address, map controls, capability gates, cards, independent AI models and version presentation");
} finally { await browser?.close(); await server.close(); }
