import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, moneyToMinor, type BenefitsCheckoutIntent, type BenefitsQuote,
  type BenefitsSettlementReceipt, type CommerceOrderBenefitsPreviewInput, type CommerceOrderBenefitsPreview,
  type CommerceOrderDetail, type FulfillCommerceOrderInput } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store";
import { getCommerceOrderDetailInTransaction } from "./commerce-order-store";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service";
import { benefitsAssert } from "./commerce-benefits-engine";
import { benefitsIntentForStorage, canonicalBenefitsJson, readBenefitsFamilies, requireCommerceBenefitsCapability,
  withCommerceBenefitsTransaction } from "./commerce-benefits-rules";
import { CommerceBenefitsStore, type BenefitsPricingRequest, type CommerceBenefitsParentPorts } from "./commerce-benefits-store";
import { readCommercePointBalance } from "./commerce-benefits-points";
import type { BenefitsManagementActor, BenefitsManagementKeys } from "./commerce-benefits-management";

export interface OrderBenefitsAuthority { actor: BenefitsManagementActor; keys: BenefitsManagementKeys }
const methods = ["cash", "card", "bank", "other"];

function orderForBenefits(database: DatabaseSync, orderId: string): CommerceOrderDetail {
  const businessId = String(database.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
  const detail = getCommerceOrderDetailInTransaction(database, businessId, orderId);
  benefitsAssert(detail, "BENEFITS_CONTEXT_SCOPE");
  // This slice never authorizes remote/dealer ingress or provisional order mutations.
  benefitsAssert(["desktop", "desktop-wholesale"].includes(detail.order.source), "BENEFITS_ORDER_SOURCE_UNSUPPORTED");
  benefitsAssert(["confirmed", "fulfilled"].includes(detail.order.status) && detail.order.total > 0, "BENEFITS_ORDER_PAID_REQUIRED");
  return detail;
}

export function validateOrderBenefitsPreview(input: CommerceOrderBenefitsPreviewInput): void {
  benefitsAssert(input && Object.keys(input).every(key => ["orderId", "operationKey", "paymentMethod", "requestedPointsMinor", "couponCode"].includes(key))
    && typeof input.orderId === "string" && input.orderId.length > 0 && input.orderId.length <= 128
    && typeof input.operationKey === "string" && input.operationKey.trim().length > 0 && input.operationKey.length <= 180
    && methods.includes(input.paymentMethod) && Number.isSafeInteger(input.requestedPointsMinor) && input.requestedPointsMinor >= 0
    && (input.couponCode === undefined || typeof input.couponCode === "string" && input.couponCode.length <= 128), "BENEFITS_INVALID_INTENT");
}

export function orderBenefitsPreviewInput(input: FulfillCommerceOrderInput): CommerceOrderBenefitsPreviewInput {
  const command = input.benefits;
  benefitsAssert(command && Object.keys(input).every(key => ["orderId", "operationKey", "settlement", "locationId", "benefits"].includes(key))
    && Object.keys(command).every(key => ["requestedPointsMinor", "expectedQuote", "paymentAmountMinor", "couponCode"].includes(key))
    && input.settlement?.type === "paid" && Object.keys(input.settlement).every(key => ["type", "paymentMethod"].includes(key))
    && command.expectedQuote && Number.isSafeInteger(command.paymentAmountMinor) && command.paymentAmountMinor >= 0
    && (input.locationId === undefined || typeof input.locationId === "string" && input.locationId.length <= 128), "BENEFITS_ORDER_PAID_REQUIRED");
  const preview = { orderId: input.orderId, operationKey: input.operationKey, paymentMethod: input.settlement.paymentMethod,
    requestedPointsMinor: command.requestedPointsMinor, ...(command.couponCode === undefined ? {} : { couponCode: command.couponCode }) };
  validateOrderBenefitsPreview(preview);
  canonicalBenefitsJson(command.expectedQuote);
  return preview;
}

function intentForOrder(database: DatabaseSync, input: CommerceOrderBenefitsPreviewInput): BenefitsCheckoutIntent {
  const { order, items } = orderForBenefits(database, input.orderId);
  const intent: BenefitsCheckoutIntent = { businessId: order.businessId, customerId: order.customerId || null,
    source: { kind: "commerce_order", id: order.id }, channel: "desktop_desk", currency: order.currency,
    lines: items.map(item => ({ productId: item.productId, quantityTenThousandths: Math.round(item.quantity * 10000) })),
    paymentMethodId: input.paymentMethod, requestedPointsMinor: input.requestedPointsMinor,
    couponCodes: input.couponCode ? [input.couponCode] : [] };
  benefitsIntentForStorage(intent);
  return intent;
}

/** Only stored order prices are money authority. Current pricing supplies eligibility/group, never replacement prices. */
export function orderBenefitsPorts(actor: BenefitsManagementActor, bound: BenefitsPricingRequest, saleId?: string): CommerceBenefitsParentPorts {
  const authorize = (database: DatabaseSync, request: BenefitsPricingRequest, operation: "checkout" | "refund") => {
    actor.assertAuthorized();
    benefitsAssert(actor.role === "desktop_owner" && actor.id.length > 0, "BENEFITS_STAFF_REQUIRED");
    requireCommerceBenefitsCapability(database, request.businessId);
    const enabled = readEnabledBusinessCapabilities(database);
    benefitsAssert(enabled.includes(C.ORDERS) && enabled.includes(C.SALES), "BENEFITS_CAPABILITY_DISABLED");
    benefitsAssert(operation === "checkout" && request.source.kind === "commerce_order" && request.channel === "desktop_desk"
      && canonicalBenefitsJson(request) === canonicalBenefitsJson(bound), "BENEFITS_CONTEXT_SCOPE");
    const detail = orderForBenefits(database, request.source.id);
    benefitsAssert(detail.order.businessId === request.businessId && (detail.order.customerId || null) === request.customerId
      && detail.order.currency === request.currency
      && canonicalBenefitsJson(detail.items.map(item => ({ productId: item.productId, quantityTenThousandths: Math.round(item.quantity * 10000) }))) === canonicalBenefitsJson(request.lines), "BENEFITS_CONTEXT_SCOPE");
    if (request.customerId) benefitsAssert(database.prepare("SELECT 1 FROM customers WHERE business_id = ? AND id = ? AND deleted_at = ''")
      .get(request.businessId, request.customerId), "BENEFITS_CUSTOMER_SCOPE");
  };
  return {
    authorize, authorizePointAdjustment: () => { benefitsAssert(false, "BENEFITS_STAFF_REQUIRED"); },
    resolvePricing(database, request, now) {
      authorize(database, request, "checkout");
      const detail = orderForBenefits(database, request.source.id);
      const wholesale = readEnabledBusinessCapabilities(database).includes(C.WHOLESALE);
      const prices = detail.items.map(item => resolveCommerceProductPriceInDatabase(database, request.businessId,
        { productId: item.productId, customerId: request.customerId ?? "" }, wholesale));
      const groups = new Set(prices.map(price => price.appliedGroup));
      benefitsAssert(groups.size === 1, "BENEFITS_PRICE_GROUP_UNSUPPORTED");
      const lines = detail.items.map((item, index) => {
        const category = database.prepare("SELECT category_id FROM catalog_products WHERE business_id = ? AND id = ? AND deleted_at = ''")
          .get(request.businessId, item.productId);
        benefitsAssert(category && prices[index]!.currency === request.currency, "BENEFITS_CONTEXT_SCOPE");
        return { id: `line${index}`, productId: item.productId, categoryId: String(category.category_id),
          unitPriceMinor: moneyToMinor(item.unitPrice), quantityTenThousandths: Math.round(item.quantity * 10000) };
      });
      benefitsAssert(methods.includes(request.paymentMethodId ?? ""), "BENEFITS_PAYMENT_CONFIRMATION_REQUIRED");
      return { businessId: request.businessId, customerId: request.customerId, customerGroups: [], priceGroup: prices[0]!.appliedGroup,
        channel: "desktop_desk", currency: request.currency, currencyExponent: 2, now, lines,
        families: { coupon: false, points: false, payment_modifier: false }, availablePointsMinor: 0,
        requestedPointsMinor: request.requestedPointsMinor, payment: { methodId: request.paymentMethodId!, confirmed: true },
        accounting: { taxTreatment: "included_in_items", taxMinor: 0, financeMinor: 0, earnOnAccountingAdjustments: false } };
    },
    readSettlement(database, source) {
      if (!saleId || source.kind !== "commerce_order" || source.id !== bound.source.id) return null;
      authorize(database, bound, "checkout");
      const row = database.prepare(`SELECT s.*, p.customer_id, p.cash_received_minor, p.points_tender_minor,
        p.payment_method AS tender_method, f.settlement_type, f.payment_method AS fulfillment_method,
        o.customer_id AS order_customer, o.status AS order_status, o.subtotal AS order_subtotal,
        o.discount_total AS order_discount, o.total AS order_total, o.currency AS order_currency
        FROM commerce_order_fulfillments f JOIN commerce_orders o ON o.id = f.order_id AND o.business_id = f.business_id
        JOIN commerce_sales s ON s.id = f.sale_id AND s.business_id = f.business_id
        JOIN commerce_sale_settlements p ON p.sale_id = s.id AND p.business_id = s.business_id
        WHERE f.business_id = ? AND f.order_id = ? AND f.sale_id = ? AND s.deleted_at = '' AND o.deleted_at = ''`)
        .get(bound.businessId, source.id, saleId);
      if (!row) return null;
      benefitsAssert(row.status === "paid" && row.order_status === "fulfilled" && row.settlement_type === "paid"
        && row.source === "commerce-order" && row.customer_id === row.order_customer
        && row.payment_method === row.tender_method && row.payment_method === row.fulfillment_method
        && row.currency === row.order_currency && row.subtotal === row.order_subtotal && row.discount_total === row.order_discount
        && row.total === row.order_total && moneyToMinor(Number(row.total)) === Number(row.cash_received_minor) + Number(row.points_tender_minor), "BENEFITS_SETTLEMENT_MISMATCH");
      return { businessId: String(row.business_id), customerId: row.customer_id === null ? null : String(row.customer_id), source,
        state: "fulfilled_paid", currency: String(row.currency), paymentMethodId: String(row.tender_method),
        paidMinor: Number(row.cash_received_minor), pointsTenderMinor: Number(row.points_tender_minor),
        subtotalMinor: moneyToMinor(Number(row.subtotal)), discountMinor: moneyToMinor(Number(row.discount_total)), accountingMinor: 0 };
    },
    readFullRefund: () => null
  };
}

/** No recalculation may alter the accepted order's gross, discount or total. */
export function assertOrderBenefitsQuote(detail: CommerceOrderDetail, quote: BenefitsQuote): void {
  benefitsAssert(quote.currency === detail.order.currency && quote.currencyExponent === 2 && quote.accountingMinor === 0
    && quote.subtotalMinor === moneyToMinor(detail.order.subtotal) && quote.discountMinor === moneyToMinor(detail.order.discountTotal)
    && quote.payableMinor + quote.pointsTenderMinor === moneyToMinor(detail.order.total), "BENEFITS_ORDER_SNAPSHOT_CONFLICT");
}

/** Protected key I/O and independently durable coupon attempt finish before the parent BEGIN. */
export function prepareOrderBenefitsIngress(database: DatabaseSync, input: CommerceOrderBenefitsPreviewInput, authority: OrderBenefitsAuthority, replay = false) {
  validateOrderBenefitsPreview(input);
  const intent = intentForOrder(database, input), bound = benefitsIntentForStorage(intent);
  const ports = orderBenefitsPorts(authority.actor, bound);
  ports.authorize(database, bound, "checkout");
  if (!replay) {
    benefitsAssert(orderForBenefits(database, input.orderId).order.status === "confirmed", "BENEFITS_ORDER_PAID_REQUIRED");
    const families = readBenefitsFamilies(database, intent.businessId);
    benefitsAssert(Object.values(families).some(Boolean), "BENEFITS_CAPABILITY_DISABLED");
    benefitsAssert(!intent.requestedPointsMinor || families.points, "BENEFITS_POINTS_UNAVAILABLE");
    benefitsAssert(!intent.couponCodes.length || families.coupon, "BENEFITS_COUPON_UNAVAILABLE");
  }
  const used = database.prepare("SELECT 1 FROM commerce_benefit_coupon_codes UNION ALL SELECT 1 FROM commerce_benefit_receipts LIMIT 1").get();
  const key = authority.keys.load(!used), store = new CommerceBenefitsStore(key, ports);
  return { intent, bound, key, store, authorizeCoupon(): string | null {
    if (!intent.couponCodes.length) return null;
    const attempt = store.authorizeCouponAttempt(database, intent, `desktop_owner:${authority.actor.id}`, Date.now());
    benefitsAssert(attempt.ok, attempt.ok ? "BENEFITS_COUPON_UNAVAILABLE" : attempt.code);
    return attempt.authorizationId;
  } };
}

export function orderBenefitsOperationKey(operationKey: string): string {
  return `order:${createHash("sha256").update(operationKey.trim()).digest("hex")}`;
}

export function previewCommerceOrderBenefits(path: string, input: CommerceOrderBenefitsPreviewInput, authority: OrderBenefitsAuthority): CommerceOrderBenefitsPreview {
  const database = new DatabaseSync(path);
  try {
    const ingress = prepareOrderBenefitsIngress(database, input, authority);
    const authorizationId = ingress.authorizeCoupon();
    return withCommerceBenefitsTransaction(database, Date.now(), tx => {
      const preview = ingress.store.preview(tx, ingress.intent, authorizationId);
      assertOrderBenefitsQuote(orderForBenefits(database, input.orderId), preview.quote);
      return { ...preview, availablePointsMinor: ingress.intent.customerId
        ? readCommercePointBalance(database, ingress.intent.businessId, ingress.intent.customerId, ingress.intent.currency, tx.now).availableMinor : 0 };
    });
  } finally { database.close(); }
}

export function replayOrderBenefits(database: DatabaseSync, businessId: string, orderId: string, authority: OrderBenefitsAuthority): BenefitsSettlementReceipt {
  const row = database.prepare(`SELECT r.intent_json,s.receipt_json FROM commerce_benefit_snapshots s
    JOIN commerce_benefit_reservations r ON r.business_id = s.business_id AND r.id = s.reservation_id
    WHERE s.business_id = ? AND s.source_kind = 'commerce_order' AND s.source_id = ?`).get(businessId, orderId);
  benefitsAssert(row, "BENEFITS_SETTLEMENT_SCOPE");
  const bound = JSON.parse(String(row.intent_json)) as BenefitsPricingRequest;
  orderBenefitsPorts(authority.actor, bound).authorize(database, bound, "checkout");
  return JSON.parse(String(row.receipt_json)) as BenefitsSettlementReceipt;
}
