import assert from "node:assert/strict";
import { dirname } from "node:path";
import { request as httpsRequest } from "node:https";
import { saleFixture, load } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { exampleRules, installRules, adjust } from "./test-helpers/commerce-benefits-fixture.mjs";

// C20p-2s: the ONLY positive Companion Puan path under test is the production
// path: real LocalCompanionServer HTTPS -> opaque authenticated context -> real
// DesktopDatabase/applyAndroidActionTransaction with an established protected
// benefits key -> C20k issuance/policy/Quote -> Store.reserve -> canonical paid
// sale -> Store.settle -> C20p-2o receipt -> durable ACK.
const f = saleFixture();
try {
  const db = f.db, token = `yal_${"a".repeat(64)}`;
  for (const cap of ["service.android", "core.finance", "commerce.customer_credit", "retail.barcode"])
    db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);

  installRules(f, exampleRules().map(rule => rule.id === "earn" ? { ...rule, percentBps: 1000 } : rule));
  adjust(f, 5000);

  db.exec("INSERT INTO android_devices(id,device_id,role,is_active,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin',1,'fixture','fixture','fixture','fixture')");
  db.exec("UPDATE android_devices SET is_active=1 WHERE id='d1'"); // schema requires explicit approval after insert
  const credentials = load("database/android-local-credential-store");
  assert.equal(credentials.storeAndroidLocalCredential(db, "device-one", token), true);
  const grants = load("database/android-benefits-spend-grant-store"), owner = { assertAuthorized() {} };
  assert.equal(grants.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1"), true);

  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: value => Buffer.from(value), decryptString: value => value.toString() };
  const keyOwner = new (load("commerce-benefits-key").CommerceBenefitsKey)(dirname(f.path), safeStorage, "linux");
  keyOwner.load(); // Establish the protected key BEFORE the owner transaction.
  const keyLoads = [];
  const pointsKeys = { available: () => keyOwner.available(), load(create) {
    keyLoads.push({ inTransaction: db.isTransaction, create }); return keyOwner.load(create);
  } };

  const identity = new (load("local-companion-tls-identity").LocalCompanionTlsIdentity)({ userDataPath: dirname(f.path), safeStorage, platform: "linux", addresses: () => ["127.0.0.1"] });
  const material = await identity.load();
  const app = load("android-action-application-service");
  const caps = () => load("business-capability-store").readEnabledBusinessCapabilities(db);
  const server = new (load("local-companion-server").LocalCompanionServer)({
    enabled: () => true,
    httpsExperiment: { enabled: true, identity },
    authorize: ({ deviceId, token: secret }) => credentials.authorizeAndroidLocalCredential(db, deviceId, secret),
    readAuthorizedSaleReceipt: (action, deviceId, secret) => app.readAuthorizedLocalSaleReceipt(db, action, deviceId, secret),
    applyAction: (action, context) => {
      assert.ok(context, "HTTPS handler must mint an opaque action context");
      return app.applyAndroidActionTransaction(db, action, caps(), context, pointsKeys);
    }
  });
  const address = await server.start("127.0.0.1", 0);
  const send = action => new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname: "127.0.0.1", port: address.port, path: "/local/v1/action", method: "POST", ca: material.certificatePem,
      headers: { "X-YA-Device-Id": "device-one", "X-YA-Local-Token": token } }, res => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on("error", reject); req.end(JSON.stringify(action));
  });
  const counts = () => ({
    sales: db.prepare("SELECT count(*) n FROM commerce_sales").get().n,
    settlements: db.prepare("SELECT count(*) n FROM commerce_sale_settlements").get().n,
    finance: db.prepare("SELECT count(*) n FROM finance_entries").get().n,
    stock: db.prepare("SELECT COALESCE(Sum(quantity_delta),0) n FROM inventory_movements").get().n,
    reservations: db.prepare("SELECT count(*) n FROM commerce_benefit_reservations").get().n,
    spends: db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger WHERE kind='spend'").get().n,
    snapshots: db.prepare("SELECT count(*) n FROM commerce_benefit_snapshots").get().n,
    actions: db.prepare("SELECT count(*) n FROM android_action_receipts").get().n,
    receipts: db.prepare("SELECT count(*) n FROM android_market_sale_result_receipts").get().n,
    balance: db.prepare("SELECT COALESCE(Sum(amount_minor),0) n FROM commerce_benefit_point_ledger WHERE kind='hold'").get().n
  });
  // The immutable positive intent exists BEFORE ingress; the action hash computed
  // by the server includes requestedPointsMinor. Nothing mutates it afterwards.
  const action = { id: "c20p2s_positive_sale_01", action_type: "market_sale_complete", created_at: "2026-10-31T09:00:00.000Z",
    payload: { lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" }],
      location_id: "loc", settlement: "paid", customer_id: "c1", payment_method: "cash", external_payment_confirmed: false,
      requestedPointsMinor: 1000 } };
  const before = counts();
  try {
    const first = await send(action);
    assert.equal(first.status, 200, JSON.stringify(first));
    assert.equal(first.body.status, "applied", first.body.error_message);
    assert.equal(first.body.already_applied, false);
    assert.ok(first.body.sale_receipt, "positive points sale must return a server-validated receipt");
    assert.equal(first.body.sale_receipt.pointsTenderMinor, 1000);
    assert.equal(first.body.sale_receipt.cashPaidMinor, 99000, "Finance/cash must be only the realized cash part");
    assert.equal(first.body.sale_receipt.currency, "TRY");
    assert.equal(first.body.sale_receipt.source, "android-market-sale");
    assert.deepEqual(keyLoads, [{ inTransaction: false, create: false }], "protected key is read once, pre-BEGIN, without creation");

    const after = counts();
    assert.deepEqual(after, { ...before, sales: 1, settlements: 1, finance: 1, stock: -1, reservations: 1,
      spends: 1, snapshots: 1, actions: 1, receipts: 1 });
    assert.equal(db.prepare("SELECT points_tender_minor,cash_received_minor FROM commerce_sale_settlements").get().points_tender_minor, 1000);
    assert.equal(db.prepare("SELECT amount_minor FROM finance_entries").get().amount_minor, 99000);
    assert.equal(db.prepare("SELECT amount_minor FROM commerce_benefit_point_ledger WHERE kind='spend'").get().amount_minor, -1000);
    assert.equal(db.prepare("SELECT status FROM commerce_benefit_reservations").get().status, "settled");

    const replay = await send(action);
    assert.equal(replay.status, 200, JSON.stringify(replay));
    assert.equal(replay.body.status, "applied");
    assert.equal(replay.body.already_applied, true, "genuine identical retry must be idempotent");
    assert.deepEqual(replay.body.sale_receipt, first.body.sale_receipt, "retry must return identical receipt");
    assert.deepEqual(counts(), after, "retry must not double spend, restock or duplicate ACK");
    assert.equal(keyLoads.length, 1, "retry must not re-prepare a new protected source");

    // Durable replay re-validates the Store-issued earn grant through the same
    // evidence path. Ledger rows are trigger-immutable, so only confirm the real
    // canonical grant was accepted and bound to the settled receipt.
    const grantRow = db.prepare("SELECT amount_minor,operation_key FROM commerce_benefit_point_ledger WHERE kind='grant'").get();
    const spendRow = db.prepare("SELECT operation_key FROM commerce_benefit_point_ledger WHERE kind='spend'").get();
    assert.ok(grantRow && grantRow.amount_minor > 0, "canonical Store.settle earn grant must exist");
    assert.equal(grantRow.operation_key, spendRow.operation_key, "earn grant and spend share the settlement operation");

    const tampered = { ...action, payload: { ...action.payload, requestedPointsMinor: 500 } };
    const denied = await send(tampered);
    assert.equal(denied.status, 200); assert.equal(denied.body.status, "failed");
    assert.equal(Object.hasOwn(denied.body, "sale_receipt"), false);
    assert.deepEqual(counts(), after, "changed payload for the same action id must not write anything");

    // C20p-2y: zero-Puan paid cash for an authorized customer must earn through
    // the same protected owner chain, WITHOUT any Puan spending grant. The earn
    // rule is 10%, so a 100 TRY sale must grant exactly 1000 minor.
    grants.revokeAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    db.prepare("UPDATE catalog_products SET sale_price=100 WHERE id='p1'").run();
    const cashAction = { id: "c20p2y_cash_earn_sale_01", action_type: "market_sale_complete", created_at: "2026-10-31T09:10:00.000Z",
      payload: { lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 100, expected_currency: "TRY", expected_updated_at: "fixture" }],
        location_id: "loc", settlement: "paid", customer_id: "c1", payment_method: "cash", external_payment_confirmed: false } };
    const beforeCash = counts();
    const cashFirst = await send(cashAction);
    assert.equal(cashFirst.status, 200, JSON.stringify(cashFirst));
    assert.equal(cashFirst.body.status, "applied", cashFirst.body.error_message);
    assert.equal(cashFirst.body.already_applied, false);
    assert.ok(cashFirst.body.sale_receipt, "cash earn sale must return a durable receipt/ACK");
    assert.equal(cashFirst.body.sale_receipt.pointsTenderMinor, 0);
    assert.equal(cashFirst.body.sale_receipt.cashPaidMinor, 10000);
    assert.equal(cashFirst.body.sale_receipt.currency, "TRY");
    assert.equal(cashFirst.body.sale_receipt.source, "android-market-sale");
    const afterCash = counts();
    assert.deepEqual(afterCash, { ...beforeCash, sales: beforeCash.sales + 1, settlements: beforeCash.settlements + 1,
      finance: beforeCash.finance + 1, stock: beforeCash.stock - 1, reservations: beforeCash.reservations + 1,
      snapshots: beforeCash.snapshots + 1, actions: beforeCash.actions + 1, receipts: beforeCash.receipts + 1 });
    assert.equal(db.prepare("SELECT points_tender_minor,cash_received_minor FROM commerce_sale_settlements ORDER BY created_at DESC LIMIT 1")
      .get().points_tender_minor, 0);
    assert.equal(db.prepare("SELECT amount_minor FROM finance_entries ORDER BY rowid DESC LIMIT 1").get().amount_minor, 10000);
    const cashGrant = db.prepare(`SELECT amount_minor FROM commerce_benefit_point_ledger WHERE kind='grant'
      AND source_id=(SELECT sale_id FROM commerce_market_sale_receipts WHERE operation_id=?)`).get(cashAction.id);
    assert.equal(cashGrant?.amount_minor, 1000, "10% Companion cash earn must be granted exactly once");
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger WHERE kind='spend' AND source_id=(SELECT sale_id FROM commerce_market_sale_receipts WHERE operation_id=?)")
      .get(cashAction.id).n, 0, "zero-Puan sale must not create a spend ledger row");

    const cashReplay = await send(cashAction);
    assert.equal(cashReplay.status, 200, JSON.stringify(cashReplay));
    assert.equal(cashReplay.body.already_applied, true);
    assert.deepEqual(cashReplay.body.sale_receipt, cashFirst.body.sale_receipt);
    assert.deepEqual(counts(), afterCash, "cash retry must not grant twice or rewrite sale/stock/ACK");

    const cashTampered = { ...cashAction, payload: { ...cashAction.payload, customer_id: "c2" } };
    const cashDenied = await send(cashTampered);
    assert.equal(cashDenied.status, 200); assert.equal(cashDenied.body.status, "failed");
    assert.equal(Object.hasOwn(cashDenied.body, "sale_receipt"), false);
    assert.deepEqual(counts(), afterCash, "mutated cash payload must roll back without a second earn");

    // Ineligible zero-tender sales still succeed through the generic cash/credit
    // route and must not create any benefits reservation, snapshot or grant.
    const beforePlain = counts();
    const customerless = { ...cashAction, id: "c20p2y_customerless_sale_01", payload: { ...cashAction.payload, customer_id: "" } };
    const customerlessResult = await send(customerless);
    assert.equal(customerlessResult.status, 200, JSON.stringify(customerlessResult));
    assert.equal(customerlessResult.body.status, "applied", customerlessResult.body.error_message);
    const afterCustomerless = counts();
    assert.deepEqual(afterCustomerless, { ...beforePlain, sales: beforePlain.sales + 1, finance: beforePlain.finance + 1, stock: beforePlain.stock - 1,
      actions: beforePlain.actions + 1, receipts: beforePlain.receipts + 1 });
    assert.equal(afterCustomerless.reservations, beforePlain.reservations);
    assert.equal(afterCustomerless.snapshots, beforePlain.snapshots);

    const credit = { ...cashAction, id: "c20p2y_credit_sale_01", payload: { ...cashAction.payload, settlement: "credit", payment_method: "" } };
    const creditResult = await send(credit);
    assert.equal(creditResult.status, 200, JSON.stringify(creditResult));
    assert.equal(creditResult.body.status, "applied", creditResult.body.error_message);
    const afterCredit = counts();
    assert.deepEqual(afterCredit, { ...afterCustomerless, sales: afterCustomerless.sales + 1, stock: afterCustomerless.stock - 1,
      actions: afterCustomerless.actions + 1, receipts: afterCustomerless.receipts + 1 });
    assert.equal(afterCredit.reservations, beforePlain.reservations);
    assert.equal(afterCredit.snapshots, beforePlain.snapshots);

    const newAction = { ...action, id: "c20p2s_permission_denied_01" };
    const noGrant = await send(newAction);
    assert.equal(noGrant.status, 200); assert.equal(noGrant.body.status, "failed");
    assert.equal(Object.hasOwn(noGrant.body, "sale_receipt"), false);
    assert.deepEqual(counts(), afterCredit, "revoked spend grant must fail closed without partial sale/finance/stock/points/ACK");

    assert.equal(grants.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1"), true);
    db.prepare("UPDATE android_devices SET role='staff', permissions_json='[]' WHERE device_id='device-one'").run();
    const noPermission = await send({ ...action, id: "c20p2s_permission_denied_02" });
    assert.equal(noPermission.status, 200); assert.equal(noPermission.body.status, "failed");
    assert.equal(Object.hasOwn(noPermission.body, "sale_receipt"), false);
    assert.deepEqual(counts(), afterCredit, "device without market sale permission must fail closed and roll back");

    console.log("PASS production HTTPS Companion positive Puan sale AND zero-Puan cash 10% earn, canonical reserve/sale/settle/receipt/ACK, exact retry, ineligible customerless/credit sales and fail-closed negatives");
  } finally { await server.stop(); }
} finally { f.close(); }
