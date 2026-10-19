import type { DatabaseSync } from "node:sqlite";

/** Access generations cannot be restored. Retrying this transport intent cannot authorize it. */
export class DealerWebOrderAccessRejected extends Error {
  constructor() { super("Bayi web erişimi geçersiz veya kapalı."); }
}

/** Durable transport rejection, without customer/contact/order payloads. */
export function recordRejectedDealerWebOrder(db: DatabaseSync, orderId: string, accessId: string, accessRevision: number) {
  // Durable transport outcome, with no order/customer/contact/address payload.
  db.prepare(`INSERT INTO commerce_dealer_order_rejections (web_order_id, dealer_access_id, access_revision, reason, created_at)
    VALUES (?, ?, ?, 'access_revoked', ?) ON CONFLICT(web_order_id) DO NOTHING`)
    .run(orderId, accessId, accessRevision, new Date().toISOString());
}
