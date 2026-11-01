import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  BenefitsCheckoutIntent, BenefitsPricingContext, BenefitsQuote, BenefitsReservationReceipt,
  BenefitsRule, BenefitsSettlementReceipt, BenefitsSource
} from "@yardimci-asistan/shared";
import { benefitsAssert, benefitsRuleMatches, calculateCommerceBenefits, CommerceBenefitsError, minor } from "./commerce-benefits-engine.js";
import {
  benefitsHmac, benefitsIntentForStorage, benefitsIntentHmac, benefitsOperation, canonicalBenefitsJson,
  loadCommerceBenefitsRules, normalizeBenefitCouponSecret, readBenefitsFamilies, requireCommerceBenefitsCapability,
  withCommerceBenefitsTransaction, type BenefitsSecretKey, type BenefitsTransaction
} from "./commerce-benefits-rules.js";
import {
  adjustCommercePoints, expireCommercePoints, grantSettledCommercePoints, insertCommercePointHold, planCommercePointHold,
  readCommercePointBalance, requireBenefitsCustomer, reverseSettledCommercePoints, spendCommercePointHold
} from "./commerce-benefits-points.js";

export type BenefitsPricingRequest = Omit<BenefitsCheckoutIntent, "couponCodes">;
/** Required SERVER-ONLY ports. Never populate these from renderer/HTTP quote fields.
 * Phase B connects existing sale/table/finance owners; Phase C must use this same
 * authority and existing outbox/ACK, without a second point writer on hosting.
 */
export interface CommerceBenefitsParentPorts {
  /** Internal advisory reader only; never used by any mutation authorization. */
  authorizeReadOnly?(database: DatabaseSync, request: BenefitsPricingRequest): void;
  authorize(database: DatabaseSync, request: BenefitsPricingRequest, operation: "checkout" | "refund"): void;
  authorizePointAdjustment(database: DatabaseSync, businessId: string, customerId: string): void;
  resolvePricing(database: DatabaseSync, request: BenefitsPricingRequest, now: number): BenefitsPricingContext;
  readSettlement(database: DatabaseSync, source: BenefitsSource): null | {
    businessId: string; customerId: string | null; source: BenefitsSource;
    state: "paid" | "fulfilled_paid" | "pending" | "open" | "credit";
    currency: string; paymentMethodId: string | null; paidMinor: number; pointsTenderMinor: number;
    subtotalMinor: number; discountMinor: number; accountingMinor: number;
  };
  readFullRefund(database: DatabaseSync, source: BenefitsSource): null | {
    businessId: string; customerId: string | null; source: BenefitsSource; fullRefundConfirmed: boolean;
  };
}
interface ReservationRow {
  id: string; customer_id: string | null; source_kind: BenefitsSource["kind"]; source_id: string; currency: string;
  status: "active" | "settled" | "released" | "expired"; intent_json: string; context_json: string;
  quote_json: string; rules_json: string; points_minor: number; expires_at_ms: number;
}
interface CouponRow {
  id: string; rule_id: string; status: string; max_uses: number; max_uses_per_customer: number | null; expires_at_ms: number;
}
export interface BenefitsReversalReceipt { version: 1; snapshotId: string; pointEntryIds: readonly string[]; couponUsageRestored: false }

declare const reservationIssuanceBrand: unique symbol;
/** Internal, process-local gate; never mutation authority or a durable receipt. */
export interface BenefitsReservationIssuanceGate { readonly [reservationIssuanceBrand]: true }
const reservationIssuances = new WeakMap<BenefitsReservationIssuanceGate, {
  tx: BenefitsTransaction; request: string; operationKey: string; keyProof: string;
  expectedQuote: string; beforeReserve: () => void; attempted: boolean;
  receipt?: BenefitsReservationReceipt; receiptEvidence?: string;
}>();

export class CommerceBenefitsStore {
  constructor(private readonly key: BenefitsSecretKey, private readonly ports: CommerceBenefitsParentPorts) {
    benefitsHmac(key, "key-validation", "configuration", null);
  }
  private digest(businessId: string, purpose: string, value: unknown): string { return benefitsHmac(this.key, businessId, purpose, value); }
  private authorize(database: DatabaseSync, intent: BenefitsPricingRequest, operation: "checkout" | "refund" = "checkout"): void {
    this.ports.authorize(database, intent, operation);
    if (intent.customerId !== null) requireBenefitsCustomer(database, intent.businessId, intent.customerId);
  }
  private receipt<T>(tx: BenefitsTransaction, businessId: string, key: string, operation: string, digest: string): T | null {
    benefitsAssert(typeof key === "string" && /^[a-zA-Z0-9_.:-]{1,128}$/.test(key), "BENEFITS_OPERATION_KEY_REQUIRED");
    const row = tx.database.prepare("SELECT operation,intent_hmac,receipt_json FROM commerce_benefit_receipts WHERE business_id = ? AND operation_key = ?")
      .get(businessId, key) as { operation: string; intent_hmac: string; receipt_json: string } | undefined;
    if (!row) return null;
    benefitsAssert(row.operation === operation && row.intent_hmac === digest, "BENEFITS_IDEMPOTENCY_INTENT_CHANGED");
    return JSON.parse(row.receipt_json) as T;
  }
  private saveReceipt(tx: BenefitsTransaction, businessId: string, key: string, operation: string, digest: string, receipt: unknown): void {
    tx.database.prepare("INSERT INTO commerce_benefit_receipts VALUES (?,?,?,?,?,?)")
      .run(businessId, key, operation, digest, canonicalBenefitsJson(receipt), tx.now);
  }
  /** This entrypoint owns ONLY the short rate-limit transaction, before parent BEGIN IMMEDIATE.
   * principalId must be server-derived authenticated actor/device/IP identity, never request JSON.
   * Failed/malformed/expired attempts commit the same durable counters; no secret is returned/logged.
   */
  authorizeCouponAttempt(database: DatabaseSync, intent: BenefitsCheckoutIntent, principalId: string, now: number):
    { ok: true; authorizationId: string } | { ok: false; code: "BENEFITS_COUPON_UNAVAILABLE" | "BENEFITS_COUPON_RATE_LIMITED" } {
    benefitsAssert(typeof principalId === "string" && principalId.length > 0 && principalId.length <= 256, "BENEFITS_PRINCIPAL_REQUIRED");
    return withCommerceBenefitsTransaction(database, now, tx => {
      const request = benefitsIntentForStorage(intent);
      this.authorize(database, request);
      const families = readBenefitsFamilies(database, intent.businessId);
      const window = Math.floor(now / 60000) * 60000;
      let limited = false;
      for (const [name, limit] of [[`actor:${principalId}`, 20], ["tenant-global", 1000]] as const) {
        const bucket = this.digest(intent.businessId, "coupon_rate", name);
        const row = database.prepare(`INSERT INTO commerce_benefit_coupon_rate_limits VALUES (?,?,?,1)
          ON CONFLICT(business_id,bucket_hmac,window_ms) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`)
          .get(intent.businessId, bucket, window) as { attempts: number };
        if (row.attempts > limit) limited = true;
      }
      if (limited) return { ok: false, code: "BENEFITS_COUPON_RATE_LIMITED" };
      try {
        benefitsAssert(families.coupon && intent.couponCodes.length > 0, "BENEFITS_COUPON_UNAVAILABLE");
        const digest = benefitsIntentHmac(this.key, intent);
        const rules = loadCommerceBenefitsRules(database, intent.businessId);
        const context = this.context(tx, request);
        const codes = intent.couponCodes.map(secret => {
          const row = database.prepare(`SELECT id,rule_id,status,max_uses,max_uses_per_customer,expires_at_ms
            FROM commerce_benefit_coupon_codes WHERE business_id = ? AND key_id = ? AND secret_hmac = ?`)
            .get(intent.businessId, this.key.id, this.digest(intent.businessId, "coupon", normalizeBenefitCouponSecret(secret))) as CouponRow | undefined;
          benefitsAssert(row, "BENEFITS_COUPON_UNAVAILABLE");
          this.checkCoupon(tx, request, row, null);
          benefitsAssert(rules.some(rule => rule.id === row.rule_id && benefitsRuleMatches(rule, context)), "BENEFITS_COUPON_UNAVAILABLE");
          return row;
        });
        const authorizationId = randomUUID();
        // The advisory quote and the exact storage request are sealed with the
        // permit. Redemption compares them without ever reconstructing the
        // transient coupon plaintext or its HMAC.
        const quote = calculateCommerceBenefits(context, this.selectedRules(database, intent.businessId, codes));
        database.prepare("INSERT INTO commerce_benefit_coupon_authorizations VALUES (?,?,?,?,?,NULL)")
          .run(intent.businessId, authorizationId, digest, canonicalBenefitsJson({ codes: codes.map(code => code.id), request, quote }), now + 60000);
        return { ok: true, authorizationId };
      } catch (error) {
        if (!(error instanceof CommerceBenefitsError)) throw error;
        return { ok: false, code: "BENEFITS_COUPON_UNAVAILABLE" };
      }
    });
  }
  private context(tx: BenefitsTransaction, intent: BenefitsPricingRequest, excludeReservation: string | null = null): BenefitsPricingContext {
    const context = this.ports.resolvePricing(tx.database, intent, tx.now);
    benefitsAssert(context.businessId === intent.businessId && context.customerId === intent.customerId
      && context.currency === intent.currency && context.channel === intent.channel
      && context.requestedPointsMinor === intent.requestedPointsMinor && context.now === tx.now, "BENEFITS_CONTEXT_SCOPE");
    const normalizeLines = (lines: readonly { productId: string; quantityTenThousandths: number }[]) =>
      canonicalBenefitsJson(lines.map(line => ({ productId: line.productId, quantityTenThousandths: line.quantityTenThousandths }))
        .sort((a, b) => a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : a.quantityTenThousandths - b.quantityTenThousandths));
    benefitsAssert(normalizeLines(context.lines) === normalizeLines(intent.lines), "BENEFITS_CONTEXT_SCOPE");
    // Payment owner, never a request field, confirms settlement method. Channel aliases
    // must map to this same canonical ID before the parent returns its pricing context.
    if (context.payment) benefitsAssert(intent.paymentMethodId === context.payment.methodId, "BENEFITS_PAYMENT_METHOD_CHANGED");
    const families = readBenefitsFamilies(tx.database, intent.businessId);
    const availablePointsMinor = intent.customerId ? readCommercePointBalance(tx.database, intent.businessId,
      intent.customerId, intent.currency, tx.now, excludeReservation).availableMinor : 0;
    return { ...context, families, availablePointsMinor };
  }
  private checkCoupon(tx: BenefitsTransaction, intent: BenefitsPricingRequest, code: CouponRow, excludeReservation: string | null): void {
    benefitsAssert(code.status === "active" && code.expires_at_ms > tx.now, "BENEFITS_COUPON_UNAVAILABLE");
    if (code.max_uses_per_customer !== null) benefitsAssert(intent.customerId, "BENEFITS_COUPON_CUSTOMER_REQUIRED");
    const redeemed = tx.database.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN customer_id = ? THEN 1 ELSE 0 END),0) AS customer_total
      FROM commerce_benefit_coupon_redemptions WHERE business_id = ? AND code_id = ?`)
      .get(intent.customerId, intent.businessId, code.id) as { total: number; customer_total: number };
    const held = tx.database.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN r.customer_id = ? THEN 1 ELSE 0 END),0) AS customer_total
      FROM commerce_benefit_coupon_holds h JOIN commerce_benefit_reservations r
      ON r.business_id = h.business_id AND r.id = h.reservation_id WHERE h.business_id = ? AND h.code_id = ?
      AND r.status = 'active' AND r.expires_at_ms > ? AND (? IS NULL OR r.id != ?)`)
      .get(intent.customerId, intent.businessId, code.id, tx.now, excludeReservation, excludeReservation) as { total: number; customer_total: number };
    benefitsAssert(redeemed.total + held.total < code.max_uses && (code.max_uses_per_customer === null
      || redeemed.customer_total + held.customer_total < code.max_uses_per_customer), "BENEFITS_COUPON_EXHAUSTED");
  }
  private codes(tx: BenefitsTransaction, intent: BenefitsPricingRequest, ids: readonly string[], excludeReservation: string | null): CouponRow[] {
    return ids.map(id => {
      const code = tx.database.prepare(`SELECT id,rule_id,status,max_uses,max_uses_per_customer,expires_at_ms
        FROM commerce_benefit_coupon_codes WHERE business_id = ? AND id = ?`).get(intent.businessId, id) as CouponRow | undefined;
      benefitsAssert(code, "BENEFITS_COUPON_UNAVAILABLE");
      this.checkCoupon(tx, intent, code, excludeReservation); return code;
    });
  }
  private selectedRules(database: DatabaseSync, businessId: string, codes: readonly CouponRow[]): BenefitsRule[] {
    const all = loadCommerceBenefitsRules(database, businessId);
    const selected = all.filter(rule => rule.family !== "coupon" || codes.some(code => code.rule_id === rule.id));
    benefitsAssert(selected.filter(rule => rule.family === "coupon").length === codes.length, "BENEFITS_COUPON_UNAVAILABLE");
    return selected;
  }
  /** Internal advisory quote: explicit read authority cannot authorize mutations. */
  previewReadOnly(tx: BenefitsTransaction, request: BenefitsPricingRequest) {
    return benefitsOperation(tx, () => {
      benefitsAssert(this.ports.authorizeReadOnly, "BENEFITS_READ_AUTHORIZATION_REQUIRED");
      this.ports.authorizeReadOnly(tx.database, request);
      if (request.customerId !== null) requireBenefitsCustomer(tx.database, request.businessId, request.customerId);
      const context = this.context(tx, request);
      // Coupons require their separate secret authorization; this internal reader
      // accepts no coupon codes and never expires/reserves/holds points.
      const quote = calculateCommerceBenefits(context, this.selectedRules(tx.database, request.businessId, []));
      return { quote, availablePointsMinor: context.availablePointsMinor,
        authority: { state: "read_only" as const, canReservePoints: false as const, canConfirmPoints: false as const } };
    });
  }
  /** Preview is never a redemption confirmation, including web/Companion offline previews. */
  preview(tx: BenefitsTransaction, intent: BenefitsCheckoutIntent, authorizationId: string | null = null):
    { quote: BenefitsQuote; authority: { state: "preview_only"; canConfirmPoints: false } } {
    return benefitsOperation(tx, () => {
      const request = benefitsIntentForStorage(intent); this.authorize(tx.database, request);
      const ids = this.permittedCodes(tx, intent, authorizationId);
      const codes = this.codes(tx, request, ids, null);
      const quote = calculateCommerceBenefits(this.context(tx, request), this.selectedRules(tx.database, intent.businessId, codes));
      return { quote, authority: { state: "preview_only", canConfirmPoints: false } };
    });
  }
  private permittedCodes(tx: BenefitsTransaction, intent: BenefitsCheckoutIntent, authorizationId: string | null): string[] {
    const digest = benefitsIntentHmac(this.key, intent);
    if (!intent.couponCodes.length) return [];
    const permit = tx.database.prepare(`SELECT intent_hmac,code_ids_json,expires_at_ms,reservation_id FROM commerce_benefit_coupon_authorizations
      WHERE business_id = ? AND id = ?`).get(intent.businessId, authorizationId) as {
        intent_hmac: string; code_ids_json: string; expires_at_ms: number; reservation_id: string | null;
      } | undefined;
    benefitsAssert(permit && permit.intent_hmac === digest && permit.expires_at_ms > tx.now && permit.reservation_id === null, "BENEFITS_COUPON_AUTHORIZATION_REQUIRED");
    const parsed = JSON.parse(permit.code_ids_json) as unknown;
    const ids = Array.isArray(parsed) ? parsed : (parsed as { codes?: unknown })?.codes;
    benefitsAssert(Array.isArray(ids) && ids.every(id => typeof id === "string"), "BENEFITS_COUPON_AUTHORIZATION_REQUIRED");
    return ids;
  }
  private couponPermit(tx: BenefitsTransaction, businessId: string, permitId: string, request: BenefitsPricingRequest,
    permitSource: BenefitsSource) {
    const row = tx.database.prepare(`SELECT id,intent_hmac,code_ids_json,expires_at_ms,reservation_id
      FROM commerce_benefit_coupon_authorizations WHERE business_id = ? AND id = ?`).get(businessId, permitId) as {
        id: string; intent_hmac: string; code_ids_json: string; expires_at_ms: number; reservation_id: string | null;
      } | undefined;
    benefitsAssert(row && row.expires_at_ms > tx.now && row.reservation_id === null, "BENEFITS_COUPON_AUTHORIZATION_REQUIRED");
    const parsed = JSON.parse(row.code_ids_json) as { codes?: unknown; request?: unknown; quote?: unknown } | unknown[];
    benefitsAssert(parsed && !Array.isArray(parsed), "BENEFITS_COUPON_AUTHORIZATION_REQUIRED");
    const permit = parsed as { codes: string[]; request: BenefitsPricingRequest; quote: BenefitsQuote };
    benefitsAssert(Array.isArray(permit.codes) && permit.codes.length > 0 && permit.request && permit.quote,
      "BENEFITS_COUPON_AUTHORIZATION_REQUIRED");
    const stored = benefitsIntentForStorage({ ...request, source: permit.request.source, couponCodes: [] });
    benefitsAssert(canonicalBenefitsJson(permit.request) === canonicalBenefitsJson(stored)
      && canonicalBenefitsJson(permit.request.source) === canonicalBenefitsJson(permitSource)
      && permit.request.source.kind === "sale", "BENEFITS_COUPON_AUTHORIZATION_SCOPE");
    return { row, codes: permit.codes, quote: permit.quote };
  }
  /** Redemption with a pre-issued opaque permit. The canonical sale source is the
   * reservation source; the deterministic permit source is only the issuance key,
   * never a forged sale id. Coupon codes are read from the sealed permit, not JSON. */
  reserveCouponWithPermit(tx: BenefitsTransaction, intent: BenefitsCheckoutIntent, operationKey: string,
    permitId: string, permitSource: BenefitsSource, issuance?: BenefitsReservationIssuanceGate): BenefitsReservationReceipt {
    return benefitsOperation(tx, () => {
      benefitsAssert(intent.couponCodes.length === 0, "BENEFITS_COUPON_AUTHORIZATION_SCOPE");
      const request = benefitsIntentForStorage(intent); this.authorize(tx.database, request);
      const issued = issuance && reservationIssuances.get(issuance);
      if (issuance !== undefined) {
        benefitsAssert(issued && issued.tx === tx && !issued.attempted
          && issued.operationKey === operationKey && issued.request === canonicalBenefitsJson(request)
          && issued.keyProof === this.digest(intent.businessId, "reservation-issuance", request),
        "BENEFITS_RESERVATION_ISSUANCE_SCOPE");
        issued.attempted = true;
        benefitsOperation(tx, issued.beforeReserve);
      }
      const permit = this.couponPermit(tx, intent.businessId, permitId, request, permitSource);
      requireCommerceBenefitsCapability(tx.database, intent.businessId);
      tx.database.prepare("UPDATE commerce_benefit_reservations SET status = 'expired' WHERE business_id = ? AND status = 'active' AND expires_at_ms <= ?")
        .run(intent.businessId, tx.now);
      benefitsAssert(!tx.database.prepare("SELECT 1 FROM commerce_benefit_snapshots WHERE business_id = ? AND source_kind = ? AND source_id = ?")
        .get(intent.businessId, intent.source.kind, intent.source.id), "BENEFITS_SOURCE_ALREADY_SETTLED");
      const codes = this.codes(tx, request, permit.codes, null);
      const rules = this.selectedRules(tx.database, intent.businessId, codes);
      const context = this.context(tx, request);
      const quote = calculateCommerceBenefits(context, rules);
      benefitsAssert(canonicalBenefitsJson(quote) === canonicalBenefitsJson(permit.quote) && quote.discountMinor > 0,
        "BENEFITS_COUPON_QUOTE_CHANGED");
      const expiresAt = Math.min(tx.now + 300000, ...codes.map(code => code.expires_at_ms),
        ...rules.filter(rule => quote.adjustments.some(adjustment => adjustment.ruleId === rule.id))
          .map(rule => rule.endsAt ?? Number.MAX_SAFE_INTEGER));
      benefitsAssert(expiresAt > tx.now, "BENEFITS_RESERVATION_EXPIRED");
      const reservationId = randomUUID();
      const appliedRules = rules.filter(rule => quote.adjustments.some(adjustment => adjustment.ruleId === rule.id));
      tx.database.prepare(`INSERT INTO commerce_benefit_reservations
        (business_id,id,customer_id,source_kind,source_id,currency,status,intent_json,context_json,quote_json,rules_json,points_minor,created_at_ms,expires_at_ms)
        VALUES (?,?,?,?,?,?,'active',?,?,?,?,?,?,?)`).run(intent.businessId, reservationId, intent.customerId, intent.source.kind, intent.source.id,
          intent.currency, canonicalBenefitsJson(request), canonicalBenefitsJson(context), canonicalBenefitsJson(quote),
          canonicalBenefitsJson(appliedRules), 0, tx.now, expiresAt);
      for (const code of codes) tx.database.prepare("INSERT INTO commerce_benefit_coupon_holds VALUES (?,?,?)").run(intent.businessId, reservationId, code.id);
      tx.database.prepare("UPDATE commerce_benefit_coupon_authorizations SET reservation_id = ? WHERE business_id = ? AND id = ?")
        .run(reservationId, intent.businessId, permitId);
      const digest = this.digest(intent.businessId, "coupon-reserve", { permitId, request, quote, operationKey });
      const receipt: BenefitsReservationReceipt = { version: 1, reservationId, expiresAt, quote };
      this.saveReceipt(tx, intent.businessId, operationKey, "reserve", digest, receipt);
      if (issued) { issued.receipt = receipt; issued.receiptEvidence = canonicalBenefitsJson(receipt); }
      return receipt;
    });
  }
  /** Prepare evidence only. The existing parent must still independently authorize
   * reserve. A gate is single-attempt and cannot adopt an earlier/replayed reserve.
   */
  prepareReservationIssuanceReadOnly(tx: BenefitsTransaction, request: BenefitsPricingRequest,
    operationKey: string, expectedQuote: BenefitsQuote, beforeReserve: () => void): BenefitsReservationIssuanceGate {
    return benefitsOperation(tx, () => {
      benefitsAssert(this.ports.authorizeReadOnly, "BENEFITS_READ_AUTHORIZATION_REQUIRED");
      this.ports.authorizeReadOnly(tx.database, request);
      benefitsAssert(typeof operationKey === "string" && /^[a-zA-Z0-9_.:-]{1,128}$/.test(operationKey)
        && typeof beforeReserve === "function", "BENEFITS_RESERVATION_ISSUANCE_SCOPE");
      const gate = Object.freeze({}) as BenefitsReservationIssuanceGate;
      reservationIssuances.set(gate, { tx, request: canonicalBenefitsJson(request), operationKey,
        keyProof: this.digest(request.businessId, "reservation-issuance", request),
        expectedQuote: canonicalBenefitsJson(expectedQuote), beforeReserve, attempted: false });
      return gate;
    });
  }
  /** Only the exact fresh receipt object returned by reserve with this gate can
   * prove issuance. Database receipt JSON/replay and caller-built references cannot.
   * Status/expiry/current quote must additionally pass readReservationReadOnly.
   */
  readReservationIssuanceReadOnly(tx: BenefitsTransaction, request: BenefitsPricingRequest,
    gate: BenefitsReservationIssuanceGate, receipt: BenefitsReservationReceipt) {
    return benefitsOperation(tx, () => {
      benefitsAssert(this.ports.authorizeReadOnly, "BENEFITS_READ_AUTHORIZATION_REQUIRED");
      this.ports.authorizeReadOnly(tx.database, request);
      const state = gate && reservationIssuances.get(gate);
      benefitsAssert(state && state.tx === tx && state.request === canonicalBenefitsJson(request)
        && state.keyProof === this.digest(request.businessId, "reservation-issuance", request)
        && state.receipt === receipt && state.receiptEvidence === canonicalBenefitsJson(receipt),
      "BENEFITS_RESERVATION_ISSUANCE_REQUIRED");
      return Object.freeze({ reservationId: receipt.reservationId, operationKey: state.operationKey });
    });
  }
  reserve(tx: BenefitsTransaction, intent: BenefitsCheckoutIntent, operationKey: string, authorizationId: string | null = null,
    issuance?: BenefitsReservationIssuanceGate): BenefitsReservationReceipt {
    return benefitsOperation(tx, () => {
      const request = benefitsIntentForStorage(intent); this.authorize(tx.database, request);
      const digest = benefitsIntentHmac(this.key, intent);
      const replay = this.receipt<BenefitsReservationReceipt>(tx, intent.businessId, operationKey, "reserve", digest);
      const issued = issuance && reservationIssuances.get(issuance);
      if (issuance !== undefined) {
        benefitsAssert(issued && issued.tx === tx && !issued.attempted && intent.couponCodes.length === 0
          && issued.operationKey === operationKey && issued.request === canonicalBenefitsJson(request)
          && issued.keyProof === this.digest(intent.businessId, "reservation-issuance", request),
        "BENEFITS_RESERVATION_ISSUANCE_SCOPE");
        benefitsAssert(!replay, "BENEFITS_RESERVATION_ISSUANCE_REPLAY");
        issued.attempted = true;
        // No async gap or new transaction: recheck authenticated source/grant and
        // canonical quote immediately before the existing reserve writer.
        benefitsOperation(tx, issued.beforeReserve);
      }
      if (replay) return replay;
      requireCommerceBenefitsCapability(tx.database, intent.businessId);
      tx.database.prepare("UPDATE commerce_benefit_reservations SET status = 'expired' WHERE business_id = ? AND status = 'active' AND expires_at_ms <= ?")
        .run(intent.businessId, tx.now);
      benefitsAssert(!tx.database.prepare("SELECT 1 FROM commerce_benefit_snapshots WHERE business_id = ? AND source_kind = ? AND source_id = ?")
        .get(intent.businessId, intent.source.kind, intent.source.id), "BENEFITS_SOURCE_ALREADY_SETTLED");
      const codes = this.codes(tx, request, this.permittedCodes(tx, intent, authorizationId), null);
      const rules = this.selectedRules(tx.database, intent.businessId, codes);
      const context = this.context(tx, request);
      const quote = calculateCommerceBenefits(context, rules);
      if (issued) benefitsAssert(canonicalBenefitsJson(quote) === issued.expectedQuote, "BENEFITS_QUOTE_CHANGED");
      let expiresAt = Math.min(tx.now + 300000, ...codes.map(code => code.expires_at_ms),
        ...rules.filter(rule => quote.adjustments.some(adjustment => adjustment.ruleId === rule.id))
          .map(rule => rule.endsAt ?? Number.MAX_SAFE_INTEGER));
      const plan = quote.pointsTenderMinor && intent.customerId
        ? planCommercePointHold(tx, intent.businessId, intent.customerId, intent.currency, quote.pointsTenderMinor, expiresAt) : null;
      if (plan) expiresAt = plan.expiresAt;
      benefitsAssert(expiresAt > tx.now, "BENEFITS_RESERVATION_EXPIRED");
      const reservationId = randomUUID();
      const appliedRules = rules.filter(rule => quote.adjustments.some(adjustment => adjustment.ruleId === rule.id));
      tx.database.prepare(`INSERT INTO commerce_benefit_reservations
        (business_id,id,customer_id,source_kind,source_id,currency,status,intent_json,context_json,quote_json,rules_json,points_minor,created_at_ms,expires_at_ms)
        VALUES (?,?,?,?,?,?,'active',?,?,?,?,?,?,?)`).run(intent.businessId, reservationId, intent.customerId, intent.source.kind, intent.source.id,
          intent.currency, canonicalBenefitsJson(request), canonicalBenefitsJson(context), canonicalBenefitsJson(quote),
          canonicalBenefitsJson(appliedRules), quote.pointsTenderMinor, tx.now, expiresAt);
      for (const code of codes) tx.database.prepare("INSERT INTO commerce_benefit_coupon_holds VALUES (?,?,?)").run(intent.businessId, reservationId, code.id);
      if (plan) insertCommercePointHold(tx, intent.businessId, reservationId, plan);
      if (codes.length) tx.database.prepare("UPDATE commerce_benefit_coupon_authorizations SET reservation_id = ? WHERE business_id = ? AND id = ?")
        .run(reservationId, intent.businessId, authorizationId);
      const receipt: BenefitsReservationReceipt = { version: 1, reservationId, expiresAt, quote };
      this.saveReceipt(tx, intent.businessId, operationKey, "reserve", digest, receipt);
      if (issued) { issued.receipt = receipt; issued.receiptEvidence = canonicalBenefitsJson(receipt); }
      return receipt;
    });
  }
  private reservation(tx: BenefitsTransaction, businessId: string, reservationId: string, operation: "checkout" | "refund" = "checkout"):
    { row: ReservationRow; intent: BenefitsPricingRequest } {
    const row = tx.database.prepare(`SELECT id,customer_id,source_kind,source_id,currency,status,intent_json,context_json,
      quote_json,rules_json,points_minor,expires_at_ms FROM commerce_benefit_reservations WHERE business_id = ? AND id = ?`)
      .get(businessId, reservationId) as unknown as ReservationRow | undefined;
    benefitsAssert(row, "BENEFITS_RESERVATION_REQUIRED");
    const intent = JSON.parse(row.intent_json) as BenefitsPricingRequest;
    benefitsAssert(intent.businessId === businessId && intent.customerId === row.customer_id, "BENEFITS_CONTEXT_SCOPE");
    this.authorize(tx.database, intent, operation);
    return { row, intent };
  }
  /** INTERNAL evidence only, not mutation authorization. Reference must be server
   * owned. Coupons are intentionally outside this points-only read boundary.
   * Reuse the canonical reserve receipt/HMAC and settlement quote validation.
   */
  readReservationReadOnly(tx: BenefitsTransaction, request: BenefitsPricingRequest,
    reference: { readonly reservationId: string; readonly operationKey: string },
    couponPermitId: string | null = null) {
    return benefitsOperation(tx, () => {
      benefitsAssert(this.ports.authorizeReadOnly, "BENEFITS_READ_AUTHORIZATION_REQUIRED");
      this.ports.authorizeReadOnly(tx.database, request);
      if (request.customerId !== null) requireBenefitsCustomer(tx.database, request.businessId, request.customerId);
      benefitsAssert(reference && Object.keys(reference).sort().join(",") === "operationKey,reservationId"
        && typeof reference.reservationId === "string", "BENEFITS_RESERVATION_REQUIRED");
      const row = tx.database.prepare(`SELECT id,customer_id,source_kind,source_id,currency,status,intent_json,context_json,
        quote_json,rules_json,points_minor,expires_at_ms FROM commerce_benefit_reservations WHERE business_id=? AND id=?`)
        .get(request.businessId, reference.reservationId) as unknown as ReservationRow | undefined;
      benefitsAssert(row, "BENEFITS_RESERVATION_REQUIRED");
      benefitsAssert(row.intent_json === canonicalBenefitsJson(request) && row.customer_id === request.customerId
        && row.source_kind === request.source.kind && row.source_id === request.source.id && row.currency === request.currency,
      "BENEFITS_RESERVATION_SCOPE");
      const couponHolds = tx.database.prepare("SELECT code_id FROM commerce_benefit_coupon_holds WHERE business_id=? AND reservation_id=? ORDER BY code_id")
        .all(request.businessId, row.id) as { code_id: string }[];
      if (couponPermitId !== null) {
        // Coupon reservations are proven by the exact permit that created them:
        // same business/source, still unexpired, already bound to this reservation,
        // and holds identical to the sealed opaque code ids.
        const permit = tx.database.prepare(`SELECT intent_hmac,code_ids_json,reservation_id,expires_at_ms
          FROM commerce_benefit_coupon_authorizations WHERE business_id=? AND id=?`)
          .get(request.businessId, couponPermitId) as { intent_hmac: string; code_ids_json: string;
            reservation_id: string | null; expires_at_ms: number } | undefined;
        benefitsAssert(permit && permit.reservation_id === row.id && permit.expires_at_ms > tx.now,
          "BENEFITS_COUPON_AUTHORIZATION_REQUIRED");
        const sealed = JSON.parse(permit.code_ids_json) as { codes?: unknown; request?: unknown; quote?: unknown } | unknown[];
        benefitsAssert(sealed && !Array.isArray(sealed)
          && Array.isArray((sealed as { codes?: unknown }).codes)
          && (sealed as { codes: string[] }).codes.length === couponHolds.length
          && canonicalBenefitsJson((sealed as { codes: string[] }).codes) === canonicalBenefitsJson(couponHolds.map(hold => hold.code_id)),
        "BENEFITS_COUPON_AUTHORIZATION_REQUIRED");
      } else {
        benefitsAssert(couponHolds.length === 0, "BENEFITS_COUPON_AUTHORIZATION_REQUIRED");
      }
      const storedQuote = JSON.parse(row.quote_json) as BenefitsQuote;
      const digest = couponPermitId !== null
        ? this.digest(request.businessId, "coupon-reserve", { permitId: couponPermitId, request,
          quote: storedQuote, operationKey: reference.operationKey })
        : benefitsIntentHmac(this.key, { ...request, couponCodes: [] });
      const receipt = this.receipt<BenefitsReservationReceipt>(tx, request.businessId, reference.operationKey, "reserve", digest);
      benefitsAssert(receipt && receipt.version === 1 && receipt.reservationId === row.id && receipt.expiresAt === row.expires_at_ms
        && canonicalBenefitsJson(receipt.quote) === row.quote_json && receipt.quote.pointsTenderMinor === row.points_minor,
      "BENEFITS_RESERVATION_RECEIPT_REQUIRED");
      benefitsAssert(row.status === "active" && tx.now < row.expires_at_ms, "BENEFITS_RESERVATION_EXPIRED");
      benefitsAssert(!tx.database.prepare(`SELECT 1 FROM commerce_benefit_snapshots
        WHERE business_id=? AND (reservation_id=? OR (source_kind=? AND source_id=?))`)
        .get(request.businessId, row.id, request.source.kind, request.source.id), "BENEFITS_SOURCE_ALREADY_SETTLED");
      const { quote } = this.reservationQuote(tx, row, request);
      return { version: 1 as const, reservationId: row.id, operationKey: reference.operationKey,
        status: "active" as const, expiresAt: row.expires_at_ms, quote,
        authority: { state: "read_only" as const, canReservePoints: false as const, canConfirmPoints: false as const } };
    });
  }
  private reservationQuote(tx: BenefitsTransaction, row: ReservationRow, intent: BenefitsPricingRequest) {
    const codeIds = tx.database.prepare("SELECT code_id FROM commerce_benefit_coupon_holds WHERE business_id = ? AND reservation_id = ? ORDER BY code_id")
      .all(intent.businessId, row.id) as { code_id: string }[];
    const codes = this.codes(tx, intent, codeIds.map(code => code.code_id), row.id);
    const rules = this.selectedRules(tx.database, intent.businessId, codes);
    const context = this.context(tx, intent, row.id);
    const quote = calculateCommerceBenefits(context, rules);
    const appliedRules = rules.filter(rule => quote.adjustments.some(adjustment => adjustment.ruleId === rule.id));
    benefitsAssert(canonicalBenefitsJson(quote) === row.quote_json && canonicalBenefitsJson(appliedRules) === row.rules_json, "BENEFITS_QUOTE_CHANGED");
    return { codes, context, quote, appliedRules };
  }
  settle(tx: BenefitsTransaction, businessId: string, reservationId: string, operationKey: string): BenefitsSettlementReceipt {
    return benefitsOperation(tx, () => {
      const { row, intent } = this.reservation(tx, businessId, reservationId);
      const digest = this.digest(businessId, "settle", reservationId);
      const replay = this.receipt<BenefitsSettlementReceipt>(tx, businessId, operationKey, "settle", digest);
      if (replay) return replay;
      benefitsAssert(row.status === "active" && row.expires_at_ms > tx.now, "BENEFITS_RESERVATION_EXPIRED");
      const { codes, context, quote, appliedRules } = this.reservationQuote(tx, row, intent);
      const evidence = this.ports.readSettlement(tx.database, intent.source);
      benefitsAssert(evidence && evidence.businessId === businessId && evidence.customerId === intent.customerId
        && canonicalBenefitsJson(evidence.source) === canonicalBenefitsJson(intent.source), "BENEFITS_SETTLEMENT_SCOPE");
      benefitsAssert(["paid", "fulfilled_paid"].includes(evidence.state), "BENEFITS_ACTUAL_PAYMENT_REQUIRED");
      benefitsAssert(evidence.currency === quote.currency && evidence.paidMinor === quote.payableMinor
        && evidence.pointsTenderMinor === quote.pointsTenderMinor && evidence.subtotalMinor === quote.subtotalMinor
        && evidence.discountMinor === quote.discountMinor && evidence.accountingMinor === quote.accountingMinor
        && evidence.paymentMethodId === (context.payment?.confirmed ? context.payment.methodId : null), "BENEFITS_SETTLEMENT_MISMATCH");
      if (quote.payableMinor > 0) benefitsAssert(context.payment?.confirmed, "BENEFITS_PAYMENT_CONFIRMATION_REQUIRED");
      const snapshotId = randomUUID();
      let pointSpendEntryId: string | null = null;
      let pointGrantEntryId: string | null = null;
      if (intent.customerId) {
        pointSpendEntryId = spendCommercePointHold(tx, { businessId, customerId: intent.customerId, currency: quote.currency,
          reservationId, amount: quote.pointsTenderMinor, sourceKind: intent.source.kind, sourceId: intent.source.id, operationKey });
        const earnRule = appliedRules.find(rule => rule.family === "points" && rule.points?.operation === "earn");
        const expiryDays = earnRule?.points?.expiryDays ?? null;
        pointGrantEntryId = grantSettledCommercePoints(tx, { businessId, customerId: intent.customerId, currency: quote.currency,
          amount: quote.pointsEarnPreviewMinor, sourceKind: intent.source.kind, sourceId: intent.source.id, operationKey,
          expiresAt: expiryDays === null ? null : minor(tx.now + expiryDays * 86400000) });
      }
      const receipt: BenefitsSettlementReceipt = { version: 1, snapshotId, reservationId, source: intent.source, quote, pointSpendEntryId, pointGrantEntryId };
      tx.database.prepare("INSERT INTO commerce_benefit_snapshots VALUES (?,?,1,?,?,?,?,?,?,?)")
        .run(businessId, snapshotId, reservationId, intent.source.kind, intent.source.id, canonicalBenefitsJson(context),
          canonicalBenefitsJson(appliedRules), canonicalBenefitsJson(receipt), tx.now);
      for (const code of codes) tx.database.prepare("INSERT INTO commerce_benefit_coupon_redemptions VALUES (?,?,?,?,?,?,?)")
        .run(businessId, randomUUID(), code.id, intent.customerId, reservationId, snapshotId, tx.now);
      tx.database.prepare("UPDATE commerce_benefit_reservations SET status = 'settled' WHERE business_id = ? AND id = ?").run(businessId, reservationId);
      this.saveReceipt(tx, businessId, operationKey, "settle", digest, receipt);
      return receipt;
    });
  }
  release(tx: BenefitsTransaction, businessId: string, reservationId: string, operationKey: string): { version: 1; reservationId: string; status: "released" } {
    return benefitsOperation(tx, () => {
      const { row } = this.reservation(tx, businessId, reservationId);
      const digest = this.digest(businessId, "release", reservationId);
      const replay = this.receipt<{ version: 1; reservationId: string; status: "released" }>(tx, businessId, operationKey, "release", digest);
      if (replay) return replay;
      benefitsAssert(row.status !== "settled", "BENEFITS_ALREADY_SETTLED");
      tx.database.prepare("UPDATE commerce_benefit_reservations SET status = 'released' WHERE business_id = ? AND id = ?").run(businessId, reservationId);
      const receipt = { version: 1 as const, reservationId, status: "released" as const };
      this.saveReceipt(tx, businessId, operationKey, "release", digest, receipt); return receipt;
    });
  }
  reverse(tx: BenefitsTransaction, businessId: string, snapshotId: string, operationKey: string): BenefitsReversalReceipt {
    return benefitsOperation(tx, () => {
      const snapshot = tx.database.prepare("SELECT reservation_id,receipt_json FROM commerce_benefit_snapshots WHERE business_id = ? AND id = ?")
        .get(businessId, snapshotId) as { reservation_id: string; receipt_json: string } | undefined;
      benefitsAssert(snapshot, "BENEFITS_SNAPSHOT_REQUIRED");
      const { intent } = this.reservation(tx, businessId, snapshot.reservation_id, "refund");
      const digest = this.digest(businessId, "reverse", snapshotId);
      const replay = this.receipt<BenefitsReversalReceipt>(tx, businessId, operationKey, "reverse", digest);
      if (replay) return replay;
      benefitsAssert(!tx.database.prepare("SELECT 1 FROM commerce_benefit_reversals WHERE business_id = ? AND snapshot_id = ?").get(businessId, snapshotId), "BENEFITS_ALREADY_REVERSED");
      const refund = this.ports.readFullRefund(tx.database, intent.source);
      benefitsAssert(refund?.fullRefundConfirmed && refund.businessId === businessId && refund.customerId === intent.customerId
        && canonicalBenefitsJson(refund.source) === canonicalBenefitsJson(intent.source), "BENEFITS_CONFIRMED_REFUND_REQUIRED");
      const original = JSON.parse(snapshot.receipt_json) as BenefitsSettlementReceipt;
      const pointEntryIds = intent.customerId ? reverseSettledCommercePoints(tx, { businessId, customerId: intent.customerId, currency: intent.currency,
        snapshotId, grantId: original.pointGrantEntryId, spendId: original.pointSpendEntryId, operationKey }) : [];
      const receipt: BenefitsReversalReceipt = { version: 1, snapshotId, pointEntryIds, couponUsageRestored: false };
      tx.database.prepare("INSERT INTO commerce_benefit_reversals VALUES (?,?,?,?)").run(businessId, snapshotId, canonicalBenefitsJson(receipt), tx.now);
      this.saveReceipt(tx, businessId, operationKey, "reverse", digest, receipt); return receipt;
    });
  }
  adjustPoints(tx: BenefitsTransaction, input: { businessId: string; customerId: string; currency: string; amountMinor: number;
    expiresAt: number | null; reason: "opening_balance" | "correction"; operationKey: string }): { version: 1; entryId: string } {
    return benefitsOperation(tx, () => {
      this.ports.authorizePointAdjustment(tx.database, input.businessId, input.customerId);
      requireBenefitsCustomer(tx.database, input.businessId, input.customerId);
      benefitsAssert(/^[A-Z]{3}$/.test(input.currency) && ["opening_balance", "correction"].includes(input.reason), "BENEFITS_INVALID_ADJUSTMENT");
      const digest = this.digest(input.businessId, "adjust", input);
      const replay = this.receipt<{ version: 1; entryId: string }>(tx, input.businessId, input.operationKey, "adjust", digest);
      if (replay) return replay;
      benefitsAssert(readBenefitsFamilies(tx.database, input.businessId).points, "BENEFITS_POINTS_UNAVAILABLE");
      const entryId = adjustCommercePoints(tx, { ...input, amount: input.amountMinor });
      const receipt = { version: 1 as const, entryId };
      this.saveReceipt(tx, input.businessId, input.operationKey, "adjust", digest, receipt); return receipt;
    });
  }
  expirePoints(tx: BenefitsTransaction, businessId: string, customerId: string, currency: string, operationKey: string): { version: 1; entryIds: string[] } {
    return benefitsOperation(tx, () => {
      this.ports.authorizePointAdjustment(tx.database, businessId, customerId);
      requireBenefitsCustomer(tx.database, businessId, customerId);
      benefitsAssert(/^[A-Z]{3}$/.test(currency), "BENEFITS_INVALID_CURRENCY");
      const digest = this.digest(businessId, "expire", { customerId, currency });
      const replay = this.receipt<{ version: 1; entryIds: string[] }>(tx, businessId, operationKey, "expire", digest);
      if (replay) return replay;
      const entryIds = expireCommercePoints(tx, { businessId, customerId, currency, operationKey });
      const receipt = { version: 1 as const, entryIds };
      this.saveReceipt(tx, businessId, operationKey, "expire", digest, receipt); return receipt;
    });
  }
}
