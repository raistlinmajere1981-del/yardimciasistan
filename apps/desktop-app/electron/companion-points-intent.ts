import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, moneyToMinor } from "@yardimci-asistan/shared";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service.js";
import { marketAndroidActionIntentHash } from "./market-android-actions.js";
import { requireLocalActionCashSalePrincipal, requireLocalActionPointsPrincipal, type LocalCompanionActionContext } from "./local-companion-server.js";
import { benefitsOperation, canonicalBenefitsJson, loadCommerceBenefitsRules, type BenefitsTransaction } from "./commerce-benefits-rules.js";

function requireIntent(value: unknown, code = "COMPANION_POINTS_INTENT_INVALID"): asserts value {
  if (!value) throw Object.assign(new Error("Companion points intent rejected."), { code });
}
const digest = (value: unknown) => createHash("sha256").update(canonicalBenefitsJson(value)).digest("hex");
const bindings = new WeakMap<object, { database: DatabaseSync; fingerprint: string }>();

/** Internal preference only. No tenant/device, amount, quote or reservation can be supplied.
 * `couponPermitId` is the only coupon field and is an opaque, server-issued permit id;
 * the coupon code itself never enters the Android action, intent or payload. */
export interface CompanionPointsIntent { version: 1; currency: string; requestedPointsMinor: number; couponPermitId?: string }

const POINTS_INTENT_KEYS = "currency,requestedPointsMinor,version";
const COUPON_INTENT_KEYS = "couponPermitId,currency,requestedPointsMinor,version";
const COUPON_PERMIT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function intentKeys(input: CompanionPointsIntent): string { return Object.keys(input).sort().join(","); }
export function isCouponCompanionIntent(input: CompanionPointsIntent): boolean {
  return Boolean(input && typeof input.couponPermitId === "string");
}

function currentScope(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent) {
  const coupon = isCouponCompanionIntent(input);
  requireIntent(input && (intentKeys(input) === POINTS_INTENT_KEYS
      || (coupon && intentKeys(input) === COUPON_INTENT_KEYS && COUPON_PERMIT_ID.test(String(input.couponPermitId))))
    && input.version === 1 && typeof input.currency === "string" && /^[A-Z]{3}$/.test(input.currency)
    && Number.isSafeInteger(input.requestedPointsMinor) && input.requestedPointsMinor >= 0
    && (!coupon || input.requestedPointsMinor === 0)
    && Number.isSafeInteger(tx.now) && tx.now >= 0 && Number.isSafeInteger(tx.now + 30_000));
  requireIntent(action && /^[A-Za-z0-9_-]{12,120}$/.test(action.id));
  const customerId = action.payload?.customer_id;
  requireIntent(typeof customerId === "string" && customerId.length > 0);
  // Positive Puan spending proves the explicit spend grant. A zero-Puan paid-cash
  // earn or coupon sale proves the same authenticated ingress/device/customer
  // without requiring a spending permission the customer never granted.
  const principal = input.requestedPointsMinor > 0
    ? requireLocalActionPointsPrincipal(tx.database, action, context, customerId)
    : requireLocalActionCashSalePrincipal(tx.database, action, context, customerId);
  requireIntent(Object.keys(action.payload).every(key => ["lines", "location_id", "settlement", "customer_id",
    "payment_method", "external_payment_confirmed", "requestedPointsMinor", "couponPermitId"].includes(key)));
  // The opaque permit may travel only when the server intent already holds the
  // same id; a payload cannot add, replace or reuse a coupon permit opportunistically.
  if (coupon) requireIntent(action.payload.couponPermitId === input.couponPermitId, "COMPANION_POINTS_INTENT_CHANGED");
  else requireIntent(action.payload.couponPermitId === undefined, "COMPANION_POINTS_INTENT_CHANGED");
  // The only client points field is `requestedPointsMinor`. Positive spending
  // requires an explicit positive safe-integer amount exactly equal to the
  // server-held intent. Zero may be omitted or explicitly 0, but no other value.
  if (input.requestedPointsMinor > 0) {
    requireIntent(Object.prototype.hasOwnProperty.call(action.payload, "requestedPointsMinor")
      && Number.isSafeInteger(action.payload.requestedPointsMinor)
      && (action.payload.requestedPointsMinor as number) > 0,
      "COMPANION_POINTS_INTENT_INVALID");
  } else {
    requireIntent(action.payload.requestedPointsMinor === undefined || action.payload.requestedPointsMinor === 0,
      "COMPANION_POINTS_INTENT_INVALID");
  }
  requireIntent(Number(action.payload.requestedPointsMinor ?? 0) === input.requestedPointsMinor,
    "COMPANION_POINTS_INTENT_CHANGED");
  const rawLines = action.payload.lines;
  requireIntent(Array.isArray(rawLines) && rawLines.length > 0 && rawLines.length <= 200);
  const wholesale = readEnabledBusinessCapabilities(tx.database).includes(BUSINESS_CAPABILITIES.WHOLESALE);
  const seen = new Set<string>();
  const lines = rawLines.map(raw => {
    requireIntent(raw && typeof raw === "object" && !Array.isArray(raw));
    const line = raw as Record<string, unknown>;
    requireIntent(Object.keys(line).every(key => ["product_id", "quantity", "expected_unit_price", "expected_currency", "expected_updated_at"].includes(key)));
    const productId = line.product_id, quantity = line.quantity;
    requireIntent(typeof productId === "string" && productId.length > 0 && productId.length <= 128
      && productId === productId.trim() && !seen.has(productId));
    requireIntent(typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0 && quantity <= 1_000_000
      && Math.abs(quantity * 10000 - Math.round(quantity * 10000)) <= 0.00001);
    const quantityTenThousandths = Math.round(quantity * 10000);
    requireIntent(Number.isSafeInteger(quantityTenThousandths) && quantityTenThousandths > 0);
    seen.add(productId);
    const price = resolveCommerceProductPriceInDatabase(tx.database, principal.businessId, { productId, customerId }, wholesale);
    const product = tx.database.prepare("SELECT updated_at,category_id FROM catalog_products WHERE business_id=? AND id=? AND is_active=1 AND deleted_at=''")
      .get(principal.businessId, productId);
    const unitPriceMinor = moneyToMinor(price.unitPrice);
    requireIntent(product && typeof product.updated_at === "string" && product.updated_at.length > 0
      && price.currency === input.currency && Number.isSafeInteger(unitPriceMinor) && unitPriceMinor >= 0);
    // Client price/version fields remain stale-data guards, never price authority.
    requireIntent(line.expected_unit_price === price.unitPrice && line.expected_currency === price.currency
      && line.expected_updated_at === product.updated_at, "COMPANION_POINTS_INTENT_CHANGED");
    return Object.freeze({ productId, quantityTenThousandths, unitPriceMinor, currency: price.currency,
      updatedAt: product.updated_at, categoryId: String(product.category_id),
      requestedPriceGroup: price.requestedGroup, appliedPriceGroup: price.appliedGroup, dealerEligible: price.dealerEligible });
  });
  const settings = tx.database.prepare("SELECT revision,coupons_enabled,points_enabled,payment_modifiers_enabled FROM commerce_benefit_settings WHERE business_id=?")
    .get(principal.businessId);
  // Coupon redemption is enabled by the coupons family; it never needs the points
  // spend family. Points-spend/earn intents keep the original points_enabled gate.
  requireIntent(settings && Number.isSafeInteger(settings.revision) && Number(settings.revision) > 0
    && (coupon ? settings.coupons_enabled === 1 : settings.points_enabled === 1));
  const rules = loadCommerceBenefitsRules(tx.database, principal.businessId);
  // Include full canonical heads and time windows, including newly added rules.
  // This is a revision guard; it does not evaluate eligibility or tender amounts.
  const ruleRevision = digest({ settings, rules: rules.map(rule => ({ rule,
    inWindow: rule.startsAt <= tx.now && (rule.endsAt === null || tx.now < rule.endsAt) })) });
  principal.assertAuthorized();
  return Object.freeze({ version: 1 as const, businessId: principal.businessId, customerId: principal.customerId,
    deviceId: principal.deviceId, deviceRecordId: principal.deviceRecordId, authorizationEpoch: principal.authorizationEpoch,
    spendGrantGeneration: principal.spendGrantGeneration,
    actionId: action.id, actionType: action.action_type, actionIntentHash: marketAndroidActionIntentHash(action),
    channel: "companion" as const, currency: input.currency, currencyExponent: 2,
    requestedPointsMinor: input.requestedPointsMinor, lines: Object.freeze(lines), ruleRevision });
}

/** Read-only intent binding, never a spend quote, hold, reservation or authority.
 * Borrow the existing benefits parent adapter inside the canonical Android owner.
 * No durable retry/replay guarantee: these opaque objects exist in this process only.
 */
export function bindCompanionPointsIntent(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent) {
  return benefitsOperation(tx, () => {
    const scope = currentScope(tx, action, context, input);
    const binding = Object.freeze({ version: 1 as const, scope, fingerprint: digest(scope),
      generatedAtMs: tx.now, expiresAtMs: tx.now + 30_000,
      authority: Object.freeze({ state: "intent_only" as const, canReservePoints: false as const, canConfirmPoints: false as const }) });
    bindings.set(binding, { database: tx.database, fingerprint: binding.fingerprint });
    return binding;
  });
}

export type CompanionPointsIntentBinding = ReturnType<typeof bindCompanionPointsIntent>;

/** Re-read all scope and current authorization even for an exact repeated intent.
 * A failed operation poisons the borrowed benefits scope; the action owner rolls back.
 */
export function validateCompanionPointsIntent(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding) {
  return benefitsOperation(tx, () => {
    const scope = currentScope(tx, action, context, input);
    const bound = binding && bindings.get(binding);
    requireIntent(bound && bound.database === tx.database && bound.fingerprint === binding.fingerprint,
      "COMPANION_POINTS_INTENT_CHANGED");
    requireIntent(tx.now >= binding.generatedAtMs && tx.now < binding.expiresAtMs, "COMPANION_POINTS_INTENT_EXPIRED");
    requireIntent(digest(scope) === bound.fingerprint, "COMPANION_POINTS_INTENT_CHANGED");
    return binding;
  });
}
