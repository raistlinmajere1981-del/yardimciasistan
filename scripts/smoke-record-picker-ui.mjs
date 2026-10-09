import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const runtime = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { readBusinessCapabilitySnapshot } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const appPath = join(process.cwd(), "apps/desktop-app");
const dataDir = mkdtempSync(join(tmpdir(), "yardimci-record-picker-"));
const database = new DesktopDatabase({ appPath, userDataPath: dataDir });
let raw, server, browser;
try {
  database.initialize();
  const setup = database.saveInitialSetup({ businessName: "Picker smoke", profileId: "market", profileOptions: ["commerce.wholesale", "retail.suppliers", "retail.barcode", "commerce.customer_credit", "retail.labels"],
    phone: "", whatsapp: "", email: "", address: "", webModuleUrl: "https://example.test", syncSecret: "picker-smoke-secret-only", autoSyncEnabled: false,
    aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiModelOptions: [], aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30,
    aiApiKey: "", clearAiApiKey: false, servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] });
  assert.equal(setup.ok, true, setup.message);
  const product = runtime.saveRuntimeCatalogProduct(database.databasePath, { name: "Örnek Ürün", sku: "BASE-001", barcode: "8699999999999", salePrice: 100, dealerPriceA: 80, trackInventory: true });
  const supplier = runtime.saveRuntimeSupplier(database.databasePath, { name: "Örnek Tedarikçi" });
  const names = ["Ahmet", "Çetin", "Derya", "Ece", "Fatma", "Gül", "Hasan", "Işıl", "İpek", "Jale", "Kemal", "Leyla", "Mert", "Nalan", "Oya", "Ömer", "Pelin", "Rıza", "Seda", "Şule", "Tamer", "Umut", "Ümit", "Veli", "Yasemin", "Zeynep", "Ğ Test"];
  for (let i = 0; i < 181; i++) {
    const saved = database.saveCustomer({ fullName: `${names[i % names.length]} ${String(i).padStart(3, "0")}`, phone: `+90555${String(i).padStart(7, "0")}`,
      commercialProfile: { companyName: `Firma ${i}`, dealerStatus: i < 3 ? "active" : i === 3 ? "inactive" : "candidate", priceGroup: "dealer_a" } });
    assert.equal(saved.ok, true, saved.message);
  }
  raw = new DatabaseSync(database.databasePath);
  // Bulk seed a real SQLite catalog; runtime search/eligibility and inventory reads stay canonical.
  const columns = raw.prepare("PRAGMA table_info(catalog_products)").all().map(row => row.name);
  const overrides = new Set(["id", "name", "sku", "barcode", "sort_order", "image_asset_path"]);
  const insert = raw.prepare(`INSERT INTO catalog_products (${columns.join(",")}) SELECT ${columns.map(column => overrides.has(column) ? "?" : column).join(",")} FROM catalog_products WHERE id = ?`);
  raw.exec("BEGIN");
  for (let i = 1; i <= 10020; i++) {
    const values = { id: `picker-product-${i}`, name: `Katalog Ürünü ${String(i).padStart(5, "0")}`, sku: `PICK-${i}`, barcode: `869${String(i).padStart(10, "0")}`, sort_order: i,
      image_asset_path: i === 1 || i === 2 ? `assets/products/picker-product-${i}/front.jpg` : "" };
    insert.run(...columns.filter(column => overrides.has(column)).map(column => values[column]), product.id);
  }
  raw.exec("COMMIT");
  raw.prepare("UPDATE catalog_products SET track_inventory = 0 WHERE id = ?").run("picker-product-10019");
  const supplierColumns = raw.prepare("PRAGMA table_info(commerce_suppliers)").all().map(row => row.name);
  const supplierInsert = raw.prepare(`INSERT INTO commerce_suppliers (${supplierColumns.join(",")}) SELECT ${supplierColumns.map(column => ["id", "name"].includes(column) ? "?" : column).join(",")} FROM commerce_suppliers WHERE id = ?`);
  raw.exec("BEGIN");
  for (let i = 0; i < 820; i++) supplierInsert.run(`picker-supplier-${i}`, `Tedarikçi ${String(i).padStart(4, "0")}`, supplier.id);
  raw.exec("COMMIT");
  assert.equal(runtime.listRuntimeCatalogProducts(database.databasePath, { search: "PICK-10020", activeOnly: true })[0]?.id, "picker-product-10020");
  assert.equal(runtime.listRuntimeCatalogProducts(database.databasePath, { search: "Katalog Ürünü 00820", activeOnly: true })[0]?.id, "picker-product-820");
  assert.equal(runtime.listRuntimeCatalogProducts(database.databasePath, { search: "8690000010020", activeOnly: true })[0]?.id, "picker-product-10020");
  assert.equal(runtime.listRuntimeSuppliers(database.databasePath, { search: "Tedarikçi 0819", activeOnly: true })[0]?.id, "picker-supplier-819");
  console.log("record-picker-catalog-preflight-ok: canonical SQLite search beyond 500/820 in a 10021-product catalog; 821 suppliers");
  const schemaBefore = raw.prepare("SELECT sql FROM sqlite_master ORDER BY name").all();
  const countsBefore = Object.fromEntries(["catalog_products", "commerce_suppliers", "customers", "customer_commercial_profiles", "inventory_movements", "commerce_sales", "customer_credit_entries", "commerce_orders"].map(table => [table, raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
  const calls = [], pageErrors = [], requests = [];
  let holdSearch = false, releaseSearch, failSearch = false;
  server = await createServer({ root: appPath, configFile: join(appPath, "vite.renderer.config.ts"), logLevel: "error", server: { host: "127.0.0.1", port: 0 },
    plugins: [{ name: "record-picker-smoke", configureServer(instance) {
      instance.middlewares.use("/record-picker-smoke", async (_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(await instance.transformIndexHtml("/record-picker-smoke", `<!doctype html><html lang="tr" data-color-scheme="light" data-density="compact" data-accent="coral" data-font="plex" data-motion="system"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/${join(process.cwd(), "scripts/fixtures/record-picker-ui.tsx")}"></script></body></html>`));
      });
    } }] });
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 }, locale: "tr-TR" });
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => requests.push(request.url()));
  const methods = {
    listProducts: runtime.listRuntimeCatalogProducts, listCategories: runtime.listRuntimeCatalogCategories,
    getInventoryBalance: runtime.getRuntimeInventoryBalance, listInventoryMovements: runtime.listRuntimeInventoryMovements,
    listSuppliers: runtime.listRuntimeSuppliers, listPurchaseOrders: runtime.listRuntimePurchaseOrders,
    listOrders: runtime.listRuntimeOrders, resolveProductPrice: runtime.resolveRuntimeProductPrice,
    getCustomerCreditAccount: runtime.getCustomerCreditAccount
  };
  await page.exposeFunction("__pickerCall", async (method, args) => {
    calls.push({ method, args });
    if (method === "getProductImageDataUrl") {
      // Exercise missing/broken images through the existing image owner/bridge, never a raw file path.
      return args[0] === "picker-product-1" ? "data:image/png;base64,broken" : args[0] === "picker-product-2"
        ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=" : "";
    }
    if (method === "listProducts" && args[0]?.search) {
      if (failSearch) { failSearch = false; throw new Error("Injected catalog search failure"); }
      if (holdSearch) { holdSearch = false; await new Promise(resolve => { releaseSearch = resolve; }); }
    }
    assert.ok(methods[method], `Unexpected bridge call: ${method}`);
    return methods[method](database.databasePath, ...args);
  });
  await page.addInitScript(({ initial, methodNames }) => {
    window.__pickerInitial = initial;
    window.yardimciDesktop = { commerce: Object.fromEntries(methodNames.map(method => [method, (...args) => window.__pickerCall(method, args)])) };
    window.__pickerModalCount = 0;
    const show = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () { window.__pickerModalCount++; return show.call(this); };
  }, { initial: { customers: database.getDashboardData().customers, snapshot: readBusinessCapabilitySnapshot(database.databasePath) }, methodNames: [...Object.keys(methods), "getProductImageDataUrl"] });
  const address = `http://127.0.0.1:${server.httpServer.address().port}/record-picker-smoke`;
  await page.goto(address, { waitUntil: "domcontentloaded", timeout: 60000 });
  const dialog = label => page.getByRole("dialog", { name: `${label} seçici`, exact: true });
  const open = async label => { await page.getByRole("button", { name: label, exact: true }).click(); await expect(dialog(label).getByRole("combobox")).toBeFocused(); return dialog(label); };
  let panel = await open("Ürün");
  await expect(panel.getByRole("option")).toHaveCount(60);
  await expect(panel.getByText(/İlk 500 kayıt/)).toBeVisible();
  const imageCalls = calls.filter(call => call.method === "getProductImageDataUrl");
  assert.ok(imageCalls.length <= 4, "Only the visible image-bearing options request media (StrictMode deduplicated)");
  await expect(panel.locator(".record-picker__thumb img")).toHaveCount(1);
  await expect(panel.locator(".record-picker__thumb img")).toHaveCSS("object-fit", "contain");
  assert.ok(!requests.some(url => url.startsWith("file:") || url.includes("/assets/products/")), "No local-file image bypass");
  const field = panel.getByRole("combobox");
  // Complete underlying catalog search, beyond both 500 and 820; no inflated fixture projection.
  for (const search of ["Katalog Ürünü 00820", "PICK-10020", "8690000010020"]) {
    await field.fill(search);
    await expect(panel.getByRole("listbox")).toHaveAttribute("aria-busy", "false");
    await expect(panel.getByRole("option")).toHaveCount(1);
    await expect(panel.getByRole("option")).toContainText(search.includes("00820") ? "00820" : "10020");
  }
  await panel.getByRole("option").click();
  await expect(page.getByLabel("Ürün", { exact: true })).toContainText("10020");
  await expect(page.locator(".market-stock-card")).toContainText("10020");
  assert.ok(calls.some(call => call.method === "getInventoryBalance" && call.args[0] === "picker-product-10020"));
  panel = await open("Ürün");
  await panel.getByRole("button", { name: "Grid görünümü" }).click();
  await expect(panel.getByRole("listbox")).toHaveAttribute("data-view", "grid");
  while (await panel.getByRole("button", { name: "Kart sayısını artır" }).isEnabled()) await panel.getByRole("button", { name: "Kart sayısını artır" }).click();
  await expect(panel.getByLabel("Satırda 4 kart")).toBeVisible();
  await panel.getByRole("combobox").press("Home");
  await panel.getByRole("combobox").press("ArrowDown");
  await expect(panel.getByRole("combobox")).toHaveAttribute("aria-activedescendant", /picker-product-4$/);
  await panel.getByRole("combobox").press("End");
  await expect(panel.getByRole("option")).toHaveCount(21);
  await panel.getByRole("combobox").press("Home");
  await expect(panel.getByRole("option")).toHaveCount(60);
  await panel.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(panel.getByRole("option")).toHaveCount(60);
  await panel.getByRole("combobox").press("ArrowUp");
  await expect(panel.getByRole("option").first()).toHaveAttribute("data-value", product.id);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Ürün", { exact: true })).toBeFocused();
  await page.reload();
  panel = await open("Ürün");
  await expect(panel.getByRole("button", { name: "Grid görünümü" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByLabel("Satırda 4 kart")).toBeVisible();
  for (const width of [480, 640, 900, 1366]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(panel.getByRole("listbox")).toBeVisible();
    await panel.getByRole("button", { name: "Grid görünümü" }).click();
    while (await panel.getByRole("button", { name: "Kart sayısını artır" }).isEnabled()) await panel.getByRole("button", { name: "Kart sayısını artır" }).click();
    await expect(panel.getByRole("listbox")).toHaveAttribute("data-view", "grid");
    const geometry = await panel.evaluate(node => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, width: window.innerWidth,
      minimumCard: Math.min(...Array.from(node.querySelectorAll('[role="option"]')).map(card => card.getBoundingClientRect().width)) }));
    assert.ok(geometry.left >= 0 && geometry.right <= geometry.width, `Overlay fits at ${width}px`);
    assert.ok(geometry.minimumCard >= 155, `Cards stay readable at ${width}px`);
    const shortTargets = await panel.locator("button:not([role=option])").evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 44).length);
    assert.equal(shortTargets, 0, "44px targets in every screen class");
  }
  await page.evaluate(() => { document.documentElement.dataset.colorScheme = "dark"; document.documentElement.dataset.motion = "reduced"; });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const screenshotDir = join(process.cwd(), "artifacts/screenshots/record-picker"); mkdirSync(screenshotDir, { recursive: true });
  await panel.screenshot({ path: join(screenshotDir, "inventory-dark-grid.png") });
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__pickerView("purchasing"));
  panel = await open("Tedarikçi");
  await panel.getByRole("combobox").fill("Tedarikçi 0819");
  await expect(panel.getByRole("option")).toHaveCount(1);
  await panel.getByRole("option").click();
  await expect(page.getByLabel("Tedarikçi", { exact: true })).toContainText("0819");
  panel = await open("1. alım ürünü");
  await panel.getByRole("combobox").fill("PICK-10020");
  await expect(panel.getByRole("option")).toHaveCount(1);
  await panel.getByRole("option").click();
  await expect(page.getByLabel("1. alım ürünü", { exact: true })).toContainText("10020");
  await page.evaluate(() => window.__pickerView("labels"));
  panel = await open("Ürün");
  await panel.getByRole("combobox").fill("PICK-10019");
  await expect(panel.getByRole("option")).toHaveCount(1);
  await panel.getByRole("option").click();
  await expect(page.getByLabel("Ürün", { exact: true })).toContainText("10019");
  await page.evaluate(() => window.__pickerView("inventory"));
  await page.evaluate(() => window.__pickerView("labels"));
  await expect(page.getByLabel("Ürün", { exact: true })).toContainText("10019");
  await page.evaluate(() => window.__pickerView("orders"));
  panel = await open("Sipariş müşterisi");
  await expect(panel.getByRole("option")).toHaveCount(3);
  await panel.getByRole("option").first().click();
  await expect(page.getByText("Aktif bayi · Bayi A", { exact: true })).toBeVisible();
  await page.evaluate(() => window.__pickerView("quickSale"));
  panel = await open("Müşteri");
  assert.deepEqual(await panel.getByRole("group", { name: "Harf grupları" }).locator("button").allTextContents(), ["ABC", "ÇDE", "FGH", "IİJ", "KLM", "NOÖ", "PRS", "ŞTU", "ÜVY", "Z"]);
  await panel.getByRole("button", { name: "IİJ", exact: true }).click();
  assert.ok((await panel.getByRole("option").allTextContents()).every(text => /^(Işıl|İpek|Jale)/.test(text)));
  await panel.getByRole("combobox").fill("Ğ Test");
  await expect(panel.getByRole("option").first()).toContainText("Ğ Test");
  await panel.getByRole("button", { name: "Grid görünümü" }).click();
  await expect(panel.getByRole("combobox")).toHaveValue("Ğ Test");
  await panel.getByRole("button", { name: "Liste görünümü" }).click();
  await expect(panel.getByRole("combobox")).toHaveValue("Ğ Test");
  await panel.getByRole("button", { name: "Tümü", exact: true }).click();
  await expect(panel.getByRole("combobox")).toHaveValue("");
  await expect(panel.getByRole("option")).toHaveCount(60);
  await panel.getByRole("button", { name: "ABC", exact: true }).click();
  await panel.getByRole("combobox").fill("05550000007");
  await expect(panel.getByRole("option")).toHaveCount(1);
  await expect(panel.getByRole("option")).toContainText("Işıl");
  await panel.getByRole("option").click({ noWaitAfter: true });
  await expect(page.getByRole("button", { name: "Müşteri", exact: true })).toContainText("Işıl");
  panel = await open("Müşteri");
  await panel.getByRole("combobox").fill("does-not-exist");
  await expect(panel.getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Müşteri", exact: true })).toBeFocused();
  // The real shared CustomerPicker also remains bounded for a 10k+ supplied record set.
  const customers = database.getDashboardData().customers;
  const largeCustomers = Array.from({ length: 10020 }, (_, i) => ({ ...customers[i % customers.length], id: `load-customer-${i}`, fullName: `${names[i % names.length]} ${i}` }));
  await page.evaluate(records => window.__pickerLargeCustomers(records), largeCustomers);
  panel = await open("Müşteri");
  await expect(panel.getByRole("option")).toHaveCount(60);
  await panel.getByRole("combobox").press("End");
  await expect(panel.getByRole("option")).toHaveCount(60);
  await expect(panel.getByRole("combobox")).toHaveAttribute("aria-activedescendant", /load-customer-10019$/);
  await page.keyboard.press("Escape");
  await page.evaluate(() => { window.__pickerLargeCustomers([]); window.__pickerView("inventory"); });
  panel = await open("Ürün");
  holdSearch = true;
  await panel.getByRole("combobox").fill("PICK-820");
  await expect.poll(() => typeof releaseSearch).toBe("function");
  await panel.getByRole("combobox").fill("PICK-10020");
  await expect(panel.getByRole("option")).toHaveCount(1);
  releaseSearch();
  await expect(panel.getByRole("option")).toContainText("10020");
  failSearch = true;
  await panel.getByRole("combobox").fill("PICK-9999");
  await expect(panel.getByRole("alert")).toBeVisible();
  await panel.getByRole("button", { name: "Yeniden ara" }).click();
  await expect(panel.getByRole("option")).toHaveCount(1);
  await expect(panel.getByRole("option")).toContainText("09999");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => window.__pickerBusy(true));
  await expect(panel).toHaveCount(0);
  await expect(page.getByLabel("Ürün", { exact: true })).toBeDisabled();
  await page.evaluate(() => window.__pickerBusy(false));
  await page.evaluate(() => window.__pickerNested());
  const parent = page.getByRole("dialog", { name: "Stok görevi", exact: true });
  await parent.getByLabel("Ürün", { exact: true }).click();
  const fallback = parent.getByRole("dialog", { name: "Ürün seçici", exact: true });
  await expect(fallback).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(parent).toBeVisible();
  await expect(parent.getByLabel("Ürün", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(parent).toHaveCount(0);
  assert.deepEqual(raw.prepare("SELECT sql FROM sqlite_master ORDER BY name").all(), schemaBefore);
  for (const [table, count] of Object.entries(countsBefore)) assert.equal(raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, count, `${table}: selection never mutates data`);
  assert.deepEqual(pageErrors, []);
  console.log("record-picker-ui-smoke-ok: real MarketPage/React + SQLite catalog 10021, suppliers 821, Turkish customer filters, 10020 supplied customers, bounded DOM, keyboard, preferences, nested fallback, unchanged schema/mutation counts");
} finally {
  await browser?.close(); await server?.close(); raw?.close(); database.close(); rmSync(dataDir, { recursive: true, force: true });
}
