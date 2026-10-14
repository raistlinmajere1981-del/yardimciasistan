import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";

const require = createRequire(import.meta.url);
const { DesktopFinanceService, synchronizeFinanceSourceInTransaction: sync,
  reconcileMissingCommerceSaleFinanceInTransaction: reconcile } = require("../apps/desktop-app/dist-electron/finance.js");
const { completeMarketSale } = require("../apps/desktop-app/dist-electron/market-sale-operation.js");
const { createCommerceSaleFromOrderSnapshotInTransaction } = require("../apps/desktop-app/dist-electron/commerce-store.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS } = require("../packages/sync-core/dist");
const runtime = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const credit = require("../apps/desktop-app/dist-electron/customer-credit-runtime.js");
const { database, cleanup } = createTemporaryDesktopDatabase("market-sale-finance-");
const ok = result => { assert.equal(result.ok, true, result.message); return result; };
const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 86_400_000).toISOString();
let db;

try {
  database.initialize();
  ok(database.saveInitialSetup(createSmokeSetupInput({ profileId: "market", businessName: "Market finance fixture",
    phone: "", whatsapp: "", syncSecret: "finance-fixture-only", servicePreferences: { android: true, whatsapp: false },
    initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] })));
  const path = database.databasePath;
  setBusinessCapability(path, { capability: "commerce.customer_credit", enabled: true });
  db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
  const finance = new DesktopFinanceService(path);
  const customerId = ok(database.saveCustomer({ fullName: "Finance fixture customer" })).savedId;
  const product = runtime.saveRuntimeCatalogProduct(path, { name: "Paid product", salePrice: 25.55, trackInventory: true });
  const scarce = runtime.saveRuntimeCatalogProduct(path, { name: "Scarce product", salePrice: 3.19, trackInventory: true });
  const small = runtime.saveRuntimeCatalogProduct(path, { name: "Minor precision", salePrice: 0.29, trackInventory: false });
  const euro = runtime.saveRuntimeCatalogProduct(path, { name: "Euro product", salePrice: 12.34, currency: "EUR", trackInventory: false });
  for (const [item, quantity] of [[product, 40], [scarce, 1]]) {
    runtime.applyRuntimeInventoryMovement(path, { productId: item.id, type: "purchase", quantityDelta: quantity });
  }
  const locationId = db.prepare("SELECT id FROM inventory_locations WHERE is_primary = 1 AND deleted_at = '' LIMIT 1").get().id;
  const businessId = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at LIMIT 1").get().id;
  const tables = ["commerce_sales", "commerce_sale_items", "inventory_balances", "inventory_movements", "customer_credit_entries",
    "finance_entries", "finance_categories", "commerce_market_sale_receipts", "android_action_receipts", "events", "sync_outbox"];
  const state = () => tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const stock = id => runtime.getRuntimeInventoryBalance(path, id).quantity;
  const transaction = operation => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const entry = id => db.prepare("SELECT * FROM finance_entries WHERE source_type = 'commerce_sale' AND source_id = ?").get(id);
  const assertEntry = (sale, amountMinor, method = sale.paymentMethod) => {
    const saved = entry(sale.id);
    assert.ok(saved);
    assert.deepEqual([saved.direction, saved.amount_minor, saved.currency, saved.payment_method, saved.category, saved.description,
      saved.occurred_at, saved.source_type, saved.source_id, saved.note, saved.deleted_at],
    ["income", amountMinor, sale.currency, method, "market", "Market satışı", sale.closedAt || sale.createdAt, "commerce_sale", sale.id, "", ""]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM finance_entries WHERE source_type = 'commerce_sale' AND source_id = ?").get(sale.id).n, 1);
    return saved;
  };
  const assertToday = income => {
    const data = finance.getData();
    assert.equal(data.todayIncomeMinor, income);
    assert.equal(data.todayExpenseMinor, 200);
    assert.equal(data.todayNetMinor, income - 200);
  };
  ok(finance.saveManualEntry({ direction: "income", amountMinor: 5000, paymentMethod: "cash", category: "other_income", description: "Existing manual revenue" }));
  ok(finance.saveManualEntry({ direction: "expense", amountMinor: 200, paymentMethod: "cash", category: "other_expense", description: "Existing expense" }));

  // A failure on the second product must restore the first product's consumed stock too.
  const insufficient = { settlement: "paid", operationId: "finance_stock_failure", paymentMethod: "cash",
    items: [{ productId: product.id, quantity: 1 }, { productId: scarce.id, quantity: 2 }] };
  let before = state();
  assert.throws(() => completeMarketSale(path, insufficient), /yetersiz stok/i);
  assert.deepEqual(state(), before);
  assert.equal(stock(product.id), 40);
  assert.equal(stock(scarce.id), 1);

  // Ledger failure must also roll back category seeding and all preceding sale/stock writes.
  db.prepare("DELETE FROM finance_categories WHERE id = 'market'").run();
  before = state();
  db.exec("CREATE TRIGGER fixture_sale_finance_fail BEFORE INSERT ON finance_entries WHEN NEW.source_type = 'commerce_sale' BEGIN SELECT RAISE(ABORT, 'fixture_sale_finance_fail'); END");
  assert.throws(() => completeMarketSale(path, { settlement: "paid", operationId: "finance_ledger_failure", items: [{ productId: product.id, quantity: 1 }] }), /fixture_sale_finance_fail/);
  assert.deepEqual(state(), before);
  db.exec("DROP TRIGGER fixture_sale_finance_fail");

  const cash = runtime.createRuntimePaidSale(path, { paymentMethod: "cash", discountTotal: 1.10, items: [{ productId: product.id, quantity: 2 }] });
  assert.equal(cash.total, 50);
  assertEntry(cash, 5000);
  const cardInput = { settlement: "paid", operationId: "finance_desktop_card", paymentMethod: "card", items: [{ productId: product.id, quantity: 0.375 }] };
  const card = completeMarketSale(path, cardInput);
  assertEntry(card.sale, 958);
  before = state();
  const replay = completeMarketSale(path, cardInput);
  assert.equal(replay.replayed, true);
  assert.equal(replay.sale.id, card.sale.id);
  assert.deepEqual(state(), before, "Desktop receipt replay must not rewrite stock or finance");
  transaction(() => { sync(db, "commerce_sale", cash.id); sync(db, "commerce_sale", cash.id); });
  assertEntry(cash, 5000);
  assert.equal(stock(product.id), 37.625);
  const category = finance.getData().categories.find(item => item.id === "market");
  assert.deepEqual([category.direction, category.name, category.isSystem, category.isActive], ["income", "Market", true, true]);
  assert.equal(finance.deleteCategory("market").ok, false);
  assert.equal(finance.deleteManualEntry(entry(cash.id).id).ok, false);
  assertToday(10958);

  for (const method of ["bank", "other", "old-terminal-method"]) {
    const sale = runtime.createRuntimePaidSale(path, { paymentMethod: method, items: [{ productId: small.id, quantity: 1 }] });
    assertEntry(sale, 29, method === "old-terminal-method" ? "other" : method);
  }
  const foreignCurrency = runtime.createRuntimePaidSale(path, { paymentMethod: "bank", items: [{ productId: euro.id, quantity: 1 }] });
  assertEntry(foreignCurrency, 1234);
  const zero = completeMarketSale(path, { settlement: "paid", operationId: "finance_zero_sale", discountTotal: 1, items: [{ productId: small.id, quantity: 1 }] });
  assert.equal(zero.sale.total, 0);
  assert.equal(entry(zero.sale.id), undefined);
  assertToday(11045);
  console.log("PASS Desktop cash/card, precision, payment methods, category, currency and receipt replay");

  const deviceId = "finance-android-fixture";
  database.upsertAndroidDeviceSightings([{ device_id: deviceId, device_name: "Finance fixture", app_version: "test", first_seen_at: now, last_seen_at: now }]);
  ok(database.setAndroidDeviceActive(deviceId, true));
  ok(database.setAndroidDevicePermissionGroups(deviceId, { ...ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS, market_operations: true,
    market_sales: true, customer_credit_view: true, customer_credit_payment: true }));
  const action = (id, method, lines, settlement = "paid") => ({ id: `mobile_finance_${id}`, action_type: "market_sale_complete",
    device_id: deviceId, device_name: "Finance fixture", app_version: "test", created_at: now, last_seen_at: now,
    payload: { settlement, location_id: locationId, customer_id: settlement === "credit" ? customerId : "",
      payment_method: method, external_payment_confirmed: method === "card", lines: lines.map(([item, quantity]) => ({
        product_id: item.id, quantity, expected_unit_price: item.salePrice, expected_currency: item.currency, expected_updated_at: item.updatedAt })) } });
  const androidCash = action("cash", "cash", [[product, 2]]);
  before = state();
  db.exec("CREATE TRIGGER fixture_android_finance_fail BEFORE INSERT ON finance_entries WHEN NEW.source_type = 'commerce_sale' BEGIN SELECT RAISE(ABORT, 'fixture_android_finance_fail'); END");
  assert.equal(database.applyAndroidAction(androidCash).ok, false);
  assert.deepEqual(state(), before);
  db.exec("DROP TRIGGER fixture_android_finance_fail");
  db.exec("CREATE TRIGGER fixture_android_receipt_fail BEFORE INSERT ON android_action_receipts WHEN NEW.id = 'mobile_finance_cash' BEGIN SELECT RAISE(ABORT, 'fixture_android_receipt_fail'); END");
  assert.equal(database.applyAndroidAction(androidCash).ok, false);
  assert.deepEqual(state(), before, "Receipt failure must roll back already-written income and stock");
  db.exec("DROP TRIGGER fixture_android_receipt_fail");
  ok(database.applyAndroidAction(androidCash));
  const androidSaleId = id => db.prepare("SELECT sale_id FROM commerce_market_sale_receipts WHERE operation_id = ?").get(id).sale_id;
  const androidEntry = entry(androidSaleId(androidCash.id));
  assert.deepEqual([androidEntry.amount_minor, androidEntry.payment_method, androidEntry.category], [5110, "cash", "market"]);
  before = state();
  assert.equal(ok(database.applyAndroidAction(androidCash)).alreadyApplied, true);
  assert.deepEqual(state(), before);
  const androidCard = action("card", "card", [[scarce, 1]]);
  ok(database.applyAndroidAction(androidCard));
  const mobileCardEntry = entry(androidSaleId(androidCard.id));
  assert.deepEqual([mobileCardEntry.amount_minor, mobileCardEntry.payment_method], [319, "card"]);
  before = state();
  assert.equal(database.applyAndroidAction(action("insufficient_stock", "cash", [[product, 1], [scarce, 1]])).ok, false);
  assert.deepEqual(state(), before);
  assertToday(16474);

  const creditInput = { settlement: "credit", customerId, operationId: "finance_desktop_credit", items: [{ productId: product.id, quantity: 1 }] };
  const desktopCredit = completeMarketSale(path, creditInput);
  assert.equal(entry(desktopCredit.sale.id), undefined);
  const androidCredit = action("credit", "", [[product, 1]], "credit");
  ok(database.applyAndroidAction(androidCredit));
  assert.equal(entry(androidSaleId(androidCredit.id)), undefined);
  before = state();
  assert.equal(completeMarketSale(path, creditInput).replayed, true);
  assert.equal(ok(database.applyAndroidAction(androidCredit)).alreadyApplied, true);
  assert.deepEqual(state(), before);
  assert.equal(credit.getCustomerCreditAccount(path, customerId).balances[0].amountMinor, 5110);
  assertToday(16474);
  const payment = credit.recordCustomerCreditPayment(path, { customerId, amountMinor: 1000, currency: "TRY", paymentMethod: "cash" });
  assert.equal(db.prepare("SELECT amount_minor FROM finance_entries WHERE source_type = 'customer_credit_payment' AND source_id = ?").get(payment.id).amount_minor, 1000);
  assert.equal(credit.getCustomerCreditAccount(path, customerId).balances[0].amountMinor, 4110);
  assertToday(17474);
  console.log("PASS Android cash/card, finance/receipt/stock rollback, paid/credit retries and credit collection separation");

  // Order snapshots use the same commerce source while keeping the accepted Order price.
  const orderInput = { subtotal: 3, discountTotal: 0, total: 3, currency: "TRY", paymentMethod: "bank", source: "commerce-order-fixture",
    items: [{ productId: small.id, productName: "Order snapshot", barcode: "", unitPrice: 1, quantity: 3, lineTotal: 3 }] };
  const fulfilled = transaction(() => createCommerceSaleFromOrderSnapshotInTransaction(db, orderInput, "paid", now));
  assertEntry(fulfilled.sale, 300);
  const noPayment = transaction(() => createCommerceSaleFromOrderSnapshotInTransaction(db, { ...orderInput,
    subtotal: 0, total: 0, paymentMethod: "none", items: [{ ...orderInput.items[0], unitPrice: 0, lineTotal: 0 }] }, "paid", now));
  assert.equal(entry(noPayment.sale.id), undefined);
  assertToday(17774);

  const insertLegacySale = (id, { status = "paid", total = 50, currency = "TRY", method = "cash", createdAt = now, closedAt = now, deletedAt = "" } = {}) => {
    db.prepare(`INSERT INTO commerce_sales (id, business_id, status, subtotal, total, currency, payment_method, opened_at, closed_at, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, businessId, status, total, total, currency, method, createdAt, closedAt, createdAt, createdAt, deletedAt);
  };
  insertLegacySale("historical_lifecycle", { total: 1.01, createdAt: yesterday, closedAt: "" });
  assert.throws(() => sync(db, "commerce_sale", "historical_lifecycle"), /requires a transaction/);
  transaction(() => sync(db, "commerce_sale", "historical_lifecycle"));
  const lifecycleId = entry("historical_lifecycle").id;
  assert.equal(entry("historical_lifecycle").occurred_at, yesterday, "Missing closed_at falls back to created_at");
  transaction(() => {
    db.prepare("UPDATE commerce_sales SET total = 2.89, currency = 'EUR', payment_method = 'bank', closed_at = ?, updated_at = ? WHERE id = 'historical_lifecycle'").run(now, now);
    sync(db, "commerce_sale", "historical_lifecycle");
  });
  assert.deepEqual([entry("historical_lifecycle").id, entry("historical_lifecycle").amount_minor, entry("historical_lifecycle").currency,
    entry("historical_lifecycle").payment_method, entry("historical_lifecycle").occurred_at], [lifecycleId, 289, "EUR", "bank", now]);
  for (const status of ["open", "cancelled", "credit"]) {
    transaction(() => {
      db.prepare("UPDATE commerce_sales SET status = ?, updated_at = ? WHERE id = 'historical_lifecycle'").run(status, now);
      sync(db, "commerce_sale", "historical_lifecycle");
    });
    assert.equal(entry("historical_lifecycle").deleted_at, now);
    assert.equal(finance.getData().recentEntries.some(item => item.id === lifecycleId), false);
    transaction(() => {
      db.prepare("UPDATE commerce_sales SET status = 'paid' WHERE id = 'historical_lifecycle'").run();
      sync(db, "commerce_sale", "historical_lifecycle");
    });
    assert.equal(entry("historical_lifecycle").id, lifecycleId);
    assert.equal(entry("historical_lifecycle").deleted_at, "");
  }
  before = state();
  assert.throws(() => transaction(() => {
    db.prepare("UPDATE commerce_sales SET total = ? WHERE id = 'historical_lifecycle'").run(Number.MAX_SAFE_INTEGER);
    sync(db, "commerce_sale", "historical_lifecycle");
  }), /güvenli sınır/);
  assert.deepEqual(state(), before, "Unsafe money conversion must roll back the source update");
  for (const total of [0, 0.001]) {
    transaction(() => {
      db.prepare("UPDATE commerce_sales SET total = ? WHERE id = 'historical_lifecycle'").run(total);
      sync(db, "commerce_sale", "historical_lifecycle");
    });
    assert.equal(entry("historical_lifecycle").deleted_at, now);
  }
  transaction(() => {
    db.prepare("UPDATE commerce_sales SET total = 2.89, deleted_at = ? WHERE id = 'historical_lifecycle'").run(now);
    sync(db, "commerce_sale", "historical_lifecycle");
  });
  assert.equal(entry("historical_lifecycle").deleted_at, now);
  // Repair must not resurrect an existing deleted finance link, even if its source is paid again.
  db.prepare("UPDATE commerce_sales SET deleted_at = '' WHERE id = 'historical_lifecycle'").run();
  assertToday(17774);
  console.log("PASS Order snapshot finance, zero/no_payment, source updates, removal/reactivation and safe conversion rollback");

  insertLegacySale("legacy_paid_cash");
  insertLegacySale("legacy_paid_card", { total: 12.34, method: "card", createdAt: yesterday, closedAt: yesterday });
  insertLegacySale("legacy_paid_bank", { total: 9.87, currency: "EUR", method: "bank" });
  insertLegacySale("legacy_zero", { total: 0, method: "none" });
  insertLegacySale("legacy_subminor", { total: 0.001 });
  insertLegacySale("legacy_credit", { status: "credit", method: "" });
  insertLegacySale("legacy_open", { status: "open" });
  insertLegacySale("legacy_cancelled", { status: "cancelled" });
  insertLegacySale("legacy_deleted", { deletedAt: now });
  const untouchedTables = ["commerce_sales", "commerce_sale_items", "inventory_balances", "inventory_movements", "customer_credit_entries",
    "commerce_market_sale_receipts", "android_action_receipts"];
  const untouched = () => untouchedTables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const sourcesBeforeRepair = untouched();
  const manualBeforeRepair = db.prepare("SELECT * FROM finance_entries WHERE source_type = 'manual' ORDER BY id").all();
  assert.throws(() => reconcile(db), /requires a transaction/);
  const script = resolve("scripts/reconcile-commerce-sale-finance.mjs");
  const runScript = (target, apply = true) => {
    const stdoutPath = join(dirname(path), "reconciliation.stdout");
    const stderrPath = join(dirname(path), "reconciliation.stderr");
    const stdout = openSync(stdoutPath, "w"), stderr = openSync(stderrPath, "w");
    let result;
    try {
      result = spawnSync(process.execPath, [script, target, ...(apply ? ["--apply"] : [])],
        { stdio: ["ignore", stdout, stderr], timeout: 10_000 });
    } finally { closeSync(stdout); closeSync(stderr); }
    assert.equal(result.error, undefined);
    return { status: result.status, stdout: readFileSync(stdoutPath, "utf8"), stderr: readFileSync(stderrPath, "utf8") };
  };
  before = state();
  db.exec("CREATE TRIGGER fixture_reconcile_failure BEFORE INSERT ON finance_entries WHEN NEW.source_id = 'legacy_paid_cash' BEGIN SELECT RAISE(ABORT, 'fixture_reconcile_failure'); END");
  assert.throws(() => transaction(() => reconcile(db)), /fixture_reconcile_failure/);
  assert.deepEqual(state(), before);
  const failedScript = runScript(path);
  assert.equal(failedScript.status, 1);
  assert.match(failedScript.stderr, /fixture_reconcile_failure/);
  assert.deepEqual(state(), before, "CLI repair failure must roll back earlier repair inserts");
  db.exec("DROP TRIGGER fixture_reconcile_failure");
  assert.equal(transaction(() => reconcile(db)).reconciledCount, 3);
  before = state();
  assert.equal(transaction(() => reconcile(db)).reconciledCount, 0);
  assert.deepEqual(state(), before, "Second reconciliation must leave all existing entries unchanged");
  assert.deepEqual(untouched(), sourcesBeforeRepair);
  assert.deepEqual(db.prepare("SELECT * FROM finance_entries WHERE source_type = 'manual' ORDER BY id").all(), manualBeforeRepair,
    "Unlinked manual income cannot be inferred as a sale duplicate");
  assert.equal(entry("legacy_paid_cash").amount_minor, 5000);
  assert.equal(entry("legacy_paid_card").occurred_at, yesterday);
  assert.equal(entry("legacy_paid_bank").currency, "EUR");
  for (const id of ["legacy_zero", "legacy_subminor", "legacy_credit", "legacy_open", "legacy_cancelled", "legacy_deleted"]) assert.equal(entry(id), undefined);
  assert.equal(entry("historical_lifecycle").deleted_at, now);
  assertToday(22774);

  insertLegacySale("legacy_cli_only", { total: 10.35 });
  const cli = runScript(path);
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /bağlantısı: 1/);
  before = state();
  const cliReplay = runScript(path);
  assert.equal(cliReplay.status, 0, cliReplay.stderr);
  assert.match(cliReplay.stdout, /bağlantısı: 0/);
  assert.deepEqual(state(), before);
  const missingPath = join(dirname(path), "must-not-create.sqlite");
  assert.equal(runScript(missingPath).status, 1);
  assert.equal(existsSync(missingPath), false);
  assert.equal(runScript(path, false).status, 1, "CLI requires explicit --apply");
  assert.deepEqual(state(), before);
  assertToday(23809);
  assert.equal(finance.getData().recentEntries.some(item => item.sourceType === "commerce_sale" && item.sourceId === cash.id), true);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log("PASS Reconciliation helper/CLI twice, atomic repair failure, manual/source isolation and daily TRY totals");
  console.log("market-sale-finance-smoke-ok");
} finally {
  db?.close();
  cleanup();
}
