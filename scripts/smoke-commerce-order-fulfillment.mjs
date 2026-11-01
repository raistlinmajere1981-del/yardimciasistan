import assert from "node:assert/strict";
import { load } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { capabilities } from "./test-helpers/commerce-benefits-fixture.mjs";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const { BUSINESS_CAPABILITIES: C } = capabilities;
const { DesktopDatabase } = load("database");
const {
  applyRuntimeInventoryMovement,
  createRuntimeOrder,
  fulfillRuntimeOrder,
  getRuntimeInventoryBalance,
  saveRuntimeCatalogProduct,
  updateRuntimeOrderStatus
} = load("commerce-runtime");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-order-fulfillment-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

const baseCustomer = (overrides = {}) => ({
  fullName: "Fulfillment Bayisi",
  phone: "05550006001",
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

function confirmOrder(orderId) {
  return updateRuntimeOrderStatus(database.databasePath, {
    orderId,
    status: "confirmed"
  });
}

function createDealerOrder(productId, customerId, quantity, reference) {
  return createRuntimeOrder(database.databasePath, {
    customerId,
    source: "desktop-wholesale",
    sourceReference: reference,
    ...(reference === "fulfillment-smoke-paid-order" ? { deliverySnapshot: { method: "shipping", address: { recipientName: "Recipient", addressLine1: "42 Road", district: "Central", city: "London", countryCode: "GB" } } } : {}),
    items: [{ productId, quantity }]
  });
}

try {
  database.initialize();
  const setup = database.saveInitialSetup({
    businessName: "Order Fulfillment Smoke",
    profileId: "market",
    profileOptions: [C.WHOLESALE, C.CUSTOMER_CREDIT],
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "order-fulfillment-smoke-secret",
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

  const customer = database.saveCustomer(baseCustomer({
    commercialProfile: {
      companyName: "Fulfillment Bayisi Ltd.",
      taxOffice: "Cide",
      taxNumber: "6666666666",
      authorizedPerson: "Fulfillment Bayisi",
      dealerStatus: "active",
      priceGroup: "dealer_a",
      paymentTermDays: 30,
      notes: ""
    }
  }));
  assert.equal(customer.ok, true, customer.ok ? "" : customer.message);

  const product = saveRuntimeCatalogProduct(database.databasePath, {
    name: "Fulfillment Ürünü",
    sku: "FUL-001",
    barcode: "8690000060001",
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
    quantityDelta: 20,
    unitCost: 50,
    referenceType: "fulfillment_smoke",
    referenceId: "seed"
  });

  const raw = new DatabaseSync(database.databasePath);

  try {
    const paidOrder = createDealerOrder(
      product.id,
      customer.savedId,
      2,
      "fulfillment-smoke-paid-order"
    );
    assert.equal(paidOrder.items[0].unitPrice, 80);
    confirmOrder(paidOrder.order.id);

    // Change current catalog price after order acceptance. Fulfillment must keep the order snapshot.
    saveRuntimeCatalogProduct(database.databasePath, {
      ...product,
      dealerPriceA: 65
    });

    const paid = fulfillRuntimeOrder(database.databasePath, {
      orderId: paidOrder.order.id,
      operationKey: "fulfillment-op-paid-1",
      settlement: { type: "paid", paymentMethod: "cash" }
    });

    assert.equal(paid.order.order.status, "fulfilled");
    assert.deepEqual(paid.order.order.deliverySnapshot, paidOrder.order.deliverySnapshot);
    assert.equal(paid.order.order.deliverySnapshot.method, "shipping");
    assert.equal(paid.sale.status, "paid");
    assert.equal(paid.sale.paymentMethod, "cash");
    assert.equal(paid.sale.subtotal, 160);
    assert.equal(paid.sale.total, 160);
    assert.equal(paid.fulfillment.settlementType, "paid");
    assert.ok(paid.fulfillment.inventoryLocationId);
    assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 18);

    const paidItem = raw.prepare(`
      SELECT unit_price, quantity, line_total, product_name
      FROM commerce_sale_items
      WHERE sale_id = ?
      LIMIT 1
    `).get(paid.sale.id);
    assert.equal(Number(paidItem.unit_price), 80, "Fulfillment must use the order snapshot, not current dealer price.");
    assert.equal(Number(paidItem.quantity), 2);
    assert.equal(Number(paidItem.line_total), 160);
    assert.equal(paidItem.product_name, "Fulfillment Ürünü");

    const retry = fulfillRuntimeOrder(database.databasePath, {
      orderId: paidOrder.order.id,
      operationKey: "fulfillment-op-paid-1",
      settlement: { type: "paid", paymentMethod: "cash" }
    });
    assert.equal(retry.sale.id, paid.sale.id);
    assert.equal(retry.fulfillment.id, paid.fulfillment.id);
    assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 18);
    assert.equal(
      Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_sales WHERE id = ?").get(paid.sale.id).count),
      1
    );

    assert.throws(
      () => fulfillRuntimeOrder(database.databasePath, {
        orderId: paidOrder.order.id,
        operationKey: "fulfillment-op-paid-1",
        settlement: { type: "paid", paymentMethod: "card" }
      }),
      /aynı fulfillment işlem anahtarı farklı bir istek/i
    );
    assert.throws(
      () => fulfillRuntimeOrder(database.databasePath, {
        orderId: paidOrder.order.id,
        operationKey: "fulfillment-op-paid-2",
        settlement: { type: "paid", paymentMethod: "cash" }
      }),
      /daha önce farklı bir işlem anahtarıyla tamamlandı/i
    );

    const creditOrder = createDealerOrder(
      product.id,
      customer.savedId,
      1,
      "fulfillment-smoke-credit-order"
    );
    confirmOrder(creditOrder.order.id);
    const credit = fulfillRuntimeOrder(database.databasePath, {
      orderId: creditOrder.order.id,
      operationKey: "fulfillment-op-credit-1",
      settlement: { type: "credit" }
    });

    assert.equal(credit.sale.status, "credit");
    assert.equal(credit.sale.paymentMethod, "");
    assert.equal(credit.order.order.status, "fulfilled");
    assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 17);

    const creditEntry = raw.prepare(`
      SELECT customer_id, direction, amount_minor, currency, entry_type, sale_id, payment_method
      FROM customer_credit_entries
      WHERE sale_id = ?
      LIMIT 1
    `).get(credit.sale.id);
    assert.equal(creditEntry.customer_id, customer.savedId);
    assert.equal(creditEntry.direction, "debit");
    assert.equal(Number(creditEntry.amount_minor), Math.round(credit.sale.total * 100));
    assert.equal(creditEntry.currency, "TRY");
    assert.equal(creditEntry.entry_type, "credit_sale");
    assert.equal(creditEntry.payment_method, "");

    assert.equal(
      Number(raw.prepare("SELECT COUNT(*) AS count FROM finance_entries WHERE source_id = ?").get(creditEntry.sale_id).count),
      0,
      "Credit sale creation must not project finance income before collection."
    );

    const freeProduct = saveRuntimeCatalogProduct(database.databasePath, {
      name: "Bedelsiz Bayi Ürünü",
      sku: "FUL-ZERO",
      barcode: "8690000060002",
      salePrice: 25,
      dealerPriceA: 0,
      dealerPriceB: null,
      purchasePrice: 5,
      currency: "TRY",
      unit: "piece",
      taxRate: 20,
      trackInventory: true,
      isActive: true
    });
    applyRuntimeInventoryMovement(database.databasePath, {
      productId: freeProduct.id,
      type: "purchase",
      quantityDelta: 3,
      unitCost: 5,
      referenceType: "fulfillment_smoke",
      referenceId: "zero-seed"
    });

    const zeroOrder = createDealerOrder(
      freeProduct.id,
      customer.savedId,
      1,
      "fulfillment-smoke-zero-order"
    );
    assert.equal(zeroOrder.order.total, 0);
    confirmOrder(zeroOrder.order.id);

    assert.throws(
      () => fulfillRuntimeOrder(database.databasePath, {
        orderId: zeroOrder.order.id,
        operationKey: "fulfillment-op-zero-wrong",
        settlement: { type: "paid", paymentMethod: "cash" }
      }),
      /ödeme gerektirmeden tamamlanmalı/i
    );

    const zero = fulfillRuntimeOrder(database.databasePath, {
      orderId: zeroOrder.order.id,
      operationKey: "fulfillment-op-zero-1",
      settlement: { type: "no_payment" }
    });
    assert.equal(zero.sale.status, "paid");
    assert.equal(zero.sale.paymentMethod, "none");
    assert.equal(zero.sale.total, 0);
    assert.equal(zero.fulfillment.settlementType, "no_payment");
    assert.equal(getRuntimeInventoryBalance(database.databasePath, freeProduct.id).quantity, 2);

    const lowStockProduct = saveRuntimeCatalogProduct(database.databasePath, {
      name: "Yetersiz Stok Ürünü",
      sku: "FUL-LOW",
      barcode: "8690000060003",
      salePrice: 50,
      dealerPriceA: 40,
      dealerPriceB: null,
      purchasePrice: 20,
      currency: "TRY",
      unit: "piece",
      taxRate: 20,
      trackInventory: true,
      isActive: true
    });
    applyRuntimeInventoryMovement(database.databasePath, {
      productId: lowStockProduct.id,
      type: "purchase",
      quantityDelta: 1,
      unitCost: 20,
      referenceType: "fulfillment_smoke",
      referenceId: "low-seed"
    });

    const failingOrder = createDealerOrder(
      lowStockProduct.id,
      customer.savedId,
      2,
      "fulfillment-smoke-rollback-order"
    );
    confirmOrder(failingOrder.order.id);

    const saleCountBeforeFailure = Number(
      raw.prepare("SELECT COUNT(*) AS count FROM commerce_sales WHERE deleted_at = ''").get().count
    );
    assert.throws(
      () => fulfillRuntimeOrder(database.databasePath, {
        orderId: failingOrder.order.id,
        operationKey: "fulfillment-op-rollback-1",
        settlement: { type: "paid", paymentMethod: "bank" }
      }),
      /Yetersiz stok/i
    );

    assert.equal(
      Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_sales WHERE deleted_at = ''").get().count),
      saleCountBeforeFailure,
      "Failed inventory mutation must roll back the sale."
    );
    assert.equal(
      Number(raw.prepare("SELECT COUNT(*) AS count FROM commerce_order_fulfillments WHERE order_id = ?").get(failingOrder.order.id).count),
      0,
      "Failed fulfillment must not leave a link row."
    );
    assert.equal(
      raw.prepare("SELECT status FROM commerce_orders WHERE id = ?").get(failingOrder.order.id).status,
      "confirmed",
      "Failed fulfillment must keep the order confirmed."
    );
    assert.equal(getRuntimeInventoryBalance(database.databasePath, lowStockProduct.id).quantity, 1);

    const placedOrder = createDealerOrder(
      product.id,
      customer.savedId,
      1,
      "fulfillment-smoke-placed-order"
    );
    assert.throws(
      () => fulfillRuntimeOrder(database.databasePath, {
        orderId: placedOrder.order.id,
        operationKey: "fulfillment-op-placed-1",
        settlement: { type: "paid", paymentMethod: "other" }
      }),
      /Yalnız onaylanmış sipariş/i
    );

    console.log("commerce-order-fulfillment-smoke-ok");
  } finally {
    raw.close();
  }
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
