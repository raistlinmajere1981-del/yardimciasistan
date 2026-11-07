import { createWebOrderStatuses } from "./commerce-order-payment";
import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, hasBusinessCapability, type DealerAccessAction, type DealerAccessProjection, type DealerAccessResult, type DealerWebAccess } from "@yardimci-asistan/shared";
import { desktopLog } from "./desktop-logger";
import { readEnabledBusinessCapabilities } from "./business-capability-store";
import { createDealerOrderHistory } from "./dealer-order-publication";
import { createDealerCatalogs } from "./dealer-catalog-publication";

export function getDealerWebAccess(db: DatabaseSync, customerId: string): DealerWebAccess | null {
  const row = db.prepare(`SELECT a.*, (p.dealer_status = 'active' AND c.deleted_at = '' AND s.dealer_portal_enabled = 1
    AND EXISTS (SELECT 1 FROM business_capabilities b WHERE b.business_id = a.business_id AND b.capability_id = 'commerce.wholesale' AND b.is_enabled = 1)
    AND EXISTS (SELECT 1 FROM business_capabilities b WHERE b.business_id = a.business_id AND b.capability_id = 'channel.online_sales' AND b.is_enabled = 1)) AS eligible
    FROM customer_web_access a LEFT JOIN customer_commercial_profiles p ON p.customer_id = a.customer_id AND p.business_id = a.business_id
    JOIN customers c ON c.id = a.customer_id JOIN settings s ON s.business_id = a.business_id AND s.deleted_at = '' WHERE a.customer_id = ?`).get(customerId);
  if (!row) return null;
  const candidates = db.prepare(`SELECT account_id, email, full_name FROM web_customer_accounts WHERE status = 'conflict'
    AND lower(email) = (SELECT lower(trim(email)) FROM customers WHERE id = ?) ORDER BY account_id`).all(customerId);
  return { accessId: String(row.id), customerId, accountId: String(row.account_id), enabled: Number(row.eligible) === 1,
    accessRevision: Number(row.access_revision), sessionRevision: Number(row.session_revision), revokedAt: String(row.revoked_at), updatedAt: String(row.updated_at),
    linkCandidates: candidates.map(candidate => ({ accountId: String(candidate.account_id), email: String(candidate.email), fullName: String(candidate.full_name) })) };
}
export function changeDealerWebAccess(db: DatabaseSync, customerId: string, action: DealerAccessAction): DealerAccessResult {
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = getDealerWebAccess(db, customerId);
    if (!current) throw new Error("Müşteri web hesabı bulunamadı.");
    if (action === "revoke_sessions") {
      db.prepare("UPDATE customer_web_access SET session_revision = session_revision + 1, revoked_at = ?, updated_at = ? WHERE customer_id = ?").run(now, now, customerId);
    } else if (action && typeof action === "object" && action.type === "link" && typeof action.accountId === "string") {
      if (current.accountId || !current.linkCandidates.some(candidate => candidate.accountId === action.accountId)) throw new Error("Hesap eşleştirmesi çakışıyor.");
      db.prepare("UPDATE customer_web_access SET account_id = ?, updated_at = ? WHERE customer_id = ? AND account_id = ''").run(action.accountId, now, customerId);
      db.prepare("UPDATE web_customer_accounts SET customer_id = ?, status = 'linked' WHERE account_id = ? AND status = 'conflict'").run(customerId, action.accountId);
    } else throw new Error("Hesap erişim işlemi geçersiz.");
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  desktopLog.info({ scope: "customer-accounts", event: action === "revoke_sessions" ? "account.sessions.revoked" : "account.customer.linked", message: "Müşteri hesap erişimi güncellendi." });
  return { access: getDealerWebAccess(db, customerId)! };
}
export function createDealerAccessProjection(db: DatabaseSync): DealerAccessProjection {
  db.exec("SAVEPOINT dealer_access_projection");
  try {
    const caps = readEnabledBusinessCapabilities(db);
    const online = hasBusinessCapability(caps, C.ONLINE_SALES);
    const settings = db.prepare("SELECT business_id, dealer_portal_enabled FROM settings WHERE deleted_at = '' LIMIT 1").get();
    const enabled = online && hasBusinessCapability(caps, C.WHOLESALE) && Number(settings?.dealer_portal_enabled) === 1;
    const rows = db.prepare(`SELECT a.*, p.company_name, p.dealer_status, c.deleted_at FROM customer_web_access a
      LEFT JOIN customer_commercial_profiles p ON p.customer_id = a.customer_id AND p.business_id = a.business_id
      JOIN customers c ON c.id = a.customer_id AND c.business_id = a.business_id WHERE a.business_id = ? ORDER BY a.id`).all(String(settings?.business_id ?? ""));
    const projection: DealerAccessProjection = { version: 3, online_sales_enabled: online, enabled, dealers: rows.map(row => ({
      access_id: String(row.id), customer_ref: String(row.customer_ref), account_id: String(row.account_id),
      display_name: Array.from(String(row.company_name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, 160).join(""),
      access_revision: Number(row.access_revision), session_revision: Number(row.session_revision), enabled: enabled && row.dealer_status === "active" && row.deleted_at === ""
    })) };
    return { ...projection, web_order_statuses: createWebOrderStatuses(db), catalogs: createDealerCatalogs(db, projection), order_history: createDealerOrderHistory(db, projection) };
  } finally { db.exec("RELEASE dealer_access_projection"); }
}
