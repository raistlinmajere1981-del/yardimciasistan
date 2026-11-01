import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { saleFixture, databaseState, completeMarketSale, load, marketSaleIpcModules } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { exampleRules, installRules, adjust, issue, balance, rules, capabilities } from "./test-helpers/commerce-benefits-fixture.mjs";
const { previewMarketSaleBenefits, getMarketSaleBenefitsState } = load("market-sale-benefits");
const use = t => { const f = saleFixture(); t.after(() => f.close()); return f; };
const request = overrides => ({ operationId: "preview_sale_1", customerId: "c1", paymentMethod: "transfer",
  items: [{ productId: "p1", quantity: 1 }], requestedPointsMinor: 10000, ...overrides });
const setup = f => {
  const values = exampleRules().map(rule => ({ ...rule, startsAt: 0,
    ...(rule.family === "coupon" ? { fixedMinor: 0, percentBps: 1000 } : {}) }));
  installRules(f, values); adjust(f);
  return issue(f, { expiresAt: Date.now() + 600000 });
};
const command = (input, preview) => ({ operationId: input.operationId, customerId: input.customerId,
  settlement: "paid", paymentMethod: input.paymentMethod, items: input.items, paymentAmountMinor: preview.quote.payableMinor,
  benefits: { requestedPointsMinor: input.requestedPointsMinor, expectedQuote: preview.quote,
    ...(input.couponCode ? { couponCode: input.couponCode } : {}) } });
const fails = (fn, code) => assert.throws(fn, error => error.code === code, code);

test("authoritative coupon percent + bank + points preview settles exact real sale without secrets in projections or persistence", t => {
  const f = use(t), coupon = setup(f), input = request({ couponCode: coupon.secret });
  const beforeBalance = balance(f).availableMinor;
  const preview = previewMarketSaleBenefits(f.path, input, f.authority);
  assert.deepEqual(preview.authority, { state: "preview_only", canConfirmPoints: false });
  assert.equal(preview.availablePointsMinor, 10000);
  assert.deepEqual([preview.quote.subtotalMinor, preview.quote.discountMinor, preview.quote.pointsTenderMinor, preview.quote.payableMinor, preview.quote.pointsEarnPreviewMinor],
    [100000, 14500, 10000, 75500, 1888]);
  assert.equal(balance(f).availableMinor, beforeBalance);
  for (const table of ["commerce_sales", "commerce_benefit_reservations", "commerce_benefit_point_holds", "commerce_benefit_snapshots"])
    assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  const sale = completeMarketSale(f.path, command(input, preview), f.authority);
  assert.deepEqual(sale.benefits.quote, preview.quote);
  assert.equal(sale.sale.total, 855);
  assert.equal(balance(f).availableMinor, 1888);
  assert.equal(f.db.prepare("SELECT amount_minor FROM finance_entries WHERE source_id = ?").get(sale.sale.id).amount_minor, 75500);
  const secretHmac = f.db.prepare("SELECT secret_hmac FROM commerce_benefit_coupon_codes").get().secret_hmac;
  const safe = JSON.stringify([preview, sale]);
  assert(!safe.includes(coupon.secret)); assert(!safe.includes(secretHmac));
  assert(!JSON.stringify(databaseState(f.db)).includes(coupon.secret));
  f.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  assert(!readFileSync(f.path).includes(Buffer.from(coupon.secret)));
});

test("preview without codes is read-only; disabled capability and families gate before key and preserve legacy", t => {
  const f = use(t); setup(f);
  const before = databaseState(f.db);
  const result = previewMarketSaleBenefits(f.path, request(), f.authority);
  assert.equal(result.quote.payableMinor, 85000);
  assert.deepEqual(databaseState(f.db), before);
  rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.configureCommerceBenefits(tx, "b1", { coupon: false, points: false, payment_modifier: false }));
  const beforeDisabled = f.state.keyLoads;
  fails(() => previewMarketSaleBenefits(f.path, request(), f.authority), "BENEFITS_CAPABILITY_DISABLED");
  assert.equal(f.state.keyLoads, beforeDisabled);
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.benefits'").run();
  const loads = f.state.keyLoads;
  assert.equal(getMarketSaleBenefitsState(f.path).enabled, false);
  fails(() => previewMarketSaleBenefits(f.path, request(), f.authority), "BENEFITS_CAPABILITY_DISABLED");
  assert.equal(f.state.keyLoads, loads);
  assert.equal(completeMarketSale(f.path, { operationId: "legacy_after_disabled", settlement: "paid", items: request().items, discountTotal: 5 }).sale.total, 995);
});

test("preview rejects spoofed prices/authority, cross-tenant customer and revoked actor", t => {
  const f = use(t); setup(f);
  const before = databaseState(f.db);
  for (const extra of [{ actor: { role: "desktop_owner" } }, { businessId: "b2" }, { source: { kind: "sale", id: "forged" } }, { expectedQuote: {} }, { authority: { state: "reserved" } }])
    fails(() => previewMarketSaleBenefits(f.path, request(extra), f.authority), "BENEFITS_INVALID_INTENT");
  fails(() => previewMarketSaleBenefits(f.path, request({ items: [{ productId: "p1", quantity: 1, unitPriceMinor: 1 }] }), f.authority), "BENEFITS_INVALID_INTENT");
  fails(() => previewMarketSaleBenefits(f.path, request({ customerId: "c3" }), f.authority), "BENEFITS_CUSTOMER_SCOPE");
  f.state.authorized = false;
  fails(() => previewMarketSaleBenefits(f.path, request(), f.authority), "BENEFITS_STAFF_REQUIRED");
  assert.deepEqual(databaseState(f.db), before);
});

test("malformed/invalid coupon failures consume durable independent actor and tenant limits", t => {
  const f = use(t); setup(f);
  const realNow = Date.now, pinnedNow = Math.floor(realNow() / 60000) * 60000 + 1000;
  Date.now = () => pinnedNow; t.after(() => { Date.now = realNow; });
  for (let n = 0; n < 20; n++) fails(() => previewMarketSaleBenefits(f.path, request({ operationId: `invalid_try_${n}`, couponCode: n % 2 ? "A".repeat(40) : "bad?" }), f.authority), "BENEFITS_COUPON_UNAVAILABLE");
  fails(() => completeMarketSale(f.path, { ...command(request(), { quote: {} }), benefits: { requestedPointsMinor: 0, expectedQuote: {}, couponCode: "bad?" } }, f.authority), "BENEFITS_COUPON_RATE_LIMITED");
  assert.deepEqual(f.db.prepare("SELECT attempts FROM commerce_benefit_coupon_rate_limits ORDER BY attempts").all().map(r => r.attempts), [21, 21]);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM commerce_sales").get().n, 0);
});

test("checkout rollback retains coupon attempt and no holds; changed server price safely rejects stale quote", t => {
  const f = use(t), coupon = setup(f), input = request({ couponCode: coupon.secret });
  const preview = previewMarketSaleBenefits(f.path, input, f.authority);
  f.db.prepare("UPDATE catalog_products SET sale_price = 1001 WHERE id = 'p1'").run();
  fails(() => completeMarketSale(f.path, command(input, preview), f.authority), "BENEFITS_QUOTE_CHANGED");
  assert.deepEqual(f.db.prepare("SELECT attempts FROM commerce_benefit_coupon_rate_limits").all().map(r => r.attempts), [2, 2]);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM commerce_sales").get().n, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM commerce_benefit_reservations").get().n, 0);
  assert.equal(balance(f).availableMinor, 10000);
});

test("coupon sale exact replay bypasses exhausted coupon and changed price; changed coupon intent rejects", t => {
  const f = use(t), coupon = setup(f), input = request({ couponCode: coupon.secret });
  const preview = previewMarketSaleBenefits(f.path, input, f.authority), saleInput = command(input, preview);
  const first = completeMarketSale(f.path, saleInput, f.authority);
  f.db.prepare("UPDATE commerce_benefit_coupon_codes SET status = 'disabled' WHERE id = ?").run(coupon.codeId);
  f.db.prepare("UPDATE catalog_products SET sale_price = 2000 WHERE id = 'p1'").run();
  rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.configureCommerceBenefits(tx, "b1", { coupon: false, points: false, payment_modifier: false }));
  const before = databaseState(f.db);
  const replay = completeMarketSale(f.path, saleInput, f.authority);
  assert.equal(replay.replayed, true); assert.deepEqual(replay.benefits, first.benefits);
  assert.deepEqual(databaseState(f.db), before);
  assert.throws(() => completeMarketSale(f.path, { ...saleInput, benefits: { ...saleInput.benefits, couponCode: "A".repeat(40) } }, f.authority), /farklı bir satış/);
  assert.deepEqual(databaseState(f.db), before);
});

test("exact expected quote rejects changed payment/cart; customer change reprices and cannot forge eligibility", t => {
  const f = use(t); setup(f);
  const input = request({ requestedPointsMinor: 0 });
  const preview = previewMarketSaleBenefits(f.path, input, f.authority);
  const saleInput = command(input, preview);
  for (const change of [{ paymentMethod: "cash" }, { items: [{ productId: "p1", quantity: 2 }] }])
    fails(() => completeMarketSale(f.path, { ...saleInput, ...change }, f.authority), "BENEFITS_QUOTE_CHANGED");
  const cash = previewMarketSaleBenefits(f.path, { ...input, paymentMethod: "cash" }, f.authority);
  assert.equal(cash.quote.payableMinor, 100000);
  const anonymous = previewMarketSaleBenefits(f.path, { ...input, customerId: "" }, f.authority);
  assert.equal(anonymous.quote.pointsEarnPreviewMinor, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM commerce_sales").get().n, 0);
});


test("actual preview/state/settlement IPC reject untrusted frames and locked sessions before database or key access; actual preload reaches authoritative paid settlement", async t => {
  const f = use(t), handlers = new Map();
  const root = mkdtempSync(join(tmpdir(), "market-benefits-ipc-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let dbReads = 0, locked = false, secureReads = 0, mutations = 0, failAfterCommit = false;
  const electron = { ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    app: { getPath: () => root }, safeStorage: { isEncryptionAvailable: () => { secureReads++; return false; }, getSelectedStorageBackend: () => "gnome_libsecret" } };
  const modules = marketSaleIpcModules(electron);
  modules.ipc.registerCommerceIpcHandlers({ databasePath: () => { dbReads++; return f.path; },
    assertUnlocked: () => { if (locked) throw new Error("fixture_locked"); }, onMutation: () => { mutations++; if (failAfterCommit) throw new (load("commerce-benefits-engine").CommerceBenefitsError)("BENEFITS_QUOTE_CHANGED"); } });
  const frame = { url: "file:///trusted/index.html" }, sender = { getType: () => "window", mainFrame: frame };
  const event = { sender, senderFrame: frame };
  const input = request({ couponCode: "PRIVATE_COUPON_VALUE" });
  for (const channel of ["commerce:sale:benefitsState", "commerce:sale:previewBenefits"]) {
    const handle = handlers.get(channel);
    for (const bad of [{ ...event, senderFrame: { url: frame.url } },
      { ...event, sender: { ...sender, getType: () => "webview" } },
      { ...event, senderFrame: null }]) assert.equal(handle(bad, input).code, "BENEFITS_STAFF_REQUIRED");
    frame.url = "https://evil.test/?secret=PRIVATE_URL";
    assert.equal(handle(event, input).code, "BENEFITS_STAFF_REQUIRED"); frame.url = "file:///trusted/index.html";
    locked = true; assert.equal(handle(event, input).code, "BENEFITS_SESSION_LOCKED"); locked = false;
  }
  assert.equal(dbReads, 0); assert.equal(secureReads, 0); assert.equal(mutations, 0);
  const complete = handlers.get("commerce:sale:completeMarket");
  const rejected = complete({ ...event, sender: { ...sender, getType: () => "webview" } }, { ...command(input, { quote: {} }) });
  assert.equal(rejected.ok, false); assert.equal(rejected.expected, true);
  assert.equal(dbReads, 0);
  assert.equal(handlers.get("commerce:sale:benefitsState")(event).value.enabled, true);
  assert.equal(secureReads, 0);
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.benefits'").run();
  assert.equal(handlers.get("commerce:sale:previewBenefits")(event, input).code, "BENEFITS_CAPABILITY_DISABLED");
  assert.equal(secureReads, 0);
  const safe = modules.failures.benefitsManagementFailure(new Error("PRIVATE_COUPON_VALUE"));
  assert(!JSON.stringify(safe).includes("PRIVATE_COUPON_VALUE"));
  // Real contextBridge/preload → registered main handler → actual price/benefits/sale owners.
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 1 WHERE capability_id = 'commerce.benefits'").run();
  electron.safeStorage.isEncryptionAvailable = () => true;
  electron.safeStorage.encryptString = text => Buffer.from(text).map(byte => byte ^ 0xa5);
  electron.safeStorage.decryptString = bytes => Buffer.from(bytes).map(byte => byte ^ 0xa5).toString();
  const key = new (load("commerce-benefits-key").CommerceBenefitsKey)(root, electron.safeStorage).load();
  setup(f);
  const coupon = f.transact(tx => rules.issueCommerceBenefitCoupon(tx, "b1", key,
    { ruleId: "coupon100", maxUses: 1, maxUsesPerCustomer: 1, expiresAt: Date.now() + 600000 }));
  let bridge;
  const invocations = [];
  electron.contextBridge = { exposeInMainWorld: (name, value) => { assert.equal(name, "yardimciDesktop"); bridge = value; } };
  electron.ipcRenderer = { invoke: async (channel, ...args) => {
    invocations.push(channel);
    if (channel === "appLock:getStatus") return { locked };
    return handlers.get(channel)(event, ...args);
  } };
  modules.preload();
  assert.equal((await bridge.commerce.getMarketSaleBenefitsState()).value.enabled, true);
  const previewInput = request({ operationId: "actual_preload_sale", couponCode: coupon.secret });
  const preview = await bridge.commerce.previewMarketSaleBenefits(previewInput);
  assert.equal(preview.ok, true); assert.equal(preview.value.quote.payableMinor, 75500);
  const inputSale = command(previewInput, preview.value);
  const result = await bridge.commerce.tryCompleteMarketSale(inputSale);
  assert.equal(result.ok, true); assert.deepEqual(result.value.benefits.quote, preview.value.quote);
  assert.equal((await bridge.commerce.tryCompleteMarketSale(inputSale)).value.replayed, true);
  const secondInput = request({ operationId: "post_commit_ipc_failure", requestedPointsMinor: 0 });
  const secondPreview = await bridge.commerce.previewMarketSaleBenefits(secondInput);
  const secondSale = command(secondInput, secondPreview.value);
  failAfterCommit = true;
  await assert.rejects(bridge.commerce.tryCompleteMarketSale(secondSale), error => error.code === "BENEFITS_QUOTE_CHANGED");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_sales").get().n, 2);
  failAfterCommit = false;
  assert.equal((await bridge.commerce.tryCompleteMarketSale(secondSale)).value.replayed, true);
  locked = true;
  const previousCalls = invocations.length;
  await assert.rejects(bridge.commerce.previewMarketSaleBenefits(previewInput), /kilitli/);
  assert.deepEqual(invocations.slice(previousCalls), ["appLock:getStatus"]);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_sales").get().n, 2);
  assert(!JSON.stringify([preview, result]).includes(coupon.secret));

});


test("no benefits selection preserves manual discount, credit, partial tender, old-debt collection and order flow without key work", t => {
  const f = use(t);
  for (const capability of capabilities.expandBusinessCapabilities([capabilities.BUSINESS_CAPABILITIES.CUSTOMER_CREDIT, capabilities.BUSINESS_CAPABILITIES.ORDERS])) {
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(capability);
  }
  const base = { customerId: "c1", items: request().items, paymentMethod: "cash" };
  const credit = completeMarketSale(f.path, { ...base, operationId: "legacy_credit_sale", settlement: "credit" }, f.authority);
  assert.equal(credit.sale.status, "credit"); assert.equal(credit.sale.total, 1000);
  const partialInput = { ...base, operationId: "legacy_partial_sale", settlement: "paid", paymentAmountMinor: 40000 };
  const partial = completeMarketSale(f.path, partialInput, f.authority);
  assert.equal(partial.sale.status, "credit"); assert.equal(partial.payment.newDebtMinor, 60000);
  const entries = f.db.prepare("SELECT COUNT(*) n FROM customer_credit_entries").get().n;
  assert.equal(completeMarketSale(f.path, partialInput, f.authority).replayed, true);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM customer_credit_entries").get().n, entries);
  const oldDebt = completeMarketSale(f.path, { ...base, operationId: "legacy_debt_collection", settlement: "paid", paymentAmountMinor: 110000 }, f.authority);
  assert.equal(oldDebt.payment.appliedToDebtMinor, 10000);
  const manual = completeMarketSale(f.path, { ...base, operationId: "legacy_manual_discount", settlement: "paid", discountTotal: 5 }, f.authority);
  assert.equal(manual.sale.total, 995);
  const order = load("commerce-runtime").createRuntimeOrder(f.path,
    { ...base, source: "desktop", sourceReference: "legacy_order_once" }, { desktopEntry: true });
  assert.equal(order.order.total, 1000);
  assert.equal(f.state.keyLoads, 0);
  for (const table of ["commerce_sale_settlements", "commerce_benefit_reservations", "commerce_benefit_snapshots"])
    assert.equal(f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
});
