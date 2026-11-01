import assert from "node:assert/strict";
import { test } from "node:test";
import { saleFixture, databaseState, completeMarketSaleInTransaction, load } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { context, exampleRules, installRules, adjust, engine, secretKey } from "./test-helpers/commerce-benefits-fixture.mjs";

// This exercises the existing Desktop-owner path under a borrowed parent only;
// it does not authorize or implement Companion spending.
const { withCommerceBenefitsParentTransaction } = load("commerce-benefits-rules");
const rules = () => exampleRules().filter(rule => rule.family !== "coupon").map(rule => ({ ...rule, startsAt: 0 }));
const setup = t => { const f = saleFixture(); t.after(() => f.close()); installRules(f, rules()); adjust(f); return f; };
const command = id => ({ settlement: "paid", customerId: "c1", locationId: "loc", operationId: id,
  source: "desktop-market-quick-sale", paymentMethod: "bank", paymentAmountMinor: 85000,
  items: [{ productId: "p1", quantity: 1 }], benefits: { requestedPointsMinor: 10000,
    expectedQuote: engine.calculateCommerceBenefits(context(), rules()) } });
const sale = (f, input, now) => withCommerceBenefitsParentTransaction(f.db, now, tx =>
  completeMarketSaleInTransaction(f.db, input, new Date(now).toISOString(), { tx, authority: f.authority, key: secretKey, authorizationId: null }));

test("borrowed parent rolls sale, points and action receipt back together after settlement", t => {
  const f = setup(t), before = databaseState(f.db), now = Date.now();
  assert.throws(() => {
    f.db.exec("BEGIN IMMEDIATE");
    try {
      const result = sale(f, command("parent_rollback_01"), now);
      assert.equal(result.benefits.quote.pointsTenderMinor, 10000);
      f.db.prepare("INSERT INTO android_action_receipts(id,intent_hash,action_type,device_id,applied_at) VALUES ('parent_rollback_01','fixture','market_sale_complete','device-one','fixture')").run();
      throw new Error("parent_ack_failure");
    } catch (error) { f.db.exec("ROLLBACK"); throw error; }
  }, /parent_ack_failure/);
  assert.deepEqual(databaseState(f.db), before);
});

test("borrowed parent commits once and canonical exact replay does not double post", t => {
  const f = setup(t), input = command("parent_commit_01"), now = Date.now();
  f.db.exec("BEGIN IMMEDIATE");
  const first = sale(f, input, now);
  f.db.prepare("INSERT INTO android_action_receipts(id,intent_hash,action_type,device_id,applied_at) VALUES ('parent_commit_01','fixture','market_sale_complete','device-one','fixture')").run();
  f.db.exec("COMMIT");
  assert.equal(first.replayed, false); assert.equal(first.benefits.quote.pointsTenderMinor, 10000);
  assert.equal(f.db.prepare("SELECT amount_minor FROM finance_entries WHERE source_type='commerce_sale' AND source_id=?").get(first.sale.id).amount_minor, 85000);
  const before = databaseState(f.db);
  f.db.exec("BEGIN IMMEDIATE");
  const replay = sale(f, input, now + 1);
  f.db.exec("COMMIT");
  assert.equal(replay.replayed, true); assert.deepEqual(replay.benefits, first.benefits); assert.deepEqual(databaseState(f.db), before);
});
