import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C, getBusinessProfile, expandBusinessCapabilities } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { completeMarketSale } = require("../apps/desktop-app/dist-electron/market-sale-operation.js");
const { saveRuntimeCatalogProduct, listRuntimeCatalogProducts, saveRuntimeCatalogCategory, listRuntimeCatalogCategories, setRuntimeInventoryCount, getRuntimeInventoryBalance, listRuntimeInventoryMovements, getCustomerCreditAccount } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { activateCatalogProduct, deleteCatalogProduct, reorderCatalogRecords, setCatalogProductQuickAccess } = require("../apps/desktop-app/dist-electron/commerce-catalog-presentation-store.js");
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
      const quick = listRuntimeCatalogProducts(database.databasePath).items.filter(item => item.quickAccessEnabled).sort((a, b) => a.quickAccessOrder - b.quickAccessOrder);
      assert.deepEqual(quick.map(item => item.id), [second.id, product.id]);
      reorderCatalogRecords(database.databasePath, "products", [second.id, product.id]);
      assert.deepEqual(listRuntimeCatalogProducts(database.databasePath).items.map(item => item.id), [second.id, product.id]);
      const before = listRuntimeCatalogProducts(database.databasePath).items;
      assert.throws(() => reorderCatalogRecords(database.databasePath, "products", [second.id]), /listesi değişti/);
      assert.deepEqual(listRuntimeCatalogProducts(database.databasePath).items, before);
      setCatalogProductQuickAccess(database.databasePath, product.id, false);
      assert.equal(listRuntimeCatalogProducts(database.databasePath).items.find(item => item.id === product.id).quickAccessEnabled, false);
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
    check("manual tender is atomic, customer/currency scoped and replayed once", () => {
      const path = database.databasePath;
      const runtime = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
      const customer = database.saveCustomer({ fullName: "Tender fixture" }).savedId;
      const tenderProduct = saveRuntimeCatalogProduct(path, { name: "Tender product", salePrice: 100, trackInventory: true });
      setRuntimeInventoryCount(path, { productId: tenderProduct.id, countedQuantity: 50 });
      runtime.addCustomerCreditAdjustment(path, { customerId: customer, currency: "TRY", amountMinor: 16000, entryType: "adjustment_debit", source: "fixture", note: "Old debt" });
      runtime.addCustomerCreditAdjustment(path, { customerId: customer, currency: "EUR", amountMinor: 9000, entryType: "adjustment_debit", source: "fixture", note: "Separate currency" });
      const balance = currency => getCustomerCreditAccount(path, customer).balances.find(item => item.currency === currency)?.amountMinor ?? 0;
      const tables = ["commerce_sales", "commerce_sale_items", "inventory_balances", "inventory_movements", "customer_credit_entries", "finance_entries", "commerce_market_sale_receipts"];
      const state = () => tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      const input = (id, amount, extra = {}) => ({ settlement: "paid", paymentMethod: "cash", customerId: customer, operationId: `manual-tender-${id}`, paymentAmountMinor: amount, items: [{ productId: tenderProduct.id, quantity: 1, expectedUnitPrice: 100, expectedCurrency: "TRY" }], ...extra });
      const income = () => db.prepare("SELECT COALESCE(SUM(amount_minor),0) AS n FROM finance_entries WHERE direction='income' AND deleted_at='' AND currency='TRY'").get().n;
      let debt = 16000;
      for (const method of ["cash", "card", "transfer", "other"]) {
        const intent = input(method, 4000, { paymentMethod: method });
        const beforeIncome = income();
        const result = completeMarketSale(path, intent);
        assert.equal(result.sale.status, "credit"); assert.equal(result.sale.paymentMethod, "");
        assert.deepEqual(result.payment, { receivedMinor: 4000, appliedToSaleMinor: 4000, appliedToDebtMinor: 0, newDebtMinor: 6000 });
        debt += 6000; assert.equal(balance("TRY"), debt); assert.equal(income() - beforeIncome, 4000);
        assert.equal(db.prepare("SELECT payment_method FROM customer_credit_entries WHERE customer_id=? AND entry_type='payment' ORDER BY rowid DESC LIMIT 1").get(customer).payment_method, method === "transfer" ? "bank" : method);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM finance_entries WHERE source_type='commerce_sale' AND source_id=?").get(result.sale.id).n, 0);
        const snapshot = state();
        assert.equal(completeMarketSale(path, intent).sale.id, result.sale.id);
        assert.deepEqual(state(), snapshot);
        assert.throws(() => completeMarketSale(path, { ...intent, paymentAmountMinor: 4001 }), /farklı bir satış/);
      }
      const beforeIncome = income();
      const excess = completeMarketSale(path, input("excess", 12000));
      assert.equal(excess.sale.status, "paid"); assert.equal(income() - beforeIncome, 12000);
      assert.equal(excess.payment.appliedToDebtMinor, 2000); debt -= 2000; assert.equal(balance("TRY"), debt);
      const afterExcess = state(); assert.equal(completeMarketSale(path, input("excess", 12000)).sale.id, excess.sale.id); assert.deepEqual(state(), afterExcess);
      const exact = completeMarketSale(path, input("exact", 10000)); assert.equal(exact.sale.status, "paid"); assert.equal(balance("TRY"), debt);
      completeMarketSale(path, input("zero", 0)); debt += 10000; assert.equal(balance("TRY"), debt);
      assert.equal(balance("EUR"), 9000);
      for (const bad of [input("no-receipt", 5000, { operationId: "" }), input("over", 10000 + debt + 1), input("negative", -1), input("fraction", 1.1), input("huge", Number.MAX_SAFE_INTEGER), input("no-customer", 5000, { customerId: "" }), input("deleted", 5000, { customerId: "missing" }), input("credit-positive", 1, { settlement: "credit" }), input("method", 5000, { paymentMethod: "invalid" }), input("stale", 5000, { items: [{ productId: tenderProduct.id, quantity: 1, expectedUnitPrice: 99 }] })]) {
        const before = state(); assert.throws(() => completeMarketSale(path, bad)); assert.deepEqual(state(), before);
      }
      db.exec("CREATE TRIGGER tender_payment_failure BEFORE INSERT ON finance_entries WHEN NEW.source_type='customer_credit_payment' BEGIN SELECT RAISE(ABORT,'tender_payment_failure'); END");
      for (const amount of [5000, 11000]) {
        const before = state(); assert.throws(() => completeMarketSale(path, input(`rollback-${amount}`, amount)), /tender_payment_failure/); assert.deepEqual(state(), before);
      }
      db.exec("DROP TRIGGER tender_payment_failure");
      db.exec("CREATE TRIGGER tender_receipt_failure BEFORE INSERT ON commerce_market_sale_receipts WHEN NEW.operation_id='manual-tender-receipt' BEGIN SELECT RAISE(ABORT,'tender_receipt_failure'); END");
      const beforeReceipt = state(); assert.throws(() => completeMarketSale(path, input("receipt", 5000)), /tender_receipt_failure/); assert.deepEqual(state(), beforeReceipt);
      db.exec("DROP TRIGGER tender_receipt_failure");
      const displayedDebt = debt;
      runtime.recordCustomerCreditPayment(path, { customerId: customer, amountMinor: debt, currency: "TRY", paymentMethod: "cash" });
      const beforeRace = state(); assert.throws(() => completeMarketSale(path, input("balance-race", 10000 + displayedDebt)), /borcunu aşamaz/); assert.deepEqual(state(), beforeRace);
      setBusinessCapability(path, { capability: C.CUSTOMER_CREDIT, enabled: false });
      for (const amount of [0, 5000, 11000]) { const before = state(); assert.throws(() => completeMarketSale(path, input(`gate-${amount}`, amount))); assert.deepEqual(state(), before); }
      setBusinessCapability(path, { capability: C.CUSTOMER_CREDIT, enabled: true });
      assert.equal(getRuntimeInventoryBalance(path, tenderProduct.id).quantity, 43);
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
    check("product activation IPC keeps fields, session gate and capability gate", () => {
      const path = database.databasePath;
      applyBusinessProfileCapabilities(path, "market");
      const record = saveRuntimeCatalogProduct(path, { name: "Activation guard", salePrice: 31, sku: "ACTIVATE-GUARD", description: "Keep description", trackInventory: false, isActive: false });
      const stored = () => db.prepare("SELECT * FROM catalog_products WHERE id = ?").get(record.id);
      const before = stored();
      const handlers = new Map(), api = {};
      const ipcRequire = createRequire(resolve("apps/desktop-app/dist-electron/commerce-ipc.js"));
      let locked = true, notifications = 0;
      runInNewContext(readFileSync(resolve("apps/desktop-app/dist-electron/commerce-ipc.js"), "utf8"), {
        exports: api, Error, require: id => id === "electron" ? { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
          : id === "./ipc/product-photo-ipc" ? { registerProductPhotoIpcHandlers() {} }
          : id === "./desktop-logger" ? { desktopLog: { warn() {} } } : ipcRequire(id)
      });
      api.registerCommerceIpcHandlers({ databasePath: () => path, assertUnlocked: () => { if (locked) throw new Error("Uygulama kilitli."); }, onMutation: () => { notifications++; } });
      const activate = () => handlers.get("commerce:product:activate")({}, record.id);
      assert.throws(activate, /kilitli/); assert.deepEqual(stored(), before); assert.equal(notifications, 0);
      locked = false; assert.equal(activate().ok, true); assert.equal(notifications, 1);
      const after = stored(); assert.equal(after.is_active, 1);
      assert.deepEqual({ ...after, is_active: 0, updated_at: "" }, { ...before, updated_at: "" });
      activateCatalogProduct(path, record.id); assert.deepEqual(stored(), after);
      deleteCatalogProduct(path, record.id); const deleted = stored();
      assert.throws(() => activateCatalogProduct(path, record.id), /bulunamadı/); assert.deepEqual(stored(), deleted);
      applyBusinessProfileCapabilities(path, "pension");
      assert.throws(activate, /etkin değil/); assert.equal(notifications, 1);
    });
  } finally { db.close(); }
} finally { database.close(); rmSync(dataDir, { recursive: true, force: true }); }
assert.deepEqual(failures, [], failures.join("\n"));
console.log("sales-correctness-smoke-ok");
