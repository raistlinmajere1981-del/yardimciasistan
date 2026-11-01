import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

// Isolated source compilation: no Desktop build, generated repo artifacts or real data.
const compiled = mkdtempSync(join(tmpdir(), "benefits-modules-"));
const require = createRequire(import.meta.url);
for (const name of ["engine", "rules", "points", "store"]) {
  const source = readFileSync(resolve(`apps/desktop-app/electron/commerce-benefits-${name}.ts`), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  writeFileSync(join(compiled, `commerce-benefits-${name}.js`), js.replaceAll('require("@yardimci-asistan/shared")', 'require("./shared-capabilities.js")'));
}
writeFileSync(join(compiled, "shared-capabilities.js"), ts.transpileModule(readFileSync("packages/shared/types/business-capabilities.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText);
process.on("exit", () => rmSync(compiled, { recursive: true, force: true }));
export const capabilities = require(join(compiled, "shared-capabilities.js"));
export const engine = require(join(compiled, "commerce-benefits-engine.js"));
export const rules = require(join(compiled, "commerce-benefits-rules.js"));
export const points = require(join(compiled, "commerce-benefits-points.js"));
export const { CommerceBenefitsStore } = require(join(compiled, "commerce-benefits-store.js"));
export const NOW = Date.parse("2026-10-28T09:00:00Z");
export const secretKey = { id: "fixture-key", key: Buffer.alloc(32, 17) };
export const scope = {
  channels: ["desktop_cart", "desktop_desk", "web", "web_dealer", "companion"],
  customerIds: [], customerGroups: [], priceGroups: [], productIds: [], categoryIds: [], excludedProductIds: [], excludedCategoryIds: []
};
export function rule(id, family, overrides = {}) {
  return { schemaVersion: 1, id, version: 1, family, status: "active", currency: "TRY", startsAt: NOW - 1000, endsAt: null,
    priority: 0, scope: structuredClone(scope), minSpendMinor: 0, maxBenefitMinor: null, percentBps: 0, fixedMinor: 0,
    allowCouponStacking: false, combinesWith: ["coupon", "points", "payment_modifier"],
    paymentMethodIds: family === "payment_modifier" ? ["bank"] : [],
    points: family === "points" ? { operation: "earn", earnBase: "after_points", expiryDays: null } : null, ...overrides };
}
export function exampleRules() {
  return [rule("coupon100", "coupon", { fixedMinor: 10000 }), rule("bank5", "payment_modifier", { percentBps: 500 }),
    rule("spend", "points", { percentBps: 10000, points: { operation: "redeem", earnBase: "after_points", expiryDays: null } }),
    rule("earn", "points", { percentBps: 250 })];
}
export function context(overrides = {}) {
  return { businessId: "b1", customerId: "c1", customerGroups: [], priceGroup: "retail", channel: "desktop_cart", currency: "TRY",
    currencyExponent: 2, now: NOW, families: { coupon: true, points: true, payment_modifier: true },
    lines: [{ id: "line1", productId: "p1", categoryId: "category1", unitPriceMinor: 100000, quantityTenThousandths: 10000 }],
    payment: { methodId: "bank", confirmed: true }, requestedPointsMinor: 10000, availablePointsMinor: 10000,
    accounting: { taxTreatment: "included_in_items", taxMinor: 0, financeMinor: 0, earnOnAccountingAdjustments: false }, ...overrides };
}
export function intent(overrides = {}) {
  return { businessId: "b1", customerId: "c1", source: { kind: "sale", id: "sale1" }, channel: "desktop_cart", currency: "TRY",
    lines: [{ productId: "p1", quantityTenThousandths: 10000 }], couponCodes: [], paymentMethodId: "bank", requestedPointsMinor: 0, ...overrides };
}
export function parentPorts() {
  return {
    authorize(db, request) {
      assert.ok(db.prepare("SELECT 1 FROM business WHERE id = ? AND deleted_at = ''").get(request.businessId));
    },
    authorizePointAdjustment(db, businessId, customerId) {
      assert.ok(db.prepare("SELECT 1 FROM customers WHERE business_id = ? AND id = ?").get(businessId, customerId));
    },
    resolvePricing(db, request, now) {
      // Test-only parent adapter. Phase B must inject the EXISTING price/settlement owners.
      const commercial = request.customerId ? db.prepare("SELECT dealer_status,price_group FROM customer_commercial_profiles WHERE business_id = ? AND customer_id = ?")
        .get(request.businessId, request.customerId) : null;
      const group = commercial?.dealer_status === "active" ? commercial.price_group : "retail";
      const lines = request.lines.map((line, index) => {
        const product = db.prepare("SELECT * FROM catalog_products WHERE business_id = ? AND id = ? AND deleted_at = '' AND is_active = 1")
          .get(request.businessId, line.productId);
        assert.ok(product);
        assert.equal(product.currency, request.currency);
        const price = group === "dealer_a" ? product.dealer_price_a ?? product.sale_price
          : group === "dealer_b" ? product.dealer_price_b ?? product.sale_price : product.sale_price;
        return { id: `line${index}`, productId: product.id, categoryId: product.category_id, unitPriceMinor: Math.round(price * 100), quantityTenThousandths: line.quantityTenThousandths };
      });
      const payment = request.paymentMethodId ? db.prepare(`SELECT canonical_method FROM commerce_benefit_payment_methods
        WHERE business_id = ? AND channel = ? AND external_method = ? AND enabled = 1`)
        .get(request.businessId, request.channel, request.paymentMethodId) : null;
      return context({ businessId: request.businessId, customerId: request.customerId, channel: request.channel, currency: request.currency,
        now, priceGroup: group, lines, requestedPointsMinor: request.requestedPointsMinor,
        payment: payment ? { methodId: payment.canonical_method, confirmed: true } : null });
    },
    readSettlement(db, source) {
      const row = db.prepare("SELECT payload_json FROM benefits_fixture_settlement WHERE source_kind = ? AND source_id = ?")
        .get(source.kind, source.id);
      return row ? JSON.parse(row.payload_json) : null;
    },
    readFullRefund(db, source) {
      const row = db.prepare("SELECT payload_json FROM benefits_fixture_refund WHERE source_kind = ? AND source_id = ?")
        .get(source.kind, source.id);
      return row ? JSON.parse(row.payload_json) : null;
    }
  };
}
export function fixture(options = {}) {
  const dir = options.existingPath ? null : mkdtempSync(join(tmpdir(), "benefits-db-"));
  const path = options.existingPath ?? join(dir, "fixture.sqlite");
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const store = new CommerceBenefitsStore(secretKey, parentPorts());
  const transact = (fn, now = NOW) => rules.withCommerceBenefitsTransaction(db, now, fn);
  if (!options.existingPath) {
    db.exec(readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(`CREATE TABLE benefits_fixture_settlement(source_kind TEXT,source_id TEXT,payload_json TEXT,PRIMARY KEY(source_kind,source_id));
      CREATE TABLE benefits_fixture_refund(source_kind TEXT,source_id TEXT,payload_json TEXT,PRIMARY KEY(source_kind,source_id));`);
    for (const businessId of ["b1", "b2"]) {
      db.prepare("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES (?,?,?,'market','fixture','fixture')")
        .run(businessId, businessId, businessId);
      for (const capability of ["commerce.benefits", "commerce.catalog", "core.customers", "commerce.sales"]) {
        db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES (?,?,'fixture','fixture')")
          .run(businessId, capability);
      }
      for (const channel of scope.channels) for (const method of ["bank", "cash", "card"]) {
        db.prepare("INSERT INTO commerce_benefit_payment_methods VALUES (?,?,?,?,1)").run(businessId, channel, method, method);
      }
      transact(tx => rules.configureCommerceBenefits(tx, businessId, { coupon: true, points: true, payment_modifier: true }));
    }
    for (const [id, businessId] of [["c1", "b1"], ["c2", "b1"], ["c3", "b2"]]) {
      db.prepare("INSERT INTO customers(id,full_name,phone,created_at,updated_at,business_id) VALUES (?,?,?,'fixture','fixture',?)")
        .run(id, id, "", businessId);
    }
    db.prepare(`INSERT INTO catalog_products(id,business_id,category_id,name,sale_price,dealer_price_a,currency,created_at,updated_at)
      VALUES ('p1','b1','category1','Fixture product',1000,800,'TRY','fixture','fixture')`).run();
  }
  return { db, path, store, transact, close() { db.close(); if (dir) rmSync(dir, { recursive: true, force: true }); } };
}
export function installRules(f, values = exampleRules(), businessId = "b1") {
  f.transact(tx => { for (const value of values) rules.saveCommerceBenefitsRule(tx, businessId, value); });
}
export function adjust(f, amount = 10000, overrides = {}) {
  const input = { businessId: "b1", customerId: "c1", currency: "TRY", amountMinor: amount, expiresAt: null,
    reason: "opening_balance", operationKey: "opening", ...overrides };
  return f.transact(tx => f.store.adjustPoints(tx, input));
}
export function issue(f, overrides = {}) {
  return f.transact(tx => rules.issueCommerceBenefitCoupon(tx, "b1", secretKey,
    { ruleId: "coupon100", maxUses: 1, maxUsesPerCustomer: 1, expiresAt: NOW + 600000, ...overrides }));
}
export function permit(f, request, now = NOW, principal = "fixture-actor") {
  const result = f.store.authorizeCouponAttempt(f.db, request, principal, now);
  assert.equal(result.ok, true);
  return result.authorizationId;
}
export function evidence(f, request, receipt, overrides = {}) {
  const quote = receipt.quote;
  const payload = { businessId: request.businessId, customerId: request.customerId, source: request.source, state: "paid",
    currency: quote.currency, paymentMethodId: request.paymentMethodId, paidMinor: quote.payableMinor, pointsTenderMinor: quote.pointsTenderMinor,
    subtotalMinor: quote.subtotalMinor, discountMinor: quote.discountMinor, accountingMinor: quote.accountingMinor, ...overrides };
  f.db.prepare("INSERT OR REPLACE INTO benefits_fixture_settlement VALUES (?,?,?)")
    .run(request.source.kind, request.source.id, JSON.stringify(payload));
}
export function refundEvidence(f, request) {
  f.db.prepare("INSERT INTO benefits_fixture_refund VALUES (?,?,?)")
    .run(request.source.kind, request.source.id, JSON.stringify({ businessId: request.businessId, customerId: request.customerId,
      source: request.source, fullRefundConfirmed: true }));
}
export function balance(f, customerId = "c1", currency = "TRY", now = NOW) {
  return points.readCommercePointBalance(f.db, "b1", customerId, currency, now);
}
