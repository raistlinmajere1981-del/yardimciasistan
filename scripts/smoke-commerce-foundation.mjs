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
  const databasePath = database.databasePath;

  const product = saveCatalogProduct(databasePath, {
    name: "Test Süt 1L",
    sku: "SUT-1L",
    barcode: "8690000000011",
    salePrice: 42.5,
    purchasePrice: 31.25,
    currency: "TRY",
    unit: "piece",
    minimumQuantity: 3
  });
  assert.equal(product.name, "Test Süt 1L");
  assert.equal(product.barcode, "8690000000011");
  assert.equal(product.trackInventory, true);

  const secondProduct = saveCatalogProduct(databasePath, {
    name: "Test Yoğurt 500g",
    sku: "YOG-500",
    barcode: "8690000000012",
    salePrice: 30,
    purchasePrice: 20,
    minimumQuantity: 1
  });

  assert.deepEqual(
    listCatalogProducts(databasePath, { search: "SUT-1L" }).map((item) => item.id),
    [product.id],
    "Product search should include SKU."
  );
  assert.deepEqual(
    listCatalogProducts(databasePath, { search: "0000000012" }).map((item) => item.id),
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
  assert.equal(getInventoryBalance(databasePath, product.id).quantity, 5, "Failed sale must not mutate stock.");

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

    const unchangedMovement = raw.prepare(`
      SELECT COUNT(*) AS count
      FROM inventory_movements
      WHERE reference_id = 'count-2'
    `).get();
    assert.equal(Number(unchangedMovement?.count), 0, "Equal count must not leave an audit movement.");

    const saleCount = raw.prepare("SELECT COUNT(*) AS count FROM commerce_sales WHERE deleted_at = ''").get();
    assert.equal(Number(saleCount?.count), 1, "Failed sale must roll back its sale header too.");
  } finally {
    raw.close();
  }

  console.log("commerce-foundation-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
