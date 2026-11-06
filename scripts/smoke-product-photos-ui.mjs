import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const require = createRequire(import.meta.url);
// The renderer transport uses real services/SQLite. Native decoding is supplied
// by the existing Node test adapter; the companion Electron smoke tests nativeImage.
require("./test-helpers/product-photo-node-codec.cjs");
const store = require("../apps/desktop-app/dist-electron/commerce-store.js");
const photos = require("../apps/desktop-app/dist-electron/product-photo-store.js");
const save = require("../apps/desktop-app/dist-electron/commerce-product-save.js");
const { getCommerceProductPublication } = require("../apps/desktop-app/dist-electron/commerce-product-publication-store.js");
const { getProductImageDataUrl } = require("../apps/desktop-app/dist-electron/product-data-service.js");
const { Transformer } = require("@napi-rs/image");
const png = n => Transformer.fromRgbaPixels(Buffer.from([n, 70, 180, 255]), 1, 1).pngSync();
const dataUrl = bytes => `data:image/png;base64,${bytes.toString("base64")}`;
const root = mkdtempSync(join(tmpdir(), "ya-photo-ui-")), databasePath = join(root, "fixture.sqlite");
const db = new DatabaseSync(databasePath);
db.exec(readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
db.exec("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','Test','Test','market','t','t')");
for (const capability of ["commerce.catalog", "commerce.inventory", "channel.online_sales"]) db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('b',?,1,'t','t')").run(capability);
const product = store.saveCatalogProduct(databasePath, { name: "Galeri ürünü", trackInventory: true, salePrice: 25, purchasePrice: 10, taxRate: 20, minimumQuantity: 2 });
store.setInventoryCount(databasePath, { productId: product.id, countedQuantity: 10 });
photos.mutateProductPhotos(databasePath, { productId: product.id, expectedRevision: photos.listProductPhotos(databasePath, product.id).revision }, { kind: "add", bytes: [png(10), png(20)] });
const snapshot = () => JSON.stringify(["catalog_products", "commerce_product_publications", "inventory_balances", "inventory_movements", "sync_outbox", "sync_outbox_revisions", "sync_publication_payloads"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
let server, browser, saveCalls = 0, failSave = false;
try {
  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.exposeFunction("__commerceCall", async (method, input) => {
    if (method === "photos") return photos.listProductPhotos(databasePath, input);
    if (method === "preview") return photos.previewProductPhoto(databasePath, ...input);
    if (method === "image") return getProductImageDataUrl(databasePath, input);
    if (method === "publication") return getCommerceProductPublication(db, input);
    if (method === "balance") return store.getInventoryBalance(databasePath, input);
    if (method === "history") return store.listInventoryMovements(databasePath, input);
    if (method === "saveDetails") {
      saveCalls++;
      if (failSave) throw new Error("Birlikte kayıt test hatası");
      return save.saveProductDetails(databasePath, await save.prepareProductDetailsSave(databasePath, input));
    }
    throw new Error(`Immediate mutation is forbidden: ${method}`);
  });
  await page.addInitScript(({ product, preview }) => {
    window.__product = product;
    window.__setup = { webModuleUrl: "https://photos.example.test", syncSecret: "photo-ui-fixture-secret" };
    const call = (method, input) => window.__commerceCall(method, input);
    window.yardimciDesktop = { commerce: {
      listProductPhotos: id => call("photos", id), previewProductPhoto: (id, photoId) => window.__brokenPreview ? Promise.reject(new Error("missing")) : call("preview", [id, photoId]),
      getProductImageDataUrl: id => call("image", id), getProductPublication: id => call("publication", id),
      getInventoryBalance: id => call("balance", id), listInventoryMovements: input => call("history", input),
      saveProductDetails: async input => {
        if (window.__delaySave) await new Promise(resolve => { window.__finishSave = resolve; });
        return call("saveDetails", input);
      },
      saveProduct: input => call("saveProduct", input), saveProductPublication: input => call("publish", input),
      addProductPhotos: input => call("add", input), removeProductPhoto: input => call("remove", input),
      reorderProductPhotos: input => call("reorder", input), setProductPhotoCover: input => call("cover", input),
      applyInventoryMovement: input => call("adjust", input), setInventoryCount: input => call("count", input),
      previewExternalProductImage: async () => preview,
      lookupExternalProductByBarcode: async () => ({ status: "found", product: { provider: "open_food_facts", barcode: "123", name: "Dış kaynak ürünü", brand: "Test", categoryHint: "", quantity: "", imageUrl: "https://images.openfoodfacts.org/images/products/123/front_en.jpg", sourceProductUrl: "https://world.openfoodfacts.org/product/123", dataLicense: "ODbL", imageLicense: "CC BY-SA", fetchedAt: "2026-11-06" } })
    } };
  }, { product, preview: dataUrl(png(30)) });
  const fixtureHtml = await server.transformIndexHtml("/photo-ui", `<html lang="tr"><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/product-photos-ui.tsx")}"></script></body></html>`);
  await page.route("**/photo-ui", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixtureHtml }));
  await page.goto(`${server.resolvedUrls.local[0]}photo-ui`);
  const open = () => page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  const gallery = page.getByRole("region", { name: "Ürün fotoğrafları", exact: true });
  const saveButton = page.locator(".product-workspace-actions").getByRole("button", { name: /Ürünü Kaydet|Kaydediliyor/ });
  const discard = page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true });
  const close = page.getByRole("button", { name: "Çalışma alanını kapat", exact: true });
  const files = (n = 40) => [{ name: "a.png", mimeType: "image/png", buffer: png(n) }, { name: "duplicate.png", mimeType: "image/png", buffer: png(n) }, { name: "b.png", mimeType: "image/png", buffer: png(n + 1) }];
  await open();
  await expect(gallery.getByRole("listitem")).toHaveCount(2);
  const beforeDraft = snapshot(), beforeFiles = readdirSync(root, { recursive: true });
  await gallery.getByRole("button", { name: "2. fotoğrafı önizle", exact: true }).click();
  await expect(saveButton).toBeDisabled(); await expect(close).toBeEnabled();
  await gallery.locator('input[type="file"]').setInputFiles(files());
  await expect(gallery.getByRole("listitem")).toHaveCount(4, { timeout: 10000 });
  await gallery.getByRole("button", { name: "3. fotoğrafı kapak yap", exact: true }).click();
  await gallery.getByRole("button", { name: "2. fotoğrafı öne taşı", exact: true }).click();
  await gallery.getByRole("button", { name: "4. fotoğrafı kaldır", exact: true }).click();
  await page.getByLabel("Ürün adı", { exact: true }).fill("Kaydedilmemiş ad");
  await page.getByLabel("Aktif ürün", { exact: true }).uncheck();
  await page.getByLabel("Hızlı erişim", { exact: true }).check();
  await page.getByLabel("Web satışında yayınla", { exact: true }).uncheck();
  await page.getByLabel("Minimum stok", { exact: true }).fill("6");
  await page.getByLabel("Stok işlemi", { exact: true }).selectOption("count");
  await page.getByLabel("Stok işlem miktarı", { exact: true }).fill("12");
  await page.getByLabel("Kısa not", { exact: true }).fill("Bekleyen sayım");
  await expect(saveButton).toBeEnabled(); await expect(close).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(1);
  assert.equal(snapshot(), beforeDraft); assert.deepEqual(readdirSync(root, { recursive: true }), beforeFiles);
  assert.equal(saveCalls, 0, "all left-rail controls are renderer drafts");
  await discard.click();
  await expect(gallery.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByLabel("Ürün adı", { exact: true })).toHaveValue(product.name);
  await expect(page.getByLabel("Aktif ürün", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Hızlı erişim", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Web satışında yayınla", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Minimum stok", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Stok işlemi", { exact: true })).toHaveValue("add");
  await expect(page.getByLabel("Stok işlem miktarı", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Kısa not", { exact: true })).toHaveValue("");
  await expect(saveButton).toBeDisabled(); assert.equal(snapshot(), beforeDraft);

  // A failed Save retains every draft. No part of it is persisted.
  await page.getByLabel("Web satışında yayınla", { exact: true }).uncheck();
  await gallery.getByRole("button", { name: "2. fotoğrafı kapak yap", exact: true }).click();
  await page.getByLabel("Stok işlem miktarı", { exact: true }).fill("3");
  await page.getByLabel("Minimum stok", { exact: true }).fill("5");
  await page.getByLabel("Ürün adı", { exact: true }).fill("Birlikte kaydedilen");
  failSave = true; await saveButton.click();
  await expect(page.getByRole("alert")).toContainText("Birlikte kayıt test hatası");
  await expect(page.getByLabel("Stok işlem miktarı", { exact: true })).toHaveValue("3");
  assert.equal(snapshot(), beforeDraft);
  failSave = false;
  await page.evaluate(() => { window.__delaySave = true; });
  await saveButton.evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('.product-workspace-actions .action-row button').last()).toBeDisabled();
  await expect(discard).toBeDisabled(); await expect(close).toBeDisabled();
  await page.evaluate(() => { window.__delaySave = false; window.__finishSave(); });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(saveCalls, 2, "one failed request and exactly one committed request despite double-click");
  const saved = store.listCatalogProducts(databasePath).items.find(item => item.id === product.id);
  assert.equal(saved.name, "Birlikte kaydedilen"); assert.equal(saved.minimumQuantity, 5);
  assert.equal(store.getInventoryBalance(databasePath, product.id).quantity, 13);
  assert.equal(store.listInventoryMovements(databasePath, { productId: product.id }).length, 2);
  assert.equal(getCommerceProductPublication(db, product.id).isPublished, false);
  await open(); await expect(gallery.getByRole("listitem")).toHaveCount(2);
  await page.getByLabel("Stok işlemi", { exact: true }).selectOption("count");
  await page.getByLabel("Stok işlem miktarı", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Stok Hareketleri", exact: true }).click();
  await expect(page.getByRole("region", { name: "Stok hareketleri", exact: true })).toBeVisible();
  await expect(page.locator(".market-history-row")).toHaveCount(2);
  await page.getByRole("button", { name: "← Ürüne dön", exact: true }).click();
  await expect(page.getByLabel("Stok işlem miktarı", { exact: true })).toHaveValue("0");
  await discard.click(); await close.click();
  assert.equal(store.listInventoryMovements(databasePath, { productId: product.id }).length, 2, "discard never reverses audit history");

  // Photo-only drafts and web-only drafts both participate in close/dirty guards.
  await open(); await gallery.getByRole("button", { name: "2. fotoğrafı kaldır", exact: true }).click();
  await expect(close).toBeDisabled(); await discard.click(); await expect(close).toBeEnabled();
  await page.getByLabel("Web satışında yayınla", { exact: true }).check();
  await expect(close).toBeDisabled(); await discard.click(); await close.click();
  await page.getByRole("button", { name: "Online Satış Değiştir", exact: true }).click();
  await open();
  const cover = page.getByRole("region", { name: "Ürün görseli", exact: true });
  await expect(gallery).toHaveCount(0); await expect(cover).toBeVisible();
  const beforeManual = snapshot();
  await cover.locator('input[type="file"]').setInputFiles(files(60)[0]);
  await expect(close).toBeDisabled(); assert.equal(snapshot(), beforeManual);
  await discard.click(); await expect(close).toBeEnabled(); await close.click();
  await page.getByRole("button", { name: "Online Satış Değiştir", exact: true }).click();
  await open();
  const beforeExternal = snapshot();
  await page.locator('.market-inline-field input').fill('123');
  await page.getByRole("button", { name: "Ürün Bilgilerini Ara", exact: true }).click();
  await expect(page.getByRole("region", { name: "Ürün görseli", exact: true }).locator("img")).toBeVisible();
  await expect(close).toBeDisabled(); assert.equal(snapshot(), beforeExternal);
  await discard.click(); await expect(gallery.getByRole("listitem")).toHaveCount(2); await close.click();
  await page.getByRole("button", { name: "Yeni Ürün", exact: true }).click();
  await expect(gallery.getByRole("listitem")).toHaveCount(0);
  await page.getByLabel("Ürün adı", { exact: true }).fill("Yeni galeri ürünü");
  await page.getByLabel("Satış fiyatı", { exact: true }).fill("25");
  await page.getByLabel("Alış fiyatı", { exact: true }).fill("15");
  await gallery.locator('input[type="file"]').setInputFiles(files(70));
  await expect(gallery.getByRole("listitem")).toHaveCount(2);
  await page.getByLabel("Stok işlem miktarı", { exact: true }).fill("5");
  await saveButton.click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await open(); await expect(gallery.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Mevcut stok: 5 piece", { exact: true })).toBeVisible();
  await close.click();

  // Content limit and optional source previews remain usable without immediate writes.
  await open();
  await gallery.locator('input[type="file"]').setInputFiles(Array.from({ length: 11 }, (_, i) => ({ name: `${i}.png`, mimeType: "image/png", buffer: png(90 + i) })));
  await expect(gallery.getByRole("alert")).toContainText("en fazla 12");
  await expect(gallery.getByRole("listitem")).toHaveCount(2);
  await gallery.locator('input[type="file"]').setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(gallery.getByRole("alert")).toContainText("5 MB");
  await gallery.locator('input[type="file"]').setInputFiles(Array.from({ length: 10 }, (_, i) => ({ name: `${i}.png`, mimeType: "image/png", buffer: png(110 + i) })));
  await expect(gallery.getByRole("listitem")).toHaveCount(12);
  await expect(gallery.getByRole("button", { name: "Fotoğraf ekle", exact: true })).toBeDisabled();
  await discard.click(); await close.click();
  assert.deepEqual(errors, []);
  console.log("product-photos-ui-ok: real SQLite transport, all rail drafts/discard, no writes, preview/dedup/cover/reorder/remove, atomic save/failure/double-click, immutable history, create/edit, offline manual, limits");
} finally { await browser?.close(); await server?.close(); db.close(); rmSync(root, { recursive: true, force: true }); }
