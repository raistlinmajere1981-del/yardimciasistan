import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, moneyToMinor, type BenefitsPricingContext, type BenefitsReservationReceipt, type BenefitsSettlementReceipt, type BenefitsSource } from "@yardimci-asistan/shared";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { readLocalActionCashSalePreparationScope, readLocalActionPointsPreparationScope, requireLocalActionCashSalePrincipal, requireLocalActionPointsPrincipal, type LocalCompanionActionContext } from "./local-companion-server.js";
import { validateCompanionPointsIntent, type CompanionPointsIntent, type CompanionPointsIntentBinding } from "./companion-points-intent.js";
import { prepareMarketSaleOperationSource, readPreparedMarketSaleOperationSourceInTransaction, readMarketSaleOperationSourceInTransaction,
  prepareMarketSaleOperationObservation, readMarketSaleOperationObservation, prepareMarketSaleCompanionTenderContract,
  prepareMarketSaleCompanionPaidSaleObservation,
  type MarketSaleOperationObservation, type CompleteMarketSaleInput } from "./market-sale-operation.js";
import { benefitsAssert } from "./commerce-benefits-engine.js";
import { benefitsHmac, benefitsOperation, canonicalBenefitsJson, loadCommerceBenefitsRules, type BenefitsSecretKey, type BenefitsTransaction } from "./commerce-benefits-rules.js";
import { readCommercePointBalanceFreshUntil } from "./commerce-benefits-points.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { CommerceBenefitsStore, type BenefitsPricingRequest, type BenefitsReservationIssuanceGate, type CommerceBenefitsParentPorts } from "./commerce-benefits-store.js";
import type { BenefitsManagementKeys } from "./commerce-benefits-management.js";
import { readMarketSalePaidTenderEvidence } from "./market-sale-paid-evidence.js";
import { marketAndroidActionIntentHash } from "./market-android-actions.js";

const preparationFingerprint = (action: AndroidSyncAction, input: CompanionPointsIntent) => canonicalBenefitsJson({
  actionId: action.id, actionType: action.action_type, deviceId: action.device_id,
  actionIntentHash: marketAndroidActionIntentHash(action), input });

function requireLiveCompanionSalePrincipal(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, customerId: string, requestedPointsMinor: number) {
  return requestedPointsMinor > 0
    ? requireLocalActionPointsPrincipal(tx.database, action, context, customerId)
    : requireLocalActionCashSalePrincipal(tx.database, action, context, customerId);
}

function companionSaleInput(action: AndroidSyncAction): CompleteMarketSaleInput {
  return { operationId: action.id, source: "android-market-sale", settlement: "paid",
    customerId: String(action.payload.customer_id), locationId: String(action.payload.location_id ?? "").trim(),
    paymentMethod: String(action.payload.payment_method),
    items: (action.payload.lines as Record<string, unknown>[]).map(raw => ({ productId: String(raw.product_id),
      quantity: raw.quantity as number, expectedUnitPrice: raw.expected_unit_price as number,
      expectedCurrency: raw.expected_currency as string, expectedUpdatedAt: raw.expected_updated_at as string })) };
}
/** Single canonical mapping from the immutable Android action to the sale owner
 * input. Production route and benefits adapters must not carry a second copy. */
export const companionSaleInputFromAction = companionSaleInput;

const preparations = new WeakMap<object, { database: DatabaseSync; action: AndroidSyncAction;
  context: LocalCompanionActionContext; scope: ReturnType<typeof readLocalActionPointsPreparationScope>;
  fingerprint: string; key: BenefitsSecretKey; allocation: ReturnType<typeof prepareMarketSaleOperationSource>; expiresAtMs: number }>();

/** INTERNAL opt-in, no production caller. Established protected key only, before
 * the action owner's BEGIN. No key/credential accessor, creation or persistence.
 */
export function prepareCompanionSaleBenefitsSource(database: DatabaseSync, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, keys: BenefitsManagementKeys) {
  benefitsAssert(!database.isTransaction, "COMPANION_POINTS_PREPARATION_REQUIRED");
  const intentKeys = Object.keys(input).sort().join(",");
  benefitsAssert(input && (intentKeys === "currency,requestedPointsMinor,version"
      || (intentKeys === "couponPermitId,currency,requestedPointsMinor,version"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(input.couponPermitId))))
    && input.version === 1 && /^[A-Z]{3}$/.test(input.currency)
    && Number.isSafeInteger(input.requestedPointsMinor) && input.requestedPointsMinor >= 0,
  "COMPANION_POINTS_INTENT_INVALID");
  const scope = input.requestedPointsMinor > 0
    ? readLocalActionPointsPreparationScope(database, action, context, String(action.payload.customer_id ?? ""))
    : readLocalActionCashSalePreparationScope(database, action, context, String(action.payload.customer_id ?? ""));
  const fingerprint = preparationFingerprint(action, input);
  const key = keys.load(false);
  benefitsHmac(key, scope.businessId, "companion-source-preparation", null);
  const allocation = prepareMarketSaleOperationSource(database, companionSaleInput(action));
  const prepared = Object.freeze({ source: allocation.source,
    authority: Object.freeze({ state: "pre_sale_only" as const, canReservePoints: false as const, canConfirmPoints: false as const }) });
  preparations.set(prepared, { database, action, context: context!, scope, fingerprint, key, allocation, expiresAtMs: Date.now() + 30_000 });
  return prepared;
}
export type CompanionSaleBenefitsPreparation = ReturnType<typeof prepareCompanionSaleBenefitsSource>;

/** Live production interstitial between the authenticated HTTPS owner and the
 * in-parent points chain. Only a positive `market_sale_complete` intent with an
 * authenticated local context can prepare a protected source; the first line's
 * client currency is a candidate only, and the in-parent intent binding re-reads
 * every real line price/currency and the entire rules/balance/policy scope before
 * any Store reserve. No fake or cloned context can reach this function. */
export interface CompanionPointsSaleRoutePreparation {
  readonly prepared: CompanionSaleBenefitsPreparation;
  readonly intent: CompanionPointsIntent;
}
/** Zero-Puan paid-cash Companion sale is eligible only when points are enabled and
 * an active Companion earn rule exists. Ineligible sales keep the generic cash
 * route and still succeed; an eligible sale must never silently skip its earn. */
export function hasActiveCompanionCashEarnRule(db: DatabaseSync, action: AndroidSyncAction): boolean {
  const requested = action.payload?.requestedPointsMinor;
  if (action.action_type !== "market_sale_complete" || action.payload?.settlement !== "paid"
      || action.payload?.payment_method !== "cash" || Number(requested ?? 0) !== 0
      || typeof action.payload?.customer_id !== "string" || !action.payload.customer_id.trim()) return false;
  const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
  if (!businessId || !readEnabledBusinessCapabilities(db).includes(BUSINESS_CAPABILITIES.COMMERCE_BENEFITS)) return false;
  const settings = db.prepare("SELECT points_enabled FROM commerce_benefit_settings WHERE business_id=?").get(businessId);
  if (!settings || Number(settings.points_enabled) !== 1) return false;
  const now = Date.now();
  return loadCommerceBenefitsRules(db, businessId).some(rule => rule.family === "points" && rule.status === "active"
    && rule.points?.operation === "earn" && rule.scope.channels.includes("companion")
    && rule.startsAt <= now && (rule.endsAt === null || now < rule.endsAt));
}
export function prepareCompanionPointsSaleRoute(database: DatabaseSync, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, keys: BenefitsManagementKeys): CompanionPointsSaleRoutePreparation {
  benefitsAssert(!database.isTransaction, "COMPANION_POINTS_PREPARATION_REQUIRED");
  const requested = action.payload?.requestedPointsMinor;
  benefitsAssert(action.action_type === "market_sale_complete" && action.payload?.settlement === "paid"
    && Number.isSafeInteger(requested) && Number(requested) > 0, "COMPANION_POINTS_INTENT_INVALID");
  const lines = action.payload.lines;
  benefitsAssert(Array.isArray(lines) && lines.length > 0, "COMPANION_POINTS_INTENT_INVALID");
  const currency = String((lines[0] as Record<string, unknown>)?.expected_currency ?? "").trim();
  benefitsAssert(/^[A-Z]{3}$/.test(currency), "COMPANION_POINTS_INTENT_INVALID");
  const intent = Object.freeze({ version: 1 as const, currency, requestedPointsMinor: Number(requested) });
  const prepared = prepareCompanionSaleBenefitsSource(database, action, context, intent, keys);
  return Object.freeze({ prepared, intent });
}

/** Protected zero-Puan paid-cash route. The intent is explicitly 0, never a fake
 * positive spend, and the source is bound to the authenticated cash principal. */
export function prepareCompanionCashSaleRoute(database: DatabaseSync, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, keys: BenefitsManagementKeys): CompanionPointsSaleRoutePreparation {
  benefitsAssert(!database.isTransaction, "COMPANION_POINTS_PREPARATION_REQUIRED");
  const requested = Number(action.payload?.requestedPointsMinor ?? 0);
  benefitsAssert(action.action_type === "market_sale_complete" && action.payload?.settlement === "paid"
    && action.payload?.payment_method === "cash" && requested === 0
    && typeof action.payload?.customer_id === "string" && action.payload.customer_id.trim().length > 0
    && hasActiveCompanionCashEarnRule(database, action), "COMPANION_POINTS_INTENT_INVALID");
  const lines = action.payload.lines;
  benefitsAssert(Array.isArray(lines) && lines.length > 0, "COMPANION_POINTS_INTENT_INVALID");
  const currency = String((lines[0] as Record<string, unknown>)?.expected_currency ?? "").trim();
  benefitsAssert(/^[A-Z]{3}$/.test(currency), "COMPANION_POINTS_INTENT_INVALID");
  const intent = Object.freeze({ version: 1 as const, currency, requestedPointsMinor: 0 });
  const prepared = prepareCompanionSaleBenefitsSource(database, action, context, intent, keys);
  return Object.freeze({ prepared, intent });
}

/** Protected coupon-only paid-cash route. The action carries only an opaque,
 * server-issued `couponPermitId`; the plaintext coupon never reaches this owner.
 * Customer + paid + cash are mandatory, points spend is explicitly zero. */
export function prepareCompanionCouponSaleRoute(database: DatabaseSync, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, keys: BenefitsManagementKeys): CompanionPointsSaleRoutePreparation {
  benefitsAssert(!database.isTransaction, "COMPANION_POINTS_PREPARATION_REQUIRED");
  const requested = Number(action.payload?.requestedPointsMinor ?? 0);
  const permitId = action.payload?.couponPermitId;
  benefitsAssert(action.action_type === "market_sale_complete" && action.payload?.settlement === "paid"
    && action.payload?.payment_method === "cash" && requested === 0
    && typeof permitId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(permitId)
    && typeof action.payload?.customer_id === "string" && action.payload.customer_id.trim().length > 0,
  "COMPANION_POINTS_INTENT_INVALID");
  const lines = action.payload.lines;
  benefitsAssert(Array.isArray(lines) && lines.length > 0, "COMPANION_POINTS_INTENT_INVALID");
  const currency = String((lines[0] as Record<string, unknown>)?.expected_currency ?? "").trim();
  benefitsAssert(/^[A-Z]{3}$/.test(currency), "COMPANION_POINTS_INTENT_INVALID");
  const intent = Object.freeze({ version: 1 as const, currency, requestedPointsMinor: 0, couponPermitId: permitId });
  const prepared = prepareCompanionSaleBenefitsSource(database, action, context, intent, keys);
  return Object.freeze({ prepared, intent });
}

/** Recheck authenticated owner, prices/rules and preflight scope inside BEGIN.
 * The returned opaque allocation is accepted only by the canonical sale owner.
 */
export function requireCompanionSaleBenefitsSource(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation) {
  return benefitsOperation(tx, () => {
    const { scope } = validateCompanionPointsIntent(tx, action, context, input, binding);
    const state = prepared && preparations.get(prepared);
    benefitsAssert(state && state.database === tx.database && state.action === action && state.context === context
      && state.fingerprint === preparationFingerprint(action, input)
      && state.scope.businessId === scope.businessId && state.scope.deviceRecordId === scope.deviceRecordId
      && state.scope.authorizationEpoch === scope.authorizationEpoch
      && state.scope.spendGrantGeneration === scope.spendGrantGeneration, "COMPANION_POINTS_SOURCE_SCOPE");
    benefitsAssert(tx.now < state.expiresAtMs && tx.now >= state.expiresAtMs - 30_000, "COMPANION_POINTS_INTENT_EXPIRED");
    return state.allocation;
  });
}

/** INTERNAL pre-sale advisory only. C20e's post-sale evidence remains separate.
 * Reuses the prepared protected key and unused opaque canonical source; no route.
 */
export function companionSaleBenefitsPreSaleReadPorts(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation) {
  return companionSaleBenefitsReadOnlyPorts(tx, action, context, input, binding, prepared, false);
}

// The paid-evidence branch is private and read-only. It lets the terminal C20l
// negative contract re-read issuance after fixture sale provisioning; it never
// promotes a used source back into a pre-sale allocation or mutation permission.
function companionSaleBenefitsReadOnlyPorts(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, paidEvidence: boolean) {
  return benefitsOperation(tx, () => {
    const readCurrent = () => {
      const allocation = requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared);
      const source = paidEvidence ? allocation.source
        : readPreparedMarketSaleOperationSourceInTransaction(tx.database, companionSaleInput(action), allocation);
      const method = action.payload.payment_method;
      benefitsAssert(typeof method === "string" && ["cash", "card", "bank", "other"].includes(method)
        && (method !== "card" || action.payload.external_payment_confirmed === true), "COMPANION_POINTS_SOURCE_SCOPE");
      return { scope: binding.scope, source, method };
    };
    const initial = readCurrent();
    const request: BenefitsPricingRequest = Object.freeze({ businessId: initial.scope.businessId, customerId: initial.scope.customerId,
      source: initial.source, channel: "companion", currency: initial.scope.currency,
      lines: Object.freeze(initial.scope.lines.map(line => Object.freeze({ productId: line.productId, quantityTenThousandths: line.quantityTenThousandths }))),
      paymentMethodId: initial.method, requestedPointsMinor: initial.scope.requestedPointsMinor });
    const assertScope = (database: DatabaseSync, candidate: BenefitsPricingRequest) => {
      benefitsAssert(database === tx.database && canonicalBenefitsJson(candidate) === canonicalBenefitsJson(request), "COMPANION_POINTS_SOURCE_SCOPE");
      return readCurrent();
    };
    const disabled = (): never => { throw Object.assign(new Error("Companion benefits reservation is disabled."), { code: "COMPANION_POINTS_RESERVATION_DISABLED" }); };
    const denySource = (database: DatabaseSync, source: BenefitsSource) => benefitsOperation(tx, () => {
      assertScope(database, request);
      benefitsAssert(canonicalBenefitsJson(source) === canonicalBenefitsJson(request.source), "COMPANION_POINTS_SOURCE_SCOPE");
      return disabled();
    });
    const ports: CommerceBenefitsParentPorts = Object.freeze({
      authorizeReadOnly(database: DatabaseSync, candidate: BenefitsPricingRequest) {
        benefitsOperation(tx, () => { assertScope(database, candidate); });
      },
      authorize(database: DatabaseSync, candidate: BenefitsPricingRequest, _operation: "checkout" | "refund") {
        return benefitsOperation(tx, () => { assertScope(database, candidate); return disabled(); });
      },
      authorizePointAdjustment(database: DatabaseSync, businessId: string, customerId: string) {
        return benefitsOperation(tx, () => {
          assertScope(database, request);
          benefitsAssert(businessId === request.businessId && customerId === request.customerId, "COMPANION_POINTS_SOURCE_SCOPE");
          return disabled();
        });
      },
      resolvePricing(database: DatabaseSync, candidate: BenefitsPricingRequest, now: number): BenefitsPricingContext {
        return benefitsOperation(tx, () => {
          benefitsAssert(now === tx.now, "COMPANION_POINTS_SOURCE_SCOPE");
          const { scope, method } = assertScope(database, candidate);
          benefitsAssert(new Set(scope.lines.map(line => line.appliedPriceGroup)).size === 1, "BENEFITS_PRICE_GROUP_UNSUPPORTED");
          return { businessId: scope.businessId, customerId: scope.customerId, channel: "companion", currency: scope.currency,
            currencyExponent: 2, now, customerGroups: [], priceGroup: scope.lines[0]!.appliedPriceGroup,
            lines: scope.lines.map((line, index) => ({ id: `line${index}`, productId: line.productId, categoryId: line.categoryId,
              unitPriceMinor: line.unitPriceMinor, quantityTenThousandths: line.quantityTenThousandths })),
            payment: { methodId: method, confirmed: false }, requestedPointsMinor: scope.requestedPointsMinor,
            // Store.context replaces these with canonical live family/balance reads.
            families: { coupon: false, points: false, payment_modifier: false }, availablePointsMinor: 0,
            accounting: { taxTreatment: "included_in_items", taxMinor: 0, financeMinor: 0, earnOnAccountingAdjustments: false } };
        });
      },
      readSettlement: denySource, readFullRefund: denySource
    });
    const store = new CommerceBenefitsStore(preparations.get(prepared)!.key, ports);
    return Object.freeze({ request, ports, store,
      readAdvisoryQuote: () => store.previewReadOnly(tx, request),
      authority: Object.freeze({ state: "read_only" as const, canReservePoints: false as const, canConfirmPoints: false as const }) });
  });
}

declare const companionQuoteBrand: unique symbol;
/** Server memory identity only. Serializing/copying this handle loses provenance. */
export interface CompanionSaleBenefitsQuoteHandle { readonly [companionQuoteBrand]: true }
type AdvisoryQuote = ReturnType<CommerceBenefitsStore["previewReadOnly"]>;
const advisorySnapshots = new WeakMap<CompanionSaleBenefitsQuoteHandle, {
  tx: BenefitsTransaction; now: number; action: AndroidSyncAction; context: LocalCompanionActionContext | undefined;
  binding: CompanionPointsIntentBinding; prepared: CompanionSaleBenefitsPreparation;
  fingerprint: string; evidence: string; capturedAtMs: number; expiresAtMs: number;
}>();

function readFreshUntil(tx: BenefitsTransaction, binding: CompanionPointsIntentBinding, prepared: CompanionSaleBenefitsPreparation): number {
  let expiresAtMs = Math.min(binding.expiresAtMs, preparations.get(prepared)!.expiresAtMs, tx.now + 30_000);
  for (const rule of loadCommerceBenefitsRules(tx.database, binding.scope.businessId)) {
    for (const boundary of [rule.startsAt, rule.endsAt]) {
      if (boundary !== null && boundary > tx.now) expiresAtMs = Math.min(expiresAtMs, boundary);
    }
  }
  const balanceExpiry = readCommercePointBalanceFreshUntil(tx.database, binding.scope.businessId,
    binding.scope.customerId, binding.scope.currency, tx.now);
  return balanceExpiry === null ? expiresAtMs : Math.min(expiresAtMs, balanceExpiry);
}

declare const companionReservationBrand: unique symbol;
export interface CompanionSaleBenefitsReservationHandle { readonly [companionReservationBrand]: true }
type ReservationWitness = ReturnType<CommerceBenefitsStore["readReservationReadOnly"]>;
const reservationWitnesses = new WeakMap<CompanionSaleBenefitsReservationHandle, {
  tx: BenefitsTransaction; now: number; action: AndroidSyncAction; context: LocalCompanionActionContext | undefined;
  binding: CompanionPointsIntentBinding; prepared: CompanionSaleBenefitsPreparation;
  fingerprint: string; reference: { reservationId: string; operationKey: string };
  evidence: string; capturedAtMs: number; expiresAtMs: number;
}>();
function freezeReadEvidence(value: object): void {
  for (const nested of Object.values(value) as unknown[]) if (nested && typeof nested === "object") freezeReadEvidence(nested);
  Object.freeze(value);
}

declare const companionIssuanceBrand: unique symbol;
export interface CompanionSaleBenefitsIssuance {
  readonly [companionIssuanceBrand]: true;
  readonly operationKey: string;
  readonly ownerGate: BenefitsReservationIssuanceGate;
}
const sourceIssuances = new WeakMap<CompanionSaleBenefitsIssuance, {
  tx: BenefitsTransaction; action: AndroidSyncAction; context: LocalCompanionActionContext | undefined;
  binding: CompanionPointsIntentBinding; prepared: CompanionSaleBenefitsPreparation; fingerprint: string;
  quote: CompanionSaleBenefitsQuoteHandle;
  witness?: CompanionSaleBenefitsReservationHandle;
  receipt?: BenefitsReservationReceipt;
  settlementAttempted?: boolean;
  operationObservation?: MarketSaleOperationObservation;
}>();

/** INTERNAL parent-only issuance preparation. No reserve permission is granted.
 * The canonical owner invokes the gate again immediately before its reserve writes.
 * The operation key is server-derived; no Android reservation reference is accepted.
 */
export function prepareCompanionSaleBenefitsIssuance(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation): CompanionSaleBenefitsIssuance {
  return benefitsOperation(tx, () => {
    const adapter = companionSaleBenefitsPreSaleReadPorts(tx, action, context, input, binding, prepared);
    const quoteHandle = captureCompanionSaleBenefitsQuote(tx, action, context, input, binding, prepared);
    const current = revalidateCompanionSaleBenefitsQuote(tx, action, context, input, binding, prepared, quoteHandle);
    const operationKey = `companion:${benefitsHmac(preparations.get(prepared)!.key, binding.scope.businessId,
      "reservation-operation", { actionId: action.id, operationId: action.id, source: adapter.request.source })}:reserve`;
    const ownerGate = adapter.store.prepareReservationIssuanceReadOnly(tx, adapter.request, operationKey, current.quote,
      () => { revalidateCompanionSaleBenefitsQuote(tx, action, context, input, binding, prepared, quoteHandle); });
    const handle = Object.freeze({ operationKey, ownerGate }) as CompanionSaleBenefitsIssuance;
    sourceIssuances.set(handle, { tx, action, context, binding, prepared, fingerprint: preparationFingerprint(action, input), quote: quoteHandle });
    return handle;
  });
}

function requireSourceIssuance(tx: BenefitsTransaction, action: AndroidSyncAction, context: LocalCompanionActionContext | undefined,
  input: CompanionPointsIntent, binding: CompanionPointsIntentBinding, prepared: CompanionSaleBenefitsPreparation,
  handle: CompanionSaleBenefitsIssuance) {
  const state = handle && sourceIssuances.get(handle);
  benefitsAssert(state && state.tx === tx && state.action === action && state.context === context
    && state.binding === binding && state.prepared === prepared && state.fingerprint === preparationFingerprint(action, input),
  "COMPANION_POINTS_ISSUANCE_SCOPE");
  return state;
}

/** Capture only a fresh canonical-owner issuance through this exact gate. C20j's
 * read-only witness alone, an older reserve, or a replay receipt is insufficient.
 * This is NOT durable inter-request issuance evidence or settle/Finance authority.
 */
export function captureCompanionSaleBenefitsIssuedReservation(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsIssuance, receipt: BenefitsReservationReceipt): void {
  benefitsOperation(tx, () => {
    const state = requireSourceIssuance(tx, action, context, input, binding, prepared, handle);
    benefitsAssert(!state.witness, "COMPANION_POINTS_ISSUANCE_ALREADY_CAPTURED");
    const adapter = companionSaleBenefitsPreSaleReadPorts(tx, action, context, input, binding, prepared);
    const reference = adapter.store.readReservationIssuanceReadOnly(tx, adapter.request, handle.ownerGate, receipt);
    state.witness = captureCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared, reference);
    state.receipt = receipt;
  });
}

/** Future same-request settle must recheck this immediately before the existing
 * owner writes, then independently authorize paid tender/Finance. Those writes
 * remain disabled. Handles cannot cross parent/rollback/process/request lifetimes.
 */
export function revalidateCompanionSaleBenefitsIssuedReservation(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsIssuance): ReservationWitness {
  return benefitsOperation(tx, () => {
    const state = requireSourceIssuance(tx, action, context, input, binding, prepared, handle);
    benefitsAssert(state.witness, "COMPANION_POINTS_ISSUANCE_REQUIRED");
    return revalidateCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared, state.witness);
  });
}

/** INTERNAL server-side per-sale policy evaluation. NOT a Store mutation
 * capability, one-use token, route or settlement authority. Every call re-reads
 * the live authenticated Android owner principal, standing device/customer
 * grant, exact C20k frozen issuance, canonical current quote and available
 * points balance. A caller cannot construct an allow decision from JSON, a
 * cloned principal, a desktop IPC actor or a late sale receipt.
 */
export function evaluateCompanionSaleBenefitsPolicy(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsIssuance) {
  return benefitsOperation(tx, () => {
    const state = requireSourceIssuance(tx, action, context, input, binding, prepared, handle);
    const principal = requireLiveCompanionSalePrincipal(tx, action, context, binding.scope.customerId, input.requestedPointsMinor);
    benefitsAssert(principal.businessId === binding.scope.businessId
      && principal.customerId === binding.scope.customerId
      && principal.deviceId === binding.scope.deviceId
      && principal.deviceRecordId === binding.scope.deviceRecordId
      && principal.authorizationEpoch === binding.scope.authorizationEpoch
      && principal.spendGrantGeneration === binding.scope.spendGrantGeneration,
    "COMPANION_POINTS_POLICY_SCOPE");
    principal.assertAuthorized();
    const advisory = revalidateCompanionSaleBenefitsQuote(tx, action, context, input, binding, prepared, state.quote);
    const quote = advisory.quote;
    benefitsAssert(input.version === 1 && Number.isSafeInteger(input.requestedPointsMinor) && input.requestedPointsMinor >= 0
      && quote.currency === binding.scope.currency
      && quote.pointsTenderMinor === input.requestedPointsMinor
      && (input.requestedPointsMinor === 0
        ? quote.payableMinor === quote.subtotalMinor - quote.discountMinor
        : input.requestedPointsMinor <= quote.payableMinor + quote.pointsTenderMinor
          && input.requestedPointsMinor <= advisory.availablePointsMinor),
    "COMPANION_POINTS_POLICY_AMOUNT");
    principal.assertAuthorized();
    return Object.freeze({ decision: "allow" as const, actionId: action.id, operationKey: handle.operationKey,
      businessId: binding.scope.businessId, customerId: binding.scope.customerId,
      deviceRecordId: binding.scope.deviceRecordId, authorizationEpoch: binding.scope.authorizationEpoch,
      spendGrantGeneration: binding.scope.spendGrantGeneration, requestedPointsMinor: input.requestedPointsMinor,
      pointsTenderMinor: quote.pointsTenderMinor, payableMinor: quote.payableMinor,
      availablePointsMinor: advisory.availablePointsMinor,
      // Explicitly policy evidence only. This object is not accepted by any
      // CommerceBenefitsStore port and grants no reserve/settle permission.
      authority: Object.freeze({ state: "policy_only" as const, canReservePoints: false as const, canConfirmPoints: false as const }) });
  });
}

declare const companionPaidWriterBrand: unique symbol;
/** INTERNAL one-operation checkout authority. The opaque identity lives only in
 * server memory; it is not a receipt, token, route, settlement or ACK. It is
 * issued only from a live Android owner principal in the genuine parent and is
 * accepted only by companionSaleBenefitsPaidWriterPorts. */
export interface CompanionSaleBenefitsPaidWriterAuthorization {
  readonly [companionPaidWriterBrand]: true;
}
const paidWriterAuthorizations = new WeakMap<CompanionSaleBenefitsPaidWriterAuthorization, {
  tx: BenefitsTransaction; database: DatabaseSync; action: AndroidSyncAction;
  context: LocalCompanionActionContext | undefined; binding: CompanionPointsIntentBinding;
  prepared: CompanionSaleBenefitsPreparation; issuance: CompanionSaleBenefitsIssuance;
  fingerprint: string; operationId: string; sourceId: string; request: string; policy: string;
  capturedAtMs: number; expiresAtMs: number; consumed: boolean;
}>();

/** INTERNAL owner-issued, non-serializable, one-use checkout authority. Re-reads
 * the live principal, canonical quote/rules/balance and C20k issuance before it
 * is minted. No production route, IPC or UI caller exists.
 */
export function issueCompanionSaleBenefitsPaidWriterAuthorization(tx: BenefitsTransaction,
  action: AndroidSyncAction, context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent,
  binding: CompanionPointsIntentBinding, prepared: CompanionSaleBenefitsPreparation,
  issuance: CompanionSaleBenefitsIssuance): CompanionSaleBenefitsPaidWriterAuthorization {
  return benefitsOperation(tx, () => {
    const principal = requireLiveCompanionSalePrincipal(tx, action, context, binding.scope.customerId, input.requestedPointsMinor);
    benefitsAssert(principal.businessId === binding.scope.businessId
      && principal.customerId === binding.scope.customerId && principal.deviceId === binding.scope.deviceId
      && principal.deviceRecordId === binding.scope.deviceRecordId
      && principal.authorizationEpoch === binding.scope.authorizationEpoch
      && principal.spendGrantGeneration === binding.scope.spendGrantGeneration,
    "COMPANION_POINTS_PAID_WRITER_SCOPE");
    principal.assertAuthorized();
    const policy = evaluateCompanionSaleBenefitsPolicy(tx, action, context, input, binding, prepared, issuance);
    const adapter = companionSaleBenefitsPreSaleReadPorts(tx, action, context, input, binding, prepared);
    benefitsAssert(policy.actionId === action.id && policy.operationKey === issuance.operationKey
      && policy.businessId === binding.scope.businessId && policy.customerId === binding.scope.customerId
      && policy.deviceRecordId === binding.scope.deviceRecordId
      && policy.authorizationEpoch === binding.scope.authorizationEpoch
      && policy.spendGrantGeneration === binding.scope.spendGrantGeneration
      && adapter.request.source.id === prepared.source.id, "COMPANION_POINTS_PAID_WRITER_SCOPE");
    const capturedAtMs = Date.now();
    const expiresAtMs = readFreshUntil(tx, binding, prepared);
    benefitsAssert(capturedAtMs >= tx.now && capturedAtMs < expiresAtMs, "COMPANION_POINTS_PAID_WRITER_EXPIRED");
    const authorization = Object.freeze({}) as CompanionSaleBenefitsPaidWriterAuthorization;
    paidWriterAuthorizations.set(authorization, { tx, database: tx.database, action, context, binding,
      prepared, issuance, fingerprint: preparationFingerprint(action, input), operationId: action.id,
      sourceId: prepared.source.id, request: canonicalBenefitsJson(adapter.request),
      policy: canonicalBenefitsJson(policy), capturedAtMs, expiresAtMs, consumed: false });
    return authorization;
  });
}

/** INTERNAL opt-in Store ports. This is the ONLY Companion adapter whose
 * authorize("checkout") can permit a real reserve; the existing read-only ports
 * keep denying. It consumes the opaque authority once and re-runs the full live
 * principal/quote/rules/balance evaluation immediately before Store's writer.
 * Settlement, refund, release, adjustment and ACK remain outside this contract.
 */
export function companionSaleBenefitsPaidWriterPorts(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent,
  binding: CompanionPointsIntentBinding, prepared: CompanionSaleBenefitsPreparation,
  authorization: CompanionSaleBenefitsPaidWriterAuthorization) {
  return benefitsOperation(tx, () => {
    const state = authorization && paidWriterAuthorizations.get(authorization);
    benefitsAssert(state && state.tx === tx && state.database === tx.database && state.action === action
      && state.context === context && state.binding === binding && state.prepared === prepared
      && state.fingerprint === preparationFingerprint(action, input) && state.operationId === action.id
      && state.sourceId === prepared.source.id, "COMPANION_POINTS_PAID_WRITER_SCOPE");
    const readOnly = companionSaleBenefitsPreSaleReadPorts(tx, action, context, input, binding, prepared);
    benefitsAssert(canonicalBenefitsJson(readOnly.request) === state.request, "COMPANION_POINTS_PAID_WRITER_SCOPE");
    const authorize = (database: DatabaseSync, candidate: BenefitsPricingRequest, operation: "checkout" | "refund") =>
      benefitsOperation(tx, () => {
        benefitsAssert(operation === "checkout", "COMPANION_POINTS_PAID_WRITER_OPERATION");
        benefitsAssert(database === tx.database && canonicalBenefitsJson(candidate) === state.request,
          "COMPANION_POINTS_PAID_WRITER_SCOPE");
        benefitsAssert(!state.consumed, "COMPANION_POINTS_PAID_WRITER_CONSUMED");
        const now = Date.now();
        benefitsAssert(now >= state.capturedAtMs && now < state.expiresAtMs, "COMPANION_POINTS_PAID_WRITER_EXPIRED");
        const fresh = evaluateCompanionSaleBenefitsPolicy(tx, action, context, input, binding, prepared, state.issuance);
        benefitsAssert(canonicalBenefitsJson(fresh) === state.policy, "COMPANION_POINTS_PAID_WRITER_CHANGED");
        benefitsAssert(fresh.actionId === state.operationId && prepared.source.id === state.sourceId
          && fresh.pointsTenderMinor === readOnly.request.requestedPointsMinor,
        "COMPANION_POINTS_PAID_WRITER_SCOPE");
        state.consumed = true;
      });
    const ports: CommerceBenefitsParentPorts = Object.freeze({
      authorizeReadOnly(database: DatabaseSync, candidate: BenefitsPricingRequest) {
        readOnly.ports.authorizeReadOnly!(database, candidate);
      },
      authorize,
      authorizePointAdjustment(database: DatabaseSync, businessId: string, customerId: string) {
        return readOnly.ports.authorizePointAdjustment(database, businessId, customerId);
      },
      resolvePricing(database: DatabaseSync, candidate: BenefitsPricingRequest, now: number) {
        return readOnly.ports.resolvePricing(database, candidate, now);
      },
      readSettlement(database: DatabaseSync, source: BenefitsSource) {
        return readOnly.ports.readSettlement(database, source);
      },
      readFullRefund(database: DatabaseSync, source: BenefitsSource) {
        return readOnly.ports.readFullRefund(database, source);
      }
    });
    return Object.freeze({ request: readOnly.request, ports,
      store: new CommerceBenefitsStore(preparations.get(prepared)!.key, ports),
      authorization: Object.freeze({ state: "paid_writer_checkout_only" as const,
        canReservePoints: true as const, canConfirmPoints: false as const }) });
  });
}

declare const companionSettlementBrand: unique symbol;
/** TEST-ONLY internal settlement result. It is not an Android receipt/ACK, a
 * durable settlement proof or a production payment authority. */
export interface CompanionSaleBenefitsPaidSettlement {
  readonly [companionSettlementBrand]: true;
  readonly settlement: BenefitsSettlementReceipt;
  readonly authority: Readonly<{ state: "paid_settlement_test_only"; canReservePoints: false; canConfirmPoints: false }>;
}

/** TEST-ONLY, opt-in, bounded owner-authorized settlement of the exact real
 * reservation created by `companionSaleBenefitsPaidWriterPorts`. It re-reads the
 * live Android principal/grant/epoch, the original C20k issuance, the exact
 * `Store.reserve` receipt object, the active same-parent reservation and the
 * canonical persisted paid tender/Finance/stock through
 * `readMarketSalePaidTenderEvidence` before it exposes `readSettlement` for that
 * one source and reservation. It derives its own settle operation key, permits
 * `authorize("checkout")` once, and rejects refund/adjustment/readFullRefund.
 * No production route, IPC, UI, Android ACK or materializer caller exists.
 *
 * `resolvePricing.payment.confirmed` becomes true only for a persisted,
 * cash-confirmed tender. Store's own quote/rules comparison stays unchanged, so
 * a payment-modifier discount that was absent at reserve cannot be introduced
 * here: it would change the quote and fail closed.
 *
 * This does NOT establish independent paid-sale provenance: the C20p-2l
 * `commerce_market_sale_receipts` mapping is still a TEST FIXTURE, not an
 * immutable owner-issued receipt. The Android owner's pre-ACK verifier still
 * requires an ACTIVE reservation and no snapshot, so this settled parent must
 * fail closed and roll back; it must never be promoted as genuine sale authority.
 */
export function settleCompanionSaleBenefitsPaidSale(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, issuance: CompanionSaleBenefitsIssuance,
  receipt: BenefitsReservationReceipt): CompanionSaleBenefitsPaidSettlement {
  return benefitsOperation(tx, () => {
    const state = requireSourceIssuance(tx, action, context, input, binding, prepared, issuance);
    benefitsAssert(state.witness, "COMPANION_POINTS_ISSUANCE_REQUIRED");
    benefitsAssert(state.receipt === receipt && receipt && receipt.version === 1,
      "COMPANION_POINTS_SETTLEMENT_RECEIPT_REQUIRED");
    benefitsAssert(!state.settlementAttempted, "COMPANION_POINTS_SETTLEMENT_CONSUMED");
    const assertPrincipal = () => {
      const principal = requireLiveCompanionSalePrincipal(tx, action, context, binding.scope.customerId, input.requestedPointsMinor);
      benefitsAssert(principal.businessId === binding.scope.businessId
        && principal.customerId === binding.scope.customerId && principal.deviceId === binding.scope.deviceId
        && principal.deviceRecordId === binding.scope.deviceRecordId
        && principal.authorizationEpoch === binding.scope.authorizationEpoch
        && principal.spendGrantGeneration === binding.scope.spendGrantGeneration,
      "COMPANION_POINTS_SETTLEMENT_SCOPE");
      principal.assertAuthorized();
    };
    assertPrincipal();
    const witness = readCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared, state.witness, true);
    benefitsAssert(witness.reservationId === receipt.reservationId && witness.operationKey === issuance.operationKey,
      "COMPANION_POINTS_SETTLEMENT_SCOPE");
    const adapter = companionSaleBenefitsReadOnlyPorts(tx, action, context, input, binding, prepared, true);
    const expectedQuote = witness.quote;
    const locationId = String(action.payload.location_id ?? "").trim();
    const readTender = () => readMarketSalePaidTenderEvidence(tx, adapter.request, expectedQuote, locationId);
    const tender = readTender();
    benefitsAssert(tender.pointsTenderMinor === expectedQuote.pointsTenderMinor
      && tender.cashPaidMinor === expectedQuote.payableMinor, "COMPANION_POINTS_SETTLEMENT_MISMATCH");
    state.settlementAttempted = true;
    let settlementReady = false, authorized = false;
    const deny = (): never => { throw Object.assign(new Error("Companion benefits settlement is not authorized."), { code: "COMPANION_POINTS_SETTLEMENT_DENIED" }); };
    const assertReservationCurrent = (database: DatabaseSync, source: BenefitsSource) => {
      benefitsAssert(database === tx.database && canonicalBenefitsJson(source) === canonicalBenefitsJson(adapter.request.source),
        "COMPANION_POINTS_SETTLEMENT_SCOPE");
      const row = tx.database.prepare(`SELECT id,customer_id,source_kind,source_id,status,currency
        FROM commerce_benefit_reservations WHERE business_id=? AND id=?`).get(binding.scope.businessId, receipt.reservationId);
      benefitsAssert(row && row.customer_id === binding.scope.customerId && row.source_kind === "sale"
        && row.source_id === adapter.request.source.id && row.status === "active" && row.currency === expectedQuote.currency,
      "COMPANION_POINTS_SETTLEMENT_SCOPE");
    };
    const assertTender = () => {
      const evidence = readTender();
      const cashConfirmed = evidence.cashPaidMinor > 0 && evidence.confirmation === "cash_received";
      benefitsAssert(evidence.pointsTenderMinor === expectedQuote.pointsTenderMinor
        && evidence.cashPaidMinor === expectedQuote.payableMinor
        && (expectedQuote.payableMinor === 0 || cashConfirmed), "COMPANION_POINTS_SETTLEMENT_MISMATCH");
      return { evidence, cashConfirmed };
    };
    // Every settlement port call re-reads the live owner/grant/epoch, the exact
    // issuance receipt and the persisted paid tender; none trusts a prior flag.
    const assertSettlementOwner = (database: DatabaseSync, source: BenefitsSource) => {
      assertPrincipal();
      readCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared, state.witness!, true);
      assertReservationCurrent(database, source);
      return assertTender();
    };
    const ports: CommerceBenefitsParentPorts = Object.freeze({
      authorizeReadOnly(database: DatabaseSync, candidate: BenefitsPricingRequest) {
        adapter.ports.authorizeReadOnly!(database, candidate);
      },
      authorize(database: DatabaseSync, candidate: BenefitsPricingRequest, operation: "checkout" | "refund") {
        return benefitsOperation(tx, () => {
          benefitsAssert(operation === "checkout", "COMPANION_POINTS_SETTLEMENT_OPERATION");
          benefitsAssert(database === tx.database && canonicalBenefitsJson(candidate) === canonicalBenefitsJson(adapter.request),
            "COMPANION_POINTS_SETTLEMENT_SCOPE");
          benefitsAssert(!authorized, "COMPANION_POINTS_SETTLEMENT_CONSUMED");
          assertSettlementOwner(database, adapter.request.source);
          authorized = true;
        });
      },
      authorizePointAdjustment(_database: DatabaseSync, _businessId: string, _customerId: string) {
        return deny();
      },
      resolvePricing(database: DatabaseSync, candidate: BenefitsPricingRequest, now: number): BenefitsPricingContext {
        return benefitsOperation(tx, () => {
          benefitsAssert(now === tx.now && settlementReady, "COMPANION_POINTS_SETTLEMENT_AUTHORIZATION_REQUIRED");
          const base = adapter.ports.resolvePricing(database, candidate, now);
          const { cashConfirmed } = assertSettlementOwner(database, adapter.request.source);
          benefitsAssert(base.payment, "COMPANION_POINTS_SETTLEMENT_PAYMENT_REQUIRED");
          return { ...base, payment: { methodId: base.payment.methodId, confirmed: cashConfirmed } };
        });
      },
      readSettlement(database: DatabaseSync, source: BenefitsSource) {
        return benefitsOperation(tx, () => {
          benefitsAssert(settlementReady, "COMPANION_POINTS_SETTLEMENT_AUTHORIZATION_REQUIRED");
          const { evidence, cashConfirmed } = assertSettlementOwner(database, source);
          return Object.freeze({ businessId: binding.scope.businessId, customerId: binding.scope.customerId,
            source: Object.freeze({ ...source }), state: "paid" as const, currency: expectedQuote.currency,
            paymentMethodId: cashConfirmed ? adapter.request.paymentMethodId : null,
            paidMinor: evidence.cashPaidMinor, pointsTenderMinor: evidence.pointsTenderMinor,
            subtotalMinor: expectedQuote.subtotalMinor, discountMinor: expectedQuote.discountMinor,
            accountingMinor: expectedQuote.accountingMinor });
        });
      },
      readFullRefund(_database: DatabaseSync, _source: BenefitsSource) {
        return deny();
      }
    });
    settlementReady = true;
    const store = new CommerceBenefitsStore(preparations.get(prepared)!.key, ports);
    const operationKey = `${issuance.operationKey.replace(/:reserve$/, "")}:settle`;
    benefitsAssert(operationKey !== issuance.operationKey && operationKey.length <= 128, "COMPANION_POINTS_SETTLEMENT_SCOPE");
    const settlement: BenefitsSettlementReceipt = store.settle(tx, binding.scope.businessId, receipt.reservationId, operationKey);
    benefitsAssert(settlement.version === 1 && settlement.reservationId === receipt.reservationId
      && canonicalBenefitsJson(settlement.source) === canonicalBenefitsJson(adapter.request.source)
      && settlement.quote.pointsTenderMinor === expectedQuote.pointsTenderMinor,
    "COMPANION_POINTS_SETTLEMENT_SCOPE");
    return Object.freeze({ settlement: Object.freeze(settlement),
      authority: Object.freeze({ state: "paid_settlement_test_only" as const,
        canReservePoints: false as const, canConfirmPoints: false as const }) }) as CompanionSaleBenefitsPaidSettlement;
  });
}

declare const companionPrewriteDecisionBrand: unique symbol;
/** INTERNAL non-authorizing one-shot prewrite rehearsal. Its identity lives only
 * in server memory, so copying or serializing it loses provenance. It is NOT a
 * Store capability, tender authority, route or settlement permission.
 */
export interface CompanionSaleBenefitsPrewriteDecision {
  readonly [companionPrewriteDecisionBrand]: true;
  readonly authority: Readonly<{ state: "prewrite_decision_only"; canReservePoints: false; canConfirmPoints: false }>;
}
export interface CompanionSaleBenefitsPrewriteIntent {
  readonly version: 1;
  readonly decision: "allow_prewrite_only";
  readonly actionId: string;
  readonly operationKey: string;
  readonly sourceId: string;
  readonly businessId: string;
  readonly customerId: string;
  readonly deviceRecordId: string;
  readonly authorizationEpoch: number;
  readonly spendGrantGeneration: string;
  readonly requestedPointsMinor: number;
  readonly pointsTenderMinor: number;
  readonly payableMinor: number;
  readonly availablePointsMinor: number;
  readonly authority: Readonly<{ state: "prewrite_intent_only"; canReservePoints: false; canConfirmPoints: false }>;
}
const prewriteDecisions = new WeakMap<CompanionSaleBenefitsPrewriteDecision, {
  tx: BenefitsTransaction; action: AndroidSyncAction; context: LocalCompanionActionContext | undefined;
  binding: CompanionPointsIntentBinding; prepared: CompanionSaleBenefitsPreparation;
  handle: CompanionSaleBenefitsIssuance; fingerprint: string; evidence: string; sourceId: string;
  capturedAtMs: number; expiresAtMs: number; consumed: boolean;
}>();

/** INTERNAL rehearsal only: derive a one-use decision from a successful live
 * policy evaluation. It cannot reserve, settle, tender, write a receipt or ACK.
 */
export function prepareCompanionSaleBenefitsPrewriteDecision(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsIssuance): CompanionSaleBenefitsPrewriteDecision {
  return benefitsOperation(tx, () => {
    const evidence = evaluateCompanionSaleBenefitsPolicy(tx, action, context, input, binding, prepared, handle);
    const capturedAtMs = Date.now();
    const expiresAtMs = readFreshUntil(tx, binding, prepared);
    benefitsAssert(capturedAtMs >= tx.now && capturedAtMs < expiresAtMs, "COMPANION_POINTS_PREWRITE_EXPIRED");
    const decision = Object.freeze({ authority: Object.freeze({ state: "prewrite_decision_only" as const,
      canReservePoints: false as const, canConfirmPoints: false as const }) }) as CompanionSaleBenefitsPrewriteDecision;
    prewriteDecisions.set(decision, { tx, action, context, binding, prepared, handle,
      fingerprint: preparationFingerprint(action, input), evidence: canonicalBenefitsJson(evidence),
      sourceId: prepared.source.id, capturedAtMs, expiresAtMs, consumed: false });
    return decision;
  });
}

/** INTERNAL exactly-once rehearsal consumption. Re-runs the full live policy
 * evaluation in the identical active parent, so stale/revoked/expired/cloned or
 * mismatched scope fails closed. The returned intent is evidence only.
 */
export function consumeCompanionSaleBenefitsPrewriteDecision(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsIssuance,
  decision: CompanionSaleBenefitsPrewriteDecision): CompanionSaleBenefitsPrewriteIntent {
  return benefitsOperation(tx, () => {
    const state = decision && prewriteDecisions.get(decision);
    benefitsAssert(state && state.tx === tx && state.action === action && state.context === context
      && state.binding === binding && state.prepared === prepared && state.handle === handle
      && state.fingerprint === preparationFingerprint(action, input), "COMPANION_POINTS_PREWRITE_SCOPE");
    benefitsAssert(!state.consumed, "COMPANION_POINTS_PREWRITE_CONSUMED");
    const now = Date.now();
    benefitsAssert(now >= state.capturedAtMs && now < state.expiresAtMs, "COMPANION_POINTS_PREWRITE_EXPIRED");
    const fresh = evaluateCompanionSaleBenefitsPolicy(tx, action, context, input, binding, prepared, handle);
    benefitsAssert(canonicalBenefitsJson(fresh) === state.evidence, "COMPANION_POINTS_PREWRITE_CHANGED");
    benefitsAssert(prepared.source.id === state.sourceId, "COMPANION_POINTS_PREWRITE_SCOPE");
    state.consumed = true;
    return Object.freeze({ version: 1 as const, decision: "allow_prewrite_only" as const,
      actionId: fresh.actionId, operationKey: fresh.operationKey, sourceId: state.sourceId,
      businessId: fresh.businessId, customerId: fresh.customerId, deviceRecordId: fresh.deviceRecordId,
      authorizationEpoch: fresh.authorizationEpoch, spendGrantGeneration: fresh.spendGrantGeneration,
      requestedPointsMinor: fresh.requestedPointsMinor, pointsTenderMinor: fresh.pointsTenderMinor,
      payableMinor: fresh.payableMinor, availablePointsMinor: fresh.availablePointsMinor,
      authority: Object.freeze({ state: "prewrite_intent_only" as const, canReservePoints: false as const,
        canConfirmPoints: false as const }) });
  });
}

/** INTERNAL read-only owner preflight; no production caller or mutation ports.
 * Only the original captured C20k issuance can supply the current tender plan.
 * Independent Companion payment authority is intentionally still unavailable.
 */
export function prepareCompanionSaleTenderContract(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsIssuance) {
  return benefitsOperation(tx, () => {
    revalidateCompanionSaleBenefitsIssuedReservation(tx, action, context, input, binding, prepared, handle);
    const allocation = requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared);
    return prepareMarketSaleCompanionTenderContract(tx, companionSaleInput(action), allocation,
      () => revalidateCompanionSaleBenefitsIssuedReservation(tx, action, context, input, binding, prepared, handle));
  });
}

/** INTERNAL optional observer, never a benefits execution/authority adapter.
 * The existing owner still forbids allocated-source + benefits. Its ordinary
 * full-cash sale can be observed but cannot satisfy this points reservation.
 */
export function prepareCompanionSaleOperationObservation(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsIssuance) {
  return benefitsOperation(tx, () => {
    const state = requireSourceIssuance(tx, action, context, input, binding, prepared, handle);
    benefitsAssert(state.witness && !state.operationObservation, "COMPANION_POINTS_OPERATION_SCOPE");
    benefitsAssert(action.payload.payment_method === "cash", "COMPANION_POINTS_EXTERNAL_TENDER_EVIDENCE_REQUIRED");
    revalidateCompanionSaleBenefitsIssuedReservation(tx, action, context, input, binding, prepared, handle);
    const allocation = requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared);
    state.operationObservation = prepareMarketSaleOperationObservation(tx, companionSaleInput(action), allocation, () => {
      requireSourceIssuance(tx, action, context, input, binding, prepared, handle);
      readCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared, state.witness!, true);
    });
    return state.operationObservation;
  });
}

/** Rechecks owner receipt identity, C20k issuance, live generation and quote.
 * Cash/points/Finance settlement comparison remains a separate mandatory gate.
 */
export function readCompanionSaleOperationWitness(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsIssuance) {
  return benefitsOperation(tx, () => {
    const state = requireSourceIssuance(tx, action, context, input, binding, prepared, handle);
    benefitsAssert(state.witness && state.operationObservation, "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED");
    const reservation = readCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared, state.witness, true);
    const allocation = requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared);
    const receipt = readMarketSaleOperationObservation(tx, companionSaleInput(action), allocation, state.operationObservation);
    return Object.freeze({ receipt, reservation, scope: binding.scope, authority: prepared.authority });
  });
}

/** INTERNAL owner-bound paid-sale preparation. The exact Store reserve receipt
 * must already be captured in this issuance; the live principal, grant, epoch,
 * canonical reservation quote and unused protected source are rechecked before
 * the opaque writer witness is minted. No caller SQL or receipt JSON is accepted.
 */
export function prepareCompanionSalePaidSaleWriter(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsIssuance,
  receipt: BenefitsReservationReceipt) {
  return benefitsOperation(tx, () => {
    const state = requireSourceIssuance(tx, action, context, input, binding, prepared, handle);
    benefitsAssert(state.witness && state.receipt === receipt && receipt && receipt.version === 1,
      "COMPANION_POINTS_PAID_SALE_RECEIPT_REQUIRED");
    const reservation = revalidateCompanionSaleBenefitsIssuedReservation(tx, action, context, input, binding, prepared, handle);
    benefitsAssert(reservation.reservationId === receipt.reservationId
      && canonicalBenefitsJson(reservation.quote) === canonicalBenefitsJson(receipt.quote),
    "COMPANION_POINTS_PAID_SALE_RECEIPT_CHANGED");
    const allocation = requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared);
    benefitsAssert(!state.operationObservation, "COMPANION_POINTS_OPERATION_SCOPE");
    const witness = prepareMarketSaleCompanionPaidSaleObservation(tx, companionSaleInput(action), allocation, receipt, () => {
      requireSourceIssuance(tx, action, context, input, binding, prepared, handle);
      readCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared, state.witness!, true);
    });
    state.operationObservation = witness;
    return Object.freeze({ witness, allocation });
  });
}

/** INTERNAL server reference only; Android intent/payload permits no reservation
 * fields. Existing canonical reservations are evidence, never Companion authority.
 * No durable device/action/grant issuance association exists in the reservation
 * schema: this witness proves current same-parent scope only, not that history.
 */
export function captureCompanionSaleBenefitsReservation(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, reference: { readonly reservationId: string; readonly operationKey: string }): CompanionSaleBenefitsReservationHandle {
  return benefitsOperation(tx, () => {
    const adapter = companionSaleBenefitsPreSaleReadPorts(tx, action, context, input, binding, prepared);
    const capturedAtMs = Date.now();
    const witness = adapter.store.readReservationReadOnly(tx, adapter.request, reference, input.couponPermitId ?? null);
    const expiresAtMs = Math.min(witness.expiresAt, readFreshUntil(tx, binding, prepared));
    const finishedAtMs = Date.now();
    benefitsAssert(capturedAtMs >= tx.now && finishedAtMs >= capturedAtMs && finishedAtMs < expiresAtMs, "COMPANION_POINTS_RESERVATION_EXPIRED");
    const handle = Object.freeze({}) as CompanionSaleBenefitsReservationHandle;
    reservationWitnesses.set(handle, { tx, now: tx.now, action, context, binding, prepared,
      fingerprint: preparationFingerprint(action, input), reference: { reservationId: witness.reservationId, operationKey: witness.operationKey },
      evidence: canonicalBenefitsJson(witness), capturedAtMs, expiresAtMs });
    return handle;
  });
}

/** Re-read on every repeat, in the identical canonical parent. A copied/archived
 * handle, new grant lifetime or changed reserve receipt/source/quote fails closed.
 * Does not reserve, release, expire, settle, refund or authorize any payment.
 */
export function revalidateCompanionSaleBenefitsReservation(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsReservationHandle): ReservationWitness {
  return readCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared, handle, false);
}

function readCompanionSaleBenefitsReservation(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsReservationHandle, paidEvidence: boolean): ReservationWitness {
  return benefitsOperation(tx, () => {
    const state = handle && reservationWitnesses.get(handle);
    benefitsAssert(state && state.tx === tx && state.now === tx.now && state.action === action && state.context === context
      && state.binding === binding && state.prepared === prepared && state.fingerprint === preparationFingerprint(action, input),
    "COMPANION_POINTS_RESERVATION_SCOPE");
    const now = Date.now();
    benefitsAssert(now >= state.capturedAtMs && now < state.expiresAtMs, "COMPANION_POINTS_RESERVATION_EXPIRED");
    const adapter = companionSaleBenefitsReadOnlyPorts(tx, action, context, input, binding, prepared, paidEvidence);
    const witness = adapter.store.readReservationReadOnly(tx, adapter.request, state.reference, input.couponPermitId ?? null);
    benefitsAssert(canonicalBenefitsJson(witness) === state.evidence, "COMPANION_POINTS_RESERVATION_CHANGED");
    const finishedAtMs = Date.now();
    benefitsAssert(finishedAtMs >= now && finishedAtMs < state.expiresAtMs, "COMPANION_POINTS_RESERVATION_EXPIRED");
    freezeReadEvidence(witness);
    return witness;
  });
}

/** INTERNAL terminal negative contract, immediately before hypothetical settle.
 * Rechecks the exact C20k issuance and canonical paid tender in the SAME active
 * parent. No caller amount, receipt JSON, Android flag or desktop role is accepted.
 * Current owners cannot issue an immutable same-parent Android points sale receipt;
 * even matching SQL rows cannot fill that gap. No production mutation is enabled.
 */
export function revalidateCompanionSaleBenefitsPaidParent(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsIssuance): never {
  return benefitsOperation(tx, () => {
    const state = requireSourceIssuance(tx, action, context, input, binding, prepared, handle);
    benefitsAssert(state.witness, "COMPANION_POINTS_ISSUANCE_REQUIRED");
    if (state.operationObservation) readCompanionSaleOperationWitness(tx, action, context, input, binding, prepared, handle);
    const reservation = readCompanionSaleBenefitsReservation(tx, action, context, input, binding, prepared, state.witness, true);
    const adapter = companionSaleBenefitsReadOnlyPorts(tx, action, context, input, binding, prepared, true);
    readMarketSalePaidTenderEvidence(tx, adapter.request, reservation.quote, String(action.payload.location_id ?? ""));
    benefitsAssert(!tx.database.prepare("SELECT 1 FROM android_action_receipts WHERE id=?").get(action.id)
      && !tx.database.prepare("SELECT 1 FROM android_market_sale_result_receipts WHERE action_id=?").get(action.id),
    "COMPANION_POINTS_PARENT_ALREADY_APPLIED");
    const receipt = tx.database.prepare("SELECT * FROM commerce_market_sale_receipts WHERE operation_id=?").get(action.id);
    benefitsAssert(receipt, "COMPANION_POINTS_PARENT_RECEIPT_REQUIRED");
    benefitsAssert(receipt.business_id === binding.scope.businessId && receipt.sale_id === adapter.request.source.id,
      "COMPANION_POINTS_PARENT_RECEIPT_SCOPE");
    // Reuse the actual operation owner's hash/mapping validation if SQL exists.
    // It is not fresh owner provenance: this table has no immutable receipt gate.
    readMarketSaleOperationSourceInTransaction(tx.database, companionSaleInput(action));
    benefitsAssert(false, "COMPANION_POINTS_PARENT_RECEIPT_PROVENANCE_REQUIRED");
  });
}

/** INTERNAL ONLY. No caller quote, HMAC bearer token, durable evidence or payment
 * authority. Capture in the existing authorized parent; never consume its source.
 */
export function captureCompanionSaleBenefitsQuote(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation): CompanionSaleBenefitsQuoteHandle {
  return benefitsOperation(tx, () => {
    const adapter = companionSaleBenefitsPreSaleReadPorts(tx, action, context, input, binding, prepared);
    const result = adapter.readAdvisoryQuote();
    const capturedAtMs = Date.now();
    const expiresAtMs = readFreshUntil(tx, binding, prepared);
    // Expire before any canonical time-dependent evidence can change, even if
    // the parent still has the same logical tx.now. No second pricing calculator.
    const finishedAtMs = Date.now();
    benefitsAssert(capturedAtMs >= tx.now && finishedAtMs >= capturedAtMs && finishedAtMs < expiresAtMs, "COMPANION_POINTS_QUOTE_EXPIRED");
    const handle = Object.freeze({}) as CompanionSaleBenefitsQuoteHandle;
    advisorySnapshots.set(handle, { tx, now: tx.now, action, context, binding, prepared,
      fingerprint: preparationFingerprint(action, input), capturedAtMs, expiresAtMs,
      evidence: canonicalBenefitsJson({ request: adapter.request, scope: binding.scope, result }) });
    return handle;
  });
}

/** Exact same active parent and identities, live authorization and a freshly
 * recomputed canonical quote/balance are mandatory on EVERY repeat. An old handle
 * cannot authorize replay, including after rollback. The owner-issued grant
 * generation rejects same-epoch revoke/regrant and grant reissue.
 */
export function revalidateCompanionSaleBenefitsQuote(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation, handle: CompanionSaleBenefitsQuoteHandle): AdvisoryQuote {
  return benefitsOperation(tx, () => {
    const state = handle && advisorySnapshots.get(handle);
    benefitsAssert(state && state.tx === tx && state.now === tx.now && state.action === action && state.context === context
      && state.binding === binding && state.prepared === prepared && state.fingerprint === preparationFingerprint(action, input),
    "COMPANION_POINTS_QUOTE_SCOPE");
    const now = Date.now();
    benefitsAssert(now >= state.capturedAtMs && now < state.expiresAtMs, "COMPANION_POINTS_QUOTE_EXPIRED");
    const adapter = companionSaleBenefitsPreSaleReadPorts(tx, action, context, input, binding, prepared);
    const result = adapter.readAdvisoryQuote();
    benefitsAssert(canonicalBenefitsJson({ request: adapter.request, scope: binding.scope, result }) === state.evidence,
      "COMPANION_POINTS_QUOTE_CHANGED");
    const finishedAtMs = Date.now();
    benefitsAssert(finishedAtMs >= now && finishedAtMs < state.expiresAtMs, "COMPANION_POINTS_QUOTE_EXPIRED");
    // Return an isolated deeply frozen advisory value, never the private evidence.
    freezeReadEvidence(result);
    return result;
  });
}

/** Actual zero-points paid sale + Finance evidence, never a points settlement.
 * Store gets the preloaded key; read-only ports continue to deny reserve/settle.
 */
export function companionSaleBenefitsPreparedPorts(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding,
  prepared: CompanionSaleBenefitsPreparation) {
  return benefitsOperation(tx, () => {
    const allocation = requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared);
    const adapter = companionSaleBenefitsReadPorts(tx, action, context, input, binding);
    benefitsAssert(adapter.request.source.id === allocation.source.id, "COMPANION_POINTS_SOURCE_SCOPE");
    const readPaidEvidence = () => benefitsOperation(tx, () => {
      requireCompanionSaleBenefitsSource(tx, action, context, input, binding, prepared);
      adapter.assertReadAuthorized(tx.database, adapter.request);
      const sale = readMarketSaleOperationSourceInTransaction(tx.database, companionSaleInput(action))!.sale;
      const rows = tx.database.prepare("SELECT * FROM finance_entries WHERE source_type='commerce_sale' AND source_id=?").all(sale.id);
      const cashPaidMinor = moneyToMinor(sale.total), row = rows[0];
      benefitsAssert(cashPaidMinor === 0 ? rows.length === 0 : rows.length === 1 && row
        && row.direction === "income" && row.deleted_at === ""
        && row.amount_minor === cashPaidMinor && row.currency === sale.currency
        && row.payment_method === (["cash", "card", "bank"].includes(sale.paymentMethod) ? sale.paymentMethod : "other"),
      "COMPANION_POINTS_PAID_EVIDENCE_REQUIRED");
      benefitsAssert(!tx.database.prepare("SELECT 1 FROM commerce_sale_settlements WHERE sale_id=?").get(sale.id)
        && !tx.database.prepare("SELECT 1 FROM commerce_benefit_snapshots WHERE source_kind='sale' AND source_id=?").get(sale.id),
      "COMPANION_POINTS_PAID_EVIDENCE_REQUIRED");
      return Object.freeze({ source: allocation.source, businessId: sale.businessId, customerId: adapter.request.customerId,
        currency: sale.currency, cashPaidMinor, pointsTenderMinor: 0 as const });
    });
    readPaidEvidence();
    return Object.freeze({ ...adapter, readPaidEvidence,
      store: new CommerceBenefitsStore(preparations.get(prepared)!.key, adapter.ports) });
  });
}

/** Internal read contract only. authorize deliberately denies Store mutations:
 * paid settlement under Companion authority/key lifecycle is not established.
 * No production route consumes this factory; it cannot allocate a future sale.
 */
export function companionSaleBenefitsReadPorts(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, input: CompanionPointsIntent, binding: CompanionPointsIntentBinding) {
  return benefitsOperation(tx, () => {
    const readCurrent = () => {
      const { scope } = validateCompanionPointsIntent(tx, action, context, input, binding);
      const method = action.payload.payment_method;
      benefitsAssert(typeof method === "string" && ["cash", "card", "bank", "other"].includes(method)
        && (method !== "card" || action.payload.external_payment_confirmed === true), "COMPANION_POINTS_SOURCE_SCOPE");
      // Reuse the actual sale owner's request hash and operation->sale mapping.
      // Legacy sales allocate random IDs; sale_<hash(action)> would be fictitious.
      const source = readMarketSaleOperationSourceInTransaction(tx.database, {
        operationId: action.id, source: "android-market-sale", settlement: "paid", customerId: scope.customerId,
        locationId: String(action.payload.location_id ?? "").trim(), paymentMethod: method,
        items: scope.lines.map((line, index) => {
          const raw = (action.payload.lines as Record<string, unknown>[])[index]!;
          return { productId: line.productId, quantity: raw.quantity as number,
            expectedUnitPrice: raw.expected_unit_price as number, expectedCurrency: line.currency, expectedUpdatedAt: line.updatedAt };
        })
      });
      benefitsAssert(source, "COMPANION_POINTS_SOURCE_REQUIRED");
      const { sale, customerId } = source;
      benefitsAssert(sale.businessId === scope.businessId && customerId === scope.customerId && sale.status === "paid"
        && sale.source === "android-market-sale" && sale.currency === scope.currency && sale.paymentMethod === method,
      "COMPANION_POINTS_SOURCE_SCOPE");
      benefitsAssert(!tx.database.prepare("SELECT 1 FROM commerce_order_fulfillments WHERE sale_id=?").get(sale.id), "COMPANION_POINTS_SOURCE_SCOPE");
      const receipt = tx.database.prepare("SELECT action_type,device_id,intent_hash FROM android_action_receipts WHERE id=?").get(action.id);
      benefitsAssert(!receipt || (receipt.action_type === scope.actionType && receipt.device_id === scope.deviceId
        && receipt.intent_hash === scope.actionIntentHash), "COMPANION_POINTS_SOURCE_SCOPE");
      return { scope, sale, method };
    };
    const initial = readCurrent();
    const request: BenefitsPricingRequest = Object.freeze({ businessId: initial.scope.businessId, customerId: initial.scope.customerId,
      source: Object.freeze({ kind: "sale" as const, id: initial.sale.id }), channel: "companion", currency: initial.scope.currency,
      lines: Object.freeze(initial.scope.lines.map(line => Object.freeze({ productId: line.productId, quantityTenThousandths: line.quantityTenThousandths }))),
      paymentMethodId: initial.method, requestedPointsMinor: initial.scope.requestedPointsMinor });
    const assertScope = (database: DatabaseSync, candidate: BenefitsPricingRequest) => {
      benefitsAssert(database === tx.database && canonicalBenefitsJson(candidate) === canonicalBenefitsJson(request), "COMPANION_POINTS_SOURCE_SCOPE");
      const current = readCurrent();
      benefitsAssert(current.sale.id === request.source.id, "COMPANION_POINTS_SOURCE_SCOPE");
      return current;
    };
    const disabled = (): never => { throw Object.assign(new Error("Companion benefits reservation is disabled."), { code: "COMPANION_POINTS_RESERVATION_DISABLED" }); };
    const denySource = (database: DatabaseSync, source: BenefitsSource) => benefitsOperation(tx, () => {
      assertScope(database, request);
      benefitsAssert(canonicalBenefitsJson(source) === canonicalBenefitsJson(request.source), "COMPANION_POINTS_SOURCE_SCOPE");
      return disabled();
    });
    const ports: CommerceBenefitsParentPorts = Object.freeze({
      authorize(database: DatabaseSync, candidate: BenefitsPricingRequest, _operation: "checkout" | "refund") {
        return benefitsOperation(tx, () => { assertScope(database, candidate); return disabled(); });
      },
      authorizePointAdjustment(database: DatabaseSync, businessId: string, customerId: string) {
        return benefitsOperation(tx, () => {
          assertScope(database, request);
          benefitsAssert(businessId === request.businessId && customerId === request.customerId, "COMPANION_POINTS_SOURCE_SCOPE");
          return disabled();
        });
      },
      resolvePricing(database: DatabaseSync, candidate: BenefitsPricingRequest, now: number): BenefitsPricingContext {
        return benefitsOperation(tx, () => {
          benefitsAssert(now === tx.now, "COMPANION_POINTS_SOURCE_SCOPE");
          // Validation rereads the canonical price owner, revisions and rule heads.
          const { scope, method } = assertScope(database, candidate);
          const groups = new Set(scope.lines.map(line => line.appliedPriceGroup));
          benefitsAssert(groups.size === 1, "BENEFITS_PRICE_GROUP_UNSUPPORTED");
          return { businessId: scope.businessId, customerId: scope.customerId, channel: "companion", currency: scope.currency,
            currencyExponent: 2, now, customerGroups: [], priceGroup: scope.lines[0]!.appliedPriceGroup,
            lines: scope.lines.map((line, index) => ({ id: `line${index}`, productId: line.productId, categoryId: line.categoryId,
              unitPriceMinor: line.unitPriceMinor, quantityTenThousandths: line.quantityTenThousandths })),
            // No payment/settlement authority is inferred from request flags or a
            // legacy paid sale. Store owns family/balance reads if ever integrated.
            payment: { methodId: method, confirmed: false }, requestedPointsMinor: scope.requestedPointsMinor,
            families: { coupon: false, points: false, payment_modifier: false }, availablePointsMinor: 0,
            accounting: { taxTreatment: "included_in_items", taxMinor: 0, financeMinor: 0, earnOnAccountingAdjustments: false } };
        });
      },
      readSettlement: denySource,
      readFullRefund: denySource
    });
    return Object.freeze({ request, ports,
      assertReadAuthorized(database: DatabaseSync, candidate: BenefitsPricingRequest): void {
        benefitsOperation(tx, () => { assertScope(database, candidate); });
      },
      authority: Object.freeze({ state: "read_only" as const, canReservePoints: false as const, canConfirmPoints: false as const }) });
  });
}
