import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { saveRuntimeCatalogProduct, listRuntimeCatalogProducts } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { applyBusinessProfileCapabilities } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { toggleBusinessProfileOption } = require("../packages/shared/dist");
const root = mkdtempSync(join(tmpdir(), "ya-online-catalog-ui-"));
const appPath = join(process.cwd(), "apps/desktop-app");
const database = new DesktopDatabase({ appPath, userDataPath: root });
let server, browser, raw;
function selectOnlineSales(enabled) {
  const current = database.getSetupData();
  const saved = database.saveInitialSetup(createSmokeSetupInput({ ...current,
    profileOptions: toggleBusinessProfileOption(current.profileId, current.profileOptions, "channel.online_sales", enabled) }));
  assert.equal(saved.ok, true, saved.message);
}
try {
  database.initialize();
  assert.equal(database.saveInitialSetup({
    businessName: "Catalog UI", profileId: "market", profileOptions: ["channel.online_sales"], phone: "", whatsapp: "", email: "", address: "",
    webModuleUrl: "https://catalog.example.test", syncSecret: "online-catalog-ui-secret", autoSyncEnabled: false,
    aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: []
  }).ok, true);
  const product = saveRuntimeCatalogProduct(database.databasePath, { name: "Publication UI product", salePrice: 25, currency: "TRY", unit: "piece", trackInventory: false, isActive: true });
  server = await createServer({ root: appPath, configFile: join(appPath, "vite.renderer.config.ts"), logLevel: "error",
    server: { host: "127.0.0.1", port: 0 }, plugins: [{ name: "online-catalog-ui-smoke", configureServer(instance) {
      instance.middlewares.use("/online-catalog-ui-smoke", async (_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(await instance.transformIndexHtml("/online-catalog-ui-smoke", `<!doctype html><html lang="tr"><body><div id="root"></div><script type="module" src="/@fs/${join(process.cwd(), "scripts/fixtures/online-catalog-ui.tsx")}"></script></body></html>`));
      });
    }}] });
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let saves = 0;
  const createdProducts = [];
  let failSave = false;
  await page.exposeFunction("__publicationCall", (method, input) => {
    if (method === "create") { const saved = saveRuntimeCatalogProduct(database.databasePath, input); createdProducts.push(saved); return saved; }
    if (method === "get") return database.getCommerceProductPublication(input);
    if (method === "save") {
      saves++;
      if (failSave) throw new Error("Fixture publication failure");
      return database.saveCommerceProductPublication(input);
    }
    throw new Error("Unexpected fixture bridge call");
  });
  await page.addInitScript((product) => {
    window.__product = product;
    window.yardimciDesktop = { commerce: {
      saveProduct: (input) => window.__publicationCall("create", input),
      getProductPublication: (id) => window.__publicationCall("get", id),
      saveProductPublication: (input) => window.__publicationCall("save", input)
    } };
  }, product);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/online-catalog-ui-smoke`);
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "Web satışında yayınla", exact: true });
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).toBeChecked();
  assert.equal(database.getCommerceProductPublication(product.id).isPublished, true);
  await expect(checkbox).toBeChecked();
  await expect.poll(() => database.getCommerceProductPublication(product.id)?.isPublished).toBe(true);
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await expect(checkbox).toHaveCount(0);
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(checkbox).toBeChecked();
  failSave = true;
  await checkbox.click();
  await expect(page.getByRole("status").filter({ hasText: "Web yayın tercihi kaydedilemedi" })).toBeVisible();
  await expect(checkbox).toBeChecked();
  assert.equal(database.getCommerceProductPublication(product.id).isPublished, true);
  failSave = false;
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  await expect.poll(() => database.getCommerceProductPublication(product.id).isPublished).toBe(false);
  const beforeToggleSaves = saves;
  selectOnlineSales(false);
  await page.evaluate(() => window.__onlineToggle(false));
  await expect(checkbox).toHaveCount(0);
  assert.equal(saves, beforeToggleSaves, "hiding control must not rewrite the preference");
  selectOnlineSales(true);
  await page.evaluate(() => window.__onlineToggle(true));
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  for (const optOut of [false, true]) {
    await page.getByRole("button", { name: "Ürün Ekle", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Yeni ürün ekle", exact: true });
    const createCheckbox = create.getByRole("checkbox", { name: "Web satışında yayınla", exact: true });
    await expect(createCheckbox).toBeChecked();
    if (optOut) await createCheckbox.uncheck();
    await create.getByLabel("Ürün adı", { exact: true }).fill(optOut ? "Created unpublished" : "Created published");
    await create.getByLabel("Satış fiyatı", { exact: true }).fill("25");
    await create.getByLabel("Alış fiyatı", { exact: true }).fill("10");
    await create.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
    await expect(create).toHaveCount(0);
    const saved = createdProducts.at(-1);
    assert.equal(database.getCommerceProductPublication(saved.id).isPublished, !optOut);
    if (optOut) await expect(checkbox).not.toBeChecked();
    else await expect(checkbox).toBeChecked();
    assert.equal(database.createCommerceOnlineCatalog().products.some((entry) => entry.productId === saved.id), !optOut);
    await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  }
  selectOnlineSales(false);
  await page.evaluate(() => window.__onlineToggle(false));
  await page.getByRole("button", { name: "Ürün Ekle", exact: true }).click();
  const offlineCreate = page.getByRole("dialog", { name: "Yeni ürün ekle", exact: true });
  await expect(offlineCreate.getByRole("checkbox", { name: "Web satışında yayınla" })).toHaveCount(0);
  await offlineCreate.getByLabel("Ürün adı", { exact: true }).fill("Created offline");
  await offlineCreate.getByLabel("Satış fiyatı", { exact: true }).fill("25");
  await offlineCreate.getByLabel("Alış fiyatı", { exact: true }).fill("10");
  await offlineCreate.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(offlineCreate).toHaveCount(0);
  selectOnlineSales(true);
  assert.equal(database.getCommerceProductPublication(createdProducts.at(-1).id), null);
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  applyBusinessProfileCapabilities(database.databasePath, "restaurant", { preserveUserOverrides: false });
  selectOnlineSales(true);
  raw = new DatabaseSync(database.databasePath);
  raw.exec("UPDATE settings SET online_sales_delivery_enabled = 1, online_sales_pickup_enabled = 1, online_sales_shipping_enabled = 0");
  const category = database.saveMenuCategory({ name: "Restaurant menu", description: "", is_active: true, sort_order: 0 });
  assert.equal(category.ok, true, category.message);
  const menuResult = database.saveMenuProductEntry({ product: { name: "Restaurant menu product", salePrice: 42, trackInventory: false, onlineSalesPublished: false },
    category_id: category.savedId, price_override: null, is_available: true, is_featured: false,
    allergens: [], tags: [], stock_consumption_quantity: 1, hide_when_out_of_stock: false, sort_order: 0 });
  assert.equal(menuResult.ok, true, menuResult.message);
  const menuData = database.getDashboardData();
  const menuProductId = menuData.menu.items.find(item => item.id === menuResult.savedId).product_id;
  const menuProduct = listRuntimeCatalogProducts(database.databasePath).find(item => item.id === menuProductId);
  const countBeforePublish = listRuntimeCatalogProducts(database.databasePath).length;
  await page.addInitScript(({ menuData, menuProduct }) => { window.__menuData = menuData; window.__product = menuProduct; }, { menuData, menuProduct });
  await page.reload();
  await page.getByRole("button", { name: "Menü Ürününü Aç", exact: true }).click();
  await expect(page.getByRole("button", { name: "Menü Sunumunu Kaydet", exact: true })).toBeVisible();
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect.poll(() => database.createCommerceOnlineCatalog().products.some(item => item.productId === menuProductId)).toBe(true);
  assert.equal(listRuntimeCatalogProducts(database.databasePath).length, countBeforePublish, "Menu publication must not insert another product row");
  selectOnlineSales(false);
  await page.evaluate(() => window.__onlineToggle(false));
  await expect(checkbox).toHaveCount(0);
  assert.equal(database.createCommerceOnlineCatalog().enabled, false);
  assert.deepEqual(errors, []);
  console.log("commerce-online-catalog-ui-smoke-ok");
} finally { await browser?.close(); await server?.close(); raw?.close(); database.close(); rmSync(root, { recursive: true, force: true }); }
