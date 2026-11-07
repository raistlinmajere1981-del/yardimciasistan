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
const { saveRuntimeCatalogProduct, listRuntimeCatalogProducts, getRuntimeInventoryBalance, listRuntimeInventoryMovements, setRuntimeInventoryCount } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { prepareProductDetailsSave, saveProductDetails } = require("../apps/desktop-app/dist-electron/commerce-product-save.js");
const { listProductPhotos } = require("../apps/desktop-app/dist-electron/product-photo-store.js");
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
  const connectedSetup = database.getSetupData();
  assert.equal(connectedSetup.webModuleUrl, "https://catalog.example.test");
  assert.equal(connectedSetup.syncSecret, "online-catalog-ui-secret");
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
  let publicationReads = 0;
  const createdProducts = [];
  let failSave = false;
  await page.exposeFunction("__publicationCall", async (method, input) => {
    if (method === "photos") return listProductPhotos(database.databasePath, input);
    if (method === "details") {
      saves++;
      if (failSave) throw new Error("Fixture publication failure");
      const result = saveProductDetails(database.databasePath, await prepareProductDetailsSave(database.databasePath, input));
      if (!input.product.id) createdProducts.push(result.product);
      return result;
    }
    if (method === "create") { const saved = saveRuntimeCatalogProduct(database.databasePath, input); createdProducts.push(saved); return saved; }
    if (method === "list") return listRuntimeCatalogProducts(database.databasePath, input);
    if (method === "get") { publicationReads++; return database.getCommerceProductPublication(input); }
    if (method === "save") {
      saves++;
      if (failSave) throw new Error("Fixture publication failure");
      return database.saveCommerceProductPublication(input);
    }
    throw new Error("Unexpected fixture bridge call");
  });
  await page.addInitScript(setup => { window.__setup = setup; }, connectedSetup);
  await page.addInitScript((product) => {
    window.__product = product;
    window.yardimciDesktop = { commerce: {
      listProducts: input => window.__publicationCall("list", input),
      saveProduct: (input) => window.__publicationCall("create", input),
      saveProductDetails: input => window.__publicationCall("details", input),
      listProductPhotos: id => window.__publicationCall("photos", id),
      getProductPublication: (id) => window.__publicationCall("get", id),
      saveProductPublication: (input) => window.__publicationCall("save", input)
    } };
  }, product);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/online-catalog-ui-smoke`);
  const bulkPublish = page.locator(".market-product-bulk-actions").getByRole("button", { name: "Webde yayınla", exact: true, includeHidden: true });
  await expect(bulkPublish).toHaveCount(1);
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
  const featuredToggle = page.getByRole("checkbox", { name: "Vitrinde göster", exact: true });
  const featuredRank = page.getByLabel("Vitrin sırası", { exact: true });
  await expect(featuredToggle).not.toBeChecked();
  await featuredToggle.check();
  await featuredRank.fill("9");
  assert.equal(database.getCommerceProductPublication(product.id).isFeatured, false, "vitrin selection must remain a local draft");
  await page.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  assert.equal(database.getCommerceProductPublication(product.id).isFeatured, true);
  assert.equal(database.getCommerceProductPublication(product.id).featuredOrder, 9);
  assert.equal(database.createCommerceOnlineCatalog().products.find(p=>p.productId===product.id)?.isFeatured,true);
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(featuredToggle).toBeChecked();
  await expect(featuredRank).toHaveValue("9");
  failSave = true;
  const beforePublicationDraft = saves;
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  assert.equal(saves, beforePublicationDraft, "publication checkbox stages locally");
  await page.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Fixture publication failure");
  await expect(checkbox).not.toBeChecked();
  assert.equal(database.getCommerceProductPublication(product.id).isPublished, true);
  failSave = false;
  await page.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(checkbox).toHaveCount(0);
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  assert.equal(database.getCommerceProductPublication(product.id).isPublished, false);
  // Persisted online-sales selection alone must not expose publication controls.
  const beforeWebOff = { saves, publicationReads };
  const disconnected = database.saveInitialSetup(createSmokeSetupInput({ ...database.getSetupData(), webModuleUrl: "", syncSecret: "", autoSyncEnabled: false }));
  assert.equal(disconnected.ok, true, disconnected.message);
  await page.evaluate(setup => window.__webSetupChanged(setup), database.getSetupData());
  await expect(checkbox).toHaveCount(0);
  await expect(bulkPublish).toHaveCount(0);
  assert.deepEqual({ saves, publicationReads }, beforeWebOff, "Web off must not read or rewrite publication preferences");
  assert.equal(database.getCommerceProductPublication(product.id).isPublished, false);
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await page.getByRole("button", { name: "Yeni ürün", exact: true }).click();
  await expect(checkbox).toHaveCount(0);
  await expect(page.getByText("İlk kayıttan sonra en fazla 12 fotoğrafı sıralayıp kapak seçebilirsiniz.")).toHaveCount(0);
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  const reconnected = database.saveInitialSetup(createSmokeSetupInput(connectedSetup));
  assert.equal(reconnected.ok, true, reconnected.message);
  await page.evaluate(setup => window.__webSetupChanged(setup), database.getSetupData());
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
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
    await page.getByRole("button", { name: "Yeni ürün", exact: true }).click();
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
    const detail = page.getByRole("dialog", { name: saved.name, exact: true });
    await expect(detail).toHaveCount(0);
    await page.locator('.market-catalog-record[data-sort-kind="products"]').filter({hasText: saved.name}).getByRole("button").filter({hasText:saved.name}).click();
    if (optOut) await expect(checkbox).not.toBeChecked();
    else await expect(checkbox).toBeChecked();
    assert.equal(database.createCommerceOnlineCatalog().products.some((entry) => entry.productId === saved.id), !optOut);
    await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  }
  selectOnlineSales(false);
  await page.evaluate(() => window.__onlineToggle(false));
  await page.getByRole("button", { name: "Yeni ürün", exact: true }).click();
  const offlineCreate = page.getByRole("dialog", { name: "Yeni ürün ekle", exact: true });
  await expect(offlineCreate.getByRole("checkbox", { name: "Web satışında yayınla" })).toHaveCount(0);
  await offlineCreate.getByLabel("Ürün adı", { exact: true }).fill("Created offline");
  await offlineCreate.getByLabel("Satış fiyatı", { exact: true }).fill("25");
  await offlineCreate.getByLabel("Alış fiyatı", { exact: true }).fill("10");
  await offlineCreate.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(offlineCreate).toHaveCount(0);
  selectOnlineSales(true);
  assert.equal(database.getCommerceProductPublication(createdProducts.at(-1).id), null);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Exercise the real detail editor against the same temporary database. Counting
  // inventory and product edits commit together through the footer Save.
  selectOnlineSales(true);
  const stockProduct = saveRuntimeCatalogProduct(database.databasePath, {
    name: "Hybrid stock product", salePrice: 25, purchasePrice: 10, trackInventory: true,
    minimumQuantity: 2, imageAssetPath: "test-preview.png"
  });
  setRuntimeInventoryCount(database.databasePath, { productId: stockProduct.id, countedQuantity: 10 });
  const detailCalls = [];
  const detailPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await detailPage.addInitScript(setup => { window.__setup = setup; }, database.getSetupData());
  detailPage.on("pageerror", error => errors.push(error.message));
  await detailPage.exposeFunction("__detailCall", async (method, input) => {
    detailCalls.push(method);
    if (method === "save") return saveProductDetails(database.databasePath, await prepareProductDetailsSave(database.databasePath, input));
    if (method === "photos") return { ...listProductPhotos(database.databasePath, input), sourceUrl: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="1000"><rect width="360" height="1000" fill="green"/></svg>') };
    if (method === "list") return listRuntimeCatalogProducts(database.databasePath, input);
    if (method === "balance") return getRuntimeInventoryBalance(database.databasePath, input);
    if (method === "movements") return listRuntimeInventoryMovements(database.databasePath, input);
    if (method === "count") return setRuntimeInventoryCount(database.databasePath, input);
    if (method === "publication") return database.getCommerceProductPublication(input);
    if (method === "publish") return database.saveCommerceProductPublication(input);
    throw new Error(`Unexpected detail bridge call: ${method}`);
  });
  await detailPage.addInitScript((product) => {
    window.__product = product;
    window.__inventoryEnabled = true;
    window.yardimciDesktop = { commerce: {
      listProducts: input => window.__detailCall("list", input),
      saveProductDetails: input => window.__detailCall("save", input),
      getInventoryBalance: id => window.__detailCall("balance", id),
      listInventoryMovements: input => window.__detailCall("movements", input),
      setInventoryCount: input => window.__detailCall("count", input),
      getProductPublication: id => window.__detailCall("publication", id),
      saveProductPublication: input => window.__detailCall("publish", input),
      listProductPhotos: id => window.__detailCall("photos", id),
      previewProductPhoto: async () => "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="1000"><rect width="360" height="1000" fill="green"/></svg>'),
      getProductImageDataUrl: async () => "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="1000"><rect width="360" height="1000" fill="green"/></svg>')
    } };
  }, { ...stockProduct, imageAssetPath: "test-preview.png" });
  await detailPage.goto(`http://127.0.0.1:${server.httpServer.address().port}/online-catalog-ui-smoke`);
  await detailPage.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  const detail = detailPage.locator("dialog.product-workspace-frame");
  await expect(detail.locator('.product-workspace-actions').getByRole('button', { name: 'Ürünü Kaydet', exact: true })).toBeInViewport();
  await expect(detail.locator('.product-workspace-actions').getByRole('button', { name: 'Değişiklikleri Geri Al', exact: true })).toBeVisible();
  const fields = detail.getByRole("region", { name: "Ürün detayları", exact: true });
  const rail = detail.getByRole("complementary", { name: "Ürün işlemleri", exact: true });
  for (const title of ["Ürün bilgileri", "Fiyatlandırma", "Açıklama"]) {
    await expect(fields.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
  }
  await expect(fields.getByLabel("Ürün adı", { exact: true })).toHaveValue(stockProduct.name);
  const railScroll = await rail.evaluate(element => element.scrollTop);
  await fields.getByRole("textbox", { name: "Açıklama", exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await rail.evaluate(element => element.scrollTop), railScroll, "Product fields scroll independently of operations.");
  await rail.getByRole("button", { name: "Stok taslağını temizle", exact: true }).scrollIntoViewIfNeeded();
  await expect(rail.getByRole("button", { name: "Stok taslağını temizle", exact: true })).toBeInViewport();
  for (const name of ["Aktif ürün", "Stok takibi", "Hızlı erişim", "Web satışında yayınla"]) {
    await rail.getByRole("checkbox", { name, exact: true }).scrollIntoViewIfNeeded();
    await expect(rail.getByRole("checkbox", { name, exact: true })).toBeInViewport();
  }
  await expect(detail.getByRole("button", { name: "Ürünü Kaydet", exact: true })).toBeInViewport();
  const image = rail.locator(".market-product-image-card img");
  await image.scrollIntoViewIfNeeded();
  for (const dimensions of [[360, 1000], [1200, 400]]) {
    await image.evaluate((element, [width, height]) => {
      element.src = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="green"/></svg>`);
    }, dimensions);
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalHeight > 0)).toBe(true);
    assert.equal(await image.evaluate(element => {
      const frame = element.parentElement.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      return getComputedStyle(element).objectFit === "contain" && bounds.height <= frame.height && bounds.width <= frame.width;
    }), true, "Portrait and landscape previews must fit a bounded, non-cropping frame.");
  }
  await rail.getByLabel("Stok işlemi", { exact: true }).selectOption("count");
  await rail.getByLabel("Stok işlem miktarı", { exact: true }).fill("12");
  await expect(fields.getByLabel("Ürün adı", { exact: true })).toBeEnabled();
  await expect(detail.getByRole("button", { name: "Ürünü Kaydet", exact: true })).toBeEnabled();
  await expect(detail.getByRole("button", { name: "Çalışma alanını kapat", exact: true })).toBeDisabled();
  assert.equal(getRuntimeInventoryBalance(database.databasePath, stockProduct.id).quantity, 10);
  assert.equal(detailCalls.filter(method => method === "save").length, 0);
  await fields.getByLabel("Ürün adı", { exact: true }).fill("Hybrid saved product");
  await expect(rail.getByLabel("Stok işlem miktarı", { exact: true })).toBeEnabled();
  await expect(detail.getByRole("button", { name: "Stok Hareketleri", exact: true })).toBeEnabled();
  await detail.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await detailPage.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(detail.getByRole("heading", { name: "Hybrid saved product", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Ürünü Kaydet", exact: true })).toBeDisabled();
  assert.equal(listRuntimeCatalogProducts(database.databasePath).items.find(product => product.id === stockProduct.id).name, "Hybrid saved product");
  assert.equal(getRuntimeInventoryBalance(database.databasePath, stockProduct.id).quantity, 12);
  assert.equal(detailCalls.filter(method => method === "count").length, 0);
  assert.equal(detailCalls.filter(method => method === "save").length, 1);
  await fields.getByLabel("Ürün adı", { exact: true }).fill("Discard this draft");
  await detail.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(fields.getByLabel("Ürün adı", { exact: true })).toHaveValue("Hybrid saved product");
  for (const width of [820, 480]) {
    await detailPage.setViewportSize({ width, height: 900 });
    await fields.getByRole("textbox", { name: "Açıklama", exact: true }).scrollIntoViewIfNeeded();
    await expect(detail.getByRole("button", { name: "Ürünü Kaydet", exact: true })).toBeInViewport();
    assert.equal(await detail.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
    assert.equal(await detailPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  }
  await detailPage.close();

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
  const menuProduct = listRuntimeCatalogProducts(database.databasePath).items.find(item => item.id === menuProductId);
  const countBeforePublish = listRuntimeCatalogProducts(database.databasePath).items.length;
  await page.addInitScript(({ menuData, menuProduct }) => { window.__menuData = menuData; window.__product = menuProduct; }, { menuData, menuProduct });
  await page.reload();
  await page.getByRole("button", { name: "Menü Ürününü Aç", exact: true }).click();
  await expect(page.getByRole("button", { name: "Menü Sunumunu Kaydet", exact: true })).toBeVisible();
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  assert.equal(database.getCommerceProductPublication(menuProductId).isPublished, false);
  await page.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => database.createCommerceOnlineCatalog().products.some(item => item.productId === menuProductId)).toBe(true);
  assert.equal(listRuntimeCatalogProducts(database.databasePath).items.length, countBeforePublish, "Menu publication must not insert another product row");
  selectOnlineSales(false);
  await page.evaluate(() => window.__onlineToggle(false));
  await expect(checkbox).toHaveCount(0);
  assert.equal(database.createCommerceOnlineCatalog().enabled, false);
  assert.deepEqual(errors, []);
  console.log("commerce-online-catalog-ui-smoke-ok");
} finally { await browser?.close(); await server?.close(); raw?.close(); database.close(); rmSync(root, { recursive: true, force: true }); }
