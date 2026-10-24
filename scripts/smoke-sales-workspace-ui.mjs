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
  runtime.saveRuntimeCatalogProduct(path, { ...bread }, { productId: bread.id, assetPath: "products/fixture-bread.webp", sourceUrl: "", license: "fixture" });
  const water = runtime.saveRuntimeCatalogProduct(path, { name: "Su", sku: "SU-001", brand: "Pınar", salePrice: 20, dealerPriceA: 15, dealerPriceB: 10, categoryId: category2.id, trackInventory: false, barcode: "8690000000001", quickAccessEnabled: true });
  const kg = runtime.saveRuntimeCatalogProduct(path, { name: "Elma kg", salePrice: 40, dealerPriceA: 30, dealerPriceB: 20, categoryId: category1.id, unit: "kg", trackInventory: true });
  runtime.setRuntimeInventoryCount(path, { productId: kg.id, countedQuantity: 10 });
  for (const [name, group] of [["Normal Müşteri", null], ["Bayi A", "dealer_a"], ["Bayi B", "dealer_b"]]) {
    const saved = database.saveCustomer({ fullName: name, phone: "", email: "", notes: "", tags: [], ...(group ? { commercialProfile: { companyName: name, taxOffice: "", taxNumber: "", authorizedPerson: "", dealerStatus: "active", priceGroup: group, paymentTermDays: 0, notes: "" } } : {}) });
    assert.equal(saved.ok, true, saved.message);
  }
  const initial = { snapshot: readBusinessCapabilitySnapshot(path), customers: database.getDashboardData().customers, dashboardData: database.getDashboardData() };
  const ids = Object.fromEntries(initial.customers.map(customer => [customer.fullName, customer.id]));
  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  page.setDefaultTimeout(8000);
  const sales = [], reorderCalls = [], countCalls = [], bulkCalls = [], priceCalls = [];
  // Preload photo transport fixture; archive/codec persistence is covered in Electron media checks.
  const photoCollections = new Map(), photoPreviews = new Map();
  const listPhotos = productId => photoCollections.get(productId) ?? { productId, revision: "0", photos: [], sourceUrl: "", sourceLicense: "" };
  let bulkDeleteFailure = "";
  page.on("pageerror", error => errors.push(error.message));
  let delayedA = false;
  const pendingA = [];
  await page.exposeFunction("__salesCall", async (method, ...args) => {
    if (["activateProduct", "setProductQuickAccess", "deleteProduct", "saveProductPublication"].includes(method)) {
      bulkCalls.push({ method, args });
      if (method === "deleteProduct" && args[0] === bulkDeleteFailure) throw new Error("Test ürünü kullanımda.");
    }
    const methods = { listProducts: runtime.listRuntimeCatalogProducts, listCategories: runtime.listRuntimeCatalogCategories,
      listOrders: runtime.listRuntimeOrders, getOrder: runtime.getRuntimeOrder,
      createOrder: (db, input) => runtime.createRuntimeOrder(db, input, { desktopEntry: true }),
      saveProduct: runtime.saveRuntimeCatalogProduct, saveCategory: runtime.saveRuntimeCatalogCategory, deleteCategory: runtime.deleteRuntimeCatalogCategory,
      activateProduct: presentation.activateCatalogProduct, setProductQuickAccess: presentation.setCatalogProductQuickAccess, deleteProduct: presentation.deleteCatalogProduct,
      getInventoryBalance: runtime.getRuntimeInventoryBalance, listInventoryMovements: runtime.listRuntimeInventoryMovements,
      getCustomerCreditAccount: runtime.getCustomerCreditAccount, findProductByBarcode: runtime.findRuntimeProductByBarcode };
    if (method === "saveCustomer") return database.saveCustomer(args[0]);
    if (method === "getCustomer") return database.getCustomer(args[0]);
    if (method === "resolveProductPrice") {
      priceCalls.push(args[0]);
      const result = runtime.resolveRuntimeProductPrice(path, args[0]);
      if (delayedA && args[0].customerId === ids["Bayi A"]) await new Promise(done => { pendingA.push(done); });
      return result;
    }
    if (method === "completeMarketSale") { sales.push(args[0]); return completeMarketSale(path, args[0]); }
    if (method === "reorderCatalog") { reorderCalls.push(args); return presentation.reorderCatalogRecords(path, ...args); }
    if (method === "setInventoryCount") { countCalls.push(args[0]); return runtime.setRuntimeInventoryCount(path, args[0]); }
    if (method === "getProductPublication") return database.getCommerceProductPublication(args[0]);
    if (method === "saveProductPublication") return database.saveCommerceProductPublication(args[0]);
    if (method === "getProductImageDataUrl") return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="orange"/></svg>')}`;
    if (method === "listProductPhotos") return listPhotos(args[0]);
    if (method === "previewProductPhoto") return photoPreviews.get(args[1]);
    if (method === "addProductPhotos") {
      const input = args[0], previous = listPhotos(input.productId);
      assert.equal(input.expectedRevision, previous.revision);
      const next = { ...previous, revision: String(Number(previous.revision) + 1), photos: [...previous.photos] };
      for (const dataUrl of input.dataUrls) {
        const id = `${input.productId}-${next.photos.length}`;
        photoPreviews.set(id, dataUrl); next.photos.push({ id, format: "image/png" });
      }
      photoCollections.set(input.productId, next); return next;
    }
    if (methods[method]) return methods[method](path, ...args);
    throw new Error(`Unexpected call: ${method}`);
  });
  await page.addInitScript(initial => {
    window.__salesInitial = initial;
    if (!localStorage.getItem("yardimci-asistan.sale-product-view")) localStorage.setItem("yardimci-asistan.sale-product-view", JSON.stringify({ preset: "custom", columns: 6, showImages: false, emphasizePrice: false }));
    window.__salesReadCompletions = 0;
    const invoke = (method) => async (...args) => {
      const result = await window.__salesCall(method, ...args);
      if (method === "listProducts") window.__salesReadCompletions++;
      return method === "createOrder" ? { ok: true, value: result } : result;
    };
    window.yardimciDesktop = { commerce: Object.fromEntries(["listOrders", "getOrder", "createOrder", "listProducts", "listCategories", "saveProduct", "saveCategory", "deleteCategory", "deleteProduct", "setProductQuickAccess", "activateProduct", "reorderCatalog", "getInventoryBalance", "listInventoryMovements", "setInventoryCount", "getProductPublication", "saveProductPublication", "getProductImageDataUrl", "listProductPhotos", "previewProductPhoto", "addProductPhotos", "getCustomerCreditAccount", "resolveProductPrice", "completeMarketSale", "findProductByBarcode"].map(method => [method, invoke(method)])) };
    const dashboardListeners = new Set();
    window.yardimciDesktop.onDashboardDataChanged = listener => { dashboardListeners.add(listener); return () => dashboardListeners.delete(listener); };
    window.__emitSalesDashboard = data => { for (const listener of dashboardListeners) listener(structuredClone(data)); };
    window.yardimciDesktop.saveCustomer = invoke("saveCustomer");
    window.yardimciDesktop.getCustomer = invoke("getCustomer");
    window.yardimciDesktop.commerce.setBarcodeScanMode = async active => ({ active, intervalMs: 1500, transport: "hosting" });
    window.yardimciDesktop.commerce.consumePendingBarcodeScans = async () => [];
  }, initial);
  await page.route("**/sales-workspace-test*", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/sales-workspace-test", `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/sales-workspace.tsx")}"></script></body></html>`) }));
  await page.goto(`${server.resolvedUrls.local[0]}sales-workspace-test`);
  const quick = page.locator(".market-quick-sale-layout"), grid = quick.locator(".market-sale-product-grid"), cart = quick.locator(".market-sale-sidebar");
  const checkoutPanel = cart.getByRole("region", { name: "Ödeme", exact: true });
  const cartPanel = cart.getByRole("region", { name: "Sepet", exact: true });
  await expect(checkoutPanel).toHaveClass(/market-panel/, { timeout: 45000 }); await expect(cartPanel).toHaveClass(/market-panel/);
  const categories = quick.getByRole("group", { name: "Ürün kategorileri" });
  const methods = quick.getByRole("group", { name: "İşlem ve ödeme seçimi" });
  const tabs = page.getByRole("navigation", { name: "Satış çalışma alanları" });
  await expect(grid.getByRole("button")).toHaveCount(3);
  const saleToolbar = quick.locator(".market-product-toolbar");
  await expect(grid.locator("img")).toHaveCount(1);
  await saleToolbar.getByRole("checkbox", { name: "Resimleri göster" }).uncheck();
  await expect(grid.locator("img")).toHaveCount(0);
  await quick.getByLabel("Ürün görünümü", { exact: true }).selectOption("dense");
  await expect(saleToolbar.getByRole("checkbox", { name: "Resimleri göster" })).not.toBeChecked();
  await quick.getByLabel("Ürün görünümü", { exact: true }).selectOption("balanced");
  await saleToolbar.getByRole("checkbox", { name: "Resimleri göster" }).check(); await expect(grid.locator("img")).toHaveCount(1);
  await saleToolbar.getByRole("button", { name: "Yeni ürün", exact: true }).click();
  const quickProduct = page.getByRole("dialog", { name: "Yeni ürün ekle", exact: true });
  await expect(quickProduct).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(1);
  await quickProduct.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  const productSearch = quick.getByPlaceholder("Ürün adı, marka, SKU veya barkod ara");
  await expect(quick.getByLabel("Ürün görünümü", { exact: true })).toHaveValue("balanced");
  await expect(quick.getByLabel("Ürün görünümü", { exact: true }).locator("option")).toHaveText(["Rahat", "Dengeli", "Yoğun", "Liste"]);
  await expect(quick.getByRole("combobox")).toHaveCount(1);
  await expect(cart.getByRole("heading", { name: "Hızlı Satış", exact: true })).toHaveCount(0);
  for (const query of ["su", "SU-001", "pınar", "8690000000001"]) {
    await productSearch.fill(query);
    await expect(grid.getByRole("button")).toHaveCount(1);
    await expect(grid).toContainText("Su");
  }
  await saleToolbar.getByRole("button", { name: "Temizle", exact: true }).click();
  await expect(productSearch).toHaveValue(""); await expect(grid.getByRole("button")).toHaveCount(3);
  await expect(saleToolbar.getByRole("button", { name: "Temizle", exact: true })).toBeDisabled();
  await productSearch.fill("su");
  await categories.getByRole("button", { name: /^Gıda ·/ }).click();
  await expect(grid.getByRole("button")).toHaveCount(0);
  await categories.getByRole("button", { name: /^İçecek ·/ }).click();
  await expect(grid.getByRole("button")).toHaveCount(1);
  await productSearch.fill("");
  await categories.getByRole("button", { name: /^İçecek ·/ }).click();
  await expect(grid.getByRole("button")).toHaveCount(1); await expect(grid).toContainText("Su");
  await categories.getByRole("button", { name: "Hızlı Erişim", exact: true }).click();
  await expect(grid.getByRole("button")).toHaveCount(2);
  await grid.getByRole("button", { name: /Ekmek/ }).click(); await grid.getByRole("button", { name: /Su/ }).click();
  const total = cart.locator(".market-sale-grand-total strong");
  await expect(total).toContainText("120,00");
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Normal Müşteri"] }); await expect(total).toContainText("120,00");
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi A"] }); await expect(total).toContainText("95,00");
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi B"] }); await expect(total).toContainText("70,00");
  await cart.locator(".customer-credit-picker").getByRole("button", { name: "Temizle", exact: true }).click(); await expect(total).toContainText("120,00");
  delayedA = true;
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi A"] });
  await expect.poll(() => pendingA.length).toBeGreaterThan(0);
  await expect(cart.getByRole("button", { name: "Ödeme Al" })).toBeDisabled();
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi B"] }); await expect(total).toContainText("70,00");
  delayedA = false; pendingA.splice(0).forEach(done => done());
  await expect(total).toContainText("70,00");
  await cart.locator(".customer-credit-picker").getByRole("button", { name: "Temizle", exact: true }).click(); await expect(total).toContainText("120,00");
  // Android device/sync notifications must not restart unchanged price queries.
  const dashboardPulse = async (data = database.getDashboardData()) => {
    const completed = await page.evaluate(() => window.__salesReadCompletions);
    await page.evaluate(snapshot => window.__emitSalesDashboard(snapshot), data);
    await expect.poll(() => page.evaluate(() => window.__salesReadCompletions)).toBeGreaterThan(completed);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await expect(cart.getByRole("button", { name: "Ödeme Al" })).toBeEnabled();
  await page.evaluate(() => {
    window.__priceLoadingFlashes = 0;
    const pane = document.querySelector(".market-sale-sidebar");
    window.__priceObserver = new MutationObserver(() => { if (pane.textContent.includes("Fiyatlar güncelleniyor")) window.__priceLoadingFlashes++; });
    window.__priceObserver.observe(pane, { childList: true, subtree: true, characterData: true });
  });
  const stablePriceCalls = priceCalls.length;
  await productSearch.fill("su"); await productSearch.focus();
  for (let pulse = 0; pulse < 6; pulse++) await dashboardPulse();
  assert.equal(priceCalls.length, stablePriceCalls, "unchanged full snapshots/revisions do not resolve prices again");
  assert.equal(await page.evaluate(() => window.__priceLoadingFlashes), 0);
  await expect(productSearch).toBeFocused(); await expect(productSearch).toHaveValue("su");
  await expect(total).toContainText("120,00"); await expect(cart.getByRole("button", { name: "Ödeme Al" })).toBeEnabled();
  await productSearch.fill("");
  runtime.saveRuntimeCatalogProduct(path, { ...water, salePrice: 21 });
  await dashboardPulse(); await expect(total).toContainText("121,00");
  await expect(grid.getByRole("button", { name: /Su/ })).toContainText("21,00");
  runtime.saveRuntimeCatalogProduct(path, { ...water });
  await dashboardPulse(); await expect(total).toContainText("120,00");
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi A"] }); await expect(total).toContainText("95,00");
  const dealerARecord = database.getCustomer(ids["Bayi A"]);
  database.saveCustomer({ ...dealerARecord, notes: "Non-pricing metadata changed" });
  const customerPriceCalls = priceCalls.length;
  await page.evaluate(() => { window.__priceLoadingFlashes = 0; });
  await dashboardPulse();
  assert.equal(priceCalls.length, customerPriceCalls, "customer timestamp/notes changes do not invalidate prices");
  assert.equal(await page.evaluate(() => window.__priceLoadingFlashes), 0);
  delayedA = true;
  runtime.saveRuntimeCatalogProduct(path, { ...bread, dealerPriceA: 81 });
  await dashboardPulse(); await expect.poll(() => pendingA.length).toBeGreaterThan(0);
  await expect(cart.getByRole("button", { name: "Ödeme Al" })).toBeDisabled();
  const inFlightPriceCalls = priceCalls.length;
  for (let pulse = 0; pulse < 3; pulse++) await dashboardPulse();
  assert.equal(priceCalls.length, inFlightPriceCalls, "sync notifications do not cancel/restart a genuine in-flight repricing");
  delayedA = false; pendingA.splice(0).forEach(done => done());
  await expect(total).toContainText("96,00");
  runtime.saveRuntimeCatalogProduct(path, { ...bread });
  await dashboardPulse(); await expect(total).toContainText("95,00");
  database.saveCustomer({ ...dealerARecord, commercialProfile: { ...dealerARecord.commercialProfile, priceGroup: "dealer_b" } });
  await dashboardPulse(); await expect(total).toContainText("70,00");
  database.saveCustomer({ ...dealerARecord });
  await dashboardPulse(); await expect(total).toContainText("95,00");
  await page.evaluate(() => window.__priceObserver.disconnect());
  await cart.locator(".customer-credit-picker").getByRole("button", { name: "Temizle", exact: true }).click(); await expect(total).toContainText("120,00");
  await cart.getByRole("button", { name: "Ekmek miktarını artır" }).tap(); await expect(total).toContainText("220,00");
  await cart.getByRole("button", { name: "Ekmek miktarını azalt" }).tap(); await expect(total).toContainText("120,00");
  for (const label of ["Ekmek miktarını artır", "Ekmek miktarını azalt"]) { const bounds = await cart.getByRole("button", { name: label }).boundingBox(); assert.ok(bounds.width >= 44 && bounds.height >= 44); }
  const quantity = cart.getByRole("spinbutton", { name: "Ekmek miktarı" });
  await quantity.fill(""); await quantity.press("Tab"); await expect(quantity).toHaveValue("1");
  await quantity.fill("2"); await quantity.press("Enter"); await expect(total).toContainText("220,00");
  await quantity.fill("99"); await quantity.press("Escape"); await expect(quantity).toHaveValue("2"); await expect(total).toContainText("220,00");
  await expect(cart.getByText("Satış müşterisi", { exact: true })).toHaveCount(0);
  await expect(cart.getByText("Müşteri", { exact: true })).toHaveCount(0);
  assert.equal(await cart.locator(".customer-credit-picker").evaluate(element => Boolean(element.compareDocumentPosition(element.parentElement.querySelector(".market-sale-payment")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
  assert.equal(await cart.locator(".market-sale-checkout-fields").evaluate(element => Boolean(element.compareDocumentPosition(element.closest(".market-sale-sidebar").querySelector(".market-sale-cart > header")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
  assert.equal(await cart.locator(".market-sale-checkout-action").evaluate(element => Boolean(element.compareDocumentPosition(element.closest(".market-sale-sidebar").querySelector(".market-sale-cart-lines")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
  const discount = cart.locator(".market-sale-totals").getByRole("form", { name: "İndirim", exact: true });
  await expect(cart.getByText("İndirim", { exact: true })).toHaveCount(1);
  const editDiscount = discount.getByRole("button", { name: "Düzenle", exact: true });
  const discountInput = discount.getByRole("textbox", { name: "İndirim tutarı", exact: true });
  await expect(discountInput).toHaveCount(0);
  await editDiscount.click(); await expect(discountInput).toBeFocused();
  await discountInput.fill("20,50"); await expect(total).toContainText("220,00");
  await expect(cart.getByRole("button", { name: "Ödeme Al" })).toBeDisabled();
  await discount.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(total).toContainText("199,50"); await expect(discount.locator("strong")).toHaveText("-₺20,50");
  await editDiscount.click(); await expect(discountInput).toHaveValue("20,50");
  await discountInput.fill("30"); await discount.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(total).toContainText("199,50");
  await editDiscount.click(); await expect(discountInput).toHaveValue("20,50");
  await discountInput.fill(","); await expect(discountInput).toHaveAttribute("aria-invalid", "true");
  await expect(discount.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
  await expect(cart.getByRole("alert")).toContainText("geçerli bir tutar");
  await discountInput.press("Escape"); await expect(total).toContainText("199,50");
  await editDiscount.click(); await discountInput.fill("999"); await discountInput.press("Enter");
  await expect(total).toContainText("0,00");
  await editDiscount.click(); await discountInput.fill(""); await discountInput.press("Enter");
  await expect(total).toContainText("220,00");
  await cart.getByRole("button", { name: "Su miktarını azalt", exact: true }).click();
  await expect(cart.locator(".market-sale-cart-line")).toHaveCount(1);
  await grid.getByRole("button", { name: /Su/ }).click(); await expect(total).toContainText("220,00");
  await expect(cart.locator("header")).toContainText("SEPET");
  await expect(cart.locator("header")).toContainText("2 kalem");
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Normal Müşteri"] });
  await expect(cart.locator(".customer-credit-selected-debt")).toContainText("Mevcut borç");
  await expect(methods.getByRole("button", { name: "Nakit", exact: true })).toHaveAttribute("aria-pressed", "true");
  const width = (await cart.boundingBox()).width;
  await methods.getByRole("button", { name: "Veresiye", exact: true }).click();
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi B"] }); await expect(total).toContainText("130,00");
  await expect(cart).toContainText("Mevcut borç"); assert.equal((await cart.boundingBox()).width, width);
  await expect(cart.getByRole("button", { name: "Satışı Veresiye Kaydet" })).toBeVisible();
  await expect(cart.getByRole("textbox", { name: "Ödeme tutarı", exact: true })).toHaveCount(0);
  await expect(cart.locator(".market-sale-totals > .customer-credit-selected-debt")).toContainText("Mevcut borç");
  for (const scheme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.colorScheme = value; document.documentElement.style.colorScheme = value; }, scheme);
    for (const viewport of [{ width: 1120, height: 680 }, { width: 1440, height: 1000 }, { width: 1650, height: 1000 }]) {
      await page.setViewportSize(viewport);
      const catalogBounds = await quick.locator(".market-sale-catalog").boundingBox(), cartBounds = await cart.boundingBox();
      assert.ok(catalogBounds.width / (catalogBounds.width + cartBounds.width) >= 0.65, "product area remains dominant");
      assert.ok(cartBounds.width >= 340 && cartBounds.width <= 440);
      const checkoutBounds = await cart.getByRole("button", { name: "Satışı Veresiye Kaydet" }).boundingBox();
      assert.ok(checkoutBounds.y + checkoutBounds.height <= viewport.height, `credit checkout remains inside viewport: ${JSON.stringify({ viewport, cartBounds, checkoutBounds, children: await cart.evaluate(element => [...element.children].map(child => ({ className: child.className, height: child.getBoundingClientRect().height }))) })}`);
      const paymentPanelBounds = await checkoutPanel.boundingBox(), basketPanelBounds = await cartPanel.boundingBox();
      assert.ok(paymentPanelBounds.y + paymentPanelBounds.height < basketPanelBounds.y, "payment and cart are separate stacked panels");
      assert.equal(paymentPanelBounds.x, basketPanelBounds.x); assert.equal(paymentPanelBounds.width, basketPanelBounds.width);
      assert.equal(await checkoutPanel.evaluate(element => !["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight <= element.clientHeight), true);
      const lineBounds = await cart.locator(".market-sale-cart-lines").boundingBox();
      assert.ok(lineBounds.height >= 80 && lineBounds.y + lineBounds.height <= cartBounds.y + cartBounds.height, `cart lines remain visible: ${JSON.stringify({ viewport, cartBounds, lineBounds, children: await cart.evaluate(element => [...element.children].map(child => ({ className: child.className, height: child.getBoundingClientRect().height }))) })}`);
      assert.equal(await cart.locator(".market-sale-checkout-fields").evaluate(element => !["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight <= element.clientHeight), true);
      await expect(cart.getByRole("button", { name: "Müşteri", exact: true })).toBeInViewport({ ratio: 1 });
      await expect(cart.locator(".market-sale-total-debt")).toHaveCount(0);
      assert.equal(await cart.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await editDiscount.click();
      await expect(discountInput).toBeVisible();
      assert.equal(await discount.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await discount.getByRole("button", { name: "Vazgeç", exact: true }).click();
      const pickerRow = cart.locator(".customer-credit-picker .market-inline-field");
      const pickerBounds = await pickerRow.getByRole("button", { name: "Müşteri", exact: true }).boundingBox();
      const clearBounds = await pickerRow.getByRole("button", { name: "Temizle", exact: true }).boundingBox();
      const createBounds = await pickerRow.getByRole("button", { name: "Yeni müşteri", exact: true }).boundingBox();
      assert.ok(createBounds.x >= pickerBounds.x + pickerBounds.width && clearBounds.x >= createBounds.x + createBounds.width && clearBounds.y < pickerBounds.y + pickerBounds.height);
      assert.ok(pickerBounds.width / (pickerBounds.width + createBounds.width) >= 0.65 && pickerBounds.width / (pickerBounds.width + createBounds.width) <= 0.75);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      mkdirSync("artifacts/screenshots/quick-sale", { recursive: true });
      for (const preset of ["comfortable", "balanced", "dense", "list"]) {
        await quick.getByLabel("Ürün görünümü", { exact: true }).selectOption(preset);
        await expect(grid).toHaveClass(new RegExp(`--${preset}`));
        assert.equal(await grid.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      }
      await quick.getByLabel("Ürün görünümü", { exact: true }).selectOption("balanced");
      await quick.screenshot({ path: `artifacts/screenshots/quick-sale/${scheme}-${viewport.width}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await methods.getByRole("button", { name: "Nakit", exact: true }).click();
  await expect(cart.getByRole("textbox", { name: "Ödeme tutarı", exact: true })).toBeVisible();
  const view = quick.getByLabel("Ürün görünümü", { exact: true });
  for (const preset of ["comfortable", "balanced", "dense", "list"]) { await view.selectOption(preset); await expect(grid).toHaveClass(new RegExp(`--${preset}`)); }
  await tabs.getByRole("button", { name: /Ürünler/ }).click(); await tabs.getByRole("button", { name: /Yeni İşlem/ }).click();
  await expect(view).toHaveValue("list");
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.sale-product-view"))), { preset: "list", showImages: true });
  await cart.locator("header").getByRole("button", { name: "Temizle", exact: true }).click(); await categories.getByRole("button", { name: "Tümü", exact: true }).click();
  await grid.getByRole("button", { name: /Elma kg/ }).click();
  await cart.getByRole("spinbutton", { name: "Elma kg miktarı" }).fill("0,375"); await cart.getByRole("spinbutton", { name: "Elma kg miktarı" }).press("Enter");
  await expect(total).toContainText("15,00");
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Bayi A"] }); await expect(total).toContainText("11,25");
  const submit = cart.getByRole("button", { name: "Ödeme Al" });
  await submit.click({ clickCount: 2 }); await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0);
  assert.equal(sales.length, 1); assert.equal(sales[0].customerId, ids["Bayi A"]);
  assert.equal(runtime.getRuntimeInventoryBalance(path, kg.id).quantity, 9.625);
  const sql = new DatabaseSync(path); try { assert.equal(sql.prepare("SELECT unit_price FROM commerce_sale_items ORDER BY created_at DESC LIMIT 1").get().unit_price, 30); } finally { sql.close(); }
  for (const [method, label] of [["cash", "Nakit"], ["card", "Kart"], ["transfer", "Havale / EFT"], ["other", "Diğer"]]) {
    await grid.getByRole("button", { name: /Su/ }).click();
    await methods.getByRole("button", { name: label, exact: true }).click();
    await editDiscount.click(); await discountInput.fill("2"); await discount.getByRole("button", { name: "Kaydet", exact: true }).click();
    await submit.click(); await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0);
    assert.equal(sales.at(-1).paymentMethod, method); assert.equal(sales.at(-1).settlement, "paid");
    assert.equal(sales.at(-1).discountTotal, 2);
    await expect(page.getByTestId("topbar-status")).toContainText("18,00");
    await expect(cart.locator(".market-sale-receipt")).toHaveCount(0);
  }
  await grid.getByRole("button", { name: /Su/ }).click();
  await editDiscount.click(); await discountInput.fill("10");
  await cart.locator("header").getByRole("button", { name: "Temizle", exact: true }).click();
  await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0); await expect(discountInput).toHaveCount(0);
  await expect(discount.locator("strong")).toHaveText("-₺0,00");
  await expect(cart.locator(".customer-credit-picker").getByRole("button", { name: "Temizle", exact: true })).toBeDisabled();
  // Manual tender uses the same atomic runtime for partial payment and old debt collection.
  const tender = cart.getByRole("textbox", { name: "Ödeme tutarı", exact: true });
  const accountDebt = () => runtime.getCustomerCreditAccount(path, ids["Normal Müşteri"]).balances.find(item => item.currency === "TRY")?.amountMinor ?? 0;
  await grid.getByRole("button", { name: /Su/ }).click(); await tender.fill("5");
  await expect(submit).toBeDisabled();
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Normal Müşteri"] });
  await expect(cart.locator(".customer-credit-selected-debt")).toContainText("₺0,00");
  await expect(cart.locator(".market-sale-totals > .market-sale-payment-difference")).toHaveText("Kalan veresiye₺15,00");
  await expect(cart.locator(".market-sale-total-debt")).toHaveCount(0);
  await submit.click(); await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0);
  assert.equal(accountDebt(), 1500); await expect(page.getByTestId("topbar-status")).toContainText("₺5,00 tahsil edildi");
  await grid.getByRole("button", { name: /Su/ }).click();
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Normal Müşteri"] });
  await expect(cart.locator(".customer-credit-selected-debt")).toContainText("₺15,00");
  await expect(cart.locator(".market-sale-total-debt")).toContainText("₺35,00");
  await expect(tender).toHaveValue("35,00");
  await expect(cart.getByText("Ödeme tutarı", { exact: true })).toHaveCount(0);
  await methods.getByRole("button", { name: "Kart", exact: true }).click();
  await expect(cart.locator(".customer-credit-selected-debt")).toContainText("₺15,00");
  await tender.fill("25"); await expect(cart.locator(".market-sale-totals > .market-sale-payment-difference")).toHaveText("Eski borca uygulanacak₺5,00");
  await page.setViewportSize({ width: 1120, height: 680 });
  await expect(tender).toBeInViewport({ ratio: 1 });
  await expect(cart.getByRole("button", { name: "Müşteri", exact: true })).toBeInViewport({ ratio: 1 });
  assert.equal(await cart.locator(".market-sale-totals").evaluate(element => element.querySelector(".market-sale-total-debt").previousElementSibling.classList.contains("customer-credit-selected-debt")), true);
  assert.equal(await cart.evaluate(element => element.scrollTop === 0 && element.scrollHeight <= element.clientHeight), true, JSON.stringify(await cart.evaluate(element => ({ top: element.scrollTop, scroll: element.scrollHeight, client: element.clientHeight }))));
  await editDiscount.click(); await expect(discountInput).toBeInViewport({ ratio: 1 });
  assert.equal(await cart.evaluate(element => element.scrollTop === 0 && element.scrollHeight <= element.clientHeight), true, JSON.stringify(await cart.evaluate(element => ({ top: element.scrollTop, scroll: element.scrollHeight, client: element.clientHeight }))));
  await discount.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await submit.click(); await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0);
  assert.equal(accountDebt(), 1000); await expect(page.getByTestId("topbar-status")).toContainText("Eski borçtan ₺5,00 düşüldü");
  await grid.getByRole("button", { name: /Su/ }).click();
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Normal Müşteri"] });
  await tender.fill("31"); await submit.click();
  await expect(page.getByTestId("topbar-status")).toContainText("Tutar mevcut veresiye borcunu aşamaz");
  await expect(cart.locator(".market-sale-cart-line")).toHaveCount(1); assert.equal(accountDebt(), 1000);
  await tender.fill("30"); await submit.click(); await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0);
  assert.equal(accountDebt(), 0);
  // An untouched tender collects the new sale and existing debt together.
  await grid.getByRole("button", { name: /Su/ }).click();
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Normal Müşteri"] });
  await tender.fill("5"); await submit.click();
  await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0); assert.equal(accountDebt(), 1500);
  await grid.getByRole("button", { name: /Su/ }).click();
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Normal Müşteri"] });
  await expect(tender).toHaveValue("35,00");
  await submit.click(); await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0);
  assert.equal(sales.at(-1).paymentAmountMinor, 3500); assert.equal(accountDebt(), 0);
  // Quick entry uses the canonical customer card; return selects the persisted record.
  await grid.getByRole("button", { name: /Su/ }).click(); await tender.fill("10");
  await expect(submit).toBeDisabled();
  await expect(cart.getByText("Bu ödeme için kayıtlı müşteri seçin.", { exact: true })).toHaveCount(0);
  await expect(cart.locator(".market-sale-totals > .market-sale-payment-difference")).toHaveText("Kalan veresiye₺10,00");
  const newCustomer = cart.getByRole("button", { name: "Yeni müşteri", exact: true });
  await newCustomer.click();
  const createCustomer = page.getByRole("dialog", { name: "Yeni müşteri ekle", exact: true });
  await expect(createCustomer).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(1);
  await createCustomer.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await expect(tender).toHaveValue("10"); await expect(total).toContainText("20,00");
  await newCustomer.click();
  await createCustomer.getByLabel("Ad soyad", { exact: true }).fill("Satışta Yeni Müşteri");
  await createCustomer.getByRole("button", { name: "Müşteri Kartını Kaydet", exact: true }).click();
  const savedCustomer = page.getByRole("dialog", { name: "Satışta Yeni Müşteri", exact: true });
  await expect(savedCustomer).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(1);
  await savedCustomer.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await expect(cart.getByRole("button", { name: "Müşteri", exact: true })).toContainText("Satışta Yeni Müşteri");
  await expect(tender).toHaveValue("10"); await expect(submit).toBeEnabled();
  await submit.click(); await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0);
  assert.equal(database.getCustomer(sales.at(-1).customerId).fullName, "Satışta Yeni Müşteri");
  // Manage canonical products and ordering through the same workspace/list.
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await expect(page.getByLabel("Sıra", { exact: true })).toHaveCount(0);
  const productRows = page.locator('.market-catalog-record[data-sort-kind="products"]');
  const elmaRow = productRows.filter({ hasText: "Elma kg" });
  await elmaRow.getByRole("button", { name: "Hızlı erişime ekle", exact: true }).click();
  await expect.poll(() => runtime.listRuntimeCatalogProducts(path).items.find(item => item.id === kg.id).quickAccessEnabled).toBe(true);
  await elmaRow.getByRole("button", { name: "Hızlı erişimden çıkar", exact: true }).click();
  await expect.poll(() => runtime.listRuntimeCatalogProducts(path).items.find(item => item.id === kg.id).quickAccessEnabled).toBe(false);
  await elmaRow.getByRole("button", { name: "Elma kg sırasını değiştir" }).focus(); await page.keyboard.press("ArrowUp");
  await expect.poll(() => reorderCalls.length).toBe(1);
  assert.deepEqual(runtime.listRuntimeCatalogProducts(path).items.map(item => item.id), [bread.id, kg.id, water.id]);
  await productRows.filter({ hasText: "Su" }).getByRole("button", { name: "Su sırasını değiştir" }).dragTo(productRows.filter({ hasText: "Ekmek" }), { targetPosition: { x: 100, y: 4 } });
  await expect.poll(() => reorderCalls.length).toBe(2);
  assert.deepEqual(runtime.listRuntimeCatalogProducts(path).items.map(item => item.id), [water.id, bread.id, kg.id]);
  // The mutation call precedes the paged catalog refresh. Touch coordinates must
  // refer to the refreshed DOM, and each gesture phase must reach React.
  await expect.poll(() => productRows.evaluateAll(rows => rows.map(row => row.dataset.sortId))).toEqual([water.id, bread.id, kg.id]);
  const touchHandle = elmaRow.getByRole("button", { name: "Elma kg sırasını değiştir" });
  const touchTarget = productRows.filter({ hasText: "Ekmek" });
  await expect(touchHandle).toBeEnabled();
  await touchHandle.scrollIntoViewIfNeeded(); await touchTarget.scrollIntoViewIfNeeded();
  const sourceBounds = await touchHandle.boundingBox();
  const targetBounds = await touchTarget.boundingBox();
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sourceBounds.x + sourceBounds.width / 2, y: sourceBounds.y + sourceBounds.height / 2 }] });
  await expect(elmaRow).toHaveClass(/is-dragging/);
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: targetBounds.x + targetBounds.width / 2, y: targetBounds.y + targetBounds.height / 4 }] });
  await expect(touchTarget).toHaveClass(/is-drop-before/);
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await touch.detach();
  await expect.poll(() => reorderCalls.length).toBe(3);
  assert.deepEqual(runtime.listRuntimeCatalogProducts(path).items.map(item => item.id), [water.id, kg.id, bread.id]);
  await expect(page.locator(`[data-sort-id="${category2.id}"]`).getByRole("button", { name: "İçecek sırasını değiştir" })).toBeEnabled();
  await page.locator(`[data-sort-id="${category2.id}"]`).getByRole("button", { name: "İçecek sırasını değiştir" }).focus(); await page.keyboard.press("ArrowUp");
  await expect.poll(() => reorderCalls.length).toBe(4);
  assert.equal(runtime.listRuntimeCatalogCategories(path)[0].id, category2.id);
  await page.locator(`[data-sort-id="${category1.id}"]`).getByRole("button", { name: "Gıda sırasını değiştir" }).dragTo(page.locator(`[data-sort-id="${category2.id}"]`), { targetPosition: { x: 100, y: 4 } });
  await expect.poll(() => reorderCalls.length).toBe(5);
  assert.equal(runtime.listRuntimeCatalogCategories(path)[0].id, category1.id);
  await page.getByRole("group", { name: "Ürün listesi" }).getByRole("button", { name: "Hızlı Erişim", exact: true }).click();
  await expect(page.locator(`[data-sort-id="${water.id}"]`).getByRole("button", { name: "Su sırasını değiştir" })).toBeEnabled();
  await page.locator(`[data-sort-id="${water.id}"]`).getByRole("button", { name: "Su sırasını değiştir" }).focus(); await page.keyboard.press("ArrowUp");
  await expect.poll(() => reorderCalls.length).toBe(6);
  assert.equal(reorderCalls[5][0], "quickAccess");
  await page.getByRole("group", { name: "Ürün listesi" }).getByRole("button", { name: "Tüm ürünler", exact: true }).click();
  await elmaRow.getByRole("button", { name: "Düzenle", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Elma kg", exact: true });
  await expect(workspace).toBeVisible(); await expect(workspace.getByRole("tab")).toHaveCount(0);
  await expect(workspace.getByLabel("Ürün adı", { exact: true })).toHaveValue("Elma kg");
  await expect(workspace.getByRole("button", { name: "Fotoğraf ekle" })).toBeEnabled();
  await workspace.getByLabel("Ürün adı", { exact: true }).fill("Elma kg taslak");
  await workspace.locator('input[type="file"]').setInputFiles({ name: "product.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP438DwHwAGgAJ/EEwb4QAAAABJRU5ErkJggg==", "base64") });
  const photo = workspace.getByRole("img", { name: "Seçili ürün fotoğrafı", exact: true });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  assert.equal(await photo.evaluate(image => getComputedStyle(image).objectFit), "contain");
  assert.equal(listPhotos(kg.id).photos.length, 1);
  await expect(workspace.getByLabel("Ürün adı", { exact: true })).toHaveValue("Elma kg taslak");
  await workspace.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(photo).toBeVisible();
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
  assert.equal(runtime.listRuntimeCatalogProducts(path).items.find(item => item.id === kg.id).isActive, false);
  await workspace.getByRole("checkbox", { name: "Aktif ürün" }).check();
  await workspace.getByRole("checkbox", { name: "Hızlı erişim", exact: true }).check();
  await workspace.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(workspace.getByRole("button", { name: "Ürünü Kaydet", exact: true })).toBeDisabled();
  assert.equal(runtime.listRuntimeCatalogProducts(path).items.find(item => item.id === kg.id).quickAccessEnabled, true);
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
  await tabs.getByRole("button", { name: /Yeni İşlem/ }).click();
  await page.reload(); await expect(page.getByLabel("Ürün görünümü", { exact: true })).toHaveValue("list");
  await expect(grid.locator(".market-sale-product > span > strong")).toHaveText(["Su", "Elma kg", "Ekmek"]);
  await expect(categories.getByRole("button")).toHaveText(["Tümü", "Hızlı Erişim", "Gıda · 2", "İçecek · 1"]);
  await categories.getByRole("button", { name: "Hızlı Erişim", exact: true }).click();
  await expect(grid.locator(".market-sale-product > span > strong")).toHaveText(["Su", "Ekmek", "Elma kg"]);
  // Creating a retail product continues in its canonical saved-product workspace.
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await page.getByRole("button", { name: "Yeni ürün", exact: true }).click();
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
  assert.equal(runtime.listRuntimeCatalogProducts(path).items.some(product => product.name === "Duman test ürünü"), true);

  const productToolbar = page.locator(".market-workspace--products .market-product-toolbar");
  await expect(page.getByText("Ürün kartları satış ve stok tarafından ortak kullanılır.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ürün gruplarını hiyerarşik olarak düzenleyin.", { exact: true })).toHaveCount(0);
  await expect(productToolbar.getByLabel("Ürün görünümü", { exact: true })).toHaveValue("list");
  for (const preset of ["comfortable", "balanced", "dense", "list"]) {
    await productToolbar.getByLabel("Ürün görünümü", { exact: true }).selectOption(preset);
    await expect(page.locator(".market-catalog-products")).toHaveClass(new RegExp(`--${preset}`));
    assert.equal(await page.locator(".market-catalog-products").evaluate(element => element.scrollWidth <= element.clientWidth), true);
  }
  await expect(page.locator(".market-catalog-products img")).toHaveCount(1);
  await productToolbar.getByRole("checkbox", { name: "Resimleri göster" }).uncheck();
  await expect(page.locator(".market-catalog-products img")).toHaveCount(0);
  await productToolbar.getByRole("textbox", { name: "Ürün ara", exact: true }).fill("no match");
  await expect(productRows).toHaveCount(0);
  await productToolbar.getByRole("button", { name: "Temizle", exact: true }).click(); await expect(productRows).toHaveCount(4);
  await page.reload(); await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await expect(productToolbar.getByRole("checkbox", { name: "Resimleri göster" })).not.toBeChecked();
  await tabs.getByRole("button", { name: /Yeni İşlem/ }).click();
  await expect(saleToolbar.getByRole("checkbox", { name: "Resimleri göster" })).toBeChecked();
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  // Category filters share search, while counts describe the full catalog.
  const filters = page.getByRole("group", { name: "Ürün listesi" });
  const search = page.getByPlaceholder("Ürün adı, marka, SKU veya barkod ara");
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
  await filters.evaluate(element => { element.scrollLeft = 0; }); await filters.hover(); await page.mouse.wheel(0, 240);
  await expect.poll(() => filters.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  const categoryScroll = await filters.evaluate(element => element.scrollLeft);
  await page.mouse.wheel(0, -160); await expect.poll(() => filters.evaluate(element => element.scrollLeft)).toBeLessThan(categoryScroll);

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
  // Reserve the expanded desktop sidebar and page gutters as well as the fixture's full canvas.
  await tabs.getByRole("button", { name: /Yeni İşlem/ }).click();
  await page.locator("main").evaluate(element => { element.style.marginInlineStart = "var(--sidebar-width)"; element.style.paddingInline = "var(--page-padding)"; });
  for (const width of [1120, 1440, 1650]) {
    await page.setViewportSize({ width, height: 800 });
    for (const preset of ["comfortable", "balanced", "dense", "list"]) {
      await quick.getByLabel("Ürün görünümü", { exact: true }).selectOption(preset);
      assert.equal(await grid.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      assert.equal(await cart.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    }
    await editDiscount.click(); await expect(discountInput).toBeInViewport();
    assert.equal(await discount.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    await discount.getByRole("button", { name: "Vazgeç", exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await tabs.getByRole("button", { name: /Ürünler/ }).click();
    for (const preset of ["comfortable", "balanced", "dense", "list"]) {
      await productToolbar.getByLabel("Ürün görünümü", { exact: true }).selectOption(preset);
      assert.equal(await page.locator(".market-catalog-products").evaluate(element => element.scrollWidth <= element.clientWidth), true);
      assert.equal(await productToolbar.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await expect(productToolbar.getByRole("button", { name: "Yeni ürün", exact: true })).toBeInViewport({ ratio: 1 });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await tabs.getByRole("button", { name: /Yeni İşlem/ }).click();
  }
  await page.locator("main").evaluate(element => { element.style.marginInlineStart = ""; element.style.paddingInline = ""; });
  await categories.evaluate(element => { element.scrollLeft = 0; }); await categories.hover(); await page.mouse.wheel(0, 240);
  await expect.poll(() => categories.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  const quickCategoryScroll = await categories.evaluate(element => element.scrollLeft);
  await page.mouse.wheel(0, -160); await expect.poll(() => categories.evaluate(element => element.scrollLeft)).toBeLessThan(quickCategoryScroll);
  await categories.evaluate(element => { element.scrollLeft = 0; }); await page.mouse.wheel(160, 0);
  await expect.poll(() => categories.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  // Both panes keep their own scroll position when a larger disposable catalog/cart is used.
  for (let index = 0; index < 12; index++) runtime.saveRuntimeCatalogProduct(path, { name: `Kaydırma ürünü ${index}`, salePrice: 10, trackInventory: false });
  await page.reload(); await page.setViewportSize({ width: 1120, height: 680 });
  await quick.getByLabel("Ürün görünümü", { exact: true }).selectOption("comfortable");
  for (let index = 0; index < 5; index++) await grid.getByRole("button", { name: new RegExp(`^Kaydırma ürünü ${index} `) }).click();
  const lines = cart.locator(".market-sale-cart-lines");
  await grid.evaluate(element => { element.scrollTop = 0; });
  await lines.evaluate(element => { element.scrollTop = 0; });
  await grid.hover(); await page.mouse.wheel(0, 300);
  await expect.poll(() => grid.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  assert.equal(await lines.evaluate(element => element.scrollTop), 0);
  const catalogScroll = await grid.evaluate(element => element.scrollTop);
  await lines.hover(); await page.mouse.wheel(0, 150);
  await expect.poll(() => lines.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  assert.equal(await grid.evaluate(element => element.scrollTop), catalogScroll);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  // Bulk operations use canonical writers, confirmation snapshots and filtered selection.
  const bulkCategory = runtime.saveRuntimeCatalogCategory(path, { name: "Toplu test" });
  const bulkFixtures = ["Toplu Alfa", "Toplu Beta", "Toplu Gama"].map((name, index) => runtime.saveRuntimeCatalogProduct(path, {
    name, categoryId: bulkCategory.id, sku: `BULK-${index}`, salePrice: 11 + index, dealerPriceA: 9, dealerPriceB: 8, description: "Korunacak açıklama", trackInventory: false, isActive: false, onlineSalesPublished: false
  }));
  const outsideBulk = runtime.saveRuntimeCatalogProduct(path, { name: "Seçim dışı ürün", salePrice: 7, trackInventory: false, isActive: false, onlineSalesPublished: false });
  await page.reload(); await page.setViewportSize({ width: 1440, height: 1000 });
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await filters.getByRole("button", { name: "Toplu test · 3", exact: true }).click();
  const bulkBar = page.getByRole("group", { name: "Toplu ürün işlemleri", exact: true });
  await expect(bulkBar).toContainText("0 seçili");
  for (const action of ["Aktif yap", "Hızlı erişime ekle", "Sil", "Webde yayınla"]) await expect(bulkBar.getByRole("button", { name: action, exact: true })).toBeDisabled();
  const selectProduct = name => productRows.getByRole("checkbox", { name: `${name} seç`, exact: true });
  await selectProduct("Toplu Alfa").check(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await bulkBar.getByRole("button", { name: "Temizle", exact: true }).click(); await expect(selectProduct("Toplu Alfa")).not.toBeChecked();
  await bulkBar.getByRole("button", { name: "Tümünü seç", exact: true }).click(); await expect(bulkBar).toContainText("3 seçili");
  await search.fill("Toplu Alfa"); await expect(bulkBar).toContainText("1 seçili");
  await productToolbar.getByRole("button", { name: "Temizle", exact: true }).click();
  await expect(bulkBar).toContainText("1 seçili"); await expect(selectProduct("Toplu Beta")).not.toBeChecked();
  await bulkBar.getByRole("button", { name: "Tümünü seç", exact: true }).click();
  let bulkBefore = bulkCalls.length;
  await bulkBar.getByRole("button", { name: "Aktif yap", exact: true }).click();
  let decision = page.getByRole("dialog", { name: "Toplu işlem: Aktif yap", exact: true });
  await expect(decision).toContainText("3 seçili ürüne"); assert.equal(bulkCalls.length, bulkBefore);
  await decision.getByRole("button", { name: "Vazgeç", exact: true }).click(); assert.equal(bulkCalls.length, bulkBefore);
  assert.equal(runtime.listRuntimeCatalogProducts(path).items.filter(item => bulkFixtures.some(record => record.id === item.id) && item.isActive).length, 0);
  await bulkBar.getByRole("button", { name: "Aktif yap", exact: true }).click();
  // A newer persisted price must survive activation of the previously displayed record.
  const fresh = runtime.saveRuntimeCatalogProduct(path, { ...bulkFixtures[0], salePrice: 17, sku: "FRESH-SKU" });
  await decision.getByRole("button", { name: "Aktif yap", exact: true }).click({ clickCount: 2 });
  await expect(decision).toHaveCount(0); assert.equal(bulkCalls.length - bulkBefore, 3);
  let savedBulk = runtime.listRuntimeCatalogProducts(path).items.filter(item => bulkFixtures.some(record => record.id === item.id));
  assert.equal(savedBulk.every(item => item.isActive), true);
  const activated = savedBulk.find(item => item.id === fresh.id);
  assert.deepEqual({ ...activated, updatedAt: "", isActive: false }, { ...fresh, updatedAt: "", isActive: false });
  await expect(bulkBar).toContainText("0 seçili");
  for (const item of bulkFixtures) assert.equal(database.getCommerceProductPublication(item.id).isPublished, false);
  for (const action of ["Hızlı erişime ekle", "Webde yayınla"]) {
    await bulkBar.getByRole("button", { name: "Tümünü seç", exact: true }).click();
    await bulkBar.getByRole("button", { name: action, exact: true }).click();
    decision = page.getByRole("dialog", { name: `Toplu işlem: ${action}`, exact: true });
    bulkBefore = bulkCalls.length; await expect(decision).toContainText("3 seçili ürüne"); assert.equal(bulkCalls.length, bulkBefore);
    if (action === "Webde yayınla") {
      await page.evaluate(() => window.__setSalesSnapshot({ ...window.__salesInitial.snapshot, enabledCapabilities: window.__salesInitial.snapshot.enabledCapabilities.filter(id => id !== "channel.online_sales") }));
      await expect(bulkBar.getByRole("button", { name: action, exact: true })).toBeDisabled();
      await decision.getByRole("button", { name: action, exact: true }).click(); await expect(decision).toHaveCount(0);
      assert.equal(bulkCalls.length, bulkBefore);
      await expect(page.getByTestId("topbar-status")).toContainText("online satış etkin olmalı");
      await page.evaluate(() => window.__setSalesSnapshot(window.__salesInitial.snapshot));
      await bulkBar.getByRole("button", { name: action, exact: true }).click();
    }
    await decision.getByRole("button", { name: action, exact: true }).click(); await expect(decision).toHaveCount(0);
    assert.equal(bulkCalls.length - bulkBefore, 3);
  }
  savedBulk = runtime.listRuntimeCatalogProducts(path).items.filter(item => bulkFixtures.some(record => record.id === item.id));
  assert.equal(savedBulk.every(item => item.quickAccessEnabled), true);
  for (const item of bulkFixtures) assert.equal(database.getCommerceProductPublication(item.id).isPublished, true);
  assert.equal(runtime.listRuntimeCatalogProducts(path).items.find(item => item.id === outsideBulk.id).isActive, false);
  assert.equal(database.getCommerceProductPublication(outsideBulk.id).isPublished, false);
  await bulkBar.getByRole("button", { name: "Tümünü seç", exact: true }).click();
  await page.evaluate(() => window.__setSalesSnapshot({ ...window.__salesInitial.snapshot, enabledCapabilities: window.__salesInitial.snapshot.enabledCapabilities.filter(id => id !== "channel.online_sales") }));
  await expect(bulkBar.getByRole("button", { name: "Webde yayınla", exact: true })).toBeDisabled();
  await page.evaluate(() => window.__setSalesSnapshot(window.__salesInitial.snapshot));
  await expect(bulkBar.getByRole("button", { name: "Webde yayınla", exact: true })).toBeEnabled();
  for (const width of [1120, 1440, 1650]) {
    await page.setViewportSize({ width, height: 680 });
    assert.equal(await bulkBar.evaluate(element => getComputedStyle(element).flexWrap === "nowrap" && element.getBoundingClientRect().width <= element.parentElement.clientWidth), true);
    await expect(productRows.first()).toBeInViewport();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  bulkDeleteFailure = bulkFixtures[1].id;
  await bulkBar.getByRole("button", { name: "Sil", exact: true }).click();
  decision = page.getByRole("dialog", { name: "Toplu işlem: Sil", exact: true });
  await decision.getByRole("button", { name: "Sil", exact: true }).click(); await expect(decision).toHaveCount(0);
  await expect(page.getByTestId("topbar-status")).toContainText("2/3 ürün işlendi. 1 ürün işlenemedi.");
  await expect(bulkBar).toContainText("1 seçili"); await expect(selectProduct("Toplu Beta")).toBeChecked();
  await expect(productRows).toHaveCount(1);
  for (const item of [bulkFixtures[0], bulkFixtures[2]]) assert.equal(database.getCommerceProductPublication(item.id).isPublished, false);
  bulkDeleteFailure = "";
  await bulkBar.getByRole("button", { name: "Sil", exact: true }).click();
  await page.getByRole("dialog", { name: "Toplu işlem: Sil", exact: true }).getByRole("button", { name: "Sil", exact: true }).click();
  await expect(productRows).toHaveCount(0); await expect(bulkBar).toContainText("0 seçili");
  // One cart dispatches to independent canonical Sale and Order operations.
  const orderProduct = runtime.saveRuntimeCatalogProduct(path, { name: "İşlem test ürünü", salePrice: 100, dealerPriceA: 80, dealerPriceB: 60, trackInventory: true });
  runtime.setRuntimeInventoryCount(path, { productId: orderProduct.id, countedQuantity: 20 });
  await page.evaluate(data => window.__emitSalesDashboard(data), database.getDashboardData());
  await tabs.getByRole("button", { name: "Yeni İşlem", exact: true }).click();
  await productSearch.fill("İşlem test");
  const orderSql = new DatabaseSync(path);
  const sideEffects = () => ["commerce_sales", "inventory_movements", "finance_entries", "customer_credit_entries"].map(table => Number(orderSql.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count));
  const beforeOrders = sideEffects();
  for (const [customerName, expected] of [["Normal Müşteri", 95], ["Bayi A", 75], ["Bayi B", 55]]) {
    await grid.getByRole("button", { name: /İşlem test ürünü/ }).click();
    await methods.getByRole("button", { name: "Kart", exact: true }).click();
    await methods.getByRole("button", { name: "Sipariş", exact: true }).click();
    await expect(cart.getByRole("button", { name: "Siparişi Kaydet", exact: true })).toBeDisabled();
    await chooseSearchSelect(cart, "Müşteri", { value: ids[customerName] });
    await expect(cart.getByLabel("Ödeme tutarı", { exact: true })).toHaveCount(0);
    await expect(methods.getByRole("button", { name: "Kart", exact: true })).toHaveCount(0);
    await methods.getByRole("button", { name: "Satış", exact: true }).click();
    await expect(methods.getByRole("button", { name: "Kart", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(cart.locator(".market-sale-cart-line")).toHaveCount(1);
    await methods.getByRole("button", { name: "Sipariş", exact: true }).click();
    await editDiscount.click(); await discountInput.fill("5"); await discount.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(total).toContainText(`${expected},00`);
    await cart.getByLabel("Sipariş notu", { exact: true }).fill(`${customerName} siparişi`);
    await cart.getByRole("button", { name: "Siparişi Kaydet", exact: true }).click({ clickCount: 2 });
    const detail = page.getByRole("region", { name: "Sipariş detayı", exact: true });
    await expect(detail).toContainText(`${customerName} siparişi`);
    await expect(detail.locator(".market-sale-grand-total")).toContainText(`${expected},00`);
    const row = orderSql.prepare("SELECT id, total, status FROM commerce_orders WHERE note = ?").get(`${customerName} siparişi`);
    assert.equal(row.total, expected); assert.equal(row.status, "placed");
    assert.deepEqual(sideEffects(), beforeOrders, "Placing an order creates no sale, stock, finance or debt entries");
    await tabs.getByRole("button", { name: "Yeni İşlem", exact: true }).click();
    await expect(cart.locator(".market-sale-cart-line")).toHaveCount(0);
  }
  // Retail ORDERS works independently of wholesale, while dealer pricing remains gated.
  orderSql.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.wholesale'").run();
  const retailSnapshot = readBusinessCapabilitySnapshot(path);
  await page.evaluate(snapshot => window.__setSalesSnapshot(snapshot), retailSnapshot);
  assert.equal(retailSnapshot.enabledCapabilities.includes("commerce.orders"), true);
  await expect(tabs.getByRole("button", { name: "Siparişler", exact: true })).toBeVisible();
  await grid.getByRole("button", { name: /İşlem test ürünü/ }).click();
  await chooseSearchSelect(cart, "Müşteri", { value: ids["Normal Müşteri"] });
  await methods.getByRole("button", { name: "Sipariş", exact: true }).click();
  await expect(total).toContainText("100,00");
  await cart.getByRole("button", { name: "Siparişi Kaydet", exact: true }).click();
  await expect(page.getByRole("region", { name: "Sipariş detayı", exact: true })).toContainText("Normal Müşteri");
  await tabs.getByRole("button", { name: "Yeni İşlem", exact: true }).click();
  const retailOrder = runtime.createRuntimeOrder(path, { customerId: ids["Normal Müşteri"], sourceReference: "retail-order", items: [{ productId: orderProduct.id, quantity: 1 }] }, { desktopEntry: true });
  assert.equal(retailOrder.order.total, 100);
  assert.equal(runtime.resolveRuntimeProductPrice(path, { productId: orderProduct.id, customerId: ids["Bayi A"] }).unitPrice, 100);
  assert.throws(() => runtime.createRuntimeOrder(path, { sourceReference: "no-customer", items: [{ productId: orderProduct.id, quantity: 1 }] }, { desktopEntry: true }), /kayıtlı müşteri/);
  orderSql.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id IN ('commerce.orders', 'channel.online_sales')").run();
  await page.evaluate(snapshot => window.__setSalesSnapshot(snapshot), readBusinessCapabilitySnapshot(path));
  await expect(methods.getByRole("button", { name: "Sipariş", exact: true })).toHaveCount(0);
  await expect(tabs.getByRole("button", { name: "Siparişler", exact: true })).toHaveCount(0);
  assert.throws(() => runtime.createRuntimeOrder(path, { customerId: ids["Normal Müşteri"], sourceReference: "forbidden", items: [{ productId: orderProduct.id, quantity: 1 }] }, { desktopEntry: true }), /etkin değil/);
  orderSql.close();
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
