import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  setBusinessCapability
} = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {
  applyRuntimeInventoryMovement,
  createRuntimeOrder,
  getRuntimeInventoryBalance,
  getRuntimeOrder,
  listRuntimeOrders,
  saveRuntimeCatalogProduct,
  updateRuntimeOrderStatus
} = require("../apps/desktop-app/dist-electron/commerce-runtime.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-commerce-orders-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();
  const setup = database.saveInitialSetup({
    businessName: "Sipariş Çekirdeği Smoke",
    profileId: "market",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "commerce-orders-smoke-secret",
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

  const databasePath = database.databasePath;
  const product = saveRuntimeCatalogProduct(databasePath, {
    name: "Sipariş Test Ürünü",
    sku: "ORDER-001",
    barcode: "8690000000882",
    salePrice: 25,
    purchasePrice: 15,
    currency: "TRY",
    unit: "piece",
    taxRate: 20,
    trackInventory: true,
    isActive: true
  });

  applyRuntimeInventoryMovement(databasePath, {
    productId: product.id,
    type: "purchase",
    quantityDelta: 10,
    unitCost: 15,
    referenceType: "orders_smoke",
    referenceId: "seed-stock"
  });
  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 10);

  const customerResult = database.saveCustomer({
    fullName: "Bayi Adayı Müşteri",
    phone: "05550000101",
    email: "bayi@example.test",
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
    address: ""
  });
  assert.equal(customerResult.ok, true, customerResult.ok ? "" : customerResult.message);
  const customerId = customerResult.savedId;

  const orderInput = {
    customerId,
    source: "wholesale-smoke",
    sourceReference: "dealer-order-1001",
    discountTotal: 5,
    note: "İlk sipariş",
    items: [{ productId: product.id, quantity: 2 }]
  };

  assert.throws(
    () => createRuntimeOrder(databasePath, orderInput),
    /Sipariş yönetimi/
  );

  const enabled = setBusinessCapability(databasePath, {
    capability: "commerce.orders",
    enabled: true
  });
  assert.equal(enabled.enabledCapabilities.includes("commerce.orders"), true);

  assert.throws(
    () => setBusinessCapability(databasePath, {
      capability: "commerce.catalog",
      enabled: false
    }),
    /commerce\.orders/
  );

  const created = createRuntimeOrder(databasePath, orderInput);
  assert.equal(created.order.status, "placed");
  assert.equal(created.order.customerId, customerId);
  assert.equal(created.order.customerName, "Bayi Adayı Müşteri");
  assert.equal(created.order.buyerSnapshot, null, "manual orders need no guest snapshot");
  assert.equal(created.order.source, "wholesale-smoke");
  assert.equal(created.order.sourceReference, "dealer-order-1001");
  assert.equal(created.order.subtotal, 50);
  assert.equal(created.order.discountTotal, 5);
  assert.equal(created.order.total, 45);
  assert.equal(created.order.currency, "TRY");
  assert.equal(created.items.length, 1);
  assert.equal(created.items[0].productId, product.id);
  assert.equal(created.items[0].productName, "Sipariş Test Ürünü");
  assert.equal(created.items[0].sku, "ORDER-001");
  assert.equal(created.items[0].unitPrice, 25);
  assert.equal(created.items[0].quantity, 2);
  assert.equal(created.items[0].lineTotal, 50);
  assert.equal(created.items[0].taxRate, 20);

  assert.equal(
    getRuntimeInventoryBalance(databasePath, product.id).quantity,
    10,
    "Sipariş oluşturmak stoğu değiştirmemeli."
  );

  const duplicate = createRuntimeOrder(databasePath, orderInput);
  assert.equal(duplicate.order.id, created.order.id, "Aynı sourceReference idempotent olmalı.");

  const raw = new DatabaseSync(databasePath);
  try {
    assert.equal(
      Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_orders").get().count),
      1
    );
    assert.equal(
      Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_sales WHERE deleted_at = ''").get().count),
      0,
      "Sipariş oluşturmak satış oluşturmamalı."
    );
    assert.equal(
      Number(raw.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type = 'commerce_order'").get().count),
      0,
      "Sipariş stok hareketi üretmemeli."
    );
  } finally {
    raw.close();
  }

  const repriced = saveRuntimeCatalogProduct(databasePath, {
    id: product.id,
    name: product.name,
    brand: product.brand,
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    salePrice: 30,
    purchasePrice: product.purchasePrice,
    currency: product.currency,
    unit: product.unit,
    taxRate: product.taxRate,
    trackInventory: product.trackInventory,
    isActive: product.isActive
  });
  assert.equal(repriced.salePrice, 30);

  const renamedCustomer = database.saveCustomer({
    id: customerId,
    fullName: "Yeni Ticari Unvan",
    phone: "05550000101",
    email: "bayi@example.test",
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
    address: ""
  });
  assert.equal(renamedCustomer.ok, true, renamedCustomer.ok ? "" : renamedCustomer.message);

  const snapshot = getRuntimeOrder(databasePath, created.order.id);
  assert.equal(snapshot?.order.customerName, "Bayi Adayı Müşteri", "Müşteri adı siparişte snapshot kalmalı.");
  assert.equal(snapshot?.items[0].unitPrice, 25, "Ürün fiyatı siparişte snapshot kalmalı.");
  assert.equal(snapshot?.order.total, 45);

  assert.deepEqual(
    listRuntimeOrders(databasePath, {
      status: "placed",
      customerId,
      source: "wholesale-smoke"
    }).map((order) => order.id),
    [created.order.id]
  );

  const confirmed = updateRuntimeOrderStatus(databasePath, {
    orderId: created.order.id,
    status: "confirmed"
  });
  assert.equal(confirmed.order.status, "confirmed");
  assert.ok(confirmed.order.confirmedAt);

  const confirmedAgain = updateRuntimeOrderStatus(databasePath, {
    orderId: created.order.id,
    status: "confirmed"
  });
  assert.equal(confirmedAgain.order.confirmedAt, confirmed.order.confirmedAt);

  const cancelled = updateRuntimeOrderStatus(databasePath, {
    orderId: created.order.id,
    status: "cancelled"
  });
  assert.equal(cancelled.order.status, "cancelled");
  assert.ok(cancelled.order.cancelledAt);

  assert.throws(
    () => updateRuntimeOrderStatus(databasePath, {
      orderId: created.order.id,
      status: "confirmed"
    }),
    /Tamamlanmış veya iptal edilmiş/
  );

  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 10);

  setBusinessCapability(databasePath, {
    capability: "commerce.orders",
    enabled: false
  });
  assert.throws(() => listRuntimeOrders(databasePath), /Sipariş yönetimi/);

  console.log("commerce-orders-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
