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
  getCommerceStoreSnapshot,
  getInventoryBalance,
  saveCatalogProduct,
  saveCommerceSupplier
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

  const startingBalance = getInventoryBalance(databasePath, product.id);
  assert.equal(startingBalance.quantity, 0);
  assert.equal(startingBalance.minimumQuantity, 3);

  const purchaseMovement = applyInventoryMovement(databasePath, {
    productId: product.id,
    type: "purchase",
    quantityDelta: 10,
    unitCost: 31.25,
    referenceType: "smoke_purchase",
    referenceId: "purchase-1"
  });
  assert.equal(purchaseMovement.quantityAfter, 10);

  const sale = createPaidCommerceSale(databasePath, {
    paymentMethod: "cash",
    source: "smoke",
    items: [{ productId: product.id, quantity: 2 }]
  });
  assert.equal(sale.status, "paid");
  assert.equal(sale.subtotal, 85);
  assert.equal(sale.total, 85);

  const afterSale = getInventoryBalance(databasePath, product.id);
  assert.equal(afterSale.quantity, 8);

  const supplier = saveCommerceSupplier(databasePath, {
    name: "Test Tedarikçi",
    phone: "+905551112233",
    taxNumber: "1234567890"
  });
  assert.equal(supplier.name, "Test Tedarikçi");

  const snapshot = getCommerceStoreSnapshot(databasePath);
  assert.equal(snapshot.products.length, 1);
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
  assert.equal(getInventoryBalance(databasePath, product.id).quantity, 8, "Failed sale must not mutate stock.");

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
    assert.equal(Number(saleMovement?.quantity_after), 8);

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
