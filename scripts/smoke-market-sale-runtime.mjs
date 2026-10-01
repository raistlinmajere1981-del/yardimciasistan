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
  getRuntimeInventoryBalance,
  listRuntimeInventoryMovements,
  saveRuntimeCatalogProduct
} = require("../apps/desktop-app/dist-electron/commerce-runtime.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-market-sale-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();
  const setupResult = database.saveInitialSetup({
    businessName: "Market Satış Test İşletmesi",
    profileId: "market",
    phone: "+905550002011",
    whatsapp: "+905550002011",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "market-sale-secret",
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
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  const databasePath = database.databasePath;
  applyBusinessProfileCapabilities(databasePath, "market", { preserveUserOverrides: false });

  const product = saveRuntimeCatalogProduct(databasePath, {
    name: "Hızlı Satış Test Ürünü",
    sku: "SALE-001",
    salePrice: 25,
    purchasePrice: 15,
    minimumQuantity: 0
  });
  applyRuntimeInventoryMovement(databasePath, {
    productId: product.id,
    type: "purchase",
    quantityDelta: 1,
    unitCost: 15,
    referenceType: "market_sale_smoke",
    referenceId: "stock-in"
  });

  const movementsBeforeFailedSale = listRuntimeInventoryMovements(databasePath, { productId: product.id }).length;
  assert.throws(
    () => createRuntimePaidSale(databasePath, {
      source: "market-sale-smoke",
      items: [{ productId: product.id, quantity: 2 }]
    }),
    /yetersiz stok/i
  );
  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 1);
  assert.equal(
    listRuntimeInventoryMovements(databasePath, { productId: product.id }).length,
    movementsBeforeFailedSale,
    "Failed sale must not leave a partial inventory movement."
  );

  const sale = createRuntimePaidSale(databasePath, {
    paymentMethod: "card",
    source: "market-sale-smoke",
    discountTotal: 5,
    items: [{ productId: product.id, quantity: 1, salePrice: 1 }]
  });
  assert.equal(sale.subtotal, 25, "Backend must use the persisted catalog price, not renderer-authored price fields.");
  assert.equal(sale.discountTotal, 5);
  assert.equal(sale.total, 20);
  assert.equal(sale.paymentMethod, "card");
  assert.equal(getRuntimeInventoryBalance(databasePath, product.id).quantity, 0);

  const movementsBeforeInventoryDisabledSale = listRuntimeInventoryMovements(databasePath, { productId: product.id }).length;
  setBusinessCapability(databasePath, { capability: "commerce.inventory", enabled: false });
  const saleWithoutInventory = createRuntimePaidSale(databasePath, {
    paymentMethod: "cash",
    source: "market-sale-no-inventory-smoke",
    items: [{ productId: product.id, quantity: 3 }]
  });
  assert.equal(saleWithoutInventory.status, "paid");
  assert.equal(saleWithoutInventory.total, 75);
  setBusinessCapability(databasePath, { capability: "commerce.inventory", enabled: true });
  assert.equal(
    getRuntimeInventoryBalance(databasePath, product.id).quantity,
    0,
    "Disabling inventory must preserve the stored balance while allowing the sale."
  );
  assert.equal(
    listRuntimeInventoryMovements(databasePath, { productId: product.id }).length,
    movementsBeforeInventoryDisabledSale,
    "Sales made while inventory is disabled must not create stock movements."
  );

  setBusinessCapability(databasePath, { capability: "commerce.customer_credit", enabled: false });
  setBusinessCapability(databasePath, { capability: "commerce.sales", enabled: false });
  assert.throws(
    () => createRuntimePaidSale(databasePath, {
      items: [{ productId: product.id, quantity: 1 }]
    }),
    /satış/i
  );

  console.log("market-sale-runtime-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
