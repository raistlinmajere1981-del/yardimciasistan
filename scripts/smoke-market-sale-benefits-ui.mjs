import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { chooseSearchSelect } from "./test-helpers/search-select.mjs";
import { saleFixture, completeMarketSale, load } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { exampleRules, installRules, adjust, issue } from "./test-helpers/commerce-benefits-fixture.mjs";
const { previewMarketSaleBenefits, getMarketSaleBenefitsState } = load("market-sale-benefits");
const { listRuntimeCatalogProducts, resolveRuntimeProductPrice } = load("commerce-runtime");
const f = saleFixture();
let server, browser;
const errors = [], calls = [], previews = [];
let loseResponse = false, delayPreview = false, releasePreview;
const receiptCalls = [];
const outputCalls = [];
let printResult = { ok: false, code: "DOCUMENT_PRINT_CANCELLED", message: "Yazdırma iptal edildi." }, delayOutput = false, releaseOutput;
let receiptResult = { ok: false, code: "DOCUMENT_SALE_JOB_CONFIGURATION_MISSING", message: "missing" }, delayReceipt = false, releaseReceipt;
try {
  installRules(f, exampleRules().map(rule => ({ ...rule, startsAt: 0, ...(rule.family === "coupon" ? { fixedMinor: 0, percentBps: 1000 } : {}) })));
  adjust(f);
  const coupon = issue(f, { maxUses: 10, expiresAt: Date.now() + 600000 });
  const product = listRuntimeCatalogProducts(f.path).items[0];
  const customer = { id: "c1", fullName: "Test Müşterisi", phone: "", email: "", source: "manual", notes: "", tags: [],
    lastContactAt: "", requestCount: 0, reservationCount: 0, stayCount: 0, updatedAt: "fixture" };
  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", e => errors.push(e.message));
  await page.exposeFunction("__benefitsCall", async (method, input) => {
    if (method === "receipt-preview" || method === "receipt-print") {
      outputCalls.push({ method, input });
      if (delayOutput) await new Promise(done => { releaseOutput = done; });
      return method === "receipt-preview" ? { ok: true, value: null } : printResult;
    }
    if (method === "receipt") {
      receiptCalls.push(input);
      if (delayReceipt) await new Promise(done => { releaseReceipt = done; });
      return receiptResult;
    }
    if (method === "listProducts") return listRuntimeCatalogProducts(f.path, input);
    if (method === "resolveProductPrice") return resolveRuntimeProductPrice(f.path, input);
    if (method === "normalSale") return completeMarketSale(f.path, input, f.authority);
    if (method === "state") return { ok: true, value: getMarketSaleBenefitsState(f.path) };
    if (method === "preview") {
      previews.push(input);
      const value = previewMarketSaleBenefits(f.path, input, f.authority);
      if (delayPreview) await new Promise(done => { releasePreview = done; });
      return { ok: true, value };
    }
    if (method === "sale") {
      calls.push(input);
      try {
        const value = completeMarketSale(f.path, input, f.authority);
        if (loseResponse) { loseResponse = false; throw new Error("fixture_response_lost"); }
        return { ok: true, value };
      } catch (error) {
        if (error.message === "fixture_response_lost") throw error;
        return { ok: false, expected: true, code: error.code ?? "sale_rejected", message: "Tutar değişti. Önizlemeyi yenileyin." };
      }
    }
    throw new Error("unknown fixture operation");
  });
  await page.addInitScript(({ product, customer }) => {
    window.__benefitsProduct = product; window.__benefitsCustomer = customer;
    window.yardimciDesktop = { prepareSaleReceipt: input => window.__benefitsCall("receipt", input),
      previewReadyDocument: input => window.__benefitsCall("receipt-preview", input),
      printReadyDocument: input => window.__benefitsCall("receipt-print", input), commerce: {
      listProducts: input => window.__benefitsCall("listProducts", input),
      resolveProductPrice: input => window.__benefitsCall("resolveProductPrice", input),
      getMarketSaleBenefitsState: () => window.__benefitsCall("state"),
      previewMarketSaleBenefits: input => window.__benefitsCall("preview", input),
      tryCompleteMarketSale: input => window.__benefitsCall("sale", input),
      completeMarketSale: input => window.__benefitsCall("normalSale", input),
      getProductImageDataUrl: async () => ""
    } };
  }, { product, customer });
  await page.route("**/benefits-sale-test", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/benefits-sale-test",
    `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/market-sale-benefits.tsx")}"></script></body></html>`) }));
  await page.goto(`${server.resolvedUrls.local[0]}benefits-sale-test`);
  const pay = page.getByRole("button", { name: "Ödeme Al", exact: true });
  const calculate = page.getByRole("button", { name: "Tutarı Hesapla", exact: true });
  await page.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  await expect(pay).toBeEnabled();
  await chooseSearchSelect(page, "Müşteri", "Test Müşterisi");
  await page.getByRole("button", { name: "Havale / EFT", exact: true }).click();
  await page.getByRole("checkbox", { name: "İndirim ve Puan", exact: true }).check();
  await expect(pay).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sipariş", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Ödeme tutarı", exact: true })).toBeDisabled();
  await page.getByLabel("Kupon kodu", { exact: true }).fill(coupon.secret);
  await page.getByLabel("Kullanılacak Puan", { exact: true }).fill("100");
  await calculate.click(); await expect(pay).toBeEnabled();
  await expect(page.locator(".market-sale-grand-total")).toContainText("755,00");
  await page.getByText("İndirim ve Puan detayı", { exact: true }).click();
  await expect(page.getByText("Puan ile ödeme", { exact: true })).toBeVisible();
  await expect(page.getByText("Ödeme sonrası kazanılacak Puan", { exact: true })).toBeVisible();
  // Customer, payment and cart edits synchronously revoke the displayed quote.
  await chooseSearchSelect(page, "Müşteri", "İkinci Müşteri"); await expect(pay).toBeDisabled();
  await chooseSearchSelect(page, "Müşteri", "Test Müşterisi"); await calculate.click(); await expect(pay).toBeEnabled();
  await page.getByRole("button", { name: "Kart", exact: true }).click(); await expect(pay).toBeDisabled();
  await page.getByRole("button", { name: "Havale / EFT", exact: true }).click(); await calculate.click(); await expect(pay).toBeEnabled();
  await page.getByRole("button", { name: "Ürün ekle", exact: true }).click(); await expect(pay).toBeDisabled();
  await calculate.click(); await expect(pay).toBeEnabled();
  // A late preview cannot re-enable payment after editing the points request.
  delayPreview = true;
  await calculate.click();
  await expect.poll(() => Boolean(releasePreview)).toBe(true);
  await page.getByLabel("Kullanılacak Puan", { exact: true }).fill("0");
  releasePreview(); delayPreview = false;
  await expect(calculate).toBeEnabled(); await expect(pay).toBeDisabled();
  await page.getByLabel("Kullanılacak Puan", { exact: true }).fill("100");
  await calculate.click(); await expect(pay).toBeEnabled();
  // The same server rejects stale price before financial effects; UI requires a fresh preview.
  f.db.prepare("UPDATE catalog_products SET sale_price = 1001 WHERE id = 'p1'").run();
  await pay.click(); await expect(pay).toBeDisabled();
  await expect(page.getByTestId("topbar-status")).toContainText("Önizlemeyi yenileyin");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_sales").get().n, 0);
  await calculate.click(); await expect(pay).toBeEnabled();
  loseResponse = true;
  await pay.click();
  const retry = page.getByRole("button", { name: "Satış Sonucunu Doğrula", exact: true });
  await expect(retry).toBeEnabled();
  await expect(page.getByRole("button", { name: "Fişi hazırla" })).toHaveCount(0);
  await expect(page.getByLabel("Kupon kodu", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Görünümü değiştir", exact: true }).click();
  await page.getByRole("button", { name: "Ürün ekle", exact: true }).click(); // pending request blocks cart mutation
  await page.getByRole("button", { name: "Görünümü değiştir", exact: true }).click();
  await expect(retry).toBeEnabled(); await retry.click();
  await expect(page.getByTestId("topbar-status")).toContainText("Satış tamamlandı");
  assert.deepEqual(calls.at(-1), calls.at(-2));
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_sales").get().n, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_snapshots").get().n, 1);
  const receipt = page.getByRole("button", { name: "Fişi hazırla", exact: true });
  await expect(receipt).toBeVisible();
  assert.equal(receiptCalls.length, 0);
  await receipt.click();
  await expect(page.getByRole("status").filter({ hasText: "Fiş hazırlanamadı" })).toContainText("şablonunu, yazıcıyı");
  await expect(page.getByRole("button", { name: "Yazdır", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("topbar-status")).toContainText("Satış tamamlandı");
  assert.deepEqual(receiptCalls[0], { saleId: f.db.prepare("SELECT id FROM commerce_sales").get().id });
  receiptResult = { ok: false, code: "DOCUMENT_SALE_JOB_LINES_MISSING", message: "safe code" };
  await receipt.click();
  await expect(page.getByRole("status").filter({hasText:"Fiş şablonunda"})).toContainText("Baskı Yönetimi > Satış fişi > Düzenle > Ürün satırlarını ekle > Şablonları kaydet");
  await expect(page.getByTestId("topbar-status")).toContainText("Satış tamamlandı");
  await expect(page.getByRole("button",{name:"Yazdır",exact:true})).toHaveCount(0);
  receiptResult = { ok: true, value: { jobId: "same-job" } };
  await receipt.click();
  await expect(page.getByText("Fiş hazır.", { exact: true })).toBeVisible();
  assert.deepEqual(receiptCalls[2], receiptCalls[0]);
  const receiptPreview = page.getByRole("button", { name: "Önizle", exact: true });
  const receiptPrint = page.getByRole("button", { name: "Yazdır", exact: true });
  await expect(page.getByText("MALİ BELGE DEĞİLDİR", { exact: true })).toBeVisible();
  assert.equal(outputCalls.length, 0);
  await receiptPreview.click();
  await expect.poll(() => outputCalls.length).toBe(1);
  assert.deepEqual(outputCalls[0], { method: "receipt-preview", input: { documentKind: "sale_receipt", jobId: "same-job" } });
  await receiptPrint.click();
  await expect(page.getByText("Yazdırmadan vazgeçildi. Fiş hâlâ hazır.")).toBeVisible();
  assert.deepEqual(outputCalls[1], { method: "receipt-print", input: { documentKind: "sale_receipt", jobId: "same-job" } });
  await expect(receiptPreview).toBeEnabled(); await expect(receiptPrint).toBeEnabled();
  printResult = { ok: true, value: "accepted" };
  delayOutput = true;
  await receiptPrint.click();
  await expect.poll(() => Boolean(releaseOutput)).toBe(true);
  await expect(receiptPrint).toBeDisabled();
  releaseOutput(); delayOutput = false;
  await expect(receiptPrint).toHaveCount(0);
  await expect(page.getByText("Yazdırma işletim sistemine iletildi; kâğıt çıktısı doğrulanmadı.")).toBeVisible();
  assert.equal(outputCalls.length, 3);
  await page.getByRole("button", { name: "İşletmeyi değiştir" }).click();
  await page.getByRole("button", { name: "İşletmeyi değiştir" }).click();
  await expect(receipt).toHaveCount(0);
  await expect(receiptPrint).toHaveCount(0);
  await page.getByRole("checkbox", { name: "İndirim ve Puan", exact: true }).check();
  await expect(page.getByLabel("Kupon kodu", { exact: true })).toHaveValue("");
  assert(!JSON.stringify(await page.evaluate(() => Object.entries(localStorage))).includes(coupon.secret));
  await page.getByRole("checkbox", { name: "İndirim ve Puan", exact: true }).uncheck();
  await page.getByRole("button", { name: "Yeteneği değiştir", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "İndirim ve Puan", exact: true })).toHaveCount(0);
  delayReceipt = false;
  await page.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  await expect(pay).toBeEnabled();
  await pay.click();
  await expect(receipt).toBeVisible();
  assert.equal(receiptCalls.length, 3);
  await receipt.click(); await expect(receiptPreview).toBeVisible();
  delayOutput = true; releaseOutput = undefined;
  await receiptPreview.click(); await expect.poll(() => Boolean(releaseOutput)).toBe(true);
  await page.getByRole("button", { name: "Baskı yetkisini değiştir" }).click();
  await expect(receipt).toHaveCount(0);
  await page.getByRole("button", { name: "Baskı yetkisini değiştir" }).click();
  releaseOutput(); delayOutput = false;
  await expect(receipt).toHaveCount(0);
  await page.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  await expect(pay).toBeEnabled(); await pay.click();
  await expect(receipt).toBeVisible();
  delayReceipt = true; releaseReceipt = undefined;
  await receipt.click();
  await expect.poll(() => Boolean(releaseReceipt)).toBe(true);
  await page.getByRole("button", { name: "Görünümü değiştir" }).click();
  releaseReceipt(); delayReceipt = false;
  await page.getByRole("button", { name: "Görünümü değiştir" }).click();
  await expect(receipt).toHaveCount(0);
  await page.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  await expect(pay).toBeEnabled(); await pay.click();
  await expect(receipt).toBeVisible();
  await page.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  await expect(receipt).toHaveCount(0);
  for (const outcome of ["accepted", "failed", "unknown", null]) {
    await expect(pay).toBeEnabled(); await pay.click();
    await expect(receipt).toBeVisible(); await receipt.click();
    await expect(receiptPrint).toBeVisible();
    printResult = { ok: true, value: outcome };
    const before = outputCalls.length;
    await receiptPrint.click();
    await expect(receiptPrint).toHaveCount(0);
    assert.equal(outputCalls.length, before + 1);
    await expect(page.getByRole("status").filter({ hasText: outcome === "accepted" ? "işletim sistemine" : outcome === "failed" ? "başarısız" : outcome === null ? "daha önce işlendi" : "belirsiz" })).toBeVisible();
    await page.getByRole("button", { name: "Ürün ekle", exact: true }).click();
    await expect(receiptPreview).toHaveCount(0);
  }
  await page.evaluate(() => { delete window.yardimciDesktop.prepareSaleReceipt; });
  await expect(pay).toBeEnabled(); await pay.click();
  await expect(receipt).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log("market-sale-benefits-ui-smoke-ok: real preview/settlement, invalidation, stale quote, exact replay, secret clearing, capability gate");
} finally {
  await browser?.close(); await server?.close(); f.close();
}
