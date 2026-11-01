import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, moneyToMinor, type BenefitsCheckoutIntent, type BenefitsPricingContext,
  type BenefitsQuote } from "@yardimci-asistan/shared";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { authorizeAndroidAction } from "./android-action-service.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service.js";
import { benefitsAssert } from "./commerce-benefits-engine.js";
import { canonicalBenefitsJson, benefitsIntentForStorage, readBenefitsFamilies,
  requireCommerceBenefitsCapability, withCommerceBenefitsTransaction, type BenefitsSecretKey,
  type BenefitsTransaction } from "./commerce-benefits-rules.js";
import { CommerceBenefitsStore, type BenefitsPricingRequest, type CommerceBenefitsParentPorts } from "./commerce-benefits-store.js";
import { authorizeAndroidLocalCredential } from "./database/android-local-credential-store.js";

/** Transient authenticated request. The coupon secret is never persisted or returned. */
export interface CompanionCouponAttemptInput {
  actionId: string;
  customerId: string;
  lines: Array<{ productId: string; quantity: number }>;
  couponCode: string;
  paymentMethod: string;
}

export interface CompanionCouponAttempt {
  permitId: string;
  expiresAtMs: number;
  quote: BenefitsQuote;
}

/** Deterministic opaque permit source. It binds device+action at issuance and is
 * re-derived at redemption from the authenticated action; it is never a sale id. */
export function companionCouponPermitSource(deviceId: string, actionId: string): { kind: "sale"; id: string } {
  return Object.freeze({ kind: "sale" as const,
    id: `coupon_${createHash("sha256").update(`${deviceId}:${actionId}`).digest("hex")}` });
}

function canonicalPayment(method: string): string {
  const value = String(method ?? "").trim();
  const canonical = value === "transfer" ? "bank" : value;
  benefitsAssert(["cash", "card", "bank", "other"].includes(canonical), "COMPANION_COUPON_DENIED");
  return canonical;
}

function boundPorts(database: DatabaseSync, credential: { deviceId: string; token: string },
  input: CompanionCouponAttemptInput, bound: BenefitsPricingRequest): CommerceBenefitsParentPorts {
  const authorize = (candidate: BenefitsPricingRequest) => {
    // Re-read the live transport credential and exact bound intent on every port call.
    benefitsAssert(authorizeAndroidLocalCredential(database, credential.deviceId, credential.token), "COMPANION_COUPON_DENIED");
    requireCommerceBenefitsCapability(database, bound.businessId);
    benefitsAssert(canonicalBenefitsJson(candidate) === canonicalBenefitsJson(bound), "COMPANION_COUPON_SCOPE");
    benefitsAssert(database.prepare("SELECT 1 FROM customers WHERE business_id = ? AND id = ? AND deleted_at = ''")
      .get(bound.businessId, input.customerId), "COMPANION_COUPON_SCOPE");
  };
  return {
    authorize(database, request, operation) {
      benefitsAssert(operation === "checkout", "COMPANION_COUPON_DENIED");
      authorize(request);
    },
    authorizeReadOnly(database, request) { authorize(request); },
    authorizePointAdjustment() { benefitsAssert(false, "COMPANION_COUPON_DENIED"); },
    resolvePricing(database, request, now): BenefitsPricingContext {
      authorize(request);
      const wholesale = readEnabledBusinessCapabilities(database).includes(BUSINESS_CAPABILITIES.WHOLESALE);
      const prices = request.lines.map(line => resolveCommerceProductPriceInDatabase(database, request.businessId,
        { productId: line.productId, customerId: input.customerId }, wholesale));
      const groups = new Set(prices.map(price => price.appliedGroup));
      benefitsAssert(groups.size === 1, "COMPANION_COUPON_PRICE_GROUP_UNSUPPORTED");
      const lines = request.lines.map((line, index) => {
        const price = prices[index]!;
        benefitsAssert(price.currency === request.currency, "COMPANION_COUPON_SCOPE");
        const product = database.prepare("SELECT category_id FROM catalog_products WHERE business_id = ? AND id = ? AND is_active = 1 AND deleted_at = ''")
          .get(request.businessId, line.productId);
        benefitsAssert(product, "COMPANION_COUPON_SCOPE");
        return { id: `line${index}`, productId: line.productId, categoryId: String(product.category_id),
          unitPriceMinor: moneyToMinor(price.unitPrice), quantityTenThousandths: line.quantityTenThousandths };
      });
      return { businessId: request.businessId, customerId: request.customerId, channel: "companion", currency: request.currency,
        currencyExponent: 2, now, customerGroups: [], priceGroup: prices[0]!.appliedGroup, lines,
        families: { coupon: false, points: false, payment_modifier: false }, availablePointsMinor: 0,
        requestedPointsMinor: 0, payment: null,
        accounting: { taxTreatment: "included_in_items", taxMinor: 0, financeMinor: 0, earnOnAccountingAdjustments: false } };
    },
    readSettlement() { return null; },
    readFullRefund() { return null; }
  };
}

function couponIntent(database: DatabaseSync, credential: { deviceId: string; token: string },
  input: CompanionCouponAttemptInput): BenefitsCheckoutIntent {
  benefitsAssert(input && /^[A-Za-z0-9_-]{8,120}$/.test(input.actionId), "COMPANION_COUPON_DENIED");
  benefitsAssert(typeof input.customerId === "string" && input.customerId.length > 0 && input.customerId.length <= 128
    && input.customerId === input.customerId.trim(), "COMPANION_COUPON_DENIED");
  benefitsAssert(typeof input.couponCode === "string" && input.couponCode.length > 0 && input.couponCode.length <= 256,
    "COMPANION_COUPON_DENIED");
  benefitsAssert(Array.isArray(input.lines) && input.lines.length > 0 && input.lines.length <= 200, "COMPANION_COUPON_DENIED");
  const business = database.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
  const businessId = String(business?.id ?? "");
  benefitsAssert(businessId, "COMPANION_COUPON_DENIED");
  requireCommerceBenefitsCapability(database, businessId);
  const capabilities = readEnabledBusinessCapabilities(database);
  benefitsAssert([BUSINESS_CAPABILITIES.CUSTOMERS, BUSINESS_CAPABILITIES.SALES, BUSINESS_CAPABILITIES.CATALOG]
    .every(capability => capabilities.includes(capability)), "COMPANION_COUPON_DENIED");
  // Reuse the existing paid-sale device permission gate; this is not spend authority.
  const action: AndroidSyncAction = { id: input.actionId, action_type: "market_sale_complete",
    device_id: credential.deviceId, payload: { settlement: "paid", customer_id: input.customerId },
    created_at: new Date().toISOString(), status: "pending", error_message: "" };
  benefitsAssert(authorizeAndroidAction(database, action, capabilities).ok, "COMPANION_COUPON_DENIED");
  const seen = new Set<string>();
  const lines = input.lines.map(raw => {
    benefitsAssert(raw && typeof raw.productId === "string" && raw.productId.length > 0 && raw.productId.length <= 128
      && raw.productId === raw.productId.trim() && !seen.has(raw.productId), "COMPANION_COUPON_DENIED");
    seen.add(raw.productId);
    benefitsAssert(typeof raw.quantity === "number" && Number.isFinite(raw.quantity) && raw.quantity > 0
      && raw.quantity <= 1_000_000 && Math.abs(raw.quantity * 10000 - Math.round(raw.quantity * 10000)) <= 0.00001,
      "COMPANION_COUPON_DENIED");
    const quantityTenThousandths = Math.round(raw.quantity * 10000);
    benefitsAssert(Number.isSafeInteger(quantityTenThousandths) && quantityTenThousandths > 0, "COMPANION_COUPON_DENIED");
    return { productId: raw.productId, quantityTenThousandths };
  });
  const currency = String(database.prepare("SELECT currency FROM catalog_products WHERE business_id = ? AND id = ? AND is_active = 1 AND deleted_at = ''")
    .get(businessId, lines[0]!.productId)?.currency ?? "");
  benefitsAssert(/^[A-Z]{3}$/.test(currency), "COMPANION_COUPON_DENIED");
  // Opaque deterministic source binds the permit to this device and action; it is not a sale ID.
  const sourceId = companionCouponPermitSource(credential.deviceId, input.actionId).id;
  const intent: BenefitsCheckoutIntent = { businessId, customerId: input.customerId,
    source: { kind: "sale", id: sourceId }, channel: "companion", currency, lines,
    couponCodes: [input.couponCode], paymentMethodId: canonicalPayment(input.paymentMethod), requestedPointsMinor: 0 };
  benefitsIntentForStorage(intent);
  return intent;
}

/** Pre-BEGIN standalone authorization. Mints only the existing 60-second coupon
 * attempt permit and an advisory quote. It never reserves a coupon, holds points,
 * writes a sale/Finance/receipt row or authorizes a mobile sale. */
export function authorizeCompanionCouponAttempt(database: DatabaseSync, credential: { deviceId: string; token: string },
  input: CompanionCouponAttemptInput, key: BenefitsSecretKey, now = Date.now()): CompanionCouponAttempt | null {
  if (database.isTransaction || !Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + 60_000)) return null;
  try {
    benefitsAssert(authorizeAndroidLocalCredential(database, credential.deviceId, credential.token), "COMPANION_COUPON_DENIED");
    const intent = couponIntent(database, credential, input);
    const bound = benefitsIntentForStorage(intent);
    let families = readBenefitsFamilies(database, intent.businessId);
    benefitsAssert(families.coupon, "COMPANION_COUPON_UNAVAILABLE");
    const store = new CommerceBenefitsStore(key, boundPorts(database, credential, input, bound));
    const attempt = store.authorizeCouponAttempt(database, intent, `companion:${credential.deviceId}`, now);
    if (!attempt.ok) return null;
    const preview = withCommerceBenefitsTransaction(database, now, (tx: BenefitsTransaction) => store.preview(tx, intent, attempt.authorizationId));
    families = readBenefitsFamilies(database, intent.businessId);
    benefitsAssert(families.coupon && preview.quote.discountMinor > 0 && preview.quote.payableMinor < preview.quote.subtotalMinor,
      "COMPANION_COUPON_UNAVAILABLE");
    return Object.freeze({ permitId: attempt.authorizationId, expiresAtMs: now + 60_000,
      quote: Object.freeze({ ...preview.quote, adjustments: Object.freeze(preview.quote.adjustments.map(value => Object.freeze({ ...value }))) }) });
  } catch {
    return null;
  }
}
