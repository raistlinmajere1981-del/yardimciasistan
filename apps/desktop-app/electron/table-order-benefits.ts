import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, type BenefitsCheckoutIntent, type TableOrderBenefitsPreviewInput,
  type TableOrderBenefitsCloseInput, type TableOrderBenefitsPreview, type TableOrderBenefitsState,
  type TableOrderBenefitsPaidReceipt, type BenefitsSettlementReceipt } from "@yardimci-asistan/shared";
import { benefitsAssert } from "./commerce-benefits-engine";
import { benefitsHmac, benefitsIntentForStorage, canonicalBenefitsJson, readBenefitsFamilies,
  requireCommerceBenefitsCapability, withCommerceBenefitsTransaction } from "./commerce-benefits-rules";
import { CommerceBenefitsStore, type BenefitsPricingRequest, type CommerceBenefitsParentPorts } from "./commerce-benefits-store";
import { readCommercePointBalance } from "./commerce-benefits-points";
import type { BenefitsManagementActor, BenefitsManagementKeys } from "./commerce-benefits-management";
import { assertPaidTableOrderTender, readTableOrderTender, readTableSettlementSnapshot } from "./database/table-order-settlement-store";
import { closeTableOrderInTransaction } from "./table-order-service";

export interface TableBenefitsAuthority { actor: BenefitsManagementActor; keys: BenefitsManagementKeys }
const methods = ["cash", "card", "bank", "other"];
const activeStatuses = ["open", "preparing", "served", "payment"];
const off = (): TableOrderBenefitsState => ({ enabled: false, families: { coupon: false, points: false, payment_modifier: false } });
function requireTableBenefits(db: DatabaseSync, businessId: string) {
  requireCommerceBenefitsCapability(db, businessId);
  benefitsAssert(db.prepare("SELECT 1 FROM business_capabilities WHERE business_id = ? AND capability_id = ? AND is_enabled = 1")
    .get(businessId, C.FOOD_ORDERS), "BENEFITS_CAPABILITY_DISABLED");
}
function authorizeOwner(db: DatabaseSync, authority: TableBenefitsAuthority, businessId: string) {
  authority.actor.assertAuthorized();
  benefitsAssert(authority.actor.role === "desktop_owner" && authority.actor.id.length > 0, "BENEFITS_STAFF_REQUIRED");
  benefitsAssert(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at,id LIMIT 1").get()?.id === businessId, "BENEFITS_TENANT_REQUIRED");
  requireTableBenefits(db, businessId);
}
export function getTableOrderBenefitsState(db: DatabaseSync): TableOrderBenefitsState {
  const id = String(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at,id LIMIT 1").get()?.id ?? "");
  const enabled = new Set(db.prepare("SELECT capability_id FROM business_capabilities WHERE business_id = ? AND is_enabled = 1").all(id).map(row => row.capability_id));
  if (![C.COMMERCE_BENEFITS, C.FOOD_ORDERS, C.CUSTOMERS, C.CATALOG].every(c => enabled.has(c)) || !(enabled.has(C.SALES) || enabled.has(C.ORDERS))) return off();
  return { enabled: true, families: readBenefitsFamilies(db, id) };
}
export function validateTableBenefitsPreview(input: TableOrderBenefitsPreviewInput): void {
  benefitsAssert(input && Object.keys(input).every(key => ["orderId", "operationKey", "paymentMethod", "requestedPointsMinor", "couponCode"].includes(key))
    && typeof input.orderId === "string" && input.orderId.length > 0 && input.orderId.length <= 128
    && typeof input.operationKey === "string" && input.operationKey.trim() === input.operationKey && input.operationKey.length > 0 && input.operationKey.length <= 180
    && methods.includes(input.paymentMethod) && Number.isSafeInteger(input.requestedPointsMinor) && input.requestedPointsMinor >= 0
    && (input.couponCode === undefined || typeof input.couponCode === "string" && input.couponCode.length <= 128), "BENEFITS_INVALID_INTENT");
}
function previewInput(input: TableOrderBenefitsCloseInput): TableOrderBenefitsPreviewInput {
  const b = input?.benefits;
  benefitsAssert(b && Object.keys(input).every(key => ["orderId", "status", "operationKey", "paymentMethod", "benefits"].includes(key)) && input.status === "paid"
    && Object.keys(b).every(key => ["requestedPointsMinor", "paymentAmountMinor", "expectedQuote", "previewToken", "couponCode"].includes(key))
    && b.expectedQuote && typeof b.previewToken === "string" && /^[a-f0-9]{64}$/.test(b.previewToken) && Number.isSafeInteger(b.paymentAmountMinor) && b.paymentAmountMinor >= 0, "BENEFITS_TABLE_PAID_REQUIRED");
  canonicalBenefitsJson(b.expectedQuote);
  const result = { orderId: input.orderId, operationKey: input.operationKey, paymentMethod: input.paymentMethod,
    requestedPointsMinor: b.requestedPointsMinor, ...(b.couponCode === undefined ? {} : { couponCode: b.couponCode }) };
  validateTableBenefitsPreview(result);
  return result;
}
function tableIntent(db: DatabaseSync, input: TableOrderBenefitsPreviewInput): BenefitsCheckoutIntent {
  const s = readTableSettlementSnapshot(db, input.orderId);
  const tender = readTableOrderTender(db, input.orderId);
  return { businessId: s.businessId, customerId: tender ? tender.customer_id === null ? null : String(tender.customer_id) : s.customerId,
    source: { kind: "table_order", id: input.orderId }, channel: "desktop_desk", currency: s.currency,
    lines: s.active.map(item => ({ productId: item.productId, quantityTenThousandths: item.quantityTenThousandths })),
    paymentMethodId: input.paymentMethod, requestedPointsMinor: input.requestedPointsMinor, couponCodes: input.couponCode ? [input.couponCode] : [] };
}

/** Stored menu/order prices are authoritative; table service uses retail, never dealer resolution. */
export function tableOrderBenefitsPorts(authority: TableBenefitsAuthority, bound: BenefitsPricingRequest): CommerceBenefitsParentPorts {
  const authorize = (db: DatabaseSync, request: BenefitsPricingRequest, operation: "checkout" | "refund") => {
    authorizeOwner(db, authority, request.businessId);
    benefitsAssert(operation === "checkout" && request.source.kind === "table_order" && request.channel === "desktop_desk"
      && canonicalBenefitsJson(request) === canonicalBenefitsJson(bound), "BENEFITS_CONTEXT_SCOPE");
    const s = readTableSettlementSnapshot(db, request.source.id), tender = readTableOrderTender(db, request.source.id);
    const customer = tender ? tender.customer_id === null ? null : String(tender.customer_id) : s.customerId;
    benefitsAssert((activeStatuses.includes(s.status) || s.status === "paid" && tender) && s.businessId === request.businessId
      && customer === request.customerId && s.currency === request.currency
      && canonicalBenefitsJson(s.active.map(item => ({ productId: item.productId, quantityTenThousandths: item.quantityTenThousandths }))) === canonicalBenefitsJson(request.lines), "BENEFITS_CONTEXT_SCOPE");
    if (customer) benefitsAssert(db.prepare("SELECT 1 FROM customers WHERE id = ? AND business_id = ? AND deleted_at = ''").get(customer, s.businessId), "BENEFITS_CUSTOMER_SCOPE");
  };
  return { authorize, authorizePointAdjustment() { benefitsAssert(false, "BENEFITS_STAFF_REQUIRED"); },
    resolvePricing(db, request, now) {
      authorize(db, request, "checkout");
      benefitsAssert(methods.includes(request.paymentMethodId ?? ""), "BENEFITS_PAYMENT_CONFIRMATION_REQUIRED");
      const s = readTableSettlementSnapshot(db, request.source.id);
      return { businessId: s.businessId, customerId: request.customerId, customerGroups: [], priceGroup: "retail", channel: "desktop_desk",
        currency: s.currency, currencyExponent: 2, now, families: off().families, availablePointsMinor: 0,
        requestedPointsMinor: request.requestedPointsMinor, payment: { methodId: request.paymentMethodId!, confirmed: true },
        lines: s.active.map(item => ({ id: item.id, productId: item.productId, quantityTenThousandths: item.quantityTenThousandths,
          unitPriceMinor: item.unitPriceMinor, categoryId: String(db.prepare("SELECT category_id FROM catalog_products WHERE id = ? AND business_id = ?")
            .get(item.productId, s.businessId)?.category_id ?? "") })),
        accounting: { taxTreatment: "included_in_items", taxMinor: 0, financeMinor: 0, earnOnAccountingAdjustments: false } };
    },
    readSettlement(db, source) {
      benefitsAssert(source.kind === "table_order" && source.id === bound.source.id, "BENEFITS_CONTEXT_SCOPE");
      authorize(db, bound, "checkout");
      const tender = assertPaidTableOrderTender(db, source.id);
      const finance = db.prepare("SELECT amount_minor,payment_method,currency FROM finance_entries WHERE source_type = 'restaurant_order' AND source_id = ? AND deleted_at = ''").all(source.id);
      benefitsAssert(Number(tender.cash_received_minor) === 0 ? finance.length === 0 : finance.length === 1
        && finance[0]!.amount_minor === tender.cash_received_minor && finance[0]!.payment_method === tender.payment_method && finance[0]!.currency === tender.currency, "BENEFITS_SETTLEMENT_MISMATCH");
      return { businessId: String(tender.business_id), customerId: tender.customer_id === null ? null : String(tender.customer_id), source,
        state: "paid", currency: String(tender.currency), paymentMethodId: String(tender.payment_method), paidMinor: Number(tender.cash_received_minor),
        pointsTenderMinor: Number(tender.points_tender_minor), subtotalMinor: Number(tender.subtotal_minor), discountMinor: Number(tender.discount_minor), accountingMinor: 0 };
    },
    // A paid close is not refund evidence. No table reversal authority in this slice.
    readFullRefund: () => null };
}

function ingress(db: DatabaseSync, input: TableOrderBenefitsPreviewInput, authority: TableBenefitsAuthority, replay: boolean) {
  benefitsAssert(!db.isTransaction, "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  authority.actor.assertAuthorized();
  const intent = tableIntent(db, input), bound = benefitsIntentForStorage(intent), ports = tableOrderBenefitsPorts(authority, bound);
  ports.authorize(db, bound, "checkout");
  if (!replay) {
    const s = readTableSettlementSnapshot(db, input.orderId);
    benefitsAssert(activeStatuses.includes(s.status) && !readTableOrderTender(db, input.orderId), "BENEFITS_TABLE_PAID_REQUIRED");
    benefitsAssert(s.discountMinor === 0, "BENEFITS_TABLE_MANUAL_DISCOUNT_UNSUPPORTED");
    const families = readBenefitsFamilies(db, intent.businessId);
    benefitsAssert(Object.values(families).some(Boolean), "BENEFITS_CAPABILITY_DISABLED");
    benefitsAssert(!intent.requestedPointsMinor || families.points, "BENEFITS_POINTS_UNAVAILABLE");
    benefitsAssert(!intent.couponCodes.length || families.coupon, "BENEFITS_COUPON_UNAVAILABLE");
  }
  const used = db.prepare("SELECT 1 FROM commerce_benefit_coupon_codes UNION ALL SELECT 1 FROM commerce_benefit_receipts LIMIT 1").get();
  const key = authority.keys.load(!used), store = new CommerceBenefitsStore(key, ports);
  return { intent, bound, ports, key, store };
}
function authorizeCoupon(db: DatabaseSync, prepared: ReturnType<typeof ingress>, authority: TableBenefitsAuthority) {
  if (!prepared.intent.couponCodes.length) return null;
  const result = prepared.store.authorizeCouponAttempt(db, prepared.intent, `desktop_owner:${authority.actor.id}`, Date.now());
  benefitsAssert(result.ok, result.ok ? "BENEFITS_COUPON_UNAVAILABLE" : result.code);
  return result.authorizationId;
}
function tablePreviewToken(db: DatabaseSync, prepared: ReturnType<typeof ingress>, input: TableOrderBenefitsPreviewInput, now: number) {
  const { now: _now, ...pricing } = prepared.ports.resolvePricing(db, prepared.bound, now);
  return benefitsHmac(prepared.key, prepared.intent.businessId, "desktop-table-preview", {
    input, snapshot: readTableSettlementSnapshot(db, input.orderId), pricing
  });
}
export function previewTableOrderBenefits(db: DatabaseSync, input: TableOrderBenefitsPreviewInput, authority: TableBenefitsAuthority): TableOrderBenefitsPreview {
  validateTableBenefitsPreview(input);
  const prepared = ingress(db, input, authority, false), authorizationId = authorizeCoupon(db, prepared, authority);
  return withCommerceBenefitsTransaction(db, Date.now(), tx => {
    const s = readTableSettlementSnapshot(db, input.orderId);
    benefitsAssert(activeStatuses.includes(s.status) && s.discountMinor === 0, "BENEFITS_TABLE_MANUAL_DISCOUNT_UNSUPPORTED");
    const preview = prepared.store.preview(tx, prepared.intent, authorizationId);
    benefitsAssert(preview.quote.subtotalMinor === s.subtotalMinor && preview.quote.payableMinor + preview.quote.pointsTenderMinor > 0, "BENEFITS_TABLE_SNAPSHOT_CONFLICT");
    return { ...preview, previewToken: tablePreviewToken(db, prepared, input, tx.now), families: readBenefitsFamilies(db, s.businessId), availablePointsMinor: prepared.intent.customerId
      ? readCommercePointBalance(db, s.businessId, prepared.intent.customerId, s.currency, tx.now).availableMinor : 0 };
  });
}

/** Key I/O and durable coupon attempts precede the ONE outer transaction. No stock movement here. */
export function settleTableOrderBenefits(db: DatabaseSync, input: TableOrderBenefitsCloseInput, authority: TableBenefitsAuthority): TableOrderBenefitsPaidReceipt {
  const preview = previewInput(input);
  const existing = () => db.prepare("SELECT * FROM table_order_settlements WHERE order_id = ? OR operation_key = ?").get(input.orderId, input.operationKey);
  let prepared: ReturnType<typeof ingress>, authorizationId: string | null = null;
  try {
    prepared = ingress(db, preview, authority, Boolean(existing()));
    if (!existing()) authorizationId = authorizeCoupon(db, prepared, authority);
  } catch (error) {
    // A second writer may have committed during pre-transaction key/attempt work.
    if (!existing()) throw error;
    prepared = ingress(db, preview, authority, true);
  }
  const fingerprint = benefitsHmac(prepared.key, prepared.intent.businessId, "desktop-table-paid-command", input);
  return withCommerceBenefitsTransaction(db, Date.now(), tx => {
    prepared.ports.authorize(db, prepared.bound, "checkout");
    const previous = existing();
    if (previous) {
      benefitsAssert(previous.order_id === input.orderId && previous.operation_key === input.operationKey && previous.request_hmac === fingerprint,
        "BENEFITS_IDEMPOTENCY_INTENT_CHANGED");
      assertPaidTableOrderTender(db, input.orderId);
      const stored = db.prepare("SELECT receipt_json FROM commerce_benefit_snapshots WHERE business_id = ? AND source_kind = 'table_order' AND source_id = ?")
        .get(prepared.intent.businessId, input.orderId);
      benefitsAssert(stored, "BENEFITS_SETTLEMENT_MISMATCH");
      return { orderId: input.orderId, benefits: JSON.parse(String(stored.receipt_json)) as BenefitsSettlementReceipt };
    }
    const before = readTableSettlementSnapshot(db, input.orderId);
    benefitsAssert(activeStatuses.includes(before.status) && before.discountMinor === 0, "BENEFITS_TABLE_MANUAL_DISCOUNT_UNSUPPORTED");
    benefitsAssert(tablePreviewToken(db, prepared, preview, tx.now) === input.benefits.previewToken, "BENEFITS_QUOTE_CHANGED");
    const key = `table:${createHash("sha256").update(input.operationKey).digest("hex")}`;
    const reserved = prepared.store.reserve(tx, prepared.intent, `${key}:reserve`, authorizationId), q = reserved.quote;
    benefitsAssert(canonicalBenefitsJson(q) === canonicalBenefitsJson(input.benefits.expectedQuote), "BENEFITS_QUOTE_CHANGED");
    benefitsAssert(q.subtotalMinor === before.subtotalMinor && q.currency === before.currency && q.currencyExponent === 2 && q.accountingMinor === 0
      && q.payableMinor + q.pointsTenderMinor === before.subtotalMinor - q.discountMinor && q.payableMinor + q.pointsTenderMinor > 0, "BENEFITS_TABLE_SNAPSHOT_CONFLICT");
    benefitsAssert(input.benefits.paymentAmountMinor === q.payableMinor, "BENEFITS_ACTUAL_PAYMENT_REQUIRED");
    const now = new Date(tx.now).toISOString();
    db.prepare("UPDATE table_orders SET discount_total = ?, total = ?, updated_at = ? WHERE id = ?")
      .run(q.discountMinor / 100, (q.payableMinor + q.pointsTenderMinor) / 100, now, input.orderId);
    const after = readTableSettlementSnapshot(db, input.orderId);
    benefitsAssert(after.customerId === prepared.intent.customerId && after.discountMinor === q.discountMinor
      && canonicalBenefitsJson(after.items) === canonicalBenefitsJson(before.items), "BENEFITS_SETTLEMENT_MISMATCH");
    db.prepare(`INSERT INTO table_order_settlements (order_id,business_id,table_id,customer_id,source_kind,channel,operation_key,request_hmac,
      payment_method,currency,subtotal_minor,discount_minor,order_total_minor,cash_received_minor,points_tender_minor,items_json,created_at)
      VALUES (?,?,?,?,'table_order','desktop_desk',?,?,?,?,?,?,?,?,?,?,?)`).run(input.orderId, before.businessId, before.tableId,
      before.customerId, input.operationKey, fingerprint, input.paymentMethod, before.currency, q.subtotalMinor, q.discountMinor,
      q.payableMinor + q.pointsTenderMinor, q.payableMinor, q.pointsTenderMinor, canonicalBenefitsJson(before.items), now);
    const closed = closeTableOrderInTransaction(db, { orderId: input.orderId, status: "paid" }, { now });
    benefitsAssert(closed.ok, "BENEFITS_TABLE_PAID_REQUIRED");
    const receipt = prepared.store.settle(tx, before.businessId, reserved.reservationId, `${key}:settle`);
    // Validate again after point/snapshot writers (including triggers) before commit.
    prepared.ports.readSettlement(db, prepared.bound.source);
    return { orderId: input.orderId, benefits: receipt };
  });
}
