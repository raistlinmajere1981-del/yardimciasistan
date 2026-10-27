import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const require = createRequire(import.meta.url);
const { saveCatalogProduct } = require("../apps/desktop-app/dist-electron/commerce-store.js");
const root = mkdtempSync(join(tmpdir(), "ya-photo-ui-")), databasePath = join(root, "fixture.sqlite");
const db = new DatabaseSync(databasePath);
db.exec(readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
db.exec("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','Test','Test','market','t','t')");
const product = saveCatalogProduct(databasePath, { name: "Galeri ürünü", trackInventory: false, salePrice: 25, taxRate: 20 });
let server, browser;
try {
  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  // Register the isolated fixture at the browser boundary: Vite's HTML fallback
  // otherwise serves the real app before late middleware and masks test failures.
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(product => {
    window.__product = product;
    const preview = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    let revision = 0, photos = [{ id: "one", format: "image/png" }, { id: "two", format: "image/webp" }], sourceUrl = "";
    const snapshot = () => ({ productId: product.id, revision: String(revision), photos: [...photos], sourceUrl, sourceLicense: "" });
    const mutate = async input => {
      if (window.__failPhoto) { window.__failPhoto = false; throw new Error("Fotoğraf işlemi test hatası"); }
      if (window.__delayPhoto) await new Promise(resolve => { window.__finishPhoto = resolve; });
      if (input.expectedRevision !== String(revision)) throw new Error("Ürün fotoğrafları değişti; galeriyi yenileyin.");
      revision++;
    };
    window.yardimciDesktop = { commerce: {
      listProductPhotos: async () => snapshot(), previewProductPhoto: async () => { if (window.__brokenPreview) throw new Error("missing"); return preview; },
      getProductImageDataUrl: async () => preview, getProductPublication: async () => ({ isPublished: false }),
      addProductPhotos: async input => { await mutate(input); photos.push(...input.dataUrls.map((data, i) => ({ id: `${revision}-${i}`, format: data.slice(5, data.indexOf(";")) }))); return snapshot(); },
      setProductPhotoCover: async input => { await mutate(input); photos = [photos.find(p => p.id === input.photoId), ...photos.filter(p => p.id !== input.photoId)]; return snapshot(); },
      reorderProductPhotos: async input => { await mutate(input); photos = input.photoIds.map(id => photos.find(p => p.id === id)); return snapshot(); },
      removeProductPhoto: async input => { await mutate(input); photos = photos.filter(p => p.id !== input.photoId); return snapshot(); },
      saveProduct: async input => { product = { ...product, ...input, id: input.id || "saved-product" }; if (!input.id) photos = input.manualImageDataUrl ? [{ id: "new-cover", format: "image/png" }] : []; return product; }
    } };
    window.__remoteOnly = () => { photos = []; sourceUrl = "https://images.example.com/source.jpg"; revision++; };
    window.__setPhotoCount = count => { photos = Array.from({ length: count }, (_, i) => ({ id: `limit-${i}`, format: "image/png" })); sourceUrl = ""; revision++; };
  }, product);
  const fixtureHtml = await server.transformIndexHtml("/photo-ui",
    `<html lang="tr"><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/product-photos-ui.tsx")}"></script></body></html>`);
  await page.route("**/photo-ui", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: fixtureHtml
  }));
  await page.route("https://images.example.com/**", route => route.abort());
  await page.goto(`${server.resolvedUrls.local[0]}photo-ui`);
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  const gallery = page.getByRole("region", { name: "Ürün fotoğrafları", exact: true });
  await expect(gallery.getByRole("listitem")).toHaveCount(2);
  await expect(gallery.getByRole("button", { name: "Fotoğraf ekle", exact: true })).toBeEnabled();
  await page.getByLabel("Ürün adı", { exact: true }).fill("Kaydedilmemiş ad");
  await gallery.locator('input[type="file"]').setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: Buffer.from("ui fixture bytes") },
    { name: "b.webp", mimeType: "image/webp", buffer: Buffer.from("ui fixture bytes") }
  ]);
  await expect(gallery.getByRole("listitem")).toHaveCount(4);
  await expect(page.getByLabel("Ürün adı", { exact: true })).toHaveValue("Kaydedilmemiş ad");
  await gallery.getByRole("button", { name: "3. fotoğrafı kapak yap", exact: true }).click();
  await expect(gallery.getByRole("status")).toHaveText("Kapak fotoğrafı değiştirildi.");
  await gallery.getByRole("button", { name: "2. fotoğrafı öne taşı", exact: true }).click();
  await expect(gallery.getByRole("status")).toHaveText("Fotoğraf sırası kaydedildi.");
  await page.evaluate(() => { window.__failPhoto = true; });
  await gallery.getByRole("button", { name: "2. fotoğrafı kaldır", exact: true }).click();
  await expect(gallery.getByRole("alert")).toHaveText("Fotoğraf işlemi test hatası");
  await expect(gallery.getByRole("listitem")).toHaveCount(4);
  await page.evaluate(() => { window.__delayPhoto = true; });
  await gallery.getByRole("button", { name: "2. fotoğrafı kaldır", exact: true }).click();
  await expect(gallery.getByRole("button", { name: "Fotoğraf ekle", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Ürünü Kaydet", exact: true })).toBeDisabled();
  await page.evaluate(() => { window.__delayPhoto = false; window.__finishPhoto(); });
  await expect(gallery.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByLabel("Ürün adı", { exact: true })).toHaveValue("Kaydedilmemiş ad");
  await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await expect(gallery.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await page.getByRole("button", { name: "Online Satış Değiştir", exact: true }).click();
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(gallery).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Ürün görseli", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await page.getByRole("button", { name: "Online Satış Değiştir", exact: true }).click();
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(gallery.getByRole("listitem")).toHaveCount(3, { timeout: 10000 });
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await page.evaluate(() => window.__setPhotoCount(12));
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(gallery.getByRole("listitem")).toHaveCount(12);
  await expect(gallery.getByRole("button", { name: "Fotoğraf ekle", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await page.evaluate(() => { window.__brokenPreview = true; window.__remoteOnly(); });
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(gallery.getByRole("listitem")).toHaveCount(0);
  await expect(gallery.getByText("Ürün görseli yok", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await page.getByRole("button", { name: "Yeni Ürün", exact: true }).click();
  await expect(page.getByText("İlk kayıttan sonra en fazla 12 fotoğrafı sıralayıp kapak seçebilirsiniz.")).toBeVisible();
  await page.getByLabel("Ürün adı", { exact: true }).fill("Yeni galeri ürünü");
  // A new product must pass the ordinary catalog price validation before
  // its saved record can expose the multi-photo gallery.
  await page.getByLabel("Satış fiyatı", { exact: true }).fill("25");
  await page.getByLabel("Alış fiyatı", { exact: true }).fill("15");
  await page.getByRole("region", { name: "Ürün görseli", exact: true }).locator('input[type="file"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64") });
  await page.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(gallery.getByRole("listitem")).toHaveCount(1);
  assert.deepEqual(errors, []);
  console.log("product-photos-ui-ok: append, cover, reorder, errors, busy, draft preservation, capability off, new product transition");
} finally { await browser?.close(); await server?.close(); db.close(); rmSync(root, { recursive: true, force: true }); }
