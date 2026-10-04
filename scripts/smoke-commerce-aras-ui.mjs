import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { fixtureHttp, fixtureSecretService, fixtureShippingService, testCredentials } from "./test-helpers/aras-provider-fixtures.mjs";

const require = createRequire(import.meta.url);
const { ARAS_SHIPPING_PROVIDER: provider, BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { createRuntimeOrder, listRuntimeOrders, getRuntimeOrder, saveRuntimeCatalogProduct } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const dataDir = mkdtempSync(join(tmpdir(), "yardimci-aras-ui-"));
const database = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: dataDir });
let server, browser;
try {
  database.initialize();
  const setup = { businessName: "Aras UI Fixture", profileId: "market", profileOptions: [C.WHOLESALE], phone: "", whatsapp: "", email: "", address: "",
    webModuleUrl: "https://example.test", syncSecret: "aras-ui-test-only-secret", autoSyncEnabled: false,
    aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] };
  assert.equal(database.saveInitialSetup(setup).ok, true);
  const product = saveRuntimeCatalogProduct(database.databasePath, { name: "Aras UI Product", salePrice: 10, isActive: true, trackInventory: false });
  const input = { buyerSnapshot: { name: "Shipping UI Contact", phone: "05550000000" },
    deliverySnapshot: { method: "shipping", address: { recipientName: "Shipping UI Receiver", addressLine1: "Fixture Road", district: "Central", city: "Istanbul", countryCode: "TR" } }, items: [{ productId: product.id, quantity: 1 }] };
  const shipping = createRuntimeOrder(database.databasePath, input);
  createRuntimeOrder(database.databasePath, { ...input, buyerSnapshot: { name: "Pickup UI Contact", phone: "05550000000" }, deliverySnapshot: { method: "pickup" } });
  const http = fixtureHttp(), secrets = fixtureSecretService();
  const service = fixtureShippingService(() => database, http, secrets);
  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error", server: { port: 0, strictPort: false, host: "127.0.0.1" } });
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1040 }, locale: "tr-TR" });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/aras-orders-ui", async (route) => {
    const html = await server.transformIndexHtml("/aras-orders-ui", `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/wholesale-orders-ui.tsx")}"></script></body></html>`);
    await route.fulfill({ contentType: "text/html", body: html });
  });
  await page.exposeFunction("__woCall", async (method, args) => {
    if (method === "listOrders") return listRuntimeOrders(database.databasePath, args[0]);
    if (method === "getOrder") return getRuntimeOrder(database.databasePath, args[0]);
    if (method === "listShipmentsForOrder") return database.listShipmentsForOrder(args[0]);
    if (method === "getShippingProviderConfiguration") return service.getConfiguration();
    if (method === "createShipmentForOrder") return database.createShipmentForOrder(args[0]);
    if (method === "updateShipmentStatus") return database.updateShipmentStatus(args[0]);
    if (method === "registerShipmentWithProvider") return service.registerShipment(args[0]);
    if (method === "refreshShipmentProviderStatus") return service.refreshShipmentStatus(args[0]);
    throw new Error(`Unexpected fixture method ${method}`);
  });
  await page.addInitScript(() => { window.__woInitial = { customers: [], products: [] }; });
  const baseUrl = server.resolvedUrls.local[0];
  await page.goto(`${baseUrl}aras-orders-ui`);
  const card = (name) => page.locator(".market-order-card").filter({ hasText: name });
  await card("Pickup UI Contact").click();
  await expect(page.getByRole("region", { name: "Gönderim", exact: true })).toHaveCount(0);
  await card("Shipping UI Contact").click();
  const section = page.getByRole("region", { name: "Gönderim", exact: true });
  await section.getByRole("button", { name: "Gönderi oluştur", exact: true }).click();
  const register = section.getByRole("button", { name: `${provider.name} ile oluştur`, exact: true });
  await expect(register).toBeDisabled();
  await expect(section).toContainText(`${provider.name} yapılandırılmamış`);
  assert.equal(http.calls.length, 0);
  const config = { ...testCredentials, enabled: true };
  database.saveInitialSetup({ ...setup, arasShipping: { ...config, password: "" } }, undefined, undefined, secrets.createShippingSecretWrite(config));
  await page.evaluate(() => window.__woEmitShippingConfiguration());
  await expect(register).toBeEnabled();
  await register.click();
  await expect(section).toContainText(`Sağlayıcı: ${provider.name}`);
  await expect(section.getByText("Taslak", { exact: true })).toBeVisible();
  await expect(register).toHaveCount(0);
  await expect(section.getByRole("button", { name: "İptal", exact: true })).toHaveCount(0);
  const refresh = section.getByRole("button", { name: "Durumu güncelle", exact: true });
  await expect(refresh).toBeVisible();
  http.state.status = "TRANSFERDE";
  await refresh.click();
  await expect(section.getByText("Gönderildi", { exact: true })).toBeVisible();
  await expect(section).toContainText("Takip: 1234567890123");
  await expect(section).toContainText("https://kargotakip.araskargo.com.tr/");
  http.state.status = "TESLİM EDİLDİ";
  await refresh.click();
  await expect(section.getByText("Teslim edildi", { exact: true })).toBeVisible();
  assert.equal(database.listShipmentsForOrder(shipping.order.id).length, 1);
  assert.equal(http.calls.filter((call) => call.operation === "SetOrder").length, 1);
  assert.equal(database.getCommerceOrder(shipping.order.id).order.status, "placed");
  await page.evaluate(() => window.__woDispose());
  assert.deepEqual(errors, []);

  const settingsPage = await browser.newPage({ viewport: { width: 1440, height: 1040 }, locale: "tr-TR" });
  settingsPage.setDefaultTimeout(10000);
  settingsPage.on("pageerror", (error) => errors.push(error.message));
  await settingsPage.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, (route) => route.abort());
  await settingsPage.route("**/aras-settings-ui", async (route) => {
    const html = await server.transformIndexHtml("/aras-settings-ui", `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/settings-platform.tsx")}"></script></body></html>`);
    await route.fulfill({ contentType: "text/html", body: html });
  });
  await settingsPage.goto(`${baseUrl}aras-settings-ui`);
  await settingsPage.evaluate(() => window.refreshSettings({ profileId: "market", profileOptions: ["commerce.wholesale"] }));
  await settingsPage.getByRole("tab", { name: /^Servisler/ }).click();
  const settingsSection = settingsPage.getByRole("region", { name: provider.name, exact: true });
  await expect(settingsSection.getByText("Kapalı", { exact: true }).first()).toBeVisible();
  const connectionTest = settingsSection.getByRole("button", { name: "Bağlantıyı test et", exact: true });
  await expect(connectionTest).toHaveCount(0);
  async function fillConfiguration() {
    await settingsSection.getByRole("checkbox", { name: `${provider.name} servisi`, exact: true }).check();
    await settingsSection.getByLabel("Müşteri kodu", { exact: true }).fill("fixture-account");
    await settingsSection.getByLabel("Kullanıcı adı", { exact: true }).fill("fixture-user");
    await settingsSection.getByLabel("Şifre", { exact: true }).fill("fixture-write-only-password");
  }
  await fillConfiguration();
  await settingsPage.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(settingsSection.getByLabel("Şifre", { exact: true })).toHaveCount(0);
  await expect(connectionTest).toHaveCount(0);
  await fillConfiguration();
  await connectionTest.click();
  await expect(settingsSection.getByRole("status")).toContainText("Fixture kargo bağlantısı doğrulandı.");
  assert.equal(await settingsPage.evaluate(() => window.settingsCalls.filter((call) => call.kind === "setup").length), 0);
  await settingsPage.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(settingsSection.getByText("Etkin · Yapılandırılmış", { exact: true })).toBeVisible();
  await expect(settingsSection.getByLabel("Şifre", { exact: true })).toHaveValue("");
  const savedConfig = await settingsPage.evaluate(() => window.yardimciDesktop.getSetupData());
  assert.ok(!JSON.stringify(savedConfig).includes("fixture-write-only-password"));
  assert.equal(savedConfig.arasShipping.hasSecret, true);
  await settingsSection.getByLabel("Ortam", { exact: true }).selectOption("production");
  await settingsPage.getByRole("button", { name: "Kaydet", exact: true }).click();
  const calls = await settingsPage.evaluate(() => window.settingsCalls.filter((call) => call.kind === "setup"));
  assert.equal(calls.at(-1).input.arasShipping.password, "");
  assert.equal(calls.at(-1).input.arasShipping.environment, "production");
  assert.deepEqual(errors, []);
  console.log("commerce-aras-ui-smoke-ok");
} finally {
  await browser?.close(); await server?.close(); database.close(); rmSync(dataDir, { recursive: true, force: true });
}
