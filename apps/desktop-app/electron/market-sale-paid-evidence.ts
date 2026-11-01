import { BUSINESS_CAPABILITIES, moneyToMinor, type BenefitsQuote } from "@yardimci-asistan/shared";
import { benefitsAssert } from "./commerce-benefits-engine.js";
import { benefitsOperation, type BenefitsTransaction } from "./commerce-benefits-rules.js";
import type { BenefitsPricingRequest } from "./commerce-benefits-store.js";
import { isInventoryTrackingEnabled } from "./inventory-tracking.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service.js";

/** INTERNAL read-only comparison, never payment/settlement authorization. The
 * caller supplies a freshly revalidated canonical reservation quote, not Android
 * totals. All returned amounts come independently from persisted Commerce tender.
 * This cannot establish who issued a sale operation receipt (C20m).
 */
export function readMarketSalePaidTenderEvidence(tx: BenefitsTransaction, request: BenefitsPricingRequest, quote: BenefitsQuote, locationId: string) {
  return benefitsOperation(tx, () => {
    const db = tx.database;
    benefitsAssert(request.source.kind === "sale", "COMPANION_POINTS_PAID_SALE_SCOPE");
    const sale = db.prepare("SELECT * FROM commerce_sales WHERE id=? AND deleted_at=''").get(request.source.id);
    benefitsAssert(sale && sale.business_id === request.businessId && sale.customer_id === request.customerId
      && sale.source === "android-market-sale" && sale.currency === request.currency
      && sale.payment_method === request.paymentMethodId, "COMPANION_POINTS_PAID_SALE_SCOPE");
    benefitsAssert(sale.status === "paid" && sale.closed_at !== "", "COMPANION_POINTS_PAID_SALE_REQUIRED");
    benefitsAssert(!db.prepare("SELECT 1 FROM commerce_order_fulfillments WHERE sale_id=?").get(request.source.id)
      && !db.prepare("SELECT 1 FROM commerce_sale_full_refunds WHERE sale_id=?").get(request.source.id), "COMPANION_POINTS_PAID_SALE_SCOPE");
    const tender = db.prepare("SELECT * FROM commerce_sale_settlements WHERE sale_id=?").get(request.source.id);
    benefitsAssert(tender, "COMPANION_POINTS_TENDER_REQUIRED");
    const cashPaidMinor = Number(tender.cash_received_minor), pointsTenderMinor = Number(tender.points_tender_minor);
    benefitsAssert(tender.business_id === request.businessId && tender.customer_id === request.customerId
      && tender.payment_method === sale.payment_method && tender.created_at === sale.created_at
      && [cashPaidMinor, pointsTenderMinor].every(n => Number.isSafeInteger(n) && n >= 0)
      && quote.currency === sale.currency && quote.currencyExponent === 2 && quote.accountingMinor === 0
      && moneyToMinor(Number(sale.subtotal)) === quote.subtotalMinor
      && moneyToMinor(Number(sale.discount_total)) === quote.discountMinor
      && cashPaidMinor === quote.payableMinor && pointsTenderMinor === quote.pointsTenderMinor
      && moneyToMinor(Number(sale.total)) === cashPaidMinor + pointsTenderMinor,
    "COMPANION_POINTS_TENDER_MISMATCH");
    // A PAID cash sale + immutable received tender is canonical cash confirmation.
    // A client POS flag, method mapping or Finance projection cannot prove an
    // external card/bank/other transaction. No external tender is due all-points.
    benefitsAssert(cashPaidMinor === 0 || tender.payment_method === "cash", "COMPANION_POINTS_EXTERNAL_TENDER_EVIDENCE_REQUIRED");
    const finance = db.prepare("SELECT * FROM finance_entries WHERE source_type='commerce_sale' AND source_id=?").all(request.source.id);
    const income = finance[0];
    benefitsAssert(cashPaidMinor === 0 ? finance.length === 0 : finance.length === 1 && income
      && income.direction === "income" && income.deleted_at === "" && income.amount_minor === cashPaidMinor
      && income.currency === sale.currency && income.payment_method === tender.payment_method,
    "COMPANION_POINTS_FINANCE_MISMATCH");
    const items = db.prepare("SELECT * FROM commerce_sale_items WHERE sale_id=? ORDER BY product_id").all(request.source.id);
    const expected = [...request.lines].sort((a, b) => a.productId.localeCompare(b.productId));
    const wholesale = readEnabledBusinessCapabilities(db).includes(BUSINESS_CAPABILITIES.WHOLESALE);
    benefitsAssert(items.length === expected.length && new Set(expected.map(line => line.productId)).size === expected.length
      && items.reduce((sum, item) => sum + moneyToMinor(Number(item.line_total)), 0) === quote.subtotalMinor
      && items.every((item, index) => {
      const line = expected[index]!;
      const price = resolveCommerceProductPriceInDatabase(db, request.businessId, { productId: line.productId,
        ...(request.customerId === null ? {} : { customerId: request.customerId }) }, wholesale);
      return item.product_id === line.productId && price.currency === request.currency
        && Number(item.quantity) > 0 && Math.abs(Number(item.quantity) * 10000 - line.quantityTenThousandths) <= 0.00001
        && moneyToMinor(Number(item.unit_price)) === moneyToMinor(price.unitPrice)
        && moneyToMinor(Number(item.line_total)) === Math.round((price.unitPrice * Number(item.quantity) + Number.EPSILON) * 100);
    }), "COMPANION_POINTS_ITEMS_MISMATCH");
    const movements = db.prepare("SELECT * FROM inventory_movements WHERE reference_type='commerce_sale' AND reference_id=?").all(request.source.id);
    const tracked = isInventoryTrackingEnabled(db) ? expected.filter(line => db.prepare(
      "SELECT 1 FROM catalog_products WHERE business_id=? AND id=? AND track_inventory=1").get(request.businessId, line.productId)) : [];
    const location = locationId || String(db.prepare(
      "SELECT id FROM inventory_locations WHERE business_id=? AND is_primary=1 AND is_active=1 AND deleted_at='' ORDER BY created_at LIMIT 1")
      .get(request.businessId)?.id ?? "");
    benefitsAssert(movements.length === tracked.length && tracked.every(line => {
      const matches = movements.filter(row => row.product_id === line.productId);
      const row = matches[0];
      return matches.length === 1 && row && row.business_id === request.businessId && row.location_id === location && row.movement_type === "sale"
        && row.actor_source === "android-market-sale" && -Number(row.quantity_delta) * 10000 === line.quantityTenThousandths;
    }), "COMPANION_POINTS_STOCK_MISMATCH");
    return Object.freeze({ source: Object.freeze({ ...request.source }), businessId: String(sale.business_id),
      customerId: tender.customer_id === null ? null : String(tender.customer_id), currency: String(sale.currency),
      cashPaidMinor, pointsTenderMinor, confirmation: cashPaidMinor === 0 ? "points_only" as const : "cash_received" as const,
      authority: Object.freeze({ state: "read_only" as const, canReservePoints: false as const, canConfirmPoints: false as const }) });
  });
}
