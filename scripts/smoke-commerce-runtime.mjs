import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { applyBusinessProfileCapabilities } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {
  applyRuntimeInventoryMovement,
  createRuntimePaidSale,
  findRuntimeProductByBarcode,
  getCommerceRuntimeSnapshot,
  getRuntimeInventoryBalance,
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

  // Restaurant profiles share the commerce core, but retail-only barcode and
  // supplier operations must stay unavailable until the retail capability set
  // is actually enabled.
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

  const scanned = findRuntimeProductByBarcode(databasePath, "8690000000097");
  assert.equal(scanned?.id, product.id);

  const sale = createRuntimePaidSale(databasePath, {
    paymentMethod: "cash",
    source: "runtime-smoke",
    items: [{ productId: product.id, quantity: 2 }]
  });
  assert.equal(sale.status, "paid");
  assert.equal(sale.total, 50);
  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 4);

  const supplier = saveRuntimeSupplier(databasePath, {
    name: "Runtime Tedarikçi"
  });
  assert.equal(supplier.name, "Runtime Tedarikçi");

  const snapshot = getCommerceRuntimeSnapshot(databasePath);
  assert.equal(snapshot.products.length, 1);
  assert.equal(snapshot.suppliers.length, 1);

  applyBusinessProfileCapabilities(databasePath, "pension", { preserveUserOverrides: false });
  assert.throws(
    () => saveRuntimeSupplier(databasePath, { name: "Kapalı Tedarikçi" }),
    /tedarikçi/i
  );
  assert.throws(
    () => getCommerceRuntimeSnapshot(databasePath),
    /ürün kataloğu/i
  );

  console.log("commerce-runtime-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
