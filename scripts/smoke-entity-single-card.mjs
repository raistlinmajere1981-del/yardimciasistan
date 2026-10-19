import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { createCompactUiFixture } from "./lib/desktop-renderer-fixtures.mjs";
const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const runtime = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { saveCatalogCategory } = require("../apps/desktop-app/dist-electron/commerce-category-store.js");
const root = mkdtempSync(join(tmpdir(), "ya-single-card-"));
const database = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: root });
let server, browser;
try {
  database.initialize();
  const setup = database.saveInitialSetup(createSmokeSetupInput({ businessName: "Single card fixture", profileId: "market", profileOptions: ["commerce.wholesale", "channel.online_sales"], phone: "", whatsapp: "", syncSecret: "fixture-only", servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] }));
  assert.equal(setup.ok, true, setup.message);
  const category = saveCatalogCategory(database.databasePath, { name: "Pasif gerçek kategori", isActive: false });
  const product = runtime.saveRuntimeCatalogProduct(database.databasePath, { name: "Stoklu ürün", categoryId: category.id, salePrice: 20, trackInventory: true, minimumQuantity: 2 });
  runtime.setRuntimeInventoryCount(database.databasePath, { productId: product.id, countedQuantity: 10 });
  const existing = database.saveCustomer({ fullName: "Mevcut bayi", address: "Kayıtlı adres", identityNumber: "OLD123", birthDate: "1990-01-02", birthdayMessageEnabled: false,
    commercialProfile: { companyName: "Kayıtlı firma", dealerStatus: "candidate", priceGroup: "dealer_a", paymentTermDays: 15 } });
  assert.equal(existing.ok, true, existing.message);
  const compact = createCompactUiFixture();
  let data = { ...database.getDashboardData(), rooms: [{ ...compact.rooms[0], isActive: true, status: "available", operationalCondition: "ready" }], tables: [{ ...compact.tables[0], isActive: true, status: "available", currentCustomerId: "", currentReservationId: "" }], roomOperations: [], tableOperations: [] };
  const calls = [], errors = [];
  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(8000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/single-card", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/single-card", `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/entity-single-card.tsx")}"></script></body></html>`) }));
  let failProduct = false, conflict = false;
  await page.exposeFunction("__cardCall", async (method, input) => {
    calls.push({ method, input });
    if (method === "saveProduct") { if (failProduct) throw new Error("Ürün kayıt fixture hatası"); return runtime.saveRuntimeCatalogProduct(database.databasePath, input); }
    if (method === "balance") return runtime.getRuntimeInventoryBalance(database.databasePath, input);
    if (method === "movements") return runtime.listRuntimeInventoryMovements(database.databasePath, input);
    if (method === "adjust") return runtime.applyRuntimeInventoryMovement(database.databasePath, input);
    if (method === "count") {
      if (conflict) { conflict = false; runtime.applyRuntimeInventoryMovement(database.databasePath, { productId: input.productId, type: "adjust", quantityDelta: 1 }); }
      return runtime.setRuntimeInventoryCount(database.databasePath, input);
    }
    if (method === "publication") return database.getCommerceProductPublication(input);
    if (method === "publish") return database.saveCommerceProductPublication(input);
    if (method === "saveCustomer") { const result = database.saveCustomer(input); if (result.ok) data = { ...data, customers: result.dashboardData.customers, revision: data.revision + 1 }; return result; }
    if (method === "customer") return database.getCustomer(input);
    if (method === "assign") { data = { ...data, revision: data.revision + 1, tables: data.tables.map(table => ({ ...table, currentCustomerId: input.customerId })) }; return { ok: true, message: "Bağlandı", dashboardData: data }; }
    throw new Error(`Unexpected fixture method: ${method}`);
  });
  await page.addInitScript(initial => {
    window.__cards = initial;
    const call = (method, input) => window.__cardCall(method, input);
    window.yardimciDesktop = {
      commerce: { saveProduct: input => call("saveProduct", input), getInventoryBalance: id => call("balance", id), listInventoryMovements: input => call("movements", input), applyInventoryMovement: input => call("adjust", input), setInventoryCount: input => call("count", input), getProductPublication: id => call("publication", id), saveProductPublication: input => call("publish", input), getProductImageDataUrl: async () => "" },
      saveCustomer: input => call("saveCustomer", input), getCustomer: id => call("customer", id), assignTableCustomer: input => call("assign", input),
      getBusinessMessagingConfiguration: async () => ({ enabled: false, configured: false })
    };
  }, { data, products: [product], categories: [category] });
  await page.goto(`${server.resolvedUrls.local[0]}single-card`);
  const dialog = page.getByRole("dialog");
  const button = name => dialog.getByRole("button", { name, exact: true });
  const close = () => button("Çalışma alanını kapat").click();
  await page.getByRole("button", { name: "Ürün Ekle", exact: true }).click();
  await expect(dialog.getByRole("complementary", { name: "Ürün işlemleri" })).toBeVisible();
  await expect(dialog.getByLabel("Stok işlemi", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Ürün adı", { exact: true }).fill("Yeni tek kart");
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  await dialog.getByLabel("Perakende fiyat", { exact: true }).fill("25");
  await dialog.getByLabel("Alış fiyatı", { exact: true }).fill("10");
  failProduct = true;
  await button("Ürünü Kaydet").click(); await expect(dialog.getByRole("status").filter({ hasText: "fixture hatası" })).toBeVisible();
  await expect(dialog.getByLabel("Ürün adı", { exact: true })).toHaveValue("Yeni tek kart");
  failProduct = false;
  await button("Ürünü Kaydet").click();
  await expect(dialog.getByRole("heading", { name: "Yeni tek kart", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Stok işlemi", { exact: true })).toBeEnabled();
  const created = calls.filter(call => call.method === "saveProduct").at(-1);
  assert.equal(created.input.onlineSalesPublished, true);
  await dialog.getByLabel("Web satışında yayınla", { exact: true }).uncheck();
  await expect.poll(() => calls.filter(call => call.method === "publish").length).toBe(1);
  await expect(dialog.getByLabel("Aktif ürün", { exact: true })).toBeChecked();
  await close(); await expect(page.getByRole("button", { name: "Ürün Ekle", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
  await expect(dialog.getByRole("button", { name: "Kategori", exact: true })).toContainText("Pasif gerçek kategori (Pasif)");
  await dialog.getByLabel("Stok işlem miktarı").fill("3"); await expect(dialog.getByText("İşlem sonrası: 13 piece", { exact: true })).toBeVisible();
  await button("Stok İşlemini Onayla").click(); await button("Stok Hareketini Kaydet").evaluate(element => { element.click(); element.click(); });
  await expect(dialog.getByText("Mevcut stok: 13 piece", { exact: true })).toBeVisible();
  assert.equal(calls.filter(call => call.method === "adjust").length, 1);
  await dialog.getByLabel("Stok işlemi", { exact: true }).selectOption("remove");
  await dialog.getByLabel("Stok işlem miktarı").fill("14"); await expect(button("Stok İşlemini Onayla")).toBeDisabled();
  await dialog.getByLabel("Stok işlem miktarı").fill("0"); await expect(button("Stok İşlemini Onayla")).toBeDisabled();
  await dialog.getByLabel("Stok işlem miktarı").fill("2"); await button("Stok İşlemini Onayla").click(); await button("Stok Hareketini Kaydet").click();
  await expect(dialog.getByText("Mevcut stok: 11 piece", { exact: true })).toBeVisible();
  await dialog.getByLabel("Stok işlemi", { exact: true }).selectOption("count");
  await dialog.getByLabel("Stok işlem miktarı").fill("8"); conflict = true;
  await button("Stok İşlemini Onayla").click(); await button("Stok Hareketini Kaydet").click();
  await expect(dialog.getByLabel("Stok işlem miktarı")).toHaveValue("8");
  await expect(dialog.getByText("Mevcut stok: 12 piece", { exact: true })).toBeVisible();
  await button("Stok İşlemini Onayla").click(); await button("Stok Hareketini Kaydet").click();
  await expect(dialog.getByText("Mevcut stok: 8 piece", { exact: true })).toBeVisible();
  assert.deepEqual(calls.filter(call => call.method === "adjust").map(call => [call.input.type, call.input.quantityDelta]), [["adjust", 3], ["adjust", -2]]);
  await dialog.getByLabel("Ürün adı", { exact: true }).fill("Kirli ürün"); await expect(dialog.getByLabel("Stok işlem miktarı")).toBeDisabled();
  await button("Değişiklikleri Geri Al").click();
  await dialog.getByLabel("Stok takibi", { exact: true }).uncheck(); await expect(dialog.getByLabel("Stok işlemi", { exact: true })).toHaveCount(0);
  await button("Değişiklikleri Geri Al").click(); await close();
  console.log("PASS product create/detail, inactive category, dirty guard, add/remove/count, conflict and duplicate protection");

  await page.getByRole("button", { name: "Müşteri listesi", exact: true }).click();
  await page.getByRole("button", { name: "Mevcut bayi", exact: true }).click();
  await expect(dialog.getByLabel("Firma / unvan", { exact: true })).toHaveValue("Kayıtlı firma");
  await expect(dialog.getByLabel("Adres", { exact: true })).toHaveValue("Kayıtlı adres");
  await dialog.locator("summary").click();
  await expect(dialog.getByLabel("Mesaj gönder", { exact: true })).not.toBeChecked();
  await expect(dialog.getByLabel("Kimlik / pasaport no", { exact: true })).toHaveValue("OLD123");
  await close();
  await page.getByRole("button", { name: "Yeni Müşteri", exact: true }).click();
  await expect(dialog.getByRole("complementary", { name: "Müşteri işlemleri" })).toContainText("Kaydedilmemiş");
  await dialog.getByLabel("Ad soyad", { exact: true }).fill("Yeni müşteri kartı");
  await dialog.getByLabel("Adres", { exact: true }).fill("Korunan adres");
  await dialog.locator("summary").click(); await dialog.getByLabel("Kimlik / pasaport no", { exact: true }).fill("ABC-123");
  await button("Müşteri Kartını Kaydet").click();
  await expect(dialog.getByRole("heading", { name: "Yeni müşteri kartı", exact: true })).toBeVisible();
  await dialog.getByLabel("Not", { exact: true }).fill("Güncel kayıt notu"); await button("Müşteri Kartını Kaydet").click();
  await expect(button("Müşteri Kartını Kaydet")).toBeDisabled();
  const customerSaves = calls.filter(call => call.method === "saveCustomer");
  assert.equal(customerSaves.length, 2); assert.ok(customerSaves[1].input.id);
  assert.equal(customerSaves[1].input.address, "Korunan adres"); assert.equal(customerSaves[1].input.identityNumber, "ABC123");
  await button("Kaydet ve Yeni Ekle").click(); await expect(dialog.getByLabel("Ad soyad", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel("Adres", { exact: true })).toHaveValue("");
  await page.setViewportSize({ width: 560, height: 720 });
  assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await close(); await page.setViewportSize({ width: 1440, height: 900 });
  console.log("PASS customer create/detail, saved ID reuse, address/identity preservation, save-and-new, narrow viewport");

  for (const [launcher, quick, name] of [["Odayı aç", "+ Yeni müşteri", "Oda hızlı müşteri"], ["Masayı aç", "Yeni müşteri", "Masa hızlı müşteri"]]) {
    await page.getByRole("button", { name: launcher, exact: true }).click();
    if (launcher === "Odayı aç") await page.getByRole("button", { name: "1. boş yatak", exact: true }).click();
    await page.getByRole("button", { name: quick, exact: true }).click();
    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole("complementary", { name: "Müşteri işlemleri" })).toBeVisible();
    await dialog.getByLabel("Ad soyad", { exact: true }).fill(name); await button("Müşteri Kartını Kaydet").click();
    await expect(dialog.getByRole("heading", { name, exact: true })).toBeVisible(); await close();
    if (launcher === "Odayı aç") {
      await expect(page.getByRole("button", { name: `${name} misafir slotu`, exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Değişiklikleri Bırak", exact: true }).click();
      await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
    } else await expect.poll(() => calls.filter(call => call.method === "assign").length).toBe(1);
    console.log(`PASS ${name}: canonical card and return selection`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS entity single card (isolated SQLite + local browser fixture; no live services)");
} finally {
  await browser?.close(); await server?.close(); rmSync(root, { recursive: true, force: true });
}
