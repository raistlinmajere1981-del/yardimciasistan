import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const {
  BUSINESS_CAPABILITIES: C,
  getBusinessProfile
} = require("../packages/shared/dist/index.js");
const {
  ANDROID_PERMISSIONS,
  ANDROID_PERMISSION_GROUP_PERMISSIONS,
  androidActionAllowedByCapabilities,
  androidAvailablePermissionGroupIds,
  androidEffectivePermissionsForGroups,
  androidEffectivePermissionsForRole,
  resolveAndroidActionPermission
} = require("../packages/sync-core/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  applyBusinessProfileCapabilities,
  setBusinessCapability
} = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {
  applyRuntimeInventoryMovement,
  createMarketCartDraft,
  createRuntimePaidSale,
  getMarketCartDraft,
  getRuntimeInventoryBalance,
  listMarketCartDrafts,
  listRuntimeInventoryMovements,
  saveRuntimeCatalogProduct,
  saveRuntimeSupplier
} = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const {
  createAndroidMarketSnapshotSource,
  emptyAndroidMarketSnapshot
} = require("../apps/desktop-app/dist-electron/market-android-snapshot.js");
const {
  projectAndroidMarketSnapshot
} = require("../apps/desktop-app/dist-electron/android-capability-projection.js");

const DEVICE_ID = "android-market-foundation-smoke";
const MARKET_PERMISSIONS = [
  "market.summary.view",
  "market.product.view",
  "market.stock_count",
  "market.receiving",
  "market.product_create",
  "market.cart_draft",
  "market.scan_to_desktop"
];
const MARKET_GROUPS = {
  service_orders: false,
  cashier: false,
  rooms_tasks: false,
  customer_reservation: false,
  market_operations: true
};

const marketCapabilities = getBusinessProfile("market").defaultCapabilities;
assert.deepEqual(androidAvailablePermissionGroupIds(marketCapabilities), ["market_operations"]);
assert.deepEqual(ANDROID_PERMISSION_GROUP_PERMISSIONS.market_operations, MARKET_PERMISSIONS);
assert.deepEqual(
  androidEffectivePermissionsForGroups(MARKET_GROUPS, marketCapabilities),
  MARKET_PERMISSIONS
);
for (const permission of [
  "room.view",
  "room_folio.view",
  "table.view",
  "table_order.view",
  "reservation.view",
  "menu.view",
  "menu.stock_view"
]) {
  assert.equal(
    androidEffectivePermissionsForGroups(MARKET_GROUPS, marketCapabilities).includes(permission),
    false,
    `${permission} saf Market izinlerine sızdı`
  );
}
for (const [actionType, permission] of [
  ["market_stock_count", "market.stock_count"],
  ["market_purchase_receive", "market.receiving"],
  ["market_product_create", "market.product_create"],
  ["market_cart_draft_create", "market.cart_draft"],
  ["market_barcode_scan", "market.scan_to_desktop"]
]) {
  assert.equal(resolveAndroidActionPermission(actionType), permission);
  assert.equal(androidActionAllowedByCapabilities(actionType, marketCapabilities), true);
}

const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-market-android-foundation-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});

try {
  database.initialize();
  const setupResult = database.saveInitialSetup({
    businessName: "Market Android Test İşletmesi",
    profileId: "market",
    phone: "+905550002015",
    whatsapp: "+905550002015",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "market-android-secret",
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
    productData: {
      enabled: true,
      provider: "open_food_facts",
      autoSearchUnknownBarcode: true,
      includeImages: true
    },
    servicePreferences: { whatsapp: true, android: true },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  applyBusinessProfileCapabilities(database.databasePath, "market", { preserveUserOverrides: false });
  database.upsertAndroidDeviceSightings([{
    device_id: DEVICE_ID,
    device_name: "Market El Terminali Smoke",
    app_version: "m7.1-smoke",
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString()
  }]);
  assert.equal(database.setAndroidDeviceActive(DEVICE_ID, true).ok, true);
  const initialGroupResult = database.setAndroidDevicePermissionGroups(DEVICE_ID, {
    service_orders: false,
    cashier: false,
    rooms_tasks: false,
    customer_reservation: false,
    market_operations: false
  });
  assert.equal(initialGroupResult.ok, true, initialGroupResult.message);
  assert.equal(
    initialGroupResult.devices.find((device) => device.deviceId === DEVICE_ID)
      ?.permissionGroups.market_operations,
    false
  );
  const groupResult = database.setAndroidDevicePermissionGroups(DEVICE_ID, MARKET_GROUPS);
  assert.equal(groupResult.ok, true, groupResult.message);
  const staffDevice = database.getAndroidDevices().find((device) => device.deviceId === DEVICE_ID);
  assert.ok(staffDevice);
  assert.deepEqual(staffDevice.permissionGroups, MARKET_GROUPS);
  assert.deepEqual(staffDevice.permissions, MARKET_PERMISSIONS);

  const sqlite = new DatabaseSync(database.databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  try {
    for (const table of [
      "commerce_sale_drafts",
      "commerce_sale_draft_items"
    ]) {
      assert.equal(
        scalar(sqlite, "SELECT COUNT(*) AS value FROM sqlite_master WHERE type = 'table' AND name = ?", table),
        1,
        `${table} migration tablosu bulunamadı`
      );
    }

    const product = saveRuntimeCatalogProduct(database.databasePath, {
      name: "M7.1 Sayım Ürünü",
      sku: "M71-COUNT",
      barcode: "8690000007101",
      salePrice: 20,
      purchasePrice: 11,
      currency: "TRY",
      unit: "piece",
      trackInventory: true,
      minimumQuantity: 2
    });
    const criticalProduct = saveRuntimeCatalogProduct(database.databasePath, {
      name: "M7.1 Kritik Ürün",
      sku: "M71-CRITICAL",
      barcode: "8690000007102",
      salePrice: 8,
      currency: "TRY",
      unit: "piece",
      trackInventory: true,
      minimumQuantity: 1
    });
    applyRuntimeInventoryMovement(database.databasePath, {
      productId: product.id,
      type: "purchase",
      quantityDelta: 12,
      unitCost: 11,
      referenceType: "market_android_smoke_seed",
      referenceId: "seed-12"
    });
    assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 12);

    const beforeCountMovements = movementCount(sqlite, product.id);
    const initialVersion = getRuntimeInventoryBalance(database.databasePath, product.id).updatedAt;
    const counted = database.applyAndroidAction(action("market-count-9", "market_stock_count", {
      product_id: product.id,
      counted_quantity: 9,
      expected_updated_at: initialVersion,
      note: "Raf fiziksel sayımı"
    }));
    assert.equal(counted.ok, true, counted.message);
    assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 9);
    const countMovement = listRuntimeInventoryMovements(database.databasePath, {
      productId: product.id,
      type: "count"
    })[0];
    assert.ok(countMovement);
    assert.equal(countMovement.quantityDelta, -3);
    assert.equal(countMovement.quantityAfter, 9);
    assert.equal(countMovement.referenceType, "android_market_stock_count");
    assert.equal(countMovement.referenceId, "market-count-9");
    assert.equal(countMovement.actorSource, "android");

    const duplicate = database.applyAndroidAction(action("market-count-9", "market_stock_count", {
      product_id: product.id,
      counted_quantity: 1
    }));
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.alreadyApplied, true);
    assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 9);
    assert.equal(movementCount(sqlite, product.id), beforeCountMovements + 1);

    const unchanged = database.applyAndroidAction(action("market-count-9-unchanged", "market_stock_count", {
      product_id: product.id,
      counted_quantity: 9,
      expected_updated_at: getRuntimeInventoryBalance(database.databasePath, product.id).updatedAt
    }));
    assert.equal(unchanged.ok, true, unchanged.message);
    assert.equal(movementCount(sqlite, product.id), beforeCountMovements + 1);
    assert.equal(receiptCount(sqlite, "market_stock_count"), 2);

    const stale = database.applyAndroidAction(action("market-count-stale", "market_stock_count", {
      product_id: product.id,
      counted_quantity: 8,
      expected_updated_at: initialVersion
    }));
    assert.equal(stale.ok, false);
    assert.match(stale.message, /değişti|güncel/i);
    assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 9);
    assert.equal(receiptById(sqlite, "market-count-stale"), 0);

    const supplier = saveRuntimeSupplier(database.databasePath, { name: "M7.1 Tedarikçi" });
    const purchasesBeforeInvalid = tableCount(sqlite, "purchase_orders");
    const itemsBeforeInvalid = tableCount(sqlite, "purchase_order_items");
    const movementsBeforeInvalid = movementCount(sqlite, product.id);
    const quantityBeforeInvalid = getRuntimeInventoryBalance(database.databasePath, product.id).quantity;
    const invalidReceiving = database.applyAndroidAction(action(
      "market-receive-invalid",
      "market_purchase_receive",
      {
        supplier_id: supplier.id,
        lines: [
          { product_id: product.id, quantity: 2, unit_cost: 10 },
          { product_id: "missing-product", quantity: 1, unit_cost: 5 }
        ]
      }
    ));
    assert.equal(invalidReceiving.ok, false);
    assert.equal(tableCount(sqlite, "purchase_orders"), purchasesBeforeInvalid);
    assert.equal(tableCount(sqlite, "purchase_order_items"), itemsBeforeInvalid);
    assert.equal(movementCount(sqlite, product.id), movementsBeforeInvalid);
    assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, quantityBeforeInvalid);
    assert.equal(receiptById(sqlite, "market-receive-invalid"), 0);

    const received = database.applyAndroidAction(action("market-receive-valid", "market_purchase_receive", {
      supplier_id: supplier.id,
      ordered_at: new Date().toISOString(),
      note: "Telefon mal kabulü",
      lines: [{ product_id: product.id, quantity: 4, unit_cost: 10 }]
    }));
    assert.equal(received.ok, true, received.message);
    assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, 13);
    assert.equal(tableCount(sqlite, "purchase_orders"), purchasesBeforeInvalid + 1);
    assert.equal(tableCount(sqlite, "purchase_order_items"), itemsBeforeInvalid + 1);
    assert.equal(
      scalar(sqlite, "SELECT COUNT(*) AS value FROM purchase_orders WHERE status = 'received' AND supplier_id = ?", supplier.id),
      1
    );
    assert.equal(
      scalar(sqlite, "SELECT COUNT(*) AS value FROM inventory_movements WHERE reference_type = 'purchase_order' AND actor_source = 'android'"),
      1
    );

    const productsBeforeCreate = activeProductCount(sqlite);
    const productCreateResult = database.applyAndroidAction(action(
      "market-product-create",
      "market_product_create",
      {
        barcode: "8690000007199",
        name: "Bilinmeyen Barkod Ürünü",
        brand: "Smoke Brand",
        sku: "M71-PHONE",
        category: "Atıştırmalık",
        purchase_price: 4.5,
        sale_price: 7.5,
        currency: "TRY",
        unit: "piece",
        track_inventory: true,
        note: "Ambalaj: 330 ml",
        image_source_url: "https://images.openfoodfacts.org/images/products/869/000/000/7199/front_tr.1.400.jpg",
        data_source: "open_food_facts",
        source_product_url: "https://world.openfoodfacts.org/product/8690000007199",
        data_license: "ODbL",
        image_license: "CC BY-SA",
        source_fetched_at: "2026-09-19T12:00:00.000Z"
      }
    ));
    assert.equal(productCreateResult.ok, true, productCreateResult.message);
    assert.equal(activeProductCount(sqlite), productsBeforeCreate + 1);
    const actionProduct = sqlite.prepare(`
      SELECT name, brand, sku, barcode, purchase_price, sale_price, unit, track_inventory,
             image_asset_path, image_source_url, data_source, source_product_url,
             data_license, image_license, source_fetched_at
      FROM catalog_products
      WHERE barcode = ? AND deleted_at = ''
      LIMIT 1
    `).get("8690000007199");
    assert.ok(actionProduct);
    assert.equal(actionProduct.name, "Bilinmeyen Barkod Ürünü");
    assert.equal(actionProduct.brand, "Smoke Brand");
    assert.equal(actionProduct.sku, "M71-PHONE");
    assert.equal(actionProduct.data_source, "open_food_facts");
    assert.equal(actionProduct.data_license, "ODbL");
    assert.equal(actionProduct.image_license, "CC BY-SA");
    assert.equal(actionProduct.image_asset_path, "");
    assert.match(String(actionProduct.image_source_url), /openfoodfacts\.org/);
    assert.equal(actionProduct.purchase_price, 4.5);
    assert.equal(actionProduct.sale_price, 7.5);
    assert.equal(actionProduct.unit, "piece");
    assert.equal(actionProduct.track_inventory, 1);
    assert.equal(receiptById(sqlite, "market-product-create"), 1);

    const duplicateProduct = database.applyAndroidAction(action(
      "market-product-create-duplicate",
      "market_product_create",
      {
        barcode: "8690000007199",
        name: "Tekrar Ürün",
        unit: "piece",
        track_inventory: true
      }
    ));
    assert.equal(duplicateProduct.ok, false);
    assert.match(duplicateProduct.message, /barkod.*kayıtlı/i);
    assert.equal(activeProductCount(sqlite), productsBeforeCreate + 1);
    assert.equal(receiptById(sqlite, "market-product-create-duplicate"), 0);

    const salesBeforeCart = tableCount(sqlite, "commerce_sales");
    const movementsBeforeCart = tableCount(sqlite, "inventory_movements");
    const financeBeforeCart = tableCount(sqlite, "finance_entries");
    const quantityBeforeCart = getRuntimeInventoryBalance(database.databasePath, product.id).quantity;
    const cartResult = database.applyAndroidAction(action("market-cart-draft", "market_cart_draft_create", {
      note: "Kasaya aktarılacak sepet",
      lines: [
        { product_id: product.id, quantity: 2 },
        { product_id: criticalProduct.id, quantity: 1 }
      ]
    }));
    assert.equal(cartResult.ok, true, cartResult.message);
    const actionCart = listMarketCartDrafts(database.databasePath)
      .find(({ draft }) => draft.createdByDevice === DEVICE_ID);
    assert.ok(actionCart);
    assert.equal(actionCart.draft.status, "pending");
    assert.equal(actionCart.draft.source, "android");
    assert.equal(actionCart.items.length, 2);
    assert.equal(getMarketCartDraft(database.databasePath, actionCart.draft.id)?.items.length, 2);
    assert.equal(tableCount(sqlite, "commerce_sales"), salesBeforeCart);
    assert.equal(tableCount(sqlite, "inventory_movements"), movementsBeforeCart);
    assert.equal(tableCount(sqlite, "finance_entries"), financeBeforeCart);
    assert.equal(getRuntimeInventoryBalance(database.databasePath, product.id).quantity, quantityBeforeCart);

    const directCartDraft = createMarketCartDraft(database.databasePath, {
      lines: [{ productId: product.id, quantity: 1 }],
      note: "Runtime helper sözleşmesi"
    });
    assert.equal(getMarketCartDraft(database.databasePath, directCartDraft.draft.id)?.items.length, 1);

    createRuntimePaidSale(database.databasePath, {
      paymentMethod: "cash",
      source: "market-android-foundation-smoke",
      items: [{ productId: product.id, quantity: 1 }]
    });
    const today = String(sqlite.prepare("SELECT date('now', 'localtime') AS today").get().today);
    const sourceSnapshot = createAndroidMarketSnapshotSource(database.databasePath, today);
    assert.equal(sourceSnapshot.product_data.enabled, true);
    assert.equal(sourceSnapshot.product_data.provider, "open_food_facts");
    assert.equal(sourceSnapshot.product_data.auto_search_unknown_barcode, true);
    assert.equal(sourceSnapshot.product_data.include_images, true);
    assert.equal(sourceSnapshot.summary.today_sale_count, 1);
    assert.equal(sourceSnapshot.summary.today_sales_total, 20);
    assert.equal(sourceSnapshot.summary.critical_stock_count >= 1, true);
    assert.equal(sourceSnapshot.summary.recent_stock_adjustments.some((item) => item.quantity_delta === -3), true);
    assert.equal(sourceSnapshot.summary.recent_receiving_count, 1);
    assert.equal(sourceSnapshot.recent_purchases.length, 1);
    assert.equal(sourceSnapshot.recent_purchases[0].status, "received");
    assert.equal("pending" in sourceSnapshot.recent_purchases[0], false);
    assert.equal(sourceSnapshot.cart_drafts.length, 2);

    const projectedProduct = sourceSnapshot.products.find((item) => item.id === product.id);
    assert.ok(projectedProduct);
    assert.deepEqual(Object.keys(projectedProduct).sort(), [
      "barcode",
      "currency",
      "current_quantity",
      "data_source",
      "id",
      "image_source_url",
      "inventory_updated_at",
      "is_active",
      "minimum_quantity",
      "name",
      "sale_price",
      "sku",
      "track_inventory",
      "unit"
    ]);
    assert.equal("purchase_price" in projectedProduct, false);
    assert.equal("description" in projectedProduct, false);

    const fullProjection = projectAndroidMarketSnapshot(sourceSnapshot, new Set(marketCapabilities));
    assert.equal(fullProjection.product_data.enabled, true);
    assert.equal(fullProjection.product_data.provider, "open_food_facts");
    assert.equal(fullProjection.products.find((item) => item.id === product.id)?.barcode, product.barcode);
    assert.equal(fullProjection.suppliers.length, 1);
    assert.equal(fullProjection.recent_purchases.length, 1);

    const withoutCatalog = projectAndroidMarketSnapshot(
      sourceSnapshot,
      capabilitySetWithout(C.CATALOG)
    );
    assert.equal(withoutCatalog.product_data.enabled, false);
    assert.deepEqual(withoutCatalog.products, []);

    const withoutBarcode = projectAndroidMarketSnapshot(
      sourceSnapshot,
      capabilitySetWithout(C.RETAIL_BARCODE)
    );
    assert.equal(withoutBarcode.products.every((item) => item.barcode === ""), true);

    const withoutSuppliers = projectAndroidMarketSnapshot(
      sourceSnapshot,
      capabilitySetWithout(C.RETAIL_SUPPLIERS)
    );
    assert.deepEqual(withoutSuppliers.suppliers, []);
    assert.equal(withoutSuppliers.recent_purchases.length, 1);
    assert.equal(withoutSuppliers.recent_purchases[0].supplier_id, "");
    assert.equal(withoutSuppliers.recent_purchases[0].supplier_name, "");

    const withoutPurchasing = projectAndroidMarketSnapshot(
      sourceSnapshot,
      capabilitySetWithout(C.RETAIL_PURCHASING)
    );
    assert.deepEqual(withoutPurchasing.recent_purchases, []);
    assert.equal(withoutPurchasing.summary.recent_receiving_count, 0);

    const withoutInventory = projectAndroidMarketSnapshot(
      sourceSnapshot,
      capabilitySetWithout(C.INVENTORY, C.RETAIL_PURCHASING)
    );
    assert.equal(withoutInventory.summary.critical_stock_count, 0);
    assert.deepEqual(withoutInventory.summary.recent_stock_adjustments, []);
    assert.equal(withoutInventory.products.every((item) => (
      item.track_inventory === false
        && item.current_quantity === 0
        && item.minimum_quantity === 0
        && item.inventory_updated_at === ""
    )), true);

    const withoutSales = projectAndroidMarketSnapshot(
      sourceSnapshot,
      capabilitySetWithout(C.SALES)
    );
    assert.equal(withoutSales.summary.today_sale_count, 0);
    assert.equal(withoutSales.summary.today_sales_total, 0);
    assert.deepEqual(withoutSales.cart_drafts, []);
    assert.deepEqual(
      projectAndroidMarketSnapshot(sourceSnapshot, new Set(marketCapabilities.filter((capability) => capability !== C.ANDROID))),
      emptyAndroidMarketSnapshot("TRY")
    );

    assert.equal(database.setAndroidDeviceRole(DEVICE_ID, "admin").ok, true);
    setBusinessCapability(database.databasePath, {
      capability: C.RETAIL_PURCHASING,
      enabled: false
    });
    const adminPermissions = database.getAndroidDevices()
      .find((device) => device.deviceId === DEVICE_ID)?.permissions ?? [];
    assert.equal(adminPermissions.includes("market.receiving"), false);
    assert.equal(
      androidEffectivePermissionsForRole(
        "admin",
        ANDROID_PERMISSIONS,
        marketCapabilities.filter((capability) => capability !== C.RETAIL_PURCHASING)
      ).includes("market.receiving"),
      false
    );
    const purchasesBeforeDeniedAdmin = tableCount(sqlite, "purchase_orders");
    const deniedAdmin = database.applyAndroidAction(action("market-admin-closed-capability", "market_purchase_receive", {
      supplier_id: supplier.id,
      lines: [{ product_id: product.id, quantity: 1, unit_cost: 9 }]
    }));
    assert.equal(deniedAdmin.ok, false);
    assert.match(deniedAdmin.message, /etkin yetenek/i);
    assert.equal(tableCount(sqlite, "purchase_orders"), purchasesBeforeDeniedAdmin);
    assert.equal(receiptById(sqlite, "market-admin-closed-capability"), 0);

    assertCurrentMarketGate();
    assertMirroredTransportContracts();
    assert.equal(String(sqlite.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    sqlite.close();
  }

  console.log(
    "market-android-foundation-smoke-ok: permissions, capabilities, stock count, receiving, direct product create, phone carts, snapshot redaction and runtime gates verified"
  );
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}

function action(id, actionType, payload) {
  return {
    id,
    action_type: actionType,
    payload,
    created_at: new Date().toISOString(),
    device_id: DEVICE_ID,
    device_name: "Market El Terminali Smoke",
    app_version: "m7.1-smoke",
    status: "pending",
    error_message: ""
  };
}

function scalar(sqlite, sql, ...parameters) {
  return Number(sqlite.prepare(sql).get(...parameters)?.value ?? 0);
}

function tableCount(sqlite, table) {
  assert.match(table, /^[a-z_]+$/);
  return scalar(sqlite, `SELECT COUNT(*) AS value FROM ${table}`);
}

function activeProductCount(sqlite) {
  return scalar(sqlite, "SELECT COUNT(*) AS value FROM catalog_products WHERE deleted_at = ''");
}

function movementCount(sqlite, productId) {
  return scalar(sqlite, "SELECT COUNT(*) AS value FROM inventory_movements WHERE product_id = ?", productId);
}

function receiptCount(sqlite, actionType) {
  return scalar(sqlite, "SELECT COUNT(*) AS value FROM android_action_receipts WHERE action_type = ?", actionType);
}

function receiptById(sqlite, id) {
  return scalar(sqlite, "SELECT COUNT(*) AS value FROM android_action_receipts WHERE id = ?", id);
}

function capabilitySetWithout(...removed) {
  const blocked = new Set(removed);
  return new Set(marketCapabilities.filter((capability) => !blocked.has(capability)));
}

function assertCurrentMarketGate() {
  const forbidden = /business(?:Type|_type)|modules_json|rooms_enabled|tables_enabled|qr_menu_enabled/;
  for (const relativePath of [
    "apps/desktop-app/electron/market-android-actions.ts",
    "apps/desktop-app/electron/market-android-snapshot.ts",
    "apps/desktop-app/electron/market-companion-runtime.ts",
    "apps/desktop-app/electron/market-companion-store.ts",
    "apps/desktop-app/db/migrations/001_baseline.sql"
  ]) {
    assert.doesNotMatch(readFileSync(join(process.cwd(), relativePath), "utf8"), forbidden, relativePath);
  }
}

function assertMirroredTransportContracts() {
  const hosting = readFileSync(
    join(process.cwd(), "firm-template/web-module/api/sync.php"),
    "utf8"
  );
  const android = readFileSync(
    join(
      process.cwd(),
      "apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java"
    ),
    "utf8"
  );
  for (const [actionType, permission] of [
    ["market_stock_count", "market.stock_count"],
    ["market_purchase_receive", "market.receiving"],
    ["market_product_create", "market.product_create"],
    ["market_cart_draft_create", "market.cart_draft"],
    ["market_barcode_scan", "market.scan_to_desktop"]
  ]) {
    assert.match(hosting, new RegExp(`'${actionType}'\\s*=>\\s*'${permission.replace(".", "\\.")}'`));
  }
  assert.match(hosting, /ya_sync_sanitize_android_market\(\$snapshot\['market'\]/);
  assert.match(hosting, /ya_sync_android_market_for_permissions/);
  assert.match(hosting, /'product_data'/);
  assert.match(android, /data\.market\s*=\s*MarketSnapshot\.fromJson\(object\(root, "market"\)\)/);
  assert.match(android, /MarketProductDataSettings/);
  for (const permission of MARKET_PERMISSIONS) {
    assert.equal(android.includes(`"${permission}"`), true, `${permission} Android parser listesinde yok`);
  }
}
