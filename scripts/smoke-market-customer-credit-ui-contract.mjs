import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const runtime = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { applyBusinessProfileCapabilities, readBusinessCapabilitySnapshot, setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const appPath = join(process.cwd(), "apps/desktop-app");
const dataDir = mkdtempSync(join(tmpdir(), "yardimci-m82-ui-"));
const artifacts = join(process.cwd(), "artifacts/screenshots/m82-credit");
const database = new DesktopDatabase({ appPath, userDataPath: dataDir });
let raw;
let server;
let browser;
let page;

try {
  database.initialize();
  const setupResult = database.saveInitialSetup({
    businessName: "Veresiye UI Test İşletmesi",
    profileId: "market",
    phone: "+905550002013",
    whatsapp: "+905550002013",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "credit-ui-secret",
    autoSyncEnabled: false,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "",
    aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKey: "",
    clearAiApiKey: false,
    servicePreferences: { whatsapp: true, android: true },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  const path = database.databasePath;
  // A cafe with explicit retail capabilities proves there is no profile gate.
  applyBusinessProfileCapabilities(path, "cafe", { preserveUserOverrides: false });
  setBusinessCapability(path, { capability: "commerce.customer_credit", enabled: true });
  setBusinessCapability(path, { capability: "retail.barcode", enabled: true });
  setBusinessCapability(path, { capability: "service.whatsapp", enabled: false });
  setBusinessCapability(path, { capability: "service.android", enabled: false });
  raw = new DatabaseSync(path);
  const saved = database.saveCustomer({ fullName: "Ahmet Veresiye", phone: "+905551112233" });
  assert.equal(saved.ok, true);
  const customerId = saved.savedId;
  const other = database.saveCustomer({ fullName: "Zeynep Hesap", phone: "+905559998877" }).savedId;
  const historyCustomer = database.saveCustomer({ fullName: "Zümra Satış Geçmişi" }).savedId;
  const deletedId = database.saveCustomer({ fullName: "Silinmiş Kişi" }).savedId;
  assert.equal(database.deleteCustomer(deletedId).ok, true);
  const product = runtime.saveRuntimeCatalogProduct(path, { name: "Veresiye Test Ürünü", barcode: "8690000082001", salePrice: 25 });
  assert.ok(readBusinessCapabilitySnapshot(path).enabledCapabilities.includes("retail.barcode"), JSON.stringify(readBusinessCapabilitySnapshot(path)));
  runtime.applyRuntimeInventoryMovement(path, { productId: product.id, quantityDelta: 100, type: "purchase" });
  const addDebt = (id, amountMinor, currency = "TRY") => runtime.addCustomerCreditAdjustment(path, {
    customerId: id, amountMinor, currency, entryType: "adjustment_debit", note: "Önceki hesap", source: "smoke"
  });
  addDebt(customerId, 50000);
  addDebt(customerId, 2000, "EUR");
  const account = () => runtime.getCustomerCreditAccount(path, customerId);
  const balance = (currency = "TRY") => account().balances.find((b) => b.currency === currency)?.amountMinor ?? 0;
  const count = (table) => raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const calls = [];
  let barcodeEvents = [];
  let failReview = false;
  let failRead = false;
  let failSale = false;
  let delayPayment = false;
  let releasePayment;
  const methods = {
    listProducts: runtime.listRuntimeCatalogProducts,
    listCategories: runtime.listRuntimeCatalogCategories,
    createPaidSale: runtime.createRuntimePaidSale,
    createCustomerCreditSale: runtime.createCustomerCreditSale,
    getCustomerCreditAccount: runtime.getCustomerCreditAccount,
    listCustomerCreditEntries: runtime.listCustomerCreditEntries,
    listCustomerCreditAccounts: runtime.listCustomerCreditAccounts,
    recordCustomerCreditPayment: runtime.recordCustomerCreditPayment,
    addCustomerCreditAdjustment: runtime.addCustomerCreditAdjustment,
    listCartDrafts: runtime.listMarketCartDrafts,
    loadCartDraftForQuickSale: runtime.loadMarketCartDraftForQuickSale,
    markCartDraftReviewed: runtime.markMarketCartDraftReviewed,
    findProductByBarcode: runtime.findRuntimeProductByBarcode
  };

  server = await createServer({
    root: appPath, configFile: join(appPath, "vite.renderer.config.ts"), logLevel: "error",
    server: { port: 0, host: "127.0.0.1", strictPort: false },
    plugins: [{ name: "m82-smoke-page", configureServer(instance) {
      instance.middlewares.use("/m82-smoke", async (_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(await instance.transformIndexHtml("/m82-smoke", `<!doctype html><html lang="tr" data-color-scheme="light" data-density="compact" data-accent="coral" data-font="plex" data-motion="system"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Veresiye UI smoke</title>
          <style>.smoke-shell { max-width:1400px; margin:auto; padding:24px; } .smoke-shell > nav { display:flex; gap:12px; margin-bottom:16px; }</style></head>
          <body><div id="root"></div><script type="module" src="/@fs/${join(process.cwd(), "scripts/fixtures/customer-credit-ui.tsx")}"></script></body></html>`));
      });
    } }]
  });
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on("pageerror", (error) => { pageErrors.push(error.message); console.error(error.message); });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.exposeFunction("__m82Call", async (method, args) => {
    calls.push({ method, args });
    if (method === "toggleCredit") return setBusinessCapability(path, { capability: "commerce.customer_credit", enabled: args[0] });
    if (method === "deleteCustomer") return database.deleteCustomer(args[0]);
    if (method === "saveCustomer") return database.saveCustomer(args[0]);
    if (method === "setBarcodeScanMode") return { active: args[0], intervalMs: 1500, transport: "hosting" };
    if (method === "consumePendingBarcodeScans") { const result = barcodeEvents; barcodeEvents = []; return result; }
    if (method === "markCartDraftReviewed" && failReview) throw new Error("Kaynak sepet kapatılamadı.");
    if (method === "getCustomerCreditAccount" && failRead) { failRead = false; throw new Error("Hesap bilgileri alınamadı. Yeniden deneyin."); }
    if (method === "createCustomerCreditSale" && failSale) { failSale = false; throw new Error("Yetersiz stok."); }
    if (method === "recordCustomerCreditPayment" && delayPayment) await new Promise((resolve) => { releasePayment = resolve; });
    assert.ok(methods[method], `Unexpected bridge call: ${method}`);
    return methods[method](path, ...args);
  });
  await page.addInitScript(({ dashboard, snapshot, methodNames }) => {
    window.__m82Initial = { dashboard, snapshot };
    const invoke = (method) => (...args) => window.__m82Call(method, args);
    window.yardimciDesktop = {
      commerce: Object.fromEntries(methodNames.map((method) => [method, invoke(method)])),
      deleteCustomer: invoke("deleteCustomer"), saveCustomer: invoke("saveCustomer")
    };
  }, { dashboard: database.getDashboardData(), snapshot: readBusinessCapabilitySnapshot(path),
    methodNames: [...Object.keys(methods), "setBarcodeScanMode", "consumePendingBarcodeScans"] });
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/m82-smoke`, { timeout: 60000 });
  const topbarStatus = page.getByTestId("topbar-status");
  const closeCustomerWorkspace = async () => {
    const workspace = page.getByRole("dialog").filter({ has: page.getByRole("tablist", { name: "Müşteri çalışma alanı" }) });
    if (await workspace.count()) {
      await workspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
      await expect(workspace).toHaveCount(0);
    }
  };
  const openCustomerWorkspace = async (name) => {
    await closeCustomerWorkspace();
    await page.getByRole("button", { name }).click();
    const workspace = page.getByRole("dialog").filter({ has: page.getByRole("tablist", { name: "Müşteri çalışma alanı" }) });
    await expect(workspace).toBeVisible();
    return workspace;
  };
  const openCustomerAccount = async (name) => {
    const workspace = await openCustomerWorkspace(name);
    await workspace.getByRole("tab", { name: "Hesap", exact: true }).click();
    return workspace;
  };
  await expect(page.getByRole("heading", { name: "Hızlı Satış", exact: true })).toBeVisible();
  await expect(page.locator(".market-status")).toHaveCount(0);
  // Local UI remains functional after all browser networking is unavailable.
  await context.setOffline(true);
  const quick = page.locator(".market-sale-cart");
  const chooseCustomer = async () => {
    await quick.getByLabel("Ödeme yöntemi").selectOption("credit");
    await quick.getByLabel("Müşteri ara", { exact: true }).fill("555111");
    await quick.getByLabel("Müşteri", { exact: true }).selectOption(customerId);
    await expect(quick.getByRole("definition").filter({ hasText: "₺500,00" })).toBeVisible();
  };
  const addProduct = () => page.locator(".market-sale-product").filter({ hasText: product.name }).click();
  const creditCalls = () => calls.filter((call) => /CustomerCredit/.test(call.method));
  assert.equal(creditCalls().length, 0, "Cash mode must not fetch hidden accounts.");
  await expect(quick.getByLabel("Ödeme yöntemi").locator('option[value="credit"]')).toHaveCount(1);
  await addProduct();
  await quick.getByLabel("Ödeme yöntemi").selectOption("credit");
  await expect(quick.getByRole("button", { name: "Satışı Veresiye Kaydet" })).toBeDisabled();
  await expect(quick.getByLabel("Müşteri", { exact: true }).locator(`option[value="${deletedId}"]`)).toHaveCount(0);
  await chooseCustomer();
  await expect(quick.locator(".customer-credit-balances")).toContainText("€20,00");
  await quick.getByRole("button", { name: "Seçimi Temizle" }).click();
  await expect(quick.getByRole("button", { name: "Satışı Veresiye Kaydet" })).toBeDisabled();
  await quick.getByLabel("Müşteri ara", { exact: true }).fill("ahmet");
  await quick.getByLabel("Müşteri", { exact: true }).selectOption(customerId);
  await expect(quick.locator(".customer-credit-balances")).toContainText("₺500,00");
  await page.setViewportSize({ width: 900, height: 1000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Narrow customer picker must not overflow horizontally.");
  mkdirSync(artifacts, { recursive: true });
  await quick.screenshot({ path: join(artifacts, "picker-narrow.png") });
  await page.setViewportSize({ width: 1440, height: 1100 });
  // Price changed after rendering: receipt and ledger must reflect backend price.
  raw.prepare("UPDATE catalog_products SET sale_price = 30 WHERE id = ?").run(product.id);
  const financesBefore = count("finance_entries");
  const catalogReadsBefore = calls.filter((call) => call.method === "listProducts").length;
  failSale = true;
  await quick.getByRole("button", { name: "Satışı Veresiye Kaydet" }).click();
  await expect(topbarStatus).toContainText("Yetersiz stok");
  await expect(quick.locator(".market-sale-cart-line")).toHaveCount(1);
  assert.equal(balance(), 50000);
  await quick.getByRole("button", { name: "Satışı Veresiye Kaydet" }).click();
  await expect(quick.locator(".market-sale-receipt")).toContainText("Veresiye satış kaydedildi.");
  await expect(quick.locator(".market-sale-receipt")).toContainText("₺30,00 borç işlendi.");
  await expect(quick.locator(".market-sale-receipt")).not.toContainText(/Ödendi|Ödeme alındı|Tahsil edildi/i);
  await expect(quick.locator(".market-sale-cart-line")).toHaveCount(0);
  await expect(quick.getByLabel("Ödeme yöntemi")).toHaveValue("cash");
  assert.equal(balance(), 53000);
  assert.equal(count("finance_entries"), financesBefore);
  assert.ok(calls.filter((call) => call.method === "listProducts").length > catalogReadsBefore, "Successful sale reloads catalog.");
  const salePayload = calls.filter((call) => call.method === "createCustomerCreditSale").at(-1).args[0];
  assert.deepEqual(Object.keys(salePayload).sort(), ["customerId", "discountTotal", "items", "source"]);
  assert.deepEqual(salePayload.items, [{ productId: product.id, quantity: 1 }]);

  for (const method of ["cash", "card", "transfer", "other"]) {
    await addProduct();
    await quick.getByLabel("Ödeme yöntemi").selectOption(method);
    await quick.getByRole("button", { name: "Ödemeyi Al ve Satışı Tamamla" }).click();
    await expect(quick.locator(".market-sale-cart-line")).toHaveCount(0);
    assert.equal(calls.filter((call) => call.method === "createPaidSale").at(-1).args[0].paymentMethod, method);
  }
  assert.equal(balance(), 53000);

  await page.evaluate(() => window.__m82Toggle(false));
  const hiddenStart = creditCalls().length;
  await expect(quick.getByLabel("Ödeme yöntemi").locator('option[value="credit"]')).toHaveCount(0);
  await page.getByRole("navigation", { name: "Çalışma alanı" }).getByRole("button", { name: "Müşteriler" }).click();
  await expect(page.getByRole("region", { name: "Veresiye hesabı" })).toHaveCount(0);
  assert.equal(creditCalls().length, hiddenStart);
  await page.evaluate(() => window.__m82Toggle(true));
  let customerWorkspace = await openCustomerAccount(/Ahmet Veresiye/);
  const panel = page.getByRole("region", { name: "Veresiye hesabı" });
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺530,00");
  await expect(panel.locator(".customer-credit-balances")).toContainText("€20,00");
  await expect(panel.getByRole("list", { name: "Satış kalemleri" })).toContainText("1 × Veresiye Test Ürünü");
  await expect(panel.getByRole("list", { name: "Satış kalemleri" })).toContainText("₺30,00/birim · ₺30,00");
  assert.ok(creditCalls().every((call) => call.method !== "listCustomerCreditAccounts"), "Selected account has no per-customer summary fan-out.");
  await page.evaluate(() => window.__m82Toggle(false));
  await expect(panel).toHaveCount(0);
  const hiddenPanelCalls = creditCalls().length;
  customerWorkspace = await openCustomerWorkspace(/Zeynep Hesap/);
  await expect(customerWorkspace.getByRole("tab", { name: "Hesap", exact: true })).toHaveCount(0);
  customerWorkspace = await openCustomerWorkspace(/Ahmet Veresiye/);
  await expect(customerWorkspace.getByRole("tab", { name: "Hesap", exact: true })).toHaveCount(0);
  assert.equal(creditCalls().length, hiddenPanelCalls, "Changing customers while disabled must not fetch accounts.");
  await page.evaluate(() => window.__m82Toggle(true));
  await customerWorkspace.getByRole("tab", { name: "Hesap", exact: true }).click();
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺530,00");
  await customerWorkspace.getByRole("tab", { name: "Özet", exact: true }).click();
  await customerWorkspace.getByRole("button", { name: "Müşteriyi Sil", exact: true }).click();
  await expect(topbarStatus).toContainText("Bu müşterinin açık veresiye borcu var.");
  await expect(page.getByRole("alert").filter({ hasText: "Bu müşterinin açık veresiye borcu var." })).toHaveCount(0);
  await customerWorkspace.getByRole("tab", { name: "Hesap", exact: true }).click();

  await panel.getByRole("button", { name: "Tahsilat Al", exact: true }).click();
  let payment = panel.getByRole("form", { name: "Tahsilat", exact: true });
  await payment.getByLabel("Para birimi").selectOption("TRY");
  for (const invalid of ["0", "-1", "1,001"]) {
    await payment.getByLabel("Tutar", { exact: true }).fill(invalid);
    await expect(payment.getByRole("button", { name: "Tahsilatı Kaydet" })).toBeDisabled();
  }
  await payment.getByLabel("Tutar", { exact: true }).fill("531,00");
  await expect(payment.getByRole("alert")).toContainText("Bu tutar mevcut borçtan büyük.");
  await expect(payment.getByRole("button", { name: "Tahsilatı Kaydet" })).toBeDisabled();
  await payment.getByLabel("Tutar", { exact: true }).fill("200,00");
  await payment.getByLabel("Ödeme yöntemi").selectOption("bank");
  await payment.getByLabel("Not (isteğe bağlı)").fill("Banka üzerinden");
  delayPayment = true;
  const beforePayments = count("finance_entries");
  await payment.getByRole("button", { name: "Tahsilatı Kaydet" }).click();
  await expect(payment.getByRole("button", { name: "Kaydediliyor…" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Hesabı Kapat" })).toBeDisabled();
  await payment.evaluate((form) => form.requestSubmit());
  await expect.poll(() => Boolean(releasePayment)).toBe(true);
  delayPayment = false;
  releasePayment();
  await expect(topbarStatus).toContainText("₺200,00 tahsilat kaydedildi.");
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺330,00");
  await expect(panel.getByRole("region", { name: "Hesap hareketleri" })).toContainText("Banka üzerinden");
  assert.equal(count("finance_entries"), beforePayments + 1);
  assert.equal(calls.filter((call) => call.method === "recordCustomerCreditPayment").length, 1);
  assert.equal(raw.prepare("SELECT payment_method FROM finance_entries WHERE source_type = 'customer_credit_payment' ORDER BY created_at DESC LIMIT 1").get().payment_method, "bank");

  // Stale displayed balance: backend rejects and UI refreshes from the account API.
  await panel.getByRole("button", { name: "Tahsilat Al", exact: true }).click();
  payment = panel.getByRole("form", { name: "Tahsilat", exact: true });
  await payment.getByLabel("Para birimi").selectOption("TRY");
  runtime.recordCustomerCreditPayment(path, { customerId, amountMinor: 30000, currency: "TRY", paymentMethod: "cash" });
  await payment.getByLabel("Tutar", { exact: true }).fill("100,00");
  await payment.getByRole("button", { name: "Tahsilatı Kaydet" }).click();
  await expect(topbarStatus).toContainText("borcunu aşamaz");
  await expect(payment.getByRole("alert")).toHaveCount(0);
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺30,00");
  await payment.getByRole("button", { name: "Vazgeç" }).click();
  await expect(panel.getByRole("button", { name: "Hesabı Kapat" })).toBeFocused();
  await panel.getByRole("button", { name: "Düzeltme", exact: true }).click();
  const correction = panel.getByRole("form", { name: "Hesap düzeltmesi" });
  await correction.getByLabel("Tutar", { exact: true }).fill("100,00");
  await correction.getByLabel("Para birimi").fill("TRY");
  await expect(correction.getByRole("button", { name: "Düzeltmeyi Kaydet" })).toBeDisabled();
  await correction.getByLabel("Açıklama / neden (zorunlu)").fill("Önceki borç düzeltmesi");
  await correction.getByRole("button", { name: "Düzeltmeyi Kaydet" }).click();
  await expect(topbarStatus).toContainText("Düzeltme kaydedildi.");
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺130,00");
  await panel.getByRole("button", { name: "Düzeltme", exact: true }).click();
  await correction.getByLabel("Tür", { exact: true }).selectOption("adjustment_credit");
  await correction.getByLabel("Para birimi").selectOption("TRY");
  await correction.getByLabel("Tutar", { exact: true }).fill("131");
  await correction.getByLabel("Açıklama / neden (zorunlu)").fill("Yanlış kayıt düzeltmesi");
  await expect(correction.getByRole("button", { name: "Düzeltmeyi Kaydet" })).toBeDisabled();
  await correction.getByLabel("Tutar", { exact: true }).fill("50");
  await correction.getByRole("button", { name: "Düzeltmeyi Kaydet" }).click();
  await expect(topbarStatus).toContainText("Düzeltme kaydedildi.");
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺80,00");
  await expect(panel.getByRole("region", { name: "Hesap hareketleri" })).toContainText("Alacak düzeltmesi");

  mkdirSync(artifacts, { recursive: true });
  await panel.screenshot({ path: join(artifacts, "account-desktop.png") });
  // The desktop shell has an existing 900px body minimum; test its supported floor.
  await page.setViewportSize({ width: 900, height: 1000 });
  await panel.getByRole("button", { name: "Tahsilat Al", exact: true }).click();
  await expect(panel.getByRole("form")).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Narrow desktop must not overflow horizontally.");
  await panel.screenshot({ path: join(artifacts, "account-narrow.png") });
  await panel.getByLabel("Tutar", { exact: true }).press("Escape");
  await expect(panel.getByRole("form")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1100 });

  // A committed payment followed by a failed refresh must never invite resubmission.
  await panel.getByRole("button", { name: "Tahsilat Al", exact: true }).click();
  payment = panel.getByRole("form", { name: "Tahsilat", exact: true });
  await payment.getByLabel("Para birimi").selectOption("EUR");
  await payment.getByLabel("Tutar", { exact: true }).fill("20,00");
  failRead = true;
  await payment.getByRole("button", { name: "Tahsilatı Kaydet" }).click();
  await expect(panel.getByRole("form")).toHaveCount(0);
  await expect(topbarStatus).toContainText("Hesap bilgileri alınamadı");
  await panel.getByRole("button", { name: "Hesabı Yenile" }).click();
  await expect(panel.locator(".customer-credit-balances")).toContainText("€0,00");
  assert.equal(balance("EUR"), 0);
  await panel.getByRole("button", { name: "Tahsilat Al", exact: true }).click();
  payment = panel.getByRole("form", { name: "Tahsilat", exact: true });
  await payment.getByLabel("Tutar", { exact: true }).fill("80,00");
  await payment.getByRole("button", { name: "Tahsilatı Kaydet" }).click();
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺0,00");
  await expect(panel.getByRole("button", { name: "Tahsilat Al", exact: true })).toBeDisabled();
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_sales WHERE status = 'credit'").get().n, 1, "Old credit sale status must not determine current debt.");

  // Real M7 cart draft loads into the same cart and closes after a credit sale.
  const draft = runtime.createMarketCartDraft(path, { lines: [{ productId: product.id, quantity: 2 }], source: "android", createdByDevice: "Test Telefonu" });
  await closeCustomerWorkspace();
  await page.getByRole("navigation", { name: "Çalışma alanı" }).getByRole("button", { name: "Market", exact: true }).click();
  await page.getByRole("button", { name: /Telefon Sepetleri/ }).click();
  await page.getByRole("button", { name: "Hızlı Satış'a Yükle" }).click();
  await expect(quick.locator(".market-sale-cart-line")).toHaveCount(1);
  await quick.getByLabel("Ödeme yöntemi").selectOption("credit");
  await quick.getByLabel("Müşteri", { exact: true }).selectOption(other);
  failReview = true;
  await quick.getByRole("button", { name: "Satışı Veresiye Kaydet" }).click();
  await expect(quick.locator(".market-sale-review-recovery")).toContainText("Veresiye satış kaydedildi");
  const salesBeforeRetry = count("commerce_sales");
  failReview = false;
  await quick.getByRole("button", { name: "Taslağı Kapat", exact: true }).click();
  await expect(quick.locator(".market-sale-review-recovery")).toHaveCount(0);
  assert.equal(count("commerce_sales"), salesBeforeRetry);
  assert.equal(runtime.getMarketCartDraft(path, draft.draft.id).draft.status, "reviewed");
  // Only the existing scanner transport boundary is simulated; product lookup,
  // shared cart and credit sale all use the actual components/runtime.
  barcodeEvents = [{ id: "scan-m82", deviceId: "Test Telefonu", barcode: product.barcode }];
  assert.ok(readBusinessCapabilitySnapshot(path).enabledCapabilities.includes("retail.barcode"), JSON.stringify(readBusinessCapabilitySnapshot(path)));
  // Hızlı Satış artık telefon barkod kanalını mount olur olmaz otomatik dinler;
  // kullanıcıdan ikinci bir masaüstü modu açması beklenmez.
  await expect(page.locator(".market-phone-device")).toContainText("Hazır");
  await expect(quick.locator(".market-sale-cart-line")).toHaveCount(1);
  await quick.getByLabel("Ödeme yöntemi").selectOption("credit");
  await quick.getByLabel("Müşteri", { exact: true }).selectOption(other);
  await quick.getByRole("button", { name: "Satışı Veresiye Kaydet" }).click();
  await expect(quick.locator(".market-sale-cart-line")).toHaveCount(0);
  await quick.screenshot({ path: join(artifacts, "credit-receipt.png") });
  assert.equal(runtime.getCustomerCreditAccount(path, other).balances[0].amountMinor, 9000);
  // Seed older-account volume before mounting it; mutations below still use the UI.
  for (let index = 0; index < 201; index += 1) addDebt(other, 1);

  await page.getByRole("navigation", { name: "Çalışma alanı" }).getByRole("button", { name: "Müşteriler" }).click();
  customerWorkspace = await openCustomerWorkspace(/Ahmet Veresiye/);
  await customerWorkspace.getByRole("button", { name: "Müşteriyi Sil", exact: true }).click();
  await expect(page.getByRole("button", { name: /Ahmet Veresiye/ })).toHaveCount(0);
  assert.ok(runtime.getCustomerCreditAccount(path, customerId).customer.deletedAt);
  // Full balance is independent of the first 200 displayed movements.
  customerWorkspace = await openCustomerAccount(/Zeynep Hesap/);
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺92,01");
  await panel.getByRole("button", { name: "Hesabı Aç", exact: true }).click();
  const history = panel.getByRole("region", { name: "Hesap hareketleri" });
  await expect(history.locator(":scope > ul > li")).toHaveCount(200);
  const paginationCalls = calls.length;
  await history.getByRole("button", { name: "Daha Eski Hareketler" }).click();
  await expect(history.locator(":scope > ul > li")).toHaveCount(203);
  await expect(history.getByRole("button", { name: "Daha Eski Hareketler" })).toHaveCount(0);
  assert.deepEqual(calls.slice(paginationCalls).map((call) => call.method), ["listCustomerCreditEntries"]);

  // Historical names/prices and missing products are exercised through the real
  // account IPC-shaped boundary, including 200 sale movements on the first page.
  const snapshotProducts = Array.from({ length: 6 }, (_, index) => runtime.saveRuntimeCatalogProduct(path, {
    name: `Tarihi Ürün ${index + 1}`, salePrice: 10 + index, trackInventory: false
  }));
  const longSale = runtime.createCustomerCreditSale(path, { customerId: historyCustomer,
    items: snapshotProducts.map((item) => ({ productId: item.id, quantity: 2 })), discountTotal: 5 });
  const missingSale = runtime.createCustomerCreditSale(path, { customerId: historyCustomer,
    items: [{ productId: snapshotProducts[0].id, quantity: 1 }] });
  raw.prepare("DELETE FROM commerce_sale_items WHERE sale_id = ?").run(missingSale.id);
  addDebt(historyCustomer, 100);
  runtime.recordCustomerCreditPayment(path, { customerId: historyCustomer, amountMinor: 100, currency: "TRY", paymentMethod: "cash" });
  for (let index = 0; index < 200; index += 1) runtime.createCustomerCreditSale(path, { customerId: historyCustomer,
    items: [{ productId: snapshotProducts[0].id, quantity: 2 }] });
  runtime.saveRuntimeCatalogProduct(path, { id: snapshotProducts[0].id, name: "Yeni katalog adı", salePrice: 999, trackInventory: false });
  raw.prepare("DELETE FROM catalog_products WHERE id = ?").run(snapshotProducts[5].id);
  const beforeHistory = runtime.getCustomerCreditAccount(path, historyCustomer);
  const ledgerBeforeHistory = raw.prepare("SELECT * FROM customer_credit_entries WHERE customer_id = ? ORDER BY id").all(historyCustomer);
  const initialHistoryCalls = calls.length;
  customerWorkspace = await openCustomerAccount(/Zümra Satış Geçmişi/);
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺4.155,00");
  await panel.getByRole("button", { name: "Hesabı Aç", exact: true }).click();
  await expect(history.locator(":scope > ul > li")).toHaveCount(200);
  await expect(history.getByRole("list", { name: "Satış kalemleri" })).toHaveCount(200);
  await expect(history.getByRole("list", { name: "Satış kalemleri" }).first()).toContainText("2 × Tarihi Ürün 1");
  await expect(history.getByRole("list", { name: "Satış kalemleri" }).first()).toContainText("₺10,00/birim · ₺20,00");
  const initialReads = calls.slice(initialHistoryCalls);
  assert.ok(initialReads.length <= 2, "StrictMode may mount twice, but 200 sales never cause per-sale IPC.");
  assert.ok(initialReads.every((call) => call.method === "getCustomerCreditAccount"));
  const moreCalls = calls.length;
  await history.getByRole("button", { name: "Daha Eski Hareketler" }).click();
  await expect(history.locator(":scope > ul > li")).toHaveCount(204);
  assert.deepEqual(calls.slice(moreCalls), [{ method: "listCustomerCreditEntries", args: [historyCustomer, { offset: 200, limit: 200 }] }]);
  const longMovement = history.locator(":scope > ul > li").filter({ hasText: "Veresiye satış toplamı" });
  await expect(longMovement.getByRole("listitem")).toHaveCount(4);
  await expect(longMovement.locator(".customer-credit-debt")).toHaveText("+₺145,00");
  await expect(longMovement.locator(".customer-credit-sale-summary")).toHaveText("Ara toplam₺150,00İndirim−₺5,00Veresiye satış toplamı₺145,00");
  assert.equal(longSale.total, 145);
  const expandCalls = calls.length;
  await longMovement.getByRole("button", { name: "Tüm kalemleri göster" }).click();
  await expect(longMovement.getByRole("listitem")).toHaveCount(6);
  for (let index = 0; index < snapshotProducts.length; index += 1) {
    const line = longMovement.getByRole("listitem").nth(index);
    await expect(line).toContainText(`2 × Tarihi Ürün ${index + 1}`);
    await expect(line).toContainText(`₺${10 + index},00/birim · ₺${(10 + index) * 2},00`);
  }
  assert.equal(calls.length, expandCalls, "Expanding lines does not fetch sale details.");
  await expect(history).not.toContainText("Yeni katalog adı");
  await expect(history).not.toContainText("₺999,00");
  const missingMovement = history.locator(":scope > ul > li").filter({ hasText: "Satış ayrıntısı bulunamadı." });
  await expect(missingMovement).toHaveCount(1);
  await expect(missingMovement.locator(".customer-credit-debt")).toHaveText("+₺10,00");
  for (const label of ["Tahsilat", "Borç düzeltmesi"]) {
    const movement = history.locator(":scope > ul > li").filter({ hasText: label });
    await expect(movement).toHaveCount(1);
    await expect(movement.locator(".customer-credit-sale-detail")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 900, height: 1000 });
  await longMovement.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: join(artifacts, "history-sale-items-narrow.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), JSON.stringify(await page.evaluate(() =>
    [...document.querySelectorAll("body *")].filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 12).map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width })))));
  await longMovement.getByRole("button", { name: "Daha az göster" }).click();
  await expect(longMovement.getByRole("listitem")).toHaveCount(4);
  assert.deepEqual(runtime.getCustomerCreditAccount(path, historyCustomer).balances, beforeHistory.balances);
  assert.deepEqual(raw.prepare("SELECT * FROM customer_credit_entries WHERE customer_id = ? ORDER BY id").all(historyCustomer), ledgerBeforeHistory);
  assert.ok(calls.every((call) => !/finance|bootstrap|getDashboardData/i.test(call.method)), "No separate finance writes or bootstrap refreshes.");
  assert.deepEqual(pageErrors, []);
  const source = readFileSync(join(appPath, "src/components/customers/CustomerCreditForm.tsx"), "utf8");
  assert.doesNotMatch(source, /saveManualFinanceEntry|updateEntry|deleteEntry/);
  const customerControllerSource = readFileSync(join(appPath, "src/app/use-customer-controller.ts"), "utf8");
  assert.match(customerControllerSource, /müşteri kaydı silinsin mi\?/);
  assert.doesNotMatch(customerControllerSource, /Eski talep ve rezervasyon kayıtları korunur/);
  console.log("market-customer-credit-ui-contract-smoke-ok: actual React UI + SQLite, offline, topbar-only operation notices, capability gates, payments, corrections, M7 draft/scanner and responsive layout");
} catch (error) {
  if (page) console.error("UI at failure:", await page.locator("body").innerText());
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  raw?.close();
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
