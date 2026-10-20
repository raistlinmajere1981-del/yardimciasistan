import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { chooseSearchSelect } from "./test-helpers/search-select.mjs";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const runtime = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const presentation = require("../apps/desktop-app/dist-electron/commerce-catalog-presentation-store.js");
const { completeMarketSale } = require("../apps/desktop-app/dist-electron/market-sale-operation.js");
const { readBusinessCapabilitySnapshot } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { createTransferPlan, applyTransferPlan } = require("../apps/desktop-app/dist-electron/data-transfer-service.js");
const { parseTransferFile, suggestTransferMapping } = require("../apps/desktop-app/dist-electron/data-transfer-format.js");
const { DEFAULT_TRANSFER_PREFERENCES } = require("../apps/desktop-app/dist-electron/data-transfer-contract.js");
const dir = mkdtempSync(join(tmpdir(), "sales-ui-"));
const database = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: dir });
let server, browser, page;
const errors = [];
try {
  database.initialize();
  assert.equal(database.saveInitialSetup({ businessName: "Sales UI", profileId: "market", profileOptions: ["commerce.wholesale", "commerce.customer_credit", "channel.online_sales"],
    phone: "", whatsapp: "", email: "", address: "", webModuleUrl: "https://example.test", syncSecret: "fixture-secret", autoSyncEnabled: false,
    aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiModelOptions: [], aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] }).ok, true);
  const path = database.databasePath;
  const category1 = runtime.saveRuntimeCatalogCategory(path, { name: "Gıda" }), category2 = runtime.saveRuntimeCatalogCategory(path, { name: "İçecek" });
  const bread = runtime.saveRuntimeCatalogProduct(path, { name: "Ekmek", salePrice: 100, dealerPriceA: 80, dealerPriceB: 60, categoryId: category1.id, trackInventory: false, quickAccessEnabled: true });
  const water = runtime.saveRuntimeCatalogProduct(path, { name: "Su", salePrice: 20, dealerPriceA: 15, dealerPriceB: 10, categoryId: category2.id, trackInventory: false, barcode: "8690000000001", quickAccessEnabled: true });
  const kg = runtime.saveRuntimeCatalogProduct(path, { name: "Elma kg", salePrice: 40, dealerPriceA: 30, dealerPriceB: 20, categoryId: category1.id, unit: "kg", trackInventory: true });
  runtime.setRuntimeInventoryCount(path, { productId: kg.id, countedQuantity: 10 });
  for (const [name, group] of [["Normal Müşteri", null], ["Bayi A", "dealer_a"], ["Bayi B", "dealer_b"]]) {
    const saved = database.saveCustomer({ fullName: name, phone: "", email: "", notes: "", tags: [], ...(group ? { commercialProfile: { companyName: name, taxOffice: "", taxNumber: "", authorizedPerson: "", dealerStatus: "active", priceGroup: group, paymentTermDays: 0, notes: "" } } : {}) });
    assert.equal(saved.ok, true, saved.message);
  }
  const initial = { snapshot: readBusinessCapabilitySnapshot(path), customers: database.getDashboardData().customers };
  const ids = Object.fromEntries(initial.customers.map(customer => [customer.fullName, customer.id]));
  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  page.setDefaultTimeout(8000);
  const sales = [], reorderCalls = [], countCalls = [];
  page.on("pageerror", error => errors.push(error.message));
  let delayedA = false;
  const pendingA = [];
  await page.exposeFunction("__salesCall", async (method, ...args) => {
    const methods = { listProducts: runtime.listRuntimeCatalogProducts, listCategories: runtime.listRuntimeCatalogCategories,
      saveProduct: runtime.saveRuntimeCatalogProduct, saveCategory: runtime.saveRuntimeCatalogCategory, deleteCategory: runtime.deleteRuntimeCatalogCategory,
      setProductQuickAccess: presentation.setCatalogProductQuickAccess, deleteProduct: presentation.deleteCatalogProduct,
      getInventoryBalance: runtime.getRuntimeInventoryBalance, listInventoryMovements: runtime.listRuntimeInventoryMovements,
      getCustomerCreditAccount: runtime.getCustomerCreditAccount, findProductByBarcode: runtime.findRuntimeProductByBarcode };
    if (method === "resolveProductPrice") {
      const result = runtime.resolveRuntimeProductPrice(path, args[0]);
      if (delayedA && args[0].customerId === ids["Bayi A"]) await new Promise(done => { pendingA.push(done); });
      return result;
    }
    if (method === "completeMarketSale") { sales.push(args[0]); return completeMarketSale(path, args[0]); }
    if (method === "reorderCatalog") { reorderCalls.push(args); return presentation.reorderCatalogRecords(path, ...args); }
    if (method === "setInventoryCount") { countCalls.push(args[0]); return runtime.setRuntimeInventoryCount(path, args[0]); }
    if (method === "getProductPublication") return database.getCommerceProductPublication(args[0]);
    if (method === "saveProductPublication") return database.saveCommerceProductPublication(args[0]);
    if (method === "getProductImageDataUrl") return "";
    if (methods[method]) return methods[method](path, ...args);
    throw new Error(`Unexpected call: ${method}`);
  });
  await page.addInitScript(initial => {
    window.__salesInitial = initial;
    const invoke = (method) => (...args) => window.__salesCall(method, ...args);
    window.yardimciDesktop = { commerce: Object.fromEntries(["listProducts", "listCategories", "saveProduct", "saveCategory", "deleteCategory", "deleteProduct", "setProductQuickAccess", "reorderCatalog", "getInventoryBalance", "listInventoryMovements", "setInventoryCount", "getProductPublication", "saveProductPublication", "getProductImageDataUrl", "getCustomerCreditAccount", "resolveProductPrice", "completeMarketSale", "findProductByBarcode"].map(method => [method, invoke(method)])) };
    window.yardimciDesktop.commerce.setBarcodeScanMode = async active => ({ active, intervalMs: 1500, transport: "hosting" });
    window.yardimciDesktop.commerce.consumePendingBarcodeScans = async () => [];
  }, initial);
  await page.route("**/sales-workspace-test*", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/sales-workspace-test", `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/sales-workspace.tsx")}"></script></body></html>`) }));
  await page.goto(`${server.resolvedUrls.local[0]}sales-workspace-test`);
  const quick = page.locator(".market-quick-sale-layout"), grid = quick.locator(".market-sale-product-grid"), cart = quick.locator(".market-sale-cart");
  const categories = quick.getByRole("group", { name: "Ürün kategorileri" });
  const methods = quick.getByRole("group", { name: "Ödeme yöntemi" });
  const tabs = page.getByRole("navigation", { name: "Satış çalışma alanları" });
  await expect(grid.getByRole("button")).toHaveCount(3);
  await categories.getByRole("button", { name: "İçecek", exact: true }).click();
  await expect(grid.getByRole("button")).toHaveCount(1); await expect(grid).toContainText("Su");
  await categories.getByRole("button", { name: "Hızlı Erişim", exact: true }).click();
  await expect(grid.getByRole("button")).toHaveCount(2);
  await grid.getByRole("button", { name: /Ekmek/ }).click(); await grid.getByRole("button", { name: /Su/ }).click();
  const total = cart.locator(".market-sale-grand-total strong");
  await expect(total).toContainText("120,00");
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Normal Müşteri"] }); await expect(total).toContainText("120,00");
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi A"] }); await expect(total).toContainText("95,00");
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi B"] }); await expect(total).toContainText("70,00");
  await cart.getByRole("button", { name: "Seçimi Temizle" }).click(); await expect(total).toContainText("120,00");
  delayedA = true;
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi A"] });
  await expect.poll(() => pendingA.length).toBeGreaterThan(0);
  await expect(cart.getByRole("button", { name: "Ödemeyi Al ve Satışı Tamamla" })).toBeDisabled();
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi B"] }); await expect(total).toContainText("70,00");
  delayedA = false; pendingA.splice(0).forEach(done => done());
  await expect(total).toContainText("70,00");
  await cart.getByRole("button", { name: "Seçimi Temizle" }).click(); await expect(total).toContainText("120,00");
  await cart.getByRole("button", { name: "Ekmek miktarını artır" }).tap(); await expect(total).toContainText("220,00");
  await cart.getByRole("button", { name: "Ekmek miktarını azalt" }).tap(); await expect(total).toContainText("120,00");
  for (const label of ["Ekmek miktarını artır", "Ekmek miktarını azalt"]) { const bounds = await cart.getByRole("button", { name: label }).boundingBox(); assert.ok(bounds.width >= 44 && bounds.height >= 44); }
  const quantity = cart.getByRole("spinbutton", { name: "Ekmek miktarı" });
  await quantity.fill(""); await quantity.press("Tab"); await expect(quantity).toHaveValue("1");
  await quantity.fill("2"); await quantity.press("Enter"); await expect(total).toContainText("220,00");
  await quantity.fill("99"); await quantity.press("Escape"); await expect(quantity).toHaveValue("2"); await expect(total).toContainText("220,00");
  const width = (await cart.boundingBox()).width;
  await methods.getByRole("button", { name: "Veresiye", exact: true }).click();
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi B"] }); await expect(total).toContainText("130,00");
  await expect(cart).toContainText("Mevcut borç"); assert.equal((await cart.boundingBox()).width, width);
  await expect(cart.getByRole("button", { name: "Satışı Veresiye Kaydet" })).toBeVisible();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1120, height: 680 }]) {
    await page.setViewportSize(viewport);
    const catalogBounds = await quick.locator(".market-sale-catalog").boundingBox(), cartBounds = await cart.boundingBox();
    assert.ok(catalogBounds.width / (catalogBounds.width + cartBounds.width) >= 0.65, "product area remains dominant");
    assert.ok(cartBounds.width >= 340 && cartBounds.width <= 440);
    const checkoutBounds = await cart.getByRole("button", { name: "Satışı Veresiye Kaydet" }).boundingBox();
    assert.ok(checkoutBounds.y + checkoutBounds.height <= viewport.height, `credit checkout remains inside viewport: ${JSON.stringify({ viewport, cartBounds, checkoutBounds, children: await cart.evaluate(element => [...element.children].map(child => ({ className: child.className, height: child.getBoundingClientRect().height }))) })}`);
    assert.ok((await cart.locator(".market-sale-cart-lines").boundingBox()).height >= 80, "cart lines retain usable scrolling space");
    assert.equal(await cart.evaluate(element => element.scrollWidth <= element.clientWidth), true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await methods.getByRole("button", { name: "Nakit", exact: true }).click();
  const view = quick.getByLabel("Ürün görünümü", { exact: true });
  for (const preset of ["comfortable", "dense", "list", "custom"]) { await view.selectOption(preset); await expect(grid).toHaveClass(new RegExp(`--${preset}`)); }
  await quick.getByLabel("Ürün sütun sayısı").selectOption("3"); await quick.getByLabel("Görsel göster").uncheck(); await quick.getByLabel("Fiyatı vurgula").uncheck();
  await expect(grid.locator(".market-sale-product-thumb")).toHaveCount(0);
  await tabs.getByRole("button", { name: /Ürünler/ }).click(); await tabs.getByRole("button", { name: /Hızlı Satış/ }).click();
  await expect(view).toHaveValue("custom"); await expect(quick.getByLabel("Ürün sütun sayısı")).toHaveValue("3");
  await cart.getByRole("button", { name: "Temizle", exact: true }).click(); await categories.getByRole("button", { name: "Tümü", exact: true }).click();
  await grid.getByRole("button", { name: /Elma kg/ }).click();
  await cart.getByRole("spinbutton", { name: "Elma kg miktarı" }).fill("0,375"); await cart.getByRole("spinbutton", { name: "Elma kg miktarı" }).press("Enter");
  await expect(total).toContainText("15,00");
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi A"] }); await expect(total).toContainText("11,25");
  const submit = cart.getByRole("button", { name: "Ödemeyi Al ve Satışı Tamamla" });
  await submit.click({ clickCount: 2 }); await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0);
  assert.equal(sales.length, 1); assert.equal(sales[0].customerId, ids["Bayi A"]);
  assert.equal(runtime.getRuntimeInventoryBalance(path, kg.id).quantity, 9.625);
  const sql = new DatabaseSync(path); try { assert.equal(sql.prepare("SELECT unit_price FROM commerce_sale_items ORDER BY created_at DESC LIMIT 1").get().unit_price, 30); } finally { sql.close(); }
  // Manage canonical products and ordering through the same workspace/list.
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await expect(page.getByLabel("Sıra", { exact: true })).toHaveCount(0);
  const productRows = page.locator('.market-catalog-record[data-sort-kind="products"]');
  const elmaRow = productRows.filter({ hasText: "Elma kg" });
  await elmaRow.getByRole("button", { name: "Hızlı erişime ekle", exact: true }).click();
  await expect.poll(() => runtime.listRuntimeCatalogProducts(path).find(item => item.id === kg.id).quickAccessEnabled).toBe(true);
  await elmaRow.getByRole("button", { name: "Hızlı erişimden çıkar", exact: true }).click();
  await expect.poll(() => runtime.listRuntimeCatalogProducts(path).find(item => item.id === kg.id).quickAccessEnabled).toBe(false);
  await elmaRow.getByRole("button", { name: "Elma kg sırasını değiştir" }).focus(); await page.keyboard.press("ArrowUp");
  await expect.poll(() => reorderCalls.length).toBe(1);
  assert.deepEqual(runtime.listRuntimeCatalogProducts(path).map(item => item.id), [bread.id, kg.id, water.id]);
  await productRows.filter({ hasText: "Su" }).getByRole("button", { name: "Su sırasını değiştir" }).dragTo(productRows.filter({ hasText: "Ekmek" }), { targetPosition: { x: 100, y: 4 } });
  await expect.poll(() => reorderCalls.length).toBe(2);
  assert.deepEqual(runtime.listRuntimeCatalogProducts(path).map(item => item.id), [water.id, bread.id, kg.id]);
  const sourceBounds = await elmaRow.getByRole("button", { name: "Elma kg sırasını değiştir" }).boundingBox();
  const targetBounds = await productRows.filter({ hasText: "Ekmek" }).boundingBox();
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sourceBounds.x + sourceBounds.width / 2, y: sourceBounds.y + sourceBounds.height / 2 }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: targetBounds.x + 100, y: targetBounds.y + 4 }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await touch.detach();
  await expect.poll(() => reorderCalls.length).toBe(3);
  assert.deepEqual(runtime.listRuntimeCatalogProducts(path).map(item => item.id), [water.id, kg.id, bread.id]);
  await page.locator(`[data-sort-id="${category2.id}"]`).getByRole("button", { name: "İçecek sırasını değiştir" }).focus(); await page.keyboard.press("ArrowUp");
  await expect.poll(() => reorderCalls.length).toBe(4);
  assert.equal(runtime.listRuntimeCatalogCategories(path)[0].id, category2.id);
  await page.locator(`[data-sort-id="${category1.id}"]`).getByRole("button", { name: "Gıda sırasını değiştir" }).dragTo(page.locator(`[data-sort-id="${category2.id}"]`), { targetPosition: { x: 100, y: 4 } });
  await expect.poll(() => reorderCalls.length).toBe(5);
  assert.equal(runtime.listRuntimeCatalogCategories(path)[0].id, category1.id);
  await page.getByRole("group", { name: "Ürün listesi" }).getByRole("button", { name: "Hızlı Erişim", exact: true }).click();
  await page.locator(`[data-sort-id="${water.id}"]`).getByRole("button", { name: "Su sırasını değiştir" }).focus(); await page.keyboard.press("ArrowUp");
  await expect.poll(() => reorderCalls.length).toBe(6);
  assert.equal(reorderCalls[5][0], "quickAccess");
  await page.getByRole("group", { name: "Ürün listesi" }).getByRole("button", { name: "Tüm ürünler", exact: true }).click();
  await elmaRow.getByRole("button", { name: "Düzenle", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Elma kg", exact: true });
  await expect(workspace).toBeVisible(); await expect(workspace.getByRole("tab")).toHaveCount(0);
  await expect(workspace.getByLabel("Ürün adı", { exact: true })).toHaveValue("Elma kg");
  await expect(workspace.getByRole("button", { name: "Görsel Ekle / Değiştir" })).toBeVisible();
  await workspace.locator('input[type="file"]').setInputFiles({ name: "product.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6WQAAAABJRU5ErkJggg==", "base64") });
  await expect(workspace.getByRole("img", { name: "Elma kg ürün görseli", exact: true })).toBeVisible();
  await expect.poll(() => workspace.getByRole("img", { name: "Elma kg ürün görseli", exact: true }).evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  assert.equal(await workspace.getByRole("img", { name: "Elma kg ürün görseli", exact: true }).evaluate(image => getComputedStyle(image).objectFit), "contain");
  await workspace.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(workspace.getByRole("checkbox", { name: "Aktif ürün" })).toBeVisible();
  const status = workspace.getByRole("region", { name: "Durum / Kullanım", exact: true });
  await expect(status.getByRole("checkbox", { name: "Stok takibi", exact: true })).toBeChecked();
  await status.getByRole("checkbox", { name: "Stok takibi", exact: true }).uncheck();
  await workspace.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(status.getByRole("checkbox", { name: "Stok takibi", exact: true })).toBeChecked();
  const published = status.getByRole("checkbox", { name: "Web satışında yayınla", exact: true });
  await expect(published).toBeEnabled();
  const initiallyPublished = await published.isChecked();
  await published.click(); await expect(published).toBeChecked({ checked: !initiallyPublished });
  assert.equal(database.getCommerceProductPublication(kg.id).isPublished, !initiallyPublished);
  await published.click(); await expect(published).toBeChecked({ checked: initiallyPublished });
  await workspace.getByRole("checkbox", { name: "Aktif ürün" }).uncheck();
  await workspace.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(workspace.getByRole("button", { name: "Ürünü Kaydet", exact: true })).toBeDisabled();
  assert.equal(runtime.listRuntimeCatalogProducts(path).find(item => item.id === kg.id).isActive, false);
  await workspace.getByRole("checkbox", { name: "Aktif ürün" }).check();
  await workspace.getByRole("checkbox", { name: "Hızlı erişim", exact: true }).check();
  await workspace.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(workspace.getByRole("button", { name: "Ürünü Kaydet", exact: true })).toBeDisabled();
  assert.equal(runtime.listRuntimeCatalogProducts(path).find(item => item.id === kg.id).quickAccessEnabled, true);
  await workspace.getByLabel("Stok işlemi", { exact: true }).selectOption("count");
  await workspace.getByLabel("Stok işlem miktarı", { exact: true }).fill("12,5"); await workspace.getByLabel("Kısa not", { exact: true }).fill("Canlı sayım");
  await workspace.getByRole("button", { name: "Stok İşlemini Onayla", exact: true }).click();
  await workspace.getByRole("button", { name: "Stok Hareketini Kaydet", exact: true }).click();
  await expect(workspace).toContainText("Fiziksel sayım kaydedildi."); assert.equal(countCalls[0].actorSource, "desktop-product-workspace");
  assert.equal(runtime.getRuntimeInventoryBalance(path, kg.id).quantity, 12.5);
  await workspace.getByRole("button", { name: "Stok Hareketleri", exact: true }).click();
  await expect(workspace.getByRole("region", { name: "Stok hareketleri", exact: true })).toContainText("Canlı sayım");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await workspace.getByRole("button", { name: "← Ürüne dön", exact: true }).click();
  await workspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await tabs.getByRole("button", { name: /Hızlı Satış/ }).click();
  await page.reload(); await expect(page.getByLabel("Ürün görünümü", { exact: true })).toHaveValue("custom");
  await expect(grid.locator(".market-sale-product > span > strong")).toHaveText(["Su", "Elma kg", "Ekmek"]);
  await expect(categories.getByRole("button")).toHaveText(["Tümü", "Hızlı Erişim", "Gıda", "İçecek"]);
  await categories.getByRole("button", { name: "Hızlı Erişim", exact: true }).click();
  await expect(grid.locator(".market-sale-product > span > strong")).toHaveText(["Su", "Ekmek", "Elma kg"]);
  // Creating a retail product continues in its canonical saved-product workspace.
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await page.getByRole("button", { name: "Ürün Ekle", exact: true }).click();
  const createProduct = page.getByRole("dialog", { name: "Yeni ürün ekle", exact: true });
  await expect(createProduct).toBeVisible();
  await createProduct.getByLabel("Ürün adı", { exact: true }).fill("Duman test ürünü");
  await createProduct.getByLabel("Perakende fiyat", { exact: true }).fill("19");
  await createProduct.getByLabel("Alış fiyatı", { exact: true }).fill("0");
  await createProduct.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(createProduct).toHaveCount(0);
  const savedProduct = page.getByRole("dialog", { name: "Duman test ürünü", exact: true });
  await expect(savedProduct).toBeVisible();
  await savedProduct.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('.market-catalog-record[data-sort-kind="products"]').filter({ hasText: "Duman test ürünü" })).toBeVisible();
  assert.equal(runtime.listRuntimeCatalogProducts(path).some(product => product.name === "Duman test ürünü"), true);

  // Category filters share search, while counts describe the full catalog.
  const filters = page.getByRole("group", { name: "Ürün listesi" });
  const search = page.getByPlaceholder("Ad, marka, SKU veya barkod ara");
  await expect(filters.getByRole("button")).toHaveText(["Tüm ürünler", "Hızlı Erişim", "Gıda · 2", "İçecek · 1"]);
  await filters.getByRole("button", { name: "Gıda · 2", exact: true }).click();
  await expect(productRows).toHaveCount(2);
  await expect(elmaRow.getByRole("button", { name: "Elma kg sırasını değiştir" })).toBeDisabled();
  await search.fill("Su"); await expect(productRows).toHaveCount(0);
  await expect(filters.getByRole("button", { name: "Gıda · 2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "Hızlı Erişim", exact: true }).click();
  await expect(page.locator('.market-catalog-record[data-sort-kind="quickAccess"]')).toHaveCount(1);
  await filters.getByRole("button", { name: "Tüm ürünler", exact: true }).click();
  await expect(productRows).toHaveCount(1); await search.fill(""); await expect(productRows).toHaveCount(4);

  // Only one inline editor; cancel and successful edits preserve the creation draft.
  const newCategory = page.getByRole("form", { name: "Yeni kategori", exact: true });
  const foodRow = page.locator(`[data-sort-id="${category1.id}"]`);
  const drinkRow = page.locator(`[data-sort-id="${category2.id}"]`);
  await newCategory.getByLabel("Kategori adı", { exact: true }).fill("Yeni grup");
  await newCategory.getByLabel("Kod", { exact: true }).fill("YENI");
  await foodRow.getByRole("button", { name: "Düzenle", exact: true }).click();
  await foodRow.getByLabel("Kategori adı", { exact: true }).fill("Kaydedilmeyen ad");
  await drinkRow.getByRole("button", { name: "Düzenle", exact: true }).click();
  await expect(page.getByRole("form", { name: /kategorisini düzenle$/ })).toHaveCount(1);
  await expect(drinkRow.getByLabel("Kategori adı", { exact: true })).toHaveValue("İçecek");
  await drinkRow.getByRole("button", { name: "Vazgeç", exact: true }).click();
  assert.equal(runtime.listRuntimeCatalogCategories(path).find(category => category.id === category1.id).name, "Gıda");
  await filters.getByRole("button", { name: "İçecek · 1", exact: true }).click();
  await drinkRow.getByRole("button", { name: "Düzenle", exact: true }).click();
  await drinkRow.getByLabel("Aktif kategori", { exact: true }).uncheck();
  await drinkRow.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(filters.getByRole("button", { name: "İçecek · 1", exact: true })).toHaveCount(0);
  await expect(filters.getByRole("button", { name: "Tüm ürünler", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(productRows).toHaveCount(4);
  assert.equal(runtime.listRuntimeCatalogCategories(path).find(category => category.id === category2.id).isActive, false);
  await foodRow.getByRole("button", { name: "Düzenle", exact: true }).click();
  await foodRow.getByLabel("Kod", { exact: true }).fill("GIDA");
  await chooseSearchSelect(foodRow, "Üst kategori", { value: category2.id });
  await foodRow.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(foodRow.getByRole("button", { name: "Düzenle", exact: true })).toBeVisible();
  const savedFood = runtime.listRuntimeCatalogCategories(path).find(category => category.id === category1.id);
  assert.equal(savedFood.code, "GIDA"); assert.equal(savedFood.parentId, category2.id);
  await expect(newCategory.getByLabel("Kategori adı", { exact: true })).toHaveValue("Yeni grup");
  await newCategory.getByRole("button", { name: "Kategori Ekle", exact: true }).click();
  await expect(filters.getByRole("button", { name: "Yeni grup · 0", exact: true })).toBeVisible();
  await expect(newCategory.getByLabel("Kategori adı", { exact: true })).toHaveValue("");
  const createdCategory = runtime.listRuntimeCatalogCategories(path).find(category => category.code === "YENI");
  await filters.getByRole("button", { name: "Yeni grup · 0", exact: true }).click();
  await expect(productRows).toHaveCount(0);
  await page.locator(`[data-sort-id="${createdCategory.id}"]`).getByRole("button", { name: "Sil", exact: true }).click();
  await page.getByRole("dialog", { name: "Kategoriyi sil", exact: true }).getByRole("button", { name: "Sil", exact: true }).click();
  await expect(filters.getByRole("button", { name: "Yeni grup · 0", exact: true })).toHaveCount(0);
  await expect(filters.getByRole("button", { name: "Tüm ürünler", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(productRows).toHaveCount(4);

  // Real import into the disposable DB: named categories and Diğer are ordinary filters,
  // including inactive imported products and zero-product categories in a long chip strip.
  const imported = await parseTransferFile("categories.csv", Buffer.from("name;sku;salePrice;category\nPompa;POMPA;25;Sirkülasyon Pompa\nİthal ürün;ITHAL;10;\n"), "products");
  const images = { validate() {}, async prepare() { throw new Error("Fixture has no images"); } };
  const plan = createTransferPlan(path, "products", imported, suggestTransferMapping(imported.headers, "products"), DEFAULT_TRANSFER_PREFERENCES, images);
  assert.equal((await applyTransferPlan(path, plan, images, () => {}, () => {})).added, 2);
  for (let index = 0; index < 12; index++) runtime.saveRuntimeCatalogCategory(path, { name: `Ek kategori ${index}` });
  await page.reload(); await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await filters.getByRole("button", { name: "Sirkülasyon Pompa · 1", exact: true }).click();
  await expect(productRows).toHaveCount(1); await expect(productRows).toContainText("Pompa");
  await filters.getByRole("button", { name: "Diğer · 1", exact: true }).click();
  await expect(productRows).toHaveCount(1); await expect(productRows).toContainText("İthal ürün");
  await expect(productRows).toContainText("Pasif");
  await filters.getByRole("button", { name: "Ek kategori 11 · 0", exact: true }).click();
  await expect(productRows).toHaveCount(0);
  await filters.getByRole("button", { name: "Tüm ürünler", exact: true }).click();
  await expect(productRows).toHaveCount(6);
  assert.equal(await filters.evaluate(element => element.scrollWidth > element.clientWidth), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.evaluate(() => { document.documentElement.dataset.colorScheme = "dark"; document.documentElement.style.colorScheme = "dark"; });
  mkdirSync("artifacts/screenshots/market-products", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/market-products/categories.png" });
  await page.locator(`[data-sort-id="${category1.id}"]`).getByRole("button", { name: "Düzenle", exact: true }).click();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1120, height: 680 }]) {
    await page.setViewportSize(viewport);
    await expect(newCategory.getByRole("button", { name: "Kategori Ekle", exact: true })).toBeInViewport();
    const inlineEditor = page.getByRole("form", { name: "Gıda kategorisini düzenle", exact: true });
    await expect(inlineEditor).toBeVisible();
    await inlineEditor.getByRole("button", { name: "Kaydet", exact: true }).scrollIntoViewIfNeeded();
    await expect(inlineEditor.getByRole("button", { name: "Kaydet", exact: true })).toBeInViewport();
    assert.equal(await inlineEditor.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    await newCategory.getByRole("button", { name: "Kategori Ekle", exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `artifacts/screenshots/market-products/inline-edit-${viewport.width}.png` });
  }
  assert.deepEqual(errors, []);
  // Canonical Settings save/read fencing is covered by smoke-profile-transition-ui.
  console.log("sales-workspace-ui-smoke-ok");
} catch (error) {
  if (page) {
    console.error("sales-ui-failure", { errors, text: (await page.locator("body").innerText()).slice(0, 4000) });
    await page.screenshot({ path: "artifacts/screenshots/sales-ui-failure.png" });
  }
  throw error;
} finally { await browser?.close(); await server?.close(); database.close(); rmSync(dir, { recursive: true, force: true }); }
