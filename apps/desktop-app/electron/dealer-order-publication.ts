import type { DatabaseSync } from "node:sqlite";
import type { DealerAccessProjection, DealerOrderHistoryProjection, CommerceOrderStatus } from "@yardimci-asistan/shared";

/** Projection only. Canonical Commerce Order remains the sole status/amount owner. */
export function createDealerOrderHistory(db: DatabaseSync, access: DealerAccessProjection): DealerOrderHistoryProjection[] {
  if (!access.online_sales_enabled) return [];
  return access.dealers.filter(dealer => dealer.account_id !== "").map(dealer => {
    const rows = db.prepare(`SELECT o.id, o.source_reference, o.status, o.placed_at, o.updated_at, o.total, o.currency FROM commerce_orders o JOIN customer_web_access a
      ON a.customer_id = o.customer_id AND a.business_id = o.business_id
      WHERE a.id = ? AND o.source IN ('web-dealer', 'web-online-sales') AND o.deleted_at = '' ORDER BY o.placed_at DESC, o.id`).all(dealer.access_id);
    const orders: DealerOrderHistoryProjection["orders"] = rows.map(row => ({
      order_id: String(row.source_reference), status: String(row.status) as CommerceOrderStatus,
      created_at: String(row.placed_at), updated_at: String(row.updated_at), total: Number(row.total), currency: String(row.currency),
      items: db.prepare("SELECT product_id, product_name, quantity FROM commerce_order_items WHERE order_id = ? ORDER BY created_at, id").all(String(row.id))
        .map(item => ({ product_id: String(item.product_id), name: String(item.product_name), quantity: Number(item.quantity) }))
    }));
    for (const row of db.prepare("SELECT * FROM commerce_dealer_order_rejections WHERE dealer_access_id = ? ORDER BY created_at DESC").all(dealer.access_id)) {
      orders.push({ order_id: String(row.web_order_id), status: "rejected", created_at: String(row.created_at), updated_at: String(row.created_at), total: null, currency: "", items: [] });
    }
    return { access_id: dealer.access_id, orders };
  });
}
