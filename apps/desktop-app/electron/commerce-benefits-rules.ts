import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, type BenefitsCheckoutIntent, type BenefitsFamilies, type BenefitsRule } from "@yardimci-asistan/shared";
import { benefitsAssert, minor, validateBenefitsRule } from "./commerce-benefits-engine.js";

export interface BenefitsTransaction { readonly database: DatabaseSync; readonly now: number }
const transactions = new WeakMap<BenefitsTransaction, { failed: boolean }>();
const activeDatabases = new WeakMap<DatabaseSync, { failed: boolean }>();
function assertNoBenefitsScope(database: DatabaseSync): void {
  const active = activeDatabases.get(database);
  if (active) active.failed = true;
  benefitsAssert(!active, "BENEFITS_PARENT_TRANSACTION_REQUIRED");
}

/** Borrow only an existing synchronous parent transaction; caller must roll back on ANY error. */
export function withCommerceBenefitsParentTransaction<T>(database: DatabaseSync, now: number, parent: (tx: BenefitsTransaction) => T): T {
  minor(now);
  assertNoBenefitsScope(database);
  benefitsAssert(database.isTransaction, "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  const tx: BenefitsTransaction = { database, now };
  const state = { failed: false };
  transactions.set(tx, state);
  activeDatabases.set(database, state);
  try {
    const result = parent(tx);
    benefitsAssert(!(result && typeof (result as { then?: unknown }).then === "function"), "BENEFITS_ASYNC_TRANSACTION_FORBIDDEN");
    benefitsAssert(!state.failed && database.isTransaction, "BENEFITS_TRANSACTION_ABORTED");
    return result;
  } finally {
    transactions.delete(tx);
    activeDatabases.delete(database);
  }
}
/** The parent writes sale/finance/outbox and benefits in this SAME synchronous transaction. */
export function withCommerceBenefitsTransaction<T>(database: DatabaseSync, now: number, parent: (tx: BenefitsTransaction) => T): T {
  minor(now);
  assertNoBenefitsScope(database);
  benefitsAssert(!database.isTransaction, "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  database.exec("BEGIN IMMEDIATE");
  const tx: BenefitsTransaction = { database, now };
  const state = { failed: false };
  transactions.set(tx, state);
  activeDatabases.set(database, state);
  try {
    const result = parent(tx);
    benefitsAssert(!(result && typeof (result as { then?: unknown }).then === "function"), "BENEFITS_ASYNC_TRANSACTION_FORBIDDEN");
    benefitsAssert(!state.failed && database.isTransaction, "BENEFITS_TRANSACTION_ABORTED");
    database.exec("COMMIT");
    return result;
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  } finally { transactions.delete(tx); activeDatabases.delete(database); }
}
export function benefitsOperation<T>(tx: BenefitsTransaction, operation: () => T): T {
  const state = transactions.get(tx);
  benefitsAssert(state && !state.failed && tx.database.isTransaction, "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  try {
    const result = operation();
    benefitsAssert(!(result && typeof (result as { then?: unknown }).then === "function"), "BENEFITS_ASYNC_TRANSACTION_FORBIDDEN");
    return result;
  } catch (error) { state.failed = true; throw error; }
}

/** Internal bridge for allocated-source sale owners borrowing the existing
 * benefits parent. Confers no authority and opens no transaction. Preserve the
 * original owner error, but never let a caught failure reach the parent's ACK.
 * Legacy callers without a benefits scope keep their existing error behavior.
 */
export function withCommerceBenefitsParentFailureBoundary<T>(database: DatabaseSync, operation: () => T): T {
  const state = activeDatabases.get(database);
  if (!state) return operation();
  benefitsAssert(!state.failed && database.isTransaction, "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  try {
    const result = operation();
    benefitsAssert(!(result && typeof (result as { then?: unknown }).then === "function"), "BENEFITS_ASYNC_TRANSACTION_FORBIDDEN");
    return result;
  } catch (error) { state.failed = true; throw error; }
}
export function canonicalBenefitsJson(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, nested]) => [key, canonical(nested)]));
    benefitsAssert(item === null || typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isSafeInteger(item)), "BENEFITS_INVALID_JSON");
    return item;
  };
  return JSON.stringify(canonical(value));
}
export interface BenefitsSecretKey { id: string; key: Uint8Array }
export function benefitsHmac(key: BenefitsSecretKey, businessId: string, purpose: string, value: unknown): string {
  benefitsAssert(key.key.byteLength >= 32 && /^[a-zA-Z0-9_-]{1,64}$/.test(key.id), "BENEFITS_SECRET_KEY_REQUIRED");
  return createHmac("sha256", key.key).update(canonicalBenefitsJson([purpose, businessId, value])).digest("hex");
}
export function normalizeBenefitCouponSecret(value: string): string {
  benefitsAssert(typeof value === "string" && value.length <= 128, "BENEFITS_COUPON_UNAVAILABLE");
  benefitsAssert(/^[A-Za-z0-9 -]+$/.test(value.trim()), "BENEFITS_COUPON_UNAVAILABLE");
  const normalized = value.trim().replace(/[ -]/g, "").toUpperCase();
  benefitsAssert(/^[A-Z0-9]{26,64}$/.test(normalized), "BENEFITS_COUPON_UNAVAILABLE");
  return normalized;
}
export function benefitsIntentForStorage(intent: BenefitsCheckoutIntent): Omit<BenefitsCheckoutIntent, "couponCodes"> {
  benefitsAssert(intent && /^[A-Z]{3}$/.test(intent.currency) && ["sale", "commerce_order", "table_order"].includes(intent.source.kind)
    && ["desktop_cart", "desktop_desk", "web", "web_dealer", "companion"].includes(intent.channel), "BENEFITS_INVALID_INTENT");
  for (const id of [intent.businessId, intent.source.id, ...(intent.customerId === null ? [] : [intent.customerId])]) {
    benefitsAssert(typeof id === "string" && id.length > 0 && id.length <= 128, "BENEFITS_INVALID_INTENT");
  }
  minor(intent.requestedPointsMinor);
  benefitsAssert(intent.paymentMethodId === null || (typeof intent.paymentMethodId === "string" && intent.paymentMethodId.length > 0 && intent.paymentMethodId.length <= 128), "BENEFITS_INVALID_INTENT");
  benefitsAssert(Array.isArray(intent.lines) && intent.lines.length > 0 && intent.lines.length <= 1000, "BENEFITS_INVALID_INTENT");
  const lines = intent.lines as BenefitsCheckoutIntent["lines"];
  for (const line of lines) benefitsAssert(typeof line.productId === "string" && line.productId.length > 0
    && line.productId.length <= 128 && minor(line.quantityTenThousandths) > 0, "BENEFITS_INVALID_INTENT");
  return { businessId: intent.businessId, customerId: intent.customerId, source: { kind: intent.source.kind, id: intent.source.id },
    channel: intent.channel, currency: intent.currency,
    lines: lines.map(line => ({ productId: line.productId, quantityTenThousandths: line.quantityTenThousandths })),
    paymentMethodId: intent.paymentMethodId, requestedPointsMinor: intent.requestedPointsMinor };
}
export function benefitsIntentHmac(key: BenefitsSecretKey, intent: BenefitsCheckoutIntent): string {
  const stored = benefitsIntentForStorage(intent);
  benefitsAssert(Array.isArray(intent.couponCodes) && intent.couponCodes.length <= 8, "BENEFITS_COUPON_UNAVAILABLE");
  const couponCodes = intent.couponCodes as readonly string[];
  const codes = couponCodes.map(code => benefitsHmac(key, intent.businessId, "coupon", normalizeBenefitCouponSecret(code))).sort();
  benefitsAssert(new Set(codes).size === codes.length, "BENEFITS_COUPON_UNAVAILABLE");
  return benefitsHmac(key, intent.businessId, "checkout", { ...stored, codes });
}
export function requireCommerceBenefitsCapability(database: DatabaseSync, businessId: string): void {
  benefitsAssert(database.prepare("SELECT 1 FROM business WHERE id = ? AND deleted_at = ''").get(businessId), "BENEFITS_TENANT_REQUIRED");
  const rows = database.prepare("SELECT capability_id FROM business_capabilities WHERE business_id = ? AND is_enabled = 1").all(businessId) as { capability_id: string }[];
  const enabled = new Set(rows.map(row => row.capability_id));
  benefitsAssert([C.COMMERCE_BENEFITS, C.CUSTOMERS, C.CATALOG].every(capability => enabled.has(capability))
    && (enabled.has(C.SALES) || enabled.has(C.ORDERS)), "BENEFITS_CAPABILITY_DISABLED");
}
export function readBenefitsFamilies(database: DatabaseSync, businessId: string): BenefitsFamilies {
  requireCommerceBenefitsCapability(database, businessId);
  const row = database.prepare("SELECT coupons_enabled, points_enabled, payment_modifiers_enabled FROM commerce_benefit_settings WHERE business_id = ?")
    .get(businessId) as { coupons_enabled: number; points_enabled: number; payment_modifiers_enabled: number } | undefined;
  return { coupon: row?.coupons_enabled === 1, points: row?.points_enabled === 1, payment_modifier: row?.payment_modifiers_enabled === 1 };
}
export function configureCommerceBenefits(tx: BenefitsTransaction, businessId: string, families: BenefitsFamilies): void {
  return benefitsOperation(tx, () => {
    requireCommerceBenefitsCapability(tx.database, businessId);
    benefitsAssert(Object.keys(families).sort().join(",") === "coupon,payment_modifier,points"
      && Object.values(families).every(value => typeof value === "boolean"), "BENEFITS_INVALID_CONTEXT");
    if (!families.points) {
      tx.database.prepare("DELETE FROM android_benefits_balance_grants WHERE business_id = ?").run(businessId);
      tx.database.prepare("DELETE FROM android_benefits_spend_grants WHERE business_id = ?").run(businessId);
    }
    tx.database.prepare(`INSERT INTO commerce_benefit_settings VALUES (?,?,?,?,1,?) ON CONFLICT(business_id) DO UPDATE SET
      coupons_enabled = excluded.coupons_enabled, points_enabled = excluded.points_enabled,
      payment_modifiers_enabled = excluded.payment_modifiers_enabled, revision = revision + 1, updated_at_ms = excluded.updated_at_ms`)
      .run(businessId, Number(families.coupon), Number(families.points), Number(families.payment_modifier), tx.now);
  });
}
export function saveCommerceBenefitsRule(tx: BenefitsTransaction, businessId: string, value: unknown): BenefitsRule {
  return benefitsOperation(tx, () => {
    requireCommerceBenefitsCapability(tx.database, businessId);
    const rule = validateBenefitsRule(value);
    const head = tx.database.prepare("SELECT version FROM commerce_benefit_rule_heads WHERE business_id = ? AND rule_id = ?")
      .get(businessId, rule.id) as { version: number } | undefined;
    benefitsAssert(rule.version === (head?.version ?? 0) + 1, "BENEFITS_RULE_VERSION_CONFLICT");
    tx.database.prepare("INSERT INTO commerce_benefit_rules(business_id,id,version,canonical_json) VALUES (?,?,?,?)")
      .run(businessId, rule.id, rule.version, canonicalBenefitsJson(rule));
    tx.database.prepare("INSERT INTO commerce_benefit_rule_heads VALUES (?,?,?) ON CONFLICT(business_id,rule_id) DO UPDATE SET version = excluded.version")
      .run(businessId, rule.id, rule.version);
    return rule;
  });
}
/** Projection deliberately selects only canonical rules, never code hashes/secrets. */
export function loadCommerceBenefitsRules(database: DatabaseSync, businessId: string): BenefitsRule[] {
  requireCommerceBenefitsCapability(database, businessId);
  const rows = database.prepare(`SELECT r.canonical_json FROM commerce_benefit_rule_heads h JOIN commerce_benefit_rules r
    ON r.business_id = h.business_id AND r.id = h.rule_id AND r.version = h.version WHERE h.business_id = ? ORDER BY r.id`)
    .all(businessId) as { canonical_json: string }[];
  return rows.map(row => validateBenefitsRule(JSON.parse(row.canonical_json)));
}
/** Server-only issue operation returns a random 160-bit code exactly once. No plaintext persists. */
export function issueCommerceBenefitCoupon(tx: BenefitsTransaction, businessId: string, key: BenefitsSecretKey,
  input: { ruleId: string; maxUses: number; maxUsesPerCustomer: number | null; expiresAt: number }): { codeId: string; secret: string } {
  return benefitsOperation(tx, () => {
    const rule = loadCommerceBenefitsRules(tx.database, businessId).find(item => item.id === input.ruleId);
    benefitsAssert(rule?.family === "coupon", "BENEFITS_COUPON_UNAVAILABLE");
    benefitsAssert(minor(input.maxUses) > 0 && (input.maxUsesPerCustomer === null || minor(input.maxUsesPerCustomer) > 0) && minor(input.expiresAt) > tx.now, "BENEFITS_INVALID_COUPON_LIMIT");
    const secret = randomBytes(20).toString("hex").toUpperCase();
    const codeId = randomUUID();
    tx.database.prepare("INSERT INTO commerce_benefit_coupon_codes VALUES (?,?,?,?,?,'active',?,?,?,?)")
      .run(businessId, codeId, rule.id, key.id, benefitsHmac(key, businessId, "coupon", secret), input.maxUses, input.maxUsesPerCustomer, input.expiresAt, tx.now);
    return { codeId, secret };
  });
}
