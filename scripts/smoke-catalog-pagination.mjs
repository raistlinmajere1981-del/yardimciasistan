import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { chooseSearchSelect } from "./test-helpers/search-select.mjs";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const runtime = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { readBusinessCapabilitySnapshot } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const presentation = require("../apps/desktop-app/dist-electron/commerce-catalog-presentation-store.js");
const directory = mkdtempSync(join(tmpdir(), "catalog-pagination-"));
const database = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: directory });
let sql, server, browser, page;
const errors = [], timings = [], queries = [];
try {
  database.initialize();
  assert.equal(database.saveInitialSetup({ businessName: "Pagination fixture", profileId: "market", profileOptions: ["commerce.wholesale", "commerce.customer_credit"],
    phone: "", whatsapp: "", email: "", address: "", webModuleUrl: "https://example.test", syncSecret: "fixture-secret", autoSyncEnabled: false,
    aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiModelOptions: [], aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30,
    aiApiKey: "", clearAiApiKey: false, servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] }).ok, true);
  const path = database.databasePath;
  const firstCategory = runtime.saveRuntimeCatalogCategory(path, { name: "Tekler" });
  const secondCategory = runtime.saveRuntimeCatalogCategory(path, { name: "Çiftler" });
  const seed = runtime.saveRuntimeCatalogProduct(path, { name: "Katalog 00000", categoryId: firstCategory.id, salePrice: 100, dealerPriceA: 80, dealerPriceB: 60, trackInventory: true });
  const customers = {};
  for (const [name, group] of [["Normal", null], ["Bayi A", "dealer_a"], ["Bayi B", "dealer_b"]]) {
    const result = database.saveCustomer({ fullName: name, phone: "", ...(group ? { commercialProfile: { dealerStatus: "active", priceGroup: group, companyName: name } } : {}) });
    assert.equal(result.ok, true); customers[name] = result.savedId;
  }
  sql = new DatabaseSync(path);
  const columns = sql.prepare("PRAGMA table_info(catalog_products)").all().map(row => row.name);
  const fields = new Set(["id", "name", "category_id", "sku", "brand", "barcode", "sort_order", "is_active", "quick_access_enabled", "quick_access_order"]);
  const insert = sql.prepare(`INSERT INTO catalog_products (${columns.join(",")}) SELECT ${columns.map(column => fields.has(column) ? "?" : column).join(",")} FROM catalog_products WHERE id = ?`);
  sql.exec("BEGIN");
  for (let index = 1; index <= 1001; index++) {
    const values = { id: `pagination-${index}`, name: `Katalog ${String(index).padStart(5, "0")}${index <= 60 ? " GENLEŞME TANKI DÖNÜŞTÜRÜCÜ REDÜKSİYON YOĞUŞMALI ANAKART" : ""}`, category_id: index % 2 ? secondCategory.id : firstCategory.id,
      sku: index === 1 ? "UZUN-KESİNTİSİZ-ÜRÜN-KODU-123456789012345678901234567890" : `SKU-${index}`, brand: index === 1001 ? "İleri Marka" : "Katalog Markası", barcode: `869${String(index).padStart(10, "0")}`, sort_order: index, is_active: index === 1000 ? 0 : 1,
      quick_access_enabled: index % 10 === 0 ? 1 : 0, quick_access_order: index };
    insert.run(...columns.filter(column => fields.has(column)).map(column => values[column]), seed.id);
  }
  sql.exec("COMMIT");
  const catalog = options => {
    const start = performance.now(), result = runtime.listRuntimeCatalogProducts(path, options);
    timings.push(performance.now() - start); return result;
  };
  const all = catalog({ limit: 60 });
  assert.equal(all.total, 1002); assert.equal(all.items.length, 60);
  assert.deepEqual(all.counts, { total: 1002, quickAccess: 100, categories: { [firstCategory.id]: 501, [secondCategory.id]: 501 } });
  assert.equal(catalog({ activeOnly: true }).total, 1001);
  assert.equal(catalog({ activeOnly: true, quickAccessOnly: true }).total, 99);
  for (const search of ["Katalog 01001", "sku-1001", "ileri marka", "8690000001001"]) {
    assert.equal(catalog({ search, activeOnly: true }).items[0]?.id, "pagination-1001");
    assert.equal(catalog({ search, categoryId: secondCategory.id, activeOnly: true }).total, 1);
    assert.equal(catalog({ search, categoryId: firstCategory.id, activeOnly: true }).total, 0);
  }
  for (const limit of [50, 100]) {
    const ids = []; let offset = 0;
    while (offset !== null) { const result = catalog({ activeOnly: true, limit, offset }); ids.push(...result.items.map(product => product.id)); offset = result.nextOffset; }
    assert.equal(ids.length, 1001); assert.equal(new Set(ids).size, 1001); assert.equal(ids.at(-1), "pagination-1001");
  }
  assert.equal(catalog({ productId: "pagination-1000" }).items[0].isActive, false);
  assert.equal(catalog({ productId: "pagination-1000", activeOnly: true }).total, 0);
  for (const [name, price] of [["Normal", 100], ["Bayi A", 80], ["Bayi B", 60]]) {
    const result = catalog({ search: "SKU-1001", activeOnly: true, customerId: customers[name] });
    assert.equal(result.prices["pagination-1001"].unitPrice, price);
  }
  const pageBefore = catalog({ offset: 60 }), firstBefore = catalog({ offset: 0 }).items.map(product => product.id);
  const reversed = pageBefore.items.map(product => product.id).reverse();
  presentation.reorderCatalogRecords(path, "products", reversed, { offset: 60, total: 1002 });
  assert.deepEqual(catalog({ offset: 60 }).items.map(product => product.id), reversed);
  assert.deepEqual(catalog({ offset: 0 }).items.map(product => product.id), firstBefore);
  assert.throws(() => presentation.reorderCatalogRecords(path, "products", reversed, { offset: 60, total: 1001 }), /yeniden yükleyin/);
  const plan = sql.prepare("EXPLAIN QUERY PLAN SELECT id FROM catalog_products WHERE business_id = ? AND deleted_at = '' AND is_active = 1 ORDER BY sort_order, name COLLATE NOCASE, id LIMIT 60 OFFSET 960").all(seed.businessId);
  assert.ok(plan.some(row => String(row.detail).includes("idx_catalog_products_sale_page")), JSON.stringify(plan));

  // A full page with long names, mixed images and horizontally scrolling categories.
  for (let index = 0; index < 18; index++) runtime.saveRuntimeCatalogCategory(path, { name: `Uzun kategori ${index + 1}` });
  sql.prepare("UPDATE catalog_products SET image_asset_path = 'fixture.svg' WHERE id IN ('pagination-1', 'pagination-3', 'pagination-5')").run();

  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  let releaseOld, holdOld = false, failQuery = false;
  await page.exposeFunction("__catalogCall", async (method, ...args) => {
    if (method === "listProducts") {
      const result = catalog(args[0]); queries.push({ ...args[0], returned: result.items.length });
      if (holdOld && args[0]?.search === "SKU-900") { holdOld = false; await new Promise(done => { releaseOld = done; }); }
      if (failQuery) { failQuery = false; throw new Error("Katalog sorgusu test hatası"); }
      return result;
    }
    const methods = { listCategories: runtime.listRuntimeCatalogCategories, listOrders: runtime.listRuntimeOrders, getOrder: runtime.getRuntimeOrder,
      getInventoryBalance: runtime.getRuntimeInventoryBalance, listInventoryMovements: runtime.listRuntimeInventoryMovements,
      getCustomerCreditAccount: runtime.getCustomerCreditAccount, resolveProductPrice: runtime.resolveRuntimeProductPrice };
    if (methods[method]) return methods[method](path, ...args);
    if (method === "getProductImageDataUrl") return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="orange"/></svg>')}`;
    if (method === "getProductPublication") return database.getCommerceProductPublication(args[0]);
    if (method === "getCustomer") return database.getCustomer(args[0]);
    throw new Error(`Unexpected pagination call: ${method}`);
  });
  const initial = { snapshot: readBusinessCapabilitySnapshot(path), customers: database.getDashboardData().customers, dashboardData: database.getDashboardData() };
  await page.addInitScript(initial => {
    window.__salesInitial = initial;
    const methods = ["listProducts", "listCategories", "listOrders", "getOrder", "getInventoryBalance", "listInventoryMovements", "getCustomerCreditAccount", "resolveProductPrice", "getProductImageDataUrl", "getProductPublication"];
    window.yardimciDesktop = { commerce: Object.fromEntries(methods.map(method => [method, (...args) => window.__catalogCall(method, ...args)])), getCustomer: id => window.__catalogCall("getCustomer", id) };
    window.__longTasks = [];
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__longTasks.push(entry.duration); }).observe({ type: "longtask", buffered: true });
  }, initial);
  await page.route("**/catalog-pagination-test*", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/catalog-pagination-test", `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/sales-workspace.tsx")}"></script></body></html>`) }));
  await page.goto(`${server.resolvedUrls.local[0]}catalog-pagination-test`);
  const quick = page.locator(".market-quick-sale-layout"), grid = quick.locator(".market-sale-product-grid"), cart = quick.locator(".market-sale-sidebar"), controls = quick.getByLabel("Ürün sayfaları", { exact: true });
  await expect(grid.getByRole("button")).toHaveCount(60, { timeout: 45000 });
  await expect(quick.getByRole("button", { name: "Tekler · 500", exact: true })).toBeVisible();
  await expect(quick.getByRole("button", { name: "Çiftler · 501", exact: true })).toBeVisible();
  assert.ok(queries.every(query => query.returned <= 60 && query.limit <= 60), "Opening Desktop must not preload the catalog");
  const categories = quick.getByRole("group", { name: "Ürün kategorileri" });
  const imageToggle = quick.getByRole("checkbox", { name: "Resimleri göster" });
  mkdirSync("artifacts/screenshots/catalog-pagination", { recursive: true });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1120, height: 680 }]) {
    await page.setViewportSize(viewport);
    for (const preset of ["balanced", "list", "comfortable", "dense"]) {
      await quick.getByLabel("Ürün görünümü", { exact: true }).selectOption(preset);
      for (const showImages of [true, false]) {
        await imageToggle.setChecked(showImages);
        await expect(grid.locator("img")).toHaveCount(showImages ? 3 : 0);
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        const problems = await quick.locator(".market-sale-catalog").evaluate(catalog => {
          const grid = catalog.querySelector(".market-sale-product-grid");
          const chips = catalog.querySelector(".market-category-chips");
          const toolbar = catalog.querySelector(".market-product-toolbar").getBoundingClientRect();
          const pagination = catalog.querySelector(".market-catalog-pagination").getBoundingClientRect();
          const pane = catalog.getBoundingClientRect(), area = grid.getBoundingClientRect(), row = chips.getBoundingClientRect();
          const errors = [];
          if (row.height + 1 < chips.querySelector("button").getBoundingClientRect().height) errors.push("Category controls are vertically clipped");
          if (row.top < toolbar.bottom - 1 || row.bottom > area.top + 1 || pagination.top < area.bottom - 1 || pagination.bottom > pane.bottom + 1) errors.push("Catalog controls overlap or leave the pane");
          if (grid.scrollHeight <= grid.clientHeight || grid.scrollWidth > grid.clientWidth + 1) errors.push("Product scrolling is missing or horizontal");
          for (const card of grid.querySelectorAll(".market-sale-product")) {
            const box = card.getBoundingClientRect();
            for (const element of card.querySelectorAll("strong, small, b, img")) {
              const range = document.createRange(); range.selectNodeContents(element);
              const bounds = element.tagName === "IMG" ? [element.getBoundingClientRect()] : [...range.getClientRects()];
              if (bounds.some(bound => bound.top < box.top - 1 || bound.bottom > box.bottom + 1 || bound.left < box.left - 1 || bound.right > box.right + 1)) {
                errors.push(`Product content leaves its card: ${element.tagName} ${element.textContent}`);
              }
            }
          }
          return errors;
        });
        assert.deepEqual(problems, [], `${viewport.width}x${viewport.height} ${preset} images=${showImages}`);
        const categoryBounds = await categories.boundingBox();
        await grid.locator(".market-sale-product").last().scrollIntoViewIfNeeded();
        assert.deepEqual(await categories.boundingBox(), categoryBounds, "Product scrolling must leave category controls in place");
        await expect(grid.locator(".market-sale-product").last()).toBeInViewport();
        await grid.evaluate(element => { element.scrollTop = 0; });
        if (viewport.width === 1920 && showImages && ["balanced", "list"].includes(preset)) {
          await page.screenshot({ path: `artifacts/screenshots/catalog-pagination/long-catalog-${preset}.png` });
        }
      }
    }
    await categories.hover(); await page.mouse.wheel(700, 0);
    await expect.poll(() => categories.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await categories.getByRole("button", { name: "Tümü", exact: true }).scrollIntoViewIfNeeded();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await quick.getByLabel("Ürün görünümü", { exact: true }).selectOption("balanced");
  for (let index = 0; index < 16; index++) {
    await controls.getByRole("button", { name: "Sonraki", exact: true }).click();
    await expect(controls).toContainText(`${(index + 1) * 60 + 1}–`);
  }
  await expect(grid.getByRole("button")).toHaveCount(41);
  await expect(controls.getByRole("button", { name: "Sonraki", exact: true })).toBeDisabled();
  await grid.getByRole("button", { name: /Katalog 01001/ }).click();
  await expect(cart.locator(".market-sale-cart-line")).toHaveCount(1);
  await chooseSearchSelect(cart, "Müşteri", { value: customers["Bayi B"] });
  await expect(cart.locator(".market-sale-grand-total")).toContainText("60,00");
  const search = quick.getByPlaceholder("Ürün adı, marka, SKU veya barkod ara");
  holdOld = true; await search.fill("SKU-900"); await expect.poll(() => typeof releaseOld).toBe("function");
  await search.fill("SKU-1001"); await expect(grid.getByRole("button")).toHaveCount(1); await expect(grid).toContainText("01001");
  releaseOld(); await expect(controls).toContainText("1–1 / 1 ürün"); await expect(grid).toContainText("01001");
  await quick.getByRole("button", { name: "Tekler · 500", exact: true }).click(); await expect(grid.getByRole("button")).toHaveCount(0);
  await quick.getByRole("button", { name: "Çiftler · 501", exact: true }).click(); await expect(grid.getByRole("button")).toHaveCount(1);
  await expect(cart.locator(".market-sale-grand-total")).toContainText("60,00");
  await quick.getByRole("button", { name: "Tümü", exact: true }).click();
  failQuery = true; await search.fill("sorgu-hatasi"); await expect(controls.getByRole("alert")).toContainText("test hatası");
  await controls.getByRole("button", { name: "Yeniden dene", exact: true }).click(); await expect(controls.getByRole("alert")).toHaveCount(0);
  await search.fill(""); await expect(grid.getByRole("button")).toHaveCount(60);
  await expect(cart.locator(".market-sale-cart-line")).toHaveCount(1);
  const tabs = page.getByRole("navigation", { name: "Satış çalışma alanları" });
  await tabs.getByRole("button", { name: "Ürünler", exact: true }).click();
  const management = page.locator(".market-catalog-products"), managementSearch = page.getByPlaceholder("Ürün adı, marka, SKU veya barkod ara");
  await managementSearch.fill("SKU-1000"); await expect(management.locator("article")).toHaveCount(1); await expect(management).toContainText("Pasif");
  await managementSearch.fill("SKU-1001"); await expect(management).toContainText("SKU-1001"); await management.getByRole("button", { name: "Düzenle", exact: true }).click();
  const productWorkspace = page.getByRole("dialog", { name: /Katalog 01001/ });
  await expect(productWorkspace).toBeVisible(); await productWorkspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await tabs.getByRole("button", { name: "Stok", exact: true }).click(); await page.getByRole("button", { name: "Ürün", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Ürün seçici", exact: true });
  await picker.getByRole("combobox").fill("SKU-1001"); await expect(picker.getByRole("option")).toHaveCount(1); await picker.getByRole("option").click();
  await expect(page.locator(".market-stock-card")).toContainText("01001");
  await tabs.getByRole("button", { name: "Yeni İşlem", exact: true }).click();
  await expect(cart.locator(".market-sale-grand-total")).toContainText("60,00"); await search.fill("SKU-1000"); await expect(grid.getByRole("button")).toHaveCount(0);
  assert.deepEqual(errors, []);
  mkdirSync("artifacts/screenshots/catalog-pagination", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/catalog-pagination/1002-products.png" });
  console.log("catalog-pagination-smoke-ok", JSON.stringify({ records: 1002, active: 1001, queries: queries.length, maxSqlQueryMs: Math.round(Math.max(...timings)), maxBrowserLongTaskMs: Math.round(Math.max(0, ...await page.evaluate(() => window.__longTasks))) }));
} catch (error) {
  if (page) console.error("pagination-ui-failure", (await page.locator("body").innerText()).slice(0, 3000));
  throw error;
} finally { await browser?.close(); await server?.close(); sql?.close(); database.close(); rmSync(directory, { recursive: true, force: true }); }
