import assert from "node:assert/strict";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { saleFixture, databaseState, completeMarketSale, completeMarketSaleInTransaction,
  synchronizeFinanceSourceInTransaction, withCommerceBenefitsTransaction, marketSaleBenefitsPorts, CommerceBenefitsStore } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { context, exampleRules, installRules, adjust, balance, engine, secretKey } from "./test-helpers/commerce-benefits-fixture.mjs";

const use = t => { const f = saleFixture(); t.after(() => f.close()); return f; };
const activeRules = () => exampleRules().filter(rule => rule.family !== "coupon").map(rule => ({ ...rule, startsAt: 0 }));
const quote = (overrides = {}) => engine.calculateCommerceBenefits(context(overrides), activeRules());
const command = (id, overrides = {}) => ({ settlement: "paid", customerId: "c1", locationId: "loc", operationId: id,
  paymentMethod: "bank", paymentAmountMinor: 85000, items: [{ productId: "p1", quantity: 1 }],
  benefits: { requestedPointsMinor: 10000, expectedQuote: quote() }, ...overrides });
const setup = f => { installRules(f, activeRules()); adjust(f); };
const code = (fn, expected) => assert.throws(fn, error => error.code === expected, expected);

test("canonical non-benefit sales bind only an active same-business customer atomically", t => {
  const f = use(t);
  const base = { settlement: "paid", paymentMethod: "cash", locationId: "loc", items: [{ productId: "p1", quantity: 1 }] };
  const linked = completeMarketSale(f.path, { ...base, customerId: "c1", operationId: "customer_sale_one" });
  assert.equal(f.db.prepare("SELECT customer_id FROM commerce_sales WHERE id = ?").get(linked.sale.id).customer_id, "c1");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_sale_settlements").get().n, 0);
  assert.equal(f.db.prepare("SELECT amount_minor FROM finance_entries WHERE source_id = ?").get(linked.sale.id).amount_minor, 100000);
  const anonymous = completeMarketSale(f.path, { ...base, operationId: "anonymous_sale_1" });
  assert.equal(f.db.prepare("SELECT customer_id FROM commerce_sales WHERE id = ?").get(anonymous.sale.id).customer_id, null);
  assert.throws(() => f.db.prepare("UPDATE commerce_sales SET customer_id = 'c3' WHERE id = ?").run(anonymous.sale.id), /FOREIGN KEY/);
  for (const customerId of ["c3", "missing"]) {
    const before = databaseState(f.db);
    assert.throws(() => completeMarketSale(f.path, { ...base, customerId, operationId: `invalid_${customerId}` }), /müşteri/i);
    assert.deepEqual(databaseState(f.db), before);
  }
  f.db.prepare("UPDATE customers SET deleted_at='deleted' WHERE id='c2'").run();
  const before = databaseState(f.db);
  assert.throws(() => completeMarketSale(f.path, { ...base, customerId: "c2", operationId: "deleted_customer" }), /müşteri/i);
  assert.deepEqual(databaseState(f.db), before);
  f.db.exec("CREATE TRIGGER fail_sale_link BEFORE INSERT ON finance_entries WHEN NEW.source_type='commerce_sale' BEGIN SELECT RAISE(ABORT, 'link_rollback'); END");
  assert.throws(() => completeMarketSale(f.path, { ...base, customerId: "c1", operationId: "rollback_customer" }), /link_rollback/);
  assert.deepEqual(databaseState(f.db), before);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("real paid sale: discount + Puan tender + earning, stock, Finance and outbox commit together", t => {
  const f = use(t); setup(f);
  const outbox = f.db.prepare("SELECT source_revision FROM sync_outbox WHERE job_key = 'menu'").get();
  const result = completeMarketSale(f.path, command("benefits_success"), f.authority);
  assert.equal(result.sale.total, 950, "Sale total includes the Puan tender; it is not a discount");
  assert.equal(result.sale.discountTotal, 50);
  assert.deepEqual(result.benefits.quote, quote());
  assert.equal(result.benefits.source.kind, "sale");
  assert.equal(result.benefits.source.id, result.sale.id);
  assert.equal(balance(f).availableMinor, 2125);
  assert.equal(f.db.prepare("SELECT quantity FROM inventory_balances WHERE product_id = 'p1'").get().quantity, 49);
  const tender = f.db.prepare("SELECT * FROM commerce_sale_settlements WHERE sale_id = ?").get(result.sale.id);
  assert.deepEqual([tender.customer_id, tender.points_tender_minor, tender.cash_received_minor], ["c1", 10000, 85000]);
  assert.equal(f.db.prepare("SELECT customer_id FROM commerce_sales WHERE id = ?").get(result.sale.id).customer_id, "c1");
  assert.equal(f.db.prepare("SELECT amount_minor FROM finance_entries WHERE source_type = 'commerce_sale' AND source_id = ?").get(result.sale.id).amount_minor, 85000);
  assert.ok(f.db.prepare("SELECT source_revision FROM sync_outbox WHERE job_key = 'menu'").get().source_revision > (outbox?.source_revision ?? 0));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM commerce_market_sale_receipts").get().n, 1);
  withCommerceBenefitsTransaction(f.db, Date.now(), () => synchronizeFinanceSourceInTransaction(f.db, "commerce_sale", result.sale.id));
  assert.equal(f.db.prepare("SELECT amount_minor FROM finance_entries WHERE source_id = ?").get(result.sale.id).amount_minor, 85000);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("exact replay survives changed prices/rules; changed intent and second source cannot apply again", t => {
  const f = use(t); setup(f);
  const input = command("benefits_replay");
  const first = completeMarketSale(f.path, input, f.authority);
  f.db.prepare("UPDATE catalog_products SET sale_price = 2000 WHERE id = 'p1'").run();
  const before = databaseState(f.db);
  const replay = completeMarketSale(f.path, input, f.authority);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.benefits, first.benefits);
  assert.deepEqual(databaseState(f.db), before);
  assert.throws(() => completeMarketSale(f.path, { ...input, benefits: { ...input.benefits, requestedPointsMinor: 0 } }, f.authority), /farklı bir satış/);
  const reservation = f.db.prepare("SELECT intent_json FROM commerce_benefit_reservations").get();
  const bound = JSON.parse(reservation.intent_json);
  const store = new CommerceBenefitsStore(secretKey, marketSaleBenefitsPorts(f.authority.actor, bound));
  code(() => withCommerceBenefitsTransaction(f.db, Date.now(), tx => store.reserve(tx, { ...bound, couponCodes: [] }, "second_source")), "BENEFITS_SOURCE_ALREADY_SETTLED");
  assert.deepEqual(databaseState(f.db), before);
});

for (const [name, table, when] of [
  ["finance", "finance_entries", "NEW.source_type = 'commerce_sale'"],
  ["spend", "commerce_benefit_point_ledger", "NEW.kind = 'spend'"],
  ["grant", "commerce_benefit_point_ledger", "NEW.kind = 'grant'"],
  ["snapshot", "commerce_benefit_snapshots", "1"],
  ["source receipt", "commerce_market_sale_receipts", "1"]
]) test(`${name} failure rolls back every table including stock/outbox/holds/Finance`, t => {
  const f = use(t); setup(f);
  f.db.exec(`CREATE TRIGGER fail_benefits BEFORE INSERT ON ${table} WHEN ${when} BEGIN SELECT RAISE(ABORT, 'injected_benefits_failure'); END`);
  const before = databaseState(f.db);
  assert.throws(() => completeMarketSale(f.path, command("benefits_failure"), f.authority), /injected_benefits_failure/);
  assert.deepEqual(databaseState(f.db), before);
});

test("stock failure after reservation fully rolls back; retry succeeds once", t => {
  const f = use(t); setup(f);
  f.db.prepare("UPDATE inventory_balances SET quantity = 0 WHERE product_id = 'p1'").run();
  const before = databaseState(f.db);
  assert.throws(() => completeMarketSale(f.path, command("benefits_stock_retry"), f.authority), /Yetersiz stok/);
  assert.deepEqual(databaseState(f.db), before);
  f.db.prepare("UPDATE inventory_balances SET quantity = 1 WHERE product_id = 'p1'").run();
  assert.equal(completeMarketSale(f.path, command("benefits_stock_retry"), f.authority).replayed, false);
  assert.equal(completeMarketSale(f.path, command("benefits_stock_retry"), f.authority).replayed, true);
});

test("disabled/no opt-in preserves legacy sale and receipt; never touches secure keys or benefits", t => {
  const f = use(t);
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.benefits'").run();
  const input = { settlement: "paid", operationId: "disabled_legacy_sale", items: [{ productId: "p1", quantity: 1 }], discountTotal: 10 };
  const result = completeMarketSale(f.path, input, f.authority);
  assert.equal(result.sale.total, 990);
  assert.equal(result.benefits, undefined);
  assert.equal(f.state.keyLoads, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM commerce_sale_settlements").get().n, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM commerce_benefit_receipts").get().n, 0);
  const before = databaseState(f.db);
  assert.equal(completeMarketSale(f.path, input).replayed, true);
  code(() => completeMarketSale(f.path, command("disabled_opt_in"), f.authority), "BENEFITS_CAPABILITY_DISABLED");
  assert.deepEqual(databaseState(f.db), before);
});

test("server actor/customer/prices/method and full payment gates reject without effects", t => {
  const f = use(t); setup(f);
  const before = databaseState(f.db);
  code(() => completeMarketSale(f.path, command("no_authority")), "BENEFITS_STAFF_REQUIRED");
  for (const overrides of [
    { settlement: "credit", paymentAmountMinor: 0 }, { paymentAmountMinor: 0 }, { paymentAmountMinor: 84999 },
    { paymentAmountMinor: 85001 }, { discountTotal: 1 }, { customerId: "c3" },
    { customerId: "missing" }, { paymentMethod: "cash" },
    { benefits: { requestedPointsMinor: 10000, expectedQuote: { ...quote(), payableMinor: 1 } } },
    { benefits: { requestedPointsMinor: 10000, expectedQuote: quote(), couponCodes: ["not-supported"] } },
    { items: [{ productId: "p1", quantity: 1, expectedUnitPrice: 1 }] },
    { items: [{ productId: "p1", quantity: 2 }] }
  ]) assert.throws(() => completeMarketSale(f.path, command("rejected_sale", overrides), f.authority));
  f.state.authorized = false;
  assert.throws(() => completeMarketSale(f.path, command("revoked_actor"), f.authority));
  assert.deepEqual(databaseState(f.db), before);
  f.state.authorized = true;
  f.db.prepare("UPDATE catalog_products SET sale_price = 1001 WHERE id = 'p1'").run();
  const changed = databaseState(f.db);
  code(() => completeMarketSale(f.path, command("stale_prices"), f.authority), "BENEFITS_QUOTE_CHANGED");
  assert.deepEqual(databaseState(f.db), changed);
});

test("earn-only full payment, anonymous no earning, transfer canonicalization and all-Puan tender", t => {
  const f = use(t); setup(f);
  const earning = command("earn_only", { paymentMethod: "transfer", paymentAmountMinor: 95000,
    benefits: { requestedPointsMinor: 0, expectedQuote: quote({ requestedPointsMinor: 0 }) } });
  const paid = completeMarketSale(f.path, earning, f.authority);
  assert.equal(paid.sale.paymentMethod, "bank");
  assert.equal(paid.benefits.pointSpendEntryId, null);
  assert.equal(paid.benefits.quote.pointsEarnPreviewMinor, 2375);
  const anonymous = command("anonymous_paid", { customerId: "", paymentAmountMinor: 95000,
    benefits: { requestedPointsMinor: 0, expectedQuote: quote({ customerId: null, requestedPointsMinor: 0 }) } });
  assert.equal(completeMarketSale(f.path, anonymous, f.authority).benefits.pointGrantEntryId, null);
  adjust(f, 100000, { operationKey: "fund_all_points" });
  const allPoints = command("all_points", { paymentAmountMinor: 0,
    benefits: { requestedPointsMinor: 95000, expectedQuote: quote({ requestedPointsMinor: 95000, availablePointsMinor: 200000 }) } });
  const result = completeMarketSale(f.path, allPoints, f.authority);
  assert.equal(result.benefits.quote.pointsTenderMinor, 95000);
  assert.equal(result.benefits.quote.discountMinor, 5000);
  assert.equal(f.db.prepare("SELECT 1 FROM finance_entries WHERE source_id = ?").get(result.sale.id), undefined);
});

test("external transaction cannot obtain benefits writes without canonical benefits transaction", t => {
  const f = use(t); setup(f);
  const before = databaseState(f.db);
  f.db.exec("BEGIN IMMEDIATE");
  try { code(() => completeMarketSaleInTransaction(f.db, command("external_tx"), new Date().toISOString()), "BENEFITS_PARENT_TRANSACTION_REQUIRED"); }
  finally { f.db.exec("ROLLBACK"); }
  assert.deepEqual(databaseState(f.db), before);
});

test("canonical dealer prices are resolved inside the sale; disabled Wholesale returns to retail", t => {
  const f = use(t); setup(f);
  f.db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','commerce.wholesale','fixture','fixture')").run();
  f.db.prepare(`INSERT INTO customer_commercial_profiles(customer_id,business_id,company_name,dealer_status,price_group,created_at,updated_at)
    VALUES ('c1','b1','Dealer','active','dealer_a','fixture','fixture')`).run();
  const dealerQuote = quote({ requestedPointsMinor: 0, priceGroup: "dealer_a",
    lines: [{ id: "line1", productId: "p1", categoryId: "category1", unitPriceMinor: 80000, quantityTenThousandths: 10000 }] });
  const input = command("dealer_pricing", { paymentAmountMinor: dealerQuote.payableMinor,
    benefits: { requestedPointsMinor: 0, expectedQuote: dealerQuote } });
  const result = completeMarketSale(f.path, input, f.authority);
  assert.equal(result.sale.subtotal, 800);
  assert.equal(result.benefits.quote.pointsEarnPreviewMinor, 1900);
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.wholesale'").run();
  const before = databaseState(f.db);
  code(() => completeMarketSale(f.path, { ...input, operationId: "dealer_disabled" }, f.authority), "BENEFITS_QUOTE_CHANGED");
  assert.deepEqual(databaseState(f.db), before);
  const retail = command("retail_fallback", { paymentAmountMinor: 95000,
    benefits: { requestedPointsMinor: 0, expectedQuote: quote({ requestedPointsMinor: 0 }) } });
  assert.equal(completeMarketSale(f.path, retail, f.authority).sale.subtotal, 1000);
});

for (const state of ["open", "credit"]) test(`persisted ${state} evidence cannot consume or earn points`, t => {
  const f = use(t); setup(f);
  f.db.exec(`CREATE TRIGGER change_parent_payment AFTER INSERT ON commerce_sale_settlements
    BEGIN UPDATE commerce_sales SET status = '${state}' WHERE id = NEW.sale_id; END`);
  const before = databaseState(f.db);
  code(() => completeMarketSale(f.path, command("unpaid_evidence"), f.authority), "BENEFITS_ACTUAL_PAYMENT_REQUIRED");
  assert.deepEqual(databaseState(f.db), before);
});

test("settlement rechecks persisted amounts after sale/stock/Finance writes", t => {
  const f = use(t); setup(f);
  f.db.exec(`CREATE TRIGGER change_parent_total AFTER INSERT ON commerce_sale_settlements
    BEGIN UPDATE commerce_sales SET total = total + 1 WHERE id = NEW.sale_id; END`);
  const before = databaseState(f.db);
  code(() => completeMarketSale(f.path, command("wrong_evidence"), f.authority), "BENEFITS_SETTLEMENT_MISMATCH");
  assert.deepEqual(databaseState(f.db), before);
});

test("secure key load finishes before the write transaction; missing key fails before all sale effects", t => {
  const f = use(t); setup(f);
  f.authority.keys.load = () => {
    // Another connection can acquire the writer lock during key I/O.
    f.db.exec("BEGIN IMMEDIATE; ROLLBACK");
    return secretKey;
  };
  completeMarketSale(f.path, command("key_before_transaction"), f.authority);
  const before = databaseState(f.db);
  f.authority.keys.load = () => { throw Object.assign(new Error("key unavailable"), { code: "BENEFITS_SECURE_STORAGE_UNAVAILABLE" }); };
  code(() => completeMarketSale(f.path, command("key_missing"), f.authority), "BENEFITS_SECURE_STORAGE_UNAVAILABLE");
  assert.deepEqual(databaseState(f.db), before);
});

test("source draft uniqueness survives a different operation id without a second point grant", t => {
  const f = use(t); setup(f);
  f.db.prepare("INSERT INTO commerce_sale_drafts(id,business_id,created_at,updated_at) VALUES ('phone_draft','b1','fixture','fixture')").run();
  const input = command("draft_first_operation", { sourceDraftId: "phone_draft" });
  const first = completeMarketSale(f.path, input, f.authority);
  assert.equal(first.draftReview, "reviewed");
  const before = databaseState(f.db);
  const replay = completeMarketSale(f.path, { ...input, operationId: "draft_second_operation" }, f.authority);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.benefits, first.benefits);
  // Draft review is independently idempotent; no sale, point or receipt write repeats.
  assert.deepEqual(databaseState(f.db), before);
});

test("two real sale writers racing for the same points can settle only one sale", async t => {
  const f = use(t); setup(f);
  const start = new SharedArrayBuffer(4);
  const workers = ["concurrent_sale_a", "concurrent_sale_b"].map(id => new Worker(new URL("./test-helpers/market-sale-benefits-concurrent.mjs", import.meta.url),
    { workerData: { path: f.path, input: command(id), start } }));
  t.after(async () => { await Promise.all(workers.map(worker => worker.terminate())); });
  const ready = workers.map(worker => new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); }));
  await Promise.all(ready);
  const results = workers.map(worker => new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); }));
  Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0);
  const outcomes = await Promise.all(results);
  assert.equal(outcomes.filter(result => result.ok).length, 1, JSON.stringify(outcomes));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM commerce_sales").get().n, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM commerce_benefit_snapshots").get().n, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM commerce_market_sale_receipts").get().n, 1);
  assert.equal(f.db.prepare("SELECT quantity FROM inventory_balances WHERE product_id = 'p1'").get().quantity, 49);
  assert.equal(balance(f).availableMinor, 2125);
});
