import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { createCapabilitySnapshotFixture } from "./test-helpers/business-capability-fixtures.mjs";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { chooseSearchSelect } from "./test-helpers/search-select.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C, getBusinessProfile } = require("../packages/shared/dist/index.js");
const runtime = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { database, cleanup } = createTemporaryDesktopDatabase("stock-image-market-ui-");
let server, browser, page;
const errors = [], calls = [], pendingReads = [];
let delayReads = false, analysisCount = 0;
try {
  database.initialize();
  const setup = createSmokeSetupInput({ profileId: "market", businessName: "Stok testi", phone: "", whatsapp: "",
    syncSecret: "stock-image-market-fixture", servicePreferences: { whatsapp: false, android: false },
    initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] });
  const saved = database.saveInitialSetup(setup);
  assert.equal(saved.ok, true, saved.message);
  const path = database.databasePath;
  const first = runtime.saveRuntimeCatalogProduct(path, { name: "Kalem", salePrice: 10, trackInventory: true });
  const second = runtime.saveRuntimeCatalogProduct(path, { name: "Defter", salePrice: 20, trackInventory: true });
  runtime.setRuntimeInventoryCount(path, { productId: first.id, countedQuantity: 10, note: "İlk sayım" });
  runtime.setRuntimeInventoryCount(path, { productId: second.id, countedQuantity: 20, note: "Defter sayımı" });
  const retail = createCapabilitySnapshotFixture({ ...setup, aiEnabled: true });
  const wholesale = createCapabilitySnapshotFixture({ ...setup, aiEnabled: true,
    profileOptions: [...getBusinessProfile("market").defaultOptionalCapabilities, C.WHOLESALE] });
  for (const snapshot of [retail, wholesale]) {
    assert.ok(snapshot.enabledCapabilities.includes(C.AI));
    assert.ok(snapshot.enabledCapabilities.includes(C.INVENTORY));
    assert.ok(!snapshot.enabledCapabilities.includes(C.FOOD_MENU));
  }
  const sql = new DatabaseSync(path, { readOnly: true });
  const productCount = () => sql.prepare("SELECT COUNT(*) AS count FROM catalog_products").get().count;
  const beforeProductCount = productCount();
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM menu_product_entries").get().count, 0);
  sql.close();

  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
    logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  page.on("pageerror", error => errors.push(error.message));
  await page.exposeFunction("__stockCall", async (method, ...args) => {
    calls.push([method, ...args]);
    const methods = { listProducts: runtime.listRuntimeCatalogProducts, listCategories: runtime.listRuntimeCatalogCategories,
      getInventoryBalance: runtime.getRuntimeInventoryBalance, listInventoryMovements: runtime.listRuntimeInventoryMovements,
      setInventoryCount: runtime.setRuntimeInventoryCount };
    if (methods[method]) {
      const result = methods[method](path, ...args);
      const productId = method === "getInventoryBalance" ? args[0] : args[0]?.productId;
      if (delayReads && productId === first.id && ["getInventoryBalance", "listInventoryMovements"].includes(method)) {
        await new Promise(done => pendingReads.push(done));
      }
      return result;
    }
    if (method === "getProductImageDataUrl") return "";
    if (method === "analyzeStockImage") {
      const input = args[0], imageHash = String(++analysisCount).padStart(64, "0");
      assert.equal(input.mimeType, "image/jpeg"); assert.ok(input.byteLength > 0);
      const created = database.createStockImageImport({ importId: input.importId, imageHash, source: "desktop" });
      assert.equal(created.ok, true);
      const analysis = database.completeStockImageAnalysis(input.importId, {
        document: { supplier_name: "Katalog Tedarik", invoice_number: `F-${analysisCount}`, invoice_date: "2026-10-12", document_confidence: "high" },
        lines: [
          { raw_text: "Kalem 2 AD", matched_product_id: first.id, matched_product_name: first.name, suggested_quantity: 2,
            source_quantity_text: "2 AD", confidence: "high", needs_review_reason: null },
          { raw_text: "Bilinmeyen ürün", matched_product_id: "ai-guessed-product", matched_product_name: "AI tahmini", suggested_quantity: 1,
            source_quantity_text: "1 AD", confidence: "low", needs_review_reason: null }
        ]
      });
      assert.equal(analysis.lines[1].matched_product_id, null);
      return { ok: true, importId: input.importId, imageHash, duplicateWarning: created.duplicateWarning, analysis, message: "Kaydetmeden önce kontrol edin." };
    }
    if (method === "applyStockImageImport") return database.applyStockImageImport(args[0]);
    if (method === "cancelStockImageAnalysis") { database.failStockImageImport(args[0], "İptal", true); return true; }
    throw new Error(`Unexpected call: ${method}`);
  });
  await page.addInitScript(snapshot => {
    window.__stockInitial = snapshot;
    window.__stockReadCompletions = [];
    const invoke = method => async (...args) => {
      const result = await window.__stockCall(method, ...args);
      if (["getInventoryBalance", "listInventoryMovements"].includes(method)) window.__stockReadCompletions.push({ method, args });
      return result;
    };
    window.yardimciDesktop = {
      commerce: Object.fromEntries(["listProducts", "listCategories", "getInventoryBalance", "listInventoryMovements", "setInventoryCount", "getProductImageDataUrl"].map(method => [method, invoke(method)])),
      analyzeStockImage: input => window.__stockCall("analyzeStockImage", { ...input, bytes: undefined, byteLength: input.bytes.byteLength }),
      applyStockImageImport: invoke("applyStockImageImport"), cancelStockImageAnalysis: invoke("cancelStockImageAnalysis")
    };
  }, retail);
  await page.route("**/stock-image-market-test*", async route => route.fulfill({ contentType: "text/html",
    body: await server.transformIndexHtml("/stock-image-market-test", `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/stock-image-market.tsx")}"></script></body></html>`) }));
  await page.goto(`${server.resolvedUrls.local[0]}stock-image-market-test`);
  const trigger = page.getByRole("button", { name: "AI ile Stok Ekle", exact: true });
  const dialog = page.getByRole("dialog", { name: "AI ile Stok Ekle", exact: true });
  const stockCard = page.locator(".market-stock-card"), history = page.locator(".market-history-list");
  for (const [index, snapshot] of [retail, wholesale].entries()) {
    await page.evaluate(snapshot => window.__stockSnapshot(snapshot), snapshot);
    // The controller may restore its default quick-sale view on initial hydration.
    await page.getByRole("button", { name: "Stok", exact: true }).click();
    await expect(trigger).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fiziksel Sayım", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sayımı Kaydet", exact: true })).toBeVisible();
    for (const capability of [C.AI, C.CATALOG, C.INVENTORY]) {
      await page.evaluate(({ snapshot, capability }) => window.__stockSnapshot({ ...snapshot,
        enabledCapabilities: snapshot.enabledCapabilities.filter(value => value !== capability) }), { snapshot, capability });
      await expect(trigger).toHaveCount(0);
      await page.evaluate(snapshot => window.__stockSnapshot(snapshot), snapshot);
      await page.getByRole("navigation", { name: "Satış çalışma alanları" }).getByRole("button", { name: "Stok", exact: true }).click();
      await expect(trigger).toBeVisible();
    }
    await chooseSearchSelect(page, "Ürün", { value: first.id });
    const beforeBalance = runtime.getRuntimeInventoryBalance(path, first.id).quantity;
    await expect(stockCard.locator("strong")).toHaveText(`${beforeBalance} Adet`);
    await trigger.click(); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Analiz Et", exact: true })).toBeDisabled();
    await dialog.locator('input[type="file"]').setInputFiles({ name: "invoice.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    await dialog.getByRole("button", { name: "Analiz Et", exact: true }).click();
    await expect(dialog.getByText("Katalog Tedarik", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Menü karşılığı", { exact: true })).toHaveCount(0);
    assert.equal(runtime.getRuntimeInventoryBalance(path, first.id).quantity, beforeBalance, "AI analysis only creates a review draft");
    assert.equal(calls.filter(call => call[0] === "applyStockImageImport").length, index);
    const rows = dialog.locator(".stock-image-row");
    await expect(rows).toHaveCount(2);
    await rows.first().getByRole("spinbutton").fill("4");
    await rows.last().getByRole("button", { name: "Yok say", exact: true }).click();
    if (index === 1) delayReads = true;
    await page.evaluate(() => { window.__stockDashboard = undefined; });
    const catalogReads = calls.filter(call => call[0] === "listProducts").length;
    await dialog.getByRole("button", { name: "Stokları Güncelle", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Stok girişi tamamlandı", exact: true })).toBeVisible();
    await expect.poll(() => calls.filter(call => call[0] === "listProducts").length).toBeGreaterThan(catalogReads);
    await expect.poll(() => page.evaluate(() => Boolean(window.__stockDashboard))).toBe(true);
    const applied = calls.filter(call => call[0] === "applyStockImageImport").at(-1)[1];
    assert.equal(applied.lines.length, 1); assert.equal(applied.lines[0].product_id, first.id); assert.equal(applied.lines[0].quantity, 4);
    assert.equal(runtime.getRuntimeInventoryBalance(path, first.id).quantity, beforeBalance + 4, "AI import adds a purchase increment");
    assert.ok(runtime.listRuntimeInventoryMovements(path, { productId: first.id }).some(movement =>
      movement.type === "purchase" && movement.referenceType === "stock_image_import" && movement.referenceId === applied.importId && movement.quantityDelta === 4));
    await dialog.getByRole("button", { name: "Kapat", exact: true }).click(); await expect(trigger).toBeFocused();
    if (index === 0) {
      await expect(stockCard.locator("strong")).toHaveText(`${beforeBalance + 4} Adet`);
      await expect(history).toContainText(`+4 → ${beforeBalance + 4}`);
      await expect(page.getByLabel("Sayılan miktar", { exact: true })).toHaveValue(String(beforeBalance + 4));
      await page.getByLabel("Sayılan miktar", { exact: true }).fill("7");
      await page.getByRole("button", { name: "Sayımı Kaydet", exact: true }).click();
      await expect(stockCard.locator("strong")).toHaveText("7 Adet");
      assert.equal(runtime.getRuntimeInventoryBalance(path, first.id).quantity, 7, "manual count stays absolute");
      assert.equal(calls.filter(call => call[0] === "setInventoryCount").at(-1)[1].countedQuantity, 7);
    } else {
      await expect.poll(() => pendingReads.length).toBe(2);
      await chooseSearchSelect(page, "Ürün", { value: second.id });
      await expect(stockCard.locator("strong")).toHaveText("20 Adet");
      await expect(history).toContainText("Defter sayımı");
      const completedReads = await page.evaluate(() => window.__stockReadCompletions.length);
      delayReads = false; pendingReads.splice(0).forEach(done => done());
      await expect.poll(() => page.evaluate(() => window.__stockReadCompletions.length)).toBe(completedReads + 2);
      await page.evaluate(async () => { await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
      await expect(stockCard.locator("strong")).toHaveText("20 Adet");
      await expect(page.getByLabel("Sayılan miktar", { exact: true })).toHaveValue("20");
      await expect(history).not.toContainText("Kalem 2 AD");
      await chooseSearchSelect(page, "Ürün", { value: first.id });
      await expect(stockCard.locator("strong")).toHaveText(`${beforeBalance + 4} Adet`);
      await expect(history).toContainText(`+4 → ${beforeBalance + 4}`);
    }
    await trigger.click(); await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Manuel stok ekranına dön", exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  const finalSql = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(finalSql.prepare("SELECT COUNT(*) AS count FROM catalog_products").get().count, beforeProductCount, "AI guesses never create products");
    assert.equal(finalSql.prepare("SELECT COUNT(*) AS count FROM menu_product_entries").get().count, 0);
  } finally { finalSql.close(); }
  assert.deepEqual(errors, []);
  console.log("stock-image-market-ui-smoke-ok: retail/wholesale without FOOD_MENU, capability visibility, canonical review/apply, refresh, stale reads and absolute count");
} finally {
  pendingReads.splice(0).forEach(done => done());
  await browser?.close(); await server?.close(); cleanup();
}
