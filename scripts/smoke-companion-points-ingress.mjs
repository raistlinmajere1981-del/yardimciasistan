import assert from "node:assert/strict";
import { dirname } from "node:path";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { connect as tlsConnect } from "node:tls";
import { Duplex } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { saleFixture, databaseState, load } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { createCompanionSpendGrantWorker } from "./test-helpers/companion-spend-grant-concurrent.mjs";
import { runCompanionReservationWitnessScenario, runCompanionReservationIssuanceScenario, runCompanionSalePolicyScenario, runCompanionPaidWriterScenario, provisionRejectedAndroidReceiptEvidence } from "./test-helpers/companion-reservation-witness.mjs";
import { secretKey, rule as preSaleRule } from "./test-helpers/commerce-benefits-fixture.mjs";

// Real TLS and current owners in disposable SQLite only. The wrapper below is a
// future principal consumer, not a production spend route or settlement writer.
const ingress = load("local-companion-server");
assert.equal(typeof ingress.requireLocalActionPointsPrincipal, "function", "HTTPS-only opaque principal seam required");
const intents = load("companion-points-intent");
assert.equal(typeof intents.bindCompanionPointsIntent, "function", "non-authorizing versioned intent binding required");
const companionPorts = load("companion-sale-benefits");
assert.equal(typeof companionPorts.prepareCompanionSaleTenderContract, "function", "C20n owner tender preflight required");
assert.equal(typeof load("market-sale-operation").assertMarketSaleCompanionTenderExecution, "function", "C20n terminal owner authority gate required");
assert.equal(typeof companionPorts.prepareCompanionSaleOperationObservation, "function", "C20m canonical owner observation required");
assert.equal(typeof companionPorts.companionSaleBenefitsReadPorts, "function", "C20e read-only Companion ports required");
assert.equal(typeof companionPorts.prepareCompanionSaleBenefitsSource, "function", "C20f pre-BEGIN protected source preparation required");
assert.equal(typeof companionPorts.companionSaleBenefitsPreSaleReadPorts, "function", "C20g pre-sale read-only ports required");
assert.equal(typeof companionPorts.captureCompanionSaleBenefitsQuote, "function", "C20h opaque advisory snapshot capture required");
assert.equal(typeof companionPorts.revalidateCompanionSaleBenefitsQuote, "function", "C20h same-parent fresh quote revalidation required");
assert.equal(typeof companionPorts.captureCompanionSaleBenefitsReservation, "function", "C20j canonical reservation witness capture required");
assert.equal(typeof companionPorts.revalidateCompanionSaleBenefitsReservation, "function", "C20j read-only reservation witness required");
assert.equal(typeof companionPorts.prepareCompanionSaleBenefitsIssuance, "function", "C20k source issuance gate required");
assert.equal(typeof companionPorts.captureCompanionSaleBenefitsIssuedReservation, "function", "C20k canonical owner receipt provenance required");
assert.equal(typeof companionPorts.revalidateCompanionSaleBenefitsIssuedReservation, "function", "C20k same-parent issuance revalidation required");
const { withCommerceBenefitsParentTransaction } = load("commerce-benefits-rules");
const f = saleFixture();
let grantWorker;
const router = load("android-action-router"), originalRoute = router.routeAndroidActionInTransaction;
// Default uses in-memory TLS; --tcp separately exercises loopback socket wiring.
const memoryTls = !process.argv.includes("--tcp"), listeners = new Map();
const log = load("desktop-logger").desktopLog, logEvents = [], originalLogs = {};
for (const level of ["info", "warn", "error"]) {
  originalLogs[level] = log[level]; log[level] = event => logEvents.push(event);
}
function memoryListener(companion) {
  if (!memoryTls) return;
  // Replace TCP bind only. Node's actual HTTPS/TLS and HTTP parsers still run.
  companion.listen = async listener => {
    const port = 40000 + listeners.size;
    listener.address = () => ({ port, address: "127.0.0.1", family: "IPv4" });
    listener.on("secureConnection", socket => Object.defineProperty(socket, "remoteAddress", { value: "127.0.0.1" }));
    listeners.set(port, listener);
  };
}
function memoryConnection(port) {
  const client = new Duplex({ read() {}, write(chunk, _encoding, done) { server.push(Buffer.from(chunk)); done(); }, final(done) { server.push(null); done(); } });
  const server = new Duplex({ read() {}, write(chunk, _encoding, done) { client.push(Buffer.from(chunk)); done(); }, final(done) { client.push(null); done(); } });
  Object.defineProperty(server, "remoteAddress", { value: "127.0.0.1" });
  listeners.get(port).emit("connection", server);
  return client;
}
try {
  const db = f.db, otherToken = `yal_${"b".repeat(64)}`;
  let ackInsertProbes = 0;
  db.function("c20p_ack_insert_probe", () => { ackInsertProbes++; return 1; });
  let token = `yal_${"a".repeat(64)}`;
  for (const cap of ["service.android", "core.finance", "commerce.customer_credit", "retail.barcode"])
    db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  for (const [id, device] of [["d1", "device-one"], ["d2", "device-two"]]) {
    db.prepare("INSERT INTO android_devices(id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES (?,?,'admin','fixture','fixture','fixture','fixture')").run(id, device);
    db.prepare("UPDATE android_devices SET is_active=1 WHERE id=?").run(id);
  }
  const credentials = load("database/android-local-credential-store");
  credentials.storeAndroidLocalCredential(db, "device-one", token);
  credentials.storeAndroidLocalCredential(db, "device-two", otherToken);
  const grants = load("database/android-benefits-spend-grant-store"), owner = { assertAuthorized() {} };
  grants.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
  grantWorker = createCompanionSpendGrantWorker(f.path);
  const readOnly = (database, fn) => {
    const before = databaseState(database), writes = database.prepare("SELECT total_changes() n").get().n;
    try { return fn(); }
    finally { assert.deepEqual(databaseState(database), before); assert.equal(database.prepare("SELECT total_changes() n").get().n, writes); }
  };
  let concurrentExpectedState, workerGeneration;
  const app = load("android-action-application-service"), apply = app.applyAndroidActionTransaction;
  const caps = () => load("business-capability-store").readEnabledBusinessCapabilities(db);
  const denied = fn => assert.throws(fn, error => error.code === "COMPANION_POINTS_DENIED");
  let mode = "principal", captured, boundAction, principal, callbacks = 0, routes = 0, binding, lastIntentError, advisoryQuote;
  let ownerProofProbe = 0, ownerPrincipal;
  let portsBinding, lastPortsError, savedPorts, portsRequestChange = request => request;
  let prepared, savedPreparation, secondPreparation, preparationError, preparationKeyLoads = 0, commerceBoundarySource;
  let preSaleError, preSaleSaved, preSaleRequestChange = request => request, preSaleResponse, candidateRouterReturned = false;
  let paidWriterCanonicalRouterReturned = false;
  let paidWriterSettledRouterReturned = false;
  let paidWriterOwnerMintedRouterReturned = false;
  let paidWriterAuthorizedPointsRouterReturned = false;
  let receiptBoundaryWrites;
  let archivedQuote, nextParentQuote;
  const reservationSaved = {};
  const intent = { version: 1, currency: "TRY", requestedPointsMinor: 1000 };
  let intentInput = intent;
  // C26: these low-level C20d+ fixtures are synthetic and now sit behind the real
  // positive-Puan production branch. They keep the real authenticated context and
  // owner BEGIN, but the fixture hides the positive amount from the production
  // preflight and restores it on the identical action inside the mocked router.
  const syntheticLowLevelMode = candidate => /^(?:intent|ports|prepare|presale|snapshot|witness|issuance|policy|paid-writer|cross-writer)/.test(candidate);
  let harnessPositivePoints;
  // The legacy canonical writer deliberately refuses a positive Puan tender. The
  // fixtures carry the amount only for the low-level intent/ports checks, so give
  // the real writer the same zero a production cash sale would have.
  const asZeroPointsAction = (candidate, run) => {
    if (candidate.payload.requestedPointsMinor === undefined) return run();
    const positive = candidate.payload.requestedPointsMinor;
    candidate.payload.requestedPointsMinor = 0;
    try { return run(); } finally { candidate.payload.requestedPointsMinor = positive; }
  };
  router.routeAndroidActionInTransaction = (database, action, now, enabled, context) => {
    routes++;
    assert.equal(database.isTransaction, true);
    if (syntheticLowLevelMode(mode) && harnessPositivePoints !== undefined) {
      // The HTTPS handler minted this real owner parent; restore the exact positive
      // Puan amount so the low-level intent/principal checks run on the same action.
      // Production positive Puan never takes this path; it is covered end-to-end by
      // scripts/smoke-companion-points-production-path.mjs.
      action.payload.requestedPointsMinor = harnessPositivePoints;
      harnessPositivePoints = undefined;
    }
    if (mode.startsWith("receipt-boundary-")) {
      const result = originalRoute(database, action, now, enabled, context);
      assert.equal(result.ok, true, "real legacy cash sale completed before negative SQL provisioning");
      provisionRejectedAndroidReceiptEvidence(database, action.id, mode.slice("receipt-boundary-".length));
      receiptBoundaryWrites = database.prepare("SELECT total_changes() n").get().n;
      return result; // NO forced rollback: the real Android materializer must reject.
    }
    if (mode === "cross-writer-atomic" || mode.startsWith("cross-writer-candidate") || mode.startsWith("cross-writer-owner-candidate")) {
      try {
        withCommerceBenefitsParentTransaction(database, Date.now(), tx =>
          runCompanionReservationIssuanceScenario({ mode: mode === "cross-writer-atomic" ? "issuance-cross-writer-atomic" : `issuance-${mode}`, tx, action, context, input: intent,
            prepared, key: protectedKey, fixture: f, grants, grantOwner: owner, worker: grantWorker, saved: reservationSaved,
            commerceBoundarySource }));
      } catch (error) { preSaleError = error.code ?? "UNEXPECTED_WITNESS_ERROR"; throw error; }
      // Return success to the REAL Android owner so its pre-commit evidence
      // check denies the points settlement before any ACK/receipt insert.
      if (mode.startsWith("cross-writer-candidate") || mode.startsWith("cross-writer-owner-candidate")) candidateRouterReturned = true;
      return { ok: true, message: "" };
    }
    if (mode.startsWith("paid-writer-")) {
      try {
        withCommerceBenefitsParentTransaction(database, Date.now(), tx => runCompanionPaidWriterScenario({ mode, tx, action,
          context, input: intent, prepared, grants, grantOwner: owner, saved: reservationSaved }));
      } catch (error) { preSaleError = error.code ?? "UNEXPECTED_WITNESS_ERROR"; throw error; }
      if (mode === "paid-writer-canonical-sale" || mode === "paid-writer-settled-sale" || mode === "paid-writer-owner-minted-sale"
        || mode === "paid-writer-authorized-points-receipt") {
        // C20p-2l/2m/2n: the real owner must now run its pre-ACK points evidence
        // check and roll back this genuine reserve + canonical sale parent.
        if (mode === "paid-writer-canonical-sale") paidWriterCanonicalRouterReturned = true;
        else if (mode === "paid-writer-settled-sale") paidWriterSettledRouterReturned = true;
        else if (mode === "paid-writer-owner-minted-sale") paidWriterOwnerMintedRouterReturned = true;
        else paidWriterAuthorizedPointsRouterReturned = true;
        return { ok: true, message: "" };
      }
      throw new Error("C20p-2k opt-in paid-writer fixture rolls back; no sale/settlement/ACK");
    }
    if (mode.startsWith("witness-") || mode.startsWith("issuance-") || mode.startsWith("policy-")) {
      try {
        withCommerceBenefitsParentTransaction(database, Date.now(), tx => {
          if (mode.startsWith("policy-")) return runCompanionSalePolicyScenario({ mode, tx, action, context, input: intent, prepared,
            grants, grantOwner: owner, saved: reservationSaved });
          return (mode.startsWith("issuance-") ? runCompanionReservationIssuanceScenario : runCompanionReservationWitnessScenario)({ mode, tx, action, context, input: intent, prepared,
            key: protectedKey, fixture: f, grants, grantOwner: owner, worker: grantWorker, saved: reservationSaved, commerceBoundarySource });
        });
        if (mode === "issuance-next-parent") withCommerceBenefitsParentTransaction(database, Date.now(), tx =>
          companionPorts.revalidateCompanionSaleBenefitsIssuedReservation(tx, action, context, intent,
            reservationSaved.issued.binding, prepared, reservationSaved.issued.handle));
        if (mode === "witness-next-parent") withCommerceBenefitsParentTransaction(database, Date.now(), tx =>
          companionPorts.revalidateCompanionSaleBenefitsReservation(tx, action, context, intent,
            reservationSaved.next.binding, prepared, reservationSaved.next.handle));
      } catch (error) { preSaleError = error.code ?? "UNEXPECTED_WITNESS_ERROR"; throw error; }
      throw new Error("C20j fixture rolls back canonical reservation/ledger; no sale or ACK");
    }
    if (mode.startsWith("presale-") || mode.startsWith("snapshot-")) {
      try { withCommerceBenefitsParentTransaction(database, Date.now() + (mode === "presale-expiry" ? 31000 : mode === "presale-future" ? -31000 : 0), tx => {
        const rulesOwner = load("commerce-benefits-rules");
        const redeem = preSaleRule("c20g_redeem", "points", { startsAt: tx.now - 1000, percentBps: 10000,
          endsAt: mode === "snapshot-rule-expiry" ? tx.now + 1000 : null,
          points: { operation: "redeem", earnBase: "after_points", expiryDays: null },
          scope: { ...preSaleRule("scope", "points").scope,
            channels: mode === "presale-rule-channel" ? ["desktop_cart"] : ["companion"],
            priceGroups: [action.payload.lines[0].expected_unit_price === 800 ? "dealer_a" : action.payload.lines[0].expected_unit_price === 700 ? "dealer_b" : "retail"],
            excludedProductIds: mode === "presale-rule-product" ? ["p1"] : [] } });
        rulesOwner.saveCommerceBenefitsRule(tx, "b1", redeem);
        rulesOwner.saveCommerceBenefitsRule(tx, "b1", preSaleRule("c20g_bank", "payment_modifier", { startsAt: tx.now - 1000, percentBps: 5000 }));
        // Canonical fixture provisioning, before measuring reader side effects.
        if (!["presale-no-balance", "presale-expired-balance"].includes(mode)) load("commerce-benefits-points").adjustCommercePoints(tx, {
          businessId: "b1", customerId: "c1", currency: "TRY", amount: 5000,
          operationKey: "c20g_opening", expiresAt: mode === "snapshot-lot-expiry" ? tx.now + 1000 : null });
        if (mode === "snapshot-rule-start") rulesOwner.saveCommerceBenefitsRule(tx, "b1", preSaleRule("c20h_future", "payment_modifier", {
          startsAt: tx.now + 1000, percentBps: 500 }));
        if (mode === "snapshot-hold-expiry") database.prepare(`INSERT INTO commerce_benefit_reservations
          VALUES ('b1','c20h_expiring_hold','c1','sale','fixture_hold','TRY','active','{}','{}','{}','[]',0,?,?)`)
          .run(tx.now, tx.now + 1000);
        if (mode === "snapshot-other-customer") load("commerce-benefits-points").adjustCommercePoints(tx, {
          businessId: "b1", customerId: "c2", currency: "TRY", amount: 5000, operationKey: "c20h_c2_opening", expiresAt: null });
        if (mode === "presale-expired-balance") database.prepare(`INSERT INTO commerce_benefit_point_ledger
          (business_id,id,customer_id,currency,kind,amount_minor,source_kind,source_id,operation_key,expires_at_ms,created_at_ms)
          VALUES ('b1','c20g_expired','c1','TRY','grant',5000,'fixture','expired','c20g_expired',1,0)`).run();
        const current = readOnly(database, () => intents.bindCompanionPointsIntent(tx, action, context, intent));
        if (mode === "snapshot-worker-fresh") assert.equal(current.scope.spendGrantGeneration, workerGeneration);
        const beforeFactory = databaseState(database), beforeFactoryWrites = database.prepare("SELECT total_changes() n").get().n;
        let adapter;
        try { adapter = companionPorts.companionSaleBenefitsPreSaleReadPorts(tx, action,
          mode === "presale-context" ? { ...context } : context, intent,
          mode === "presale-binding" ? { ...current } : current,
          mode === "presale-preparation" ? { ...prepared } : prepared); }
        finally {
          assert.deepEqual(databaseState(database), beforeFactory, "pre-sale ports factory writes nothing");
          assert.equal(database.prepare("SELECT total_changes() n").get().n, beforeFactoryWrites, "factory issues no row writes, including no-op writes");
        }
        assert.equal(database.prepare("SELECT 1 FROM commerce_sales WHERE id=?").get(prepared.source.id), undefined);
        assert.equal(database.prepare("SELECT 1 FROM commerce_market_sale_receipts WHERE operation_id=?").get(action.id), undefined);
        assert.deepEqual(adapter.request.source, prepared.source);
        assert.deepEqual(adapter.authority, { state: "read_only", canReservePoints: false, canConfirmPoints: false });
        if (mode.startsWith("snapshot-")) {
          const measure = fn => {
            const before = databaseState(database), writes = database.prepare("SELECT total_changes() n").get().n;
            try { return fn(); }
            finally {
              assert.deepEqual(databaseState(database), before, `${mode}: zero reader changes`);
              assert.equal(database.prepare("SELECT total_changes() n").get().n, writes, `${mode}: no writes even no-op`);
            }
          };
          const capture = () => companionPorts.captureCompanionSaleBenefitsQuote(tx, action, context, intent, current, prepared);
          if (mode === "snapshot-capture-fault") {
            const originalPrepare = database.prepare;
            try { measure(() => {
              database.prepare = function(sql) {
                if (sql.includes("SELECT l.id")) throw Object.assign(new Error("fixture capture fault"), { code: "FIXTURE_READ_FAULT" });
                return originalPrepare.call(this, sql);
              };
              capture();
            }); } finally { database.prepare = originalPrepare; }
          }
          const handle = measure(capture);
          assert.deepEqual(handle, {}); assert.ok(Object.isFrozen(handle));
          assert.equal(JSON.stringify(handle), "{}", "archived handle contains no bearer token, key or quote");
          const verify = (candidate = handle, nextTx = tx, nextAction = action, nextContext = context,
            nextInput = intent, nextBinding = current, nextPreparation = prepared) =>
            companionPorts.revalidateCompanionSaleBenefitsQuote(nextTx, nextAction, nextContext, nextInput, nextBinding, nextPreparation, candidate);
          const original = measure(() => verify());
          assert.deepEqual(original, adapter.readAdvisoryQuote());
          assert.ok(Object.isFrozen(original) && Object.isFrozen(original.quote) && Object.isFrozen(original.quote.adjustments));
          assert.throws(() => { original.quote.pointsTenderMinor = 1; }, TypeError);
          assert.deepEqual(measure(() => verify()), original, "exact repeat freshly recomputes without writes");
          if (mode === "snapshot-read") archivedQuote = { handle, tx, action, context, current, prepared };
          if (mode === "snapshot-next-parent") nextParentQuote = { handle, current };
          if (mode === "snapshot-grant" || mode === "snapshot-regrant" || mode === "snapshot-epoch" || mode === "snapshot-reissue") {
            if (mode !== "snapshot-reissue") grants.revokeAndroidBenefitsSpend(database, owner, "b1", "device-one", "c1");
            if (mode === "snapshot-epoch") database.exec("UPDATE android_devices SET authorization_epoch=authorization_epoch+1 WHERE device_id='device-one'");
            if (mode !== "snapshot-grant") grants.grantAndroidBenefitsSpend(database, owner, "b1", "device-one", "c1");
          }
          if (mode === "snapshot-token") credentials.revokeAndroidLocalCredential(database, "device-one");
          if (mode === "snapshot-device") database.exec("UPDATE android_devices SET is_active=0 WHERE device_id='device-one'");
          if (mode === "snapshot-business") database.exec("UPDATE business SET deleted_at='hidden' WHERE id='b1'");
          if (mode === "snapshot-family") database.exec("UPDATE commerce_benefit_settings SET coupons_enabled=0 WHERE business_id='b1'");
          if (mode === "snapshot-rules") rulesOwner.saveCommerceBenefitsRule(tx, "b1", { ...redeem, version: 2 });
          if (mode === "snapshot-price") database.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
          if (mode === "snapshot-stock") database.exec("UPDATE inventory_balances SET quantity=0 WHERE product_id='p1'");
          if (mode === "snapshot-price-group") database.exec(`INSERT INTO customer_commercial_profiles
            (business_id,customer_id,company_name,dealer_status,price_group,created_at,updated_at)
            VALUES ('b1','c1','Fixture','active','dealer_a','fixture','fixture');
            INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','commerce.wholesale','fixture','fixture')`);
          if (mode === "snapshot-balance" || mode === "snapshot-other-customer") load("commerce-benefits-points").adjustCommercePoints(tx, {
            businessId: "b1", customerId: mode === "snapshot-balance" ? "c1" : "c2", currency: "TRY", amount: -100,
            operationKey: "c20h_other_operation_spend", expiresAt: null });
          if (mode === "snapshot-consumed") {
            const allocation = companionPorts.requireCompanionSaleBenefitsSource(tx, action, context, intent, current, prepared);
            load("market-sale-operation").completeMarketSaleInTransaction(database, {
              operationId: action.id, source: "android-market-sale", settlement: "paid", customerId: "c1", locationId: "loc", paymentMethod: "cash",
              items: [{ productId: "p1", quantity: 1, expectedUnitPrice: 1000, expectedCurrency: "TRY", expectedUpdatedAt: "fixture" }]
            }, now, undefined, allocation);
          }
          const realClock = Date.now, originalPrepare = database.prepare;
          try { measure(() => {
            if (["snapshot-rule-expiry", "snapshot-rule-start", "snapshot-lot-expiry", "snapshot-hold-expiry"].includes(mode)) Date.now = () => tx.now + 1000;
            if (mode === "snapshot-expiry") Date.now = () => tx.now + 30000;
            if (mode === "snapshot-clock-back") Date.now = () => tx.now - 1;
            if (mode === "snapshot-expiry-during-read") {
              let clockReads = 0;
              Date.now = () => ++clockReads === 1 ? realClock() : tx.now + 30000;
            }
            if (mode === "snapshot-fault") database.prepare = function(sql) {
              if (sql.includes("SELECT l.id")) throw Object.assign(new Error("fixture balance read fault"), { code: "FIXTURE_READ_FAULT" });
              return originalPrepare.call(this, sql);
            };
            if (mode === "snapshot-db") {
              const other = new DatabaseSync(":memory:"); other.exec("BEGIN IMMEDIATE");
              try { withCommerceBenefitsParentTransaction(other, tx.now, otherTx => verify(handle, otherTx)); }
              finally { other.exec("ROLLBACK"); other.close(); }
            } else if (mode === "snapshot-worker-busy") {
              const before = databaseState(database), generation = current.scope.spendGrantGeneration;
              const blocked = grantWorker.run("revoke");
              assert.equal(blocked.ok, false, JSON.stringify(blocked));
              assert.equal(blocked.errcode, 5, "real owner DELETE returns SQLITE_BUSY while canonical parent holds writer lock");
              assert.equal(blocked.inTransaction, false);
              assert.equal(blocked.writes, 0, "busy owner write changed no rows on the worker connection");
              assert.equal(grants.readAndroidBenefitsSpendGrantGeneration(database, "b1", "device-one", "c1"), generation);
              assert.deepEqual(databaseState(database), before, "blocked revoke changed no tables");
              assert.deepEqual(verify(), original, "parent which won the writer lock remains authorized");
            } else if (mode === "snapshot-concurrent") {
              const other = new DatabaseSync(f.path); other.exec("PRAGMA busy_timeout=0");
              try { assert.throws(() => other.exec("BEGIN IMMEDIATE"), /locked/,
                "another spend writer cannot interleave with the authorized BEGIN IMMEDIATE parent"); }
              finally { other.close(); }
              assert.deepEqual(verify(), original);
            } else if (mode === "snapshot-clone") verify({ ...handle });
            else if (mode === "snapshot-json") verify(JSON.parse(JSON.stringify(handle)));
            else if (mode === "snapshot-missing") verify(null);
            else if (mode === "snapshot-quote") verify(original);
            else if (mode === "snapshot-tampered") verify({ ...handle, currency: "USD", expiresAtMs: tx.now + 999999, quote: { pointsTenderMinor: 1 } });
            else if (mode === "snapshot-parent-clone") verify(handle, { ...tx });
            else if (mode === "snapshot-parent-time") { tx.now++; verify(); }
            else if (mode === "snapshot-owner") verify(archivedQuote.handle);
            else if (mode === "snapshot-action-clone") verify(handle, tx, { ...action });
            else if (mode === "snapshot-context") verify(handle, tx, action, { ...context });
            else if (mode === "snapshot-binding") verify(handle, tx, action, context, intent, { ...current });
            else if (mode === "snapshot-preparation") verify(handle, tx, action, context, intent, current, { ...prepared });
            else if (mode === "snapshot-key-source") verify(handle, tx, action, context, intent, current, secondPreparation);
            else if (mode === "snapshot-intent") verify(handle, tx, action, context, { ...intent, requestedPointsMinor: 999 });
            else if (mode === "snapshot-currency") verify(handle, tx, action, context, { ...intent, currency: "USD" });
            else if (mode === "snapshot-other-device") { action.device_id = "device-two"; verify(); }
            else if (mode === "snapshot-customer") { action.payload.customer_id = "c2"; verify(); }
            else if (mode === "snapshot-operation") { action.id = "snapshot_other_operation"; verify(); }
            else if (mode === "snapshot-action-type") { action.action_type = "market_credit_collect"; verify(); }
            else if (mode === "snapshot-payment") { action.payload.payment_method = "bank"; verify(); }
            else if (mode === "snapshot-caught") assert.throws(() => verify({ ...handle }), e => e.code === "COMPANION_POINTS_QUOTE_SCOPE");
            else assert.deepEqual(verify(), original);
          }); } finally { Date.now = realClock; database.prepare = originalPrepare; }
          if (mode === "snapshot-read") {
            // Successful capture/repeat leave the exact allocation to its real owner.
            const allocation = companionPorts.requireCompanionSaleBenefitsSource(tx, action, context, intent, current, prepared);
            const result = load("market-sale-operation").completeMarketSaleInTransaction(database, {
              operationId: action.id, source: "android-market-sale", settlement: "paid", customerId: "c1", locationId: "loc", paymentMethod: "cash",
              items: [{ productId: "p1", quantity: 1, expectedUnitPrice: 1000, expectedCurrency: "TRY", expectedUpdatedAt: "fixture" }]
            }, now, undefined, allocation);
            assert.equal(result.sale.id, prepared.source.id);
          }
          return;
        }
        if (mode === "presale-read") preSaleSaved = adapter;
        if (mode === "presale-grant" || mode === "presale-regrant" || mode === "presale-epoch") {
          grants.revokeAndroidBenefitsSpend(database, owner, "b1", "device-one", "c1");
          if (mode === "presale-epoch") database.exec("UPDATE android_devices SET authorization_epoch=authorization_epoch+1 WHERE device_id='device-one'");
          if (mode !== "presale-grant") grants.grantAndroidBenefitsSpend(database, owner, "b1", "device-one", "c1");
        }
        if (mode === "presale-token") credentials.revokeAndroidLocalCredential(database, "device-one");
        if (mode === "presale-other-device") action.device_id = "device-two";
        if (mode === "presale-family") database.exec("UPDATE commerce_benefit_settings SET points_enabled=0 WHERE business_id='b1'");
        if (mode === "presale-device") database.exec("UPDATE android_devices SET is_active=0 WHERE device_id='device-one'");
        if (mode === "presale-business") database.exec("UPDATE business SET deleted_at='hidden' WHERE id='b1'");
        if (mode === "presale-balance-changed") load("commerce-benefits-points").adjustCommercePoints(tx, {
          businessId: "b1", customerId: "c1", currency: "TRY", amount: -4500, operationKey: "c20g_debit", expiresAt: null });
        if (mode === "presale-price") database.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
        if (mode === "presale-rules") rulesOwner.saveCommerceBenefitsRule(tx, "b1", { ...redeem, version: 2, percentBps: 5000 });
        if (mode === "presale-customer") action.payload.customer_id = "c2";
        if (mode === "presale-operation") action.id = "presale_wrong_operation_01";
        if (mode === "presale-payment") action.payload.payment_method = "bank";
        if (mode === "presale-currency") action.payload.lines[0].expected_currency = "USD";
        if (mode === "presale-consumed") {
          const allocation = companionPorts.requireCompanionSaleBenefitsSource(tx, action, context, intent, current, prepared);
          const result = load("market-sale-operation").completeMarketSaleInTransaction(database, {
            operationId: action.id, source: "android-market-sale", settlement: "paid", customerId: "c1", locationId: "loc",
            paymentMethod: "cash", items: [{ productId: "p1", quantity: 1, expectedUnitPrice: 1000, expectedCurrency: "TRY", expectedUpdatedAt: "fixture" }]
          }, now, undefined, allocation);
          assert.equal(result.sale.id, adapter.request.source.id, "read ports leave the one-shot allocation consumable by its canonical writer");
        }
        // Synthetic existing rows exercise real Store mutation entrypoints' auth,
        // including replay paths, without ever granting a reservation.
        if (["presale-settle", "presale-release", "presale-reverse"].includes(mode)) {
          database.prepare(`INSERT INTO commerce_benefit_reservations
            VALUES ('b1','c20g_denied_reservation','c1','sale',?,'TRY','active',?,'{}','{}','[]',0,?,?)`)
            .run(adapter.request.source.id, JSON.stringify(adapter.request), tx.now, tx.now + 10000);
          if (mode === "presale-reverse") database.prepare(`INSERT INTO commerce_benefit_snapshots
            VALUES ('b1','c20g_denied_snapshot',1,'c20g_denied_reservation','sale',?,'{}','[]','{}',?)`)
            .run(adapter.request.source.id, tx.now);
        }
        const beforeRead = databaseState(database), beforeReadWrites = database.prepare("SELECT total_changes() n").get().n, originalPrepare = database.prepare;
        try {
          const candidate = preSaleRequestChange(adapter.request);
          if (mode === "presale-fault") database.prepare = function(sql) {
            if (sql.includes("SELECT l.id")) throw Object.assign(new Error("fixture balance read fault"), { code: "FIXTURE_READ_FAULT" });
            return originalPrepare.call(this, sql);
          };
          if (mode === "presale-reserve") adapter.store.reserve(tx, { ...candidate, couponCodes: [] }, "c20g_denied");
          else if (mode === "presale-adjust") adapter.store.adjustPoints(tx, { businessId: "b1", customerId: "c1", currency: "TRY",
            amountMinor: 1, expiresAt: null, reason: "correction", operationKey: "c20g_denied" });
          else if (mode === "presale-settle") adapter.store.settle(tx, "b1", "c20g_denied_reservation", "c20g_denied");
          else if (mode === "presale-release") adapter.store.release(tx, "b1", "c20g_denied_reservation", "c20g_denied");
          else if (mode === "presale-reverse") adapter.store.reverse(tx, "b1", "c20g_denied_snapshot", "c20g_denied");
          else if (mode === "presale-expire") adapter.store.expirePoints(tx, "b1", "c1", "TRY", "c20g_denied");
          else if (mode === "presale-no-read-port") {
            const { authorizeReadOnly: _read, ...legacyPorts } = adapter.ports;
            new (load("commerce-benefits-store").CommerceBenefitsStore)(secretKey, legacyPorts).previewReadOnly(tx, candidate);
          }
          else if (mode === "presale-checkout-preview") adapter.store.preview(tx, { ...candidate, couponCodes: [] });
          else if (mode === "presale-refund") adapter.ports.readFullRefund(database, candidate.source);
          else if (mode === "presale-settlement") adapter.ports.readSettlement(database, candidate.source);
          else if (mode === "presale-time") adapter.ports.resolvePricing(database, candidate, tx.now + 1);
          else if (mode === "presale-owner") preSaleSaved.readAdvisoryQuote();
          else if (mode === "presale-caught") {
            assert.throws(() => adapter.store.reserve(tx, { ...candidate, couponCodes: [] }, "c20g_denied"),
              error => error.code === "COMPANION_POINTS_RESERVATION_DISABLED");
          } else {
            const pricing = adapter.ports.resolvePricing(database, candidate, tx.now);
            assert.equal(pricing.lines[0].unitPriceMinor, action.payload.lines[0].expected_unit_price * 100);
            assert.deepEqual(pricing.payment, { methodId: action.payload.payment_method, confirmed: false });
            const result = adapter.store.previewReadOnly(tx, candidate);
            assert.equal(result.quote.subtotalMinor, pricing.lines[0].unitPriceMinor);
            assert.equal(result.quote.discountMinor, 0, "unconfirmed pre-sale payment never earns a method discount");
            assert.equal(result.quote.pointsTenderMinor, 1000, "hypothetical advisory amount only");
            assert.equal(result.availablePointsMinor, 5000);
            assert.ok(result.quote.adjustments.some(a => a.ruleId === "c20g_redeem" && a.operation === "points_tender"));
            assert.deepEqual(result.authority, adapter.authority);
            assert.deepEqual(adapter.readAdvisoryQuote(), result, "repeat recomputes the same canonical quote without writes");
          }
        } finally {
          database.prepare = originalPrepare;
          assert.deepEqual(databaseState(database), beforeRead, "C20g read/fault/denial has zero writes");
          assert.equal(database.prepare("SELECT total_changes() n").get().n, beforeReadWrites, "read/fault/denial issues no row writes, including no-op writes");
        }
      });
      if (mode === "snapshot-next-parent") withCommerceBenefitsParentTransaction(database, Date.now(), tx =>
        companionPorts.revalidateCompanionSaleBenefitsQuote(tx, action, context, intent, nextParentQuote.current, prepared, nextParentQuote.handle));
      } catch (error) { preSaleError = error.code ?? "UNEXPECTED_PRESALE_ERROR"; throw error; }
      throw new Error("C20g advisory fixture rolls back without creating a sale");
    }
    if (mode.startsWith("prepare-")) {
      try { withCommerceBenefitsParentTransaction(database, Date.now() + (mode === "prepare-expired" ? 31000 : 0), tx => {
        if (mode === "prepare-action") action.id = "preparation_mutated_action_01";
        if (mode === "prepare-customer") action.payload.customer_id = "c2";
        if (mode === "prepare-other-device") action.device_id = "device-two";
        if (mode === "prepare-business") database.exec("UPDATE business SET deleted_at='fixture' WHERE id='b1'");
        const parentIntent = mode === "prepare-currency" ? { ...intent, currency: "USD" } : intent;
        const current = intents.bindCompanionPointsIntent(tx, action, context, parentIntent);
        if (mode === "prepare-grant") grants.revokeAndroidBenefitsSpend(database, owner, "b1", "device-one", "c1");
        if (mode === "prepare-device") database.exec("UPDATE android_devices SET is_active=0 WHERE device_id='device-one'");
        if (mode === "prepare-token") credentials.revokeAndroidLocalCredential(database, "device-one");
        if (mode === "prepare-price") database.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
        const candidate = mode === "prepare-clone" ? { ...prepared } : prepared;
        const allocation = companionPorts.requireCompanionSaleBenefitsSource(tx, action, context, parentIntent, current, candidate);
        const saleInput = { operationId: action.id, settlement: "paid", source: "android-market-sale", customerId: "c1", locationId: "loc",
          paymentMethod: "cash", items: [{ productId: "p1", quantity: 1, expectedUnitPrice: 1000, expectedCurrency: "TRY", expectedUpdatedAt: "fixture" }] };
        const saleOwner = load("market-sale-operation");
        const result = saleOwner.completeMarketSaleInTransaction(database, mode === "prepare-cross-action"
          ? { ...saleInput, operationId: "preparation_cross_action_01" } : saleInput, now, undefined,
        mode === "prepare-source-clone" ? { ...allocation, source: { kind: "sale", id: "sale_forged" } } : allocation);
        assert.equal(result.sale.id, prepared.source.id);
        assert.notEqual(result.sale.id, action.id);
        assert.equal(result.replayed, false);
        assert.equal(database.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1' AND location_id='loc'").get().quantity, 49);
        if (mode === "prepare-source-replay") saleOwner.completeMarketSaleInTransaction(database, saleInput, now, undefined, allocation);
        if (mode === "prepare-double") {
          assert.notEqual(secondPreparation.source.id, prepared.source.id);
          const second = companionPorts.requireCompanionSaleBenefitsSource(tx, action, context, intent, current, secondPreparation);
          saleOwner.completeMarketSaleInTransaction(database, saleInput, now, undefined, second);
        }
        const adapter = companionPorts.companionSaleBenefitsPreparedPorts(tx, action, context, intent, current, prepared);
        assert.deepEqual(adapter.readPaidEvidence(), { source: prepared.source, businessId: "b1", customerId: "c1", currency: "TRY", cashPaidMinor: 100000, pointsTenderMinor: 0 });
        if (mode === "prepare-finance") database.prepare("UPDATE finance_entries SET amount_minor=1 WHERE source_id=?").run(result.sale.id);
        if (mode === "prepare-map") {
          assert.equal(asZeroPointsAction(action, () =>
            originalRoute(database, { ...action, id: "preparation_other_sale_01" }, now, enabled, context)).ok, true);
          const otherId = database.prepare("SELECT sale_id FROM commerce_market_sale_receipts WHERE operation_id='preparation_other_sale_01'").get().sale_id;
          database.prepare("DELETE FROM commerce_market_sale_receipts WHERE operation_id='preparation_other_sale_01'").run();
          database.prepare("UPDATE commerce_market_sale_receipts SET sale_id=? WHERE operation_id=?").run(otherId, action.id);
        }
        adapter.readPaidEvidence();
        const beforeReserve = databaseState(database);
        if (mode === "prepare-reserve") {
          try { adapter.store.reserve(tx, { ...adapter.request, couponCodes: [] }, "c20f_disabled_reserve"); }
          finally { assert.deepEqual(databaseState(database), beforeReserve); }
        }
        assert.equal(asZeroPointsAction(action, () => originalRoute(database, action, now, enabled, context)).ok, true);
        assert.ok(database.prepare("SELECT 1 FROM sync_outbox").get(), "canonical route queues publication in parent");
      }); } catch (error) { preparationError = error.code ?? "UNEXPECTED_PREPARATION_ERROR"; throw error; }
      if (["prepare-commit", "prepare-receipt-rollback"].includes(mode)) return { ok: true, message: "fixture canonical source" };
      throw new Error("C20f fixture rolls back canonical sale, stock, Finance, outbox and receipts");
    }
    if (mode.startsWith("ports")) {
      try { withCommerceBenefitsParentTransaction(database, mode === "ports-stale-expired" ? portsBinding.expiresAtMs
        : mode === "ports-stale-future" ? portsBinding.generatedAtMs - 1 : Date.now(), tx => {
        const currentBinding = mode.startsWith("ports-stale") ? portsBinding
          : intents.bindCompanionPointsIntent(tx, action, context, intent);
        if (mode === "ports-missing-source") {
          const before = databaseState(database);
          try { companionPorts.companionSaleBenefitsReadPorts(tx, action, context, intent, currentBinding); }
          finally { assert.deepEqual(databaseState(database), before); }
          assert.fail("pre-sale source must fail closed; never guess sale_<action hash>");
        }
        if (mode === "ports-parent-blocked") {
          const companion = ingress.requireLocalActionPointsPrincipal(database, action, context, "c1");
          const before = databaseState(database);
          try {
            load("market-sale-operation").completeMarketSaleInTransaction(database, {
              operationId: action.id, settlement: "paid", source: "android-market-sale", customerId: "c1", locationId: "loc",
              paymentMethod: "cash", paymentAmountMinor: 99000,
              items: [{ productId: "p1", quantity: 1, expectedUnitPrice: 1000, expectedCurrency: "TRY", expectedUpdatedAt: "fixture" }],
              // Deliberately untrusted expectation: authorization must reject first.
              benefits: { requestedPointsMinor: 1000, expectedQuote: {} }
            }, new Date(tx.now).toISOString(), { tx, key: secretKey, authority: { actor: companion, keys: f.authority.keys } });
          } finally { assert.deepEqual(databaseState(database), before, "canonical paid parent must reject Companion before writes"); }
          assert.fail("current Desktop benefits adapter cannot accept Companion authority");
        }
        assert.equal(asZeroPointsAction(action, () => originalRoute(database, action, now, enabled, context)).ok, true);
        const beforeFactory = databaseState(database);
        let adapter;
        try { adapter = companionPorts.companionSaleBenefitsReadPorts(tx, action,
          mode === "ports-context-clone" ? { ...context } : context, intent,
          mode === "ports-binding-clone" ? { ...currentBinding } : currentBinding); }
        finally { assert.deepEqual(databaseState(database), beforeFactory, "ports factory is read-only"); }
        if (mode === "ports-create") { portsBinding = currentBinding; savedPorts = adapter; }
        const sourceId = database.prepare("SELECT sale_id FROM commerce_market_sale_receipts WHERE operation_id=?").get(action.id).sale_id;
        assert.equal(adapter.request.source.kind, "sale");
        assert.equal(adapter.request.source.id, sourceId);
        assert.notEqual(sourceId, action.id);
        assert.equal(adapter.request.channel, "companion");
        assert.deepEqual(adapter.authority, { state: "read_only", canReservePoints: false, canConfirmPoints: false });
        if (mode === "ports-revoke") grants.revokeAndroidBenefitsSpend(database, owner, "b1", "device-one", "c1");
        if (mode === "ports-token") credentials.revokeAndroidLocalCredential(database, "device-one");
        if (mode === "ports-device") database.exec("UPDATE android_devices SET is_active=0 WHERE device_id='device-one'");
        if (mode === "ports-permission") database.exec("UPDATE android_devices SET role='staff',permissions_json='[\"market.sale.complete\",\"customer.view\"]' WHERE device_id='device-one'");
        if (mode === "ports-capability") database.exec("UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id='commerce.sales'");
        if (mode === "ports-family") database.exec("UPDATE commerce_benefit_settings SET points_enabled=0 WHERE business_id='b1'");
        if (mode === "ports-current-tenant") database.exec("UPDATE business SET deleted_at='hidden' WHERE id='b1'");
        if (mode === "ports-price") database.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
        if (mode === "ports-rules") database.exec("UPDATE commerce_benefit_settings SET revision=revision+1 WHERE business_id='b1'");
        if (mode === "ports-sale-customer") database.prepare("UPDATE commerce_sales SET customer_id='c2' WHERE id=?").run(sourceId);
        if (mode === "ports-sale-tenant") database.prepare("UPDATE commerce_sales SET business_id='b2',customer_id='c3' WHERE id=?").run(sourceId);
        if (mode === "ports-sale-hash") database.prepare("UPDATE commerce_market_sale_receipts SET request_hash='forged' WHERE operation_id=?").run(action.id);
        if (mode === "ports-sale-map" || mode === "ports-sale-source") {
          const other = { ...action, id: "ports_other_source_01" };
          if (mode === "ports-sale-source") load("market-sale-operation").completeMarketSaleInTransaction(database, {
            operationId: other.id, settlement: "paid", source: "desktop-market-quick-sale", customerId: "c1", locationId: "loc", paymentMethod: "cash",
            items: [{ productId: "p1", quantity: 1, expectedUnitPrice: 1000, expectedCurrency: "TRY", expectedUpdatedAt: "fixture" }]
          }, now);
          else assert.equal(asZeroPointsAction(other, () => originalRoute(database, other, now, enabled, context)).ok, true);
          const otherId = database.prepare("SELECT sale_id FROM commerce_market_sale_receipts WHERE operation_id=?").get(other.id).sale_id;
          database.prepare("DELETE FROM commerce_market_sale_receipts WHERE operation_id=?").run(other.id);
          database.prepare("UPDATE commerce_market_sale_receipts SET sale_id=? WHERE operation_id=?").run(otherId, action.id);
        }
        if (mode === "ports-payment") database.prepare("UPDATE commerce_sales SET payment_method='bank' WHERE id=?").run(sourceId);
        const beforeRead = databaseState(database);
        try {
          const request = portsRequestChange(adapter.request);
          if (mode === "ports-reserve") {
            new (load("commerce-benefits-store").CommerceBenefitsStore)(secretKey, adapter.ports)
              .reserve(tx, { ...request, couponCodes: [] }, "c20e_must_not_reserve");
            assert.fail("read-only ports must block actual reserve before any write");
          } else if (mode === "ports-caught-denial") {
            assert.throws(() => adapter.ports.authorize(database, request, "checkout"),
              error => error.code === "COMPANION_POINTS_RESERVATION_DISABLED");
          } else if (mode === "ports-refund") adapter.ports.authorize(database, request, "refund");
          else if (mode === "ports-adjust") adapter.ports.authorizePointAdjustment(database, "b1", "c1");
          else if (mode === "ports-settlement") adapter.ports.readSettlement(database, request.source);
          else if (mode === "ports-time") adapter.ports.resolvePricing(database, request, tx.now + 1);
          else if (mode === "ports-expired-owner") savedPorts.assertReadAuthorized(database, savedPorts.request);
          else {
            adapter.assertReadAuthorized(database, request);
            const pricing = adapter.ports.resolvePricing(database, request, tx.now);
            assert.equal(pricing.lines[0].unitPriceMinor, action.payload.lines[0].expected_unit_price * 100);
            assert.equal(pricing.lines[0].quantityTenThousandths, 10000);
            assert.equal(pricing.priceGroup, action.payload.lines[0].expected_unit_price === 800 ? "dealer_a" : "retail");
            assert.equal(pricing.channel, "companion");
            assert.deepEqual(pricing.payment, { methodId: action.payload.payment_method, confirmed: false });
            assert.equal(pricing.now, tx.now);
          }
        } finally { assert.deepEqual(databaseState(database), beforeRead, "read/denial/actual reserve attempt must have zero side effects"); }
      }); } catch (error) { lastPortsError = error.code ?? "UNEXPECTED_PORTS_ERROR"; if (error.code === "ERR_ASSERTION") console.error("PORTS ASSERT", mode, error.message); throw error; }
      throw new Error("read-only ports test: roll back all canonical fixture sale writes");
    }
    if (mode.startsWith("intent")) {
      const now = Date.now(), before = databaseState(database);
      try { withCommerceBenefitsParentTransaction(database, mode === "intent-expired" ? binding.expiresAtMs
        : mode === "intent-future" ? binding.generatedAtMs - 1
        : mode === "intent-rule-window" ? binding.generatedAtMs + 15_000 : now, tx => {
        if (mode === "intent-create") {
          binding = intents.bindCompanionPointsIntent(tx, action, context, intent);
          assert.deepEqual(binding.authority, { state: "intent_only", canReservePoints: false, canConfirmPoints: false });
          assert.equal(binding.scope.businessId, "b1");
          assert.equal(binding.scope.deviceId, "device-one");
          assert.equal(binding.scope.lines[0].unitPriceMinor, 100000);
          assert.equal(Object.isFrozen(binding.scope.lines[0]), true);
          const exact = intents.bindCompanionPointsIntent(tx, action, context, intent);
          assert.equal(exact.fingerprint, binding.fingerprint);
          assert.deepEqual(intents.validateCompanionPointsIntent(tx, action, context, intent, binding), binding);
        } else if (mode === "intent-reserve-blocked") {
          const companion = ingress.requireLocalActionPointsPrincipal(database, action, context, "c1");
          const request = { businessId: "b1", customerId: "c1", source: { kind: "sale", id: "future-sale" },
            channel: "companion", currency: "TRY", lines: [{ productId: "p1", quantityTenThousandths: 10000 }],
            paymentMethodId: "cash", requestedPointsMinor: 1000 };
          const ports = load("market-sale-benefits").marketSaleBenefitsPorts(companion, request);
          const store = new (load("commerce-benefits-store").CommerceBenefitsStore)(secretKey, ports);
          store.reserve(tx, { ...request, couponCodes: [] }, "c20d_blocked_reserve");
          assert.fail("a Companion principal must never be promoted to Desktop-owner reserve authority");
        } else if (mode === "intent-exact") {
          assert.equal(intents.validateCompanionPointsIntent(tx, action, context, intent, binding), binding);
        } else if (mode === "intent-new-invalid") {
          intents.bindCompanionPointsIntent(tx, action, context, intentInput);
          assert.fail("invalid binding input must reject");
        } else if (mode === "intent-caught-failure") {
          assert.throws(() => intents.validateCompanionPointsIntent(tx, action, context, { ...intent, requestedPointsMinor: 1001 }, binding));
        } else {
          if (mode === "intent-token-revoked") credentials.revokeAndroidLocalCredential(database, "device-one");
          intents.validateCompanionPointsIntent(tx, action, context, intentInput,
            mode === "intent-clone" ? { ...binding } : mode === "intent-advisory" ? advisoryQuote : binding);
          assert.fail(`${mode} must reject`);
        }
      }); } catch (error) { lastIntentError = error.code; throw error; }
      assert.deepEqual(databaseState(database), before, "intent validation must never write");
      throw new Error("intent-only test: canonical parent must roll back without a sale");
    }
    if (mode === "owner-proof") {
      assert.equal(app.isLocalActionParentTransaction(database, action, context), true,
        "the HTTPS-minted context owns this canonical BEGIN IMMEDIATE");
      assert.equal(app.isLocalActionParentTransaction(database, { ...action }, context), false,
        "a cloned action cannot inherit owner identity");
      assert.equal(app.isLocalActionParentTransaction(database, action, { ...context }), false,
        "a cloned context cannot inherit owner identity");
      denied(() => ingress.requireLocalActionPointsPrincipal(database, { ...action }, context, "c1"));
      denied(() => ingress.requireLocalActionPointsPrincipal(database, action, { ...context }, "c1"));
      // C20p-2c: resolve the live points principal inside this exact owner scope,
      // not only the WeakMap identity above. Reads only until the sentinel.
      const live = ingress.requireLocalActionPointsPrincipal(database, action, context, "c1");
      ownerPrincipal = live;
      const device = database.prepare("SELECT id,authorization_epoch FROM android_devices WHERE device_id='device-one'").get();
      assert.equal(typeof live.businessId, "string");
      assert.equal(live.businessId, "b1", "principal business is the current tenant");
      assert.equal(typeof live.deviceRecordId, "string");
      assert.equal(live.deviceRecordId, String(device.id), "principal device is the current device row");
      assert.equal(live.authorizationEpoch, Number(device.authorization_epoch), "principal epoch is the live device epoch");
      assert.ok(Number.isSafeInteger(live.authorizationEpoch) && live.authorizationEpoch > 0);
      const liveGeneration = grants.readAndroidBenefitsSpendGrantGeneration(database, "b1", "device-one", "c1");
      assert.match(liveGeneration ?? "", /^[a-f0-9]{64}$/);
      assert.equal(live.spendGrantGeneration, liveGeneration, "principal generation is the live owner grant");
      live.assertAuthorized();
      // Distinct negative in the same owner scope: the captured lifetime must die
      // on revoke and stay dead across a same-epoch owner regrant.
      assert.equal(grants.revokeAndroidBenefitsSpend(database, owner, "b1", "device-one", "c1"), true);
      denied(() => live.assertAuthorized());
      denied(() => ingress.requireLocalActionPointsPrincipal(database, action, context, "c1"));
      assert.equal(grants.grantAndroidBenefitsSpend(database, owner, "b1", "device-one", "c1"), true);
      assert.notEqual(grants.readAndroidBenefitsSpendGrantGeneration(database, "b1", "device-one", "c1"), liveGeneration);
      denied(() => live.assertAuthorized());
      ingress.requireLocalActionPointsPrincipal(database, action, context, "c1").assertAuthorized();
      ownerProofProbe++;
      throw new Error("c20p-2c owner-proof sentinel");
    }
    if (mode === "legacy") return originalRoute(database, action, now, enabled, context);
    if (mode === "revoked") credentials.revokeAndroidLocalCredential(database, "device-one");
    principal = ingress.requireLocalActionPointsPrincipal(database, action, context, "c1");
    assert.equal(principal.deviceId, "device-one");
    assert.equal(principal.customerId, "c1");
    assert.equal(JSON.stringify(principal).includes(token), false);
    denied(() => ingress.requireLocalActionPointsPrincipal(database, { ...action }, context, "c1"));
    denied(() => ingress.requireLocalActionPointsPrincipal(database, action, { ...context }, "c1"));
    denied(() => ingress.requireLocalActionPointsPrincipal(database, action, context, "c2"));
    principal.assertAuthorized();
    if (mode === "grant-revoked") {
      grants.revokeAndroidBenefitsSpend(database, owner, "b1", "device-one", "c1");
      principal.assertAuthorized();
    }
    const result = originalRoute(database, action, now, enabled, context);
    assert.equal(result.ok, true, result.message);
    if (mode === "rollback") throw new Error("synthetic failure after canonical sale writes");
    return result;
  };
  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: value => Buffer.from(value), decryptString: value => value.toString() };
  const identity = new (load("local-companion-tls-identity").LocalCompanionTlsIdentity)({ userDataPath: dirname(f.path), safeStorage, platform: "linux", addresses: () => ["127.0.0.1"] });
  const material = await identity.load();
  const keyOwner = new (load("commerce-benefits-key").CommerceBenefitsKey)(dirname(f.path), safeStorage, "linux");
  const protectedKey = keyOwner.load(); // Explicit fixture provisioning only; Companion preparation must never create a key.
  const keyFile = `${dirname(f.path)}/commerce-benefits-key-v1/key.enc`, encryptedKey = readFileSync(keyFile);
  const preparedKeys = { available: () => keyOwner.available(), load(create) {
    assert.equal(db.isTransaction, false, "protected key I/O precedes parent BEGIN");
    assert.equal(create, false, "Companion cannot initialize or rotate an established protected key");
    preparationKeyLoads++; return keyOwner.load(create);
  } };
  const options = { enabled: () => true, authorize: ({ deviceId, token: secret }) => credentials.authorizeAndroidLocalCredential(db, deviceId, secret),
    readAuthorizedSaleReceipt: (action, deviceId, secret) => load("android-action-application-service").readAuthorizedLocalSaleReceipt(db, action, deviceId, secret),
    applyAction: (action, context) => {
      callbacks++; captured = context; boundAction = action;
      assert.equal(JSON.stringify(context ?? {}).includes(token), false);
      if (mode === "owner-proof") assert.equal(app.isLocalActionParentTransaction(db, action, context), false,
        "owner identity requires its own BEGIN IMMEDIATE parent");
      denied(() => ingress.requireLocalActionPointsPrincipal(db, action, context, "c1")); // before BEGIN
      db.exec("BEGIN IMMEDIATE");
      try {
        if (mode === "owner-proof") assert.equal(app.isLocalActionParentTransaction(db, action, context), false,
          "an arbitrary caller transaction cannot borrow owner identity");
        denied(() => ingress.requireLocalActionPointsPrincipal(db, action, context, "c1"));
      }
      finally { db.exec("ROLLBACK"); } // arbitrary caller transaction is insufficient
      if (mode === "callback-throw") throw new Error("synthetic callback failure");
      if (mode === "pre-revoked") credentials.revokeAndroidLocalCredential(db, "device-one");
      if (mode.startsWith("prepare-") || mode.startsWith("presale-") || mode.startsWith("snapshot-") || mode.startsWith("witness-") || mode.startsWith("issuance-") || mode.startsWith("policy-") || mode.startsWith("paid-writer-") || mode.startsWith("cross-writer-")) {
        const before = databaseState(db), writes = db.prepare("SELECT total_changes() n").get().n;
        const preparationIntent = mode === "policy-exceed-payable" ? { ...intent, requestedPointsMinor: 100001 } : intent;
        try {
          prepared = mode === "prepare-reuse" ? savedPreparation
            : companionPorts.prepareCompanionSaleBenefitsSource(db, action, context, preparationIntent, preparedKeys);
          if (mode === "prepare-double") secondPreparation = companionPorts.prepareCompanionSaleBenefitsSource(db, action, context, intent, preparedKeys);
          if (mode === "snapshot-key-source") secondPreparation = companionPorts.prepareCompanionSaleBenefitsSource(db, action, context, intent,
            { ...preparedKeys, load: () => ({ id: "other-key", key: Buffer.alloc(32, 77) }) });
          if (mode.startsWith("issuance-boundary-commerce")) commerceBoundarySource = load("commerce-store").prepareCommerceSaleSource(db);
          savedPreparation = prepared;
          assert.equal(JSON.stringify(prepared).includes("desktop-benefits-v1"), false, "preparation exposes no key");
        } catch (error) {
          preparationError = error.code;
          return { ok: false, message: "fixture preparation denied" };
        } finally {
          assert.deepEqual(databaseState(db), before, "pre-BEGIN preparation writes no SQLite rows");
          assert.equal(db.prepare("SELECT total_changes() n").get().n, writes, "preparation issues no writes even on denial");
        }
      }
      if (["snapshot-worker-before", "snapshot-worker-regrant", "snapshot-worker-reissue"].includes(mode)) {
        // Key/source preflight is complete, canonical parent BEGIN has not run.
        assert.equal(db.isTransaction, false);
        if (mode !== "snapshot-worker-reissue") {
          const revoked = grantWorker.run("revoke");
          assert.equal(revoked.ok && revoked.changed, true); assert.equal(revoked.generation, null);
        }
        if (mode !== "snapshot-worker-before") {
          const granted = grantWorker.run("grant");
          assert.equal(granted.ok && granted.changed, true); workerGeneration = granted.generation;
        }
        concurrentExpectedState = databaseState(db); // Only the worker's committed owner change is allowed.
      }
      // C26 scoped authenticated harness. The production positive-Puan branch owns
      // requestedPointsMinor>0 before the generic router. The synthetic C20d intent
      // scenarios still need the same real HTTPS context and real owner BEGIN, so
      // hide only the positive amount from the preflight; the router restores it on
      // the identical action object before any low-level check. This is fixture-only:
      // production is untouched and its positive sale is covered by
      // scripts/smoke-companion-points-production-path.mjs.
      let harnessPoints;
      if (syntheticLowLevelMode(mode) && Object.prototype.hasOwnProperty.call(action.payload, "requestedPointsMinor")) {
        harnessPoints = action.payload.requestedPointsMinor;
        harnessPositivePoints = harnessPoints;
        delete action.payload.requestedPointsMinor;
      }
      let result;
      try { result = apply(db, action, caps(), context); }
      finally {
        // Keep the normalized action hash identical for the post-apply ACK receipt
        // read; the positive amount existed only inside the mocked low-level router.
        if (harnessPoints !== undefined) delete action.payload.requestedPointsMinor;
        harnessPositivePoints = undefined;
      }
      if (mode === "owner-proof") assert.equal(app.isLocalActionParentTransaction(db, boundAction, captured), false,
        "owner identity ends before the request returns");
      db.exec("BEGIN IMMEDIATE");
      try { denied(() => ingress.requireLocalActionPointsPrincipal(db, action, context, "c1")); }
      finally { db.exec("ROLLBACK"); } // owner scope ended before the request
      return result;
    } };
  const server = new ingress.LocalCompanionServer({ ...options, httpsExperiment: { enabled: true, identity } });
  memoryListener(server);
  const address = await server.start("127.0.0.1", 0);
  const send = (body, headers = {}, target = address, secure = true, path = "/local/v1/action") => new Promise((resolve, reject) => {
    let agent;
    if (memoryTls && secure) {
      agent = new HttpsAgent({ keepAlive: false });
      agent.createConnection = () => tlsConnect({ socket: memoryConnection(target.port), ca: material.certificatePem, host: "127.0.0.1" });
    } else if (memoryTls) {
      agent = new HttpAgent({ keepAlive: false });
      agent.createConnection = () => memoryConnection(target.port);
    }
    const req = (secure ? httpsRequest : httpRequest)({ hostname: "127.0.0.1", port: target.port, path, method: "POST",
      ...(secure ? { ca: material.certificatePem } : {}), ...(agent ? { agent } : {}),
      headers: { "X-YA-Device-Id": "device-one", "X-YA-Local-Token": token, ...headers } }, res => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => { agent?.destroy(); resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }); });
    }); req.on("error", reject); req.end(JSON.stringify(body));
  });
  const action = id => ({ id, action_type: "market_sale_complete", device_id: "device-two", token: otherToken,
    credential: { deviceId: "device-two", token: otherToken }, localContext: { deviceId: "device-two", token: otherToken },
    payload: { lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" }],
      location_id: "loc", settlement: "paid", customer_id: "c1", payment_method: "cash", external_payment_confirmed: false } });
  try {
    // C20d low-level intent/principal scenarios use this scoped authenticated test
    // harness. Production now owns positive Puan end-to-end via the protected owner
    // chain (smoke-companion-points-production-path.mjs); this harness never asserts
    // that production accepts a positive action through the generic router.
    const intentAction = { ...action("intent_binding_test_01"), payload: { ...action("intent_binding_test_01").payload, requestedPointsMinor: 1000 } };
    const beforeAdvisory = databaseState(db);
    advisoryQuote = load("android-point-spend-quote").quoteAndroidPointSpend(db, { deviceId: "device-one", token },
      { customerId: "c1", lines: [{ productId: "p1", quantity: 1 }] });
    assert.ok(advisoryQuote); assert.deepEqual(databaseState(db), beforeAdvisory);
    assert.throws(() => intents.bindCompanionPointsIntent({ database: db, now: Date.now() }, intentAction, undefined, intent),
      error => error.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED");
    assert.throws(() => companionPorts.companionSaleBenefitsReadPorts({ database: db, now: Date.now() }, intentAction, undefined, intent, undefined),
      error => error.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED");
    const beforeArbitrary = databaseState(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      denied(() => withCommerceBenefitsParentTransaction(db, Date.now(), tx =>
        intents.bindCompanionPointsIntent(tx, intentAction, undefined, intent)));
    } finally { db.exec("ROLLBACK"); }
    assert.deepEqual(databaseState(db), beforeArbitrary);
    const runIntent = async (nextMode, body = intentAction, headers = {}) => {
      mode = nextMode; lastIntentError = undefined;
      db.exec("UPDATE android_devices SET last_seen_at='2099-01-01T00:00:00.000Z', updated_at='2099-01-01T00:00:00.000Z'");
      body = { ...body, last_seen_at: "2099-01-01T00:00:00.000Z" };
      const before = databaseState(db), response = await send(body, headers);
      assert.equal(response.body.status, "failed", JSON.stringify(response));
      assert.deepEqual(databaseState(db), before, `${nextMode}: no sale/hold/ledger/Finance/receipt/outbox writes`);
      assert.equal(db.isTransaction, false);
      return lastIntentError;
    };
    assert.equal(await runIntent("intent-create"), undefined);
    assert.equal(await runIntent("intent-exact"), undefined); // fresh HTTPS context, identical intent, no durable receipt
    assert.equal(await runIntent("intent-reserve-blocked"), "BENEFITS_STAFF_REQUIRED");
    assert.equal(await runIntent("intent-advisory"), "COMPANION_POINTS_INTENT_CHANGED");
    for (const invalid of [{ ...intent, version: 2 }, { ...intent, requestedPointsMinor: -1 },
      { ...intent, requestedPointsMinor: 1.5 }, { ...intent, requestedPointsMinor: Number.MAX_SAFE_INTEGER + 1 },
      { ...intent, amount: 1000 }, { ...intent, advisoryQuote: {} }]) {
      intentInput = invalid;
      assert.equal(await runIntent("intent-new-invalid"), "COMPANION_POINTS_INTENT_INVALID");
    }
    intentInput = { ...intent, requestedPointsMinor: 1001 };
    assert.equal(await runIntent("intent-mismatch"), "COMPANION_POINTS_INTENT_CHANGED");
    intentInput = { ...intent, currency: "USD" };
    assert.equal(await runIntent("intent-mismatch"), "COMPANION_POINTS_INTENT_INVALID");
    intentInput = intent;
    assert.equal(await runIntent("intent-clone"), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runIntent("intent-expired"), "COMPANION_POINTS_INTENT_EXPIRED");
    assert.equal(await runIntent("intent-future"), "COMPANION_POINTS_INTENT_EXPIRED");
    assert.equal(await runIntent("intent-caught-failure"), "BENEFITS_TRANSACTION_ABORTED");
    assert.equal(await runIntent("intent-action", { ...intentAction, id: "intent_other_action_01" }), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runIntent("intent-cart", { ...intentAction, payload: { ...intentAction.payload,
      lines: [{ ...intentAction.payload.lines[0], quantity: 2 }] } }), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runIntent("intent-payment", { ...intentAction, payload: { ...intentAction.payload, payment_method: "bank" } }), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runIntent("intent-client-amount", { ...intentAction, payload: { ...intentAction.payload, points_minor: 1000 } }), "COMPANION_POINTS_INTENT_INVALID");
    grants.grantAndroidBenefitsSpend(db, owner, "b1", "device-two", "c1");
    assert.equal(await runIntent("intent-device", intentAction, { "X-YA-Device-Id": "device-two", "X-YA-Local-Token": otherToken }), "COMPANION_POINTS_INTENT_CHANGED");
    grants.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c2");
    assert.equal(await runIntent("intent-customer", { ...intentAction, payload: { ...intentAction.payload, customer_id: "c2" } }), "COMPANION_POINTS_INTENT_CHANGED");
    db.exec("UPDATE catalog_products SET sale_price=1001 WHERE id='p1'");
    assert.equal(await runIntent("intent-price"), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runIntent("intent-price", { ...intentAction, payload: { ...intentAction.payload,
      lines: [{ ...intentAction.payload.lines[0], expected_unit_price: 1001 }] } }), "COMPANION_POINTS_INTENT_CHANGED");
    db.exec("UPDATE catalog_products SET sale_price=1000 WHERE id='p1'; UPDATE commerce_benefit_settings SET revision=revision+1 WHERE business_id='b1'");
    assert.equal(await runIntent("intent-settings"), "COMPANION_POINTS_INTENT_CHANGED");
    db.exec("UPDATE commerce_benefit_settings SET revision=revision-1 WHERE business_id='b1'");
    const { rule, rules } = await import("./test-helpers/commerce-benefits-fixture.mjs");
    // C26: these zero-Puan generic-route fixtures predate the production Companion
    // cash-earn route (C20p-2y) and must stay on the generic router. A redeem rule
    // keeps the canonical rule head/revision under test without making the action a
    // protected cash-earn sale. Production cash earn is owned by
    // scripts/smoke-companion-points-production-path.mjs.
    const c20dRule = overrides => rule("c20d-rule", "points", {
      points: { operation: "redeem", earnBase: "after_points", expiryDays: null }, ...overrides });
    f.transact(tx => rules.saveCommerceBenefitsRule(tx, "b1", c20dRule()));
    assert.equal(await runIntent("intent-rule"), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runIntent("intent-create"), undefined); // new revision needs a fresh non-authorizing intent
    f.transact(tx => rules.saveCommerceBenefitsRule(tx, "b1", c20dRule({ version: 2, startsAt: Date.now() + 10_000 })));
    assert.equal(await runIntent("intent-rule-head"), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runIntent("intent-create"), undefined);
    assert.equal(await runIntent("intent-rule-window"), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runIntent("intent-token-revoked"), "COMPANION_POINTS_DENIED");
    grants.revokeAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    assert.equal(await runIntent("intent-grant"), "COMPANION_POINTS_DENIED");
    grants.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    db.exec("UPDATE android_devices SET authorization_epoch=authorization_epoch+1 WHERE device_id='device-one'");
    grants.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    assert.equal(await runIntent("intent-epoch"), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runIntent("intent-create"), undefined);
    // A fully authorized second tenant still cannot reuse the binding.
    for (const cap of ["service.android", "retail.barcode", "commerce.inventory"])
      db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b2',?,'fixture','fixture')").run(cap);
    db.exec("INSERT INTO catalog_products(id,business_id,category_id,name,sale_price,currency,created_at,updated_at) VALUES ('p2','b2','category1','Other',1000,'TRY','fixture','fixture'); UPDATE business SET deleted_at='hidden' WHERE id='b1'");
    grants.grantAndroidBenefitsSpend(db, owner, "b2", "device-one", "c3");
    assert.equal(await runIntent("intent-tenant", { ...intentAction, payload: { ...intentAction.payload, customer_id: "c3",
      lines: [{ ...intentAction.payload.lines[0], product_id: "p2" }] } }), "COMPANION_POINTS_INTENT_CHANGED");
    db.exec("UPDATE business SET deleted_at='' WHERE id='b1'");
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_reservations").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_holds").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger").get().n, 0);
    // The window-change assertion is finished. Publish a stable canonical head
    // so its unrelated real-time +10s start cannot expire later worker quotes.
    // Still redeem, never earn (see C26 note above).
    f.transact(tx => rules.saveCommerceBenefitsRule(tx, "b1", c20dRule({ version: 3, startsAt: 0 })));
    console.log("PASS C20d intent-only binding: exact repeat, stale/cart/rules/expiry, tenant/device isolation, revocation and Desktop-owner blocker; zero writes");
    const portsAction = { ...action("ports_binding_test_01"), payload: { ...action("ports_binding_test_01").payload, requestedPointsMinor: 1000 } };
    const runPorts = async (nextMode, body = portsAction, headers = {}) => {
      mode = nextMode; lastPortsError = undefined;
      db.exec("UPDATE android_devices SET last_seen_at='2099-01-01T00:00:00.000Z', updated_at='2099-01-01T00:00:00.000Z'");
      const before = databaseState(db), response = await send({ ...body, last_seen_at: "2099-01-01T00:00:00.000Z" }, headers);
      assert.equal(response.body.status, "failed", JSON.stringify(response));
      assert.deepEqual(databaseState(db), before, `${nextMode}: parent rolls back sale/stock/Finance/outbox/receipts too`);
      assert.equal(db.isTransaction, false);
      return lastPortsError;
    };
    assert.equal(await runPorts("ports-missing-source"), "COMPANION_POINTS_SOURCE_REQUIRED");
    assert.equal(await runPorts("ports-parent-blocked"), "BENEFITS_STAFF_REQUIRED");
    assert.equal(await runPorts("ports-create"), undefined);
    assert.equal(await runPorts("ports-binding-clone"), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runPorts("ports-context-clone"), "COMPANION_POINTS_DENIED");
    assert.equal(await runPorts("ports-caller-source", { ...portsAction, payload: { ...portsAction.payload, source_sale_id: "sale_forged" } }),
      "COMPANION_POINTS_INTENT_INVALID");
    for (const change of [request => ({ ...request, source: { kind: "sale", id: portsAction.id } }),
      request => ({ ...request, source: { kind: "sale", id: "sale_forged" } }),
      request => ({ ...request, source: { kind: "commerce_order", id: request.source.id } }),
      request => ({ ...request, businessId: "b2" }), request => ({ ...request, customerId: "c2" }),
      request => ({ ...request, channel: "desktop_cart" }), request => ({ ...request, paymentMethodId: "bank" }),
      request => ({ ...request, totalMinor: 1 }), request => ({ ...request, quote: { payableMinor: 1 } }),
      request => ({ ...request, lines: [{ ...request.lines[0], unitPriceMinor: 1 }] })]) {
      portsRequestChange = change;
      assert.equal(await runPorts("ports-request"), "COMPANION_POINTS_SOURCE_SCOPE");
    }
    portsRequestChange = request => request;
    for (const nextMode of ["ports-reserve", "ports-refund", "ports-adjust", "ports-settlement"])
      assert.equal(await runPorts(nextMode), "COMPANION_POINTS_RESERVATION_DISABLED");
    assert.equal(await runPorts("ports-caught-denial"), "BENEFITS_TRANSACTION_ABORTED");
    for (const nextMode of ["ports-revoke", "ports-token", "ports-device", "ports-permission", "ports-capability", "ports-family", "ports-current-tenant"])
      assert.equal(await runPorts(nextMode), "COMPANION_POINTS_DENIED");
    for (const nextMode of ["ports-price", "ports-rules"])
      assert.equal(await runPorts(nextMode), "COMPANION_POINTS_INTENT_CHANGED");
    for (const nextMode of ["ports-sale-source", "ports-sale-customer", "ports-sale-tenant", "ports-sale-hash", "ports-sale-map", "ports-payment", "ports-time"])
      assert.equal(await runPorts(nextMode), "COMPANION_POINTS_SOURCE_SCOPE", nextMode);
    assert.equal(await runPorts("ports-expired-owner"), "BENEFITS_PARENT_TRANSACTION_REQUIRED");
    assert.equal(await runPorts("ports-stale-expired"), "COMPANION_POINTS_INTENT_EXPIRED");
    assert.equal(await runPorts("ports-stale-future"), "COMPANION_POINTS_INTENT_EXPIRED");
    assert.equal(await runPorts("ports-stale-action", { ...portsAction, id: "ports_other_action_01" }), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(await runPorts("ports-stale-device", portsAction, { "X-YA-Device-Id": "device-two", "X-YA-Local-Token": otherToken }), "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal(grants.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c2"), true);
    assert.equal(await runPorts("ports-stale-customer", { ...portsAction, payload: { ...portsAction.payload, customer_id: "c2" } }), "COMPANION_POINTS_INTENT_CHANGED");
    db.exec("INSERT INTO customer_commercial_profiles(business_id,customer_id,company_name,dealer_status,price_group,created_at,updated_at) VALUES ('b1','c1','Fixture','active','dealer_a','fixture','fixture'); INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','commerce.wholesale','fixture','fixture')");
    const dealerAction = { ...portsAction, payload: { ...portsAction.payload, lines: [{ ...portsAction.payload.lines[0], expected_unit_price: 800 }] } };
    assert.equal(await runPorts("ports-dealer", dealerAction), undefined);
    db.exec("DELETE FROM customer_commercial_profiles WHERE business_id='b1' AND customer_id='c1'; DELETE FROM business_capabilities WHERE business_id='b1' AND capability_id='commerce.wholesale'");
    for (const table of ["commerce_benefit_reservations", "commerce_benefit_point_holds", "commerce_benefit_point_ledger"])
      assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    assert.equal(f.state.keyLoads, 0, "read ports and denied paid parent never load/create a protected key inside BEGIN");
    console.log("PASS C20e read-only Companion ports: real canonical sale mapping/prices, source/quote tampering, live revocation and disabled reserve; zero writes");
    const preparationAction = { ...action("preparation_binding_test_01"), payload: { ...action("preparation_binding_test_01").payload, requestedPointsMinor: 1000 } };
    const runPreparation = async (nextMode, body = preparationAction, expectedStatus = "failed") => {
      mode = nextMode; preparationError = undefined;
      db.exec("UPDATE android_devices SET last_seen_at='2099-01-01T00:00:00.000Z', updated_at='2099-01-01T00:00:00.000Z'");
      const before = databaseState(db), response = await send({ ...body, last_seen_at: "2099-01-01T00:00:00.000Z" });
      assert.equal(response.body.status, expectedStatus, `${nextMode}: ${JSON.stringify(response)} error=${preparationError}`);
      if (expectedStatus === "failed") assert.deepEqual(databaseState(db), before, `${nextMode}: full parent rollback`);
      assert.equal(db.isTransaction, false);
      return { error: preparationError, response };
    };
    assert.equal((await runPreparation("prepare-read")).error, undefined);
    assert.equal((await runPreparation("prepare-reuse", { ...preparationAction, id: "preparation_other_action_01" })).error, "COMPANION_POINTS_SOURCE_SCOPE");
    for (const nextMode of ["prepare-clone", "prepare-source-clone", "prepare-source-replay", "prepare-cross-action", "prepare-map", "prepare-action", "prepare-customer", "prepare-double"])
      assert.equal((await runPreparation(nextMode)).error, "COMPANION_POINTS_SOURCE_SCOPE", nextMode);
    assert.equal((await runPreparation("prepare-finance")).error, "COMPANION_POINTS_PAID_EVIDENCE_REQUIRED");
    assert.equal((await runPreparation("prepare-expired")).error, "COMPANION_POINTS_INTENT_EXPIRED");
    for (const nextMode of ["prepare-grant", "prepare-device", "prepare-token", "prepare-other-device", "prepare-business"])
      assert.equal((await runPreparation(nextMode)).error, "COMPANION_POINTS_DENIED", nextMode);
    assert.equal((await runPreparation("prepare-currency")).error, "COMPANION_POINTS_INTENT_INVALID");
    assert.equal((await runPreparation("prepare-price")).error, "COMPANION_POINTS_INTENT_CHANGED");
    assert.equal((await runPreparation("prepare-reserve")).error, "COMPANION_POINTS_RESERVATION_DISABLED");
    const loadsBeforeDeny = preparationKeyLoads;
    grants.revokeAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    assert.equal((await runPreparation("prepare-no-grant")).error, "COMPANION_POINTS_DENIED");
    assert.equal(preparationKeyLoads, loadsBeforeDeny, "unauthorized preflight never touches protected key");
    grants.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    writeFileSync(keyFile, "corrupt");
    try { assert.equal((await runPreparation("prepare-key-corrupt")).error, "BENEFITS_SECURE_STORAGE_UNAVAILABLE"); }
    finally { writeFileSync(keyFile, encryptedKey); }
    renameSync(keyFile, `${keyFile}.fixture`);
    try { assert.equal((await runPreparation("prepare-key-missing")).error, "BENEFITS_SECURE_STORAGE_UNAVAILABLE"); }
    finally { renameSync(`${keyFile}.fixture`, keyFile); }
    db.exec("CREATE TEMP TRIGGER c20f_receipt_failure BEFORE INSERT ON android_market_sale_result_receipts BEGIN SELECT RAISE(ABORT,'fixture receipt rollback'); END");
    try { assert.equal((await runPreparation("prepare-receipt-rollback")).error, undefined); }
    finally { db.exec("DROP TRIGGER c20f_receipt_failure"); }
    const preparedCommit = await runPreparation("prepare-commit", preparationAction, "applied");
    assert.equal(preparedCommit.response.body.sale_receipt.saleId, prepared.source.id);
    assert.equal(preparedCommit.response.body.sale_receipt.pointsTenderMinor, 0);
    assert.equal((await runPreparation("prepare-committed-replay")).error, "COMPANION_POINTS_SOURCE_ALREADY_APPLIED");
    mode = "legacy";
    // The legacy replay keeps the exact committed request: the positive amount was
    // never part of that action's stored intent hash (it is hidden from the
    // production preflight), so omit the key rather than send an explicit zero.
    const preparedReplayBody = { ...preparationAction, payload: { ...preparationAction.payload } };
    delete preparedReplayBody.payload.requestedPointsMinor;
    const preparedReplay = await send(preparedReplayBody);
    assert.equal(preparedReplay.body.status, "applied");
    assert.equal(preparedReplay.body.already_applied, true);
    assert.deepEqual(preparedReplay.body.sale_receipt, preparedCommit.response.body.sale_receipt);
    for (const table of ["commerce_benefit_reservations", "commerce_benefit_point_holds", "commerce_benefit_point_ledger"])
      assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    console.log("PASS C20f pre-BEGIN protected key/source: canonical paid sale + Finance, no cross-action/replay mapping, receipt rollback; reserve disabled");
    // The earlier C20d rule only tests rule revision invalidation. Disable its
    // zero-value redeem head before C20g previews so the genuine c20g_redeem
    // rule owns the 1000-minor hypothetical points tender.
    f.transact(tx => rules.saveCommerceBenefitsRule(tx, "b1", c20dRule({ version: 4, status: "disabled", startsAt: 0 })));
    const preSaleAction = { ...action("presale_binding_test_01"), payload: { ...action("presale_binding_test_01").payload, requestedPointsMinor: 1000 } };
    const runPreSale = async (nextMode, body = preSaleAction, headers = {}) => {
      mode = nextMode; preSaleError = undefined; preparationError = undefined; concurrentExpectedState = undefined;
      db.exec("UPDATE android_devices SET last_seen_at='2099-01-01T00:00:00.000Z', updated_at='2099-01-01T00:00:00.000Z'");
      const before = databaseState(db), response = await send({ ...body, last_seen_at: "2099-01-01T00:00:00.000Z" }, headers);
      preSaleResponse = response;
      assert.equal(response.body.status, "failed", JSON.stringify(response));
      assert.deepEqual(databaseState(db), concurrentExpectedState ?? before, `${nextMode}: entire parent rollback; only committed worker grant changes survive`);
      assert.equal(db.isTransaction, false);
      return preSaleError ?? preparationError;
    };
    assert.equal(await runPreSale("presale-read"), undefined);
    for (const method of ["bank", "card", "other"])
      assert.equal(await runPreSale(`presale-method-${method}`, { ...preSaleAction, payload: { ...preSaleAction.payload,
        payment_method: method, external_payment_confirmed: method === "card" } }), undefined);
    assert.equal(await runPreSale("presale-card-unconfirmed", { ...preSaleAction, payload: { ...preSaleAction.payload,
      payment_method: "card", external_payment_confirmed: false } }), "COMPANION_POINTS_SOURCE_SCOPE");
    assert.equal(await runPreSale("presale-regrant"), "COMPANION_POINTS_INTENT_CHANGED", "same epoch regrant rejects old binding");
    for (const [nextMode, code] of [
      ["preparation", "COMPANION_POINTS_SOURCE_SCOPE"], ["binding", "COMPANION_POINTS_INTENT_CHANGED"],
      ["context", "COMPANION_POINTS_DENIED"], ["grant", "COMPANION_POINTS_DENIED"], ["epoch", "COMPANION_POINTS_INTENT_CHANGED"],
      ["token", "COMPANION_POINTS_DENIED"], ["device", "COMPANION_POINTS_DENIED"],
      ["other-device", "COMPANION_POINTS_DENIED"], ["family", "COMPANION_POINTS_DENIED"], ["business", "COMPANION_POINTS_DENIED"],
      ["customer", "COMPANION_POINTS_INTENT_CHANGED"], ["operation", "COMPANION_POINTS_INTENT_CHANGED"],
      ["price", "COMPANION_POINTS_INTENT_CHANGED"], ["rules", "COMPANION_POINTS_INTENT_CHANGED"],
      ["payment", "COMPANION_POINTS_INTENT_CHANGED"], ["currency", "COMPANION_POINTS_INTENT_CHANGED"],
      ["expiry", "COMPANION_POINTS_INTENT_EXPIRED"], ["future", "COMPANION_POINTS_INTENT_EXPIRED"],
      ["time", "COMPANION_POINTS_SOURCE_SCOPE"], ["owner", "BENEFITS_PARENT_TRANSACTION_REQUIRED"],
      ["no-balance", "BENEFITS_POINTS_INSUFFICIENT"], ["balance-changed", "BENEFITS_POINTS_INSUFFICIENT"], ["expired-balance", "BENEFITS_POINTS_INSUFFICIENT"],
      ["rule-channel", "BENEFITS_POINTS_UNAVAILABLE"], ["rule-product", "BENEFITS_POINTS_INSUFFICIENT"],
      ["fault", "FIXTURE_READ_FAULT"], ["consumed", "COMPANION_POINTS_SOURCE_SCOPE"],
      ["reserve", "COMPANION_POINTS_RESERVATION_DISABLED"], ["adjust", "COMPANION_POINTS_RESERVATION_DISABLED"],
      ["settle", "COMPANION_POINTS_RESERVATION_DISABLED"], ["release", "COMPANION_POINTS_RESERVATION_DISABLED"],
      ["reverse", "COMPANION_POINTS_RESERVATION_DISABLED"], ["expire", "COMPANION_POINTS_RESERVATION_DISABLED"],
      ["checkout-preview", "COMPANION_POINTS_RESERVATION_DISABLED"], ["no-read-port", "BENEFITS_READ_AUTHORIZATION_REQUIRED"],
      ["refund", "COMPANION_POINTS_RESERVATION_DISABLED"], ["settlement", "COMPANION_POINTS_RESERVATION_DISABLED"],
      ["caught", "BENEFITS_TRANSACTION_ABORTED"]])
      assert.equal(await runPreSale(`presale-${nextMode}`), code, nextMode);
    for (const change of [request => ({ ...request, source: { kind: "sale", id: "sale_forged" } }),
      request => ({ ...request, source: { kind: "sale", id: preSaleAction.id } }),
      request => ({ ...request, businessId: "b2" }), request => ({ ...request, customerId: "c2" }),
      request => ({ ...request, currency: "USD" }), request => ({ ...request, channel: "desktop_cart" }),
      request => ({ ...request, paymentMethodId: "bank" }), request => ({ ...request, requestedPointsMinor: 1 }),
      request => ({ ...request, totalMinor: 1 }), request => ({ ...request, quote: { payableMinor: 1 } }),
      request => ({ ...request, lines: [{ ...request.lines[0], unitPriceMinor: 1 }] })]) {
      preSaleRequestChange = change;
      assert.equal(await runPreSale("presale-request"), "COMPANION_POINTS_SOURCE_SCOPE");
    }
    preSaleRequestChange = request => request;
    db.exec("INSERT INTO customer_commercial_profiles(business_id,customer_id,company_name,dealer_status,price_group,created_at,updated_at) VALUES ('b1','c1','Fixture','active','dealer_a','fixture','fixture'); INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','commerce.wholesale','fixture','fixture')");
    const preSaleDealer = price => ({ ...preSaleAction, payload: { ...preSaleAction.payload,
      lines: [{ ...preSaleAction.payload.lines[0], expected_unit_price: price }] } });
    assert.equal(await runPreSale("presale-dealer-a", preSaleDealer(800)), undefined);
    db.exec("UPDATE customer_commercial_profiles SET price_group='dealer_b'; UPDATE catalog_products SET dealer_price_b=700 WHERE id='p1'");
    assert.equal(await runPreSale("presale-dealer-b", preSaleDealer(700)), undefined);
    db.exec("UPDATE catalog_products SET dealer_price_b=NULL WHERE id='p1'");
    assert.equal(await runPreSale("presale-dealer-fallback"), undefined);
    db.exec("UPDATE customer_commercial_profiles SET price_group='dealer_a'; UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id='commerce.wholesale'");
    assert.equal(await runPreSale("presale-wholesale-disabled"), undefined);
    db.exec("DELETE FROM customer_commercial_profiles WHERE business_id='b1' AND customer_id='c1'; DELETE FROM business_capabilities WHERE business_id='b1' AND capability_id='commerce.wholesale'");
    for (const table of ["commerce_benefit_reservations", "commerce_benefit_point_holds", "commerce_benefit_point_ledger"])
      assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    console.log("PASS C20g pre-sale advisory ports: canonical retail/dealer prices, live rules/balance, scope/staleness/fault and disabled mutations; zero reader writes");
    assert.equal(await runPreSale("witness-read"), undefined);
    assert.throws(() => companionPorts.revalidateCompanionSaleBenefitsReservation(reservationSaved.tx, reservationSaved.action,
      reservationSaved.context, intent, reservationSaved.binding, reservationSaved.prepared, reservationSaved.handle),
    e => e.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED", "rolled-back witness cannot leave its parent");
    for (const [suffix, code] of [
      ["absent", "BENEFITS_RESERVATION_REQUIRED"], ["forged-id", "BENEFITS_RESERVATION_REQUIRED"],
      ["fake-row", "BENEFITS_RESERVATION_RECEIPT_REQUIRED"], ["foreign-business", "BENEFITS_RESERVATION_REQUIRED"],
      ["foreign-customer", "BENEFITS_RESERVATION_SCOPE"], ["foreign-source", "BENEFITS_RESERVATION_SCOPE"],
      ["foreign-source-kind", "BENEFITS_RESERVATION_SCOPE"],
      ["foreign-currency", "BENEFITS_RESERVATION_SCOPE"], ["foreign-intent", "BENEFITS_RESERVATION_SCOPE"],
      ["operation-key", "BENEFITS_RESERVATION_RECEIPT_REQUIRED"], ["operation-kind", "BENEFITS_IDEMPOTENCY_INTENT_CHANGED"],
      ["other-key", "BENEFITS_IDEMPOTENCY_INTENT_CHANGED"],
      ["released", "BENEFITS_RESERVATION_EXPIRED"], ["settled", "BENEFITS_RESERVATION_EXPIRED"],
      ["reversed", "BENEFITS_RESERVATION_EXPIRED"], ["reused-id", "BENEFITS_RESERVATION_EXPIRED"],
      ["revoke", "COMPANION_POINTS_DENIED"], ["regrant", "COMPANION_POINTS_INTENT_CHANGED"],
      ["reissue", "COMPANION_POINTS_INTENT_CHANGED"], ["price", "COMPANION_POINTS_INTENT_CHANGED"],
      ["rule", "COMPANION_POINTS_INTENT_CHANGED"], ["quote", undefined], ["receipt-expiry", undefined],
      ["reference-quote", "BENEFITS_RESERVATION_REQUIRED"], ["reference-expiry", "BENEFITS_RESERVATION_REQUIRED"],
      ["business", "COMPANION_POINTS_DENIED"],
      ["payload-capture", "COMPANION_POINTS_INTENT_INVALID"], ["input-capture", "COMPANION_POINTS_INTENT_INVALID"],
      ["expiry-before", undefined], ["expiry-boundary", "COMPANION_POINTS_RESERVATION_EXPIRED"],
      ["expiry-after", "COMPANION_POINTS_RESERVATION_EXPIRED"], ["expiry-during-read", "COMPANION_POINTS_RESERVATION_EXPIRED"],
      ["clock-back", "COMPANION_POINTS_RESERVATION_EXPIRED"], ["fault", "FIXTURE_READ_FAULT"],
      ["clone", "COMPANION_POINTS_RESERVATION_SCOPE"], ["json", "COMPANION_POINTS_RESERVATION_SCOPE"],
      ["advisory", "COMPANION_POINTS_RESERVATION_SCOPE"], ["tampered", "COMPANION_POINTS_RESERVATION_SCOPE"],
      ["parent-clone", "BENEFITS_PARENT_TRANSACTION_REQUIRED"], ["action-clone", "COMPANION_POINTS_RESERVATION_SCOPE"],
      ["context", "COMPANION_POINTS_RESERVATION_SCOPE"], ["device", "COMPANION_POINTS_RESERVATION_SCOPE"],
      ["action", "COMPANION_POINTS_RESERVATION_SCOPE"], ["customer", "COMPANION_POINTS_RESERVATION_SCOPE"],
      ["intent", "COMPANION_POINTS_RESERVATION_SCOPE"], ["currency", "COMPANION_POINTS_RESERVATION_SCOPE"],
      ["payload", "COMPANION_POINTS_RESERVATION_SCOPE"], ["archived", "COMPANION_POINTS_RESERVATION_SCOPE"],
      ["db", "COMPANION_POINTS_RESERVATION_SCOPE"], ["worker", undefined],
      ["caught", "BENEFITS_TRANSACTION_ABORTED"], ["next-parent", "COMPANION_POINTS_RESERVATION_SCOPE"],
      ["reserve-disabled", "COMPANION_POINTS_RESERVATION_DISABLED"], ["settle-disabled", "COMPANION_POINTS_RESERVATION_DISABLED"]
    ]) assert.equal(await runPreSale(`witness-${suffix}`), code, `witness-${suffix}`);
    console.log("PASS C20j canonical reservation witness: real reserve/ledger fixtures, live same-parent scope/receipt/quote/status/expiry, grant lifetime and competing writer; zero reader writes and full rollback");
    assert.equal(await runPreSale("issuance-read"), undefined);
    assert.throws(() => companionPorts.revalidateCompanionSaleBenefitsIssuedReservation(reservationSaved.issued.tx,
      reservationSaved.issued.action, reservationSaved.issued.context, intent, reservationSaved.issued.binding,
      reservationSaved.issued.prepared, reservationSaved.issued.handle), e => e.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED");
    for (const [suffix, code] of [
      ["unissued", "COMPANION_POINTS_ISSUANCE_REQUIRED"], ["forged-handle", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["before-forged-gate", "BENEFITS_RESERVATION_ISSUANCE_SCOPE"], ["before-operation", "BENEFITS_RESERVATION_ISSUANCE_SCOPE"],
      ["before-source", "BENEFITS_RESERVATION_ISSUANCE_SCOPE"], ["before-source-kind", "BENEFITS_RESERVATION_ISSUANCE_SCOPE"],
      ["before-revoke", "COMPANION_POINTS_DENIED"], ["before-regrant", "COMPANION_POINTS_INTENT_CHANGED"],
      ["before-reissue", "COMPANION_POINTS_INTENT_CHANGED"], ["before-epoch", "COMPANION_POINTS_DENIED"],
      ["before-price", "COMPANION_POINTS_INTENT_CHANGED"], ["before-rule", "COMPANION_POINTS_INTENT_CHANGED"],
      ["before-business", "ERR_ASSERTION"], ["before-customer", "COMPANION_POINTS_QUOTE_SCOPE"],
      ["before-device", "COMPANION_POINTS_QUOTE_SCOPE"], ["before-action", "COMPANION_POINTS_QUOTE_SCOPE"],
      ["before-context", "COMPANION_POINTS_ISSUANCE_SCOPE"], ["before-currency", "BENEFITS_RESERVATION_ISSUANCE_SCOPE"],
      ["before-intent", "BENEFITS_RESERVATION_ISSUANCE_SCOPE"], ["before-quote", "COMPANION_POINTS_QUOTE_CHANGED"], ["before-insufficient", "BENEFITS_POINTS_INSUFFICIENT"],
      ["before-parent-pricing", "BENEFITS_QUOTE_CHANGED"],
      ["before-expiry", "COMPANION_POINTS_QUOTE_EXPIRED"],
      ["without-gate", "BENEFITS_RESERVATION_ISSUANCE_REQUIRED"], ["late-gate", "BENEFITS_RESERVATION_ISSUANCE_REQUIRED"],
      ["replay", "BENEFITS_RESERVATION_ISSUANCE_REQUIRED"], ["replay-gate", "BENEFITS_RESERVATION_ISSUANCE_REPLAY"],
      ["receipt-clone", "BENEFITS_RESERVATION_ISSUANCE_REQUIRED"], ["receipt-json", "BENEFITS_RESERVATION_ISSUANCE_REQUIRED"],
      ["receipt-tampered", "BENEFITS_RESERVATION_ISSUANCE_REQUIRED"], ["witness-as-issuance", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["capture-regrant", "COMPANION_POINTS_INTENT_CHANGED"],
      ["after-revoke", "COMPANION_POINTS_DENIED"], ["after-regrant", "COMPANION_POINTS_INTENT_CHANGED"],
      ["after-reissue", "COMPANION_POINTS_INTENT_CHANGED"], ["after-epoch", "COMPANION_POINTS_DENIED"],
      ["after-price", "COMPANION_POINTS_INTENT_CHANGED"], ["after-rule", "COMPANION_POINTS_INTENT_CHANGED"],
      ["after-business", "COMPANION_POINTS_DENIED"], ["after-customer", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["after-device", "COMPANION_POINTS_ISSUANCE_SCOPE"], ["after-action", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["after-currency", "COMPANION_POINTS_ISSUANCE_SCOPE"], ["after-intent", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["released", "BENEFITS_RESERVATION_EXPIRED"], ["settled", "BENEFITS_RESERVATION_EXPIRED"],
      ["reversed", "BENEFITS_RESERVATION_EXPIRED"], ["replay-released", "BENEFITS_RESERVATION_EXPIRED"],
      ["expired", "BENEFITS_RESERVATION_EXPIRED"], ["expiry", "COMPANION_POINTS_RESERVATION_EXPIRED"],
      ["clock-back", "COMPANION_POINTS_RESERVATION_EXPIRED"], ["worker", undefined],
      ["capture-twice", "COMPANION_POINTS_ISSUANCE_ALREADY_CAPTURED"], ["gate-twice", "BENEFITS_RESERVATION_ISSUANCE_SCOPE"],
      ["clone", "COMPANION_POINTS_ISSUANCE_SCOPE"], ["json", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["context", "COMPANION_POINTS_ISSUANCE_SCOPE"], ["action-clone", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["parent-clone", "BENEFITS_PARENT_TRANSACTION_REQUIRED"], ["db", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["archived", "COMPANION_POINTS_ISSUANCE_SCOPE"], ["next-parent", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["caught", "BENEFITS_TRANSACTION_ABORTED"], ["fault-caught", "BENEFITS_TRANSACTION_ABORTED"], ["reserve-disabled", "COMPANION_POINTS_RESERVATION_DISABLED"],
      ["settle-disabled", "COMPANION_POINTS_RESERVATION_DISABLED"], ["release-disabled", "COMPANION_POINTS_RESERVATION_DISABLED"],
      ["reverse-disabled", "COMPANION_POINTS_RESERVATION_DISABLED"], ["refund-disabled", "COMPANION_POINTS_RESERVATION_DISABLED"],
      ["expire-disabled", "COMPANION_POINTS_RESERVATION_DISABLED"], ["adjust-disabled", "COMPANION_POINTS_RESERVATION_DISABLED"]
    ]) assert.equal(await runPreSale(`issuance-${suffix}`), code, `issuance-${suffix}`);
    console.log("PASS C20k same-parent issuance: pre-reserve live grant/quote gate, fresh canonical owner receipt only, no replay/adoption, current reservation and disabled mutations; zero reader writes/full rollback");
    assert.equal(await runPreSale("issuance-owner-principal"), undefined);
    assert.equal(await runPreSale("issuance-owner-authorize-denied"), "COMPANION_POINTS_RESERVATION_DISABLED");
    console.log("PASS C20p-2d live owner principal + C20k issuance share the real BEGIN IMMEDIATE: current grant/epoch/quote, clones deny, terminal Companion authorize denial");
    assert.equal(await runPreSale("policy-allow"), undefined);
    const policySaved = reservationSaved.policy;
    assert.throws(() => companionPorts.evaluateCompanionSaleBenefitsPolicy(policySaved.tx, policySaved.action,
      policySaved.context, policySaved.input, policySaved.binding, policySaved.prepared, policySaved.handle),
    e => e.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED", "policy decision cannot leave the HTTP owner parent");
    for (const [suffix, code] of [
      // Altering the server intent without the bound Android action amount is
      // rejected at the earlier exact-intent boundary (before affordability).
      ["policy-exceed-payable", "COMPANION_POINTS_INTENT_CHANGED"],
      ["policy-exceed-balance", "BENEFITS_POINTS_INSUFFICIENT"],
      ["policy-stale-quote", "COMPANION_POINTS_INTENT_CHANGED"],
      ["policy-stale-rule", "COMPANION_POINTS_INTENT_CHANGED"],
      ["policy-revoke", "COMPANION_POINTS_DENIED"],
      ["policy-reissue", "COMPANION_POINTS_POLICY_SCOPE"],
      ["policy-epoch", "COMPANION_POINTS_DENIED"],
      ["policy-action", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["policy-payload", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["policy-context", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["policy-action-clone", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["policy-prepared-clone", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["policy-handle-clone", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["policy-parent-clone", "BENEFITS_PARENT_TRANSACTION_REQUIRED"],
      ["policy-db", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["policy-store-reserve-denied", "COMPANION_POINTS_RESERVATION_DISABLED"]
    ]) assert.equal(await runPreSale(suffix), code, suffix);
    console.log("PASS C20p-2f server-only per-sale points policy: live owner/principal/grant + exact C20k issuance/quote allow preflight with no Store authority; payable/balance/stale/revoke/clone/parent/db denials and terminal Store reserve deny");
    assert.equal(await runPreSale("policy-prewrite-consume"), "COMPANION_POINTS_PREWRITE_CONSUMED");
    const prewrite = reservationSaved.prewrite;
    assert.throws(() => companionPorts.consumeCompanionSaleBenefitsPrewriteDecision(prewrite.tx, prewrite.action,
      prewrite.context, prewrite.input, prewrite.binding, prewrite.prepared, prewrite.handle, prewrite.decision),
    e => e.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED", "prewrite decision cannot be consumed after the HTTP parent ends");
    assert.equal(await runPreSale("policy-prewrite-store-reserve-denied"), "COMPANION_POINTS_RESERVATION_DISABLED");
    assert.equal(await runPreSale("policy-prewrite-poisoned"), "BENEFITS_TRANSACTION_ABORTED");
    for (const [suffix, code] of [
      ["policy-prewrite-clone", "COMPANION_POINTS_PREWRITE_SCOPE"],
      ["policy-prewrite-json", "COMPANION_POINTS_PREWRITE_SCOPE"],
      ["policy-prewrite-handle-clone", "COMPANION_POINTS_PREWRITE_SCOPE"],
      ["policy-prewrite-action-clone", "COMPANION_POINTS_PREWRITE_SCOPE"],
      ["policy-prewrite-parent-clone", "BENEFITS_PARENT_TRANSACTION_REQUIRED"],
      ["policy-prewrite-db", "COMPANION_POINTS_PREWRITE_SCOPE"],
      ["policy-prewrite-stale-quote", "COMPANION_POINTS_INTENT_CHANGED"],
      ["policy-prewrite-stale-rule", "COMPANION_POINTS_INTENT_CHANGED"],
      ["policy-prewrite-revoke", "COMPANION_POINTS_DENIED"],
      ["policy-prewrite-reissue", "COMPANION_POINTS_POLICY_SCOPE"],
      ["policy-prewrite-epoch", "COMPANION_POINTS_DENIED"],
      ["policy-prewrite-expired", "COMPANION_POINTS_PREWRITE_EXPIRED"]
    ]) assert.equal(await runPreSale(suffix), code, suffix);
    console.log("PASS C20p-2g one-shot prewrite rehearsal: policy decision consumed exactly once, clone/json/action/parent/db reject, stale/revoke/reissue/epoch/expiry deny, Store reserve still disabled and poisons caught scope");
    assert.equal(await runPreSale("paid-writer-authorize"), undefined);
    const paidWriter = reservationSaved.paidWriter;
    assert.ok(paidWriter, "owner-issued paid-writer authority reached real Store.reserve");
    assert.ok(paidWriter.holdCount > 0, "real reserve wrote a point hold in the genuine Android parent");
    assert.equal(paidWriter.pointsTenderMinor, 1000);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_reservations WHERE id=?").get(paidWriter.reservationId).n, 0,
      "owner rollback removed the paid-writer reservation");
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_holds WHERE reservation_id=?").get(paidWriter.reservationId).n, 0);
    assert.equal(preSaleResponse.body.sale_receipt, undefined, "no paid Android sale receipt");
    for (const [suffix, code] of [
      ["paid-writer-readonly", "COMPANION_POINTS_RESERVATION_DISABLED"],
      ["paid-writer-clone", "COMPANION_POINTS_PAID_WRITER_SCOPE"],
      ["paid-writer-json", "COMPANION_POINTS_PAID_WRITER_SCOPE"],
      ["paid-writer-action-clone", "COMPANION_POINTS_PAID_WRITER_SCOPE"],
      ["paid-writer-context-clone", "COMPANION_POINTS_PAID_WRITER_SCOPE"],
      ["paid-writer-prepared-clone", "COMPANION_POINTS_PAID_WRITER_SCOPE"],
      ["paid-writer-parent-clone", "BENEFITS_PARENT_TRANSACTION_REQUIRED"],
      ["paid-writer-db", "COMPANION_POINTS_PAID_WRITER_SCOPE"],
      ["paid-writer-refund", "COMPANION_POINTS_PAID_WRITER_OPERATION"],
      ["paid-writer-request", "COMPANION_POINTS_PAID_WRITER_SCOPE"],
      ["paid-writer-source", "COMPANION_POINTS_PAID_WRITER_SCOPE"],
      ["paid-writer-stale-quote", "COMPANION_POINTS_INTENT_CHANGED"],
      ["paid-writer-stale-rule", "COMPANION_POINTS_INTENT_CHANGED"],
      ["paid-writer-revoke", "COMPANION_POINTS_DENIED"],
      ["paid-writer-reissue", "COMPANION_POINTS_INTENT_CHANGED"],
      ["paid-writer-epoch", "COMPANION_POINTS_DENIED"],
      ["paid-writer-expired", "COMPANION_POINTS_PAID_WRITER_EXPIRED"],
      ["paid-writer-reuse", "COMPANION_POINTS_PAID_WRITER_CONSUMED"]
    ]) assert.equal(await runPreSale(suffix), code, suffix);
    console.log("PASS C20p-2k owner-issued one-operation paid-writer authority: real Companion Store.reserve writes reservation+hold in the genuine Android BEGIN IMMEDIATE, read-only ports still deny, clone/json/action/context/prepared/parent/db/refund/request/source/stale/revoke/reissue/epoch/expiry/reuse terminally deny, whole parent rolls back with no sale/settlement/ACK");
    // C20p-2l: TEST-ONLY combination. Genuine owner-issued Store.reserve and the
    // genuine canonical paid sale run in the same Android parent. Store.settle is
    // NOT executed: the reservation stays active and no settlement snapshot exists.
    // A TEST FIXTURE operation receipt mapping reaches the real owner's pre-ACK
    // points check; the owner still terminates and the whole parent rolls back.
    const ackBeforeCanonical = ackInsertProbes;
    assert.equal(await runPreSale("paid-writer-canonical-sale"), undefined);
    const canonical = reservationSaved.paidWriterCanonicalSale;
    assert.ok(canonical, "genuine reserve + canonical sale fixture reached both writers");
    assert.equal(paidWriterCanonicalRouterReturned, true, "router returned success to the real Android owner");
    assert.equal(preSaleResponse.body.status, "failed", "real owner denied the points settlement");
    assert.equal(preSaleResponse.body.sale_receipt, undefined, "no public Android ACK receipt");
    assert.equal(ackInsertProbes, ackBeforeCanonical, "real owner denied before android_action_receipts");
    assert.equal(canonical.saleStatus, "paid");
    assert.equal(canonical.saleId, canonical.sourceId, "canonical sale used the prepared protected source");
    assert.equal(canonical.subtotalMinor, canonical.discountMinor + canonical.pointsTenderMinor + canonical.cashPaidMinor,
      "discount + points + cash equals subtotal in integer minors");
    assert.equal(canonical.pointsTenderMinor, 1000);
    assert.equal(canonical.cashPaidMinor, 99000);
    assert.equal(canonical.settlementCashMinor, canonical.cashPaidMinor, "settlement matches the real points receipt");
    assert.equal(canonical.settlementPointsMinor, canonical.pointsTenderMinor, "settlement matches the real points receipt");
    assert.equal(canonical.financeCount, 1, "exactly one cash Finance row");
    assert.equal(canonical.financeAmountMinor, 99000);
    assert.equal(canonical.financeDirection, "income");
    assert.ok(canonical.stockCount > 0, "canonical sale wrote stock rows");
    assert.equal(canonical.reservationStatus, "active", "reservation is active inside the transaction");
    assert.equal(canonical.settleExecuted, false, "genuine Store.settle was NOT called; points are not spent");
    for (const [table, column, value] of [
      ["commerce_benefit_reservations", "id", canonical.reservationId],
      ["commerce_benefit_point_holds", "reservation_id", canonical.reservationId],
      ["commerce_sales", "id", canonical.saleId],
      ["commerce_sale_items", "sale_id", canonical.saleId],
      ["commerce_sale_settlements", "sale_id", canonical.saleId],
      ["finance_entries", "source_id", canonical.saleId],
      ["inventory_movements", "reference_id", canonical.saleId],
      ["commerce_market_sale_receipts", "operation_id", canonical.actionId],
      ["commerce_market_sale_receipts", "sale_id", canonical.saleId],
      ["android_action_receipts", "id", canonical.actionId],
      ["android_market_sale_result_receipts", "action_id", canonical.actionId],
      ["commerce_benefit_snapshots", "source_id", canonical.saleId]
    ]) assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${column}=?`).get(value).n, 0,
      `${table}.${column}: C20p-2l rollback left no partial row`);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger WHERE operation_key='c20p_paid_writer_opening'").get().n, 0,
      "C20p-2l rollback removed the fixture points ledger grant");
    console.log("PASS C20p-2l real owner-issued Store.reserve + canonical paid sale in one genuine Android parent: paid sale on the prepared source, settlement equals real points receipt, 99000 cash Finance, stock rows, reservation still active and Store.settle not executed; TEST FIXTURE operation receipt reaches the real pre-ACK points check, owner returns generic failure with no ACK probe and whole-DB rollback");
    // C20p-2m: TEST-ONLY genuine Store.settle proof. Same genuine reserve and
    // canonical paid sale, then the exact Store.reserve receipt goes through the
    // bounded owner-authorized settlement port. The real Store writes the points
    // spend, settled reservation and snapshot. The owner's pre-ACK verifier still
    // requires ACTIVE + no snapshot, so the whole parent must roll back.
    const ackBeforeSettled = ackInsertProbes;
    assert.equal(await runPreSale("paid-writer-settled-sale"), undefined);
    const settledSale = reservationSaved.paidWriterSettledSale;
    assert.ok(settledSale, "genuine reserve + canonical sale + Store.settle reached the settlement port");
    assert.equal(paidWriterSettledRouterReturned, true, "router returned success to the real Android owner");
    assert.equal(preSaleResponse.body.status, "failed", "real owner denied the settled points sale");
    assert.equal(preSaleResponse.body.sale_receipt, undefined, "no public Android ACK receipt");
    assert.equal(ackInsertProbes, ackBeforeSettled, "real owner denied before android_action_receipts");
    assert.equal(settledSale.saleStatus, "paid");
    assert.equal(settledSale.saleId, settledSale.sourceId, "canonical sale used the prepared protected source");
    assert.equal(settledSale.settleExecuted, true, "genuine Store.settle executed inside the Android parent");
    assert.equal(settledSale.reservationStatus, "settled", "real settlement marked the reservation settled");
    assert.equal(settledSale.pointsTenderMinor, 1000);
    assert.equal(settledSale.cashPaidMinor, 99000);
    assert.equal(settledSale.spentMinor, -settledSale.pointsTenderMinor, "points spend equals the canonical quote");
    assert.equal(settledSale.allocatedMinor, settledSale.pointsTenderMinor, "held credit entries were consumed");
    assert.equal(typeof settledSale.snapshotId, "string");
    assert.equal(settledSale.financeCount, 1);
    assert.equal(settledSale.financeAmountMinor, settledSale.cashPaidMinor);
    assert.equal(settledSale.financeDirection, "income");
    assert.ok(settledSale.stockCount > 0, "canonical sale stock rows remain consistent");
    for (const [table, column, value] of [
      ["commerce_benefit_reservations", "id", settledSale.reservationId],
      ["commerce_benefit_point_holds", "reservation_id", settledSale.reservationId],
      ["commerce_benefit_point_ledger", "id", settledSale.pointSpendEntryId],
      ["commerce_benefit_point_allocations", "debit_entry_id", settledSale.pointSpendEntryId],
      ["commerce_benefit_snapshots", "id", settledSale.snapshotId],
      ["commerce_benefit_snapshots", "source_id", settledSale.saleId],
      ["commerce_sales", "id", settledSale.saleId],
      ["commerce_sale_items", "sale_id", settledSale.saleId],
      ["commerce_sale_settlements", "sale_id", settledSale.saleId],
      ["finance_entries", "source_id", settledSale.saleId],
      ["inventory_movements", "reference_id", settledSale.saleId],
      ["commerce_market_sale_receipts", "operation_id", settledSale.actionId],
      ["commerce_market_sale_receipts", "sale_id", settledSale.saleId],
      ["android_action_receipts", "id", settledSale.actionId],
      ["android_market_sale_result_receipts", "action_id", settledSale.actionId]
    ]) assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${column}=?`).get(value).n, 0,
      `${table}.${column}: C20p-2m rollback left no partial row`);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger WHERE operation_key='c20p_paid_writer_opening'").get().n, 0,
      "C20p-2m rollback removed the fixture points ledger grant");
    console.log("PASS C20p-2m genuine Store.settle through bounded owner-authorized settlement port: real reservation settled, points spend ledger equals the canonical 1000-point quote, hold allocations consumed, snapshot written, paid sale/tender/99000 cash Finance/stock consistent; TEST-ONLY (fixture mapping is not trusted provenance), owner pre-ACK verifier still requires ACTIVE and rolls the whole parent back with no ACK");
    // C20p-2n: the owner-issued canonical sale writer mints the operation
    // mapping itself; this scenario contains NO direct receipt INSERT.
    const ackBeforeOwnerMinted = ackInsertProbes;
    assert.equal(await runPreSale("paid-writer-owner-minted-sale"), undefined);
    const ownerMinted = reservationSaved.paidWriterOwnerMintedSale;
    assert.ok(ownerMinted, "genuine reserve + owner-issued canonical sale writer reached the parent");
    assert.equal(paidWriterOwnerMintedRouterReturned, true, "router returned success to the real Android owner");
    assert.equal(preSaleResponse.body.status, "failed", "real owner denied the owner-minted points sale");
    assert.equal(preSaleResponse.body.sale_receipt, undefined, "no public Android ACK receipt");
    assert.equal(ackInsertProbes, ackBeforeOwnerMinted, "real owner denied before android_action_receipts");
    assert.equal(ownerMinted.ownerMintedMapping, true);
    assert.equal(ownerMinted.saleStatus, "paid");
    assert.equal(ownerMinted.saleId, ownerMinted.sourceId, "canonical sale used the prepared protected source");
    assert.match(ownerMinted.requestHash, /^[a-f0-9]{64}$/, "owner writer returned the canonical request hash");
    assert.equal(ownerMinted.pointsTenderMinor, 1000);
    assert.equal(ownerMinted.cashPaidMinor, 99000);
    assert.equal(ownerMinted.settlementCashMinor, ownerMinted.cashPaidMinor);
    assert.equal(ownerMinted.settlementPointsMinor, ownerMinted.pointsTenderMinor);
    assert.equal(ownerMinted.financeCount, 1);
    assert.equal(ownerMinted.financeAmountMinor, ownerMinted.cashPaidMinor);
    assert.equal(ownerMinted.financeDirection, "income");
    assert.ok(ownerMinted.stockCount > 0, "canonical sale wrote stock rows");
    for (const [table, column, value] of [
      ["commerce_benefit_reservations", "id", ownerMinted.reservationId],
      ["commerce_benefit_point_holds", "reservation_id", ownerMinted.reservationId],
      ["commerce_sales", "id", ownerMinted.saleId],
      ["commerce_sale_items", "sale_id", ownerMinted.saleId],
      ["commerce_sale_settlements", "sale_id", ownerMinted.saleId],
      ["finance_entries", "source_id", ownerMinted.saleId],
      ["inventory_movements", "reference_id", ownerMinted.saleId],
      ["commerce_market_sale_receipts", "operation_id", ownerMinted.actionId],
      ["commerce_market_sale_receipts", "sale_id", ownerMinted.saleId],
      ["android_action_receipts", "id", ownerMinted.actionId],
      ["android_market_sale_result_receipts", "action_id", ownerMinted.actionId]
    ]) assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${column}=?`).get(value).n, 0,
      `${table}.${column}: C20p-2n rollback left no partial row`);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger WHERE operation_key='c20p_paid_writer_opening'").get().n, 0,
      "C20p-2n rollback removed the fixture points ledger grant");
    console.log("PASS C20p-2n owner-issued canonical paid-sale writer: original Android parent + unused protected source + exact Store receipt quote produce the canonical sale/tender/99000 cash Finance/stock and the operation mapping is minted ONLY inside market-sale-operation (no helper SQL); real owner pre-ACK evidence check still denies before ACK and rolls the whole parent back");
    // C20p-2o: owner-minted sale + genuine Store.settle, then the server-only
    // points receipt witness/materializer. The live owner route is unchanged and
    // must still deny before ACK; the test proves the internal receipt projection.
    const ackBeforeAuthorizedPoints = ackInsertProbes;
    assert.equal(await runPreSale("paid-writer-authorized-points-receipt"), "COMPANION_POINTS_RECEIPT_EVIDENCE_AUTHORITY",
      "terminal replay of the consumed opaque witness poisons the parent");
    const authorizedPoints = reservationSaved.paidWriterAuthorizedPointsReceipt;
    assert.ok(authorizedPoints, "owner sale + genuine Store.settle reached the points receipt materializer");
    assert.equal(paidWriterAuthorizedPointsRouterReturned, false, "terminal negative never reaches the live route");
    assert.equal(preSaleResponse.body.status, "failed", "live owner still denies the points sale");
    assert.equal(preSaleResponse.body.sale_receipt, undefined, "no public Android ACK receipt");
    assert.equal(ackInsertProbes, ackBeforeAuthorizedPoints, "no android_action_receipts row inserted");
    assert.equal(authorizedPoints.pointsTenderMinor, 1000);
    assert.equal(authorizedPoints.cashPaidMinor, 99000);
    assert.equal(authorizedPoints.settledStatus, "settled");
    assert.match(authorizedPoints.requestHash, /^[a-f0-9]{64}$/, "canonical operation request hash");
    assert.match(authorizedPoints.intentHash, /^[a-f0-9]{64}$/, "Android action intent hash");
    assert.notEqual(authorizedPoints.intentHash, authorizedPoints.requestHash, "action hash and operation hash stay distinct");
    for (const [table, column, value] of [
      ["commerce_benefit_reservations", "id", authorizedPoints.reservationId],
      ["commerce_benefit_point_holds", "reservation_id", authorizedPoints.reservationId],
      ["commerce_benefit_point_ledger", "id", authorizedPoints.pointSpendEntryId],
      ["commerce_benefit_snapshots", "id", authorizedPoints.snapshotId],
      ["commerce_benefit_snapshots", "source_id", authorizedPoints.saleId],
      ["commerce_sales", "id", authorizedPoints.saleId],
      ["commerce_sale_items", "sale_id", authorizedPoints.saleId],
      ["commerce_sale_settlements", "sale_id", authorizedPoints.saleId],
      ["finance_entries", "source_id", authorizedPoints.saleId],
      ["inventory_movements", "reference_id", authorizedPoints.saleId],
      ["commerce_market_sale_receipts", "operation_id", authorizedPoints.actionId],
      ["commerce_market_sale_receipts", "sale_id", authorizedPoints.saleId],
      ["android_action_receipts", "id", authorizedPoints.actionId],
      ["android_market_sale_result_receipts", "action_id", authorizedPoints.actionId]
    ]) assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${column}=?`).get(value).n, 0,
      `${table}.${column}: C20p-2o rollback left no partial row`);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger WHERE operation_key='c20p_paid_writer_opening'").get().n, 0,
      "C20p-2o rollback removed the fixture points ledger grant");
    console.log("PASS C20p-2o server-only settled points receipt projection: owner-minted canonical sale + pre-settle opaque operation provenance + genuine Store.settle + real spend ledger/snapshot yield a frozen points-aware receipt with distinct action/operation hashes; replay is terminally rejected; no ACK row is written and the whole parent rolls back; live route remains closed");
    // C20p-2h: the whole-DB snapshot compare inside runPreSale is the before/after
    // evidence. The router returned ok, so applyAndroidActionTransaction reached
    // its pre-commit evidence check and rejected the non-canonical points
    // settlement before android_action_receipts; every fixture row must be gone.
    assert.equal(await runPreSale("cross-writer-atomic"), undefined);
    const crossWriter = reservationSaved.crossWriter;
    assert.ok(crossWriter, "cross-writer fixture reached the canonical paid writer");
    assert.match(crossWriter.identityHash, /^[a-f0-9]{64}$/, "sale owner returned the canonical operation request hash");
    assert.ok(crossWriter.holdCount > 0, "fixture Store reservation actually held points before rollback");
    for (const [table, column, value] of [
      ["commerce_benefit_reservations", "id", crossWriter.reservationId],
      ["commerce_benefit_point_holds", "reservation_id", crossWriter.reservationId],
      ["commerce_sales", "id", crossWriter.saleId],
      ["commerce_sale_items", "sale_id", crossWriter.saleId],
      ["commerce_sale_settlements", "sale_id", crossWriter.saleId],
      ["finance_entries", "source_id", crossWriter.saleId],
      ["inventory_movements", "reference_id", crossWriter.saleId],
      ["commerce_market_sale_receipts", "sale_id", crossWriter.saleId],
      ["commerce_market_sale_receipts", "operation_id", crossWriter.actionId],
      ["android_action_receipts", "id", crossWriter.actionId],
      ["android_market_sale_result_receipts", "action_id", crossWriter.actionId]
    ]) assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${column}=?`).get(value).n, 0,
      `${table}.${column}: cross-writer rollback left no partial row`);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger WHERE operation_key='c20k_opening'").get().n, 0,
      "cross-writer rollback removed the fixture points ledger grant");
    console.log("PASS C20p-2h cross-writer atomic denial: real TLS Android owner rejects fixture C20k reservation + canonical points sale at the pre-commit evidence check; whole-DB snapshot restored, no reservation/hold/ledger/sale/settlement/Finance/stock/receipt/ACK partial write");
    const receiptsBefore = db.prepare("SELECT count(*) n FROM commerce_market_sale_receipts").get().n;
    assert.equal(await runPreSale("cross-writer-candidate"), undefined);
    assert.equal(preSaleResponse.body.status, "failed", "positive candidate HTTP result is a real owner failure, not applied");
    assert.equal(candidateRouterReturned, true, "the real owner router returned success; the real receipt materializer then rejected and rolled back");
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_market_sale_receipts").get().n, receiptsBefore,
      "the candidate run committed no operation receipt");
    const candidate = reservationSaved.crossWriterCandidate;
    assert.ok(candidate && Object.isFrozen(candidate), "structural evidence is frozen");
    assert.equal(candidate.state, "structural_candidate_only");
    assert.equal(candidate.authority, "unavailable");
    assert.equal(candidate.missing, "trusted_paid_writer_grant");
    assert.match(candidate.requestHash, /^[a-f0-9]{64}$/, "evidence uses the owner's canonical request hash");
    assert.equal(candidate.operationId, "presale_binding_test_01");
    assert.equal(candidate.pointsTenderMinor > 0, true, "points tender is positive");
    assert.equal(candidate.cashPaidMinor + candidate.pointsTenderMinor, candidate.totalMinor);
    assert.equal(candidate.subtotalMinor, candidate.discountMinor + candidate.pointsTenderMinor + candidate.cashPaidMinor);
    assert.equal(candidate.financeIncomeMinor, candidate.cashPaidMinor, "Finance equals realized cash only");
    assert.equal(candidate.canReservePoints, false);
    assert.equal(candidate.canConfirmPointsSale, false);
    for (const [table, column, value] of [
      ["commerce_market_sale_receipts", "operation_id", candidate.operationId],
      ["commerce_market_sale_receipts", "sale_id", candidate.saleId],
      ["commerce_benefit_reservations", "id", candidate.reservationId],
      ["commerce_benefit_point_holds", "reservation_id", candidate.reservationId],
      ["commerce_sales", "id", candidate.saleId],
      ["commerce_sale_items", "sale_id", candidate.saleId],
      ["commerce_sale_settlements", "sale_id", candidate.saleId],
      ["finance_entries", "source_id", candidate.saleId],
      ["inventory_movements", "reference_id", candidate.saleId],
      ["android_action_receipts", "id", candidate.operationId],
      ["android_market_sale_result_receipts", "action_id", candidate.operationId]
    ]) assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${column}=?`).get(value).n, 0,
      `${table}.${column}: positive candidate rollback left no partial row`);
    assert.equal(await runPreSale("cross-writer-candidate-hash"), "COMPANION_POINTS_RECEIPT_EVIDENCE_MAPPING");
    assert.equal(await runPreSale("cross-writer-candidate-finance"), "COMPANION_POINTS_RECEIPT_EVIDENCE_FINANCE");
    console.log("PASS C20p-2i2 read-only pre-commit points receipt evidence: canonical operationId+requestHash mapping, paid Android sale/customer, settlement conservation, cash-only Finance, reservation/hold/quote provenance; frozen structural_candidate_only with authority unavailable; tampered hash and Finance mismatch rejected with whole-parent rollback");
    // C20p-2j: real-owner integration. The fixture creates the structurally
    // valid candidate but NEVER invokes the verifier; the ACK-insert probe proves
    // the REAL Android owner denies before android_action_receipts. Exact verifier
    // codes remain asserted by the C20p-2i2 direct-reader negatives above.
    for (const suffix of ["cross-writer-owner-candidate", "cross-writer-owner-candidate-hash",
      "cross-writer-owner-candidate-finance", "cross-writer-owner-candidate-zero-points"]) {
      const probes = ackInsertProbes;
      assert.equal(await runPreSale(suffix), undefined, `${suffix}: fixture itself did not throw`);
      assert.equal(preSaleResponse.body.status, "failed", `${suffix}: real owner denied`);
      assert.equal(preSaleResponse.body.sale_receipt, undefined, `${suffix}: no public ACK receipt`);
      assert.equal(candidateRouterReturned, true, `${suffix}: router reached the real Android owner`);
      assert.equal(ackInsertProbes, probes, `${suffix}: real owner denied before android_action_receipts`);
      const candidate = reservationSaved.crossWriterOwnerCandidate;
      assert.ok(candidate, `${suffix}: fixture candidate was created`);
      assert.match(candidate.requestHash, /^[a-f0-9]{64}$/, `${suffix}: canonical request hash`);
      for (const [table, column, value] of [
        ["commerce_benefit_reservations", "id", candidate.reservationId],
        ["commerce_benefit_point_holds", "reservation_id", candidate.reservationId],
        ["commerce_sales", "id", candidate.saleId],
        ["commerce_sale_items", "sale_id", candidate.saleId],
        ["commerce_sale_settlements", "sale_id", candidate.saleId],
        ["finance_entries", "source_id", candidate.saleId],
        ["inventory_movements", "reference_id", candidate.saleId],
        ["commerce_market_sale_receipts", "operation_id", candidate.actionId],
        ["commerce_market_sale_receipts", "sale_id", candidate.saleId],
        ["android_action_receipts", "id", candidate.actionId],
        ["android_market_sale_result_receipts", "action_id", candidate.actionId]
      ]) assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${column}=?`).get(value).n, 0,
        `${suffix}: ${table}.${column} left no partial row`);
      assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger WHERE operation_key='c20k_opening'").get().n, 0,
        `${suffix}: fixture points ledger rolled back`);
    }
    console.log("PASS C20p-2j real owner pre-commit points receipt evidence: fixture-created structural candidate never invokes the verifier; real Android owner denies before android_action_receipts (probe untouched) with whole-DB rollback for valid, tampered-hash, Finance-mismatch and zero-points settlement candidates; exact verifier codes remain covered by C20p-2i2");
    for (const [suffix, code] of [
      ["read", undefined], ["worker", undefined], ["duplicate", undefined], ["sale-source", undefined],
      ["unminted", "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED"], ["prepare-twice", "COMPANION_POINTS_OPERATION_SCOPE"],
      ...["wrong-request", "wrong-source", "wrong-time", "benefits", "credit", "replay"].map(s => [s, "COMPANION_POINTS_OPERATION_SCOPE"]),
      ...["clone", "json", "receipt-copy", "allocation-clone", "hash-input", "operation-input", "db", "write-clone", "parent-time", "parent-db"].map(s => [s, "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED"]),
      ["callback-async", "BENEFITS_ASYNC_TRANSACTION_FORBIDDEN"], ["callback-write", "BENEFITS_TRANSACTION_ABORTED"],
      ["parent-clone", "BENEFITS_PARENT_TRANSACTION_REQUIRED"], ["archived", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ...["missing", "hash", "receipt-time", "receipt-operation", "mapping", "finance", "stock", "sale"].map(s => [s, "COMPANION_POINTS_OPERATION_RECEIPT_CHANGED"]),
      ["revoke", "COMPANION_POINTS_DENIED"], ["regrant", "COMPANION_POINTS_INTENT_CHANGED"],
      ["business", "COMPANION_POINTS_DENIED"], ["epoch", "COMPANION_POINTS_DENIED"],
      ...["action", "device"].map(s => [s, "COMPANION_POINTS_ISSUANCE_SCOPE"]),
      ["customer", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["caught", "BENEFITS_TRANSACTION_ABORTED"], ["write-clone-caught", "BENEFITS_TRANSACTION_ABORTED"], ["write-fault", "BENEFITS_TRANSACTION_ABORTED"],
      ["settle", "COMPANION_POINTS_TENDER_REQUIRED"], ["ack", "COMPANION_POINTS_PARENT_ALREADY_APPLIED"]
    ]) assert.equal(await runPreSale(`issuance-owner-${suffix}`), code, `owner-${suffix}`);
    const oldOwner = reservationSaved.owner;
    assert.throws(() => companionPorts.readCompanionSaleOperationWitness(oldOwner.tx, oldOwner.action, oldOwner.context,
      oldOwner.input, oldOwner.binding, oldOwner.prepared, oldOwner.handle), e => e.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED");
    console.log("PASS C20m fresh canonical owner receipt observation: exact same-parent C20k issuance, SQL tamper/replay/grant/rollback denial, zero reader writes; points tender remains unavailable");
    for (const [suffix, code] of [
      ["read", undefined], ["worker", undefined], ["execute", "COMPANION_POINTS_TENDER_AUTHORITY_REQUIRED"],
      ["unissued", "COMPANION_POINTS_ISSUANCE_REQUIRED"], ["uncaptured", "COMPANION_POINTS_ISSUANCE_REQUIRED"],
      ["issuance-clone", "COMPANION_POINTS_ISSUANCE_SCOPE"], ["parent", "BENEFITS_PARENT_TRANSACTION_REQUIRED"],
      ...["clone", "json", "allocation", "time", "amount", "method", "request", "archived"].map(s => [s, "COMPANION_POINTS_TENDER_CONTRACT_SCOPE"]),
      ["revoke", "COMPANION_POINTS_DENIED"], ["regrant", "COMPANION_POINTS_INTENT_CHANGED"],
      ["reissue", "COMPANION_POINTS_INTENT_CHANGED"], ["business", "COMPANION_POINTS_SOURCE_SCOPE"],
      ["epoch", "COMPANION_POINTS_DENIED"], ["price", "COMPANION_POINTS_INTENT_CHANGED"], ["rule", "COMPANION_POINTS_INTENT_CHANGED"],
      ...["action", "device", "customer", "currency"].map(s => [s, "COMPANION_POINTS_ISSUANCE_SCOPE"]),
      ["released", "BENEFITS_RESERVATION_EXPIRED"], ["expiry", "COMPANION_POINTS_RESERVATION_EXPIRED"],
      ["quote-amount", "COMPANION_POINTS_TENDER_MISMATCH"], ["quote-currency", "COMPANION_POINTS_TENDER_MISMATCH"],
      ["caught", "BENEFITS_TRANSACTION_ABORTED"], ["ack", "COMPANION_POINTS_SOURCE_SCOPE"]
    ]) assert.equal(await runPreSale(`issuance-tender-${suffix}`), code, `tender-${suffix}`);
    const oldTender = reservationSaved.tender;
    assert.throws(() => load("market-sale-operation").readMarketSaleCompanionTenderContract(oldTender.tx,
      oldTender.ownerInput, oldTender.allocation, oldTender.contract), e => e.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED");
    console.log("PASS C20n canonical tender preflight: current same-parent issuance, exact mixed arithmetic, no writes; execution terminally denies absent independent owner authority");
    // C20o: direct canonical owner failures must poison this same parent even
    // when a future internal caller catches them. No mutation authority is minted.
    for (const suffix of ["market-request", "market-benefits", "commerce-benefits", "commerce-clone",
      "market-after-sale", "market-after-finance", "market-receipt", "commerce-after-sale", "commerce-after-finance"])
      assert.equal(await runPreSale(`issuance-boundary-${suffix}`), "BENEFITS_TRANSACTION_ABORTED", `boundary-${suffix}`);
    console.log("PASS C20o fail-closed owner boundary: caught direct allocation/benefits denials and canonical cash writer faults poison same parent; all-table rollback, no ACK or points authority");
    assert.equal(await runPreSale("issuance-paid-read"), undefined);
    for (const [suffix, code] of [
      ["parent", "COMPANION_POINTS_PARENT_RECEIPT_REQUIRED"], ["receipt-forged", "COMPANION_POINTS_SOURCE_SCOPE"],
      ["receipt-replay", "COMPANION_POINTS_PARENT_RECEIPT_PROVENANCE_REQUIRED"],
      ["finance", "COMPANION_POINTS_FINANCE_MISMATCH"], ["finance-currency", "COMPANION_POINTS_FINANCE_MISMATCH"],
      ["finance-missing", "COMPANION_POINTS_FINANCE_MISMATCH"], ["finance-deleted", "COMPANION_POINTS_FINANCE_MISMATCH"],
      ["finance-duplicate", "COMPANION_POINTS_FINANCE_MISMATCH"],
      ["credit", "COMPANION_POINTS_PAID_SALE_REQUIRED"], ["open", "COMPANION_POINTS_PAID_SALE_REQUIRED"], ["pending", "COMPANION_POINTS_PAID_SALE_REQUIRED"],
      ["total", "COMPANION_POINTS_TENDER_MISMATCH"], ["points", "COMPANION_POINTS_TENDER_MISMATCH"],
      ["tender", "COMPANION_POINTS_TENDER_REQUIRED"], ["items", "COMPANION_POINTS_ITEMS_MISMATCH"],
      ["stock", "COMPANION_POINTS_STOCK_MISMATCH"], ["currency", "COMPANION_POINTS_PAID_SALE_SCOPE"],
      ["customer", "COMPANION_POINTS_PAID_SALE_SCOPE"], ["business", "COMPANION_POINTS_PAID_SALE_SCOPE"],
      ["revoke", "COMPANION_POINTS_DENIED"], ["regrant", "COMPANION_POINTS_INTENT_CHANGED"],
      ["reissue", "COMPANION_POINTS_INTENT_CHANGED"], ["epoch", "COMPANION_POINTS_DENIED"],
      ["price", "COMPANION_POINTS_INTENT_CHANGED"], ["rule", "COMPANION_POINTS_INTENT_CHANGED"],
      ["device", "COMPANION_POINTS_ISSUANCE_SCOPE"], ["action", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["worker", "COMPANION_POINTS_PARENT_RECEIPT_REQUIRED"], ["caught", "BENEFITS_TRANSACTION_ABORTED"],
      ["stock-location", "COMPANION_POINTS_STOCK_MISMATCH"], ["source", "COMPANION_POINTS_PAID_SALE_SCOPE"],
      ["forged-total", "COMPANION_POINTS_TENDER_MISMATCH"], ["parent-clone", "BENEFITS_PARENT_TRANSACTION_REQUIRED"],
      ["action-clone", "COMPANION_POINTS_ISSUANCE_SCOPE"], ["context", "COMPANION_POINTS_ISSUANCE_SCOPE"],
      ["handle-clone", "COMPANION_POINTS_ISSUANCE_SCOPE"], ["expiry", "COMPANION_POINTS_RESERVATION_EXPIRED"],
      ["coupon", "COMPANION_POINTS_INTENT_CHANGED"], ["device-disabled", "COMPANION_POINTS_DENIED"],
      ["family", "COMPANION_POINTS_DENIED"], ["ack-replay", "COMPANION_POINTS_PARENT_ALREADY_APPLIED"]
    ]) assert.equal(await runPreSale(`issuance-paid-${suffix}`), code, `paid-${suffix}`);
    const allPointsAction = { ...preSaleAction, payload: { ...preSaleAction.payload,
      lines: [{ ...preSaleAction.payload.lines[0], quantity: 0.01 }] } };
    assert.equal(await runPreSale("issuance-tender-read", allPointsAction), undefined);
    assert.equal(await runPreSale("issuance-tender-execute", allPointsAction), "COMPANION_POINTS_TENDER_AUTHORITY_REQUIRED");
    for (const suffix of ["market-request", "market-benefits", "commerce-benefits", "commerce-clone"])
      assert.equal(await runPreSale(`issuance-boundary-${suffix}`, allPointsAction), "BENEFITS_TRANSACTION_ABORTED", `all-points boundary-${suffix}`);
    assert.equal(await runPreSale("issuance-paid-read", allPointsAction), undefined);
    assert.equal(await runPreSale("issuance-paid-parent", allPointsAction), "COMPANION_POINTS_PARENT_RECEIPT_REQUIRED");
    assert.equal(await runPreSale("issuance-paid-zero-finance", allPointsAction), "COMPANION_POINTS_FINANCE_MISMATCH");
    assert.equal(await runPreSale("issuance-owner-settle", allPointsAction), "COMPANION_POINTS_TENDER_REQUIRED",
      "an all-points quote cannot turn the ordinary allocated cash sale into a points tender");
    // C20p-1a: these are rejection probes, never a new points witness issuer.
    // Catch accidental promotion of a real cash observation or SQL-only evidence.
    for (const body of [preSaleAction, allPointsAction]) {
      for (const [suffix, code] of [
        ["observation-as-tender", "COMPANION_POINTS_TENDER_CONTRACT_SCOPE"],
        ["receipt-as-tender", "COMPANION_POINTS_TENDER_CONTRACT_SCOPE"],
        ["tender-added", "COMPANION_POINTS_OPERATION_RECEIPT_CHANGED"],
        ["snapshot-added", "BENEFITS_SOURCE_ALREADY_SETTLED"]
      ]) assert.equal(await runPreSale(`issuance-owner-${suffix}`, body), code, `points receipt boundary: ${suffix}`);
      assert.equal(await runPreSale("issuance-paid-sql-as-observation", body), "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED");
    }
    const settlementBoundaryKinds = new Set(["tender", "mixed", "mixed-gross-finance", "all-points", "all-points-gross-finance"]);
    for (const kind of ["tender", "mixed", "mixed-gross-finance", "all-points", "all-points-gross-finance", "snapshot"]) {
      mode = `receipt-boundary-${kind}`;
      receiptBoundaryWrites = undefined;
      db.exec("UPDATE android_devices SET last_seen_at='2099-01-01T00:00:00.000Z', updated_at='2099-01-01T00:00:00.000Z'");
      const before = databaseState(db), writes = db.prepare("SELECT total_changes() n").get().n;
      const response = await send({ ...action(`receipt_boundary_${kind.replaceAll("-", "_")}`), last_seen_at: "2099-01-01T00:00:00.000Z" });
      assert.equal(response.body.status, "failed", `${kind}: real owner must deny points evidence`);
      assert.equal(response.body.sale_receipt, undefined, `${kind}: no public ACK receipt`);
      assert.deepEqual(databaseState(db), before, `${kind}: action owner rolls back all canonical and result receipts`);
      assert.ok(db.prepare("SELECT total_changes() n").get().n > writes, `${kind}: real provisional owner writes occurred`);
      assert.equal(typeof receiptBoundaryWrites, "number", `${kind}: negative fixture reached the owner boundary`);
      assert.equal(db.prepare("SELECT total_changes() n").get().n, receiptBoundaryWrites + (settlementBoundaryKinds.has(kind) ? 0 : 1),
        settlementBoundaryKinds.has(kind)
          ? `${kind}: owner denied settlement evidence before android_action_receipts`
          : `${kind}: Android action receipt inserted provisionally, no result receipt materialized`);
      assert.equal(db.isTransaction, false);
    }
    console.log("PASS C20p-1a receipt rejection: cash/SQL observations cannot mint points authority; real Android owner denies zero-points/mixed/all-points settlement evidence before any ACK, materializer denies snapshot, whole parent rolls back");
    for (const method of ["card", "bank", "other"]) {
      const external = { ...preSaleAction, payload: { ...preSaleAction.payload, payment_method: method, external_payment_confirmed: true } };
      assert.equal(await runPreSale("issuance-paid-read", external), "COMPANION_POINTS_EXTERNAL_TENDER_EVIDENCE_REQUIRED", `${method}: client confirmation is not canonical tender proof`);
      assert.equal(await runPreSale("issuance-owner-read", external), "COMPANION_POINTS_EXTERNAL_TENDER_EVIDENCE_REQUIRED",
        `${method}: observer must reject before canonical sale writes`);
      assert.equal(await runPreSale("issuance-tender-read", external), "COMPANION_POINTS_EXTERNAL_TENDER_EVIDENCE_REQUIRED");
    }
    console.log("PASS C20l canonical paid tender/Finance: real mixed/all-points sale/stock, zero all-points Finance, read-only evidence; Companion parent receipt provenance remains fail-closed");
    assert.equal(await runPreSale("snapshot-read"), undefined);
    assert.throws(() => companionPorts.revalidateCompanionSaleBenefitsQuote(archivedQuote.tx, archivedQuote.action,
      archivedQuote.context, intent, archivedQuote.current, archivedQuote.prepared, archivedQuote.handle),
    e => e.code === "BENEFITS_PARENT_TRANSACTION_REQUIRED", "archived handle cannot be read outside its parent");
    assert.equal(await runPreSale("snapshot-regrant"), "COMPANION_POINTS_INTENT_CHANGED",
      "same-epoch revoke/regrant cannot revive captured advisory snapshot");
    assert.equal(await runPreSale("snapshot-reissue"), "COMPANION_POINTS_INTENT_CHANGED", "owner reissue invalidates captured quote without revoke");
    const initialEpoch = db.prepare("SELECT authorization_epoch FROM android_devices WHERE id='d1'").get().authorization_epoch;
    assert.equal(await runPreSale("snapshot-worker-before"), "COMPANION_POINTS_DENIED", "revoke committed before BEGIN denies parent");
    workerGeneration = grantWorker.run("grant").generation;
    assert.equal(await runPreSale("snapshot-worker-fresh"), undefined, "fresh preparation sees new grant");
    assert.equal(await runPreSale("snapshot-worker-regrant"), "COMPANION_POINTS_SOURCE_SCOPE", "new intent cannot reuse old pre-BEGIN preparation");
    assert.equal(await runPreSale("snapshot-worker-fresh"), undefined);
    assert.equal(await runPreSale("snapshot-worker-reissue"), "COMPANION_POINTS_SOURCE_SCOPE", "owner update invalidates old preparation too");
    assert.equal(await runPreSale("snapshot-worker-fresh"), undefined);
    assert.equal(db.prepare("SELECT authorization_epoch FROM android_devices WHERE id='d1'").get().authorization_epoch, initialEpoch);
    assert.equal(await runPreSale("snapshot-worker-busy"), undefined, "parent wins writer lock; actual worker revoke is busy");
    assert.equal(db.isTransaction, false, "canonical parent rollback released the lock");
    assert.equal(grantWorker.run("revoke").changed, true, "retry serializes strictly after parent rollback");
    assert.equal(await runPreSale("snapshot-worker-fresh"), "COMPANION_POINTS_DENIED", "all new preparation is denied after committed revoke");
    workerGeneration = grantWorker.run("grant").generation;
    assert.equal(await runPreSale("snapshot-worker-fresh"), undefined);
    // C20b principal survives no transaction identity guarantee: explicitly
    // exercise its durable lifetime checks across independent owner commits.
    const principalOwner = load("companion-points-principal");
    const requirePrincipal = () => principalOwner.requireCompanionPointsPrincipal(db, { deviceId: "device-one", token }, "c1");
    const inParent = fn => {
      db.exec("BEGIN IMMEDIATE");
      try { return readOnly(db, fn); } finally { db.exec("ROLLBACK"); }
    };
    const prior = inParent(requirePrincipal);
    for (const operation of ["grant-rollback", "revoke-rollback"]) {
      const before = databaseState(db), rolledBack = grantWorker.run(operation);
      assert.equal(rolledBack.ok && rolledBack.changed, true);
      assert.equal(rolledBack.originalGeneration, prior.spendGrantGeneration);
      assert.equal(rolledBack.generation, prior.spendGrantGeneration);
      assert.notEqual(rolledBack.attemptedGeneration, prior.spendGrantGeneration);
      assert.deepEqual(databaseState(db), before, "independent owner rollback restores every table and generation");
      inParent(() => prior.assertAuthorized());
    }
    assert.equal(grantWorker.run("revoke").changed, true);
    inParent(() => { denied(() => prior.assertAuthorized()); denied(requirePrincipal); });
    assert.equal(grantWorker.run("grant").changed, true);
    const next = inParent(() => { denied(() => prior.assertAuthorized()); return requirePrincipal(); });
    assert.notEqual(next.spendGrantGeneration, prior.spendGrantGeneration);
    assert.equal(grantWorker.run("grant").changed, true);
    const reissued = inParent(() => { denied(() => prior.assertAuthorized()); denied(() => next.assertAuthorized());
      const current = requirePrincipal(); current.assertAuthorized(); return current; });
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("UPDATE android_devices SET authorization_epoch=authorization_epoch+1 WHERE id='d1'");
      readOnly(db, () => { denied(requirePrincipal); denied(() => reissued.assertAuthorized()); });
    } finally { db.exec("ROLLBACK"); }
    console.log("PASS C20i independent SQLite worker: committed revoke before BEGIN, parent-first SQLITE_BUSY then revoke after rollback, same-epoch regrant/reissue stale preparation/principal, rollback and fresh-only recovery");
    assert.equal(await runPreSale("snapshot-concurrent"), undefined);
    assert.equal(await runPreSale("snapshot-other-customer"), undefined, "another customer's spend cannot change c1 points");
    assert.equal(await runPreSale("snapshot-stock"), undefined, "advisory quote is not stock availability/reservation authority");
    for (const [nextMode, code] of [
      ...["clone", "json", "missing", "quote", "tampered", "owner", "action-clone", "context", "binding", "preparation", "key-source",
        "intent", "currency", "other-device", "customer", "operation", "action-type", "payment", "parent-time", "db", "next-parent"]
        .map(name => [name, "COMPANION_POINTS_QUOTE_SCOPE"]),
      ["parent-clone", "BENEFITS_PARENT_TRANSACTION_REQUIRED"], ["caught", "BENEFITS_TRANSACTION_ABORTED"],
      ...["expiry", "clock-back", "expiry-during-read", "rule-expiry", "rule-start", "lot-expiry", "hold-expiry"].map(name => [name, "COMPANION_POINTS_QUOTE_EXPIRED"]),
      ...["grant", "token", "device", "business"].map(name => [name, "COMPANION_POINTS_DENIED"]),
      ...["family", "rules", "price", "price-group", "epoch"].map(name => [name, "COMPANION_POINTS_INTENT_CHANGED"]),
      ["balance", "COMPANION_POINTS_QUOTE_CHANGED"], ["consumed", "COMPANION_POINTS_SOURCE_SCOPE"],
      ["fault", "FIXTURE_READ_FAULT"], ["capture-fault", "FIXTURE_READ_FAULT"]
    ]) assert.equal(await runPreSale(`snapshot-${nextMode}`), code, nextMode);
    for (const table of ["commerce_benefit_reservations", "commerce_benefit_point_holds", "commerce_benefit_point_ledger"])
      assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    console.log("PASS C20h opaque advisory snapshots: exact same parent/source, fresh canonical quote/balance, expiry, isolation, rollback and no writes; same-epoch grant lifetime bound");
    // C20p-2b: the HTTPS-minted context itself must own the real BEGIN IMMEDIATE.
    // This is an observer inside the canonical owner, not a new transaction owner.
    mode = "owner-proof"; ownerProofProbe = 0;
    const ownerProofAction = { ...action("owner_proof_c20p_2b_01"), last_seen_at: "2099-01-01T00:00:00.000Z" };
    db.exec("UPDATE android_devices SET last_seen_at='2099-01-01T00:00:00.000Z', updated_at='2099-01-01T00:00:00.000Z' WHERE device_id='device-one'");
    const ownerProofBefore = databaseState(db);
    const ownerProofTables = ["commerce_sales", "commerce_sale_items", "commerce_market_sale_receipts",
      "android_action_receipts", "android_market_sale_result_receipts", "finance_entries", "sync_outbox"];
    const ownerProofCounts = () => Object.fromEntries(ownerProofTables.map(table =>
      [table, db.prepare(`SELECT count(*) n FROM ${table}`).get().n]));
    const ownerProofCountsBefore = ownerProofCounts();
    const ownerProof = await send(ownerProofAction);
    assert.equal(ownerProof.status, 200);
    assert.equal(ownerProof.body.status, "failed", ownerProof.body.message);
    assert.equal(ownerProof.body.sale_receipt, undefined);
    assert.equal(ownerProof.body.already_applied, false);
    assert.equal(ownerProofProbe, 1, "real router observed exactly one owner-bound call");
    assert.deepEqual(databaseState(db), ownerProofBefore, "sentinel rollback leaves no sale/receipt/ACK/outbox row");
    assert.deepEqual(ownerProofCounts(), ownerProofCountsBefore, "sale/receipt/ACK/outbox tables stay empty for this action");
    assert.equal(db.isTransaction, false);
    denied(() => ownerPrincipal.assertAuthorized()); // request-lifetime principal is dead
    console.log("PASS C20p-2c live principal in owner: current tenant/device/epoch/grant + positive assertAuthorized, clone denial, revoke/regrant lifetime death, sentinel rollback with no sale/receipt/ACK/outbox");
    mode = "principal";
    const firstAction = action("ingress_success_01"), first = await send(firstAction);
    assert.equal(first.status, 200); assert.equal(first.body.status, "applied", first.body.message);
    assert.ok(first.body.sale_receipt); assert.equal(first.body.sale_receipt.pointsTenderMinor, 0);
    assert.deepEqual(captured, Object.freeze({}));
    db.exec("BEGIN IMMEDIATE");
    denied(() => ingress.requireLocalActionPointsPrincipal(db, boundAction, captured, "c1"));
    denied(() => principal.assertAuthorized());
    db.exec("ROLLBACK"); // request lifetime expired, even with another transaction
    const replay = await send(firstAction);
    assert.equal(replay.body.already_applied, true); assert.deepEqual(replay.body.sale_receipt, first.body.sale_receipt);
    const rotatedToken = `yal_${"c".repeat(64)}`;
    credentials.storeAndroidLocalCredential(db, "device-one", rotatedToken);
    const rotated = await send(firstAction, { "X-YA-Local-Token": rotatedToken });
    assert.equal(rotated.body.already_applied, true); assert.deepEqual(rotated.body.sale_receipt, first.body.sale_receipt);
    token = rotatedToken; // A historical token hash cannot be reused after rotation.
    const credit = { ...action("ingress_credit_scope_01"), payload: { ...firstAction.payload, settlement: "credit", payment_method: "" } };
    assert.equal((await send(credit)).body.status, "failed");
    for (const failure of ["revoked", "grant-revoked", "rollback"]) {
      mode = failure;
      // Sightings are an existing pre-BEGIN owner behavior; make their next write identical.
      const failedAction = { ...action(`ingress_${failure.replaceAll("-", "_")}_01`), last_seen_at: "2099-01-01T00:00:00.000Z" };
      db.exec("UPDATE android_devices SET last_seen_at='2099-01-01T00:00:00.000Z', updated_at='2099-01-01T00:00:00.000Z' WHERE device_id='device-one'");
      const before = databaseState(db);
      const result = await send(failedAction);
      assert.equal(result.body.status, "failed", failure);
      assert.deepEqual(databaseState(db), before, `${failure}: full parent rollback`);
      assert.equal(db.isTransaction, false);
    }
    mode = "pre-revoked";
    const salesBeforeRevoke = db.prepare("SELECT count(*) n FROM commerce_sales").get().n;
    assert.equal((await send(action("ingress_pre_revoked_01"))).status, 403);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_sales").get().n, salesBeforeRevoke);
    token = `yal_${"d".repeat(64)}`;
    credentials.storeAndroidLocalCredential(db, "device-one", token);
    mode = "callback-throw";
    assert.equal((await send(action("ingress_callback_throw_01"))).status, 400);
    db.exec("BEGIN IMMEDIATE");
    try { denied(() => ingress.requireLocalActionPointsPrincipal(db, boundAction, captured, "c1")); }
    finally { db.exec("ROLLBACK"); }
    mode = "principal";
    const beforeCallbacks = callbacks;
    assert.equal((await send(action("ingress_bad_header"), { "X-YA-Local-Token": otherToken })).status, 401);
    assert.equal((await send(action("ingress_body_only"), { "X-YA-Local-Token": "" })).status, 401);
    assert.equal((await send(action("ingress_unknown_route"), {}, address, true, "/local/v1/points-spend")).status, 404);
    assert.equal(callbacks, beforeCallbacks);
    // A caller/hosting/outbox cannot manufacture or replay the opaque context.
    for (const context of [undefined, {}, { deviceId: "device-one", token }, captured]) {
      const result = apply(db, { ...action("ingress_non_lan_01"), device_id: "device-one" }, caps(), context);
      assert.equal(result.ok, false);
    }
    const oldEnv = process.env.NODE_ENV; process.env.NODE_ENV = "test";
    const http = new ingress.LocalCompanionServer({ ...options, testOnlyHttp: true });
    memoryListener(http);
    try {
      const plain = await http.start("127.0.0.1", 0);
      assert.equal((await send(action("ingress_plain_http_01"), {}, plain, false)).body.status, "failed");
      assert.equal(captured, undefined);
    } finally { await http.stop(); if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv; }
    mode = "legacy";
    grants.revokeAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    const noGrant = await send(action("ingress_legacy_no_grant_01"));
    assert.equal(noGrant.body.status, "applied"); assert.equal(noGrant.body.sale_receipt.pointsTenderMinor, 0);
    const legacyCredit = await send(credit);
    assert.equal(legacyCredit.body.status, "applied"); assert.equal(legacyCredit.body.sale_receipt.cashPaidMinor, 0);
    const legacy = apply(db, { ...action("ingress_legacy_01"), device_id: "device-one" }, caps());
    assert.equal(legacy.ok, true); assert.equal(legacy.receipt.pointsTenderMinor, 0);
    assert.equal(JSON.stringify(databaseState(db)).includes(token), false);
    assert.equal(JSON.stringify(databaseState(db)).includes(otherToken), false);
    assert.equal(JSON.stringify(databaseState(db)).includes(rotatedToken), false);
    assert.equal(JSON.stringify(first).includes(token), false);
    assert.equal(JSON.stringify(logEvents).includes(token), false);
    assert.equal(JSON.stringify(logEvents).includes(otherToken), false);
    assert.equal(JSON.stringify(logEvents).includes(rotatedToken), false);
    for (const value of [prepared, databaseState(db), logEvents, preparedCommit.response])
      assert.equal(JSON.stringify(value).includes(protectedKey.key.toString("hex")), false, "protected key remains internal");
    assert.ok(routes > 5);
    console.log(`PASS HTTPS-only points ingress (${memoryTls ? "in-memory TLS" : "TCP TLS"}): provenance, transaction revocation, expiry, rollback and legacy sale ACK`);
  } finally { await server.stop(); }
} finally {
  router.routeAndroidActionInTransaction = originalRoute;
  for (const level of Object.keys(originalLogs)) log[level] = originalLogs[level];
  try { if (grantWorker) await grantWorker.close(); } finally { f.close(); }
}
