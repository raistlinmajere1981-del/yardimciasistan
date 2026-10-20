import { chooseSearchSelect } from './test-helpers/search-select.mjs';
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const server = await createServer({
  root: resolve("apps/desktop-app"),
  configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
  server: { port: 0, strictPort: false }
});
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
let browser;

try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/market-quick-sale-test*", async (route) => {
    const html = await server.transformIndexHtml(
      "/market-quick-sale-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/market-quick-sale.tsx")}"></script></body></html>`
    );
    await route.fulfill({ contentType: "text/html", body: html });
  });

  await page.addInitScript(() => {
    const C = {
      CATALOG: "commerce.catalog",
      SALES: "commerce.sales",
      RETAIL_BARCODE: "retail.barcode",
      CUSTOMERS: "core.customers",
      FINANCE: "core.finance",
      CUSTOMER_CREDIT: "commerce.customer_credit"
    };
    const now = "2026-09-23T18:00:00.000Z";
    const product = {
      id: "product-1",
      businessId: "business-1",
      categoryId: "",
      name: "Test Ürünü",
      brand: "Test Marka",
      sku: "TEST-1",
      barcode: "8690000000001",
      description: "",
      salePrice: 30,
      purchasePrice: 10,
      currency: "TRY",
      unit: "piece",
      taxRate: 0,
      trackInventory: false,
      isActive: true,
      imageAssetPath: "",
      imageSourceUrl: "",
      dataSource: "",
      sourceProductUrl: "",
      dataLicense: "",
      imageLicense: "",
      sourceFetchedAt: "",
      createdAt: now,
      updatedAt: now
    };
    const externalProduct = {
      provider: "open_food_facts",
      barcode: "999999",
      name: "Open Food Ürünü",
      brand: "Harici Marka",
      quantity: "1 adet",
      categoryHint: "",
      imageUrl: "",
      sourceProductUrl: "https://example.test/product",
      dataLicense: "ODbL",
      imageLicense: "",
      fetchedAt: now
    };
    const draft = {
      id: "draft-1",
      businessId: "business-1",
      status: "pending",
      source: "android",
      createdByDevice: "Test Telefonu",
      note: "Session smoke",
      createdAt: now,
      updatedAt: now
    };
    const draftDetail = {
      draft,
      items: [{
        id: "draft-item-1",
        draftId: draft.id,
        productId: product.id,
        productName: product.name,
        quantity: 2,
        createdAt: now,
        updatedAt: now
      }]
    };

    window.__m8bInitial = {
      snapshot: {
        businessId: "business-1",
        profileId: "market",
        capabilities: [],
        enabledCapabilities: [
          C.CATALOG,
          C.SALES,
          C.RETAIL_BARCODE,
          C.CUSTOMERS,
          C.FINANCE,
          C.CUSTOMER_CREDIT
        ]
      }
    };
    window.__m8bStats = {
      modeCalls: [],
      consumeCalls: 0,
      findCalls: 0,
      findWaits: 0,
      externalCalls: 0,
      externalWaits: 0,
      saleCalls: [],
      saleWaits: 0,
      reviewCalls: 0,
      reviewWaits: 0,
      loadDraftCalls: 0
    };
    window.__m8bDeferFind = false;
    window.__m8bDeferExternal = false;
    window.__m8bDeferSale = false;
    window.__m8bFailReview = false;
    window.__m8bDeferReview = false;
    window.__m8bResolveFind = null;
    window.__m8bResolveExternal = null;
    window.__m8bResolveSale = null;
    window.__m8bResolveReview = null;
    window.__m8bBarcodeEvents = [];

    let saleSequence = 0;
    let draftReviewed = false;
    const makeSale = (input, status = "paid") => {
      saleSequence += 1;
      const subtotal = input.items.reduce((sum, line) => sum + 30 * Number(line.quantity), 0);
      const discountTotal = Number(input.discountTotal ?? 0);
      return {
        id: `sale-${saleSequence}`,
        businessId: "business-1",
        source: input.source || "desktop-market-quick-sale",
        status,
        paymentMethod: status === "credit" ? "credit" : (input.paymentMethod || "cash"),
        currency: "TRY",
        subtotal,
        discountTotal,
        total: subtotal - discountTotal,
        createdAt: new Date().toISOString()
      };
    };
    const externalResult = (barcode = externalProduct.barcode) => ({
      status: "found",
      product: { ...externalProduct, barcode }
    });

    const commerce = {
      resolveProductPrice: async ({ productId, customerId = "" }) => ({ productId, customerId, unitPrice: 30, currency: "TRY", requestedGroup: "retail", appliedGroup: "retail", fallbackToRetail: false, dealerEligible: false }),
      completeMarketSale: async (input) => {
        const sale = input.settlement === "credit"
          ? await commerce.createCustomerCreditSale(input) : await commerce.createPaidSale(input);
        let draftReview = "not_requested";
        if (input.sourceDraftId) {
          try { await commerce.markCartDraftReviewed(input.sourceDraftId); draftReview = "reviewed"; }
          catch { draftReview = "failed"; }
        }
        return { sale, draftReview, replayed: false };
      },
      listProducts: async () => [product],
      listCategories: async () => [],
      getProductImageDataUrl: async () => "",
      previewExternalProductImage: async () => "",
      saveProduct: async (input) => ({ ...product, ...input, id: input.id || "product-created", updatedAt: new Date().toISOString() }),
      listCartDrafts: async () => draftReviewed ? [] : [draftDetail],
      loadCartDraftForQuickSale: async () => {
        window.__m8bStats.loadDraftCalls += 1;
        return {
          draft,
          items: [{ draftItemId: "draft-item-1", product, quantity: 2 }],
          skippedItems: []
        };
      },
      markCartDraftReviewed: async () => {
        window.__m8bStats.reviewCalls += 1;
        if (window.__m8bFailReview) throw new Error("injected review failure");
        if (window.__m8bDeferReview) {
          window.__m8bStats.reviewWaits += 1;
          return new Promise((resolveReview) => {
            window.__m8bResolveReview = () => {
              window.__m8bDeferReview = false;
              window.__m8bResolveReview = null;
              draftReviewed = true;
              resolveReview({ ...draft, status: "reviewed", updatedAt: new Date().toISOString() });
            };
          });
        }
        draftReviewed = true;
        return { ...draft, status: "reviewed", updatedAt: new Date().toISOString() };
      },
      setBarcodeScanMode: async (active) => {
        window.__m8bStats.modeCalls.push(active);
        return { active, intervalMs: 1500, transport: "hosting" };
      },
      consumePendingBarcodeScans: async () => {
        window.__m8bStats.consumeCalls += 1;
        const events = window.__m8bBarcodeEvents;
        window.__m8bBarcodeEvents = [];
        return events;
      },
      findProductByBarcode: async (barcode) => {
        window.__m8bStats.findCalls += 1;
        if (window.__m8bDeferFind) {
          window.__m8bStats.findWaits += 1;
          return new Promise((resolveFind) => {
            window.__m8bResolveFind = () => {
              window.__m8bDeferFind = false;
              window.__m8bResolveFind = null;
              resolveFind(product);
            };
          });
        }
        return barcode === product.barcode ? product : null;
      },
      lookupExternalProductByBarcode: async (barcode) => {
        window.__m8bStats.externalCalls += 1;
        if (window.__m8bDeferExternal) {
          window.__m8bStats.externalWaits += 1;
          return new Promise((resolveExternal) => {
            window.__m8bResolveExternal = () => {
              window.__m8bDeferExternal = false;
              window.__m8bResolveExternal = null;
              resolveExternal(externalResult(barcode));
            };
          });
        }
        return externalResult(barcode);
      },
      createPaidSale: async (input) => {
        window.__m8bStats.saleCalls.push(input);
        if (window.__m8bDeferSale) {
          window.__m8bStats.saleWaits += 1;
          return new Promise((resolveSale) => {
            window.__m8bResolveSale = () => {
              window.__m8bDeferSale = false;
              window.__m8bResolveSale = null;
              resolveSale(makeSale(input));
            };
          });
        }
        return makeSale(input);
      },
      createCustomerCreditSale: async (input) => {
        window.__m8bStats.saleCalls.push(input);
        return makeSale(input, "credit");
      },
      getCustomerCreditAccount: async () => ({
        customer: { id: "customer-1", fullName: "Test Müşterisi", phone: "+905551112233", deletedAt: "" },
        balances: [],
        entries: [],
        hasMoreEntries: false
      })
    };

    window.yardimciDesktop = {
      commerce,
      getSetupData: async () => ({
        productData: {
          enabled: true,
          autoSearch: true,
          includeImages: true,
          provider: "open_food_facts"
        }
      })
    };
  });

  await page.goto(`${baseUrl}market-quick-sale-test`);

  const tabs = page.getByRole("navigation", { name: "Satış çalışma alanları" });
  const quick = () => page.locator(".market-quick-sale-layout");
  const productRow = () => quick().getByRole("button", { name: /Test Ürünü/ }).first();
  const quantity = () => quick().getByRole("spinbutton", { name: "Test Ürünü miktarı", exact: true });
  const payment = () => quick().getByRole("group", { name: "Ödeme yöntemi", exact: true });
  const discount = () => quick().getByLabel("İndirim");

  await expect(quick()).toBeVisible();
  await expect(productRow()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__m8bStats.modeCalls.at(-1))).toBe(true);
  await expect(page.getByLabel("Telefon barkod kanalı")).toContainText("hazır");

  // Session state survives a Market mode change.
  await productRow().click();
  await quantity().fill("2");
  await discount().fill("5");
  await payment().getByRole("button", { name: "Kart", exact: true }).click();
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await expect(quick()).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__m8bStats.modeCalls.at(-1))).toBe(false);

  const inactiveConsumeCount = await page.evaluate(() => window.__m8bStats.consumeCalls);
  const inactiveFindCount = await page.evaluate(() => window.__m8bStats.findCalls);
  await page.evaluate(() => {
    for (const key of "8690000000001") document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await page.waitForTimeout(750);
  expect(await page.evaluate(() => window.__m8bStats.consumeCalls)).toBe(inactiveConsumeCount);
  expect(await page.evaluate(() => window.__m8bStats.findCalls)).toBe(inactiveFindCount);

  await tabs.getByRole("button", { name: /Hızlı Satış/ }).click();
  await expect(quantity()).toHaveValue("2");
  await expect(discount()).toHaveValue("5");
  await expect(payment().getByRole("button", { name: "Kart", exact: true })).toHaveAttribute("aria-pressed", "true");

  // A phone batch stops after an unknown barcode handoff; later events never touch the hidden cart.
  const findBeforeBatch = await page.evaluate(() => window.__m8bStats.findCalls);
  await page.evaluate(() => {
    window.__m8bBarcodeEvents = [
      { id: "scan-unknown", deviceId: "Telefon-1", barcode: "999999" },
      { id: "scan-known", deviceId: "Telefon-1", barcode: "8690000000001" }
    ];
  });
  const createDialog = page.getByRole("dialog", { name: "Yeni ürün ekle" });
  await expect(createDialog).toBeVisible({ timeout: 2500 });
  await expect(createDialog.getByLabel("Ürün adı")).toHaveValue("Open Food Ürünü");
  expect(await page.evaluate(() => window.__m8bStats.findCalls)).toBe(findBeforeBatch + 1);
  await createDialog.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
  await createDialog.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await tabs.getByRole("button", { name: /Hızlı Satış/ }).click();
  await expect(quantity()).toHaveValue("2");
  await expect(discount()).toHaveValue("5");
  await expect(payment().getByRole("button", { name: "Kart", exact: true })).toHaveAttribute("aria-pressed", "true");

  // A delayed local lookup cannot mutate the hidden cart after Quick Sale unmounts.
  await quick().locator(".market-barcode-panel select").selectOption("simulator");
  await page.evaluate(() => { window.__m8bDeferFind = true; });
  await quick().locator(".market-barcode-simulator input").fill("8690000000001");
  await quick().getByRole("button", { name: "Barkodu Gönder" }).click();
  await expect.poll(() => page.evaluate(() => window.__m8bStats.findWaits)).toBe(1);
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await page.evaluate(() => window.__m8bResolveFind?.());
  await page.waitForTimeout(100);
  await tabs.getByRole("button", { name: /Hızlı Satış/ }).click();
  await expect(quantity()).toHaveValue("2");

  // A delayed external lookup cannot reopen Product Create after unmount.
  await quick().locator(".market-barcode-panel select").selectOption("simulator");
  await page.evaluate(() => { window.__m8bDeferExternal = true; });
  await quick().locator(".market-barcode-simulator input").fill("888888");
  await quick().getByRole("button", { name: "Barkodu Gönder" }).click();
  await expect.poll(() => page.evaluate(() => window.__m8bStats.externalWaits)).toBe(1);
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await page.evaluate(() => window.__m8bResolveExternal?.());
  await page.waitForTimeout(100);
  await expect(page.getByRole("dialog", { name: "Yeni ürün ekle" })).toHaveCount(0);
  await tabs.getByRole("button", { name: /Hızlı Satış/ }).click();
  await expect(quantity()).toHaveValue("2");

  // Sale lock survives an unmount/remount and the committed sale resets the session once.
  await page.evaluate(() => { window.__m8bDeferSale = true; });
  await quick().getByRole("button", { name: "Ödemeyi Al ve Satışı Tamamla" }).click();
  await expect.poll(() => page.evaluate(() => window.__m8bStats.saleWaits)).toBe(1);
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await tabs.getByRole("button", { name: /Hızlı Satış/ }).click();
  await expect(quick().getByRole("button", { name: "Satış işleniyor…" })).toBeDisabled();
  expect((await page.evaluate(() => window.__m8bStats.saleCalls.length))).toBe(1);
  await page.evaluate(() => window.__m8bResolveSale?.());
  await expect(quick().locator(".market-sale-cart-line")).toHaveCount(0);
  expect((await page.evaluate(() => window.__m8bStats.saleCalls.length))).toBe(1);

  // Credit capability normalization happens even while Quick Sale is unmounted.
  await productRow().click();
  await payment().getByRole("button", { name: "Veresiye", exact: true }).click();
  await chooseSearchSelect(quick(), "Müşteri", {value:"customer-1"});
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await page.evaluate(() => window.__m8bToggleCredit(false));
  await tabs.getByRole("button", { name: /Hızlı Satış/ }).click();
  await expect(payment().getByRole("button", { name: "Nakit", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(quick().getByLabel("Müşteri", { exact: true })).toBeVisible();

  // Draft source + recovery are persistent session state; retry never resubmits the sale.
  await tabs.getByRole("button", { name: /Telefon Sepetleri/ }).click();
  await expect(page.getByText("Session smoke")).toBeVisible();
  await page.getByRole("button", { name: "Hızlı Satış'a Yükle" }).click();
  await expect(quick().locator('[aria-label="Telefon sepeti kaynağı"]')).toContainText("Test Telefonu");
  await expect(quantity()).toHaveValue("2");
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await tabs.getByRole("button", { name: /Hızlı Satış/ }).click();
  await expect(quick().locator('[aria-label="Telefon sepeti kaynağı"]')).toContainText("Session smoke");

  await page.evaluate(() => { window.__m8bFailReview = true; });
  await quick().getByRole("button", { name: "Ödemeyi Al ve Satışı Tamamla" }).click();
  await expect(quick().locator(".market-sale-review-recovery")).toContainText("Satış tamamlandı");
  const saleCountBeforeRetry = await page.evaluate(() => window.__m8bStats.saleCalls.length);
  await tabs.getByRole("button", { name: /Ürünler/ }).click();
  await tabs.getByRole("button", { name: /Hızlı Satış/ }).click();
  await expect(quick().locator(".market-sale-review-recovery")).toContainText("telefon sepeti kapatılamadı");
  await page.evaluate(() => {
    window.__m8bFailReview = false;
    window.__m8bDeferReview = true;
  });
  const loadCallsBeforeRetry = await page.evaluate(() => window.__m8bStats.loadDraftCalls);
  await quick().getByRole("button", { name: "Taslağı Kapat", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__m8bStats.reviewWaits)).toBe(1);

  // While the old recovery retry is pending, another phone draft handoff is blocked.
  await tabs.getByRole("button", { name: /Telefon Sepetleri/ }).click();
  await page.getByRole("button", { name: "Hızlı Satış'a Yükle" }).click();
  await expect(quick().locator(".market-sale-review-recovery")).toContainText("telefon sepeti kapatılamadı");
  expect(await page.evaluate(() => window.__m8bStats.loadDraftCalls)).toBe(loadCallsBeforeRetry);

  await page.evaluate(() => window.__m8bResolveReview?.());
  await expect(quick().locator(".market-sale-review-recovery")).toHaveCount(0);
  expect(await page.evaluate(() => window.__m8bStats.saleCalls.length)).toBe(saleCountBeforeRetry);

  expect(pageErrors).toEqual([]);
  console.log("market-quick-sale-session-smoke-ok");
} finally {
  await browser?.close();
  await server.close();
}
