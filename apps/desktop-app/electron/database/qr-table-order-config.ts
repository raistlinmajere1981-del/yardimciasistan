import { createHash, createHmac, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { queueSyncJob } from "./sync-runtime-store.js";

/** Private local secret. Only SHA-256 digests of per-table bearer tokens may be published. */
export function qrTableToken(secret: string, tableId: string): string {
  return createHmac("sha256", secret).update("yardimci:table-order:v1:" + tableId).digest("base64url").slice(0, 24);
}

export function qrTableTokenHash(secret: string, tableId: string): string {
  return createHash("sha256").update(qrTableToken(secret, tableId)).digest("hex");
}

export function getQrTableOrderConfig(db: DatabaseSync): { enabled: boolean; secret: string } {
  const row = db.prepare("SELECT qr_table_orders_enabled, qr_table_order_secret, publish_qr_menu_web FROM business WHERE deleted_at = '' LIMIT 1")
    .get() as { qr_table_orders_enabled?: number; qr_table_order_secret?: string; publish_qr_menu_web?: number } | undefined;
  return {
    enabled: Number(row?.qr_table_orders_enabled ?? 0) === 1 && Number(row?.publish_qr_menu_web ?? 0) === 1,
    secret: String(row?.qr_table_order_secret ?? "")
  };
}

export function setQrTableOrdersEnabled(db: DatabaseSync, enabled: boolean): void {
  const now = new Date().toISOString();
  db.exec("SAVEPOINT qr_table_orders_config");
  try {
    const current = getQrTableOrderConfig(db);
    const secret = current.secret || (enabled ? randomBytes(32).toString("hex") : "");
    const result = db.prepare(
      "UPDATE business SET qr_table_orders_enabled = ?, qr_table_order_secret = ?, updated_at = ?, sync_status = 'local_only' WHERE deleted_at = ''"
    ).run(enabled ? 1 : 0, secret, now);
    if (Number(result.changes) < 1) throw new Error("QR sipariş ayarı kaydedilemedi.");
    // QR ordering is valid only when menu AND per-table token hashes reach
    // hosting. Invalidating only menu can leave table_catalog stale.
    queueSyncJob(db, "menu_publish", now);
    queueSyncJob(db, "table_catalog_publish", now);
    db.exec("RELEASE qr_table_orders_config");
  } catch (error) {
    db.exec("ROLLBACK TO qr_table_orders_config; RELEASE qr_table_orders_config");
    throw error;
  }
}

export function listQrOrderTables(db: DatabaseSync): Array<{ id: string; name: string; area: string; token: string }> {
  const config = getQrTableOrderConfig(db);
  if (!config.enabled || !config.secret) return [];
  return (db.prepare("SELECT id, name, area FROM tables WHERE deleted_at = '' AND is_active = 1 ORDER BY sort_order, name")
    .all() as Array<{ id: string; name: string; area: string }>).map(table => ({
      id: table.id, name: table.name, area: table.area, token: qrTableToken(config.secret, table.id)
    }));
}
