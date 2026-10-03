import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  applyRuntimeInventoryMovement,
  createRuntimeOrder,
  fulfillRuntimeOrder,
  getRuntimeInventoryBalance,
  getRuntimeOrder,
  listRuntimeOrders,
  resolveRuntimeProductPrice,
  saveRuntimeCatalogProduct,
  updateRuntimeOrderStatus
} = require("../apps/desktop-app/dist-electron/commerce-runtime.js");

const appPath = join(process.cwd(), "apps", "desktop-app");
const dataDir = mkdtempSync(join(tmpdir(), "yardimci-wholesale-orders-ui-"));
const database = new DesktopDatabase({ appPath, userDataPath: dataDir });

let raw;
let server;
let browser;
let page;

const customerInput = {
  fullName: "Bayi Sipariş Testi",
  phone: "05550005001",
  email: "",
  notes: "",
  tags: [],
  identityType: "",
  identityNumber: "",
  nationality: "",
  birthDate: "",
  birthdayMessageEnabled: true,
  gender: "",
  documentSerialNumber: "",
  documentExpiryDate: "",
  birthPlace: "",
  motherName: "",
  fatherName: "",
  issuingAuthority: "",
  address: "",
  commercialProfile: {
    companyName: "Bayi Sipariş Test Ltd.",
    taxOffice: "Cide",
    taxNumber: "5555555555",
    authorizedPerson: "Bayi Sipariş Testi",
    dealerStatus: "active",
    priceGroup: "dealer_a",
    paymentTermDays: 30,
    notes: ""
  }
};

try {
  database.initialize();
  const setup = database.saveInitialSetup({
    businessName: "Wholesale Orders UI Smoke",
    profileId: "market",
    profileOptions: [C.WHOLESALE],
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "wholesale-orders-ui-secret",
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
    servicePreferences: { whatsapp: false, android: false },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setup.ok, true, setup.ok ? "" : setup.message);

  const customer = database.saveCustomer(customerInput);
  assert.equal(customer.ok, true, customer.ok ? "" : customer.message);

  const product = saveRuntimeCatalogProduct(database.databasePath, {
    name: "Bayi Ürünü",
    sku: "BAYI-001",
    barcode: "8690000050001",
    salePrice: 100,
    dealerPriceA: 80,
    dealerPriceB: 70,
    purchasePrice: 50,
    currency: "TRY",
    unit: "piece",
    taxRate: 20,
    trackInventory: true,
    isActive: true
  });

  applyRuntimeInventoryMovement(database.databasePath, {
    productId: product.id,
    type: "purchase",
    quantityDelta: 10,
    unitCost: 50,
    referenceType: "wholesale_orders_ui_smoke",
    referenceId: "seed"
  });
  assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 10);

  const dashboard = database.getDashboardData();
  const savedCustomer = dashboard.customers.find((entry) => entry.id === customer.savedId);
  assert.ok(savedCustomer?.commercialProfile);
  assert.equal(savedCustomer.commercialProfile.priceGroup, "dealer_a");

  raw = new DatabaseSync(database.databasePath);
  const calls = [];
  let displayFixtures = [];
  let loseFirstCreateOrderResponse = true;
  let loseFirstFulfillResponse = true;

  server = await createServer({
    root: appPath,
    configFile: join(appPath, "vite.renderer.config.ts"),
    logLevel: "error",
    server: { port: 0, host: "127.0.0.1", strictPort: false },
    plugins: [{
      name: "wholesale-orders-ui-smoke",
      configureServer(instance) {
        instance.middlewares.use("/wholesale-orders-ui-smoke", async (_request, response) => {
          response.setHeader("Content-Type", "text/html");
          response.end(await instance.transformIndexHtml(
            "/wholesale-orders-ui-smoke",
            `<!doctype html>
              <html lang="tr" data-color-scheme="light" data-density="compact" data-accent="coral" data-font="plex" data-motion="system">
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>Wholesale orders UI smoke</title>
                  <style>
                    body { margin: 0; }
                    .smoke-shell { height: 980px; padding: 20px; }
                  </style>
                </head>
                <body>
                  <div id="root"></div>
                  <script type="module" src="/@fs/${join(process.cwd(), "scripts/fixtures/wholesale-orders-ui.tsx")}"></script>
                </body>
              </html>`
          ));
        });
      }
    }]
  });
  await server.listen();

  browser = await launchChromiumForSmoke(chromium);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1040 },
    locale: "tr-TR"
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);

  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
    console.error(error.message);
  });

  await page.exposeFunction("__woCall", async (method, args) => {
    calls.push({ method, args: structuredClone(args) });
    if (method === "listOrders") return [...displayFixtures.map((detail) => detail.order), ...listRuntimeOrders(database.databasePath, args[0] ?? {})];
    if (method === "getOrder") return displayFixtures.find((detail) => detail.order.id === args[0]) ?? getRuntimeOrder(database.databasePath, args[0]);
    if (method === "resolveProductPrice") {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return resolveRuntimeProductPrice(database.databasePath, args[0]);
    }
    if (method === "createOrder") {
      const created = createRuntimeOrder(database.databasePath, args[0]);
      if (loseFirstCreateOrderResponse) {
        loseFirstCreateOrderResponse = false;
        throw new Error("Simulated lost createOrder response");
      }
      return created;
    }
    if (method === "updateOrderStatus") return updateRuntimeOrderStatus(database.databasePath, args[0]);
    if (method === "fulfillOrder") {
      const fulfilled = fulfillRuntimeOrder(database.databasePath, args[0]);
      if (loseFirstFulfillResponse) {
        loseFirstFulfillResponse = false;
        throw new Error("Simulated lost fulfillOrder response");
      }
      return fulfilled;
    }
    throw new Error(`Unexpected wholesale orders bridge call: ${method}`);
  });

  await page.addInitScript((initial) => {
    window.__woInitial = initial;
  }, {
    customers: [savedCustomer],
    products: [product]
  });

  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/wholesale-orders-ui-smoke`, { timeout: 60000 });

  const dealerSelect = page.getByLabel("Sipariş müşterisi", { exact: true });
  await expect(dealerSelect).toBeVisible();
  await dealerSelect.selectOption(customer.savedId);

  await expect(page.getByText("Aktif bayi · Bayi A", { exact: true })).toBeVisible();

  const productButton = page.getByRole("button", { name: /Bayi Ürünü/ });
  await expect(productButton).toBeVisible();
  await expect(productButton).toContainText("₺80");
  await productButton.click();
  await expect(dealerSelect).toBeDisabled();
  await expect(dealerSelect).toBeEnabled();

  const draftLines = page.locator(".market-order-lines");
  await expect(draftLines).toContainText("Bayi Ürünü");
  await expect(draftLines).toContainText("Bayi A");
  await expect(draftLines).toContainText("₺80");

  const quantityInput = page.getByLabel("Bayi Ürünü miktarı", { exact: true });
  await expect(quantityInput).toHaveValue("1");
  await page.getByRole("button", { name: "Bayi Ürünü miktarını artır", exact: true }).click();
  await expect(quantityInput).toHaveValue("2");

  await page.getByLabel("Sipariş notu", { exact: true }).fill("UI smoke bayi siparişi");
  const orderTotal = page.locator(".market-sale-grand-total").filter({ hasText: "Sipariş toplamı" });
  await expect(orderTotal).toContainText("₺160");

  const saveButton = page.getByRole("button", { name: "Siparişi Kaydet", exact: true });
  await saveButton.click();

  await expect(page.locator("body")).toHaveAttribute("data-last-state", "error");
  assert.equal(
    Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_orders WHERE source = 'desktop-wholesale'").get().count),
    1,
    "The first call committed even though its response was lost."
  );

  await saveButton.click();

  await expect(page.locator(".market-order-card")).toHaveCount(1);
  const detail = page.locator(".market-order-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Bayi Sipariş Testi");
  await expect(detail).toContainText("Bayi Ürünü");
  await expect(detail).toContainText("UI smoke bayi siparişi");
  await expect(detail.getByText("Yeni", { exact: true })).toBeVisible();

  const orderRow = raw.prepare(`
    SELECT id, customer_id, status, source, subtotal, total
    FROM commerce_orders
    WHERE source = 'desktop-wholesale'
    LIMIT 1
  `).get();
  assert.ok(orderRow?.id);
  assert.equal(orderRow.customer_id, customer.savedId);
  assert.equal(orderRow.status, "placed");
  assert.equal(orderRow.source, "desktop-wholesale");
  assert.equal(Number(orderRow.subtotal), 160);
  assert.equal(Number(orderRow.total), 160);

  const itemRow = raw.prepare(`
    SELECT product_id, quantity, unit_price, line_total
    FROM commerce_order_items
    WHERE order_id = ?
    LIMIT 1
  `).get(orderRow.id);
  assert.equal(itemRow.product_id, product.id);
  assert.equal(Number(itemRow.quantity), 2);
  assert.equal(Number(itemRow.unit_price), 80);
  assert.equal(Number(itemRow.line_total), 160);

  assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 10);
  assert.equal(
    Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_sales WHERE deleted_at = ''").get().count),
    0
  );

  const resolveCalls = calls.filter((call) => call.method === "resolveProductPrice");
  assert.equal(resolveCalls.length, 1);
  assert.equal(resolveCalls[0].args[0].customerId, customer.savedId);
  assert.equal(resolveCalls[0].args[0].productId, product.id);

  const createCalls = calls.filter((call) => call.method === "createOrder");
  assert.equal(createCalls.length, 2);
  assert.equal(createCalls[0].args[0].source, "desktop-wholesale");
  assert.match(createCalls[0].args[0].sourceReference, /^desktop-wholesale:/);
  assert.equal(
    createCalls[1].args[0].sourceReference,
    createCalls[0].args[0].sourceReference,
    "Retrying the unchanged draft must reuse the same idempotency reference."
  );
  assert.deepEqual(createCalls[0].args[0].items, [{ productId: product.id, quantity: 2 }]);
  assert.deepEqual(createCalls[1].args[0].items, [{ productId: product.id, quantity: 2 }]);
  assert.equal(
    Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_orders WHERE source = 'desktop-wholesale'").get().count),
    1,
    "Retry must return the existing order instead of creating a duplicate."
  );

  await detail.getByRole("button", { name: "Siparişi Onayla", exact: true }).click();
  await expect(detail.getByText("Onaylandı", { exact: true })).toBeVisible();

  const confirmed = raw.prepare("SELECT status FROM commerce_orders WHERE id = ?").get(orderRow.id);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 10);
  assert.equal(
    Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_sales WHERE deleted_at = ''").get().count),
    0
  );

  const paymentSelect = detail.getByLabel("Sipariş ödeme tercihi", { exact: true });
  await expect(paymentSelect).toBeVisible();
  await paymentSelect.selectOption("card");
  const fulfillButton = detail.getByRole("button", { name: "Siparişi Tamamla", exact: true });
  await fulfillButton.click();

  await expect(page.locator("body")).toHaveAttribute("data-last-state", "error");
  assert.equal(
    raw.prepare("SELECT status FROM commerce_orders WHERE id = ?").get(orderRow.id).status,
    "fulfilled",
    "The first fulfillment committed even though its response was lost."
  );
  assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 8);

  await fulfillButton.click();

  await expect(detail.getByText("Tamamlandı", { exact: true })).toBeVisible();
  assert.equal(
    raw.prepare("SELECT status FROM commerce_orders WHERE id = ?").get(orderRow.id).status,
    "fulfilled"
  );

  const fulfillmentRow = raw.prepare(`
    SELECT sale_id, operation_key, settlement_type, payment_method
    FROM commerce_order_fulfillments
    WHERE order_id = ?
    LIMIT 1
  `).get(orderRow.id);
  assert.ok(fulfillmentRow?.sale_id);
  assert.equal(fulfillmentRow.operation_key, `desktop-order-fulfillment:${orderRow.id}:card`);
  assert.equal(fulfillmentRow.settlement_type, "paid");
  assert.equal(fulfillmentRow.payment_method, "card");

  const saleRow = raw.prepare(`
    SELECT status, subtotal, total, payment_method, source
    FROM commerce_sales
    WHERE id = ?
  `).get(fulfillmentRow.sale_id);
  assert.equal(saleRow.status, "paid");
  assert.equal(Number(saleRow.subtotal), 160);
  assert.equal(Number(saleRow.total), 160);
  assert.equal(saleRow.payment_method, "card");
  assert.equal(saleRow.source, "commerce-order");

  const saleItem = raw.prepare(`
    SELECT unit_price, quantity, line_total
    FROM commerce_sale_items
    WHERE sale_id = ?
    LIMIT 1
  `).get(fulfillmentRow.sale_id);
  assert.equal(Number(saleItem.unit_price), 80);
  assert.equal(Number(saleItem.quantity), 2);
  assert.equal(Number(saleItem.line_total), 160);
  assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 8);

  const fulfillCalls = calls.filter((call) => call.method === "fulfillOrder");
  assert.equal(fulfillCalls.length, 2);
  for (const call of fulfillCalls) {
    assert.equal(call.args[0].orderId, orderRow.id);
    assert.equal(call.args[0].settlement.type, "paid");
    assert.equal(call.args[0].settlement.paymentMethod, "card");
    assert.equal(call.args[0].operationKey, `desktop-order-fulfillment:${orderRow.id}:card`);
  }
  assert.equal(
    fulfillCalls[1].args[0].operationKey,
    fulfillCalls[0].args[0].operationKey,
    "Fulfillment retry must reuse the deterministic operation key."
  );
  assert.equal(
    Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_order_fulfillments WHERE order_id = ?").get(orderRow.id).count),
    1
  );
  assert.equal(
    Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_sales WHERE id = ?").get(fulfillmentRow.sale_id).count),
    1
  );
  assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 8);

  // Read-only presentation fixtures: exercise existing buyerSnapshot fields
  // without creating new backend/domain test cases or changing persistence.
  const existingDetail = getRuntimeOrder(database.databasePath, orderRow.id);
  const guest = { name: "Web Guest", phone: "+44 7911 123456", email: "guest@example.test" };
  const fixture = (id, overrides) => ({ ...existingDetail, order: {
    ...existingDetail.order, id, customerId: "", customerName: "", source: "web-online-sales",
    buyerSnapshot: guest, note: "Guest order note", ...overrides
  } });
  displayFixtures = [
    fixture("ui-guest", {}),
    fixture("ui-no-email", { buyerSnapshot: { name: "Guest without email", phone: "+1 (202) 555-0100" } }),
    fixture("ui-customer-priority", { customerId: customer.savedId, customerName: "Canonical Customer", buyerSnapshot: { ...guest, name: "Contact Snapshot" } }),
    fixture("ui-no-buyer", { buyerSnapshot: null, source: "online_sales" }),
    fixture("ui-empty-contact", { buyerSnapshot: { name: "Only name", phone: "", email: "" }, source: "custom-source" })
  ];
  await page.getByRole("button", { name: "Yenile", exact: true }).click();
  await expect(page.locator(".market-order-card")).toHaveCount(6);
  const card = (name) => page.locator(".market-order-card").filter({ has: page.getByText(name, { exact: true }) });
  await expect(card(guest.name)).toContainText("Web siparişi");
  await card(guest.name).click();
  await expect(detail.getByRole("heading", { name: guest.name, exact: true })).toBeVisible();
  const buyer = detail.getByRole("region", { name: "Sipariş veren", exact: true });
  await expect(buyer).toBeVisible();
  await expect(buyer.locator("dt")).toHaveText(["Ad", "Telefon", "E-posta"]);
  await expect(buyer.locator("dd")).toHaveText([guest.name, guest.phone, guest.email]);
  await expect(buyer.locator("input, textarea, select")).toHaveCount(0);
  await expect(detail.locator(".market-order-note")).toHaveText("Guest order note");

  await card("Guest without email").click();
  await expect(buyer.locator("dt")).toHaveText(["Ad", "Telefon"]);
  await expect(buyer.locator("dd")).toHaveText(["Guest without email", "+1 (202) 555-0100"]);
  await expect(buyer.getByText("E-posta", { exact: true })).toHaveCount(0);

  await card("Canonical Customer").click();
  await expect(detail.getByRole("heading", { name: "Canonical Customer", exact: true })).toBeVisible();
  await expect(buyer).toContainText("Contact Snapshot");
  await expect(page.locator(".market-order-card").filter({ hasText: "Contact Snapshot" })).toHaveCount(0);

  await expect(card("Müşterisiz sipariş")).toContainText("Online satış");
  await card("Müşterisiz sipariş").click();
  await expect(detail.getByRole("heading", { name: "Sipariş", exact: true })).toBeVisible();
  await expect(buyer).toHaveCount(0);

  await expect(card("Only name")).toContainText("custom-source");
  await card("Only name").click();
  await expect(buyer.locator("dt")).toHaveText(["Ad"]);
  await expect(buyer.locator("dd")).toHaveText(["Only name"]);

  await card("Bayi Sipariş Testi").click();
  await expect(detail.getByRole("heading", { name: "Bayi Sipariş Testi", exact: true })).toBeVisible();
  await expect(buyer).toHaveCount(0);
  await expect(card("Bayi Sipariş Testi")).toContainText("Manuel bayi");

  assert.deepEqual(pageErrors, []);
  console.log("commerce-wholesale-orders-ui-smoke-ok");
} catch (error) {
  if (page) {
    try {
      console.error("UI at failure:", await page.locator("body").innerText());
    } catch {}
  }
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  raw?.close();
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
