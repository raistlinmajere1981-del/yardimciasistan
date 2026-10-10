import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C, getBusinessProfile, expandBusinessCapabilities } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { completeMarketSale } = require("../apps/desktop-app/dist-electron/market-sale-operation.js");
const { saveRuntimeCatalogProduct, listRuntimeCatalogProducts, saveRuntimeCatalogCategory, listRuntimeCatalogCategories, setRuntimeInventoryCount, getRuntimeInventoryBalance, listRuntimeInventoryMovements, getCustomerCreditAccount } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { reorderCatalogRecords, setCatalogProductQuickAccess } = require("../apps/desktop-app/dist-electron/commerce-catalog-presentation-store.js");
const { applyBusinessProfileCapabilities, setBusinessCapability, readBusinessCapabilitySnapshot } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
let buildNavigation;
const failures = [];
const check = (name, operation) => { try { operation(); } catch (error) { failures.push(`${name}: ${error.message}`); } };
const server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), server: { middlewareMode: true } });
try {
  ({ buildNavigation } = await server.ssrLoadModule("/src/app/navigation.ts"));
  const sales = (enabledCapabilities) => buildNavigation({ enabledCapabilities }).some(item => item.id === "market");
  check("hospitality-only", () => assert.equal(sales([C.FOOD_MENU, C.FOOD_TABLES, C.ACCOMMODATION_ROOMS]), false));
  check("shared commerce foundations cannot grant Sales entry", () => assert.equal(sales([C.CATALOG, C.SALES, C.INVENTORY]), false));
  check("inventory alone cannot grant Sales entry", () => assert.equal(sales(expandBusinessCapabilities([C.INVENTORY])), false));
  for (const profileId of ["pension", "restaurant", "pension_restaurant"]) {
    check(`${profileId} canonical defaults + inventory`, () => assert.equal(
      sales(expandBusinessCapabilities([...getBusinessProfile(profileId).defaultCapabilities, C.INVENTORY])), false));
  }
  check("retail", () => assert.equal(sales(getBusinessProfile("market").defaultCapabilities), true));
  check("retail without barcode retains purchasing/supplier surfaces", () => assert.equal(
    sales(getBusinessProfile("market").defaultCapabilities.filter(capability => capability !== C.RETAIL_BARCODE)), true));
  check("wholesale", () => assert.equal(sales(expandBusinessCapabilities([C.WHOLESALE])), true));
  for (const capability of [C.RETAIL_BARCODE, C.RETAIL_PURCHASING, C.RETAIL_SUPPLIERS, C.RETAIL_LABELS]) {
    check(`${capability} with catalog grants an actual retail surface`, () => assert.equal(sales(expandBusinessCapabilities([C.CATALOG, capability])), true));
  }
  check("online channel alone cannot grant Sales entry", () => assert.equal(sales(expandBusinessCapabilities([C.ONLINE_SALES])), false));
  for (const profileId of ["restaurant", "pension_restaurant", "market"]) {
    check(`${profileId} + Online Sales navigation`, () => {
      const enabledCapabilities = expandBusinessCapabilities([...getBusinessProfile(profileId).defaultCapabilities, C.ONLINE_SALES]);
      const navigation = buildNavigation({ profileId, enabledCapabilities });
      assert.equal(navigation.some(item => item.id === "market"), profileId === "market");
      assert.equal(navigation.some(item => item.id === "menu"), profileId !== "market");
    });
  }
  check("shared catalog/products alone cannot grant Sales entry", () => assert.equal(sales([C.CATALOG]), false));
  check("orders without the implemented wholesale/channel surfaces cannot grant entry", () => assert.equal(sales([C.CATALOG, C.ORDERS]), false));
  check("stale tools cannot expose inaccessible Sales", () => assert.equal(sales([C.RETAIL_LABELS, C.RETAIL_SUPPLIERS]), false));
  check("runtime removal", () => assert.equal(sales([]), false));
} finally { await server.close(); }

const dataDir = mkdtempSync(join(tmpdir(), "sales-correctness-"));
const database = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: dataDir });
try {
  database.initialize();
  const setup = database.saveInitialSetup({ businessName: "Sales correctness", profileId: "market", profileOptions: [C.WHOLESALE],
    phone: "", whatsapp: "", email: "", address: "", webModuleUrl: "https://example.test", syncSecret: "fixture-secret", autoSyncEnabled: false,
    aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiModelOptions: [], aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] });
  assert.equal(setup.ok, true, setup.message);
  const product = saveRuntimeCatalogProduct(database.databasePath, { name: "Kg ürün", unit: "kg", salePrice: 100, dealerPriceA: 80, dealerPriceB: 60, trackInventory: false });
  const dealer = (group) => {
    const result = database.saveCustomer({ fullName: group, phone: "", email: "", notes: "", tags: [], identityType: "", identityNumber: "", nationality: "", birthDate: "", birthdayMessageEnabled: false, gender: "", documentSerialNumber: "", documentExpiryDate: "", birthPlace: "", motherName: "", fatherName: "", issuingAuthority: "", address: "",
      commercialProfile: { companyName: group, taxOffice: "", taxNumber: "", authorizedPerson: "", dealerStatus: "active", priceGroup: group, paymentTermDays: 0, notes: "" } });
    assert.equal(result.ok, true, result.message);
    return result.savedId;
  };
  const a = dealer("dealer_a"), b = dealer("dealer_b");
  const ordinary = database.saveCustomer({ fullName: "Normal", phone: "", email: "", notes: "", tags: [] });
  assert.equal(ordinary.ok, true, ordinary.message);
  const db = new DatabaseSync(database.databasePath);
  try {
    for (const [name, customerId, unitPrice] of [["retail", "", 100], ["ordinary", ordinary.savedId, 100], ["dealer A", a, 80], ["dealer B", b, 60], ["remove customer", "", 100]]) {
      check(name, () => {
        const input = { settlement: "paid", customerId, operationId: `test-${name.replaceAll(" ", "-")}`, items: [{ productId: product.id, quantity: 1.25, unitPrice: 1 }] };
        const result = completeMarketSale(database.databasePath, input);
        assert.equal(result.sale.total, unitPrice * 1.25);
        assert.equal(db.prepare("SELECT unit_price FROM commerce_sale_items WHERE sale_id = ?").get(result.sale.id).unit_price, unitPrice);
        const retry = completeMarketSale(database.databasePath, input);
        assert.equal(retry.sale.id, result.sale.id, "retry must replay the original sale");
        assert.equal(retry.replayed, true);
      });
    }
    check("changed retry conflicts", () => assert.throws(() => completeMarketSale(database.databasePath, { settlement: "paid", customerId: b, operationId: "test-dealer-A", items: [{ productId: product.id, quantity: 1.25 }] }), /farklı bir satış/));
    check("save resolves current backend price", () => {
      saveRuntimeCatalogProduct(database.databasePath, { ...product, dealerPriceA: 72 });
      const result = completeMarketSale(database.databasePath, { settlement: "paid", customerId: a, operationId: "test-current-price", items: [{ productId: product.id, quantity: 2, unitPrice: 80 }] });
      assert.equal(result.sale.total, 144);
      assert.equal(db.prepare("SELECT unit_price FROM commerce_sale_items WHERE sale_id = ?").get(result.sale.id).unit_price, 72);
    });
    check("credit retry creates one debt", () => {
      setBusinessCapability(database.databasePath, { capability: C.CUSTOMER_CREDIT, enabled: true });
      const input = { settlement: "credit", customerId: a, operationId: "test-credit-retry", items: [{ productId: product.id, quantity: 1 }] };
      const first = completeMarketSale(database.databasePath, input), retry = completeMarketSale(database.databasePath, input);
      assert.equal(retry.sale.id, first.sale.id);
      assert.equal(getCustomerCreditAccount(database.databasePath, a).balances[0].amountMinor, 7200);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM customer_credit_entries WHERE sale_id = ?").get(first.sale.id).n, 1);
    });
    check("catalog presentation persists without duplicate products", () => {
      const second = saveRuntimeCatalogProduct(database.databasePath, { name: "Ekmek", salePrice: 10, trackInventory: false });
      setCatalogProductQuickAccess(database.databasePath, product.id, true);
      setCatalogProductQuickAccess(database.databasePath, second.id, true);
      reorderCatalogRecords(database.databasePath, "quickAccess", [second.id, product.id]);
      const quick = listRuntimeCatalogProducts(database.databasePath).filter(item => item.quickAccessEnabled).sort((a, b) => a.quickAccessOrder - b.quickAccessOrder);
      assert.deepEqual(quick.map(item => item.id), [second.id, product.id]);
      reorderCatalogRecords(database.databasePath, "products", [second.id, product.id]);
      assert.deepEqual(listRuntimeCatalogProducts(database.databasePath).map(item => item.id), [second.id, product.id]);
      const before = listRuntimeCatalogProducts(database.databasePath);
      assert.throws(() => reorderCatalogRecords(database.databasePath, "products", [second.id]), /listesi değişti/);
      assert.deepEqual(listRuntimeCatalogProducts(database.databasePath), before);
      setCatalogProductQuickAccess(database.databasePath, product.id, false);
      assert.equal(listRuntimeCatalogProducts(database.databasePath).find(item => item.id === product.id).quickAccessEnabled, false);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM catalog_products").get().n, 2);
      const c1 = saveRuntimeCatalogCategory(database.databasePath, { name: "Birinci" });
      const c2 = saveRuntimeCatalogCategory(database.databasePath, { name: "İkinci" });
      reorderCatalogRecords(database.databasePath, "categories", [c2.id, c1.id]);
      saveRuntimeCatalogCategory(database.databasePath, { id: c1.id, name: "Düzenlenen" });
      assert.deepEqual(listRuntimeCatalogCategories(database.databasePath).map(item => item.id), [c2.id, c1.id]);
    });
    check("stock owner and weighted sale retries", () => {
      const tracked = saveRuntimeCatalogProduct(database.databasePath, { name: "Stoklu kg", unit: "kg", salePrice: 20, trackInventory: true });
      const counted = setRuntimeInventoryCount(database.databasePath, { productId: tracked.id, countedQuantity: 5.5, referenceType: "product_workspace_count", referenceId: tracked.id, actorSource: "desktop-product-workspace", note: "Sayım" });
      assert.equal(counted.movement.type, "count");
      assert.equal(counted.movement.actorSource, "desktop-product-workspace");
      assert.equal(counted.movement.quantityDelta, 5.5);
      assert.throws(() => setRuntimeInventoryCount(database.databasePath, { productId: tracked.id, countedQuantity: -1 }), /Sayım miktarı 0 veya daha büyük bir sayı olmalı/);
      const input = { settlement: "paid", operationId: "test-stock-retry", items: [{ productId: tracked.id, quantity: 0.375 }] };
      const first = completeMarketSale(database.databasePath, input);
      assert.equal(first.sale.total, 7.5);
      assert.equal(completeMarketSale(database.databasePath, input).sale.id, first.sale.id);
      assert.equal(getRuntimeInventoryBalance(database.databasePath, tracked.id).quantity, 5.125);
      assert.equal(listRuntimeInventoryMovements(database.databasePath, { productId: tracked.id }).length, 2);
      assert.throws(() => setRuntimeInventoryCount(database.databasePath, { productId: tracked.id, countedQuantity: 9, expectedUpdatedAt: counted.balance.updatedAt }), /Stok bu sayımdan sonra değişti/);
    });
    check("profile switch and persisted capability navigation", () => {
      for (const profile of ["pension", "pension_restaurant", "restaurant"]) {
        applyBusinessProfileCapabilities(database.databasePath, profile, { preserveUserOverrides: false });
        const persisted = readBusinessCapabilitySnapshot(database.databasePath);
        assert.equal(buildNavigation(persisted).some(item => item.id === "market"), false, profile);
        assert.throws(() => setBusinessCapability(database.databasePath, { capability: C.WHOLESALE, enabled: true }), /profilinde/);
        if (profile === "pension") {
          assert.throws(() => setBusinessCapability(database.databasePath, { capability: C.INVENTORY, enabled: true }), /profilinde/);
        } else {
          const current = database.getSetupData();
          const saved = database.saveInitialSetup({ ...current, aiApiKey: "", clearAiApiKey: false,
            profileOptions: [...current.profileOptions, C.ONLINE_SALES], servicePreferences: current.servicePreferences });
          assert.equal(saved.ok, true, saved.message);
          const online = readBusinessCapabilitySnapshot(database.databasePath);
          assert.equal(buildNavigation(online).some(item => item.id === "market"), false);
          assert.equal(buildNavigation(online).some(item => item.id === "menu"), true);
          assert.ok(online.enabledCapabilities.includes(C.ORDERS));
        }
        const reopened = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: dataDir });
        try { reopened.initialize(); assert.equal(buildNavigation(readBusinessCapabilitySnapshot(reopened.databasePath)).some(item => item.id === "market"), false); } finally { reopened.close(); }

      }
    });
  } finally { db.close(); }
} finally { database.close(); rmSync(dataDir, { recursive: true, force: true }); }
assert.deepEqual(failures, [], failures.join("\n"));
console.log("sales-correctness-smoke-ok");
