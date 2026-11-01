import { createHash } from "node:crypto";
import { BUSINESS_CAPABILITIES as C, moneyToMinor, type BenefitsCheckoutIntent,
  type BenefitsPricingContext, type BenefitsQuote, type BenefitsSettlementReceipt } from "@yardimci-asistan/shared";
import { DatabaseSync } from "node:sqlite";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service.js";
import { benefitsAssert } from "./commerce-benefits-engine.js";
import { canonicalBenefitsJson, benefitsIntentForStorage, readBenefitsFamilies, withCommerceBenefitsTransaction, requireCommerceBenefitsCapability, type BenefitsSecretKey, type BenefitsTransaction } from "./commerce-benefits-rules.js";
import { readCommercePointBalance } from "./commerce-benefits-points.js";
import { CommerceBenefitsStore, type CommerceBenefitsParentPorts, type BenefitsPricingRequest } from "./commerce-benefits-store.js";
import type { BenefitsManagementActor, BenefitsManagementKeys } from "./commerce-benefits-management.js";
import type { CommerceSaleBenefitsSettlement } from "./commerce-store.js";
import type { CompleteMarketSaleInput } from "./market-sale-operation.js";

/** Local secret input only; never place this command in diagnostics or history. */
export interface MarketSaleBenefitsCommand { requestedPointsMinor: number; expectedQuote: BenefitsQuote; couponCode?: string }
export interface MarketSalePreviewInput {
  operationId: string;
  items: { productId: string; quantity: number }[];
  customerId?: string | undefined;
  paymentMethod: string;
  requestedPointsMinor: number;
  couponCode?: string | undefined;
}
export interface MarketSaleBenefitsState { enabled: boolean; families: import("@yardimci-asistan/shared").BenefitsFamilies }
export interface MarketSalePreview {
  quote: BenefitsQuote;
  availablePointsMinor: number;
  families: MarketSaleBenefitsState["families"];
  authority: { state: "preview_only"; canConfirmPoints: false };
}
export interface MarketSaleBenefitsAuthority { actor: BenefitsManagementActor; keys: BenefitsManagementKeys }
export interface MarketSaleBenefitsExecution { tx: BenefitsTransaction; authority: MarketSaleBenefitsAuthority; key: BenefitsSecretKey; authorizationId?: string | null }

export function canonicalMarketBenefitsPayment(method: string | undefined): string {
  const value = String(method ?? "cash").trim();
  const canonical = value === "transfer" ? "bank" : value;
  benefitsAssert(["cash", "card", "bank", "other"].includes(canonical), "BENEFITS_PAYMENT_CONFIRMATION_REQUIRED");
  return canonical;
}

/** Bound to a server-created sale identity and the authenticated local owner. */
export function marketSaleBenefitsPorts(actor: BenefitsManagementActor, bound: BenefitsPricingRequest): CommerceBenefitsParentPorts {
  const authorize = (database: DatabaseSync, request: BenefitsPricingRequest, operation: "checkout" | "refund") => {
    actor.assertAuthorized();
    benefitsAssert(actor.role === "desktop_owner" && actor.id.length > 0, "BENEFITS_STAFF_REQUIRED");
    const business = database.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
    benefitsAssert(business?.id === request.businessId, "BENEFITS_TENANT_REQUIRED");
    requireCommerceBenefitsCapability(database, request.businessId);
    benefitsAssert(readEnabledBusinessCapabilities(database).includes(C.SALES), "BENEFITS_CAPABILITY_DISABLED");
    benefitsAssert(operation === "checkout" && request.source.kind === "sale" && request.channel === "desktop_cart"
      && canonicalBenefitsJson(request) === canonicalBenefitsJson(bound), "BENEFITS_CONTEXT_SCOPE");
    if (request.customerId !== null) benefitsAssert(database.prepare(
      "SELECT 1 FROM customers WHERE business_id = ? AND id = ? AND deleted_at = ''").get(request.businessId, request.customerId), "BENEFITS_CUSTOMER_SCOPE");
    const existing = database.prepare(`SELECT s.business_id,p.customer_id FROM commerce_sales s
      LEFT JOIN commerce_sale_settlements p ON p.sale_id = s.id WHERE s.id = ?`).get(request.source.id);
    // Fulfillment sales have exactly one benefits source: their parent commerce_order.
    benefitsAssert(!database.prepare("SELECT 1 FROM commerce_sales WHERE id = ? AND source = 'commerce-order'").get(request.source.id)
      && !database.prepare("SELECT 1 FROM commerce_order_fulfillments WHERE sale_id = ?").get(request.source.id), "BENEFITS_CONTEXT_SCOPE");
    if (existing) benefitsAssert(existing.business_id === request.businessId && existing.customer_id === request.customerId, "BENEFITS_SETTLEMENT_SCOPE");
  };
  return {
    authorize,
    authorizePointAdjustment: () => { benefitsAssert(false, "BENEFITS_STAFF_REQUIRED"); },
    resolvePricing(database, request, now): BenefitsPricingContext {
      authorize(database, request, "checkout");
      const wholesale = readEnabledBusinessCapabilities(database).includes(C.WHOLESALE);
      const prices = request.lines.map(line => resolveCommerceProductPriceInDatabase(database, request.businessId,
        { productId: line.productId, ...(request.customerId === null ? {} : { customerId: request.customerId }) }, wholesale));
      const groups = new Set(prices.map(price => price.appliedGroup));
      // The engine has one price-group scope. Mixed dealer fallback needs an explicit later policy.
      benefitsAssert(groups.size === 1, "BENEFITS_PRICE_GROUP_UNSUPPORTED");
      const lines = request.lines.map((line, index) => {
        const price = prices[index]!;
        benefitsAssert(price.currency === request.currency, "BENEFITS_CONTEXT_SCOPE");
        const product = database.prepare("SELECT category_id FROM catalog_products WHERE business_id = ? AND id = ?").get(request.businessId, line.productId)!;
        return { id: `line${index}`, productId: line.productId, categoryId: String(product.category_id),
          unitPriceMinor: moneyToMinor(price.unitPrice), quantityTenThousandths: line.quantityTenThousandths };
      });
      const method = canonicalMarketBenefitsPayment(request.paymentMethodId ?? undefined);
      benefitsAssert(method === request.paymentMethodId, "BENEFITS_PAYMENT_METHOD_CHANGED");
      return { businessId: request.businessId, customerId: request.customerId, channel: "desktop_cart", currency: request.currency,
        // Canonical Commerce/Finance money owner currently uses two decimal minor units.
        currencyExponent: 2, now, customerGroups: [], priceGroup: prices[0]!.appliedGroup, lines,
        families: { coupon: false, points: false, payment_modifier: false }, availablePointsMinor: 0,
        requestedPointsMinor: request.requestedPointsMinor, payment: { methodId: method, confirmed: true },
        accounting: { taxTreatment: "included_in_items", taxMinor: 0, financeMinor: 0, earnOnAccountingAdjustments: false } };
    },
    readSettlement(database, source) {
      if (source.kind !== "sale" || source.id !== bound.source.id) return null;
      authorize(database, bound, "checkout");
      const row = database.prepare(`SELECT s.*,p.customer_id,p.cash_received_minor,p.points_tender_minor,
        p.payment_method AS tender_method FROM commerce_sales s JOIN commerce_sale_settlements p
        ON p.sale_id = s.id AND p.business_id = s.business_id WHERE s.id = ? AND s.deleted_at = ''`).get(source.id);
      if (!row) return null;
      const state = String(row.status);
      benefitsAssert(["paid", "credit", "open"].includes(state), "BENEFITS_ACTUAL_PAYMENT_REQUIRED");
      benefitsAssert(row.payment_method === row.tender_method
        && moneyToMinor(Number(row.total)) === Number(row.cash_received_minor) + Number(row.points_tender_minor), "BENEFITS_SETTLEMENT_MISMATCH");
      return { businessId: String(row.business_id), customerId: row.customer_id === null ? null : String(row.customer_id), source,
        state: state as "paid" | "credit" | "open", currency: String(row.currency), paymentMethodId: String(row.tender_method),
        paidMinor: Number(row.cash_received_minor), pointsTenderMinor: Number(row.points_tender_minor),
        subtotalMinor: moneyToMinor(Number(row.subtotal)), discountMinor: moneyToMinor(Number(row.discount_total)), accountingMinor: 0 };
    },
    readFullRefund: () => null
  };
}

export function validateMarketSaleBenefitsCommand(input: CompleteMarketSaleInput): void {
  if (input.benefits === undefined) return;
  const command = input.benefits;
  benefitsAssert(command && Object.keys(command).every(key => ["expectedQuote", "requestedPointsMinor", "couponCode"].includes(key))
    && Number.isSafeInteger(command.requestedPointsMinor) && command.requestedPointsMinor >= 0
    && command.expectedQuote && input.operationId && input.settlement === "paid" && Number(input.discountTotal ?? 0) === 0,
  "BENEFITS_FAST_SALE_UNSUPPORTED");
}
export function validateMarketSaleBenefits(input: CompleteMarketSaleInput, execution?: MarketSaleBenefitsExecution): void {
  if (input.benefits === undefined) return;
  benefitsAssert(execution && execution.tx.database.isTransaction, "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  execution.authority.actor.assertAuthorized();
  validateMarketSaleBenefitsCommand(input);
}

function marketSaleBenefitsIntent(database: DatabaseSync, input: MarketSalePreviewInput): BenefitsCheckoutIntent {
  benefitsAssert(input && /^[a-zA-Z0-9_-]{8,128}$/.test(input.operationId), "BENEFITS_OPERATION_KEY_REQUIRED");
  benefitsAssert(Array.isArray(input.items) && input.items.length > 0 && input.items.length <= 1000, "BENEFITS_INVALID_INTENT");
  const business = database.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
  const product = database.prepare("SELECT currency FROM catalog_products WHERE business_id = ? AND id = ? AND deleted_at = ''")
    .get(String(business?.id ?? ""), input.items[0]!.productId);
  const sourceId = `sale_${createHash("sha256").update(input.operationId).digest("hex")}`;
  const persisted = database.prepare("SELECT currency FROM commerce_sales WHERE id = ?").get(sourceId);
  const intent: BenefitsCheckoutIntent = {
    businessId: String(business?.id ?? ""), customerId: input.customerId?.trim() || null,
    source: { kind: "sale", id: sourceId },
    channel: "desktop_cart", currency: String(persisted?.currency ?? product?.currency ?? ""),
    lines: input.items.map(item => {
      benefitsAssert(typeof item.productId === "string" && Number.isFinite(item.quantity) && item.quantity > 0, "BENEFITS_INVALID_INTENT");
      return { productId: item.productId.trim(), quantityTenThousandths: Math.round((item.quantity + Number.EPSILON) * 10000) };
    }),
    couponCodes: input.couponCode === undefined || input.couponCode === "" ? [] : [input.couponCode],
    paymentMethodId: canonicalMarketBenefitsPayment(input.paymentMethod), requestedPointsMinor: input.requestedPointsMinor
  };
  benefitsIntentForStorage(intent);
  return intent;
}

/** Resolve trusted scope before key I/O or the independent coupon rate transaction. */
export function prepareMarketSaleBenefitsIngress(database: DatabaseSync, input: MarketSalePreviewInput, authority: MarketSaleBenefitsAuthority, replay = false) {
  const intent = marketSaleBenefitsIntent(database, input);
  const bound = benefitsIntentForStorage(intent);
  const ports = marketSaleBenefitsPorts(authority.actor, bound);
  ports.authorize(database, bound, "checkout");
  if (!replay) {
    const families = readBenefitsFamilies(database, intent.businessId);
    benefitsAssert(Object.values(families).some(Boolean), "BENEFITS_CAPABILITY_DISABLED");
    benefitsAssert(!intent.requestedPointsMinor || families.points, "BENEFITS_POINTS_UNAVAILABLE");
    benefitsAssert(!intent.couponCodes.length || families.coupon, "BENEFITS_COUPON_UNAVAILABLE");
  }
  const used = database.prepare("SELECT 1 FROM commerce_benefit_coupon_codes UNION ALL SELECT 1 FROM commerce_benefit_receipts LIMIT 1").get();
  const key = authority.keys.load(!used);
  const store = new CommerceBenefitsStore(key, ports);
  return { intent, bound, ports, key, store, authorizeCoupon(): string | null {
    if (!intent.couponCodes.length) return null;
    const result = store.authorizeCouponAttempt(database, intent, `desktop_owner:${authority.actor.id}`, Date.now());
    benefitsAssert(result.ok, result.ok ? "BENEFITS_COUPON_UNAVAILABLE" : result.code);
    return result.authorizationId;
  } };
}

/** Key-free availability probe; disabled installations keep the legacy checkout. */
export function getMarketSaleBenefitsState(path: string): MarketSaleBenefitsState {
  const database = new DatabaseSync(path);
  try {
    const enabled = readEnabledBusinessCapabilities(database);
    const businessId = String(database.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
    if (![C.COMMERCE_BENEFITS, C.SALES, C.CUSTOMERS, C.CATALOG].every(c => enabled.includes(c))) {
      return { enabled: false, families: { coupon: false, points: false, payment_modifier: false } };
    }
    return { enabled: true, families: readBenefitsFamilies(database, businessId) };
  } finally { database.close(); }
}

export function previewMarketSaleBenefits(path: string, input: MarketSalePreviewInput, authority: MarketSaleBenefitsAuthority): MarketSalePreview {
  benefitsAssert(input && Object.keys(input).every(key => ["operationId", "items", "customerId", "paymentMethod", "requestedPointsMinor", "couponCode"].includes(key))
    && Array.isArray(input.items) && input.items.every(item => item && Object.keys(item).every(key => ["productId", "quantity"].includes(key))), "BENEFITS_INVALID_INTENT");
  const database = new DatabaseSync(path);
  try {
    const ingress = prepareMarketSaleBenefitsIngress(database, input, authority);
    const authorizationId = ingress.authorizeCoupon();
    // Minimal synchronous preview transaction: no holds, settlement or point grants.
    return withCommerceBenefitsTransaction(database, Date.now(), tx => {
      const preview = ingress.store.preview(tx, ingress.intent, authorizationId);
      const families = readBenefitsFamilies(database, ingress.intent.businessId);
      return { ...preview, families,
        availablePointsMinor: ingress.intent.customerId && families.points
          ? readCommercePointBalance(database, ingress.intent.businessId, ingress.intent.customerId, ingress.intent.currency, tx.now).availableMinor : 0 };
    });
  } finally { database.close(); }
}

export function prepareMarketSaleBenefits(input: CompleteMarketSaleInput, execution: MarketSaleBenefitsExecution): {
  settlement: CommerceSaleBenefitsSettlement; settle(): BenefitsSettlementReceipt;
} {
  const { tx, authority } = execution;
  const command = input.benefits!;
  const initialIntent = marketSaleBenefitsIntent(tx.database, { ...input, paymentMethod: input.paymentMethod ?? "cash", requestedPointsMinor: command.requestedPointsMinor, couponCode: command.couponCode, operationId: input.operationId! });
  const saleId = initialIntent.source.id;
  const operationKey = `sale:${createHash("sha256").update(input.operationId!).digest("hex")}`;
  let store: CommerceBenefitsStore;
  let intent: BenefitsCheckoutIntent;
  let reservationId: string;
  return {
    settlement: { saleId, reserve(parent) {
      intent = initialIntent;
      benefitsAssert(intent.businessId === parent.businessId && intent.currency === parent.currency, "BENEFITS_CONTEXT_SCOPE");
      const bound = benefitsIntentForStorage(intent);
      const ports = marketSaleBenefitsPorts(authority.actor, bound);
      ports.authorize(tx.database, bound, "checkout");
      store = new CommerceBenefitsStore(execution.key, ports);
      const reservation = store.reserve(tx, intent, `${operationKey}:reserve`, execution.authorizationId);
      reservationId = reservation.reservationId;
      benefitsAssert(reservation.quote.subtotalMinor === parent.subtotalMinor
        && canonicalBenefitsJson(reservation.quote) === canonicalBenefitsJson(command.expectedQuote), "BENEFITS_QUOTE_CHANGED");
      benefitsAssert(input.paymentAmountMinor === reservation.quote.payableMinor, "BENEFITS_ACTUAL_PAYMENT_REQUIRED");
      return reservation.quote;
    } },
    settle: () => store.settle(tx, intent.businessId, reservationId, `${operationKey}:settle`)
  };
}

export function replayMarketSaleBenefits(database: DatabaseSync, saleId: string, authority: MarketSaleBenefitsAuthority): BenefitsSettlementReceipt {
  const row = database.prepare(`SELECT r.intent_json,s.receipt_json FROM commerce_benefit_snapshots s
    JOIN commerce_benefit_reservations r ON r.business_id = s.business_id AND r.id = s.reservation_id
    WHERE s.source_kind = 'sale' AND s.source_id = ?`).get(saleId);
  benefitsAssert(row, "BENEFITS_SETTLEMENT_SCOPE");
  const bound = JSON.parse(String(row.intent_json)) as BenefitsPricingRequest;
  marketSaleBenefitsPorts(authority.actor, bound).authorize(database, bound, "checkout");
  return JSON.parse(String(row.receipt_json)) as BenefitsSettlementReceipt;
}
