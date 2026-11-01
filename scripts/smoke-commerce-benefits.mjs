import assert from "node:assert/strict";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import {
  NOW, capabilities as caps, engine, rules, points, rule, exampleRules, context, intent, fixture, installRules,
  adjust, issue, permit, evidence, refundEvidence, balance, CommerceBenefitsStore, secretKey, parentPorts
} from "./test-helpers/commerce-benefits-fixture.mjs";

const expectCode = (operation, code) => assert.throws(operation, error => error.code === code, code);
const useFixture = (t, options) => { const f = fixture(options); t.after(() => f.close()); return f; };
const pointsOnly = () => exampleRules().filter(value => value.family === "points");
const reserveCoupon = (f, request, key) => {
  const auth = permit(f, request);
  return f.transact(tx => f.store.reserve(tx, request, key, auth));
};
const reservePoints = (f, sourceId = "sale1", amount = 10000, key = "reserve") => {
  const request = intent({ source: { kind: "sale", id: sourceId }, requestedPointsMinor: amount });
  return { request, reservation: f.transact(tx => f.store.reserve(tx, request, key)) };
};

const reservationReader = () => new CommerceBenefitsStore(secretKey, { ...parentPorts(), authorizeReadOnly: parentPorts().authorize });
function measureReservationRead(db, fn) {
  const state = () => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]);
  const before = state(), writes = db.prepare("SELECT total_changes() n").get().n;
  try { return fn(); }
  finally { assert.deepEqual(state(), before); assert.equal(db.prepare("SELECT total_changes() n").get().n, writes); }
}

test("C20j canonical read: strict expiry boundary, active-but-expired and owner-swept expired status; zero writes", t => {
  const f = useFixture(t); installRules(f, pointsOnly()); adjust(f);
  const { request, reservation } = reservePoints(f);
  const reader = reservationReader(), reference = { reservationId: reservation.reservationId, operationKey: "reserve" };
  const read = now => f.transact(tx => measureReservationRead(f.db, () => reader.readReservationReadOnly(tx, rules.benefitsIntentForStorage(request), reference)), now);
  assert.deepEqual(read(reservation.expiresAt - 1).quote, reservation.quote);
  for (const now of [reservation.expiresAt, reservation.expiresAt + 1]) expectCode(() => read(now), "BENEFITS_RESERVATION_EXPIRED");
  assert.equal(f.db.prepare("SELECT status FROM commerce_benefit_reservations WHERE id=?").get(reservation.reservationId).status, "active",
    "read must not perform lazy expiry writes");
  f.transact(tx => f.store.reserve(tx, intent({ source: { kind: "sale", id: "expiry_sweep" } }), "sweep"), reservation.expiresAt);
  assert.equal(f.db.prepare("SELECT status FROM commerce_benefit_reservations WHERE id=?").get(reservation.reservationId).status, "expired");
  expectCode(() => read(reservation.expiresAt), "BENEFITS_RESERVATION_EXPIRED");
});

test("C20j canonical read reuses settlement quote/rule validation and reserve operation identity", t => {
  const f = useFixture(t); installRules(f, pointsOnly()); adjust(f);
  const { request, reservation } = reservePoints(f);
  const reader = reservationReader(), stored = rules.benefitsIntentForStorage(request);
  const reference = { reservationId: reservation.reservationId, operationKey: "reserve" };
  const read = () => f.transact(tx => measureReservationRead(f.db, () => reader.readReservationReadOnly(tx, stored, reference)));
  f.db.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
  expectCode(read, "BENEFITS_QUOTE_CHANGED");
  f.db.exec("UPDATE catalog_products SET sale_price=1000 WHERE id='p1'");
  f.transact(tx => rules.saveCommerceBenefitsRule(tx, "b1", { ...pointsOnly().find(r => r.id === "spend"), version: 2 }));
  expectCode(read, "BENEFITS_QUOTE_CHANGED");
  expectCode(() => f.transact(tx => f.store.reserve(tx, { ...request, requestedPointsMinor: 999 }, "reserve")), "BENEFITS_IDEMPOTENCY_INTENT_CHANGED");
  expectCode(() => f.transact(tx => f.store.readReservationReadOnly(tx, stored, reference)), "BENEFITS_READ_AUTHORIZATION_REQUIRED");
});

test("C20j canonical operation key cannot bind a different real reservation; rollback removes pending reservation", t => {
  const f = useFixture(t); installRules(f, pointsOnly()); adjust(f, 30000);
  const a = reservePoints(f, "sale_a", 1000, "reserve_a"), b = reservePoints(f, "sale_b", 1000, "reserve_b");
  const reader = reservationReader();
  expectCode(() => f.transact(tx => measureReservationRead(f.db, () => reader.readReservationReadOnly(tx,
    rules.benefitsIntentForStorage(a.request), { reservationId: a.reservation.reservationId, operationKey: "reserve_b" }))), "BENEFITS_IDEMPOTENCY_INTENT_CHANGED");
  assert.notEqual(a.reservation.reservationId, b.reservation.reservationId);
  f.transact(tx => f.store.release(tx, "b1", a.reservation.reservationId, "release_a"));
  const replacement = f.transact(tx => f.store.reserve(tx, a.request, "reserve_a_replacement"));
  assert.notEqual(a.reservation.reservationId, replacement.reservationId);
  expectCode(() => f.transact(tx => measureReservationRead(f.db, () => reader.readReservationReadOnly(tx,
    rules.benefitsIntentForStorage(a.request), { reservationId: replacement.reservationId, operationKey: "reserve_a" }))), "BENEFITS_RESERVATION_RECEIPT_REQUIRED");
  let pending;
  assert.throws(() => f.transact(tx => {
    pending = f.store.reserve(tx, intent({ source: { kind: "sale", id: "pending_rollback" } }), "pending");
    measureReservationRead(f.db, () => reader.readReservationReadOnly(tx,
      rules.benefitsIntentForStorage(intent({ source: { kind: "sale", id: "pending_rollback" } })),
      { reservationId: pending.reservationId, operationKey: "pending" }));
    throw new Error("fixture pending parent rollback");
  }), /fixture pending parent rollback/);
  assert.equal(f.db.prepare("SELECT 1 FROM commerce_benefit_reservations WHERE id=?").get(pending.reservationId), undefined);
});

test("1000 - 100 coupon - 45 bank - 100 Puan = 755; 2.5% paid earn = 18.88", () => {
  const input = context(); const before = JSON.stringify(input);
  const quote = engine.calculateCommerceBenefits(input, exampleRules());
  assert.deepEqual([quote.subtotalMinor, quote.discountMinor, quote.pointsTenderMinor, quote.payableMinor, quote.pointsEarnPreviewMinor],
    [100000, 14500, 10000, 75500, 1888]);
  assert.equal(quote.adjustments.find(value => value.family === "payment_modifier").baseMinor, 90000);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(engine.calculateCommerceBenefits(input, exampleRules().reverse()), quote);
});

test("capability optional/default OFF for market and restaurant; pension gains no Sales", () => {
  const C = caps.BUSINESS_CAPABILITIES;
  for (const profile of caps.getBusinessProfiles()) {
    assert.equal(profile.defaultCapabilities.includes(C.COMMERCE_BENEFITS), false);
    assert.equal(profile.optionalCapabilities.includes(C.COMMERCE_BENEFITS), profile.id !== "pension");
  }
  const valid = [C.COMMERCE_BENEFITS, C.CATALOG, C.CUSTOMERS];
  assert.equal(caps.validateBusinessCapabilitySet(valid).length, 1);
  for (const root of [C.SALES, C.ORDERS]) assert.deepEqual(caps.validateBusinessCapabilitySet([...valid, root]), []);
  assert.equal(caps.getBusinessProfileSelectionCapabilities("pension", [C.COMMERCE_BENEFITS]).includes(C.SALES), false);
});

test("coupon stacking defaults closed, explicit stacking and cross-family policy", () => {
  const input = context({ requestedPointsMinor: 0 });
  const a = rule("a", "coupon", { fixedMinor: 100 }); const b = rule("b", "coupon", { fixedMinor: 200 });
  expectCode(() => engine.calculateCommerceBenefits(input, [a, b]), "BENEFITS_COUPON_STACKING");
  assert.equal(engine.calculateCommerceBenefits(input, [a, b].map(item => ({ ...item, allowCouponStacking: true }))).discountMinor, 300);
  expectCode(() => engine.calculateCommerceBenefits(input, [{ ...a, combinesWith: [] }, rule("bank", "payment_modifier", { percentBps: 100 })]), "BENEFITS_COMBINATION_FORBIDDEN");
});

test("rule channel/customer/group/price-group/date/currency/family gating", () => {
  const input = context({ requestedPointsMinor: 0 });
  for (const overrides of [
    { status: "disabled" }, { currency: "USD" }, { startsAt: NOW + 1 }, { endsAt: NOW },
    { scope: { ...rule("a", "coupon").scope, channels: ["web"] } },
    { scope: { ...rule("a", "coupon").scope, customerIds: ["other"] } },
    { scope: { ...rule("a", "coupon").scope, customerGroups: ["vip"] } },
    { scope: { ...rule("a", "coupon").scope, priceGroups: ["dealer_a"] } }
  ]) expectCode(() => engine.calculateCommerceBenefits(input, [rule("a", "coupon", overrides)]), "BENEFITS_COUPON_UNAVAILABLE");
  expectCode(() => engine.calculateCommerceBenefits({ ...input, families: { ...input.families, coupon: false } }, [rule("a", "coupon")]), "BENEFITS_COUPON_UNAVAILABLE");
});

test("product/category exclusions, threshold, fixed+percent caps, no negative payable", () => {
  const input = context({ requestedPointsMinor: 0, lines: [
    { id: "a", productId: "p1", categoryId: "x", unitPriceMinor: 1000, quantityTenThousandths: 10000 },
    { id: "b", productId: "p2", categoryId: "y", unitPriceMinor: 1000, quantityTenThousandths: 10000 }
  ] });
  const coupon = rule("c", "coupon", { percentBps: 5000, fixedMinor: 200, maxBenefitMinor: 600,
    scope: { ...rule("a", "coupon").scope, excludedCategoryIds: ["y"] } });
  assert.equal(engine.calculateCommerceBenefits(input, [coupon]).discountMinor, 600);
  expectCode(() => engine.calculateCommerceBenefits(input, [{ ...coupon, minSpendMinor: 1001 }]), "BENEFITS_COUPON_THRESHOLD");
  const quote = engine.calculateCommerceBenefits(input, [rule("all", "coupon", { fixedMinor: 900000, percentBps: 10000 })]);
  assert.equal(quote.payableMinor, 0);
});

test("half-up fractional quantities, safe integer boundaries and deterministic scope allocation", () => {
  const input = context({ requestedPointsMinor: 0, lines: [
    { id: "b", productId: "p2", categoryId: "x", unitPriceMinor: 1, quantityTenThousandths: 10000 },
    { id: "a", productId: "p1", categoryId: "x", unitPriceMinor: 1, quantityTenThousandths: 15000 }
  ] });
  const coupon = rule("c", "coupon", { percentBps: 5000 });
  const quote = engine.calculateCommerceBenefits(input, [coupon]);
  assert.equal(quote.subtotalMinor, 3); assert.equal(quote.discountMinor, 2);
  assert.deepEqual(engine.calculateCommerceBenefits({ ...input, lines: [...input.lines].reverse() }, [coupon]), quote);
  expectCode(() => engine.calculateCommerceBenefits(context({ lines: [{ ...input.lines[0], unitPriceMinor: Number.MAX_SAFE_INTEGER, quantityTenThousandths: 20000 }] }), []), "BENEFITS_AMOUNT_OVERFLOW");
  expectCode(() => engine.calculateCommerceBenefits(context({ requestedPointsMinor: 0.1 }), []), "BENEFITS_INVALID_AMOUNT");
});

test("payment modifier waits for confirmed method; explicit tax/finance and earning base", () => {
  const ruleset = exampleRules().filter(value => value.family !== "coupon");
  for (const payment of [null, { methodId: "bank", confirmed: false }, { methodId: "cash", confirmed: true }]) {
    assert.equal(engine.calculateCommerceBenefits(context({ payment, requestedPointsMinor: 0 }), ruleset).discountMinor, 0);
  }
  const quote = engine.calculateCommerceBenefits(context({ requestedPointsMinor: 0,
    accounting: { taxTreatment: "added_explicitly", taxMinor: 1000, financeMinor: -500, earnOnAccountingAdjustments: false } }), ruleset);
  assert.equal(quote.accountingMinor, 500); assert.equal(quote.payableMinor, 95500); assert.equal(quote.pointsEarnPreviewMinor, 2375);
  expectCode(() => engine.calculateCommerceBenefits(context({ accounting: { taxTreatment: "included_in_items", taxMinor: 1, financeMinor: 0, earnOnAccountingAdjustments: false } }), []), "BENEFITS_INVALID_ACCOUNTING");
});

test("strict rule JSON rejects implicit/unknown/unsafe policies", () => {
  for (const invalid of [{ ...rule("x", "coupon"), code: "secret" }, { ...rule("x", "coupon"), percentBps: 10001 },
    { ...rule("x", "coupon"), points: { operation: "earn" } }, { ...rule("x", "coupon"), scope: { channels: ["web"] } }]) {
    assert.throws(() => engine.validateBenefitsRule(invalid));
  }
});

test("full schema fixture, append-only rule versions and independent family toggles", t => {
  const f = useFixture(t); installRules(f);
  const coupon = exampleRules()[0];
  f.transact(tx => rules.saveCommerceBenefitsRule(tx, "b1", { ...coupon, version: 2, fixedMinor: 5000 }));
  assert.equal(rules.loadCommerceBenefitsRules(f.db, "b1").find(value => value.id === coupon.id).fixedMinor, 5000);
  expectCode(() => f.transact(tx => rules.saveCommerceBenefitsRule(tx, "b1", coupon)), "BENEFITS_RULE_VERSION_CONFLICT");
  assert.throws(() => f.db.prepare("UPDATE commerce_benefit_rules SET canonical_json = canonical_json").run(), /BENEFITS_IMMUTABLE/);
  f.transact(tx => rules.configureCommerceBenefits(tx, "b1", { coupon: false, points: true, payment_modifier: false }));
  assert.deepEqual(rules.readBenefitsFamilies(f.db, "b1"), { coupon: false, points: true, payment_modifier: false });
  f.db.prepare("DELETE FROM business_capabilities WHERE business_id = 'b1' AND capability_id = 'commerce.sales'").run();
  expectCode(() => rules.loadCommerceBenefitsRules(f.db, "b1"), "BENEFITS_CAPABILITY_DISABLED");
  f.db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','commerce.orders','fixture','fixture')").run();
  assert.equal(rules.loadCommerceBenefitsRules(f.db, "b1").length, 4);
});

test("160-bit coupon secret normalized, only HMAC persists; malformed attempts are durably limited", t => {
  const f = useFixture(t); installRules(f);
  const code = issue(f); assert.match(code.secret, /^[A-F0-9]{40}$/);
  const request = intent({ couponCodes: [code.secret.toLowerCase().match(/.{1,8}/g).join("-")] });
  assert.ok(permit(f, request));
  const row = f.db.prepare("SELECT secret_hmac FROM commerce_benefit_coupon_codes").get();
  assert.equal(row.secret_hmac.length, 64); assert.notEqual(row.secret_hmac, code.secret);
  const projection = JSON.stringify(rules.loadCommerceBenefitsRules(f.db, "b1"));
  assert.equal(projection.includes(code.secret), false); assert.equal(projection.includes(row.secret_hmac), false);
  for (let n = 0; n < 20; n++) assert.equal(f.store.authorizeCouponAttempt(f.db, intent({ couponCodes: ["short"] }), "bad-actor", NOW).code, "BENEFITS_COUPON_UNAVAILABLE");
  assert.equal(f.store.authorizeCouponAttempt(f.db, intent({ couponCodes: [code.secret] }), "bad-actor", NOW).code, "BENEFITS_COUPON_RATE_LIMITED");
  assert.ok(permit(f, intent({ couponCodes: [code.secret] }), NOW + 60000, "bad-actor"));
  expectCode(() => rules.normalizeBenefitCouponSecret("ß".repeat(26)), "BENEFITS_COUPON_UNAVAILABLE");
});

test("coupon permit bound to exact intent; expired/disabled/exhausted and held codes reject", t => {
  const f = useFixture(t); installRules(f);
  const code = issue(f); const request = intent({ couponCodes: [code.secret] }); const auth = permit(f, request);
  expectCode(() => f.transact(tx => f.store.reserve(tx, { ...request, customerId: "c2" }, "changed", auth)), "BENEFITS_COUPON_AUTHORIZATION_REQUIRED");
  const receipt = f.transact(tx => f.store.reserve(tx, request, "reserve", auth));
  assert.equal(f.store.authorizeCouponAttempt(f.db, { ...request, source: { kind: "sale", id: "other" } }, "other", NOW).code, "BENEFITS_COUPON_UNAVAILABLE");
  evidence(f, request, receipt); f.transact(tx => f.store.settle(tx, "b1", receipt.reservationId, "settle"));
  assert.equal(f.store.authorizeCouponAttempt(f.db, request, "third", NOW).code, "BENEFITS_COUPON_UNAVAILABLE");
  const expired = issue(f, { expiresAt: NOW + 1 });
  assert.equal(f.store.authorizeCouponAttempt(f.db, intent({ couponCodes: [expired.secret] }), "expired", NOW + 1).code, "BENEFITS_COUPON_UNAVAILABLE");
  const disabled = issue(f); f.db.prepare("UPDATE commerce_benefit_coupon_codes SET status = 'disabled' WHERE id = ?").run(disabled.codeId);
  assert.equal(f.store.authorizeCouponAttempt(f.db, intent({ couponCodes: [disabled.secret] }), "disabled", NOW).code, "BENEFITS_COUPON_UNAVAILABLE");
});

test("per-customer code limit differs from total limit; anonymous codes require explicit no-customer policy", t => {
  const f = useFixture(t); installRules(f);
  const code = issue(f, { maxUses: 3 }); const request = intent({ couponCodes: [code.secret] });
  const res = reserveCoupon(f, request, "r1");
  evidence(f, request, res); f.transact(tx => f.store.settle(tx, "b1", res.reservationId, "s1"));
  assert.equal(f.store.authorizeCouponAttempt(f.db, intent({ couponCodes: [code.secret], source: { kind: "sale", id: "s2" } }), "again", NOW).code, "BENEFITS_COUPON_UNAVAILABLE");
  assert.ok(permit(f, intent({ customerId: "c2", couponCodes: [code.secret] }), NOW, "customer2"));
  assert.equal(f.store.authorizeCouponAttempt(f.db, intent({ customerId: null, couponCodes: [code.secret] }), "guest", NOW).code, "BENEFITS_COUPON_UNAVAILABLE");
  const guest = issue(f, { maxUsesPerCustomer: null }); const guestRequest = intent({ customerId: null, couponCodes: [guest.secret], source: { kind: "sale", id: "guest" } });
  const guestRes = reserveCoupon(f, guestRequest, "guest-r");
  evidence(f, guestRequest, guestRes); f.transact(tx => f.store.settle(tx, "b1", guestRes.reservationId, "guest-s"));
});

test("reservation + settlement example; receipt replay exact and changed intent rejected", t => {
  const f = useFixture(t); installRules(f); adjust(f);
  const code = issue(f); const request = intent({ couponCodes: [code.secret], requestedPointsMinor: 10000 });
  const res = reserveCoupon(f, request, "reserve");
  assert.equal(balance(f).availableMinor, 0); assert.equal(balance(f).reservedMinor, 10000);
  assert.equal(res.quote.payableMinor, 75500);
  assert.deepEqual(f.transact(tx => f.store.reserve(tx, request, "reserve")), res);
  expectCode(() => f.transact(tx => f.store.reserve(tx, { ...request, requestedPointsMinor: 9000 }, "reserve")), "BENEFITS_IDEMPOTENCY_INTENT_CHANGED");
  evidence(f, request, res);
  const settled = f.transact(tx => f.store.settle(tx, "b1", res.reservationId, "settle"));
  assert.deepEqual(f.transact(tx => f.store.settle(tx, "b1", res.reservationId, "settle"), NOW + 1000), settled);
  assert.deepEqual(balance(f), { postedMinor: 1888, availableMinor: 1888, reservedMinor: 0 });
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_coupon_redemptions").get().n, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_point_ledger WHERE kind = 'grant'").get().n, 1);
  expectCode(() => f.transact(tx => f.store.reserve(tx, { ...request, couponCodes: [] }, "duplicate-source")), "BENEFITS_SOURCE_ALREADY_SETTLED");
});

test("pending/open/credit cannot grant or consume; parent financial write rolls back on failure", t => {
  const f = useFixture(t); installRules(f, pointsOnly()); adjust(f);
  const { request, reservation } = reservePoints(f);
  for (const state of ["pending", "open", "credit"]) {
    expectCode(() => f.transact(tx => {
      evidence(f, request, reservation, { state });
      f.store.settle(tx, "b1", reservation.reservationId, "settle");
    }), "BENEFITS_ACTUAL_PAYMENT_REQUIRED");
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM benefits_fixture_settlement").get().n, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_point_ledger WHERE kind IN ('grant','spend')").get().n, 0);
  }
  assert.equal(balance(f).reservedMinor, 10000);
});

test("parent transaction rollback, forged/deferred transaction and swallowed writer error cannot commit", t => {
  const f = useFixture(t); installRules(f, pointsOnly()); adjust(f);
  expectCode(() => f.store.reserve({ database: f.db, now: NOW }, intent(), "forged"), "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  f.db.exec("BEGIN");
  expectCode(() => f.transact(() => {}), "BENEFITS_PARENT_TRANSACTION_REQUIRED"); f.db.exec("ROLLBACK");
  expectCode(() => f.transact(tx => { try { f.store.reserve(tx, intent({ requestedPointsMinor: 20000 }), "too-much"); } catch {} }), "BENEFITS_TRANSACTION_ABORTED");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_reservations").get().n, 0);
  expectCode(() => f.transact(async () => {}), "BENEFITS_ASYNC_TRANSACTION_FORBIDDEN");
});

test("borrowed parent scope is synchronous, exclusive and never finishes the parent transaction", t => {
  const f = useFixture(t); let escaped;
  const run = callback => rules.withCommerceBenefitsParentTransaction(f.db, NOW, callback);
  expectCode(() => run(() => {}), "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  f.db.exec("BEGIN IMMEDIATE");
  assert.equal(run(tx => { escaped = tx; return f.store.adjustPoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY", amountMinor: 100,
    expiresAt: null, reason: "opening_balance", operationKey: "borrowed" }); }).version, 1);
  assert.equal(f.db.isTransaction, true);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_point_ledger").get().n, 1);
  expectCode(() => rules.benefitsOperation(escaped, () => {}), "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  f.db.exec("ROLLBACK");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_point_ledger").get().n, 0);
  f.db.exec("BEGIN IMMEDIATE");
  assert.equal(run(tx => f.store.adjustPoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY", amountMinor: 50,
    expiresAt: null, reason: "opening_balance", operationKey: "committed" })).version, 1);
  assert.equal(f.db.isTransaction, true); f.db.exec("COMMIT");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_point_ledger").get().n, 1);

  f.db.exec("BEGIN IMMEDIATE");
  expectCode(() => run(tx => { f.store.adjustPoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY", amountMinor: 25,
    expiresAt: null, reason: "opening_balance", operationKey: "rolled-back" });
    try { f.store.adjustPoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY", amountMinor: 0,
    expiresAt: null, reason: "opening_balance", operationKey: "bad" }); } catch {} }), "BENEFITS_TRANSACTION_ABORTED");
  assert.equal(f.db.isTransaction, true); f.db.exec("ROLLBACK");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_point_ledger").get().n, 1);

  f.db.exec("BEGIN IMMEDIATE");
  expectCode(() => run(() => { try { run(() => {}); } catch {} }), "BENEFITS_TRANSACTION_ABORTED");
  assert.equal(f.db.isTransaction, true); f.db.exec("ROLLBACK");
  expectCode(() => f.transact(() => { try { run(() => {}); } catch {} }), "BENEFITS_TRANSACTION_ABORTED");
  f.db.exec("BEGIN IMMEDIATE");
  expectCode(() => run(() => Promise.resolve()), "BENEFITS_ASYNC_TRANSACTION_FORBIDDEN");
  assert.equal(f.db.isTransaction, true); f.db.exec("ROLLBACK");
  f.db.exec("BEGIN IMMEDIATE");
  expectCode(() => run(tx => { try { rules.benefitsOperation(tx, () => Promise.resolve()); } catch {} }), "BENEFITS_TRANSACTION_ABORTED");
  assert.equal(f.db.isTransaction, true); f.db.exec("ROLLBACK");
});

test("tenant/customer/currency boundaries and SQL immutable ledger/hold guards", t => {
  const f = useFixture(t); installRules(f, pointsOnly()); adjust(f);
  expectCode(() => f.transact(tx => f.store.reserve(tx, intent({ customerId: "c3" }), "cross-tenant")), "BENEFITS_CUSTOMER_SCOPE");
  expectCode(() => f.transact(tx => f.store.reserve(tx, intent({ customerId: "c2", requestedPointsMinor: 1 }), "cross-customer")), "BENEFITS_POINTS_INSUFFICIENT");
  assert.equal(balance(f, "c1", "USD").availableMinor, 0);
  const { reservation } = reservePoints(f);
  expectCode(() => f.transact(tx => f.store.settle(tx, "b2", reservation.reservationId, "cross-reservation")), "BENEFITS_RESERVATION_REQUIRED");
  assert.throws(() => f.db.prepare("UPDATE commerce_benefit_point_ledger SET amount_minor = 999999").run(), /BENEFITS_IMMUTABLE/);
  assert.throws(() => f.db.prepare("DELETE FROM commerce_benefit_point_holds").run(), /BENEFITS_IMMUTABLE/);
  assert.throws(() => f.db.prepare("UPDATE commerce_benefit_reservations SET customer_id = 'c2'").run(), /BENEFITS_IMMUTABLE/);
});

test("held balance cannot be overspent; release and expiry restore availability once", t => {
  const f = useFixture(t); installRules(f, pointsOnly()); adjust(f);
  const { reservation } = reservePoints(f, "first", 7000, "r1");
  expectCode(() => reservePoints(f, "second", 4000, "r2"), "BENEFITS_POINTS_INSUFFICIENT");
  const released = f.transact(tx => f.store.release(tx, "b1", reservation.reservationId, "release"));
  assert.deepEqual(f.transact(tx => f.store.release(tx, "b1", reservation.reservationId, "release")), released);
  assert.equal(balance(f).availableMinor, 10000);
  const next = reservePoints(f, "second", 8000, "r2");
  assert.equal(balance(f, "c1", "TRY", next.reservation.expiresAt).availableMinor, 10000);
  expectCode(() => f.transact(tx => f.store.settle(tx, "b1", next.reservation.reservationId, "expired"), next.reservation.expiresAt), "BENEFITS_RESERVATION_EXPIRED");
});

test("settlement re-resolves prices, payment method, rules and paid evidence", t => {
  const f = useFixture(t); installRules(f, exampleRules().filter(value => value.family !== "coupon"));
  const request = intent(); const res = f.transact(tx => f.store.reserve(tx, request, "r")); evidence(f, request, res);
  f.db.prepare("UPDATE catalog_products SET sale_price = 2000 WHERE id = 'p1'").run();
  expectCode(() => f.transact(tx => f.store.settle(tx, "b1", res.reservationId, "s")), "BENEFITS_QUOTE_CHANGED");
  f.db.prepare("UPDATE catalog_products SET sale_price = 1000 WHERE id = 'p1'").run();
  f.db.prepare("UPDATE commerce_benefit_payment_methods SET enabled = 0 WHERE business_id = 'b1' AND external_method = 'bank'").run();
  expectCode(() => f.transact(tx => f.store.settle(tx, "b1", res.reservationId, "s")), "BENEFITS_QUOTE_CHANGED");
  f.db.prepare("UPDATE commerce_benefit_payment_methods SET enabled = 1 WHERE business_id = 'b1'").run();
  evidence(f, request, res, { customerId: "c2" });
  expectCode(() => f.transact(tx => f.store.settle(tx, "b1", res.reservationId, "s")), "BENEFITS_SETTLEMENT_SCOPE");
  evidence(f, request, res, { paidMinor: 1 });
  expectCode(() => f.transact(tx => f.store.settle(tx, "b1", res.reservationId, "s")), "BENEFITS_SETTLEMENT_MISMATCH");
  f.transact(tx => rules.saveCommerceBenefitsRule(tx, "b1", { ...exampleRules()[1], version: 2 }));
  expectCode(() => f.transact(tx => f.store.settle(tx, "b1", res.reservationId, "s")), "BENEFITS_QUOTE_CHANGED");
});

test("dealer-resolved prices enter the same engine before discounts", t => {
  const f = useFixture(t); installRules(f, [exampleRules()[1]]);
  f.db.prepare(`INSERT INTO customer_commercial_profiles(customer_id,business_id,company_name,dealer_status,price_group,created_at,updated_at)
    VALUES ('c1','b1','Fixture dealer','active','dealer_a','fixture','fixture')`).run();
  const preview = f.transact(tx => f.store.preview(tx, intent({ channel: "web_dealer" })));
  assert.equal(preview.quote.subtotalMinor, 80000); assert.equal(preview.quote.payableMinor, 76000);
});

test("full refund restores spent Puan and reverses grant once, retaining coupon usage", t => {
  const f = useFixture(t); installRules(f); adjust(f);
  const code = issue(f); const request = intent({ couponCodes: [code.secret], requestedPointsMinor: 10000 });
  const res = reserveCoupon(f, request, "r"); evidence(f, request, res);
  const settled = f.transact(tx => f.store.settle(tx, "b1", res.reservationId, "s"));
  expectCode(() => f.transact(tx => f.store.reverse(tx, "b1", settled.snapshotId, "refund")), "BENEFITS_CONFIRMED_REFUND_REQUIRED");
  refundEvidence(f, request);
  const reversed = f.transact(tx => f.store.reverse(tx, "b1", settled.snapshotId, "refund"));
  assert.deepEqual(f.transact(tx => f.store.reverse(tx, "b1", settled.snapshotId, "refund")), reversed);
  assert.equal(balance(f).availableMinor, 10000);
  expectCode(() => f.transact(tx => f.store.reverse(tx, "b1", settled.snapshotId, "another-refund")), "BENEFITS_ALREADY_REVERSED");
  assert.equal(reversed.couponUsageRestored, false);
  assert.equal(f.store.authorizeCouponAttempt(f.db, request, "after-refund", NOW).code, "BENEFITS_COUPON_UNAVAILABLE");
});

test("earned points already used block refund atomically; no negative balance", t => {
  const f = useFixture(t); installRules(f, pointsOnly());
  const request = intent(); const res = f.transact(tx => f.store.reserve(tx, request, "r")); evidence(f, request, res);
  const settled = f.transact(tx => f.store.settle(tx, "b1", res.reservationId, "s"));
  reservePoints(f, "second", 2000, "second-r"); refundEvidence(f, request);
  expectCode(() => f.transact(tx => f.store.reverse(tx, "b1", settled.snapshotId, "refund")), "BENEFITS_EARNED_POINTS_ALREADY_USED");
  assert.equal(balance(f).postedMinor, 2500);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_reversals").get().n, 0);
});

test("point expiry/FIFO reservations/manual correction/replay and refund preserve original expiry", t => {
  const f = useFixture(t); installRules(f, [pointsOnly()[0]]);
  const expiresAt = NOW + 10000; const credit = adjust(f, 10000, { expiresAt });
  const { request, reservation } = reservePoints(f, "sale1", 5000);
  assert.equal(reservation.expiresAt, expiresAt);
  evidence(f, request, reservation); const settled = f.transact(tx => f.store.settle(tx, "b1", reservation.reservationId, "s"));
  assert.equal(balance(f).availableMinor, 5000);
  assert.equal(balance(f, "c1", "TRY", expiresAt).availableMinor, 0);
  const expired = f.transact(tx => f.store.expirePoints(tx, "b1", "c1", "TRY", "expire"), expiresAt);
  assert.equal(expired.entryIds.length, 1);
  assert.deepEqual(f.transact(tx => f.store.expirePoints(tx, "b1", "c1", "TRY", "expire"), expiresAt + 1), expired);
  assert.equal(balance(f, "c1", "TRY", expiresAt).postedMinor, 0);
  refundEvidence(f, request); f.transact(tx => f.store.reverse(tx, "b1", settled.snapshotId, "refund"), expiresAt + 1);
  assert.deepEqual(balance(f, "c1", "TRY", expiresAt + 1), { postedMinor: 0, availableMinor: 0, reservedMinor: 0 });
  assert.equal(points.readCommercePointBalance(f.db, "b1", "c2", "TRY", NOW).availableMinor, 0);
  assert.ok(credit.entryId);
  adjust(f, 1000, { operationKey: "correction", reason: "correction" });
  assert.deepEqual(adjust(f, 1000, { operationKey: "correction", reason: "correction" }), adjust(f, 1000, { operationKey: "correction", reason: "correction" }));
  expectCode(() => adjust(f, 1001, { operationKey: "correction", reason: "correction" }), "BENEFITS_IDEMPOTENCY_INTENT_CHANGED");
  expectCode(() => adjust(f, -1001, { operationKey: "overdraw", reason: "correction" }), "BENEFITS_POINTS_INSUFFICIENT");
  adjust(f, -1000, { operationKey: "debit", reason: "correction" });
  assert.equal(balance(f).availableMinor, 0);
});

test("offline web preview cannot confirm redemption; canonical source prevents cross-channel duplicate grant", t => {
  const f = useFixture(t); installRules(f, pointsOnly()); adjust(f);
  const request = intent({ channel: "web", requestedPointsMinor: 1000 });
  const preview = f.transact(tx => f.store.preview(tx, request));
  assert.deepEqual(preview.authority, { state: "preview_only", canConfirmPoints: false });
  assert.equal(balance(f).reservedMinor, 0);
  expectCode(() => f.transact(tx => f.store.settle(tx, "b1", "offline-preview", "offline")), "BENEFITS_RESERVATION_REQUIRED");
  const reservation = f.transact(tx => f.store.reserve(tx, request, "r")); evidence(f, request, reservation);
  f.transact(tx => f.store.settle(tx, "b1", reservation.reservationId, "s"));
  for (const channel of ["web_dealer", "companion", "desktop_cart"]) {
    expectCode(() => f.transact(tx => f.store.reserve(tx, { ...request, channel }, `again-${channel}`)), "BENEFITS_SOURCE_ALREADY_SETTLED");
  }
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_point_ledger WHERE kind = 'grant'").get().n, 1);
});

test("same customer concurrent SQLite connections serialize spend and cannot overcommit", async t => {
  const f = useFixture(t); installRules(f, pointsOnly()); adjust(f);
  const start = new SharedArrayBuffer(4); const flag = new Int32Array(start);
  const workerUrl = new URL("./test-helpers/commerce-benefits-concurrent.mjs", import.meta.url);
  const run = id => new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { workerData: { path: f.path, id, start } });
    t.after(async () => { await worker.terminate(); });
    worker.on("message", message => { if (message.ready) { ready++; if (ready === 2) { Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); } } else resolve(message); });
    worker.on("error", reject); worker.on("exit", code => { if (code !== 0) reject(new Error(`worker exit ${code}`)); });
  });
  let ready = 0;
  const results = await Promise.all([run("one"), run("two")]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.find(result => !result.ok).code, "BENEFITS_POINTS_INSUFFICIENT");
  assert.equal(balance(f).reservedMinor, 7000); assert.equal(balance(f).availableMinor, 3000);
});


test("same coupon concurrent reservations cannot consume its last use twice", async t => {
  const f = useFixture(t); installRules(f, [exampleRules()[0]]); const coupon = issue(f);
  const start = new SharedArrayBuffer(4); const flag = new Int32Array(start); let ready = 0;
  const run = id => new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./test-helpers/commerce-benefits-concurrent.mjs", import.meta.url), {
      workerData: { path: f.path, id, start, couponSecret: coupon.secret }
    });
    t.after(async () => { await worker.terminate(); });
    worker.on("message", message => {
      if (message.ready) { ready++; if (ready === 2) { Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); } }
      else resolve(message);
    });
    worker.on("error", reject); worker.on("exit", code => { if (code !== 0) reject(new Error(`worker exit ${code}`)); });
  });
  const results = await Promise.all([run("coupon-one"), run("coupon-two")]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.find(result => !result.ok).code, "BENEFITS_COUPON_EXHAUSTED");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_coupon_holds").get().n, 1);
});

test("future web authorization envelope is tenant/customer/channel/reservation bound", t => {
  const f = useFixture(t); installRules(f, pointsOnly()); adjust(f);
  const request = intent({ channel: "web", requestedPointsMinor: 1000 });
  const reservation = f.transact(tx => f.store.reserve(tx, request, "web-r"));
  const insert = f.db.prepare(`INSERT INTO commerce_benefit_checkout_authorizations
    (business_id,id,version,reservation_id,channel,customer_id,principal_hmac,token_hmac,authority_id,authority_revision,
    access_revision,quote_hmac,created_at_ms,expires_at_ms) VALUES (?,?,1,?,?,?,?,?,'desktop',1,0,?,?,?)`);
  const digest = "a".repeat(64);
  insert.run("b1", "web-auth", reservation.reservationId, "web", "c1", digest, digest, digest, NOW, reservation.expiresAt);
  assert.throws(() => insert.run("b2", "other-tenant", reservation.reservationId, "web", "c3", digest, digest, digest, NOW, reservation.expiresAt), /BENEFITS_AUTHORIZATION_SCOPE/);
  assert.throws(() => insert.run("b1", "other-customer", reservation.reservationId, "web", "c2", digest, digest, digest, NOW, reservation.expiresAt), /BENEFITS_AUTHORIZATION_SCOPE/);
  assert.throws(() => insert.run("b1", "other-channel", reservation.reservationId, "web_dealer", "c1", digest, digest, digest, NOW, reservation.expiresAt), /BENEFITS_AUTHORIZATION_SCOPE/);
});


test("canonical commerce_order source serves web and dealer without second checkout authority", () => {
  const request = intent({ source: { kind: "commerce_order", id: "web-order-1" }, channel: "web_dealer" });
  assert.equal(rules.benefitsIntentForStorage(request).source.kind, "commerce_order");
  assert.equal(engine.calculateCommerceBenefits(context({ channel: "web_dealer", requestedPointsMinor: 0 }), []).payableMinor, 100000);
});
test("product quantity supports four decimal places without floating money", () => {
  const input = context({ requestedPointsMinor: 0, lines: [{ id: "one", productId: "p1", categoryId: "c1", unitPriceMinor: 10000, quantityTenThousandths: 12345 }] });
  assert.equal(engine.calculateCommerceBenefits(input, []).subtotalMinor, 12345);
});
