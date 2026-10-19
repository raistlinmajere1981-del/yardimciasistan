import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type DealerAccessAction, type DealerAccessProjection, type DealerAccessResult, type DealerWebAccess } from "@yardimci-asistan/shared";
import { desktopLog } from "./desktop-logger";
import { readEnabledBusinessCapabilities } from "./business-capability-store";
import { createDealerCatalogs } from "./dealer-catalog-publication";

function accessFromRow(row: Record<string, unknown>): DealerWebAccess {
  return { accessId: String(row.id), customerId: String(row.customer_id), enabled: Number(row.enabled) === 1,
    accessRevision: Number(row.access_revision), inviteIssuedAt: String(row.invite_issued_at),
    inviteExpiresAt: String(row.invite_expires_at), revokedAt: String(row.revoked_at), updatedAt: String(row.updated_at) };
}
export function getDealerWebAccess(db: DatabaseSync, customerId: string): DealerWebAccess | null {
  const row = db.prepare("SELECT * FROM commerce_dealer_web_access WHERE customer_id = ?").get(customerId);
  return row ? accessFromRow(row) : null;
}
export function changeDealerWebAccess(db: DatabaseSync, customerId: string, action: DealerAccessAction): DealerAccessResult {
  if (!["enable", "invite", "revoke_sessions", "disable"].includes(action)) throw new Error("Bayi erişim işlemi geçersiz.");
  const now = new Date().toISOString();
  let inviteUrl: string | undefined;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!hasBusinessCapability(readEnabledBusinessCapabilities(db), BUSINESS_CAPABILITIES.WHOLESALE)) {
      throw new Error("Bayi / Toptan Satış bu işletmede etkin değil.");
    }
    const settings = db.prepare("SELECT business_id, dealer_portal_enabled, web_module_url FROM settings WHERE deleted_at = '' LIMIT 1").get();
    const businessId = String(settings?.business_id ?? "");
    const eligible = db.prepare(`SELECT 1 FROM customers c JOIN customer_commercial_profiles p ON p.customer_id = c.id
      WHERE c.id = ? AND c.business_id = ? AND p.business_id = ? AND c.deleted_at = '' AND p.dealer_status = 'active'`).get(customerId, businessId, businessId);
    if (!eligible) throw new Error("Web erişimi yalnız aktif bayi için kullanılabilir.");
    if (action === "enable" || action === "invite") {
      if (Number(settings?.dealer_portal_enabled) !== 1) throw new Error("Bayi portalını Servisler ayarlarından etkinleştirin.");
      db.prepare(`INSERT INTO commerce_dealer_web_access
        (id, customer_id, business_id, customer_ref, access_revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(customer_id) DO NOTHING`)
        .run(randomUUID(), customerId, businessId, randomUUID(), Date.now(), now, now);
    }
    const current = getDealerWebAccess(db, customerId);
    if (!current) throw new Error("Bayi web erişimi henüz oluşturulmadı.");
    if (action === "invite") {
      if (!current.enabled) throw new Error("Önce bayi web erişimini etkinleştirin.");
      const base = new URL(String(settings?.web_module_url ?? ""));
      if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Bayi daveti için geçerli HTTPS web modülü adresi gerekli.");
      const token = randomBytes(32).toString("base64url");
      inviteUrl = `${new URL("../bayi/", `${base.href.replace(/\/+$/, "")}/`).href}#invite=${token}`;
      db.prepare(`UPDATE commerce_dealer_web_access SET access_revision = access_revision + 1,
        invite_hash = ?, invite_issued_at = ?, invite_expires_at = ?, revoked_at = '', updated_at = ? WHERE customer_id = ?`)
        .run(createHash("sha256").update(token).digest("hex"), now, new Date(Date.now() + 72 * 3600_000).toISOString(), now, customerId);
    } else {
      db.prepare(`UPDATE commerce_dealer_web_access SET enabled = ?, access_revision = access_revision + 1,
        invite_hash = '', invite_issued_at = '', invite_expires_at = '', revoked_at = ?, updated_at = ? WHERE customer_id = ?`)
        .run(action === "disable" ? 0 : action === "enable" ? 1 : Number(current.enabled), action === "enable" ? "" : now, now, customerId);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  const access = getDealerWebAccess(db, customerId)!;
  desktopLog.info({ scope: "dealer-access", event: action === "invite" ? "dealer.access.invite.created" : action === "enable" ? "dealer.access.enabled" : "dealer.access.revoked",
    message: "Bayi web erişimi güncellendi.", meta: { accessId: access.accessId, action } });
  return { access, ...(inviteUrl ? { inviteUrl } : {}) };
}
export function createDealerAccessProjection(db: DatabaseSync): DealerAccessProjection {
  db.exec("SAVEPOINT dealer_access_projection");
  try {
    const wholesaleEnabled = hasBusinessCapability(readEnabledBusinessCapabilities(db), BUSINESS_CAPABILITIES.WHOLESALE);
    const settings = db.prepare("SELECT business_id, dealer_portal_enabled FROM settings WHERE deleted_at = '' LIMIT 1").get();
    const enabled = wholesaleEnabled && Number(settings?.dealer_portal_enabled) === 1;
    const rows = db.prepare(`SELECT a.*, p.company_name, p.dealer_status, c.deleted_at FROM commerce_dealer_web_access a
      LEFT JOIN customer_commercial_profiles p ON p.customer_id = a.customer_id AND p.business_id = a.business_id
      LEFT JOIN customers c ON c.id = a.customer_id WHERE a.business_id = ? ORDER BY a.id`).all(String(settings?.business_id ?? ""));
    const projection: DealerAccessProjection = { version: 1, enabled, dealers: rows.map((row) => {
      const eligible = enabled && Number(row.enabled) === 1 && row.dealer_status === "active" && row.deleted_at === "";
      return { access_id: String(row.id), customer_ref: String(row.customer_ref), display_name: Array.from(String(row.company_name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, 160).join(""),
        access_revision: Number(row.access_revision), enabled: eligible, invite_hash: eligible ? String(row.invite_hash) : "",
        invite_expires_at: eligible && row.invite_expires_at ? Math.floor(Date.parse(String(row.invite_expires_at)) / 1000) : 0 };
    }) };
    return { ...projection, catalogs: createDealerCatalogs(db, projection) };
  } finally { db.exec("RELEASE dealer_access_projection"); }
}
