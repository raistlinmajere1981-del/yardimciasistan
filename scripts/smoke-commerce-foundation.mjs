import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  deleteCatalogCategory,
  getCatalogCategory,
  listCatalogCategories,
  saveCatalogCategory
} = require("../apps/desktop-app/dist-electron/commerce-category-store.js");
const {
  getCommercePurchaseOrder,
  listCommercePurchaseOrders,
  receiveCommercePurchase
} = require("../apps/desktop-app/dist-electron/commerce-purchase-store.js");
const {
  applyInventoryMovement,
  createPaidCommerceSale,
  findCatalogProductByBarcode,
  getCommerceStoreSnapshot,
  getInventoryBalance,
  listCatalogProducts,
  listCommerceSuppliers,
  listInventoryMovements,
  saveCatalogProduct,
  saveCommerceSupplier,
  setInventoryCount
} = require("../apps/desktop-app/dist-electron/commerce-store.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-commerce-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();
  const setupResult = database.saveInitialSetup({
    businessName: "Ticaret Test İşletmesi",
    profileId: "pension_restaurant",
    phone: "+905550002003",
    whatsapp: "+905550002003",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "commerce-smoke-secret",
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
    initialCounts: { rooms: 1, tables: 1 },
    tableCategories: []
  });
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  const databasePath = database.databasePath;

  const dairyCategory = saveCatalogCategory(databasePath, {
    name: "Süt Ürünleri",
    code: "dairy",
    sortOrder: 10
  });
  const chilledCategory = saveCatalogCategory(databasePath, {
    parentId: dairyCategory.id,
    name: "Soğuk Ürünler",
    code: "chilled",
    sortOrder: 20
  });
  assert.equal(getCatalogCategory(databasePath, chilledCategory.id)?.parentId, dairyCategory.id);
  assert.deepEqual(
    listCatalogCategories(databasePath, { parentId: "" }).map((category) => category.id),
    [dairyCategory.id]
  );
  assert.deepEqual(
    listCatalogCategories(databasePath, { parentId: dairyCategory.id }).map((category) => category.id),
    [chilledCategory.id]
  );
  assert.deepEqual(
    listCatalogCategories(databasePath, { search: "chill" }).map((category) => category.id),
    [chilledCategory.id]
  );
  assert.throws(
    () => saveCatalogCategory(databasePath, {
      id: dairyCategory.id,
      parentId: chilledCategory.id,
      name: dairyCategory.name,
      code: dairyCategory.code,
      sortOrder: dairyCategory.sortOrder
    }),
    /döngü/i
  );
  assert.throws(
    () => deleteCatalogCategory(databasePath, dairyCategory.id),
    /alt kategori/i
  );

  const product = saveCatalogProduct(databasePath, {
    categoryId: chilledCategory.id,
    name: "Test Süt 1L",
    brand: "Smoke Dairy",
    sku: "SUT-1L",
    barcode: "8690000000011",
    imageSourceUrl: "https://images.openfoodfacts.org/images/products/869/test.jpg",
    dataSource: "open_food_facts",
    sourceProductUrl: "https://world.openfoodfacts.org/product/8690000000011",
    dataLicense: "ODbL",
    imageLicense: "CC BY-SA",
    sourceFetchedAt: "2026-09-19T12:00:00.000Z",
    salePrice: 42.5,
    purchasePrice: 31.25,
    currency: "TRY",
    unit: "piece",
    minimumQuantity: 3
  });
  assert.equal(product.name, "Test Süt 1L");
  assert.equal(product.brand, "Smoke Dairy");
  assert.equal(product.barcode, "8690000000011");
  assert.equal(product.dataSource, "open_food_facts");
  assert.equal(product.dataLicense, "ODbL");
  assert.equal(product.imageLicense, "CC BY-SA");
  assert.equal(product.imageAssetPath, "");
  assert.equal(product.categoryId, chilledCategory.id);
  assert.equal(product.trackInventory, true);
  assert.throws(
    () => deleteCatalogCategory(databasePath, chilledCategory.id),
    /ürün bağlı/i
  );

  const secondProduct = saveCatalogProduct(databasePath, {
    name: "Test Yoğurt 500g",
    sku: "YOG-500",
    barcode: "8690000000012",
    salePrice: 30,
    purchasePrice: 20,
    minimumQuantity: 1
  });

  assert.deepEqual(
    listCatalogProducts(databasePath, { categoryId: chilledCategory.id }).items.map((item) => item.id),
    [product.id],
    "Product category filter should use persisted category id."
  );
  assert.deepEqual(
    listCatalogProducts(databasePath, { search: "SUT-1L" }).items.map((item) => item.id),
    [product.id],
    "Product search should include SKU."
  );
  assert.deepEqual(
    listCatalogProducts(databasePath, { search: "Smoke Dairy" }).items.map((item) => item.id),
    [product.id],
    "Product search should include brand."
  );
  assert.deepEqual(
    listCatalogProducts(databasePath, { search: "0000000012" }).items.map((item) => item.id),
    [secondProduct.id],
    "Product search should include barcode fragments."
  );
  assert.equal(findCatalogProductByBarcode(databasePath, "8690000000011")?.id, product.id);
  assert.equal(findCatalogProductByBarcode(databasePath, " 8690000000011 ")?.id, product.id);
  assert.equal(findCatalogProductByBarcode(databasePath, "8690000000999"), null);

  const startingBalance = getInventoryBalance(databasePath, product.id);
  assert.equal(startingBalance.quantity, 0);
  assert.equal(startingBalance.minimumQuantity, 3);
  assert.throws(
    () => getInventoryBalance(databasePath, "missing-product"),
    /ürün bulunamadı/i,
    "Unknown products must not produce phantom zero balances."
  );

  const purchaseMovement = applyInventoryMovement(databasePath, {
    productId: product.id,
    type: "purchase",
    quantityDelta: 10,
    unitCost: 31.25,
    referenceType: "smoke_purchase",
    referenceId: "purchase-1"
  });
  assert.equal(purchaseMovement.quantityAfter, 10);

  const firstCount = setInventoryCount(databasePath, {
    productId: product.id,
    countedQuantity: 7,
    referenceId: "count-1"
  });
  assert.equal(firstCount.balance.quantity, 7);
  assert.equal(firstCount.movement?.type, "count");
  assert.equal(firstCount.movement?.quantityDelta, -3);
  assert.equal(firstCount.movement?.quantityAfter, 7);

  const unchangedCount = setInventoryCount(databasePath, {
    productId: product.id,
    countedQuantity: 7,
    referenceId: "count-2"
  });
  assert.equal(unchangedCount.balance.quantity, 7);
  assert.equal(unchangedCount.movement, null, "Equal physical count must not emit a zero movement.");

  const sale = createPaidCommerceSale(databasePath, {
    paymentMethod: "cash",
    source: "smoke",
    items: [{ productId: product.id, quantity: 2 }]
  });
  assert.equal(sale.status, "paid");
  assert.equal(sale.subtotal, 85);
  assert.equal(sale.total, 85);

  const afterSale = getInventoryBalance(databasePath, product.id);
  assert.equal(afterSale.quantity, 5);

  const movementHistory = listInventoryMovements(databasePath, { productId: product.id });
  assert.equal(movementHistory.length, 3);
  assert.deepEqual(
    new Set(movementHistory.map((movement) => movement.type)),
    new Set(["purchase", "count", "sale"])
  );
  assert.equal(listInventoryMovements(databasePath, { productId: product.id, type: "count" }).length, 1);

  const supplier = saveCommerceSupplier(databasePath, {
    name: "Test Tedarikçi",
    phone: "+905551112233",
    taxNumber: "1234567890"
  });
  assert.equal(supplier.name, "Test Tedarikçi");
  assert.deepEqual(
    listCommerceSuppliers(databasePath, { search: "1112233" }).map((item) => item.id),
    [supplier.id]
  );

  const receivedPurchase = receiveCommercePurchase(databasePath, {
    supplierId: supplier.id,
    source: "foundation-smoke",
    notes: "İki ürünlü stok girişi",
    items: [
      { productId: product.id, quantity: 4, unitCost: 30 },
      { productId: secondProduct.id, quantity: 6, unitCost: 18 }
    ]
  });
  assert.equal(receivedPurchase.order.status, "received");
  assert.equal(receivedPurchase.order.supplierId, supplier.id);
  assert.equal(receivedPurchase.order.subtotal, 228);
  assert.equal(receivedPurchase.order.total, 228);
  assert.equal(receivedPurchase.items.length, 2);
  assert.equal(getInventoryBalance(databasePath, product.id).quantity, 9);
  assert.equal(getInventoryBalance(databasePath, secondProduct.id).quantity, 6);
  assert.deepEqual(
    listCommercePurchaseOrders(databasePath, { supplierId: supplier.id }).map((order) => order.id),
    [receivedPurchase.order.id]
  );
  const loadedPurchase = getCommercePurchaseOrder(databasePath, receivedPurchase.order.id);
  assert.equal(loadedPurchase?.order.id, receivedPurchase.order.id);
  assert.equal(loadedPurchase?.items.length, 2);
  assert.deepEqual(
    new Set(loadedPurchase?.items.map((item) => item.productId)),
    new Set([product.id, secondProduct.id])
  );

  const rollbackProbe = new DatabaseSync(databasePath);
  try {
    rollbackProbe.exec(`
      CREATE TRIGGER smoke_fail_purchase_movement
      BEFORE INSERT ON inventory_movements
      WHEN NEW.reference_type = 'purchase_order' AND NEW.actor_source = 'rollback-smoke'
      BEGIN
        SELECT RAISE(ABORT, 'forced purchase rollback');
      END;
    `);
  } finally {
    rollbackProbe.close();
  }

  assert.throws(
    () => receiveCommercePurchase(databasePath, {
      supplierId: supplier.id,
      source: "rollback-smoke",
      items: [{ productId: product.id, quantity: 1, unitCost: 29 }]
    }),
    /forced purchase rollback/i
  );

  const rollbackCleanup = new DatabaseSync(databasePath);
  try {
    rollbackCleanup.exec("DROP TRIGGER smoke_fail_purchase_movement;");
  } finally {
    rollbackCleanup.close();
  }
  assert.equal(getInventoryBalance(databasePath, product.id).quantity, 9, "Failed receipt must roll back stock.");
  assert.equal(listCommercePurchaseOrders(databasePath).length, 1, "Failed receipt must roll back its order header.");

  const snapshot = getCommerceStoreSnapshot(databasePath);
  assert.equal(snapshot.products.length, 2);
  assert.equal(snapshot.suppliers.length, 1);

  assert.throws(
    () => saveCatalogProduct(databasePath, {
      name: "Aynı Barkodlu Ürün",
      barcode: "8690000000011",
      salePrice: 10
    }),
    /barkod/i
  );

  assert.throws(
    () => createPaidCommerceSale(databasePath, {
      paymentMethod: "cash",
      items: [{ productId: product.id, quantity: 99 }]
    }),
    /yetersiz stok/i
  );
  assert.equal(getInventoryBalance(databasePath, product.id).quantity, 9, "Failed sale must not mutate stock.");

  saveCatalogProduct(databasePath, {
    id: product.id,
    categoryId: "",
    name: product.name,
    brand: product.brand,
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    salePrice: product.salePrice,
    purchasePrice: product.purchasePrice,
    currency: product.currency,
    unit: product.unit,
    taxRate: product.taxRate,
    trackInventory: product.trackInventory,
    isActive: product.isActive,
    minimumQuantity: 3
  });
  const deletedChild = deleteCatalogCategory(databasePath, chilledCategory.id);
  assert.equal(deletedChild.id, chilledCategory.id);
  assert.equal(getCatalogCategory(databasePath, chilledCategory.id), null);
  const deletedParent = deleteCatalogCategory(databasePath, dairyCategory.id);
  assert.equal(deletedParent.id, dairyCategory.id);
  assert.equal(listCatalogCategories(databasePath).length, 0);

  const raw = new DatabaseSync(databasePath);
  try {
    const saleMovement = raw.prepare(`
      SELECT movement_type, quantity_delta, quantity_after, reference_type, reference_id
      FROM inventory_movements
      WHERE reference_type = 'commerce_sale' AND reference_id = ?
      LIMIT 1
    `).get(sale.id);
    assert.equal(saleMovement?.movement_type, "sale");
    assert.equal(Number(saleMovement?.quantity_delta), -2);
    assert.equal(Number(saleMovement?.quantity_after), 5);

    const purchaseMovementCount = raw.prepare(`
      SELECT COUNT(*) AS count
      FROM inventory_movements
      WHERE reference_type = 'purchase_order' AND reference_id = ?
    `).get(receivedPurchase.order.id);
    assert.equal(Number(purchaseMovementCount?.count), 2, "Each received purchase line must have a stock movement.");

    const purchaseItemCount = raw.prepare(`
      SELECT COUNT(*) AS count
      FROM purchase_order_items
      WHERE purchase_order_id = ?
    `).get(receivedPurchase.order.id);
    assert.equal(Number(purchaseItemCount?.count), 2);

    const unchangedMovement = raw.prepare(`
      SELECT COUNT(*) AS count
      FROM inventory_movements
      WHERE reference_id = 'count-2'
    `).get();
    assert.equal(Number(unchangedMovement?.count), 0, "Equal count must not leave an audit movement.");

    const saleCount = raw.prepare("SELECT COUNT(*) AS count FROM commerce_sales WHERE deleted_at = ''").get();
    assert.equal(Number(saleCount?.count), 1, "Failed sale must roll back its sale header too.");
    const purchaseCount = raw.prepare("SELECT COUNT(*) AS count FROM purchase_orders WHERE deleted_at = ''").get();
    assert.equal(Number(purchaseCount?.count), 1, "Failed receipt must roll back all purchase records.");
  } finally {
    raw.close();
  }

  console.log("commerce-foundation-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
