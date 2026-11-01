import type { DatabaseSync } from "node:sqlite";
import { moneyToMinor } from "@yardimci-asistan/shared";
import { benefitsAssert } from "../commerce-benefits-engine";
import { canonicalBenefitsJson } from "../commerce-benefits-rules";

function tableMoneyMinor(value: unknown): number {
  const amount = Number(value), minor = moneyToMinor(amount);
  benefitsAssert(amount === minor / 100, "BENEFITS_TABLE_SNAPSHOT_CONFLICT");
  return minor;
}

/** Integer snapshot of every line, including cancelled lines. No customer/price from IPC. */
export function readTableSettlementSnapshot(db: DatabaseSync, orderId: string) {
  const order = db.prepare(`SELECT o.*, t.current_customer_id, t.is_active, t.deleted_at AS table_deleted
    FROM table_orders o JOIN tables t ON t.id = o.table_id WHERE o.id = ?`).get(orderId);
  benefitsAssert(order && order.is_active === 1 && order.table_deleted === "", "BENEFITS_CONTEXT_SCOPE");
  const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at,id LIMIT 1").get()?.id ?? "");
  benefitsAssert(businessId, "BENEFITS_TENANT_REQUIRED");
  const items = db.prepare("SELECT * FROM table_order_items WHERE order_id = ? ORDER BY created_at,id").all(orderId).map(row => {
    const quantityTenThousandths = Math.round(Number(row.quantity) * 10000);
    const unitPriceMinor = tableMoneyMinor(row.unit_price), lineTotalMinor = tableMoneyMinor(row.line_total);
    benefitsAssert(Number.isSafeInteger(quantityTenThousandths) && quantityTenThousandths > 0
      && ["open", "preparing", "served", "cancelled"].includes(String(row.status))
      && Number(row.quantity) === quantityTenThousandths / 10000 && unitPriceMinor >= 0 && lineTotalMinor >= 0
      && Number((BigInt(unitPriceMinor) * BigInt(quantityTenThousandths) + 5000n) / 10000n) === lineTotalMinor, "BENEFITS_TABLE_SNAPSHOT_CONFLICT");
    benefitsAssert(db.prepare("SELECT 1 FROM catalog_products WHERE id = ? AND business_id = ? AND deleted_at = ''")
      .get(String(row.product_id), businessId), "BENEFITS_CONTEXT_SCOPE");
    return { id: String(row.id), productId: String(row.product_id), currency: String(row.currency), status: String(row.status),
      unitPriceMinor, quantityTenThousandths, lineTotalMinor };
  });
  const active = items.filter(item => item.status !== "cancelled");
  const subtotalMinor = tableMoneyMinor(order.subtotal), discountMinor = tableMoneyMinor(order.discount_total), totalMinor = tableMoneyMinor(order.total);
  const currency = active[0]?.currency ?? "";
  benefitsAssert(active.length > 0 && /^[A-Z]{3}$/.test(currency) && active.every(item => item.currency === currency)
    && Number.isSafeInteger(subtotalMinor) && active.reduce((sum, item) => sum + item.lineTotalMinor, 0) === subtotalMinor
    && discountMinor >= 0 && discountMinor <= subtotalMinor && totalMinor === subtotalMinor - discountMinor && totalMinor > 0,
  "BENEFITS_TABLE_SNAPSHOT_CONFLICT");
  benefitsAssert(!db.prepare("SELECT 1 FROM room_folio_table_order_transfers WHERE table_order_id = ?").get(orderId), "BENEFITS_TABLE_PAID_REQUIRED");
  return { businessId, tableId: String(order.table_id), customerId: String(order.current_customer_id) || null,
    status: String(order.status), subtotalMinor, discountMinor, totalMinor, currency, items, active };
}

export function readTableOrderTender(db: DatabaseSync, orderId: string) {
  return db.prepare("SELECT * FROM table_order_settlements WHERE order_id = ?").get(orderId);
}

/** Finance and benefits validate the same persisted paid evidence, including current item snapshot. */
export function assertPaidTableOrderTender(db: DatabaseSync, orderId: string) {
  const tender = readTableOrderTender(db, orderId), snapshot = readTableSettlementSnapshot(db, orderId);
  benefitsAssert(tender && snapshot.status === "paid" && tender.business_id === snapshot.businessId && tender.table_id === snapshot.tableId
    && tender.source_kind === "table_order" && tender.channel === "desktop_desk"
    && tender.currency === snapshot.currency && tender.subtotal_minor === snapshot.subtotalMinor
    && tender.discount_minor === snapshot.discountMinor && tender.order_total_minor === snapshot.totalMinor
    && Number(tender.cash_received_minor) + Number(tender.points_tender_minor) === snapshot.totalMinor
    && tender.items_json === canonicalBenefitsJson(snapshot.items), "BENEFITS_SETTLEMENT_MISMATCH");
  if (tender.customer_id !== null) benefitsAssert(db.prepare("SELECT 1 FROM customers WHERE business_id = ? AND id = ? AND deleted_at = ''")
    .get(snapshot.businessId, String(tender.customer_id)), "BENEFITS_CUSTOMER_SCOPE");
  return tender;
}
