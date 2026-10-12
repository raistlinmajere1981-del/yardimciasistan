import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { verifyMarketBarcodeFastPullLifecycle } from "./test-helpers/market-barcode-fast-pull.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C, getBusinessProfile } = require("../packages/shared/dist/index.js");
const {
  ANDROID_PERMISSION_GROUP_PERMISSIONS,
  androidActionAllowedByCapabilities,
  androidEffectivePermissionsForGroups,
  resolveAndroidActionPermission
} = require("../packages/sync-core/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { applyBusinessProfileCapabilities, setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {
  applyRuntimeInventoryMovement,
  consumePendingMarketBarcodeScans,
  findRuntimeProductByBarcode,
  getRuntimeInventoryBalance,
  saveRuntimeCatalogProduct
} = require("../apps/desktop-app/dist-electron/commerce-runtime.js");

const DEVICE_ID = "android-live-scanner-smoke";
const MARKET_GROUPS = {
  service_orders: false,
  cashier: false,
  rooms_tasks: false,
  customer_reservation: false,
  market_operations: true
};
const marketCapabilities = getBusinessProfile("market").defaultCapabilities;
// ANDROID is opt-in since the sector feature selection simplification.
const marketCapabilitiesWithAndroid = [...marketCapabilities, C.ANDROID];
verifyMarketBarcodeFastPullLifecycle();

assert.equal(ANDROID_PERMISSION_GROUP_PERMISSIONS.market_operations.includes("market.scan_to_desktop"), true);
assert.equal(androidEffectivePermissionsForGroups(MARKET_GROUPS, marketCapabilitiesWithAndroid).includes("market.scan_to_desktop"), true);
assert.equal(resolveAndroidActionPermission("market_barcode_scan"), "market.scan_to_desktop");
assert.equal(androidActionAllowedByCapabilities("market_barcode_scan", marketCapabilitiesWithAndroid), true);
for (const missing of [C.CATALOG, C.SALES, C.RETAIL_BARCODE]) {
  assert.equal(
    androidActionAllowedByCapabilities(
      "market_barcode_scan",
      marketCapabilitiesWithAndroid.filter((capability) => capability !== missing)
    ),
    false,
    `market_barcode_scan must require ${missing}`
  );
}

const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-market-live-scanner-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});

try {
  database.initialize();
  const setupResult = database.saveInitialSetup({
    businessName: "Market Tarayıcı Test İşletmesi",
    profileId: "market",
    phone: "+905550002017",
    whatsapp: "+905550002017",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "live-scanner-secret",
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
  applyBusinessProfileCapabilities(database.databasePath, "market", { preserveUserOverrides: false });
  // ANDROID is opt-in since the sector feature selection simplification.
  setBusinessCapability(database.databasePath, { capability: "service.android", enabled: true });
  database.upsertAndroidDeviceSightings([{
    device_id: DEVICE_ID,
    device_name: "Kasa Barkod Telefonu",
    app_version: "m7.3-smoke",
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString()
  }]);
  assert.equal(database.setAndroidDeviceActive(DEVICE_ID, true).ok, true);
  assert.equal(database.setAndroidDevicePermissionGroups(DEVICE_ID, MARKET_GROUPS).ok, true);

  const sqlite = new DatabaseSync(database.databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  try {
    assert.equal(tableCount(sqlite, "market_barcode_scan_events"), 0);
    assert.equal(
      scalar(sqlite, "SELECT COUNT(*) AS value FROM sqlite_master WHERE type = 'table' AND name = 'market_barcode_scan_events'"),
      1
    );

    const product = saveRuntimeCatalogProduct(database.databasePath, {
      name: "Canlı Tarama Ürünü",
      sku: "LIVE-SCAN-1",
      barcode: "8690000007301",
      salePrice: 42,
      purchasePrice: 20,
      currency: "TRY",
      unit: "piece",
      trackInventory: true,
      minimumQuantity: 1
    });
    applyRuntimeInventoryMovement(database.databasePath, {
      productId: product.id,
      type: "purchase",
      quantityDelta: 10,
      unitCost: 20,
      referenceType: "live_scanner_smoke_seed",
      referenceId: "seed"
    });

    const before = financialState(sqlite, database.databasePath, product.id);
    const staleResult = database.applyAndroidAction(scanAction(
      "live-scan-stale",
      product.barcode,
      new Date(Date.now() - 61_000).toISOString()
    ));
    assert.equal(staleResult.ok, true, staleResult.message);
    assert.match(staleResult.message, /zaman aşımına/i);
    assert.equal(tableCount(sqlite, "market_barcode_scan_events"), 0);
    assert.equal(receiptCount(sqlite, "live-scan-stale"), 1);
    assert.deepEqual(financialState(sqlite, database.databasePath, product.id), before);

    const freshResult = database.applyAndroidAction(scanAction(
      "live-scan-fresh",
      product.barcode,
      new Date().toISOString()
    ));
    assert.equal(freshResult.ok, true, freshResult.message);
    assert.equal(tableCount(sqlite, "market_barcode_scan_events"), 1);
    assert.equal(pendingScanCount(sqlite), 1);
    assert.deepEqual(financialState(sqlite, database.databasePath, product.id), before);

    const duplicate = database.applyAndroidAction(scanAction(
      "live-scan-fresh",
      product.barcode,
      new Date().toISOString()
    ));
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.alreadyApplied, true);
    assert.equal(tableCount(sqlite, "market_barcode_scan_events"), 1);

    const firstConsume = consumePendingMarketBarcodeScans(database.databasePath);
    assert.equal(firstConsume.length, 1);
    assert.equal(firstConsume[0].barcode, product.barcode);
    assert.equal(firstConsume[0].deviceId, DEVICE_ID);
    assert.equal(firstConsume[0].status, "consumed");
    assert.deepEqual(consumePendingMarketBarcodeScans(database.databasePath), []);

    assert.equal(database.applyAndroidAction(scanAction("live-scan-two-a", product.barcode, new Date().toISOString())).ok, true);
    assert.equal(database.applyAndroidAction(scanAction("live-scan-two-b", product.barcode, new Date().toISOString())).ok, true);
    const repeated = consumePendingMarketBarcodeScans(database.databasePath);
    assert.equal(repeated.length, 2);
    const simulatedCartQuantity = repeated.reduce((quantity, event) => (
      event.barcode === product.barcode ? quantity + 1 : quantity
    ), 0);
    assert.equal(simulatedCartQuantity, 2);

    const unknownBarcode = "8699999997301";
    assert.equal(database.applyAndroidAction(scanAction("live-scan-unknown", unknownBarcode, new Date().toISOString())).ok, true);
    const unknown = consumePendingMarketBarcodeScans(database.databasePath);
    assert.equal(unknown.length, 1);
    assert.equal(findRuntimeProductByBarcode(database.databasePath, unknown[0].barcode), null);
    assert.equal(scalar(sqlite, "SELECT COUNT(*) AS value FROM catalog_products WHERE barcode = ?", unknownBarcode), 0);
    assert.deepEqual(financialState(sqlite, database.databasePath, product.id), before);

    // A once-fresh event that waits in SQLite must also expire before renderer consumption.
    assert.equal(database.applyAndroidAction(scanAction("live-scan-waits", product.barcode, new Date().toISOString())).ok, true);
    sqlite.prepare(`
      UPDATE market_barcode_scan_events
      SET scanned_at = ?
      WHERE android_action_id = 'live-scan-waits'
    `).run(new Date(Date.now() - 61_000).toISOString());
    assert.deepEqual(consumePendingMarketBarcodeScans(database.databasePath), []);
    assert.equal(
      scalar(sqlite, "SELECT COUNT(*) AS value FROM market_barcode_scan_events WHERE android_action_id = 'live-scan-waits' AND status = 'expired'"),
      1
    );

    const unauthorized = database.applyAndroidAction({
      ...scanAction("live-scan-unregistered-device", product.barcode, new Date().toISOString()),
      device_id: "unregistered-device"
    });
    assert.equal(unauthorized.ok, false);
  } finally {
    sqlite.close();
  }

  assertSourceContracts();
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}

console.log("market-live-scanner-contract-smoke-ok");

function scanAction(id, barcode, scannedAt) {
  return {
    id,
    action_type: "market_barcode_scan",
    payload: { barcode, scanned_at: scannedAt },
    created_at: scannedAt,
    device_id: DEVICE_ID,
    device_name: "Kasa Barkod Telefonu",
    app_version: "m7.3-smoke",
    last_seen_at: new Date().toISOString(),
    status: "pending",
    error_message: ""
  };
}

function financialState(sqlite, databasePath, productId) {
  return {
    sales: tableCount(sqlite, "commerce_sales"),
    saleItems: tableCount(sqlite, "commerce_sale_items"),
    movements: tableCount(sqlite, "inventory_movements"),
    finance: tableCount(sqlite, "finance_entries"),
    cartDrafts: tableCount(sqlite, "commerce_sale_drafts"),
    quantity: getRuntimeInventoryBalance(databasePath, productId).quantity
  };
}

function tableCount(sqlite, table) {
  return Number(sqlite.prepare(`SELECT COUNT(*) AS value FROM ${table}`).get().value ?? 0);
}

function pendingScanCount(sqlite) {
  return Number(sqlite.prepare("SELECT COUNT(*) AS value FROM market_barcode_scan_events WHERE status = 'pending'").get().value ?? 0);
}

function receiptCount(sqlite, actionId) {
  return scalar(sqlite, "SELECT COUNT(*) AS value FROM android_action_receipts WHERE id = ?", actionId);
}

function scalar(sqlite, sql, ...parameters) {
  return Number(sqlite.prepare(sql).get(...parameters)?.value ?? 0);
}

function assertSourceContracts() {
  const read = (relativePath) => readFileSync(join(process.cwd(), relativePath), "utf8");
  const androidAction = read("apps/desktop-app/electron/market-android-actions.ts");
  const quickSale = read("apps/desktop-app/src/components/market/MarketQuickSaleWorkspace.tsx");
  const androidRules = read("apps/android-app/src/main/java/com/yardimciasistan/android/MarketUiRules.java");
  const androidWorkspace = read("apps/android-app/src/main/java/com/yardimciasistan/android/MarketWorkspace.java");
  const syncCoordinator = read("apps/desktop-app/electron/sync-coordinator.ts");
  const hosting = read("firm-template/web-module/api/sync.php");

  assert.match(androidAction, /createMarketBarcodeScanEventInTransaction/);
  assert.doesNotMatch(androidAction, /createRuntimePaidSale|createPaidCommerceSale|applyInventoryMovement|createMarketCartDraftInTransaction[\s\S]{0,120}applyBarcodeScan/);
  assert.match(quickSale, /consumePendingBarcodeScans/);
  assert.match(quickSale, /findProductByBarcode/);
  assert.match(quickSale, /aria-label="Telefon barkod kanalı"/);
  assert.match(quickSale, /setBarcodeScanMode\(true\)/);
  assert.doesNotMatch(quickSale, /setPhoneBarcodeMode|Telefon Barkod Modunu Aç/);
  assert.match(androidRules, /market_barcode_scan/);
  assert.match(androidRules, /scanned_at/);
  assert.match(androidWorkspace, /KASA BARKOD MODU/);
  assert.match(androidWorkspace, /BarcodeCameraScanner\.show/);
  assert.doesNotMatch(androidWorkspace, /KASA BARKOD MODU[\s\S]{0,900}Sepete Ekle/);
  assert.match(syncCoordinator, /NORMAL_PULL_INTERVAL_MS\s*=\s*15_000/);
  assert.match(syncCoordinator, /MARKET_BARCODE_FAST_PULL_INTERVAL_MS\s*=\s*1_500/);
  assert.match(syncCoordinator, /this\.inFlight/);
  assert.match(hosting, /'market_barcode_scan'\s*=>\s*'market\.scan_to_desktop'/);
}
