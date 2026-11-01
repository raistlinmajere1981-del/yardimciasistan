import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { load, databaseState } from "./market-sale-benefits-fixture.mjs";
import { parentPorts, rule, evidence, refundEvidence } from "./commerce-benefits-fixture.mjs";

const companion = load("companion-sale-benefits"), intents = load("companion-points-intent");
const { CommerceBenefitsStore } = load("commerce-benefits-store");
const rules = load("commerce-benefits-rules"), points = load("commerce-benefits-points");

/** Negative SQL fixtures ONLY, after the real legacy cash owner has returned.
 * No reserve/settle call, authorizer or witness minting. Caller must reach the
 * real Android materializer and assert parent rollback, not throw preemptively.
 */
export function provisionRejectedAndroidReceiptEvidence(db, actionId, kind) {
  const sale = db.prepare(`SELECT s.* FROM commerce_market_sale_receipts r
    JOIN commerce_sales s ON s.id=r.sale_id WHERE r.operation_id=?`).get(actionId);
  assert.ok(sale); assert.equal(sale.status, "paid");
  const gross = Math.round(sale.total * 100);
  assert.equal(gross, 100000);
  if (kind === "snapshot") {
    db.prepare(`INSERT INTO commerce_benefit_reservations VALUES
      ('b1','c20p_negative_reservation','c1','sale',?,'TRY','settled','{}','{}','{}','[]',1000,0,1)`).run(sale.id);
    db.prepare(`INSERT INTO commerce_benefit_snapshots VALUES
      ('b1','c20p_negative_snapshot',1,'c20p_negative_reservation','sale',?,'{}','[]','{}',0)`).run(sale.id);
  } else {
    const pointsMinor = kind.startsWith("all-points") ? 100000 : kind.startsWith("mixed") ? 1000 : 0;
    const cashMinor = gross - pointsMinor;
    db.prepare("INSERT INTO commerce_sale_settlements VALUES (?,?,?,?,?,?,?)")
      .run(sale.id, sale.business_id, sale.customer_id, "cash", cashMinor, pointsMinor, sale.created_at);
    if (!kind.endsWith("gross-finance")) {
      if (cashMinor === 0) db.prepare("DELETE FROM finance_entries WHERE source_type='commerce_sale' AND source_id=?").run(sale.id);
      else db.prepare("UPDATE finance_entries SET amount_minor=? WHERE source_type='commerce_sale' AND source_id=?").run(cashMinor, sale.id);
    }
  }
}

// Test-only fixture provisioning uses the EXISTING canonical Store/ledger owners
// and fixture parent ports. No fabricated desktop_owner or Companion write port.
// All reader measurements include every table and count even no-op row writes.
export function runCompanionReservationWitnessScenario({ mode, tx, action, context, input, prepared,
  key, fixture, grants, grantOwner, worker, saved }) {
  const db = tx.database;
  const measure = fn => {
    const before = databaseState(db), writes = db.prepare("SELECT total_changes() n").get().n;
    try { return fn(); }
    finally {
      assert.deepEqual(databaseState(db), before, `${mode}: all tables unchanged`);
      assert.equal(db.prepare("SELECT total_changes() n").get().n, writes, `${mode}: zero writes, including no-op`);
    }
  };
  const redeem = rule("c20j_redeem", "points", { startsAt: 0, percentBps: 10000,
    points: { operation: "redeem", earnBase: "after_points", expiryDays: null } });
  rules.saveCommerceBenefitsRule(tx, "b1", redeem);
  points.adjustCommercePoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY", amount: 5000,
    operationKey: "c20j_opening", expiresAt: mode.startsWith("witness-expiry") ? tx.now + 1000 : null });
  if (mode === "witness-payload-capture") action.payload.reservation_id = "client_supplied";
  const binding = measure(() => intents.bindCompanionPointsIntent(tx, action, context,
    mode === "witness-input-capture" ? { ...input, reservationId: "client_supplied" } : input));
  const adapter = measure(() => companion.companionSaleBenefitsPreSaleReadPorts(tx, action, context, input, binding, prepared));
  const store = new CommerceBenefitsStore(key, parentPorts());
  let request = { ...adapter.request, couponCodes: [] };
  if (mode === "witness-foreign-business") {
    db.prepare(`INSERT INTO catalog_products(id,business_id,name,sale_price,currency,created_at,updated_at)
      VALUES ('c20j_foreign_product','b2','Fixture',1000,'TRY','fixture','fixture')`).run();
    request = { ...request, businessId: "b2", customerId: "c3", requestedPointsMinor: 0,
      lines: [{ productId: "c20j_foreign_product", quantityTenThousandths: 10000 }] };
  }
  if (mode === "witness-foreign-customer") request = { ...request, customerId: "c2", requestedPointsMinor: 0 };
  if (mode === "witness-foreign-source") request = { ...request, source: { kind: "sale", id: "another_real_reservation_source" } };
  if (mode === "witness-foreign-source-kind") request = { ...request, source: { kind: "commerce_order", id: prepared.source.id } };
  if (mode === "witness-foreign-currency") {
    db.exec("UPDATE catalog_products SET currency='USD' WHERE id='p1'");
    request = { ...request, currency: "USD", requestedPointsMinor: 0 };
  }
  if (mode === "witness-foreign-intent") request = { ...request, requestedPointsMinor: 500 };
  let receipt;
  if (!["witness-absent", "witness-fake-row", "witness-other-key"].includes(mode)) receipt = store.reserve(tx, request, "c20j_reserve");
  if (mode === "witness-foreign-currency") db.exec("UPDATE catalog_products SET currency='TRY' WHERE id='p1'");
  let reference = { reservationId: receipt?.reservationId ?? "missing", operationKey: "c20j_reserve" };
  if (mode === "witness-fake-row") {
    // The ONLY fabricated C20j row is this explicit rejection fixture: no owner receipt.
    reference.reservationId = "forged_row";
    db.prepare(`INSERT INTO commerce_benefit_reservations VALUES
      ('b1','forged_row','c1','sale',?,'TRY','active',?,'{}','{}','[]',1000,?,?)`)
      .run(prepared.source.id, rules.canonicalBenefitsJson(adapter.request), tx.now, tx.now + 1000);
  }
  if (mode === "witness-forged-id") reference.reservationId = "forged_id";
  if (mode === "witness-operation-key") reference.operationKey = "another_operation";
  if (mode === "witness-operation-kind") {
    store.adjustPoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY", amountMinor: 1,
      expiresAt: null, reason: "correction", operationKey: "another_kind" });
    reference.operationKey = "another_kind";
  }
  if (mode === "witness-other-key") {
    const other = new CommerceBenefitsStore({ id: "other-key", key: Buffer.alloc(32, 99) }, parentPorts());
    receipt = other.reserve(tx, request, "other_key_same_source");
    reference = { reservationId: receipt.reservationId, operationKey: "other_key_same_source" };
  }
  if (mode === "witness-reference-quote") reference.quote = receipt.quote;
  if (mode === "witness-reference-expiry") reference.expiresAt = receipt.expiresAt + 1;
  const capture = () => companion.captureCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared, reference);
  const handle = measure(capture);
  assert.deepEqual(handle, {}); assert.ok(Object.isFrozen(handle));
  assert.equal(JSON.stringify(handle), "{}");
  const verify = (candidate = handle, nextTx = tx, nextAction = action, nextContext = context,
    nextInput = input, nextBinding = binding, nextPrepared = prepared) =>
    companion.revalidateCompanionSaleBenefitsReservation(nextTx, nextAction, nextContext, nextInput, nextBinding, nextPrepared, candidate);
  const original = measure(() => verify());
  assert.equal(original.reservationId, receipt.reservationId);
  assert.equal(original.status, "active");
  assert.deepEqual(original.quote, receipt.quote);
  assert.deepEqual(original.authority, { state: "read_only", canReservePoints: false, canConfirmPoints: false });
  assert.ok(Object.isFrozen(original) && Object.isFrozen(original.quote) && Object.isFrozen(original.quote.adjustments));
  assert.throws(() => { original.quote.pointsTenderMinor = 1; }, TypeError);
  reference.reservationId = "caller_mutation"; // Capture copied its private reference.
  assert.deepEqual(measure(() => verify()), original);
  if (mode === "witness-read") Object.assign(saved, { handle, tx, action, context, binding, prepared });
  if (mode === "witness-next-parent") Object.assign(saved, { next: { handle, binding } });

  // Canonical lifecycle writes are fixture-only, outside the measured reader.
  if (mode === "witness-released") store.release(tx, "b1", receipt.reservationId, "c20j_release");
  if (["witness-settled", "witness-reversed"].includes(mode)) {
    evidence(fixture, request, receipt);
    const settled = store.settle(tx, "b1", receipt.reservationId, "c20j_settle");
    if (mode === "witness-reversed") {
      refundEvidence(fixture, request); store.reverse(tx, "b1", settled.snapshotId, "c20j_reverse");
      assert.equal(db.prepare("SELECT status FROM commerce_benefit_reservations WHERE id=?").get(receipt.reservationId).status, "settled",
        "reversal does not invent a reversed reservation status");
    }
  }
  if (mode === "witness-reused-id") {
    store.release(tx, "b1", receipt.reservationId, "c20j_release");
    assert.equal(store.reserve(tx, request, "c20j_reserve").reservationId, receipt.reservationId,
      "canonical reserve receipt replay returns original ID even when no longer live");
  }
  const epoch = db.prepare("SELECT authorization_epoch FROM android_devices WHERE id='d1'").get().authorization_epoch;
  if (mode === "witness-regrant" || mode === "witness-revoke") grants.revokeAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
  if (mode === "witness-regrant" || mode === "witness-reissue") grants.grantAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
  assert.equal(db.prepare("SELECT authorization_epoch FROM android_devices WHERE id='d1'").get().authorization_epoch, epoch);
  if (mode === "witness-price") db.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
  if (mode === "witness-business") db.exec("UPDATE business SET deleted_at='hidden' WHERE id='b1'");
  if (mode === "witness-rule") rules.saveCommerceBenefitsRule(tx, "b1", { ...redeem, version: 2 });
  if (mode === "witness-quote") {
    assert.throws(() => db.prepare("UPDATE commerce_benefit_reservations SET quote_json='{}' WHERE id=?").run(receipt.reservationId), /BENEFITS_IMMUTABLE/);
  }
  if (mode === "witness-receipt-expiry") assert.throws(() => db.prepare("UPDATE commerce_benefit_reservations SET expires_at_ms=expires_at_ms+1 WHERE id=?").run(receipt.reservationId), /BENEFITS_IMMUTABLE/);
  if (mode === "witness-caught") {
    measure(() => assert.throws(() => verify({ ...handle }), e => e.code === "COMPANION_POINTS_RESERVATION_SCOPE"));
    return; // Parent poison must abort despite this catch.
  }
  const realClock = Date.now, originalPrepare = db.prepare;
  try {
    measure(() => {
      if (mode === "witness-expiry-before") Date.now = () => tx.now + 999;
      if (mode === "witness-expiry-boundary") Date.now = () => tx.now + 1000;
      if (mode === "witness-expiry-after") Date.now = () => tx.now + 1001;
      if (mode === "witness-expiry-during-read") {
        let reads = 0; Date.now = () => ++reads === 1 ? realClock() : tx.now + 1000;
      }
      if (mode === "witness-clock-back") Date.now = () => tx.now - 1;
      if (mode === "witness-fault") db.prepare = function(sql) {
        if (sql.includes("quote_json,rules_json,points_minor")) throw Object.assign(new Error("fixture read fault"), { code: "FIXTURE_READ_FAULT" });
        return originalPrepare.call(this, sql);
      };
      if (mode === "witness-clone") return verify({ ...handle });
      if (mode === "witness-json") return verify(JSON.parse(JSON.stringify(handle)));
      if (mode === "witness-advisory") return verify(companion.captureCompanionSaleBenefitsQuote(tx, action, context, input, binding, prepared));
      if (mode === "witness-tampered") return verify({ ...handle, reservationId: receipt.reservationId, quote: receipt.quote, expiresAt: tx.now + 999999 });
      if (mode === "witness-parent-clone") return verify(handle, { ...tx });
      if (mode === "witness-action-clone") return verify(handle, tx, { ...action });
      if (mode === "witness-context") return verify(handle, tx, action, { ...context });
      if (mode === "witness-device") action.device_id = "device-two";
      if (mode === "witness-action") action.id = "another_witness_action";
      if (mode === "witness-customer") action.payload.customer_id = "c2";
      if (mode === "witness-intent") return verify(handle, tx, action, context, { ...input, requestedPointsMinor: 999 });
      if (mode === "witness-currency") return verify(handle, tx, action, context, { ...input, currency: "USD" });
      if (mode === "witness-payload") action.payload.reservation_id = receipt.reservationId;
      if (mode === "witness-archived") return verify(saved.handle);
      if (mode === "witness-db") {
        const other = new DatabaseSync(":memory:"); other.exec("BEGIN IMMEDIATE");
        try { return rules.withCommerceBenefitsParentTransaction(other, tx.now, otherTx => verify(handle, otherTx)); }
        finally { other.exec("ROLLBACK"); other.close(); }
      }
      if (mode === "witness-worker") {
        const blocked = worker.run("revoke");
        assert.equal(blocked.ok, false); assert.equal(blocked.errcode, 5);
        assert.equal(blocked.writes, 0); assert.equal(blocked.inTransaction, false);
      }
      assert.deepEqual(verify(), original);
    });
  } finally { Date.now = realClock; db.prepare = originalPrepare; }
  // The reader cannot promote itself to the canonical reserve/settle authority.
  if (mode === "witness-reserve-disabled") measure(() => adapter.store.reserve(tx, request, "forbidden_reserve"));
  if (mode === "witness-settle-disabled") measure(() => adapter.store.settle(tx, "b1", receipt.reservationId, "forbidden_settle"));
}

// C20p-2f: server-only per-sale policy preview. The fixture never calls a
// successful Store reserve/settle; the allow decision is policy evidence only.
export function runCompanionSalePolicyScenario({ mode, tx, action, context, input, prepared,
  grants, grantOwner, saved }) {
  const db = tx.database, appService = load("android-action-application-service");
  const measure = fn => {
    const before = databaseState(db), writes = db.prepare("SELECT total_changes() n").get().n;
    try { return fn(); }
    finally {
      assert.deepEqual(databaseState(db), before, `${mode}: all tables unchanged`);
      assert.equal(db.prepare("SELECT total_changes() n").get().n, writes, `${mode}: zero writes, including no-op`);
    }
  };
  const redeem = rule("c20p_policy_redeem", "points", { startsAt: 0, percentBps: 10000,
    points: { operation: "redeem", earnBase: "after_points", expiryDays: null } });
  rules.saveCommerceBenefitsRule(tx, "b1", redeem);
  points.adjustCommercePoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY", amount: mode === "policy-exceed-payable" ? 200000 : 5000,
    operationKey: "c20p_policy_opening", expiresAt: null });
  // Requested 100001 on a 100000-minor sale is rejected by the canonical quote
  // before any policy decision; it proves the payable cap without inventing an allow.
  const policyInput = mode === "policy-exceed-payable" ? { ...input, requestedPointsMinor: 100001 } : input;
  const binding = measure(() => intents.bindCompanionPointsIntent(tx, action, context, policyInput));
  const adapter = measure(() => companion.companionSaleBenefitsPreSaleReadPorts(tx, action, context, policyInput, binding, prepared));
  const handle = measure(() => companion.prepareCompanionSaleBenefitsIssuance(tx, action, context, policyInput, binding, prepared));
  assert.equal(appService.isLocalActionParentTransaction(db, action, context), true,
    "policy preview is inside the genuine Android owner parent");
  const principal = load("local-companion-server").requireLocalActionPointsPrincipal(db, action, context, binding.scope.customerId);
  assert.equal(principal.spendGrantGeneration, binding.scope.spendGrantGeneration);
  principal.assertAuthorized();
  const evaluate = (candidate = handle, nextTx = tx, nextAction = action, nextContext = context,
    nextInput = policyInput, nextBinding = binding, nextPrepared = prepared) =>
    companion.evaluateCompanionSaleBenefitsPolicy(nextTx, nextAction, nextContext, nextInput, nextBinding, nextPrepared, candidate);
  // C20p-2g: non-authorizing one-shot prewrite rehearsal. The decision is issued
  // from a successful policy evaluation and must be consumed exactly once.
  const prepareDecision = () => companion.prepareCompanionSaleBenefitsPrewriteDecision(tx, action, context,
    policyInput, binding, prepared, handle);
  const consume = (decision, candidate = handle, nextTx = tx, nextAction = action, nextContext = context,
    nextInput = policyInput, nextBinding = binding, nextPrepared = prepared) =>
    companion.consumeCompanionSaleBenefitsPrewriteDecision(nextTx, nextAction, nextContext, nextInput,
      nextBinding, nextPrepared, candidate, decision);
  if (mode === "policy-prewrite-consume") {
    const decision = measure(prepareDecision);
    assert.ok(Object.isFrozen(decision));
    assert.deepEqual(decision.authority, { state: "prewrite_decision_only", canReservePoints: false, canConfirmPoints: false });
    const intent = measure(() => consume(decision));
    assert.equal(intent.decision, "allow_prewrite_only");
    assert.equal(intent.actionId, action.id); assert.equal(intent.operationKey, handle.operationKey);
    assert.equal(intent.businessId, "b1"); assert.equal(intent.customerId, "c1");
    assert.equal(intent.deviceRecordId, binding.scope.deviceRecordId);
    assert.equal(intent.authorizationEpoch, binding.scope.authorizationEpoch);
    assert.equal(intent.spendGrantGeneration, binding.scope.spendGrantGeneration);
    assert.equal(intent.requestedPointsMinor, 1000); assert.equal(intent.pointsTenderMinor, 1000);
    assert.equal(intent.payableMinor, 99000); assert.equal(intent.availablePointsMinor, 5000);
    assert.ok(Object.isFrozen(intent) && Object.isFrozen(intent.authority));
    assert.deepEqual(intent.authority, { state: "prewrite_intent_only", canReservePoints: false, canConfirmPoints: false });
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_reservations").get().n, 0,
      "prewrite rehearsal writes no reservation");
    Object.assign(saved, { prewrite: { tx, action, context, input: policyInput, binding, prepared, handle, decision } });
    return measure(() => consume(decision)); // exactly-once: second consumption rejects
  }
  if (mode === "policy-prewrite-store-reserve-denied") {
    const decision = measure(prepareDecision);
    measure(() => consume(decision));
    // The consumed intent is not accepted by Store: the read-only port still denies.
    return measure(() => adapter.store.reserve(tx, { ...adapter.request, couponCodes: [] }, handle.operationKey, null, handle.ownerGate));
  }
  if (mode === "policy-prewrite-poisoned") {
    const decision = measure(prepareDecision);
    measure(() => consume(decision));
    measure(() => assert.throws(() => adapter.store.reserve(tx, { ...adapter.request, couponCodes: [] },
      handle.operationKey, null, handle.ownerGate), e => e.code === "COMPANION_POINTS_RESERVATION_DISABLED"));
    return; // A caught failed writer poisons the parent; wrapper reports BENEFITS_TRANSACTION_ABORTED.
  }
  if (mode.startsWith("policy-prewrite-")) {
    const decision = measure(prepareDecision);
    if (mode === "policy-prewrite-clone") return measure(() => consume({ ...decision }));
    if (mode === "policy-prewrite-json") return measure(() => consume(JSON.parse(JSON.stringify(decision))));
    if (mode === "policy-prewrite-handle-clone") return measure(() => consume(decision, { ...handle }));
    if (mode === "policy-prewrite-action-clone") return measure(() => consume(decision, handle, tx, { ...action }));
    if (mode === "policy-prewrite-parent-clone") return measure(() => consume(decision, handle, { ...tx }));
    if (mode === "policy-prewrite-db") {
      const other = new DatabaseSync(":memory:"); other.exec("BEGIN IMMEDIATE");
      try { return measure(() => rules.withCommerceBenefitsParentTransaction(other, tx.now, next => consume(decision, handle, next))); }
      finally { other.exec("ROLLBACK"); other.close(); }
    }
    if (mode === "policy-prewrite-stale-quote") db.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
    if (mode === "policy-prewrite-stale-rule") rules.saveCommerceBenefitsRule(tx, "b1", { ...redeem, version: 2 });
    if (mode === "policy-prewrite-revoke") grants.revokeAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
    if (mode === "policy-prewrite-reissue") {
      grants.revokeAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
      grants.grantAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
    }
    if (mode === "policy-prewrite-epoch") db.exec("UPDATE android_devices SET authorization_epoch=authorization_epoch+1 WHERE id='d1'");
    if (mode === "policy-prewrite-expired") {
      const clock = Date.now;
      Date.now = () => clock() + 31000;
      try { return measure(() => consume(decision)); } finally { Date.now = clock; }
    }
    return measure(() => consume(decision));
  }
  if (mode === "policy-allow") {
    const decision = measure(evaluate);
    assert.deepEqual(decision.authority, { state: "policy_only", canReservePoints: false, canConfirmPoints: false });
    assert.equal(decision.decision, "allow");
    assert.equal(decision.actionId, action.id);
    assert.equal(decision.businessId, "b1"); assert.equal(decision.customerId, "c1");
    assert.equal(decision.deviceRecordId, binding.scope.deviceRecordId);
    assert.equal(decision.authorizationEpoch, binding.scope.authorizationEpoch);
    assert.equal(decision.spendGrantGeneration, binding.scope.spendGrantGeneration);
    assert.equal(decision.requestedPointsMinor, 1000);
    assert.equal(decision.pointsTenderMinor, 1000);
    assert.equal(decision.payableMinor, 99000);
    assert.equal(decision.availablePointsMinor, 5000);
    assert.ok(Object.isFrozen(decision) && Object.isFrozen(decision.authority));
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_reservations").get().n, 0,
      "policy preview writes no reservation");
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_market_sale_receipts WHERE operation_id=?").get(action.id).n, 0);
    assert.equal(db.prepare("SELECT 1 FROM commerce_sales WHERE id=?").get(prepared.source.id), undefined);
    Object.assign(saved, { policy: { tx, action, context, input: policyInput, binding, prepared, handle } });
    return;
  }
  if (mode === "policy-store-reserve-denied") {
    measure(evaluate);
    // The allow decision is not accepted by Store: the read-only port still denies.
    return measure(() => adapter.store.reserve(tx, { ...adapter.request, couponCodes: [] }, handle.operationKey, null, handle.ownerGate));
  }
  if (mode === "policy-exceed-balance") points.adjustCommercePoints(tx, { businessId: "b1", customerId: "c1",
    currency: "TRY", amount: -4500, operationKey: "c20p_policy_spend", expiresAt: null });
  if (mode === "policy-stale-quote") db.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
  if (mode === "policy-stale-rule") rules.saveCommerceBenefitsRule(tx, "b1", { ...redeem, version: 2 });
  if (mode === "policy-revoke") grants.revokeAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
  if (mode === "policy-reissue") {
    grants.revokeAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
    grants.grantAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
  }
  if (mode === "policy-epoch") db.exec("UPDATE android_devices SET authorization_epoch=authorization_epoch+1 WHERE id='d1'");
  if (mode === "policy-action") action.id = "another_policy_action";
  if (mode === "policy-payload") action.payload.customer_id = "c2";
  if (mode === "policy-context") return measure(() => evaluate(handle, tx, action, { ...context }));
  if (mode === "policy-action-clone") return measure(() => evaluate(handle, tx, { ...action }, context));
  if (mode === "policy-prepared-clone") return measure(() => evaluate(handle, tx, action, context, policyInput, binding, { ...prepared }));
  if (mode === "policy-handle-clone") return measure(() => evaluate({ ...handle }));
  if (mode === "policy-parent-clone") return measure(() => evaluate(handle, { ...tx }));
  if (mode === "policy-db") {
    const other = new DatabaseSync(":memory:"); other.exec("BEGIN IMMEDIATE");
    try { return measure(() => rules.withCommerceBenefitsParentTransaction(other, tx.now, next => evaluate(handle, next))); }
    finally { other.exec("ROLLBACK"); other.close(); }
  }
  return measure(evaluate);
}

// C20p-2k: the ONLY opt-in Companion Store writer. The opaque one-operation
// handle is owner-issued inside the genuine Android parent and is never accepted
// by the existing read-only ports. A successful reserve is a fixture write; the
// outer owner always rolls the whole parent back, so no sale/settlement/ACK exists.
export function runCompanionPaidWriterScenario({ mode, tx, action, context, input, prepared,
  grants, grantOwner, saved }) {
  const db = tx.database, appService = load("android-action-application-service");
  const measure = fn => {
    const before = databaseState(db), writes = db.prepare("SELECT total_changes() n").get().n;
    try { return fn(); }
    finally {
      assert.deepEqual(databaseState(db), before, `${mode}: all tables unchanged`);
      assert.equal(db.prepare("SELECT total_changes() n").get().n, writes, `${mode}: zero writes, including no-op`);
    }
  };
  const redeem = rule("c20p_paid_writer_redeem", "points", { startsAt: 0, percentBps: 10000,
    points: { operation: "redeem", earnBase: "after_points", expiryDays: null } });
  rules.saveCommerceBenefitsRule(tx, "b1", redeem);
  points.adjustCommercePoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY", amount: 5000,
    operationKey: "c20p_paid_writer_opening", expiresAt: null });
  const binding = measure(() => intents.bindCompanionPointsIntent(tx, action, context, input));
  const issuance = measure(() => companion.prepareCompanionSaleBenefitsIssuance(tx, action, context, input, binding, prepared));
  assert.equal(appService.isLocalActionParentTransaction(db, action, context), true,
    "paid-writer authority is issued inside the genuine Android owner parent");
  const authorization = measure(() => companion.issueCompanionSaleBenefitsPaidWriterAuthorization(
    tx, action, context, input, binding, prepared, issuance));
  assert.deepEqual(authorization, {}); assert.ok(Object.isFrozen(authorization));
  assert.equal(JSON.stringify(authorization), "{}", "opaque handle exposes no serializable authority");
  const build = (nextTx = tx, nextAction = action, nextContext = context, nextInput = input,
    nextBinding = binding, nextPrepared = prepared, nextAuthorization = authorization) =>
    companion.companionSaleBenefitsPaidWriterPorts(nextTx, nextAction, nextContext, nextInput,
      nextBinding, nextPrepared, nextAuthorization);
  const adapter = measure(() => build());
  assert.deepEqual(adapter.authorization, { state: "paid_writer_checkout_only", canReservePoints: true, canConfirmPoints: false });
  const reserve = (candidate = authorization) => {
    const current = build(tx, action, context, input, binding, prepared, candidate);
    return current.store.reserve(tx, { ...current.request, couponCodes: [] }, issuance.operationKey, null, issuance.ownerGate);
  };
  if (mode === "paid-writer-readonly") {
    const readonly = measure(() => companion.companionSaleBenefitsPreSaleReadPorts(tx, action, context, input, binding, prepared));
    return measure(() => readonly.store.reserve(tx, { ...readonly.request, couponCodes: [] }, issuance.operationKey, null, issuance.ownerGate));
  }
  if (mode === "paid-writer-clone") return measure(() => reserve({ ...authorization }));
  if (mode === "paid-writer-json") return measure(() => reserve(JSON.parse(JSON.stringify(authorization))));
  if (mode === "paid-writer-action-clone") return measure(() => build(tx, { ...action }));
  if (mode === "paid-writer-context-clone") return measure(() => build(tx, action, { ...context }));
  if (mode === "paid-writer-prepared-clone") return measure(() => build(tx, action, context, input, binding, { ...prepared }));
  if (mode === "paid-writer-parent-clone") return measure(() => build({ ...tx }));
  if (mode === "paid-writer-db") {
    const other = new DatabaseSync(":memory:"); other.exec("BEGIN IMMEDIATE");
    try { return measure(() => rules.withCommerceBenefitsParentTransaction(other, tx.now, next => build(next))); }
    finally { other.exec("ROLLBACK"); other.close(); }
  }
  if (mode === "paid-writer-refund") return measure(() => adapter.ports.authorize(tx.database, adapter.request, "refund"));
  if (mode === "paid-writer-request") return measure(() => adapter.store.reserve(tx,
    { ...adapter.request, couponCodes: [], currency: "USD" }, issuance.operationKey, null, issuance.ownerGate));
  if (mode === "paid-writer-source") return measure(() => adapter.store.reserve(tx,
    { ...adapter.request, couponCodes: [], source: { kind: "sale", id: "foreign_paid_writer_source" } }, issuance.operationKey, null, issuance.ownerGate));
  if (mode === "paid-writer-stale-quote") db.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
  if (mode === "paid-writer-stale-rule") rules.saveCommerceBenefitsRule(tx, "b1", { ...redeem, version: 2 });
  if (mode === "paid-writer-revoke") grants.revokeAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
  if (mode === "paid-writer-reissue") {
    grants.revokeAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
    grants.grantAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
  }
  if (mode === "paid-writer-epoch") db.exec("UPDATE android_devices SET authorization_epoch=authorization_epoch+1 WHERE id='d1'");
  if (mode === "paid-writer-expired") {
    const clock = Date.now; Date.now = () => clock() + 31000;
    try { return measure(() => reserve()); } finally { Date.now = clock; }
  }
  if (mode === "paid-writer-reuse") {
    const receipt = reserve();
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_reservations WHERE id=?").get(receipt.reservationId).n, 1);
    return measure(() => reserve());
  }
  if (mode === "paid-writer-canonical-sale") {
    // C20p-2l TEST-ONLY combination: the genuine owner-issued Store.reserve and
    // the genuine canonical paid sale write in this same Android parent. The
    // reserve callback below is a quote reader, never a second Store writer.
    const receipt = reserve(), now = new Date(tx.now).toISOString();
    assert.equal(receipt.quote.pointsTenderMinor, 1000);
    assert.equal(receipt.quote.payableMinor, 99000);
    assert.equal(receipt.quote.subtotalMinor, receipt.quote.discountMinor + receipt.quote.pointsTenderMinor + receipt.quote.payableMinor);
    const saleInput = { customerId: "c1", locationId: "loc", paymentMethod: action.payload.payment_method,
      source: "android-market-sale", items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity })) };
    const sale = load("commerce-store").createCommerceSaleInTransaction(db, saleInput, "paid", now,
      { saleId: prepared.source.id, reserve: () => receipt.quote });
    assert.equal(sale.id, prepared.source.id);
    assert.equal(sale.status, "paid");
    const settlement = db.prepare("SELECT cash_received_minor,points_tender_minor FROM commerce_sale_settlements WHERE sale_id=?").get(sale.id);
    assert.equal(settlement.cash_received_minor, receipt.quote.payableMinor);
    assert.equal(settlement.points_tender_minor, receipt.quote.pointsTenderMinor);
    const finance = db.prepare(`SELECT direction,amount_minor,currency FROM finance_entries
      WHERE source_type='commerce_sale' AND source_id=? AND deleted_at=''`).all(sale.id);
    assert.equal(finance.length, 1);
    assert.equal(finance[0].direction, "income");
    assert.equal(finance[0].amount_minor, 99000);
    assert.equal(finance[0].currency, receipt.quote.currency);
    const stockCount = db.prepare("SELECT count(*) n FROM inventory_movements WHERE reference_id=?").get(sale.id).n;
    assert.ok(stockCount > 0, "canonical sale wrote stock movements");
    const reservation = db.prepare("SELECT status FROM commerce_benefit_reservations WHERE id=?").get(receipt.reservationId);
    assert.equal(reservation.status, "active", "genuine Store.settle did NOT execute");
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_snapshots WHERE source_kind='sale' AND source_id=?").get(sale.id).n, 0,
      "no points settlement snapshot exists");
    // TEST FIXTURE ONLY: canonical operation receipt mapping the real owner would
    // mint. It is NOT an ACK, not a trusted-writer certification, and the real
    // owner still terminates and rolls the whole parent back.
    const identityInput = { operationId: action.id, customerId: action.payload.customer_id, locationId: action.payload.location_id,
      settlement: action.payload.settlement ?? "paid", paymentMethod: action.payload.payment_method, source: "android-market-sale",
      items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity,
        ...(line.expected_unit_price === undefined ? {} : { expectedUnitPrice: line.expected_unit_price }),
        ...(line.expected_currency === undefined ? {} : { expectedCurrency: line.expected_currency }),
        ...(line.expected_updated_at === undefined ? {} : { expectedUpdatedAt: line.expected_updated_at }) })) };
    const identity = measure(() => load("market-sale-operation").readMarketSaleOperationRequestIdentityInTransaction(db, identityInput));
    db.prepare("INSERT INTO commerce_market_sale_receipts (operation_id,business_id,sale_id,request_hash,created_at) VALUES (?,?,?,?,?)")
      .run(action.id, "b1", sale.id, identity.requestHash, now);
    // Observable proof that the real owner denies BEFORE inserting the ACK.
    db.exec("CREATE TEMP TRIGGER c20p_2l_ack_probe BEFORE INSERT ON android_action_receipts BEGIN SELECT c20p_ack_insert_probe(); END");
    saved.paidWriterCanonicalSale = { actionId: action.id, sourceId: prepared.source.id, saleId: sale.id, saleStatus: sale.status,
      requestHash: identity.requestHash, reservationId: receipt.reservationId, reservationStatus: reservation.status,
      subtotalMinor: receipt.quote.subtotalMinor, discountMinor: receipt.quote.discountMinor,
      pointsTenderMinor: receipt.quote.pointsTenderMinor, cashPaidMinor: receipt.quote.payableMinor,
      settlementCashMinor: settlement.cash_received_minor, settlementPointsMinor: settlement.points_tender_minor,
      financeCount: finance.length, financeAmountMinor: finance[0].amount_minor, financeDirection: finance[0].direction,
      stockCount, settleExecuted: false };
    return true; // let the real Android owner attempt its pre-ACK points check
  }
  if (mode === "paid-writer-settled-sale") {
    // C20p-2m TEST-ONLY: genuine Store.reserve + canonical paid sale + the exact
    // genuine Store.settle through the bounded settlement port in ONE Android
    // parent. The fixture mapping is still NOT trusted provenance; the owner's
    // pre-ACK verifier requires ACTIVE and no snapshot, so it must fail closed.
    const receipt = reserve(), now = new Date(tx.now).toISOString();
    assert.equal(receipt.quote.pointsTenderMinor, 1000);
    assert.equal(receipt.quote.payableMinor, 99000);
    // Capture the exact Store.reserve receipt while the prepared source is still
    // pre-sale; later revalidation uses the paid-evidence branch.
    measure(() => companion.captureCompanionSaleBenefitsIssuedReservation(tx, action, context, input, binding, prepared, issuance, receipt));
    const saleInput = { customerId: "c1", locationId: "loc", paymentMethod: action.payload.payment_method,
      source: "android-market-sale", items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity })) };
    const sale = load("commerce-store").createCommerceSaleInTransaction(db, saleInput, "paid", now,
      { saleId: prepared.source.id, reserve: () => receipt.quote });
    assert.equal(sale.id, prepared.source.id); assert.equal(sale.status, "paid");
    const tender = db.prepare("SELECT cash_received_minor,points_tender_minor FROM commerce_sale_settlements WHERE sale_id=?").get(sale.id);
    assert.equal(tender.cash_received_minor, receipt.quote.payableMinor);
    assert.equal(tender.points_tender_minor, receipt.quote.pointsTenderMinor);
    const settled = companion.settleCompanionSaleBenefitsPaidSale(tx, action, context, input, binding, prepared, issuance, receipt);
    assert.ok(Object.isFrozen(settled) && Object.isFrozen(settled.settlement) && Object.isFrozen(settled.authority));
    assert.equal(settled.authority.state, "paid_settlement_test_only");
    assert.equal(settled.authority.canReservePoints, false);
    assert.equal(settled.authority.canConfirmPoints, false);
    const settlementReceipt = settled.settlement;
    assert.equal(settlementReceipt.version, 1);
    assert.equal(settlementReceipt.reservationId, receipt.reservationId);
    assert.equal(typeof settlementReceipt.snapshotId, "string");
    assert.equal(settlementReceipt.quote.pointsTenderMinor, receipt.quote.pointsTenderMinor);
    const reservation = db.prepare("SELECT status,points_minor FROM commerce_benefit_reservations WHERE id=?").get(receipt.reservationId);
    assert.equal(reservation.status, "settled", "genuine Store.settle marked the reservation settled");
    assert.equal(reservation.points_minor, receipt.quote.pointsTenderMinor);
    const spend = db.prepare(`SELECT id,kind,amount_minor,source_kind,source_id FROM commerce_benefit_point_ledger
      WHERE business_id='b1' AND customer_id='c1' AND id=?`).get(settlementReceipt.pointSpendEntryId ?? "");
    assert.ok(spend, "settlement wrote the points spend ledger entry");
    assert.equal(spend.kind, "spend"); assert.equal(spend.amount_minor, -receipt.quote.pointsTenderMinor);
    assert.equal(spend.source_kind, "sale"); assert.equal(spend.source_id, sale.id);
    const allocated = db.prepare(`SELECT COALESCE(SUM(amount_minor),0) n FROM commerce_benefit_point_allocations
      WHERE business_id='b1' AND debit_entry_id=?`).get(settlementReceipt.pointSpendEntryId);
    assert.equal(allocated.n, receipt.quote.pointsTenderMinor, "hold credit entries were consumed by the spend allocation");
    const snapshot = db.prepare("SELECT source_kind,source_id,reservation_id FROM commerce_benefit_snapshots WHERE id=?").get(settlementReceipt.snapshotId);
    assert.ok(snapshot, "settlement wrote the commerce_benefit_snapshots row");
    assert.equal(snapshot.source_kind, "sale"); assert.equal(snapshot.source_id, sale.id);
    assert.equal(snapshot.reservation_id, receipt.reservationId);
    const finance = db.prepare(`SELECT direction,amount_minor,currency FROM finance_entries
      WHERE source_type='commerce_sale' AND source_id=? AND deleted_at=''`).all(sale.id);
    assert.equal(finance.length, 1); assert.equal(finance[0].direction, "income");
    assert.equal(finance[0].amount_minor, receipt.quote.payableMinor); assert.equal(finance[0].currency, receipt.quote.currency);
    assert.ok(db.prepare("SELECT count(*) n FROM inventory_movements WHERE reference_id=?").get(sale.id).n > 0);
    const identityInput = { operationId: action.id, customerId: action.payload.customer_id, locationId: action.payload.location_id,
      settlement: action.payload.settlement ?? "paid", paymentMethod: action.payload.payment_method, source: "android-market-sale",
      items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity,
        ...(line.expected_unit_price === undefined ? {} : { expectedUnitPrice: line.expected_unit_price }),
        ...(line.expected_currency === undefined ? {} : { expectedCurrency: line.expected_currency }),
        ...(line.expected_updated_at === undefined ? {} : { expectedUpdatedAt: line.expected_updated_at }) })) };
    const identity = measure(() => load("market-sale-operation").readMarketSaleOperationRequestIdentityInTransaction(db, identityInput));
    db.prepare("INSERT INTO commerce_market_sale_receipts (operation_id,business_id,sale_id,request_hash,created_at) VALUES (?,?,?,?,?)")
      .run(action.id, "b1", sale.id, identity.requestHash, now);
    db.exec("CREATE TEMP TRIGGER c20p_2m_ack_probe BEFORE INSERT ON android_action_receipts BEGIN SELECT c20p_ack_insert_probe(); END");
    saved.paidWriterSettledSale = { actionId: action.id, sourceId: prepared.source.id, saleId: sale.id, saleStatus: sale.status,
      reservationId: receipt.reservationId, reservationStatus: reservation.status,
      snapshotId: settlementReceipt.snapshotId, pointSpendEntryId: settlementReceipt.pointSpendEntryId,
      pointsTenderMinor: receipt.quote.pointsTenderMinor, cashPaidMinor: receipt.quote.payableMinor,
      spentMinor: spend.amount_minor, allocatedMinor: allocated.n,
      financeCount: finance.length, financeAmountMinor: finance[0].amount_minor, financeDirection: finance[0].direction,
      stockCount: db.prepare("SELECT count(*) n FROM inventory_movements WHERE reference_id=?").get(sale.id).n,
      settleExecuted: true };
    return true; // let the real Android owner attempt its pre-ACK points check
  }
  if (mode === "paid-writer-owner-minted-sale") {
    // C20p-2n: the owner-issued canonical sale writer mints the operation
    // mapping itself. This mode never inserts commerce_market_sale_receipts.
    const receipt = reserve(), now = new Date(tx.now).toISOString();
    assert.equal(receipt.quote.pointsTenderMinor, 1000);
    assert.equal(receipt.quote.payableMinor, 99000);
    measure(() => companion.captureCompanionSaleBenefitsIssuedReservation(tx, action, context, input, binding, prepared, issuance, receipt));
    const owner = measure(() => companion.prepareCompanionSalePaidSaleWriter(tx, action, context, input, binding, prepared, issuance, receipt));
    assert.ok(Object.isFrozen(owner) && Object.isFrozen(owner.witness));
    const ownerInput = { operationId: action.id, customerId: action.payload.customer_id, locationId: action.payload.location_id,
      settlement: action.payload.settlement ?? "paid", paymentMethod: action.payload.payment_method, source: "android-market-sale",
      items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity,
        ...(line.expected_unit_price === undefined ? {} : { expectedUnitPrice: line.expected_unit_price }),
        ...(line.expected_currency === undefined ? {} : { expectedCurrency: line.expected_currency }),
        ...(line.expected_updated_at === undefined ? {} : { expectedUpdatedAt: line.expected_updated_at }) })) };
    const result = load("market-sale-operation").completeMarketCompanionPaidSaleInTransaction(
      tx, ownerInput, owner.allocation, receipt, owner.witness);
    const sale = result.sale;
    assert.equal(sale.id, prepared.source.id);
    assert.equal(sale.status, "paid");
    const mapping = db.prepare("SELECT operation_id,business_id,sale_id,request_hash,created_at FROM commerce_market_sale_receipts WHERE operation_id=?").get(action.id);
    assert.ok(mapping, "the owner-issued sale writer minted the operation mapping");
    assert.equal(mapping.sale_id, sale.id);
    assert.equal(mapping.business_id, "b1");
    assert.equal(mapping.created_at, now);
    const identity = load("market-sale-operation").readMarketSaleOperationRequestIdentityInTransaction(db, ownerInput);
    assert.equal(mapping.request_hash, identity.requestHash, "mapping hash equals the canonical owner request hash");
    const tender = db.prepare("SELECT cash_received_minor,points_tender_minor FROM commerce_sale_settlements WHERE sale_id=?").get(sale.id);
    assert.equal(tender.cash_received_minor, receipt.quote.payableMinor);
    assert.equal(tender.points_tender_minor, receipt.quote.pointsTenderMinor);
    const finance = db.prepare(`SELECT direction,amount_minor,currency FROM finance_entries
      WHERE source_type='commerce_sale' AND source_id=? AND deleted_at=''`).all(sale.id);
    assert.equal(finance.length, 1);
    assert.equal(finance[0].amount_minor, receipt.quote.payableMinor);
    assert.equal(finance[0].direction, "income");
    const stockCount = db.prepare("SELECT count(*) n FROM inventory_movements WHERE reference_id=?").get(sale.id).n;
    assert.ok(stockCount > 0, "canonical owner sale wrote stock movements");
    const witness = companion.readCompanionSaleOperationWitness(tx, action, context, input, binding, prepared, issuance);
    assert.equal(witness.receipt.saleId, sale.id);
    assert.equal(witness.receipt.pointsTenderMinor, receipt.quote.pointsTenderMinor);
    assert.equal(witness.receipt.cashPaidMinor, receipt.quote.payableMinor);
    const evidence = load("android-points-sale-receipt-evidence")
      .inspectAndroidPointsSaleReceiptEvidenceInTransaction(db, action, context);
    assert.equal(evidence.state, "structural_candidate_only");
    assert.equal(evidence.requestHash, identity.requestHash, "owner verifier accepts the owner-minted mapping hash");
    assert.equal(evidence.saleId, sale.id);
    assert.equal(evidence.reservationId, receipt.reservationId);
    db.exec("CREATE TEMP TRIGGER c20p_2n_ack_probe BEFORE INSERT ON android_action_receipts BEGIN SELECT c20p_ack_insert_probe(); END");
    saved.paidWriterOwnerMintedSale = { actionId: action.id, sourceId: prepared.source.id, saleId: sale.id, saleStatus: sale.status,
      requestHash: identity.requestHash, reservationId: receipt.reservationId,
      pointsTenderMinor: receipt.quote.pointsTenderMinor, cashPaidMinor: receipt.quote.payableMinor,
      settlementCashMinor: tender.cash_received_minor, settlementPointsMinor: tender.points_tender_minor,
      financeCount: finance.length, financeAmountMinor: finance[0].amount_minor, financeDirection: finance[0].direction,
      stockCount, ownerMintedMapping: true };
    return true; // let the real Android owner attempt its pre-ACK points check
  }
  if (mode === "paid-writer-authorized-points-receipt") {
    // C20p-2o: owner-minted canonical sale + genuine Store.settle, then the new
    // server-only points receipt witness/materializer. No direct receipt INSERT.
    const receipt = reserve();
    assert.equal(receipt.quote.pointsTenderMinor, 1000);
    assert.equal(receipt.quote.payableMinor, 99000);
    measure(() => companion.captureCompanionSaleBenefitsIssuedReservation(tx, action, context, input, binding, prepared, issuance, receipt));
    const owner = measure(() => companion.prepareCompanionSalePaidSaleWriter(tx, action, context, input, binding, prepared, issuance, receipt));
    const ownerInput = { operationId: action.id, customerId: action.payload.customer_id, locationId: action.payload.location_id,
      settlement: action.payload.settlement ?? "paid", paymentMethod: action.payload.payment_method, source: "android-market-sale",
      items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity,
        ...(line.expected_unit_price === undefined ? {} : { expectedUnitPrice: line.expected_unit_price }),
        ...(line.expected_currency === undefined ? {} : { expectedCurrency: line.expected_currency }),
        ...(line.expected_updated_at === undefined ? {} : { expectedUpdatedAt: line.expected_updated_at }) })) };
    const result = load("market-sale-operation").completeMarketCompanionPaidSaleInTransaction(
      tx, ownerInput, owner.allocation, receipt, owner.witness);
    const sale = result.sale;
    assert.equal(sale.id, prepared.source.id);
    // Capture the owner operation receipt while its mutable evidence is still
    // valid; settlement later adds the snapshot row, so it must not be re-read.
    const provenance = measure(() => load("market-sale-operation")
      .captureMarketSalePaidSaleProvenance(tx, ownerInput, owner.witness));
    const requestHash = load("market-sale-operation")
      .readMarketSaleOperationRequestIdentityInTransaction(db, ownerInput).requestHash;
    const settled = companion.settleCompanionSaleBenefitsPaidSale(tx, action, context, input, binding, prepared, issuance, receipt);
    const settlement = settled.settlement;
    assert.equal(db.prepare("SELECT status FROM commerce_benefit_reservations WHERE id=?").get(receipt.reservationId).status, "settled");
    const points = load("android-points-sale-receipt-evidence");
    const witness = measure(() => points.prepareAndroidPointsSaleReceiptWitness(tx, action, context, provenance, settlement));
    const materialized = measure(() => points.materializeAuthorizedPointsSaleReceipt(tx, action, context, witness, settlement));
    assert.ok(Object.isFrozen(materialized));
    assert.equal(materialized.pointsTenderMinor, 1000);
    assert.equal(materialized.cashPaidMinor, 99000);
    assert.equal(materialized.saleId, sale.id);
    assert.equal(materialized.intentHash, load("market-android-actions").marketAndroidActionIntentHash(action),
      "receipt intentHash is the Android action hash, not the canonical operation request hash");
    assert.notEqual(materialized.intentHash, requestHash, "action hash and operation hash stay distinct");
    db.exec("CREATE TEMP TRIGGER c20p_2o_ack_probe BEFORE INSERT ON android_action_receipts BEGIN SELECT c20p_ack_insert_probe(); END");
    saved.paidWriterAuthorizedPointsReceipt = { actionId: action.id, saleId: sale.id, requestHash,
      intentHash: materialized.intentHash, reservationId: receipt.reservationId, snapshotId: settlement.snapshotId,
      pointSpendEntryId: settlement.pointSpendEntryId, pointsTenderMinor: materialized.pointsTenderMinor,
      cashPaidMinor: materialized.cashPaidMinor, settledStatus: "settled" };
    // ONE terminal negative: replaying the consumed opaque witness poisons this
    // parent. No catch/recovery on the same BenefitsTransaction.
    points.materializeAuthorizedPointsSaleReceipt(tx, action, context, witness, settlement);
    return true; // unreachable; the replay throws and rolls back
  }
  if (mode !== "paid-writer-authorize") return measure(() => reserve());
  const receipt = reserve();
  assert.equal(receipt.version, 1);
  assert.equal(receipt.quote.pointsTenderMinor, 1000);
  assert.equal(receipt.quote.payableMinor, 99000);
  assert.equal(db.prepare("SELECT status FROM commerce_benefit_reservations WHERE id=?").get(receipt.reservationId).status, "active");
  assert.ok(db.prepare("SELECT count(*) n FROM commerce_benefit_point_holds WHERE reservation_id=?").get(receipt.reservationId).n > 0,
    "real Store.reserve wrote the point hold in the genuine parent");
  for (const [table, column] of [["commerce_sales", "id"], ["commerce_sale_settlements", "sale_id"],
    ["finance_entries", "source_id"], ["commerce_market_sale_receipts", "operation_id"],
    ["android_action_receipts", "id"], ["android_market_sale_result_receipts", "action_id"]])
    assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${column}=?`).get(
      table === "commerce_market_sale_receipts" || table === "android_action_receipts" || table === "android_market_sale_result_receipts"
        ? action.id : prepared.source.id).n, 0, `${table}: paid writer opened no sale/settlement/ACK`);
  saved.paidWriter = { reservationId: receipt.reservationId, pointsTenderMinor: receipt.quote.pointsTenderMinor,
    holdCount: db.prepare("SELECT count(*) n FROM commerce_benefit_point_holds WHERE reservation_id=?").get(receipt.reservationId).n };
}

// C20k: only this fixture's independently authorized canonical Store can write.
// Production Companion ports remain read-only even with a valid issuance gate.
export function runCompanionReservationIssuanceScenario({ mode, tx, action, context, input, prepared,
  key, fixture, grants, grantOwner, worker, saved, commerceBoundarySource }) {
  const db = tx.database, suffix = mode.slice("issuance-".length);
  const measure = fn => {
    const before = databaseState(db), writes = db.prepare("SELECT total_changes() n").get().n;
    try { return fn(); }
    finally {
      assert.deepEqual(databaseState(db), before, `${mode}: all reader tables unchanged`);
      assert.equal(db.prepare("SELECT total_changes() n").get().n, writes, `${mode}: zero reader writes`);
    }
  };
  const redeem = rule("c20k_redeem", "points", { startsAt: 0, percentBps: 10000,
    points: { operation: "redeem", earnBase: "after_points", expiryDays: null } });
  rules.saveCommerceBenefitsRule(tx, "b1", redeem);
  points.adjustCommercePoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY", amount: 5000,
    operationKey: "c20k_opening", expiresAt: suffix.includes("expiry") ? tx.now + 1000 : null });
  const binding = measure(() => intents.bindCompanionPointsIntent(tx, action, context, input));
  const adapter = measure(() => companion.companionSaleBenefitsPreSaleReadPorts(tx, action, context, input, binding, prepared));
  const fixturePorts = parentPorts();
  if (suffix === "before-parent-pricing") {
    const resolve = fixturePorts.resolvePricing;
    fixturePorts.resolvePricing = (...args) => {
      const value = resolve(...args);
      return { ...value, lines: value.lines.map(line => ({ ...line, unitPriceMinor: line.unitPriceMinor + 1 })) };
    };
  }
  const store = new CommerceBenefitsStore(key, fixturePorts), request = { ...adapter.request, couponCodes: [] };
  const handle = measure(() => companion.prepareCompanionSaleBenefitsIssuance(tx, action, context, input, binding, prepared));
  assert.ok(Object.isFrozen(handle) && Object.isFrozen(handle.ownerGate));
  assert.match(handle.operationKey, /^companion:[a-f0-9]{64}:reserve$/);
  const capture = (receipt, candidate = handle) => companion.captureCompanionSaleBenefitsIssuedReservation(
    tx, action, context, input, binding, prepared, candidate, receipt);
  const verify = (candidate = handle, nextTx = tx, nextAction = action, nextContext = context,
    nextInput = input, nextBinding = binding, nextPrepared = prepared) =>
    companion.revalidateCompanionSaleBenefitsIssuedReservation(nextTx, nextAction, nextContext, nextInput, nextBinding, nextPrepared, candidate);
  if (suffix === "owner-principal" || suffix === "owner-authorize-denied") {
    // C20p-2d: the live Android owner principal and this fixture BenefitsTransaction
    // share the genuine BEGIN IMMEDIATE. The fixture Store below is TEST ONLY and
    // never represents Companion permission.
    const ingress = load("local-companion-server"), appService = load("android-action-application-service");
    assert.equal(appService.isLocalActionParentTransaction(tx.database, action, context), true,
      "C20k benefits parent is the genuine Android owner transaction");
    assert.equal(appService.isLocalActionParentTransaction(tx.database, { ...action }, context), false,
      "a cloned action cannot inherit the owner parent");
    assert.equal(appService.isLocalActionParentTransaction(tx.database, action, { ...context }), false,
      "a cloned context cannot inherit the owner parent");
    const principal = ingress.requireLocalActionPointsPrincipal(tx.database, action, context, binding.scope.customerId);
    assert.equal(principal.businessId, binding.scope.businessId, "principal business is the bound canonical business");
    assert.equal(principal.deviceId, binding.scope.deviceId);
    assert.equal(principal.deviceRecordId, binding.scope.deviceRecordId);
    assert.equal(principal.authorizationEpoch, binding.scope.authorizationEpoch);
    assert.equal(principal.spendGrantGeneration, binding.scope.spendGrantGeneration, "principal grant is the live binding grant");
    principal.assertAuthorized();
    assert.throws(() => ingress.requireLocalActionPointsPrincipal(tx.database, { ...action }, context, binding.scope.customerId),
      e => e.code === "COMPANION_POINTS_DENIED", "cloned action principal denied");
    assert.throws(() => ingress.requireLocalActionPointsPrincipal(tx.database, action, { ...context }, binding.scope.customerId),
      e => e.code === "COMPANION_POINTS_DENIED", "cloned context principal denied");
    // Frozen C20k issuance handle plus live quote/capture in the very same parent.
    const quote = measure(() => companion.captureCompanionSaleBenefitsQuote(tx, action, context, input, binding, prepared));
    assert.ok(Object.isFrozen(quote));
    const quoteRead = measure(() => companion.revalidateCompanionSaleBenefitsQuote(tx, action, context, input, binding, prepared, quote));
    assert.deepEqual(measure(() => companion.revalidateCompanionSaleBenefitsQuote(tx, action, context, input, binding, prepared, quote)), quoteRead);
    if (suffix === "owner-authorize-denied") {
      // Terminal denial in its own fresh parent. Never caught here: benefitsOperation
      // marks this scope failed, so runPreSale must collect the error outside the router.
      adapter.ports.authorize(tx.database, adapter.request, "checkout");
      assert.fail("Companion authorize must deny even with a live principal and quote");
    }
    const receipt = store.reserve(tx, request, handle.operationKey, null, handle.ownerGate);
    measure(() => capture(receipt));
    const issued = measure(() => verify());
    assert.equal(issued.reservationId, receipt.reservationId);
    assert.deepEqual(issued.quote, receipt.quote);
    principal.assertAuthorized();
    assert.equal(db.prepare("SELECT 1 FROM commerce_market_sale_receipts WHERE operation_id=?").get(action.id), undefined);
    assert.equal(db.prepare("SELECT 1 FROM android_action_receipts WHERE id=?").get(action.id), undefined);
    assert.equal(db.prepare("SELECT 1 FROM commerce_sales WHERE id=?").get(request.source.id), undefined);
    return;
  }
  const mutate = kind => {
    const epoch = db.prepare("SELECT authorization_epoch FROM android_devices WHERE id='d1'").get().authorization_epoch;
    if (["regrant", "revoke"].includes(kind)) grants.revokeAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
    if (["regrant", "reissue"].includes(kind)) grants.grantAndroidBenefitsSpend(db, grantOwner, "b1", "device-one", "c1");
    if (kind === "epoch") db.exec("UPDATE android_devices SET authorization_epoch=authorization_epoch+1 WHERE id='d1'");
    else assert.equal(db.prepare("SELECT authorization_epoch FROM android_devices WHERE id='d1'").get().authorization_epoch, epoch);
    if (kind === "price") db.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
    if (kind === "rule") rules.saveCommerceBenefitsRule(tx, "b1", { ...redeem, version: 2 });
    if (kind === "business") db.exec("UPDATE business SET deleted_at='hidden' WHERE id='b1'");
    if (kind === "customer") action.payload.customer_id = "c2";
    if (kind === "device") action.device_id = "device-two";
    if (kind === "action") action.id = "another_issuance_action";
    if (kind === "currency") input = { ...input, currency: "USD" };
    if (kind === "intent") input = { ...input, requestedPointsMinor: 999 };
    if (["quote", "insufficient"].includes(kind)) points.adjustCommercePoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY",
      amount: kind === "insufficient" ? -4500 : -500, operationKey: "c20k_quote_drift", expiresAt: null });
  };
  if (suffix.startsWith("before-")) mutate(suffix.slice(7));
  if (suffix === "before-context") return measure(() => verify(handle, tx, action, { ...context }));
  if (suffix === "before-currency") return measure(() => store.reserve(tx, { ...request, currency: "USD" }, handle.operationKey, null, handle.ownerGate));
  if (suffix === "before-intent") return measure(() => store.reserve(tx, { ...request, requestedPointsMinor: 999 }, handle.operationKey, null, handle.ownerGate));
  if (suffix === "before-expiry") {
    const clock = Date.now; Date.now = () => tx.now + 1000;
    try { return measure(() => store.reserve(tx, request, handle.operationKey, null, handle.ownerGate)); }
    finally { Date.now = clock; }
  }
  if (suffix === "unissued") return measure(() => verify());
  if (suffix === "tender-unissued") return measure(() => companion.prepareCompanionSaleTenderContract(tx, action, context, input, binding, prepared, handle));
  if (suffix === "forged-handle") return measure(() => verify({ ...handle }));
  if (suffix === "before-forged-gate") return measure(() => store.reserve(tx, request, handle.operationKey, null, {}));
  if (suffix === "before-operation") return measure(() => store.reserve(tx, request, "wrong_operation", null, handle.ownerGate));
  if (suffix === "before-source") return measure(() => store.reserve(tx, { ...request, source: { kind: "sale", id: "foreign_source" } }, handle.operationKey, null, handle.ownerGate));
  if (suffix === "before-source-kind") return measure(() => store.reserve(tx, { ...request, source: { kind: "commerce_order", id: request.source.id } }, handle.operationKey, null, handle.ownerGate));
  if (suffix === "reserve-disabled") return measure(() => adapter.store.reserve(tx, request, handle.operationKey, null, handle.ownerGate));
  let receipt;
  if (["without-gate", "replay", "replay-gate", "late-gate"].includes(suffix)) {
    receipt = store.reserve(tx, request, handle.operationKey);
    if (suffix === "replay-gate") return measure(() => store.reserve(tx, request, handle.operationKey, null, handle.ownerGate));
    if (suffix === "replay") receipt = store.reserve(tx, request, handle.operationKey);
    const candidate = suffix === "late-gate"
      ? measure(() => companion.prepareCompanionSaleBenefitsIssuance(tx, action, context, input, binding, prepared)) : handle;
    return measure(() => capture(receipt, candidate));
  }
  // Canonical fixture writer, deliberately outside reader measurements. Before-*
  // gate denials must happen before even the canonical reserve expiry UPDATE.
  if (suffix.startsWith("before-")) return measure(() => store.reserve(tx, request, handle.operationKey, null, handle.ownerGate));
  if (suffix === "fault-caught") {
    db.exec("CREATE TEMP TRIGGER c20k_receipt_fault BEFORE INSERT ON commerce_benefit_receipts BEGIN SELECT RAISE(ABORT,'fixture issuance receipt fault'); END");
    assert.throws(() => store.reserve(tx, request, handle.operationKey, null, handle.ownerGate), /fixture issuance receipt fault/);
    measure(() => assert.throws(() => capture({}), e => e.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED"));
    return; // A caught failed writer poisons the parent; its provisional rows roll back.
  }
  if (suffix === "cross-writer-atomic") {
    // C20p-2h negative choreography: consume the C20p-2g one-shot prewrite
    // decision BEFORE the test-only C20k fixture reservation changes the points
    // balance, then write a real canonical points-paid sale. The REAL Android
    // owner must reject the settlement at its pre-commit evidence check and roll
    // all cross-writer rows back together.
    const decision = measure(() => companion.prepareCompanionSaleBenefitsPrewriteDecision(tx, action, context,
      input, binding, prepared, handle));
    const intent = measure(() => companion.consumeCompanionSaleBenefitsPrewriteDecision(tx, action, context,
      input, binding, prepared, handle, decision));
    assert.equal(intent.authority.state, "prewrite_intent_only");
    assert.equal(intent.authority.canReservePoints, false);
    receipt = store.reserve(tx, request, handle.operationKey, null, handle.ownerGate);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_reservations WHERE id=?").get(receipt.reservationId).n, 1);
    assert.ok(db.prepare("SELECT count(*) n FROM commerce_benefit_point_holds WHERE reservation_id=?").get(receipt.reservationId).n > 0);
    // C20p-2i1: the canonical operationId/requestHash come from the sale owner
    // itself, inside this genuine Android BEGIN IMMEDIATE. The fabricated
    // fixture receipt below must NOT be treated as this canonical identity.
    const identityInput = { operationId: action.id, customerId: action.payload.customer_id, locationId: action.payload.location_id,
      settlement: action.payload.settlement ?? "paid", paymentMethod: action.payload.payment_method, source: "android-market-sale",
      items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity,
        ...(line.expected_unit_price === undefined ? {} : { expectedUnitPrice: line.expected_unit_price }),
        ...(line.expected_currency === undefined ? {} : { expectedCurrency: line.expected_currency }),
        ...(line.expected_updated_at === undefined ? {} : { expectedUpdatedAt: line.expected_updated_at }) })) };
    const marketOperation = load("market-sale-operation");
    const identity = measure(() => marketOperation.readMarketSaleOperationRequestIdentityInTransaction(db, identityInput));
    assert.ok(Object.isFrozen(identity), "operation identity is frozen");
    assert.equal(identity.operationId, action.id);
    assert.match(identity.requestHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(measure(() => marketOperation.readMarketSaleOperationRequestIdentityInTransaction(db, identityInput)), identity,
      "canonical Android operation identity is stable for the exact request");
    const otherOperation = measure(() => marketOperation.readMarketSaleOperationRequestIdentityInTransaction(db,
      { ...identityInput, operationId: `${action.id}_other` }));
    assert.notEqual(otherOperation.operationId, identity.operationId, "operation id is returned independently");
    assert.equal(otherOperation.requestHash, identity.requestHash,
      "operationId is not part of the canonical request hash; only the separate operationId changes");
    assert.notEqual(measure(() => marketOperation.readMarketSaleOperationRequestIdentityInTransaction(db,
      { ...identityInput, items: [{ ...identityInput.items[0], quantity: identityInput.items[0].quantity + 1 }] })).requestHash,
    identity.requestHash, "changed items yield a different canonical hash");
    assert.throws(() => marketOperation.readMarketSaleOperationRequestIdentityInTransaction(db, { ...identityInput, source: "desktop-market" }),
      error => error.code === "COMPANION_POINTS_SOURCE_SCOPE", "the identity reader rejects a non-Android source");
    const saleInput = { customerId: "c1", locationId: "loc", paymentMethod: action.payload.payment_method,
      source: "android-market-sale", items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity })) };
    const sale = load("commerce-store").createCommerceSaleInTransaction(db, saleInput, "paid", new Date(tx.now).toISOString(),
      { saleId: request.source.id, reserve: () => receipt.quote });
    assert.equal(sale.id, request.source.id);
    assert.equal(db.prepare("SELECT points_tender_minor FROM commerce_sale_settlements WHERE sale_id=?").get(sale.id).points_tender_minor,
      receipt.quote.pointsTenderMinor);
    assert.equal(db.prepare("SELECT count(*) n FROM finance_entries WHERE source_id=?").get(sale.id).n, 1);
    assert.ok(db.prepare("SELECT count(*) n FROM inventory_movements WHERE reference_id=?").get(sale.id).n > 0);
    // Negative fixture only: the canonical commerce writer does not mint the
    // Android operation receipt. The real owner must still reject the points
    // settlement at the pre-commit evidence check and roll this mapping back.
    db.prepare("INSERT INTO commerce_market_sale_receipts (operation_id,business_id,sale_id,request_hash,created_at) VALUES (?,?,?,?,?)")
      .run(action.id, "b1", sale.id, "c20p2h_fixture", new Date(tx.now).toISOString());
    assert.notEqual(db.prepare("SELECT request_hash FROM commerce_market_sale_receipts WHERE operation_id=?").get(action.id).request_hash,
      identity.requestHash, "the fabricated fixture mapping is NOT certified as the canonical request identity");
    saved.crossWriter = { actionId: action.id, reservationId: receipt.reservationId, saleId: sale.id,
      identityHash: identity.requestHash,
      holdCount: db.prepare("SELECT count(*) n FROM commerce_benefit_point_holds WHERE reservation_id=?").get(receipt.reservationId).n };
    return true; // let the real Android owner attempt receipt materialization
  }
  if (suffix.startsWith("cross-writer-candidate") || suffix.startsWith("cross-writer-owner-candidate")) {
    // C20p-2i2/C20p-2j: the same authentic owner transaction and test-only
    // fixture, but with the owner's EXACT canonical request hash. The C20p-2i2
    // modes invoke the verifier directly; the C20p-2j owner modes never do, so
    // only the REAL Android owner can reach the pre-commit evidence check.
    const ownerIntegration = suffix.startsWith("cross-writer-owner-candidate");
    const decision = measure(() => companion.prepareCompanionSaleBenefitsPrewriteDecision(tx, action, context,
      input, binding, prepared, handle));
    const intent = measure(() => companion.consumeCompanionSaleBenefitsPrewriteDecision(tx, action, context,
      input, binding, prepared, handle, decision));
    assert.equal(intent.authority.state, "prewrite_intent_only");
    assert.equal(intent.authority.canReservePoints, false);
    receipt = store.reserve(tx, request, handle.operationKey, null, handle.ownerGate);
    const identityInput = { operationId: action.id, customerId: action.payload.customer_id, locationId: action.payload.location_id,
      settlement: action.payload.settlement ?? "paid", paymentMethod: action.payload.payment_method, source: "android-market-sale",
      items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity,
        ...(line.expected_unit_price === undefined ? {} : { expectedUnitPrice: line.expected_unit_price }),
        ...(line.expected_currency === undefined ? {} : { expectedCurrency: line.expected_currency }),
        ...(line.expected_updated_at === undefined ? {} : { expectedUpdatedAt: line.expected_updated_at }) })) };
    const identity = measure(() => load("market-sale-operation")
      .readMarketSaleOperationRequestIdentityInTransaction(db, identityInput));
    const saleInput = { customerId: "c1", locationId: "loc", paymentMethod: action.payload.payment_method,
      source: "android-market-sale", items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity })) };
    // A cash-looking settlement with zero points must still fail closed, not
    // fall through to the legacy cash materializer.
    const zeroPoints = suffix === "cross-writer-owner-candidate-zero-points";
    if (zeroPoints) assert.equal(receipt.quote.discountMinor, 0, "zero-points fixture needs a discount-free quote");
    const sale = load("commerce-store").createCommerceSaleInTransaction(db, saleInput, "paid", new Date(tx.now).toISOString(),
      { saleId: request.source.id, reserve: () => zeroPoints
        ? { ...receipt.quote, pointsTenderMinor: 0, payableMinor: receipt.quote.subtotalMinor } : receipt.quote });
    assert.equal(db.prepare("SELECT points_tender_minor FROM commerce_sale_settlements WHERE sale_id=?").get(sale.id).points_tender_minor,
      zeroPoints ? 0 : receipt.quote.pointsTenderMinor);
    db.prepare("INSERT INTO commerce_market_sale_receipts (operation_id,business_id,sale_id,request_hash,created_at) VALUES (?,?,?,?,?)")
      .run(action.id, "b1", sale.id, identity.requestHash, new Date(tx.now).toISOString());
    if (suffix.endsWith("-hash"))
      db.prepare("UPDATE commerce_market_sale_receipts SET request_hash='tampered_request_hash' WHERE operation_id=?").run(action.id);
    if (suffix.endsWith("-finance"))
      db.prepare("UPDATE finance_entries SET amount_minor = amount_minor + 1 WHERE source_type='commerce_sale' AND source_id=?").run(sale.id);
    if (ownerIntegration) {
      // Observable test-only proof that the real owner denies BEFORE inserting
      // android_action_receipts. The trigger and its probe disappear on rollback.
      db.exec("CREATE TEMP TRIGGER c20p_2j_ack_probe BEFORE INSERT ON android_action_receipts BEGIN SELECT c20p_ack_insert_probe(); END");
      saved.crossWriterOwnerCandidate = { actionId: action.id, reservationId: receipt.reservationId, saleId: sale.id,
        requestHash: identity.requestHash, pointsTenderMinor: receipt.quote.pointsTenderMinor };
    } else {
      // Positive returns frozen structural evidence; negative modes throw the
      // coded mismatch and the whole parent still rolls back.
      saved.crossWriterCandidate = load("android-points-sale-receipt-evidence")
        .inspectAndroidPointsSaleReceiptEvidenceInTransaction(db, action, context);
    }
    return true;
  }
  receipt = store.reserve(tx, request, handle.operationKey, null, handle.ownerGate);
  if (suffix === "tender-uncaptured") return measure(() => companion.prepareCompanionSaleTenderContract(tx, action, context, input, binding, prepared, handle));
  if (suffix === "receipt-clone") return measure(() => capture({ ...receipt }));
  if (suffix === "receipt-json") return measure(() => capture(JSON.parse(JSON.stringify(receipt))));
  if (suffix === "receipt-tampered") { receipt.expiresAt++; return measure(() => capture(receipt)); }
  if (suffix === "witness-as-issuance") {
    const witness = measure(() => companion.captureCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared,
      { reservationId: receipt.reservationId, operationKey: handle.operationKey }));
    return measure(() => verify(witness));
  }
  if (suffix === "capture-regrant") mutate("regrant");
  measure(() => capture(receipt));
  const original = measure(() => verify());
  assert.equal(original.reservationId, receipt.reservationId);
  assert.equal(original.operationKey, handle.operationKey);
  assert.deepEqual(original.quote, receipt.quote);
  assert.equal(original.authority.canReservePoints, false); assert.equal(original.authority.canConfirmPoints, false);
  assert.ok(Object.isFrozen(original) && Object.isFrozen(original.quote));
  assert.deepEqual(measure(() => verify()), original);
  if (suffix.startsWith("boundary-")) {
    const kind = suffix.slice(9), operation = load("market-sale-operation"), commerce = load("commerce-store");
    const ownerInput = { operationId: action.id, source: "android-market-sale", settlement: "paid",
      customerId: action.payload.customer_id, locationId: action.payload.location_id ?? "", paymentMethod: "cash",
      items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity,
        expectedUnitPrice: line.expected_unit_price, expectedCurrency: line.expected_currency, expectedUpdatedAt: line.expected_updated_at })) };
    const allocation = measure(() => companion.requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared));
    const now = new Date(tx.now).toISOString();
    let reserves = 0;
    const forbiddenBenefits = { saleId: commerceBoundarySource?.id, reserve() { reserves++; return receipt.quote; } };
    const write = () => kind.startsWith("commerce-")
      ? commerce.createCommerceSaleInTransaction(db, ownerInput, "paid", now,
        kind === "commerce-benefits" ? forbiddenBenefits : undefined,
        kind === "commerce-clone" ? { ...commerceBoundarySource } : commerceBoundarySource)
      : operation.completeMarketSaleInTransaction(db,
        kind === "market-request" ? { ...ownerInput, paymentAmountMinor: receipt.quote.payableMinor }
          : kind === "market-benefits" ? { ...ownerInput, benefits: { requestedPointsMinor: input.requestedPointsMinor, expectedQuote: receipt.quote } }
          : ownerInput, now, undefined, allocation);
    if (["market-request", "market-benefits", "commerce-benefits", "commerce-clone"].includes(kind)) {
      measure(() => assert.throws(write, kind.startsWith("commerce-") ? /Invalid canonical sale source allocation/
        : e => e.code === (kind === "market-benefits" ? "BENEFITS_PARENT_TRANSACTION_REQUIRED" : "COMPANION_POINTS_SOURCE_SCOPE")));
      assert.equal(reserves, 0, "allocated+benefits guard rejects before the reserve callback");
    } else {
      // These are legacy CASH owner faults, not successful points payments.
      // Real canonical rows are written, then the actual owner raises the fault.
      const table = kind.endsWith("after-sale") ? "commerce_sale_items"
        : kind.endsWith("after-finance") ? "finance_entries" : "commerce_market_sale_receipts";
      const timing = table === "finance_entries" ? "AFTER" : "BEFORE";
      db.exec(`CREATE TEMP TRIGGER c20o_owner_fault ${timing} INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'c20o canonical owner fault'); END`);
      const writes = db.prepare("SELECT total_changes() n").get().n;
      assert.throws(write, /c20o canonical owner fault/);
      assert.ok(db.prepare("SELECT total_changes() n").get().n > writes, "actual canonical provisional writes precede the fault");
    }
    measure(() => assert.throws(write, e => e.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED",
      "a second owner attempt in the poisoned parent cannot write or retry"));
    // Returning normally must still fail the borrowed parent before its caller
    // can reach Android receipt materialization/ACK. Outer harness compares ALL
    // tables to the pre-BEGIN snapshot, including this real fixture reservation.
    return;
  }
  if (suffix.startsWith("tender-")) {
    const kind = suffix.slice(7), operation = load("market-sale-operation");
    const ownerInput = { operationId: action.id, source: "android-market-sale", settlement: "paid",
      customerId: action.payload.customer_id, locationId: action.payload.location_id ?? "", paymentMethod: action.payload.payment_method,
      items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity,
        expectedUnitPrice: line.expected_unit_price, expectedCurrency: line.expected_currency, expectedUpdatedAt: line.expected_updated_at })) };
    const allocation = measure(() => companion.requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared));
    const prepare = (candidate = handle) => companion.prepareCompanionSaleTenderContract(tx, action, context, input, binding, prepared, candidate);
    if (kind === "issuance-clone") return measure(() => prepare({ ...handle }));
    const contract = measure(prepare);
    const read = (candidate = contract, nextInput = ownerInput, nextAllocation = allocation, parent = tx) =>
      operation.readMarketSaleCompanionTenderContract(parent, nextInput, nextAllocation, candidate);
    const execute = () => operation.assertMarketSaleCompanionTenderExecution(tx, ownerInput, allocation, contract);
    const plan = measure(read);
    assert.ok(Object.isFrozen(contract) && Object.isFrozen(plan) && Object.isFrozen(plan.source));
    assert.equal(plan.authority, "unavailable");
    assert.equal(plan.source, allocation.source); assert.equal(plan.reservationId, receipt.reservationId);
    assert.equal(plan.operationId, action.id); assert.equal(plan.businessId, "b1"); assert.equal(plan.customerId, "c1");
    assert.equal(plan.pointsTenderMinor, receipt.quote.pointsTenderMinor);
    assert.equal(plan.cashPaidMinor, receipt.quote.payableMinor);
    assert.equal(plan.financeIncomeMinor, plan.cashPaidMinor);
    assert.equal(plan.totalMinor, plan.cashPaidMinor + plan.pointsTenderMinor);
    assert.equal(plan.totalMinor, action.payload.lines[0].quantity === 0.01 ? 1000 : 100000);
    assert.equal(plan.pointsTenderMinor, 1000);
    assert.deepEqual(measure(read), plan);
    for (const [table, column] of [["commerce_sales", "id"], ["commerce_sale_items", "sale_id"],
      ["commerce_sale_settlements", "sale_id"], ["finance_entries", "source_id"],
      ["commerce_market_sale_receipts", "sale_id"], ["commerce_benefit_snapshots", "source_id"]])
      assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${column}=?`).get(allocation.source.id).n, 0,
        `${table}: preflight writes no sale/tender/settlement for the allocated source`);
    if (kind === "read") { saved.tender = { tx, ownerInput, allocation, contract }; return; }
    if (kind === "execute") return measure(execute);
    if (kind === "clone") return measure(() => read({ ...contract }));
    if (kind === "json") return measure(() => read(JSON.parse(JSON.stringify(contract))));
    if (kind === "allocation") return measure(() => read(contract, ownerInput, { ...allocation }));
    if (kind === "parent") return measure(() => read(contract, ownerInput, allocation, { ...tx }));
    if (kind === "time") { tx.now++; return measure(read); }
    if (kind === "amount") return measure(() => read(contract, { ...ownerInput, paymentAmountMinor: plan.cashPaidMinor }));
    if (kind === "method") return measure(() => read(contract, { ...ownerInput, paymentMethod: "bank" }));
    if (kind === "request") return measure(() => read(contract, { ...ownerInput, items: [{ ...ownerInput.items[0], quantity: 2 }] }));
    if (kind === "archived") return measure(() => read(saved.tender.contract));
    if (kind === "released") store.release(tx, "b1", receipt.reservationId, "c20n_release");
    if (["revoke", "regrant", "reissue", "business", "epoch", "price", "rule", "action", "device", "customer", "currency"].includes(kind)) mutate(kind);
    if (kind === "currency") return measure(prepare);
    if (["quote-amount", "quote-currency"].includes(kind)) return measure(() => operation.prepareMarketSaleCompanionTenderContract(
      tx, ownerInput, allocation, () => {
        const current = verify();
        return { ...current, quote: { ...current.quote,
          ...(kind === "quote-amount" ? { payableMinor: current.quote.payableMinor + 1 } : { currency: "USD" }) } };
      }));
    if (kind === "worker") {
      const blocked = worker.run("revoke"); assert.equal(blocked.ok, false); assert.equal(blocked.errcode, 5); assert.equal(blocked.writes, 0);
      return measure(read);
    }
    if (kind === "caught") { measure(() => assert.throws(execute, e => e.code === "COMPANION_POINTS_TENDER_AUTHORITY_REQUIRED")); return; }
    if (kind === "ack") db.prepare("INSERT INTO android_action_receipts VALUES (?,?,?,'fixture',?)")
      .run(action.id, action.action_type, action.device_id, load("market-android-actions").marketAndroidActionIntentHash(action));
    if (kind === "expiry") {
      const clock = Date.now; Date.now = () => tx.now + 31000;
      try { return measure(read); } finally { Date.now = clock; }
    }
    return measure(read);
  }
  if (suffix.startsWith("owner-")) {
    const kind = suffix.slice(6), operation = load("market-sale-operation");
    const ownerInput = { operationId: action.id, source: "android-market-sale", settlement: "paid",
      customerId: action.payload.customer_id, locationId: action.payload.location_id ?? "", paymentMethod: action.payload.payment_method,
      items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity,
        expectedUnitPrice: line.expected_unit_price, expectedCurrency: line.expected_currency, expectedUpdatedAt: line.expected_updated_at })) };
    const allocation = measure(() => companion.requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared));
    const observe = () => companion.prepareCompanionSaleOperationObservation(tx, action, context, input, binding, prepared, handle);
    const observation = measure(observe);
    const read = () => companion.readCompanionSaleOperationWitness(tx, action, context, input, binding, prepared, handle);
    const direct = (candidate = observation, nextTx = tx, nextInput = ownerInput, nextAllocation = allocation) =>
      operation.readMarketSaleOperationObservation(nextTx, nextInput, nextAllocation, candidate);
    const write = (candidate = observation, nextInput = ownerInput, nextAllocation = allocation, nextNow = new Date(tx.now).toISOString()) =>
      operation.completeMarketSaleInTransaction(db, nextInput, nextNow, undefined, nextAllocation, candidate);
    if (kind === "unminted") return measure(read);
    if (kind === "prepare-twice") return measure(observe);
    if (kind === "wrong-request") return measure(() => write(observation, { ...ownerInput, items: [{ ...ownerInput.items[0], quantity: 2 }] }));
    if (kind === "wrong-source") return measure(() => write(observation, { ...ownerInput, source: "desktop-market-quick-sale" }));
    if (kind === "wrong-time") return measure(() => write(observation, ownerInput, allocation, new Date(tx.now + 1).toISOString()));
    if (kind === "write-clone") return measure(() => write({ ...observation }));
    if (kind === "write-clone-caught") {
      measure(() => assert.throws(() => write({ ...observation }), e => e.code === "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED"));
      return;
    }
    if (kind === "callback-async") {
      const asyncObserver = measure(() => operation.prepareMarketSaleOperationObservation(tx, ownerInput, allocation, () => Promise.resolve()));
      return measure(() => write(asyncObserver));
    }
    if (kind === "callback-write") {
      const dirtyObserver = measure(() => operation.prepareMarketSaleOperationObservation(tx, ownerInput, allocation,
        () => { db.prepare("UPDATE business SET name=name WHERE id='b1'").run(); }));
      const before = databaseState(db), writes = db.prepare("SELECT total_changes() n").get().n;
      assert.throws(() => write(dirtyObserver), e => e.code === "COMPANION_POINTS_OPERATION_RECHECK_WROTE");
      assert.deepEqual(databaseState(db), before);
      assert.equal(db.prepare("SELECT total_changes() n").get().n, writes + 1, "the attempted no-op is detected and parent is poisoned");
      return;
    }
    if (kind === "benefits") return measure(() => write(observation, { ...ownerInput, benefits: { requestedPointsMinor: 1000, expectedQuote: receipt.quote } }));
    if (kind === "credit") return measure(() => write(observation, { ...ownerInput, settlement: "credit" }));
    if (kind === "write-fault") {
      db.exec("CREATE TEMP TRIGGER c20m_receipt_fault BEFORE INSERT ON commerce_market_sale_receipts BEGIN SELECT RAISE(ABORT,'c20m receipt failure'); END");
      assert.throws(() => write(), /c20m receipt failure/);
      assert.throws(read, e => e.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED");
      return; // Caught canonical error must still abort the parent.
    }
    const sale = write();
    assert.equal(sale.replayed, false); assert.equal(sale.sale.id, allocation.source.id);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_market_sale_receipts WHERE operation_id=?").get(action.id).n, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM finance_entries WHERE source_id=?").get(sale.sale.id).n, 1);
    assert.equal(db.prepare("SELECT 1 FROM commerce_sale_settlements WHERE sale_id=?").get(sale.sale.id), undefined,
      "existing allocated owner has no points tender; observation cannot invent it");
    const witness = measure(read);
    assert.ok(Object.isFrozen(witness) && Object.isFrozen(witness.receipt));
    assert.equal(witness.receipt, measure(direct), "the same concrete owner receipt object is retained");
    assert.deepEqual(measure(read), witness);
    assert.equal(witness.reservation.reservationId, receipt.reservationId);
    assert.equal(witness.reservation.quote.pointsTenderMinor, receipt.quote.pointsTenderMinor);
    assert.equal(witness.receipt.pointsTenderMinor, 0);
    assert.equal(witness.receipt.cashPaidMinor, Math.round(sale.sale.total * 100));
    assert.equal(witness.scope, binding.scope);
    assert.equal(witness.scope.actionId, action.id);
    assert.equal(witness.scope.spendGrantGeneration, binding.scope.spendGrantGeneration);
    assert.equal(witness.authority.canConfirmPoints, false);
    if (kind === "observation-as-tender" || kind === "receipt-as-tender") return measure(() =>
      operation.readMarketSaleCompanionTenderContract(tx, ownerInput, allocation,
        kind === "observation-as-tender" ? observation : {
          ...witness.receipt, cashPaidMinor: receipt.quote.payableMinor, pointsTenderMinor: receipt.quote.pointsTenderMinor
        }));
    if (kind === "tender-added") {
      // Even correct-looking tender arithmetic cannot upgrade the actual cash
      // observation's owner-minted receipt. The comparison must detect the change.
      db.prepare("INSERT INTO commerce_sale_settlements VALUES (?,?,?,?,?,?,?)")
        .run(sale.sale.id, "b1", "c1", "cash", receipt.quote.payableMinor, receipt.quote.pointsTenderMinor, sale.sale.createdAt);
      return measure(direct);
    }
    if (kind === "snapshot-added") {
      // Explicit negative SQL fixture, NOT a Store settlement or new witness.
      db.prepare("INSERT INTO commerce_benefit_snapshots VALUES ('b1','c20p_negative_snapshot',1,?,'sale',?,'{}','[]','{}',?)")
        .run(receipt.reservationId, sale.sale.id, tx.now);
      return measure(direct);
    }
    if (kind === "read") { saved.owner = { tx, action, context, input, binding, prepared, handle }; return; }
    if (kind === "clone") return measure(() => direct({ ...observation }));
    if (kind === "json") return measure(() => direct(JSON.parse(JSON.stringify(observation))));
    if (kind === "receipt-copy") return measure(() => direct({ ...witness.receipt }));
    if (kind === "parent-clone") return measure(() => direct(observation, { ...tx }));
    if (kind === "parent-time") { tx.now++; return measure(direct); }
    if (kind === "parent-db") {
      const other = new DatabaseSync(":memory:"); other.exec("BEGIN IMMEDIATE");
      const previous = tx.database;
      try { tx.database = other; return measure(direct); }
      finally { tx.database = previous; other.exec("ROLLBACK"); other.close(); }
    }
    if (kind === "allocation-clone") return measure(() => direct(observation, tx, ownerInput, { ...allocation }));
    if (kind === "hash-input") return measure(() => direct(observation, tx, { ...ownerInput, customerId: "c2" }));
    if (kind === "operation-input") return measure(() => direct(observation, tx, { ...ownerInput, operationId: "another_operation" }));
    if (kind === "replay") return measure(write);
    if (kind === "archived") return measure(() => companion.readCompanionSaleOperationWitness(tx, action, context, input,
      saved.owner.binding, saved.owner.prepared, saved.owner.handle));
    if (kind === "db") {
      const other = new DatabaseSync(":memory:"); other.exec("BEGIN IMMEDIATE");
      try { return measure(() => rules.withCommerceBenefitsParentTransaction(other, tx.now, next => direct(observation, next))); }
      finally { other.exec("ROLLBACK"); other.close(); }
    }
    if (kind === "missing") db.prepare("DELETE FROM commerce_market_sale_receipts WHERE operation_id=?").run(action.id);
    if (kind === "duplicate") return measure(() => {
      assert.throws(() => db.prepare("INSERT INTO commerce_market_sale_receipts SELECT operation_id||'_copy',business_id,sale_id,request_hash,created_at FROM commerce_market_sale_receipts WHERE operation_id=?").run(action.id), /UNIQUE constraint failed/);
      assert.deepEqual(read(), witness);
    });
    if (kind === "hash") db.prepare("UPDATE commerce_market_sale_receipts SET request_hash='tampered' WHERE operation_id=?").run(action.id);
    if (kind === "receipt-time") db.prepare("UPDATE commerce_market_sale_receipts SET created_at='stale' WHERE operation_id=?").run(action.id);
    if (kind === "receipt-operation") db.prepare("UPDATE commerce_market_sale_receipts SET operation_id=operation_id||'_old' WHERE operation_id=?").run(action.id);
    if (kind === "mapping") {
      const otherSale = operation.completeMarketSaleInTransaction(db, { ...ownerInput, operationId: `${action.id}_other` }, new Date(tx.now).toISOString());
      db.prepare("DELETE FROM commerce_market_sale_receipts WHERE sale_id=?").run(otherSale.sale.id);
      db.prepare("UPDATE commerce_market_sale_receipts SET sale_id=? WHERE operation_id=?").run(otherSale.sale.id, action.id);
    }
    if (kind === "finance") db.prepare("UPDATE finance_entries SET amount_minor=amount_minor+1 WHERE source_id=?").run(sale.sale.id);
    if (kind === "stock") db.prepare("DELETE FROM inventory_movements WHERE reference_id=?").run(sale.sale.id);
    if (kind === "sale") db.prepare("UPDATE commerce_sales SET customer_id='c2' WHERE id=?").run(sale.sale.id);
    if (kind === "sale-source") return measure(() => {
      assert.throws(() => db.prepare("UPDATE commerce_sales SET source='desktop-market-quick-sale' WHERE id=?").run(sale.sale.id), /commerce_sale_source_immutable/);
      assert.deepEqual(read(), witness);
    });
    if (kind === "ack") db.prepare("INSERT INTO android_action_receipts VALUES (?,?,?,'fixture',?)")
      .run(action.id, action.action_type, action.device_id, load("market-android-actions").marketAndroidActionIntentHash(action));
    if (["revoke", "regrant", "business", "action", "device", "customer", "epoch"].includes(kind)) mutate(kind);
    if (kind === "worker") {
      const blocked = worker.run("revoke"); assert.equal(blocked.ok, false); assert.equal(blocked.errcode, 5); assert.equal(blocked.writes, 0);
      return measure(read);
    }
    if (kind === "caught") { measure(() => assert.throws(() => direct({}), e => e.code === "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED")); return; }
    if (kind === "settle") return measure(() => companion.revalidateCompanionSaleBenefitsPaidParent(tx, action, context, input, binding, prepared, handle));
    return measure(read);
  }
  if (suffix.startsWith("paid-")) {
    const kind = suffix.slice(5);
    const saleInput = { customerId: "c1", locationId: "loc", paymentMethod: action.payload.payment_method,
      source: "android-market-sale", items: action.payload.lines.map(line => ({ productId: line.product_id, quantity: line.quantity })) };
    // The canonical Commerce owner resolves prices and writes real tender, stock,
    // Finance and outbox. Only its already-issued canonical quote is supplied.
    const sale = load("commerce-store").createCommerceSaleInTransaction(db, saleInput, "paid", new Date(tx.now).toISOString(), {
      saleId: request.source.id, reserve: () => receipt.quote });
    const readPaid = () => load("market-sale-paid-evidence").readMarketSalePaidTenderEvidence(tx, request, receipt.quote, "loc");
    const exact = measure(readPaid);
    assert.equal(exact.cashPaidMinor, receipt.quote.payableMinor);
    assert.equal(exact.pointsTenderMinor, receipt.quote.pointsTenderMinor);
    assert.equal(exact.currency, "TRY");
    assert.equal(exact.confirmation, receipt.quote.payableMinor === 0 ? "points_only" : "cash_received");
    assert.deepEqual(measure(readPaid), exact);
    if (kind === "read") return;
    if (kind === "finance") db.prepare("UPDATE finance_entries SET amount_minor=amount_minor+1 WHERE source_id=?").run(sale.id);
    if (kind === "finance-currency") db.prepare("UPDATE finance_entries SET currency='USD' WHERE source_id=?").run(sale.id);
    if (kind === "finance-missing") db.prepare("DELETE FROM finance_entries WHERE source_id=?").run(sale.id);
    if (kind === "finance-deleted") db.prepare("UPDATE finance_entries SET deleted_at='hidden' WHERE source_id=?").run(sale.id);
    if (kind === "finance-duplicate") {
      db.exec("DROP INDEX idx_finance_entries_source");
      db.prepare("INSERT INTO finance_entries SELECT id||'_duplicate',direction,amount_minor,currency,payment_method,category,description,occurred_at,source_type,source_id,note,created_at,updated_at,deleted_at,sync_status FROM finance_entries WHERE source_id=?").run(sale.id);
    }
    if (kind === "zero-finance") db.prepare("INSERT INTO finance_entries(id,direction,amount_minor,currency,payment_method,occurred_at,source_type,source_id,created_at,updated_at) VALUES ('c20l_false_income','income',1,'TRY','cash','fixture','commerce_sale',?,'fixture','fixture')").run(sale.id);
    if (["credit", "open", "pending"].includes(kind)) db.prepare("UPDATE commerce_sales SET status=? WHERE id=?").run(kind, sale.id);
    if (kind === "total") db.prepare("UPDATE commerce_sales SET total=total+1 WHERE id=?").run(sale.id);
    if (kind === "currency") db.prepare("UPDATE commerce_sales SET currency='USD' WHERE id=?").run(sale.id);
    if (kind === "customer") db.prepare("UPDATE commerce_sales SET customer_id='c2' WHERE id=?").run(sale.id);
    if (kind === "business") db.exec("PRAGMA defer_foreign_keys=ON");
    if (kind === "business") db.prepare("UPDATE commerce_sales SET business_id='b2',customer_id=NULL WHERE id=?").run(sale.id);
    if (kind === "stock-location") db.prepare("UPDATE inventory_movements SET location_id='foreign_location' WHERE reference_id=?").run(sale.id);
    if (kind === "stock") db.prepare("DELETE FROM inventory_movements WHERE reference_id=?").run(sale.id);
    if (kind === "items") db.prepare("UPDATE commerce_sale_items SET unit_price=unit_price+1 WHERE sale_id=?").run(sale.id);
    if (kind === "tender") {
      db.exec("DROP TRIGGER trg_commerce_sale_settlement_immutable_delete");
      db.prepare("DELETE FROM commerce_sale_settlements WHERE sale_id=?").run(sale.id);
    }
    if (kind === "points") {
      db.exec("DROP TRIGGER trg_commerce_sale_settlement_immutable_update");
      db.prepare("UPDATE commerce_sale_settlements SET points_tender_minor=points_tender_minor+1 WHERE sale_id=?").run(sale.id);
    }
    if (["revoke", "regrant"].includes(kind)) mutate(kind);
    if (["epoch", "reissue", "price", "rule", "device", "action"].includes(kind)) mutate(kind);
    if (kind === "coupon") rules.saveCommerceBenefitsRule(tx, "b1", rule("c20l_coupon_drift", "coupon", { startsAt: 0, fixedMinor: 10 }));
    if (kind === "device-disabled") db.exec("UPDATE android_devices SET is_active=0 WHERE id='d1'");
    if (kind === "family") db.exec("UPDATE commerce_benefit_settings SET points_enabled=0 WHERE business_id='b1'");
    if (kind === "ack-replay") db.prepare("INSERT INTO android_action_receipts VALUES (?,?,?,'fixture',?)")
      .run(action.id, action.action_type, action.device_id, load("market-android-actions").marketAndroidActionIntentHash(action));
    if (kind === "receipt-forged") db.prepare("INSERT INTO commerce_market_sale_receipts VALUES (?,'b1',?,'forged','fixture')").run(action.id, sale.id);
    if (kind === "receipt-replay" || kind === "sql-as-observation") {
      const ownerInput = { ...saleInput, operationId: action.id, settlement: "paid", items: action.payload.lines.map(line => ({
        productId: line.product_id, quantity: line.quantity, expectedUnitPrice: line.expected_unit_price,
        expectedCurrency: line.expected_currency, expectedUpdatedAt: line.expected_updated_at })) };
      const otherSale = load("market-sale-operation").completeMarketSaleInTransaction(db, ownerInput, new Date(tx.now).toISOString());
      assert.notEqual(otherSale.sale.id, sale.id);
      // Deliberate fixture tamper: this operation receipt has no immutable guard.
      // A valid request hash plus matching SQL mapping must NOT imply provenance.
      db.prepare("UPDATE commerce_market_sale_receipts SET sale_id=? WHERE operation_id=?").run(sale.id, action.id);
      if (kind === "sql-as-observation") {
        const operation = load("market-sale-operation");
        const allocation = measure(() => companion.requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared));
        const sqlReceipt = db.prepare("SELECT * FROM commerce_market_sale_receipts WHERE operation_id=?").get(action.id);
        return measure(() => operation.readMarketSaleOperationObservation(tx, ownerInput, allocation, sqlReceipt));
      }
    }
    if (kind === "worker") {
      const blocked = worker.run("revoke"); assert.equal(blocked.ok, false); assert.equal(blocked.errcode, 5); assert.equal(blocked.writes, 0);
    }
    const final = () => companion.revalidateCompanionSaleBenefitsPaidParent(
      kind === "parent-clone" ? { ...tx } : tx, kind === "action-clone" ? { ...action } : action,
      kind === "context" ? { ...context } : context, input, binding, prepared, kind === "handle-clone" ? { ...handle } : handle);
    if (kind === "source") return measure(() => load("market-sale-paid-evidence").readMarketSalePaidTenderEvidence(tx,
      { ...request, source: { kind: "sale", id: "foreign_sale" } }, receipt.quote, "loc"));
    if (kind === "forged-total") return measure(() => load("market-sale-paid-evidence").readMarketSalePaidTenderEvidence(tx,
      request, { ...receipt.quote, payableMinor: 1 }, "loc"));
    if (kind === "expiry") {
      const clock = Date.now; Date.now = () => tx.now + 31000;
      try { return measure(final); } finally { Date.now = clock; }
    }

    if (kind === "caught") { measure(() => assert.throws(final, e => e.code === "COMPANION_POINTS_PARENT_RECEIPT_REQUIRED")); return; }
    return measure(final);
  }
  if (["read", "next-parent"].includes(suffix)) saved.issued = { tx, action, context, binding, prepared, handle };
  if (suffix.startsWith("after-")) mutate(suffix.slice(6));
  if (["released", "replay-released"].includes(suffix)) {
    store.release(tx, "b1", receipt.reservationId, "c20k_release");

  }
  if (suffix === "expired") db.prepare("UPDATE commerce_benefit_reservations SET status='expired' WHERE id=?").run(receipt.reservationId);
  if (["settled", "reversed", "reverse-disabled"].includes(suffix)) {
    evidence(fixture, request, receipt);
    const settled = store.settle(tx, "b1", receipt.reservationId, "c20k_settle");
    if (suffix === "reverse-disabled") return measure(() => adapter.store.reverse(tx, "b1", settled.snapshotId, "forbidden_reverse"));
    if (suffix === "reversed") { refundEvidence(fixture, request); store.reverse(tx, "b1", settled.snapshotId, "c20k_reverse"); }
  }
  if (suffix === "replay-released") assert.equal(store.reserve(tx, request, handle.operationKey).reservationId, receipt.reservationId);
  if (suffix === "worker") {
    const blocked = worker.run("revoke");
    assert.equal(blocked.ok, false); assert.equal(blocked.errcode, 5);
    assert.equal(blocked.writes, 0); assert.equal(blocked.inTransaction, false);
  }
  if (suffix === "caught") { measure(() => assert.throws(() => verify({ ...handle }), e => e.code === "COMPANION_POINTS_ISSUANCE_SCOPE")); return; }
  if (suffix === "capture-twice") return measure(() => capture(receipt));
  if (suffix === "gate-twice") return measure(() => store.reserve(tx, request, handle.operationKey, null, handle.ownerGate));
  if (suffix === "clone") return measure(() => verify({ ...handle }));
  if (suffix === "json") return measure(() => verify(JSON.parse(JSON.stringify(handle))));
  if (suffix === "context") return measure(() => verify(handle, tx, action, { ...context }));
  if (suffix === "action-clone") return measure(() => verify(handle, tx, { ...action }));
  if (suffix === "parent-clone") return measure(() => verify(handle, { ...tx }));
  if (suffix === "archived") return measure(() => verify(saved.issued.handle));
  if (suffix === "db") {
    const other = new DatabaseSync(":memory:"); other.exec("BEGIN IMMEDIATE");
    try { return measure(() => rules.withCommerceBenefitsParentTransaction(other, tx.now, nextTx => verify(handle, nextTx))); }
    finally { other.exec("ROLLBACK"); other.close(); }
  }
  const clock = Date.now;
  try {
    if (suffix === "expiry") Date.now = () => tx.now + 1000;
    if (suffix === "clock-back") Date.now = () => tx.now - 1;
    measure(() => verify());
  } finally { Date.now = clock; }
  // All existing Companion mutation ports still deny with valid issuance evidence.
  if (suffix === "settle-disabled") return measure(() => adapter.store.settle(tx, "b1", receipt.reservationId, "forbidden_settle"));
  if (suffix === "release-disabled") return measure(() => adapter.store.release(tx, "b1", receipt.reservationId, "forbidden_release"));
  if (suffix === "refund-disabled") return measure(() => adapter.ports.readFullRefund(db, request.source));
  if (suffix === "expire-disabled") return measure(() => adapter.store.expirePoints(tx, "b1", "c1", "TRY", "forbidden_expire"));
  if (suffix === "adjust-disabled") return measure(() => adapter.store.adjustPoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY",
    amountMinor: 1, expiresAt: null, reason: "correction", operationKey: "forbidden_adjust" }));
}
