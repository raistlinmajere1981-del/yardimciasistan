import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  applyBusinessProfileCapabilities,
  setBusinessCapability
} = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {
  applyRuntimeInventoryMovement,
  createRuntimePaidSale,
  deleteRuntimeCatalogCategory,
  findRuntimeProductByBarcode,
  getCommerceRuntimeSnapshot,
  getRuntimeCatalogCategory,
  getRuntimeInventoryBalance,
  getRuntimePurchaseOrder,
  listRuntimeCatalogCategories,
  listRuntimeCatalogProducts,
  listRuntimeInventoryMovements,
  listRuntimePurchaseOrders,
  listRuntimeSuppliers,
  receiveRuntimePurchase,
  saveRuntimeCatalogCategory,
  saveRuntimeCatalogProduct,
  saveRuntimeSupplier,
  setRuntimeInventoryCount
} = require("../apps/desktop-app/dist-electron/commerce-runtime.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-commerce-runtime-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();
  const setupResult = database.saveInitialSetup({
    businessName: "Ticaret Çalışma Test İşletmesi",
    profileId: "pension_restaurant",
    phone: "+905550002004",
    whatsapp: "+905550002004",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "commerce-runtime-secret",
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

  // Restaurant profiles share some commerce concepts, but retail-only barcode,
  // supplier and purchasing operations stay unavailable until persisted retail
  // capabilities are explicitly enabled.
  assert.throws(
    () => findRuntimeProductByBarcode(databasePath, "8690000000097"),
    /barkod/i
  );
  assert.throws(
    () => listRuntimePurchaseOrders(databasePath),
    /satın alma/i
  );

  applyBusinessProfileCapabilities(databasePath, "market", { preserveUserOverrides: false });

  const rootCategory = saveRuntimeCatalogCategory(databasePath, {
    name: "İçecek",
    code: "drink",
    sortOrder: 10
  });
  const coldCategory = saveRuntimeCatalogCategory(databasePath, {
    parentId: rootCategory.id,
    name: "Soğuk İçecek",
    code: "cold-drink",
    sortOrder: 20
  });
  assert.equal(getRuntimeCatalogCategory(databasePath, coldCategory.id)?.parentId, rootCategory.id);
  assert.deepEqual(
    listRuntimeCatalogCategories(databasePath, { parentId: rootCategory.id }).map((category) => category.id),
    [coldCategory.id]
  );
  assert.throws(
    () => saveRuntimeCatalogCategory(databasePath, {
      id: rootCategory.id,
      parentId: coldCategory.id,
      name: rootCategory.name,
      code: rootCategory.code,
      sortOrder: rootCategory.sortOrder
    }),
    /döngü/i
  );
  assert.throws(
    () => deleteRuntimeCatalogCategory(databasePath, rootCategory.id),
    /alt kategori/i
  );
  assert.throws(
    () => saveRuntimeCatalogProduct(databasePath, {
      categoryId: "missing-category",
      name: "Geçersiz Kategorili Ürün",
      salePrice: 10
    }),
    /kategori/i
  );

  const product = saveRuntimeCatalogProduct(databasePath, {
    categoryId: coldCategory.id,
    name: "Runtime Test Ürünü",
    sku: "RT-001",
    barcode: "8690000000097",
    salePrice: 25,
    purchasePrice: 15,
    minimumQuantity: 2
  });
  assert.equal(product.categoryId, coldCategory.id);
  assert.throws(
    () => deleteRuntimeCatalogCategory(databasePath, coldCategory.id),
    /ürün bağlı/i
  );

  assert.deepEqual(
    listRuntimeCatalogProducts(databasePath, { search: "RT-001" }).map((item) => item.id),
    [product.id]
  );
  assert.deepEqual(
    listRuntimeCatalogProducts(databasePath, { categoryId: coldCategory.id }).map((item) => item.id),
    [product.id]
  );

  applyRuntimeInventoryMovement(databasePath, {
    productId: product.id,
    type: "purchase",
    quantityDelta: 10,
    unitCost: 15,
    referenceType: "runtime_smoke",
    referenceId: "purchase-1"
  });
  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 10);

  const firstCount = setRuntimeInventoryCount(databasePath, {
    productId: product.id,
    countedQuantity: 6,
    referenceId: "count-1"
  });
  assert.equal(firstCount.balance.quantity, 6);
  assert.equal(firstCount.movement?.type, "count");
  assert.equal(firstCount.movement?.quantityDelta, -4);
  assert.equal(firstCount.movement?.quantityAfter, 6);

  const unchangedCount = setRuntimeInventoryCount(databasePath, {
    productId: product.id,
    countedQuantity: 6,
    referenceId: "count-2"
  });
  assert.equal(unchangedCount.balance.quantity, 6);
  assert.equal(unchangedCount.movement, null, "Equal physical count must not emit a zero movement.");

  assert.equal(listRuntimeInventoryMovements(databasePath, { productId: product.id }).length, 2);

  const scanned = findRuntimeProductByBarcode(databasePath, " 8690000000097 ");
  assert.equal(scanned?.id, product.id);

  const sale = createRuntimePaidSale(databasePath, {
    paymentMethod: "cash",
    source: "runtime-smoke",
    items: [{ productId: product.id, quantity: 2 }]
  });
  assert.equal(sale.status, "paid");
  assert.equal(sale.total, 50);
  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 4);
  assert.equal(listRuntimeInventoryMovements(databasePath, { productId: product.id }).length, 3);

  const supplier = saveRuntimeSupplier(databasePath, {
    name: "Runtime Tedarikçi"
  });
  assert.equal(supplier.name, "Runtime Tedarikçi");
  assert.deepEqual(listRuntimeSuppliers(databasePath).map((item) => item.id), [supplier.id]);

  const receivedPurchase = receiveRuntimePurchase(databasePath, {
    supplierId: supplier.id,
    source: "runtime-purchase-smoke",
    items: [{ productId: product.id, quantity: 5, unitCost: 14 }]
  });
  assert.equal(receivedPurchase.order.status, "received");
  assert.equal(receivedPurchase.order.supplierId, supplier.id);
  assert.equal(receivedPurchase.order.total, 70);
  assert.equal(receivedPurchase.items.length, 1);
  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 9);
  assert.deepEqual(
    listRuntimePurchaseOrders(databasePath, { supplierId: supplier.id }).map((order) => order.id),
    [receivedPurchase.order.id]
  );
  assert.equal(getRuntimePurchaseOrder(databasePath, receivedPurchase.order.id)?.items.length, 1);
  assert.equal(listRuntimeInventoryMovements(databasePath, { productId: product.id }).length, 4);

  const snapshot = getCommerceRuntimeSnapshot(databasePath);
  assert.equal(snapshot.products.length, 1);
  assert.equal(snapshot.suppliers.length, 1);

  saveRuntimeCatalogProduct(databasePath, {
    id: product.id,
    categoryId: "",
    name: product.name,
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
    minimumQuantity: 2
  });
  assert.equal(deleteRuntimeCatalogCategory(databasePath, coldCategory.id).id, coldCategory.id);
  assert.equal(getRuntimeCatalogCategory(databasePath, coldCategory.id), null);
  assert.equal(deleteRuntimeCatalogCategory(databasePath, rootCategory.id).id, rootCategory.id);
  assert.equal(listRuntimeCatalogCategories(databasePath).length, 0);

  // Supplier capability owns supplier data access, but purchasing remains a
  // separate capability and can still receive an unsourced stock entry.
  setBusinessCapability(databasePath, {
    capability: "retail.suppliers",
    enabled: false
  });
  assert.equal(getCommerceRuntimeSnapshot(databasePath).products.length, 1);
  assert.equal(getCommerceRuntimeSnapshot(databasePath).suppliers.length, 0);
  assert.throws(() => listRuntimeSuppliers(databasePath), /tedarikçi/i);
  assert.throws(() => saveRuntimeSupplier(databasePath, { name: "Kapalı Tedarikçi" }), /tedarikçi/i);
  assert.throws(
    () => receiveRuntimePurchase(databasePath, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 1, unitCost: 13 }]
    }),
    /tedarikçi/i
  );
  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 9);

  const supplierlessPurchase = receiveRuntimePurchase(databasePath, {
    source: "runtime-purchase-smoke",
    items: [{ productId: product.id, quantity: 1, unitCost: 13 }]
  });
  assert.equal(supplierlessPurchase.order.supplierId, "");
  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 10);
  assert.equal(listRuntimePurchaseOrders(databasePath).length, 2);

  setBusinessCapability(databasePath, {
    capability: "retail.purchasing",
    enabled: false
  });
  assert.throws(() => listRuntimePurchaseOrders(databasePath), /satın alma/i);
  assert.throws(() => getRuntimePurchaseOrder(databasePath, receivedPurchase.order.id), /satın alma/i);
  assert.throws(
    () => receiveRuntimePurchase(databasePath, {
      items: [{ productId: product.id, quantity: 1, unitCost: 12 }]
    }),
    /satın alma/i
  );
  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 10);

  applyBusinessProfileCapabilities(databasePath, "pension", { preserveUserOverrides: false });
  assert.throws(
    () => getCommerceRuntimeSnapshot(databasePath),
    /ürün kataloğu/i
  );
  assert.throws(
    () => listRuntimeCatalogCategories(databasePath),
    /ürün kataloğu/i
  );
  assert.throws(
    () => saveRuntimeCatalogCategory(databasePath, { name: "Kapalı Kategori" }),
    /ürün kataloğu/i
  );
  assert.throws(
    () => listRuntimeCatalogProducts(databasePath),
    /ürün kataloğu/i
  );
  assert.throws(
    () => listRuntimeInventoryMovements(databasePath),
    /stok hareketleri/i
  );
  assert.throws(
    () => listRuntimePurchaseOrders(databasePath),
    /satın alma/i
  );

  console.log("commerce-runtime-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
