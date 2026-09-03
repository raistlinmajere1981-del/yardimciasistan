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
  findRuntimeProductByBarcode,
  getCommerceRuntimeSnapshot,
  getRuntimeInventoryBalance,
  listRuntimeCatalogProducts,
  listRuntimeInventoryMovements,
  listRuntimeSuppliers,
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
  const databasePath = database.databasePath;

  // Restaurant profiles share some commerce concepts, but retail-only barcode
  // and supplier operations stay unavailable until persisted retail capabilities
  // are explicitly enabled.
  assert.throws(
    () => findRuntimeProductByBarcode(databasePath, "8690000000097"),
    /barkod/i
  );

  applyBusinessProfileCapabilities(databasePath, "market", { preserveUserOverrides: false });

  const product = saveRuntimeCatalogProduct(databasePath, {
    name: "Runtime Test Ürünü",
    sku: "RT-001",
    barcode: "8690000000097",
    salePrice: 25,
    purchasePrice: 15,
    minimumQuantity: 2
  });

  assert.deepEqual(
    listRuntimeCatalogProducts(databasePath, { search: "RT-001" }).map((item) => item.id),
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

  const snapshot = getCommerceRuntimeSnapshot(databasePath);
  assert.equal(snapshot.products.length, 1);
  assert.equal(snapshot.suppliers.length, 1);

  // Snapshot is catalog-oriented; supplier data must not leak when only the
  // supplier capability is disabled while catalog remains available.
  setBusinessCapability(databasePath, {
    capability: "retail.suppliers",
    enabled: false
  });
  assert.equal(getCommerceRuntimeSnapshot(databasePath).products.length, 1);
  assert.equal(getCommerceRuntimeSnapshot(databasePath).suppliers.length, 0);
  assert.throws(() => listRuntimeSuppliers(databasePath), /tedarikçi/i);
  assert.throws(() => saveRuntimeSupplier(databasePath, { name: "Kapalı Tedarikçi" }), /tedarikçi/i);

  applyBusinessProfileCapabilities(databasePath, "pension", { preserveUserOverrides: false });
  assert.throws(
    () => getCommerceRuntimeSnapshot(databasePath),
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

  console.log("commerce-runtime-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
