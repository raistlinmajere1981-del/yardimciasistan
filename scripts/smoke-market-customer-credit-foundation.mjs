import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import { execFile } from "node:child_process";
import process from "node:process";

const require = createRequire(import.meta.url);
const shared = require("@yardimci-asistan/shared");
const { BUSINESS_CAPABILITIES: C, getBusinessProfile, getBusinessCapabilityDependencies, moneyToMinor } = shared;
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");
const { applyBusinessProfileCapabilities, setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const runtime = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const creditRuntime = require("../apps/desktop-app/dist-electron/customer-credit-runtime.js");
const { createAndroidMarketSnapshotSource } = require("../apps/desktop-app/dist-electron/market-android-snapshot.js");
const appPath = join(process.cwd(), "apps/desktop-app");
const dataDir = mkdtempSync(join(tmpdir(), "yardimci-m81-credit-"));
const database = new DesktopDatabase({ appPath, userDataPath: dataDir });
let raw;

try {
  database.initialize();
  const setupResult = database.saveInitialSetup({
    businessName: "Veresiye Test İşletmesi",
    profileId: "market",
    phone: "+905550002012",
    whatsapp: "+905550002012",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "credit-foundation-secret",
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
  raw = new DatabaseSync(databasePath);
  raw.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const businessId = raw.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at LIMIT 1").get().id;
  assert.equal(C.CUSTOMER_CREDIT, "commerce.customer_credit");
  assert.deepEqual(getBusinessCapabilityDependencies(C.CUSTOMER_CREDIT), [C.CUSTOMERS, C.SALES, C.FINANCE]);
  // CUSTOMER_CREDIT is an optional (provider-driven) capability, not a default:
  // offered to market profiles, enabled explicitly by the operator.
  assert.ok(getBusinessProfile("market").optionalCapabilities.includes(C.CUSTOMER_CREDIT));
  assert.ok(!getBusinessProfile("market").defaultCapabilities.includes(C.CUSTOMER_CREDIT));
  for (const profile of ["pension", "restaurant", "pension_restaurant"]) {
    assert.ok(!getBusinessProfile(profile).optionalCapabilities.includes(C.CUSTOMER_CREDIT));
    assert.ok(!getBusinessProfile(profile).defaultCapabilities.includes(C.CUSTOMER_CREDIT));
  }
  applyBusinessProfileCapabilities(databasePath, "market", { preserveUserOverrides: false });
  // The market profile offers CUSTOMER_CREDIT as an option; enable it explicitly.
  setBusinessCapability(databasePath, { capability: C.CUSTOMER_CREDIT, enabled: true });
  // All operations below succeed without the connected services.
  for (const capability of [C.WHATSAPP, C.SYNC, C.ANDROID]) {
    raw.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE business_id = ? AND capability_id = ?").run(businessId, capability);
  }
  const customer = (name) => {
    const result = database.saveCustomer({ fullName: name });
    assert.equal(result.ok, true, result.message);
    assert.equal(raw.prepare("SELECT business_id FROM customers WHERE id = ?").get(result.savedId).business_id, businessId);
    return result.savedId;
  };
  const customerId = customer("M81 Veresiye Müşterisi");
  const paymentCustomerId = customer("M81 Tahsilat Müşterisi");
  const deletedId = customer("M81 Silinmiş Müşteri");
  assert.equal(database.deleteCustomer(deletedId).ok, true);
  const foreignId = customer("M81 Başka İşletme");
  raw.prepare(`INSERT INTO business (id, name, display_name, profile_id, created_at, updated_at)
    VALUES ('m81_secondary', 'İkinci İşletme', 'İkinci İşletme', 'market', '2099-01-01', '2099-01-01')`).run();
  raw.prepare("UPDATE customers SET business_id = 'm81_secondary' WHERE id = ?").run(foreignId);

  const product = runtime.saveRuntimeCatalogProduct(databasePath, { name: "M81 Güncel Fiyat", salePrice: 19.99 });
  runtime.applyRuntimeInventoryMovement(databasePath, { productId: product.id, type: "purchase", quantityDelta: 20 });
  runtime.saveRuntimeCatalogProduct(databasePath, { id: product.id, name: product.name, salePrice: 25.15 });
  const euroProduct = runtime.saveRuntimeCatalogProduct(databasePath, { name: "M81 EUR", salePrice: 2, currency: "EUR", trackInventory: false });
  const cart = { customerId, items: [{ productId: product.id, quantity: 2, salePrice: 0.01 }], discountTotal: 0.3 };
  const account = (id = customerId) => runtime.getCustomerCreditAccount(databasePath, id);
  const debt = (id = customerId, currency = "TRY") => account(id).balances.find((balance) => balance.currency === currency)?.amountMinor ?? 0;
  const counts = () => Object.fromEntries([
    "commerce_sales", "commerce_sale_items", "customer_credit_entries", "finance_entries", "inventory_movements", "inventory_balances", "inventory_locations"
  ].map((table) => [table, raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
  const state = () => ({ counts: counts(), stock: runtime.getRuntimeInventoryBalance(databasePath, product.id).quantity });
  const rejectUnchanged = (operation, expected) => {
    const before = state();
    assert.throws(operation, expected);
    assert.deepEqual(state(), before, "Rejected operation must leave sale/ledger/finance/stock unchanged.");
  };
  const adjustment = (id, amountMinor, entryType = "adjustment_debit", currency = "TRY") =>
    runtime.addCustomerCreditAdjustment(databasePath, { customerId: id, amountMinor, entryType, currency, note: "Açılış/düzeltme", source: "smoke" });
  const pay = (amountMinor, extra = {}) => runtime.recordCustomerCreditPayment(databasePath, {
    customerId: paymentCustomerId, amountMinor, currency: "TRY", paymentMethod: "bank", ...extra
  });

  const beforeSale = state();
  const creditSale = runtime.createCustomerCreditSale(databasePath, { ...cart, paymentMethod: "cash", customerName: "Sahte", databasePath: "/invalid", note: "Veresiye test" });
  assert.equal(creditSale.status, "credit");
  assert.equal(creditSale.paymentMethod, "");
  assert.equal(creditSale.subtotal, 50.3);
  assert.equal(creditSale.total, 50);
  assert.equal(debt(), 5000);
  assert.equal(state().stock, beforeSale.stock - 2);
  assert.equal(counts().finance_entries, beforeSale.counts.finance_entries, "Credit sale cannot project cash income.");
  assert.equal(counts().customer_credit_entries, beforeSale.counts.customer_credit_entries + 1);
  const entry = account().entries[0];
  assert.equal(entry.entryType, "credit_sale");
  assert.equal(entry.direction, "debit");
  assert.equal(entry.saleId, creditSale.id);
  assert.equal(entry.amountMinor, moneyToMinor(creditSale.total));
  assert.equal(entry.customerId, customerId);
  assert.equal(entry.note, "Veresiye test");
  const snapshotItem = raw.prepare("SELECT * FROM commerce_sale_items WHERE sale_id = ?").get(creditSale.id);
  assert.equal(snapshotItem.product_name, product.name);
  assert.equal(snapshotItem.unit_price, 25.15);
  assert.equal(snapshotItem.quantity, 2);
  const columns = Object.keys(raw.prepare("SELECT * FROM customer_credit_entries LIMIT 1").get());
  rejectUnchanged(() => raw.prepare(`INSERT INTO customer_credit_entries (${columns.join(",")})
    SELECT ${columns.map((column) => column === "id" ? "'duplicate-debit'" : column).join(",")}
    FROM customer_credit_entries WHERE id = ?`).run(entry.id), /UNIQUE/);

  for (const invalidCustomer of [undefined, "", "missing", deletedId, foreignId]) {
    rejectUnchanged(() => runtime.createCustomerCreditSale(databasePath, { ...cart, customerId: invalidCustomer }), /müşteri/i);
    rejectUnchanged(() => adjustment(invalidCustomer, 100), /müşteri/i);
    rejectUnchanged(() => pay(1, { customerId: invalidCustomer }), /müşteri/i);
  }
  assert.throws(() => account(foreignId), /müşteri/i);
  assert.throws(() => runtime.listCustomerCreditEntries(databasePath, foreignId), /müşteri/i);
  assert.ok(!runtime.listCustomerCreditAccounts(databasePath, { includeDeleted: true }).some((a) => a.customer.id === foreignId));
  rejectUnchanged(() => runtime.createCustomerCreditSale(databasePath, {
    customerId, items: [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 100 }]
  }), /stok/i);
  rejectUnchanged(() => runtime.createCustomerCreditSale(databasePath, {
    customerId, items: [{ productId: product.id, quantity: 1 }, { productId: euroProduct.id, quantity: 1 }]
  }), /para birimi/i);
  for (const discountTotal of [-1, NaN, Infinity]) {
    rejectUnchanged(() => runtime.createCustomerCreditSale(databasePath, { ...cart, discountTotal }), /tutar/i);
  }
  rejectUnchanged(() => runtime.createCustomerCreditSale(databasePath, { ...cart, discountTotal: 10000 }), /tutar/i);
  for (const quantity of [0, -1, NaN, Infinity]) {
    rejectUnchanged(() => runtime.createCustomerCreditSale(databasePath, { customerId, items: [{ productId: product.id, quantity }] }), /adedi/i);
  }
  // Force failure after the sale/items/stock have already been written.
  raw.exec(`CREATE TRIGGER m81_fail_debit BEFORE INSERT ON customer_credit_entries
    WHEN NEW.entry_type = 'credit_sale' BEGIN SELECT RAISE(ABORT, 'injected ledger failure'); END;`);
  rejectUnchanged(() => runtime.createCustomerCreditSale(databasePath, cart), /injected ledger/);
  raw.exec("DROP TRIGGER m81_fail_debit");

  adjustment(paymentCustomerId, 50000);
  assert.equal(debt(paymentCustomerId), 50000);
  rejectUnchanged(() => pay(50001), /borcunu/i);
  for (const amount of [0, -1, NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER, "1"]) {
    rejectUnchanged(() => pay(amount), /tutar/i);
  }
  for (const method of ["transfer", "credit", "unspecified", "invalid", undefined]) {
    rejectUnchanged(() => pay(1, { paymentMethod: method }), /ödeme yöntemi/i);
  }
  for (const currency of ["", "TL", "12A", "TRY EUR"]) {
    rejectUnchanged(() => pay(1, { currency }), /para birimi/i);
  }
  rejectUnchanged(() => pay(1, { currency: "EUR" }), /borcunu/i);
  rejectUnchanged(() => pay(1, { paidAt: "invalid" }), /tarih/i);
  const financeBeforePayment = new DesktopFinanceService(databasePath).getData().todayIncomeMinor;
  const firstPayment = pay(20000);
  assert.equal(firstPayment.direction, "credit");
  assert.equal(firstPayment.amountMinor, 20000);
  assert.equal(debt(paymentCustomerId), 30000);
  const financeRow = raw.prepare("SELECT * FROM finance_entries WHERE source_type = 'customer_credit_payment' AND source_id = ?").get(firstPayment.id);
  assert.equal(financeRow.direction, "income");
  assert.equal(financeRow.amount_minor, 20000);
  assert.equal(financeRow.currency, "TRY");
  assert.equal(financeRow.payment_method, "bank");
  assert.equal(financeRow.category, "other_income");
  assert.equal(new DesktopFinanceService(databasePath).getData().todayIncomeMinor, financeBeforePayment + 20000);
  assert.equal(new DesktopFinanceService(databasePath).deleteManualEntry(financeRow.id).ok, false);
  const summary = runtime.listCustomerCreditAccounts(databasePath, { search: "M81 Tahsilat", outstandingOnly: true });
  assert.equal(summary.length, 1);
  assert.deepEqual(summary[0].balances, [{ currency: "TRY", amountMinor: 30000 }]);
  assert.equal(summary[0].lastPayment.id, firstPayment.id);
  assert.equal(summary[0].lastPayment.amountMinor, 20000);
  assert.equal(summary[0].lastMovementAt, firstPayment.occurredAt);

  raw.exec(`CREATE TRIGGER m81_fail_finance BEFORE INSERT ON finance_entries
    WHEN NEW.source_type = 'customer_credit_payment' BEGIN SELECT RAISE(ABORT, 'injected finance failure'); END;`);
  rejectUnchanged(() => pay(1), /injected finance/);
  assert.equal(debt(paymentCustomerId), 30000);
  raw.exec("DROP TRIGGER m81_fail_finance");
  raw.exec(`CREATE TRIGGER m81_fail_payment AFTER INSERT ON finance_entries
    WHEN NEW.source_type = 'customer_credit_payment' BEGIN SELECT RAISE(ABORT, 'injected payment failure'); END;`);
  rejectUnchanged(() => pay(1), /injected payment/);
  raw.exec("DROP TRIGGER m81_fail_payment");
  pay(30000, { paymentMethod: "cash" });
  assert.equal(debt(paymentCustomerId), 0);
  rejectUnchanged(() => pay(1), /borcunu/i);
  for (const paymentMethod of ["card", "other"]) {
    adjustment(paymentCustomerId, 1);
    const payment = pay(1, { paymentMethod });
    assert.equal(raw.prepare("SELECT payment_method FROM finance_entries WHERE source_id = ?").get(payment.id).payment_method, paymentMethod);
  }

  const concurrentCustomer = customer("M81 Eşzamanlı Tahsilat");
  adjustment(concurrentCustomer, 50000);
  const beforeConcurrent = counts();
  const concurrentResults = await Promise.all([1, 2].map(() => new Promise((resolve, reject) => {
    execFile(process.execPath, ["-e", `
      const runtime = require(process.argv[1]);
      try {
        runtime.recordCustomerCreditPayment(process.argv[2], {
          customerId: process.argv[3], amountMinor: 30000, currency: 'TRY', paymentMethod: 'cash'
        });
        process.stdout.write('paid');
      } catch (error) {
        if (!/borcunu/.test(error.message)) throw error;
        process.stdout.write('rejected');
      }
    `, join(appPath, "dist-electron/customer-credit-runtime.js"), databasePath, concurrentCustomer],
    { timeout: 15000 }, (error, stdout) => error ? reject(error) : resolve(stdout));
  })));
  assert.deepEqual(concurrentResults.sort(), ["paid", "rejected"]);
  assert.equal(debt(concurrentCustomer), 20000);
  assert.equal(counts().finance_entries, beforeConcurrent.finance_entries + 1);
  assert.equal(counts().customer_credit_entries, beforeConcurrent.customer_credit_entries + 1);

  const financeBeforeAdjustments = counts().finance_entries;
  adjustment(customerId, 10000);
  assert.equal(debt(), 15000);
  adjustment(customerId, 5000, "adjustment_credit");
  assert.equal(debt(), 10000);
  rejectUnchanged(() => adjustment(customerId, 10001, "adjustment_credit"), /borcunu/i);
  for (const note of ["", "  ", undefined]) {
    rejectUnchanged(() => runtime.addCustomerCreditAdjustment(databasePath, {
      customerId, amountMinor: 1, currency: "TRY", entryType: "adjustment_debit", source: "smoke", note
    }), /açıklama/i);
  }
  assert.equal(counts().finance_entries, financeBeforeAdjustments, "Corrections never create cash income.");
  adjustment(customerId, 2000, "adjustment_debit", "EUR");
  assert.deepEqual(account().balances, [{ currency: "EUR", amountMinor: 2000 }, { currency: "TRY", amountMinor: 10000 }]);
  const tryIncome = new DesktopFinanceService(databasePath).getData().todayIncomeMinor;
  const euroPayment = pay(1000, { customerId, currency: "eur", paymentMethod: "card" });
  assert.equal(euroPayment.currency, "EUR");
  assert.equal(debt(customerId, "EUR"), 1000);
  assert.equal(debt(), 10000);
  assert.equal(new DesktopFinanceService(databasePath).getData().todayIncomeMinor, tryIncome, "EUR must not inflate a TRY cash summary.");
  assert.equal(raw.prepare("SELECT currency FROM finance_entries WHERE source_id = ?").get(euroPayment.id).currency, "EUR");
  assert.equal(runtime.listCustomerCreditEntries(databasePath, customerId, { currency: "EUR", limit: 1 })[0].id, euroPayment.id);
  assert.equal(runtime.listCustomerCreditEntries(databasePath, customerId, { currency: "EUR", limit: 1, offset: 1 })[0].entryType, "adjustment_debit");

  // Existing receipts/paid behavior and the actual Market sales projection.
  const today = raw.prepare("SELECT date('now', 'localtime') AS today").get().today;
  const salesBefore = createAndroidMarketSnapshotSource(databasePath, today).summary;
  assert.equal(salesBefore.today_sale_count, 1);
  assert.equal(salesBefore.today_sales_total, 50);
  const financeBeforePaidSales = counts().finance_entries;
  for (const paymentMethod of ["cash", "card"]) {
    const sale = runtime.createRuntimePaidSale(databasePath, { items: [{ productId: product.id, quantity: 1 }], paymentMethod });
    assert.equal(sale.status, "paid");
    assert.equal(sale.paymentMethod, paymentMethod);
    assert.equal(sale.total, 25.15);
  }
  assert.equal(counts().finance_entries, financeBeforePaidSales, "Preserve existing paid commerce finance behavior.");
  const salesAfter = createAndroidMarketSnapshotSource(databasePath, today).summary;
  assert.equal(salesAfter.today_sale_count, 3);
  assert.equal(moneyToMinor(salesAfter.today_sales_total), 10030);
  assert.equal(raw.prepare("SELECT status FROM commerce_sales WHERE id = ?").get(creditSale.id).status, "credit");
  const quickSaleSource = readFileSync(join(appPath, "src/components/market/MarketQuickSaleWorkspace.tsx"), "utf8");
  assert.ok(quickSaleSource.includes("bridge.createPaidSale("));
  assert.ok(quickSaleSource.includes("bridge.createCustomerCreditSale("));

  assert.equal(database.deleteCustomer(customerId).ok, false);
  assert.match(database.deleteCustomer(customerId).message, /açık veresiye borcu/i);
  assert.throws(() => raw.prepare("UPDATE customers SET deleted_at = 'now' WHERE id = ?").run(customerId), /açık veresiye borcu/i);
  assert.throws(() => raw.prepare("DELETE FROM customers WHERE id = ?").run(customerId), /FOREIGN KEY/);
  assert.throws(() => raw.prepare("UPDATE customers SET business_id = 'm81_other' WHERE id = ?").run(customerId), /işletmesi/i);
  assert.throws(() => raw.prepare("UPDATE customer_credit_entries SET amount_minor = 1 WHERE id = ?").run(entry.id), /değiştirilemez/i);
  assert.throws(() => raw.prepare("DELETE FROM customer_credit_entries WHERE id = ?").run(entry.id), /silinemez/i);
  assert.throws(() => raw.prepare("UPDATE commerce_sales SET status = 'paid' WHERE id = ?").run(creditSale.id), /muhasebe izi/i);
  assert.ok(Object.keys(creditRuntime).every((name) => !/delete|update/i.test(name)));
  const settledHistory = account(paymentCustomerId);
  assert.equal(database.deleteCustomer(paymentCustomerId).ok, true);
  assert.deepEqual(account(paymentCustomerId).entries, settledHistory.entries);
  assert.ok(account(paymentCustomerId).customer.deletedAt);
  rejectUnchanged(() => pay(1), /müşteri/i);
  assert.ok(runtime.listCustomerCreditAccounts(databasePath, { includeDeleted: true }).some((a) => a.customer.id === paymentCustomerId));

  const allOperations = [
    () => account(),
    () => runtime.listCustomerCreditAccounts(databasePath),
    () => runtime.listCustomerCreditEntries(databasePath, customerId),
    () => runtime.createCustomerCreditSale(databasePath, cart),
    () => pay(1, { customerId }),
    () => adjustment(customerId, 1)
  ];
  const preserved = account();
  setBusinessCapability(databasePath, { capability: C.CUSTOMER_CREDIT, enabled: false });
  for (const operation of allOperations) rejectUnchanged(operation, /etkin değil/i);
  // Debt deletion protection is independent of capability visibility.
  assert.equal(database.deleteCustomer(customerId).ok, false);
  setBusinessCapability(databasePath, { capability: C.CUSTOMER_CREDIT, enabled: true });
  assert.deepEqual(account(), preserved);
  for (const dependency of [C.CUSTOMERS, C.SALES, C.FINANCE, C.CATALOG]) {
    raw.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE business_id = ? AND capability_id = ?").run(businessId, dependency);
    for (const operation of allOperations) assert.throws(operation, /etkin değil/i);
    raw.prepare("UPDATE business_capabilities SET is_enabled = 1 WHERE business_id = ? AND capability_id = ?").run(businessId, dependency);
  }
  assert.throws(() => setBusinessCapability(databasePath, { capability: C.SALES, enabled: false }), /customer_credit/);
  applyBusinessProfileCapabilities(databasePath, "restaurant", { preserveUserOverrides: false });
  assert.throws(() => account(), /yalnızca Market/i);
  assert.throws(
    () => setBusinessCapability(databasePath, { capability: C.CUSTOMER_CREDIT, enabled: true }),
    /yalnızca Market/i
  );
  // Even a stale/raw enabled bit cannot revive customer credit outside Market.
  raw.prepare("UPDATE business_capabilities SET is_enabled = 1, source = 'user' WHERE business_id = ? AND capability_id = ?")
    .run(businessId, C.CUSTOMER_CREDIT);
  assert.throws(() => account(), /yalnızca Market/i);
  applyBusinessProfileCapabilities(databasePath, "market", { preserveUserOverrides: false });
  setBusinessCapability(databasePath, { capability: C.CUSTOMER_CREDIT, enabled: true });
  assert.deepEqual(account().customer.id, customerId);

  // Execute actual compiled IPC handlers against a mocked Electron boundary.
  verifyIpc(databasePath, customerId, cart, account, raw);

  const backupFilePath = join(dataDir, "current-schema.sqlite");
  const backupSource = new DatabaseSync(databasePath);
  try {
    backupSource.exec(`VACUUM INTO '${backupFilePath.replace(/'/g, "''")}'`);
  } finally {
    backupSource.close();
  }
  const restoreDir = join(dataDir, "restore");
  mkdirSync(restoreDir);
  copyFileSync(backupFilePath, join(restoreDir, "yardimci-asistan.sqlite"));
  const restored = new DesktopDatabase({ appPath, userDataPath: restoreDir });
  try {
    restored.initialize();
    assert.deepEqual(runtime.getCustomerCreditAccount(restored.databasePath, customerId), account());
    const restoredRaw = new DatabaseSync(restored.databasePath);
    try {
      assert.equal(restoredRaw.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      assert.deepEqual(restoredRaw.prepare("PRAGMA foreign_key_check").all(), []);
      assert.throws(() => restoredRaw.prepare("DELETE FROM customer_credit_entries WHERE id = ?").run(entry.id), /silinemez/i);
    } finally { restoredRaw.close(); }
    const balanceBefore = debt();
    runtime.recordCustomerCreditPayment(restored.databasePath, { customerId, amountMinor: 1, currency: "TRY", paymentMethod: "cash" });
    assert.equal(runtime.getCustomerCreditAccount(restored.databasePath, customerId).balances.find((b) => b.currency === "TRY").amountMinor, balanceBefore - 1);
    assert.equal(debt(), balanceBefore, "Restored database is independent of original.");
  } finally { restored.close(); }
  assert.equal(raw.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(raw.prepare("PRAGMA foreign_key_check").all(), []);
  verifyHistorySnapshots(databasePath, raw, customer("M84 Geçmiş Kalemleri"));
  console.log("market-customer-credit-foundation-smoke-ok");
} finally {
  raw?.close();
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}

function verifyHistorySnapshots(path, raw, customerId) {
  const first = runtime.saveRuntimeCatalogProduct(path, { name: "Satış anındaki ürün", salePrice: 12.5, trackInventory: false });
  const second = runtime.saveRuntimeCatalogProduct(path, { name: "Silinecek ürün", salePrice: 7.25, trackInventory: false });
  const createSale = (items, discountTotal = 0) => runtime.createCustomerCreditSale(path, { customerId, items, discountTotal });
  const multi = createSale([{ productId: first.id, quantity: 2 }, { productId: second.id, quantity: 0.5 }], 1.25);
  const missing = createSale([{ productId: first.id, quantity: 1 }]);
  for (let index = 0; index < 201; index += 1) createSale([{ productId: first.id, quantity: 2 }]);
  runtime.addCustomerCreditAdjustment(path, { customerId, amountMinor: 100, currency: "TRY", entryType: "adjustment_debit", note: "Test", source: "smoke" });
  runtime.recordCustomerCreditPayment(path, { customerId, amountMinor: 100, currency: "TRY", paymentMethod: "cash" });
  runtime.saveRuntimeCatalogProduct(path, { id: first.id, name: "Yeni ad", salePrice: 999, trackInventory: false });
  raw.prepare("DELETE FROM catalog_products WHERE id = ?").run(second.id);
  const ledger = () => raw.prepare("SELECT * FROM customer_credit_entries WHERE customer_id = ? ORDER BY id").all(customerId);
  const beforeLedger = ledger();
  const beforeBalances = raw.prepare("SELECT * FROM customer_credit_balances WHERE customer_id = ?").all(customerId);

  const queries = [];
  const prepare = DatabaseSync.prototype.prepare;
  let page;
  try {
    DatabaseSync.prototype.prepare = function (sql) { queries.push(sql); return prepare.call(this, sql); };
    page = runtime.getCustomerCreditAccount(path, customerId);
  } finally { DatabaseSync.prototype.prepare = prepare; }
  assert.equal(page.entries.length, 200);
  assert.equal(queries.filter((sql) => /FROM commerce_sales/.test(sql)).length, 1, "One sale snapshot query for the entire page.");
  assert.ok(queries.length <= 6, "Query count is bounded independently of movement count.");
  assert.ok(queries.every((sql) => !/catalog_products/.test(sql)), "History never resolves the current catalog.");
  const rest = runtime.listCustomerCreditEntries(path, customerId, { offset: 200, limit: 200 });
  assert.equal(rest.length, 5);
  const entries = [...page.entries, ...rest];
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 205);
  for (const entry of entries) {
    if (entry.entryType !== "credit_sale") { assert.equal(entry.saleDetail, undefined); continue; }
    assert.equal(moneyToMinor(entry.saleDetail.total), entry.amountMinor);
    assert.equal(entry.saleDetail.items[0].productName, first.name);
    assert.equal(entry.saleDetail.items[0].unitPrice, 12.5);
  }
  const detail = entries.find((entry) => entry.saleId === multi.id).saleDetail;
  assert.deepEqual(detail.items.map(({ productId, productName, quantity, unitPrice, lineTotal, currency }) =>
    ({ productId, productName, quantity, unitPrice, lineTotal, currency })), [
    { productId: first.id, productName: first.name, quantity: 2, unitPrice: 12.5, lineTotal: 25, currency: "TRY" },
    { productId: second.id, productName: second.name, quantity: 0.5, unitPrice: 7.25, lineTotal: 3.63, currency: "TRY" }
  ]);
  assert.equal(detail.subtotal, 28.63);
  assert.equal(detail.discountTotal, 1.25);
  assert.equal(detail.total, 27.38);
  assert.deepEqual(runtime.listCustomerCreditEntries(path, customerId, { limit: 0 }), []);

  // Simulate an incomplete historical import without changing the ledger.
  raw.prepare("DELETE FROM commerce_sale_items WHERE sale_id = ?").run(missing.id);
  assert.equal(runtime.listCustomerCreditEntries(path, customerId, { limit: 500 }).find((entry) => entry.saleId === missing.id).saleDetail, null);
  const saleRow = raw.prepare("SELECT * FROM commerce_sales WHERE id = ?").get(missing.id);
  raw.exec("PRAGMA foreign_keys = OFF");
  try {
    raw.prepare("DELETE FROM commerce_sales WHERE id = ?").run(missing.id);
    const preserved = runtime.listCustomerCreditEntries(path, customerId, { limit: 500 }).find((entry) => entry.saleId === missing.id);
    assert.equal(preserved.saleDetail, null);
    assert.equal(preserved.amountMinor, 1250);
  } finally {
    raw.prepare(`INSERT INTO commerce_sales (${Object.keys(saleRow).join(",")}) VALUES (${Object.keys(saleRow).map(() => "?").join(",")})`).run(...Object.values(saleRow));
    raw.exec("PRAGMA foreign_keys = ON");
  }
  assert.deepEqual(ledger(), beforeLedger, "History reads never rewrite historical ledger rows.");
  assert.deepEqual(raw.prepare("SELECT * FROM customer_credit_balances WHERE customer_id = ?").all(customerId), beforeBalances);
}

function verifyIpc(databasePath, customerId, cart, account, raw) {
  const handlers = new Map();
  const exports = {};
  runInNewContext(readFileSync(join(appPath, "dist-electron/commerce-ipc.js"), "utf8"), {
    exports,
    require: (id) => id === "electron" ? { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } } : runtime
  });
  const mainEntry = readFileSync(join(appPath, "electron/main-entry.ts"), "utf8");
  assert.ok(/registerCommerceIpcHandlers\(\{\s*databasePath,[\s\S]*?assertUnlocked: assertAppSessionUnlocked/.test(mainEntry));
  const registry = readFileSync(join(appPath, "dist-electron/desktop-ipc-registry.js"), "utf8");
  assert.ok(/registerAppLockIpcHandlers.{0,10}\(getAppLockService\(\)\)/.test(registry));
  const lockServiceExports = {};
  runInNewContext(readFileSync(join(appPath, "dist-electron/app-lock-service.js"), "utf8"), {
    exports: lockServiceExports,
    require: (id) => {
      if (id === "./app-lock") return require("../apps/desktop-app/dist-electron/app-lock.js");
      if (id === "./sync-config") return require("../apps/desktop-app/dist-electron/sync-config.js");
      throw new Error(`unexpected app-lock-service require: ${id}`);
    },
    process,
    Buffer
  });
  const lockService = new lockServiceExports.DesktopAppLockService({
    database: {
      getAppLockPasswordVerifier: () => "",
      getAppLockNotificationCount: () => 0,
      getSetupData: () => ({ syncSecret: "" })
    },
    getSyncStatus: () => undefined,
    onUnlocked: () => {}
  });
  const lock = {
    assertAppSessionUnlocked: () => lockService.assertUnlocked(),
    set: (value) => {
      if (value) {
        lockService.lock();
      } else {
        void lockService.unlock("");
      }
    }
  };
  let mutations = 0;
  exports.registerCommerceIpcHandlers({ databasePath: () => databasePath, assertUnlocked: lock.assertAppSessionUnlocked,
    onMutation: () => { mutations += 1; } });
  const calls = [
    ["list", { databasePath: "/invalid" }], ["get", customerId], ["entries", customerId],
    ["sale", { ...cart, databasePath: "/invalid" }],
    ["payment", { customerId, amountMinor: 1, currency: "TRY", paymentMethod: "cash", databasePath: "/invalid" }],
    ["adjustment", { customerId, amountMinor: 1, currency: "TRY", entryType: "adjustment_debit", note: "IPC", source: "smoke", databasePath: "/invalid" }]
  ];
  const preload = readFileSync(join(appPath, "electron/preload.ts"), "utf8");
  for (const [name, input] of calls) {
    const channel = `commerce:customerCredit:${name}`;
    assert.ok(handlers.has(channel));
    assert.equal(preload.split(`"${channel}"`).length - 1, 1);
    const handler = handlers.get(channel);
    lock.set(true);
    assert.throws(() => handler({}, input), /kilitli/);
    lock.set(false);
    handler({}, input);
  }
  assert.equal(mutations, 3, "Only committed mutations notify the owner.");
  assert.throws(() => handlers.get("commerce:customerCredit:payment")({}, { ...calls[4][1], amountMinor: 0 }), /tutar/i);
  assert.equal(mutations, 3);
  const preserved = account();
  const businessId = preserved.customer.businessId;
  raw.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE business_id = ? AND capability_id = ?").run(businessId, C.CUSTOMER_CREDIT);
  for (const [name, input] of calls) assert.throws(() => handlers.get(`commerce:customerCredit:${name}`)({}, input), /etkin değil/i);
  assert.equal(mutations, 3);
  raw.prepare("UPDATE business_capabilities SET is_enabled = 1 WHERE business_id = ? AND capability_id = ?").run(businessId, C.CUSTOMER_CREDIT);
  assert.deepEqual(account(), preserved);
}
