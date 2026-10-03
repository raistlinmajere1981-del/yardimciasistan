import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  applyRuntimeInventoryMovement,
  createRuntimeOrder,
  getRuntimeInventoryBalance,
  getRuntimeOrder,
  listRuntimeOrders,
  resolveRuntimeProductPrice,
  saveRuntimeCatalogProduct,
  updateRuntimeOrderStatus
} = require("../apps/desktop-app/dist-electron/commerce-runtime.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-wholesale-order-flow-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

const customerInput = (overrides = {}) => ({
  fullName: "Sipariş Bayisi",
  phone: "05550004001",
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
  ...overrides
});

try {
  database.initialize();
  const setup = database.saveInitialSetup({
    businessName: "Wholesale Order Flow Smoke",
    profileId: "market",
    profileOptions: [C.WHOLESALE],
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "wholesale-order-flow-secret",
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

  const enabled = new Set(database.getEnabledBusinessCapabilities());
  assert.equal(enabled.has(C.WHOLESALE), true);
  assert.equal(enabled.has(C.ORDERS), true);

  const product = saveRuntimeCatalogProduct(database.databasePath, {
    name: "Bayi Sipariş Ürünü",
    sku: "WHOLE-ORDER-001",
    barcode: "8690000040001",
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
    referenceType: "wholesale_order_smoke",
    referenceId: "seed"
  });
  assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 10);

  const customer = database.saveCustomer(customerInput({
    commercialProfile: {
      companyName: "Sipariş Bayisi Ltd.",
      taxOffice: "Cide",
      taxNumber: "4444444444",
      authorizedPerson: "Sipariş Bayisi",
      dealerStatus: "active",
      priceGroup: "dealer_a",
      paymentTermDays: 30,
      notes: ""
    }
  }));
  assert.equal(customer.ok, true, customer.ok ? "" : customer.message);
  const customerId = customer.savedId;

  const resolved = resolveRuntimeProductPrice(database.databasePath, {
    productId: product.id,
    customerId
  });
  assert.equal(resolved.appliedGroup, "dealer_a");
  assert.equal(resolved.unitPrice, 80);

  const created = createRuntimeOrder(database.databasePath, {
    customerId,
    source: "desktop-wholesale",
    note: "Manuel bayi siparişi",
    items: [{ productId: product.id, quantity: 2 }]
  });

  assert.equal(created.order.source, "desktop-wholesale");
  assert.equal(created.order.customerId, customerId);
  assert.equal(created.order.customerName, "Sipariş Bayisi");
  assert.equal(created.order.buyerSnapshot, null, "wholesale Customer identity remains independent of guest contacts");
  assert.equal(created.order.subtotal, 160);
  assert.equal(created.order.total, 160);
  assert.equal(created.items.length, 1);
  assert.equal(created.items[0].unitPrice, 80);
  assert.equal(created.items[0].quantity, 2);
  assert.equal(created.items[0].lineTotal, 160);
  assert.equal(created.order.status, "placed");

  assert.equal(
    getRuntimeInventoryBalance(database.databasePath, product.id).quantity,
    10,
    "Order creation must not mutate inventory."
  );

  const raw = new DatabaseSync(database.databasePath);
  try {
    assert.equal(
      Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_sales WHERE deleted_at = ''").get().count),
      0,
      "Wholesale order must not create a sale."
    );
    assert.equal(
      Number(raw.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type = 'commerce_order'").get().count),
      0,
      "Wholesale order must not create inventory movement."
    );
  } finally {
    raw.close();
  }

  const repriced = saveRuntimeCatalogProduct(database.databasePath, {
    ...product,
    dealerPriceA: 65
  });
  assert.equal(repriced.dealerPriceA, 65);

  const stored = getRuntimeOrder(database.databasePath, created.order.id);
  assert.equal(stored?.items[0].unitPrice, 80, "Order must preserve the original dealer price snapshot.");

  const nextResolved = resolveRuntimeProductPrice(database.databasePath, {
    productId: product.id,
    customerId
  });
  assert.equal(nextResolved.unitPrice, 65, "Future pricing must see the new dealer price.");

  assert.deepEqual(
    listRuntimeOrders(database.databasePath, { source: "desktop-wholesale" }).map((order) => order.id),
    [created.order.id]
  );

  const confirmed = updateRuntimeOrderStatus(database.databasePath, {
    orderId: created.order.id,
    status: "confirmed"
  });
  assert.equal(confirmed.order.status, "confirmed");
  assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 10);

  console.log("commerce-wholesale-order-flow-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
