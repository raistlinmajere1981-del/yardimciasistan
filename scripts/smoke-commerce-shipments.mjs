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

  setBusinessCapability(databasePath, { capability: "commerce.orders", enabled: true });
  const shipping = { method: "shipping", address: { recipientName: "Shipment Test", addressLine1: "Test Road", district: "Central", city: "Istanbul", countryCode: "TR" } };
  const orderInput = { items: [{ productId: product.id, quantity: 1 }] };
  const pickup = createRuntimeOrder(databasePath, orderInput);
  assert.throws(() => database.createShipmentForOrder(pickup.order.id), /Yalnız kargo/);
  assert.throws(() => database.createShipmentForOrder("missing"), /sipariş bulunamadı/);
  assert.throws(() => database.listShipmentsForOrder("missing"), /sipariş bulunamadı/);
  const order = createRuntimeOrder(databasePath, { ...orderInput, deliverySnapshot: shipping });
  const initialOrder = getRuntimeOrder(databasePath, order.order.id);
  const raw = new DatabaseSync(databasePath);
  try {
    const outboxBefore = raw.prepare("SELECT * FROM sync_outbox ORDER BY job_key").all();
    const first = database.createShipmentForOrder(order.order.id);
    const second = database.createShipmentForOrder(order.order.id);
    assert.notEqual(first.id, second.id);
    assert.equal(database.listShipmentsForOrder(order.order.id).length, 2);
    assert.deepEqual(database.getShipment(first.id), first);
    assert.equal(database.getShipment("missing"), null);
    assert.equal(first.status, "draft");
    for (const field of ["providerId", "providerName", "externalReference", "trackingNumber", "trackingUrl", "labelReference", "note", "readyAt", "dispatchedAt", "deliveredAt", "cancelledAt"]) assert.equal(first[field], "");
    assert.equal(first.createdAt, first.updatedAt);
    assert.equal(first.businessId, order.order.businessId);
    assert.throws(() => database.updateShipmentStatus({ shipmentId: first.id, status: "delivered" }), /Geçersiz/);
    assert.throws(() => database.updateShipmentStatus({ shipmentId: first.id, status: "unknown" }), /Geçersiz/);
    assert.throws(() => database.updateShipmentStatus({ shipmentId: first.id, status: "toString" }), /Geçersiz/);
    let previous = first;
    for (const [status, timestamp] of [["ready", "readyAt"], ["dispatched", "dispatchedAt"], ["delivered", "deliveredAt"]]) {
      const before = new Date().toISOString();
      const next = database.updateShipmentStatus({ shipmentId: first.id, status, deliveredAt: "forged" });
      const after = new Date().toISOString();
      assert.equal(next.status, status);
      assert.ok(next[timestamp] >= before && next[timestamp] <= after);
      assert.equal(next.updatedAt, next[timestamp]);
      assert.equal(next.createdAt, first.createdAt);
      if (previous.readyAt) assert.equal(next.readyAt, previous.readyAt);
      if (previous.dispatchedAt) assert.equal(next.dispatchedAt, previous.dispatchedAt);
      assert.deepEqual(database.updateShipmentStatus({ shipmentId: first.id, status }), next, "same-status retry preserves timestamps");
      if (status !== "delivered") assert.equal(next.deliveredAt, "");
      previous = next;
    }
    for (const status of ["draft", "ready", "dispatched", "cancelled"]) assert.throws(() => database.updateShipmentStatus({ shipmentId: first.id, status }), /Geçersiz/);
    const cancelled = database.updateShipmentStatus({ shipmentId: second.id, status: "cancelled" });
    assert.ok(cancelled.cancelledAt);
    assert.equal(cancelled.readyAt, "");
    assert.equal(cancelled.updatedAt, cancelled.cancelledAt);
    for (const status of ["draft", "ready", "dispatched", "delivered"]) assert.throws(() => database.updateShipmentStatus({ shipmentId: second.id, status }), /Geçersiz/);
    assert.deepEqual(database.updateShipmentStatus({ shipmentId: second.id, status: "cancelled" }), cancelled);
    assert.deepEqual(getRuntimeOrder(databasePath, order.order.id), initialOrder);
    assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 10);
    for (const table of ["commerce_sales", "commerce_order_fulfillments"]) assert.equal(Number(raw.prepare(`SELECT count(*) AS n FROM ${table}`).get().n), 0);
    assert.deepEqual(raw.prepare("SELECT * FROM sync_outbox ORDER BY job_key").all(), outboxBefore);

    const readyCancel = database.createShipmentForOrder(order.order.id);
    database.updateShipmentStatus({ shipmentId: readyCancel.id, status: "ready" });
    assert.ok(database.updateShipmentStatus({ shipmentId: readyCancel.id, status: "cancelled" }).readyAt);
    const pendingReady = database.createShipmentForOrder(order.order.id);
    database.updateShipmentStatus({ shipmentId: pendingReady.id, status: "ready" });
    assert.throws(() => database.updateShipmentStatus({ shipmentId: pendingReady.id, status: "delivered" }), /Geçersiz/);
    const pending = database.createShipmentForOrder(order.order.id);
    const enroute = database.createShipmentForOrder(order.order.id);
    database.updateShipmentStatus({ shipmentId: enroute.id, status: "ready" });
    database.updateShipmentStatus({ shipmentId: enroute.id, status: "dispatched" });
    updateRuntimeOrderStatus(databasePath, { orderId: order.order.id, status: "cancelled" });
    assert.equal(database.getShipment(pending.id).status, "draft", "order cancellation does not cascade");
    assert.throws(() => database.createShipmentForOrder(order.order.id), /İptal edilmiş/);
    assert.throws(() => database.updateShipmentStatus({ shipmentId: pendingReady.id, status: "dispatched" }), /ilerletilemez/);
    database.updateShipmentStatus({ shipmentId: pendingReady.id, status: "cancelled" });
    assert.throws(() => database.updateShipmentStatus({ shipmentId: pending.id, status: "ready" }), /ilerletilemez/);
    database.updateShipmentStatus({ shipmentId: pending.id, status: "cancelled" });
    database.updateShipmentStatus({ shipmentId: enroute.id, status: "delivered" });

    const fulfilled = createRuntimeOrder(databasePath, { ...orderInput, deliverySnapshot: shipping });
    const beforeFulfillment = database.createShipmentForOrder(fulfilled.order.id);
    updateRuntimeOrderStatus(databasePath, { orderId: fulfilled.order.id, status: "confirmed" });
    const { fulfillRuntimeOrder } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
    fulfillRuntimeOrder(databasePath, { orderId: fulfilled.order.id, operationKey: "shipment-fulfillment", settlement: { type: "paid", paymentMethod: "cash" } });
    assert.equal(database.getShipment(beforeFulfillment.id).status, "draft");
    const afterFulfillment = database.createShipmentForOrder(fulfilled.order.id);
    for (const status of ["ready", "dispatched", "delivered"]) database.updateShipmentStatus({ shipmentId: afterFulfillment.id, status });
    assert.equal(getRuntimeOrder(databasePath, fulfilled.order.id).order.status, "fulfilled");
    assert.equal(Number(raw.prepare("SELECT count(*) AS n FROM commerce_sales").get().n), 1);

    const fk = raw.prepare("PRAGMA foreign_key_list('commerce_shipments')").all();
    assert.ok(fk.some((key) => key.table === "commerce_orders" && key.from === "order_id"));
    assert.ok(raw.prepare("PRAGMA index_list('commerce_shipments')").all().some((idx) => idx.name === "idx_commerce_shipments_order" && idx.unique === 0));
    assert.throws(() => raw.prepare("INSERT INTO commerce_shipments (id, business_id, order_id, status, created_at, updated_at) VALUES ('bad', ?, ?, 'bad', '', '')").run(first.businessId, order.order.id), /CHECK/);
    raw.prepare("UPDATE commerce_shipments SET deleted_at = 'deleted' WHERE id = ?").run(first.id);
    assert.equal(database.getShipment(first.id), null);
    assert.ok(!database.listShipmentsForOrder(order.order.id).some((s) => s.id === first.id));
    raw.prepare("UPDATE commerce_orders SET deleted_at = 'deleted' WHERE id = ?").run(order.order.id);
    assert.equal(database.getShipment(second.id), null, "deleted parent hides its shipment");
    assert.throws(() => database.listShipmentsForOrder(order.order.id), /sipariş bulunamadı/);
    assert.throws(() => database.updateShipmentStatus({ shipmentId: second.id, status: "cancelled" }), /Gönderi bulunamadı/);
    setBusinessCapability(databasePath, { capability: "commerce.orders", enabled: false });
    assert.throws(() => database.createShipmentForOrder(fulfilled.order.id), /etkin değil/);
    assert.throws(() => database.listShipmentsForOrder(fulfilled.order.id), /etkin değil/);
    assert.throws(() => database.getShipment(afterFulfillment.id), /etkin değil/);
    assert.throws(() => database.updateShipmentStatus({ shipmentId: afterFulfillment.id, status: "delivered" }), /etkin değil/);
  } finally { raw.close(); }
  console.log("commerce-shipments-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
