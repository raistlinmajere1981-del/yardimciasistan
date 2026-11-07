import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, moneyToMinor, type BenefitsSettlementReceipt } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { applyInventoryMovementInTransaction } from "./commerce-store.js";
import { synchronizeFinanceSourceInTransaction } from "./finance.js";
import { canonicalBenefitsJson, withCommerceBenefitsTransaction } from "./commerce-benefits-rules.js";
import { CommerceBenefitsStore, type CommerceBenefitsParentPorts, type BenefitsPricingRequest, type BenefitsReversalReceipt } from "./commerce-benefits-store.js";
import type { MarketSaleBenefitsAuthority } from "./market-sale-benefits.js";
import { getCommerceOrder } from "./commerce-order-store.js";
import type { CommerceOrderDetail } from "@yardimci-asistan/shared";

/** Money, customer, lines, method and tenant are exclusively persisted authority. */
export interface FullRefundMarketSaleInput { saleId: string; operationId: string; kind: "full" }
export interface FullRefundMarketSaleReceipt {
  version: 1; refundId: string; saleId: string; businessId: string; customerId: string | null;
  cashMinor: number; pointsMinor: number; currency: string; paymentMethod: string;
  stockMovementIds: string[]; benefits: BenefitsReversalReceipt | null;
}
export interface FullRefundMarketSaleResult { receipt: FullRefundMarketSaleReceipt; replayed: boolean }
export interface FullRefundCommerceOrderInput { orderId: string; operationId: string; kind: "full"; reason: string }
export interface FullRefundCommerceOrderResult extends FullRefundMarketSaleResult { order: CommerceOrderDetail }
type WebOrderRefundScope = { orderId: string; reason: string };

const errors = {
  REFUND_INVALID_COMMAND: "Tam iade komutu geçersiz.",
  REFUND_SCOPE: "Yalnız bu işletmenin tamamlanmış masaüstü hızlı satışı iade edilebilir.",
  REFUND_ORDER_SCOPE: "Yalnız teslim edilmiş ve havalesi doğrulanmış web siparişi bu işlemle iade edilebilir.",
  REFUND_ALREADY_COMPLETED: "Bu satışın tam iadesi başka bir işlemle kaydedilmiş.",
  REFUND_INTENT_CHANGED: "İade işlem anahtarı farklı bir istekte kullanılamaz.",
  REFUND_EVIDENCE_CONFLICT: "Satış veya tahsilat kanıtı tutarsız. İade uygulanmadı.",
  REFUND_STOCK_UNSAFE: "Özgün stok hareketi, ürün veya depo güvenli iadeye uygun değil. İade uygulanmadı."
};
export class MarketSaleRefundError extends Error {
  constructor(readonly code: keyof typeof errors) { super(errors[code]); }
}
function requireRefund(value: unknown, code: keyof typeof errors): asserts value {
  if (!value) throw new MarketSaleRefundError(code);
}
type Row = Record<string, import("node:sqlite").SQLOutputValue>;
const source = "desktop-market-quick-sale";
const androidSource = "android-market-sale";
const orderSource = "commerce-order";
const safeMinor = (value: number) => Number.isSafeInteger(value) && value >= 0;
function quantity(value: unknown): number {
  const number = Number(value), units = Math.round(number * 10000);
  requireRefund(Number.isFinite(number) && Number.isSafeInteger(units) && Math.abs(number - units / 10000) < 1e-8, "REFUND_STOCK_UNSAFE");
  return units;
}
function commandJson(input: FullRefundMarketSaleInput): string {
  requireRefund(input && Object.keys(input).length === 3 && Object.keys(input).every(k => ["saleId", "operationId", "kind"].includes(k))
    && input.kind === "full" && typeof input.saleId === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(input.saleId)
    && typeof input.operationId === "string" && /^[a-zA-Z0-9_-]{8,96}$/.test(input.operationId), "REFUND_INVALID_COMMAND");
  return canonicalBenefitsJson(input);
}
function authorize(db: DatabaseSync, authority: MarketSaleBenefitsAuthority): string {
  authority.actor.assertAuthorized();
  requireRefund(authority.actor.role === "desktop_owner" && authority.actor.id.length > 0, "REFUND_SCOPE");
  const businessId = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get()?.id;
  requireRefund(typeof businessId === "string" && readEnabledBusinessCapabilities(db).includes(C.SALES), "REFUND_SCOPE");
  return businessId;
}
function paidSale(db: DatabaseSync, businessId: string, saleId: string, scope?: WebOrderRefundScope): Row {
  const sale = db.prepare("SELECT * FROM commerce_sales WHERE id = ? AND business_id = ?").get(saleId, businessId);
  if (scope) {
    const caps = readEnabledBusinessCapabilities(db);
    const order = db.prepare(`SELECT o.*, f.settlement_type, f.payment_method AS fulfillment_method FROM commerce_orders o
      JOIN commerce_order_fulfillments f ON f.order_id=o.id AND f.business_id=o.business_id
      WHERE o.id=? AND o.business_id=? AND f.sale_id=? AND o.deleted_at=''`).get(scope.orderId,businessId,saleId);
    const refunded = Boolean(db.prepare("SELECT 1 FROM commerce_sale_full_refunds WHERE sale_id=? AND business_id=?").get(saleId,businessId));
    requireRefund(caps.includes(C.ORDERS) && caps.includes(C.ONLINE_SALES) && sale?.source === orderSource && sale.status === "paid"
      && sale.deleted_at === "" && sale.closed_at && order && order.checkout_snapshot_json !== "null"
      && ["web-online-sales","web-dealer"].includes(String(order.source))
      && order.settlement_type === "paid" && order.fulfillment_method === "bank" && sale.payment_method === "bank"
      && (refunded ? order.status === "cancelled" && order.payment_status === "refunded" && order.delivery_status === "returned"
        : order.status === "fulfilled" && order.payment_status === "paid" && order.delivery_status === "delivered")
      && moneyToMinor(Number(order.total)) === moneyToMinor(Number(sale.total))
      && moneyToMinor(Number(order.delivery_fee)) === moneyToMinor(Number(sale.delivery_fee))
      && !db.prepare("SELECT 1 FROM customer_credit_entries WHERE sale_id=?").get(saleId), "REFUND_ORDER_SCOPE");
    return sale;
  }
  requireRefund(sale && sale.status === "paid" && (sale.source === source || sale.source === androidSource) && sale.deleted_at === "" && sale.closed_at
    && !db.prepare("SELECT 1 FROM commerce_order_fulfillments WHERE sale_id = ?").get(saleId)
    && !db.prepare("SELECT 1 FROM customer_credit_entries WHERE sale_id = ?").get(saleId), "REFUND_SCOPE");
  return sale;
}

/** Only the refund parent may authorize reversal. Checkout ports remain checkout-only. */
function refundPorts(authority: MarketSaleBenefitsAuthority, businessId: string, saleId: string, snapshotId: string,
  bound: BenefitsPricingRequest): CommerceBenefitsParentPorts {
  const assertScope = (db: DatabaseSync, request: BenefitsPricingRequest, operation: "checkout" | "refund") => {
    requireRefund(authorize(db, authority) === businessId && operation === "refund" && request.source.kind === "sale"
      && request.source.id === saleId && request.channel === "desktop_cart"
      && canonicalBenefitsJson(request) === canonicalBenefitsJson(bound), "REFUND_SCOPE");
    paidSale(db, businessId, saleId);
    requireRefund(db.prepare(`SELECT 1 FROM commerce_sale_full_refunds
      WHERE business_id = ? AND sale_id = ? AND snapshot_id = ? AND customer_id IS ?`)
      .get(businessId, saleId, snapshotId, request.customerId), "REFUND_EVIDENCE_CONFLICT");
  };
  return {
    authorize: assertScope,
    authorizePointAdjustment: () => { throw new MarketSaleRefundError("REFUND_SCOPE"); },
    resolvePricing: () => { throw new MarketSaleRefundError("REFUND_SCOPE"); },
    readSettlement: () => null,
    readFullRefund(db, requestedSource) {
      assertScope(db, bound, "refund");
      if (requestedSource.kind !== "sale" || requestedSource.id !== saleId) return null;
      const row = db.prepare("SELECT business_id,customer_id FROM commerce_sale_full_refunds WHERE business_id = ? AND sale_id = ? AND snapshot_id = ?")
        .get(businessId, saleId, snapshotId);
      return row ? { businessId: String(row.business_id), customerId: row.customer_id === null ? null : String(row.customer_id),
        source: requestedSource, fullRefundConfirmed: true } : null;
    }
  };
}

export interface FullRefundMarketSalePreview {
  businessId: string; actorId: string; saleId: string; eligible: boolean; refunded: boolean; reason: string;
  source: "desktop-market-quick-sale" | "android-market-sale" | "commerce-order" | null;
  cashMinor: number; pointsMinor: number; totalMinor: number; currency: string;
  customerName: string | null; lines: Array<{ name: string; quantity: number }>;
}

export interface MarketSaleHistoryCursor { openedAt: string; id: string }
export interface MarketSaleHistoryItem {
  saleId: string; date: string; totalMinor: number; cashMinor: number; pointsMinor: number;
  source: "desktop-market-quick-sale" | "android-market-sale";
  currency: string; paymentMethod: string; customerName: string | null; refunded: boolean;
}
export interface MarketSaleHistoryPage {
  businessId: string; actorId: string; items: MarketSaleHistoryItem[]; nextCursor: MarketSaleHistoryCursor | null;
}

/** Read-only, key-free history. Refund eligibility is always separately rechecked. */
export function listMarketSaleHistory(databasePath: string, input: { limit: number; cursor?: MarketSaleHistoryCursor },
  authority: MarketSaleBenefitsAuthority): MarketSaleHistoryPage {
  authority.actor.assertAuthorized();
  requireRefund(input && typeof input === "object" && Object.keys(input).every(k => ["limit", "cursor"].includes(k))
    && Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 50, "REFUND_INVALID_COMMAND");
  const cursor = input.cursor;
  requireRefund(cursor === undefined || cursor !== null && typeof cursor === "object" && Object.keys(cursor).length === 2
    && Object.keys(cursor).every(k => ["openedAt", "id"].includes(k))
    && typeof cursor.openedAt === "string" && cursor.openedAt.length > 0 && cursor.openedAt.length <= 64
    && typeof cursor.id === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(cursor.id), "REFUND_INVALID_COMMAND");
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only = ON; BEGIN");
    const businessId = authorize(db, authority);
    const rows = db.prepare(`SELECT s.id,s.opened_at,s.closed_at,s.total,s.currency,s.payment_method,s.source,
      t.cash_received_minor,t.points_tender_minor,c.full_name,
      EXISTS(SELECT 1 FROM commerce_sale_full_refunds f WHERE f.business_id = s.business_id AND f.sale_id = s.id) AS refunded
      FROM commerce_sales s
      LEFT JOIN commerce_sale_settlements t ON t.business_id = s.business_id AND t.sale_id = s.id
      LEFT JOIN customers c ON c.business_id = s.business_id AND c.id = CASE WHEN s.source = 'android-market-sale' THEN s.customer_id ELSE t.customer_id END AND c.deleted_at = ''
      WHERE s.business_id = ? AND s.status = 'paid' AND s.source IN (?, 'android-market-sale') AND s.deleted_at = '' AND s.closed_at != ''
      AND (s.source != 'android-market-sale' OR (t.sale_id IS NULL AND NOT EXISTS
        (SELECT 1 FROM commerce_benefit_snapshots b WHERE b.source_kind = 'sale' AND b.source_id = s.id)))
      AND NOT EXISTS(SELECT 1 FROM commerce_order_fulfillments o WHERE o.sale_id = s.id)
      AND NOT EXISTS(SELECT 1 FROM customer_credit_entries e WHERE e.sale_id = s.id)
      AND (? IS NULL OR s.opened_at < ? OR (s.opened_at = ? AND s.id < ?))
      ORDER BY s.opened_at DESC,s.id DESC LIMIT ?`).all(businessId, source, cursor?.openedAt ?? null,
        cursor?.openedAt ?? null, cursor?.openedAt ?? null, cursor?.id ?? null, input.limit + 1);
    const page = rows.slice(0, input.limit);
    const items = page.map(row => {
      const totalMinor = moneyToMinor(Number(row.total));
      const cashMinor = row.cash_received_minor == null ? totalMinor : Number(row.cash_received_minor);
      const pointsMinor = row.points_tender_minor == null ? 0 : Number(row.points_tender_minor);
      requireRefund(safeMinor(totalMinor) && safeMinor(cashMinor) && safeMinor(pointsMinor)
        && cashMinor + pointsMinor === totalMinor, "REFUND_EVIDENCE_CONFLICT");
      return { saleId: String(row.id), date: String(row.closed_at), totalMinor, cashMinor, pointsMinor,
        source: row.source as MarketSaleHistoryItem["source"],
        currency: String(row.currency), paymentMethod: String(row.payment_method), customerName: row.full_name == null ? null : String(row.full_name), refunded: Boolean(row.refunded) };
    });
    const last = page.at(-1);
    return { businessId, actorId: authority.actor.id, items,
      nextCursor: rows.length > input.limit && last ? { openedAt: String(last.opened_at), id: String(last.id) } : null };
  } finally { db.close(); }
}

/** Shared persisted evidence validation. This reader never loads the protected key. */
function readRefundEvidence(db: DatabaseSync, businessId: string, saleId: string, sale: Row) {
  const items = db.prepare("SELECT * FROM commerce_sale_items WHERE sale_id = ? ORDER BY id").all(saleId);
  requireRefund(items.length > 0, "REFUND_EVIDENCE_CONFLICT");
  let subtotal = 0;
  for (const item of items) {
    requireRefund(quantity(item.quantity) > 0 && Number(item.unit_price) >= 0
      && moneyToMinor(Number(item.line_total)) === moneyToMinor(Math.round((Number(item.unit_price) * Number(item.quantity) + Number.EPSILON) * 100) / 100), "REFUND_EVIDENCE_CONFLICT");
    subtotal += moneyToMinor(Number(item.line_total));
  }
  const totalMinor = moneyToMinor(Number(sale.total));
  const deliveryMinor = moneyToMinor(Number(sale.delivery_fee ?? 0));
  requireRefund(safeMinor(subtotal) && subtotal === moneyToMinor(Number(sale.subtotal))
    && safeMinor(totalMinor) && safeMinor(deliveryMinor) && (sale.source === orderSource || deliveryMinor === 0)
    && subtotal - moneyToMinor(Number(sale.discount_total)) + deliveryMinor === totalMinor, "REFUND_EVIDENCE_CONFLICT");
  const tender = db.prepare("SELECT * FROM commerce_sale_settlements WHERE sale_id = ?").get(saleId);
  if (sale.source === androidSource || sale.source === orderSource) requireRefund(!tender && !db.prepare(
    "SELECT 1 FROM commerce_benefit_snapshots WHERE source_id = ?").get(saleId), "REFUND_EVIDENCE_CONFLICT");
  const snapshot = db.prepare(`SELECT s.id,s.receipt_json,r.intent_json FROM commerce_benefit_snapshots s
    JOIN commerce_benefit_reservations r ON r.business_id = s.business_id AND r.id = s.reservation_id
    WHERE s.business_id = ? AND s.source_kind = 'sale' AND s.source_id = ?`).get(businessId, saleId);
  requireRefund(Boolean(tender) === Boolean(snapshot), "REFUND_EVIDENCE_CONFLICT");
  const cashMinor = tender ? Number(tender.cash_received_minor) : totalMinor;
  const pointsMinor = tender ? Number(tender.points_tender_minor) : 0;
  const orderCustomer = sale.source === orderSource ? db.prepare(`SELECT o.customer_id FROM commerce_orders o JOIN commerce_order_fulfillments f
    ON f.order_id=o.id AND f.business_id=o.business_id WHERE f.sale_id=? AND o.business_id=?`).get(saleId,businessId)?.customer_id : null;
  const customerId = tender?.customer_id == null ? (orderCustomer != null ? String(orderCustomer)
    : sale.source === androidSource && sale.customer_id != null ? String(sale.customer_id) : null) : String(tender.customer_id);
  const method = sale.payment_method === "transfer" ? "bank" : String(sale.payment_method);
  requireRefund(safeMinor(cashMinor) && safeMinor(pointsMinor) && cashMinor + pointsMinor === totalMinor
    && ["cash", "card", "bank", "other"].includes(method)
    && (!tender || (tender.business_id === businessId && tender.payment_method === sale.payment_method)), "REFUND_EVIDENCE_CONFLICT");
  let bound: BenefitsPricingRequest | undefined;
  if (snapshot) {
    bound = JSON.parse(String(snapshot.intent_json)) as BenefitsPricingRequest;
    const original = JSON.parse(String(snapshot.receipt_json)) as BenefitsSettlementReceipt;
    requireRefund(bound.businessId === businessId && bound.customerId === customerId && bound.currency === sale.currency
      && bound.source.kind === "sale" && bound.source.id === saleId && bound.channel === "desktop_cart"
      && original.snapshotId === snapshot.id && original.source.kind === "sale" && original.source.id === saleId
      && original.quote.payableMinor === cashMinor && original.quote.pointsTenderMinor === pointsMinor
      && original.quote.subtotalMinor === subtotal && original.quote.discountMinor === moneyToMinor(Number(sale.discount_total))
      && original.quote.currency === sale.currency && original.quote.accountingMinor === 0, "REFUND_EVIDENCE_CONFLICT");
    const storedLines = bound.lines.map(line => `${line.productId}:${line.quantityTenThousandths}`).sort();
    requireRefund(canonicalBenefitsJson(storedLines) === canonicalBenefitsJson(items.map(item => `${item.product_id}:${quantity(item.quantity)}`).sort()), "REFUND_EVIDENCE_CONFLICT");
  }
  const income = db.prepare("SELECT * FROM finance_entries WHERE source_type = 'commerce_sale' AND source_id = ?").get(saleId);
  requireRefund(cashMinor === 0 ? !income : income && income.direction === "income" && income.deleted_at === ""
    && income.amount_minor === cashMinor && income.currency === sale.currency
    && income.payment_method === (["cash", "card", "bank"].includes(String(sale.payment_method)) ? sale.payment_method : "other"), "REFUND_EVIDENCE_CONFLICT");

  const movements = db.prepare("SELECT * FROM inventory_movements WHERE reference_type = 'commerce_sale' AND reference_id = ? ORDER BY id").all(saleId);
  const products = new Set(movements.map(m => String(m.product_id)));
  for (const productId of products) {
    const original = movements.filter(m => m.product_id === productId);
    requireRefund(canonicalBenefitsJson(original.map(m => -quantity(m.quantity_delta)).sort((a,b) => a-b))
      === canonicalBenefitsJson(items.filter(i => i.product_id === productId).map(i => quantity(i.quantity)).sort((a,b) => a-b)), "REFUND_STOCK_UNSAFE");
  }
  requireRefund(new Set(movements.map(m => m.location_id)).size <= 1, "REFUND_STOCK_UNSAFE");
  for (const movement of movements) {
    requireRefund(movement.business_id === businessId && movement.movement_type === "sale" && movement.actor_source === sale.source
      && quantity(movement.quantity_delta) < 0 && quantity(movement.quantity_after) >= 0 && safeMinor(moneyToMinor(Number(movement.unit_cost)))
      && db.prepare("SELECT 1 FROM catalog_products WHERE id = ? AND business_id = ? AND deleted_at = '' AND track_inventory = 1").get(String(movement.product_id), businessId)
      && db.prepare("SELECT 1 FROM inventory_locations WHERE id = ? AND business_id = ? AND deleted_at = '' AND is_active = 1").get(String(movement.location_id), businessId), "REFUND_STOCK_UNSAFE");
    const current = db.prepare("SELECT quantity FROM inventory_balances WHERE product_id = ? AND location_id = ?").get(String(movement.product_id), String(movement.location_id));
    requireRefund(current && quantity(current.quantity) >= 0, "REFUND_STOCK_UNSAFE");
  }
  return { items, totalMinor, snapshot, cashMinor, pointsMinor, customerId, method, bound, movements };
}

/** Consistent read-only snapshot; eligibility is advisory and rechecked by the writer. */
export function getFullRefundMarketSalePreview(databasePath: string, saleId: string,
  authority: MarketSaleBenefitsAuthority): FullRefundMarketSalePreview {
  return getFullRefundSalePreview(databasePath,saleId,authority);
}

function getFullRefundSalePreview(databasePath: string, saleId: string,
  authority: MarketSaleBenefitsAuthority, scope?: WebOrderRefundScope): FullRefundMarketSalePreview {
  authority.actor.assertAuthorized();
  requireRefund(typeof saleId === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(saleId), "REFUND_INVALID_COMMAND");
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only = ON; BEGIN");
    const businessId = authorize(db, authority);
    const base: FullRefundMarketSalePreview = { businessId, actorId: authority.actor.id, saleId, eligible: false,
      refunded: false, reason: "", source: null, cashMinor: 0, pointsMinor: 0, totalMinor: 0, currency: "TRY", customerName: null, lines: [] };
    try {
      const sale = paidSale(db, businessId, saleId, scope);
      base.source = sale.source as FullRefundMarketSalePreview["source"];
      const previous = db.prepare("SELECT * FROM commerce_sale_full_refunds WHERE business_id = ? AND sale_id = ?").get(businessId, saleId);
      if (previous) {
        const customer = previous.customer_id ? db.prepare("SELECT full_name FROM customers WHERE id = ? AND business_id = ? AND deleted_at = ''")
          .get(String(previous.customer_id), businessId) : null;
        const items = JSON.parse(String(previous.items_json)) as Row[];
        return { ...base, refunded: true, reason: "Bu satışın tam iadesi kaydedilmiş.",
          cashMinor: Number(previous.cash_minor), pointsMinor: Number(previous.points_minor),
          totalMinor: Number(previous.cash_minor) + Number(previous.points_minor), currency: String(previous.currency),
          customerName: customer ? String(customer.full_name) : null,
          lines: items.map(item => ({ name: String(item.product_name), quantity: Number(item.quantity) })) };
      }
      const evidence = readRefundEvidence(db, businessId, saleId, sale);
      const customer = evidence.customerId ? db.prepare("SELECT full_name FROM customers WHERE id = ? AND business_id = ? AND deleted_at = ''").get(evidence.customerId, businessId) : null;
      return { ...base, eligible: true, cashMinor: evidence.cashMinor, pointsMinor: evidence.pointsMinor,
        totalMinor: evidence.totalMinor, currency: String(sale.currency), customerName: customer ? String(customer.full_name) : null,
        lines: evidence.items.map(item => ({ name: String(item.product_name), quantity: Number(item.quantity) })) };
    } catch (error) {
      if (error instanceof MarketSaleRefundError) return { ...base, reason: error.message };
      throw error;
    }
  } finally { db.close(); }
}

/** A single synchronous BEGIN IMMEDIATE owns evidence, Finance, stock, benefits and receipt.
 * No renderer/channel can call a generic reverse or supply refund pricing.
 */
export function fullRefundMarketSale(databasePath: string, input: FullRefundMarketSaleInput,
  authority: MarketSaleBenefitsAuthority): FullRefundMarketSaleResult {
  return fullRefundPaidSale(databasePath,input,authority);
}

function fullRefundPaidSale(databasePath: string, input: FullRefundMarketSaleInput,
  authority: MarketSaleBenefitsAuthority, scope?: WebOrderRefundScope): FullRefundMarketSaleResult {
  authority.actor.assertAuthorized(); // Before database or protected-key access.
  const originalCommand=commandJson(input);
  const command=scope ? canonicalBenefitsJson({...input,orderId:scope.orderId,reason:scope.reason}) : originalCommand;
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    const businessId = authorize(db, authority);
    const initialSale = paidSale(db, businessId, input.saleId, scope);
    // Secure storage I/O is outside the transaction. Legacy refunds never need a key.
    const prior = db.prepare("SELECT id FROM commerce_sale_full_refunds WHERE business_id = ? AND operation_id = ?").get(businessId, input.operationId);
    const initialSnapshot = db.prepare("SELECT id FROM commerce_benefit_snapshots WHERE business_id = ? AND source_kind = 'sale' AND source_id = ?")
      .get(businessId, input.saleId);
    if (initialSale.source === androidSource || initialSale.source === orderSource) requireRefund(!initialSnapshot, "REFUND_EVIDENCE_CONFLICT");
    const alreadyRefunded = db.prepare("SELECT 1 FROM commerce_sale_full_refunds WHERE sale_id = ?").get(input.saleId);
    const key = !prior && !alreadyRefunded && initialSnapshot ? authority.keys.load() : undefined;
    return withCommerceBenefitsTransaction(db, Date.now(), tx => {
      requireRefund(authorize(db, authority) === businessId, "REFUND_SCOPE");
      const sale = paidSale(db, businessId, input.saleId, scope);
      const previous = db.prepare(`SELECT f.command_json,r.receipt_json FROM commerce_sale_full_refunds f
        JOIN commerce_sale_full_refund_receipts r ON r.refund_id = f.id WHERE f.business_id = ? AND f.operation_id = ?`)
        .get(businessId, input.operationId);
      if (previous) {
        requireRefund(previous.command_json === command, "REFUND_INTENT_CHANGED");
        return { receipt: JSON.parse(String(previous.receipt_json)) as FullRefundMarketSaleReceipt, replayed: true };
      }
      requireRefund(!db.prepare("SELECT 1 FROM commerce_sale_full_refunds WHERE sale_id = ?").get(input.saleId), "REFUND_ALREADY_COMPLETED");
      const { items, snapshot, cashMinor, pointsMinor, customerId, method, bound, movements } = readRefundEvidence(db, businessId, input.saleId, sale);
      if (snapshot) requireRefund(key && initialSnapshot?.id === snapshot.id, "REFUND_EVIDENCE_CONFLICT");
      const refundId = `sale_refund_${randomUUID()}`, now = new Date(tx.now).toISOString();
      db.prepare(`INSERT INTO commerce_sale_full_refunds
        (id,business_id,sale_id,customer_id,snapshot_id,operation_id,command_json,actor_id,source,currency,
        cash_minor,points_minor,payment_method,items_json,stock_movements_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(refundId, businessId, input.saleId, customerId, snapshot ? String(snapshot.id) : null, input.operationId, command,
          authority.actor.id, String(sale.source), String(sale.currency), cashMinor, pointsMinor, method, JSON.stringify(items), JSON.stringify(movements), now);
      synchronizeFinanceSourceInTransaction(db, "commerce_sale_refund", refundId);
      const stockMovementIds = movements.map(movement => applyInventoryMovementInTransaction(db, businessId, {
        productId: String(movement.product_id), locationId: String(movement.location_id), type: "return_in",
        quantityDelta: -Number(movement.quantity_delta), unitCost: Number(movement.unit_cost),
        referenceType: "commerce_sale_refund", referenceId: refundId, actorSource: String(sale.source)
      }, now).id);
      const benefits = snapshot && bound && key ? new CommerceBenefitsStore(key,
        refundPorts(authority, businessId, input.saleId, String(snapshot.id), bound))
        .reverse(tx, businessId, String(snapshot.id), `refund:${input.operationId}`) : null;
      const receipt: FullRefundMarketSaleReceipt = { version: 1, refundId, saleId: input.saleId, businessId, customerId,
        cashMinor, pointsMinor, currency: String(sale.currency), paymentMethod: method, stockMovementIds, benefits };
      db.prepare("INSERT INTO commerce_sale_full_refund_receipts VALUES (?,?)").run(refundId, canonicalBenefitsJson(receipt));
      if(scope) {
        db.prepare("UPDATE commerce_orders SET status='cancelled',payment_status='refunded',delivery_status='returned',cancelled_at=?,updated_at=? WHERE id=? AND business_id=?")
          .run(now,now,scope.orderId,businessId);
        db.prepare("INSERT INTO commerce_order_events(id,business_id,order_id,type,actor_id,reason,request_json,created_at) VALUES (?,?,?,'order_refunded',?,?,?,?)")
          .run(`order-refund:${refundId}`,businessId,scope.orderId,authority.actor.id,scope.reason,command,now);
      }
      return { receipt, replayed: false };
    });
  } finally { db.close(); }
}


/** Resolve only the canonical fulfilled web order; callers cannot choose money or sale identity. */
function webOrderSaleId(databasePath: string,orderId: string,authority: MarketSaleBenefitsAuthority): string {
  authority.actor.assertAuthorized();
  requireRefund(typeof orderId==="string" && /^[a-zA-Z0-9_-]{1,160}$/.test(orderId),"REFUND_INVALID_COMMAND");
  const db=new DatabaseSync(databasePath,{readOnly:true});
  try {
    const businessId=authorize(db,authority);
    const row=db.prepare("SELECT sale_id FROM commerce_order_fulfillments WHERE order_id=? AND business_id=?").get(orderId,businessId);
    requireRefund(row,"REFUND_ORDER_SCOPE");
    paidSale(db,businessId,String(row.sale_id),{orderId,reason:""});
    return String(row.sale_id);
  }finally{db.close();}
}

export function getFullRefundCommerceOrderPreview(databasePath: string,orderId: string,authority: MarketSaleBenefitsAuthority): FullRefundMarketSalePreview & {orderId: string} {
  const saleId=webOrderSaleId(databasePath,orderId,authority);
  return {...getFullRefundSalePreview(databasePath,saleId,authority,{orderId,reason:""}),orderId};
}

export function fullRefundCommerceOrder(databasePath: string,input: FullRefundCommerceOrderInput,authority: MarketSaleBenefitsAuthority): FullRefundCommerceOrderResult {
  authority.actor.assertAuthorized();
  requireRefund(input && Object.keys(input).length===4 && Object.keys(input).every(key=>["orderId","operationId","kind","reason"].includes(key))
    && typeof input.reason==="string" && input.reason.trim().length>0 && input.reason.length<=500 && !/[\u0000-\u001f\u007f]/.test(input.reason),"REFUND_INVALID_COMMAND");
  const saleId=webOrderSaleId(databasePath,input.orderId,authority);
  const result=fullRefundPaidSale(databasePath,{saleId,operationId:input.operationId,kind:input.kind},authority,{orderId:input.orderId,reason:input.reason.trim()});
  const order=getCommerceOrder(databasePath,input.orderId);
  requireRefund(order,"REFUND_ORDER_SCOPE");
  return {...result,order};
}
