import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { verifyPhoneInput } from "./test-helpers/phone-input.mjs";
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
    commercialProfile: { companyName: "Kayıtlı firma", dealerStatus: "inactive", priceGroup: "dealer_a", paymentTermDays: 15 } });
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
  let failProduct = false, failCustomer = false, conflict = false;
  await page.exposeFunction("__cardCall", async (method, input) => {
    calls.push({ method, input });
    if (method === "saveProduct") { if (failProduct) throw new Error("Ürün kayıt fixture hatası"); return runtime.saveRuntimeCatalogProduct(database.databasePath, input); }
    if (method === "products") return runtime.listRuntimeCatalogProducts(database.databasePath, input);
    if (method === "balance") return runtime.getRuntimeInventoryBalance(database.databasePath, input);
    if (method === "movements") return runtime.listRuntimeInventoryMovements(database.databasePath, input);
    if (method === "adjust") return runtime.applyRuntimeInventoryMovement(database.databasePath, input);
    if (method === "count") {
      if (conflict) { conflict = false; runtime.applyRuntimeInventoryMovement(database.databasePath, { productId: input.productId, type: "adjust", quantityDelta: 1 }); }
      return runtime.setRuntimeInventoryCount(database.databasePath, input);
    }
    if (method === "publication") return database.getCommerceProductPublication(input);
    if (method === "publish") return database.saveCommerceProductPublication(input);
    if (method === "saveCustomer") { if (failCustomer) return { ok: false, message: "Müşteri kayıt fixture hatası" }; const result = database.saveCustomer(input); if (result.ok) data = { ...data, customers: result.dashboardData.customers, revision: data.revision + 1 }; return result; }
    if (method === "customer") return database.getCustomer(input);
    if (method === "assign") { data = { ...data, revision: data.revision + 1, tables: data.tables.map(table => ({ ...table, currentCustomerId: input.customerId })) }; return { ok: true, message: "Bağlandı", dashboardData: data }; }
    throw new Error(`Unexpected fixture method: ${method}`);
  });
  await page.addInitScript(initial => {
    window.__cards = initial;
    const call = (method, input) => window.__cardCall(method, input);
    window.yardimciDesktop = {
      commerce: { listProducts: input => call("products", input), saveProduct: input => call("saveProduct", input), getInventoryBalance: id => call("balance", id), listInventoryMovements: input => call("movements", input), applyInventoryMovement: input => call("adjust", input), setInventoryCount: input => call("count", input), getProductPublication: id => call("publication", id), saveProductPublication: input => call("publish", input), getProductImageDataUrl: async () => "" },
      saveCustomer: input => call("saveCustomer", input), getCustomer: id => call("customer", id), assignTableCustomer: input => call("assign", input),
      getBusinessMessagingConfiguration: async () => ({ enabled: false, configured: false })
    };
  }, { data, products: [product], categories: [category] });
  await page.goto(`${server.resolvedUrls.local[0]}single-card`);
  const dialog = page.getByRole("dialog");
  const button = name => dialog.getByRole("button", { name, exact: true });
  const close = () => button("Çalışma alanını kapat").click();
  await page.getByRole("button", { name: "Yeni ürün", exact: true }).click();
  await expect(dialog.getByRole("complementary", { name: "Ürün işlemleri" })).toBeVisible();
  await expect(dialog.getByLabel("Stok işlemi", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Ürün adı", { exact: true }).fill("Yeni tek kart");
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  await dialog.getByLabel("Perakende fiyat", { exact: true }).fill("25");
  await dialog.getByLabel("Alış fiyatı", { exact: true }).fill("10");
  failProduct = true;
  await button("Ürünü Kaydet").click(); await expect(page.getByTestId("topbar-status")).toContainText("Ürün kayıt fixture hatası");
  await expect(dialog.locator(".product-workspace-actions [role=status], .product-workspace-actions [role=alert]")).toHaveCount(0);
  await expect(dialog.getByLabel("Ürün adı", { exact: true })).toHaveValue("Yeni tek kart");
  failProduct = false;
  await button("Ürünü Kaydet").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Yeni ürün", exact: true })).toBeFocused();
  await expect(page.getByTestId("topbar-status")).toContainText("Yeni tek kart kaydedildi.");
  await page.locator(".market-catalog-products .market-list-row").filter({ hasText: "Yeni tek kart" }).click();
  await expect(dialog.getByRole("heading", { name: "Yeni tek kart", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Stok işlemi", { exact: true })).toBeEnabled();
  const created = calls.filter(call => call.method === "saveProduct").at(-1);
  assert.equal(created.input.onlineSalesPublished, true);
  await dialog.getByLabel("Web satışında yayınla", { exact: true }).uncheck();
  await expect.poll(() => calls.filter(call => call.method === "publish").length).toBe(1);
  await expect(dialog.getByLabel("Aktif ürün", { exact: true })).toBeChecked();
  await close(); await expect(page.locator(".market-catalog-products .market-list-row").filter({ hasText: "Yeni tek kart" })).toBeFocused();
  await page.locator(`[data-sort-id="${product.id}"] .market-list-row`).click();
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
  await expect(dialog.getByLabel("Fiyat grubu", { exact: true })).toHaveValue("retail");
  await button("Müşteri Kartını Kaydet").click();
  await expect(dialog).toHaveCount(0);
  assert.equal(database.getCustomer(existing.savedId).commercialProfile.priceGroup, "retail");
  await page.getByRole("button", { name: "Mevcut bayi", exact: true }).click();
  await dialog.locator("summary").click();
  await expect(dialog.getByLabel("Mesaj gönder", { exact: true })).not.toBeChecked();
  await expect(dialog.getByLabel("Mesaj gönder", { exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("Kimlik / pasaport no", { exact: true })).toHaveValue("OLD123");
  await close();
  await page.getByRole("button", { name: "Yeni Müşteri", exact: true }).click();
  const rail = dialog.getByRole("complementary", { name: "Müşteri işlemleri" });
  const quick = rail.getByRole("region", { name: "Hızlı işlemler" });
  await expect(quick.getByRole("checkbox", { name: "Ön/arka", exact: true })).toHaveCount(1);
  await expect(quick.getByRole("button", { name: "Kimliği kameradan tara", exact: true })).toBeDisabled();
  await expect(quick.getByRole("button", { name: "Dosyadan AI ile Doldur", exact: true })).toBeDisabled();
  await expect(quick.getByRole("checkbox", { name: "Ticari / bayi müşterisi", exact: true })).toHaveCount(1);
  const birthday = quick.getByRole("checkbox", { name: "Mesaj gönder", exact: true });
  await expect(birthday).toBeVisible();
  await expect(birthday).toBeDisabled();
  await expect(dialog.getByRole("region", { name: "Ticari bilgiler", exact: true })).toHaveCount(0);
  await quick.getByRole("checkbox", { name: "Ticari / bayi müşterisi", exact: true }).check();
  await expect(dialog.getByRole("region", { name: "Ticari bilgiler", exact: true })).toBeVisible();
  await quick.getByRole("checkbox", { name: "Ticari / bayi müşterisi", exact: true }).uncheck();
  await expect(dialog.getByRole("region", { name: "Ticari bilgiler", exact: true })).toHaveCount(0);
  const quickOrder = await quick.evaluate(el => {
    const rail = el.closest(".detail-workspace-layout__rail");
    const first = rail?.querySelector(".detail-section-card");
    return first === el;
  });
  assert.equal(quickOrder, true, "Quick actions must be the topmost rail card");
  await expect(quick.locator(".customer-identity-quick-actions__flags")).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Kimlik kartı bilgileri" }).getByRole("button", { name: "Kimliği kameradan tara" })).toHaveCount(0);
  const railIdentityGeometry = await quick.locator(".customer-identity-quick-actions").evaluate(group => {
    const row = group.querySelector(".customer-identity-quick-actions__row");
    const check = row.querySelector("label").getBoundingClientRect();
    const camera = row.querySelector("button").getBoundingClientRect();
    const file = group.querySelector(".customer-identity-file-button").getBoundingClientRect();
    return {
      sameRow: Math.abs(check.top - camera.top) < 7,
      fileBelow: file.top >= camera.bottom,
      withinRail: row.scrollWidth <= row.clientWidth + 1
    };
  });
  assert.deepEqual(railIdentityGeometry, { sameRow: true, fileBelow: true, withinRail: true });
  await expect(dialog.getByRole("region", { name: "Kayıt özeti", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "Temel bilgiler", exact: true }).getByLabel("Adres", { exact: true })).toHaveCount(1);
  await expect(dialog.getByRole("region", { name: "Temel bilgiler", exact: true }).getByLabel("Not", { exact: true })).toHaveCount(1);
  const basicSection = dialog.getByRole("region", { name: "Temel bilgiler", exact: true });
  const emailBounds = await basicSection.getByLabel("E-posta", { exact: true }).boundingBox();
  const noteBounds = await basicSection.getByLabel("Not", { exact: true }).boundingBox();
  const addressBounds = await basicSection.getByLabel("Adres", { exact: true }).boundingBox();
  const gridBounds = await basicSection.locator(".form-grid").boundingBox();
  assert.ok(emailBounds && noteBounds && addressBounds && gridBounds);
  assert.ok(Math.abs(noteBounds.width - emailBounds.width) < 2, "Note and email share width");
  assert.ok(Math.abs(addressBounds.x - gridBounds.x) < 2, "Address spans grid from the left");
  assert.ok(Math.abs(addressBounds.x + addressBounds.width - gridBounds.x - gridBounds.width) < 2, "Address spans grid to the right");
  assert.ok(Math.abs(noteBounds.x + noteBounds.width - gridBounds.x - gridBounds.width) < 18, "Right customer column ends close to the form edge");
  await dialog.getByLabel("Ad soyad", { exact: true }).fill("Yeni müşteri kartı");
  await verifyPhoneInput(page, dialog.getByLabel("Telefon", { exact: true }));
  await dialog.getByLabel("Telefon", { exact: true }).fill("+90 (532) 123-45-67");
  await dialog.getByLabel("Adres", { exact: true }).fill("Korunan adres");
  await dialog.locator("summary").click();
  const birthBounds = await dialog.getByRole("button", { name: "Doğum tarihi", exact: true }).boundingBox();
  const expiryBounds = await dialog.getByRole("button", { name: "Son geçerlilik", exact: true }).boundingBox();
  assert.ok(birthBounds && expiryBounds);
  assert.ok(Math.abs(birthBounds.width - expiryBounds.width) < 2, "Birth and expiry dates share width");
  await dialog.getByLabel("Kimlik / pasaport no", { exact: true }).fill("ABC-123");
  failCustomer = true;
  await button("Müşteri Kartını Kaydet").click();
  await expect(page.getByTestId("topbar-status")).toHaveText("Müşteri kayıt fixture hatası");
  await expect(dialog.getByLabel("Ad soyad", { exact: true })).toHaveValue("Yeni müşteri kartı");
  await expect(dialog.locator(".customer-workspace-footer [role=status], .customer-workspace-footer [role=alert]")).toHaveCount(0);
  failCustomer = false;
  await button("Müşteri Kartını Kaydet").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("topbar-status")).not.toContainText("fixture hatası");
  await page.getByRole("button", { name: "Yeni müşteri kartı", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Yeni müşteri kartı", exact: true })).toBeVisible();
  await dialog.getByLabel("Not", { exact: true }).fill("Güncel kayıt notu"); await button("Müşteri Kartını Kaydet").click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Yeni müşteri kartı", exact: true }).click();
  const customerSaves = calls.filter(call => call.method === "saveCustomer" && call.input.fullName === "Yeni müşteri kartı");
  assert.equal(customerSaves.length, 3); assert.ok(customerSaves[2].input.id);
  assert.equal(customerSaves[1].input.phone, "+90 (532) 123-45-67");
  await expect(dialog.getByLabel("Telefon", { exact: true })).toHaveValue("+905321234567");
  await verifyPhoneInput(page, dialog.getByLabel("Telefon", { exact: true }));
  assert.equal(customerSaves[2].input.address, "Korunan adres"); assert.equal(customerSaves[2].input.identityNumber, "ABC123");
  await close();
  await page.getByRole("button", { name: "Yeni Müşteri", exact: true }).click();
  await dialog.getByLabel("Ad soyad", { exact: true }).fill("Ardışık müşteri kaydı");
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
    await expect(page.locator("dialog.customer-workspace-frame")).toHaveCount(0);
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
