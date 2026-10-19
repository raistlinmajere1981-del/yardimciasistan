import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "../business-capability-store.js";
import { reportReservationCapabilitySqlClause, reportTaskCapabilitySqlClause } from "./report-utils.js";

/** App-lock persisted verifier and authorized notification projection. Session lock state stays in DesktopAppLockService. */
export function getAppLockPasswordVerifier(db: DatabaseSync): string {
  const settings = db
    .prepare("SELECT app_password_verifier FROM settings WHERE deleted_at = '' LIMIT 1")
    .get() as { app_password_verifier?: string } | undefined;
  return String(settings?.app_password_verifier ?? "").trim();
}

export function setAppLockPasswordVerifier(db: DatabaseSync, verifier: string): void {
  const normalizedVerifier = verifier.trim();
  if (normalizedVerifier.length > 1024 || /[\x00-\x1F\x7F]/.test(normalizedVerifier)) {
    throw new Error("Uygulama şifre kaydı geçersiz.");
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(`
      UPDATE settings
      SET app_password_verifier = ?,
          app_password_updated_at = ?,
          updated_at = ?
      WHERE deleted_at = ''
    `)
    .run(normalizedVerifier, now, now);
  if (Number(result.changes) === 0) {
    throw new Error("Uygulama şifresinin kaydedileceği ayar bulunamadı.");
  }
}

export function getAppLockNotificationCount(db: DatabaseSync): number {
  const enabled = new Set(readEnabledBusinessCapabilities(db));
  const requestsEnabled = enabled.has(BUSINESS_CAPABILITIES.CUSTOMERS) && enabled.has(BUSINESS_CAPABILITIES.REQUESTS);
  const row = db
    .prepare(`
      SELECT
        (
          (SELECT COUNT(*) FROM requests WHERE status = 'new' AND deleted_at = '' AND ?)
          + (SELECT COUNT(*) FROM reservations WHERE status = 'pending' AND deleted_at = '' ${reportReservationCapabilitySqlClause(enabled)})
          + (SELECT COUNT(*) FROM daily_tasks WHERE status = 'pending' AND deleted_at = '' ${reportTaskCapabilitySqlClause(enabled)})
          + (
            SELECT COUNT(DISTINCT tables.id)
            FROM tables
            LEFT JOIN table_orders
              ON table_orders.table_id = tables.id
              AND table_orders.status = 'payment'
            WHERE tables.deleted_at = ''
              AND tables.is_active = 1
              AND ?
              AND (tables.status = 'bill_waiting' OR table_orders.id IS NOT NULL)
          )
          + (
            SELECT COUNT(*)
            FROM events
            WHERE type = 'android.action_failed' AND deleted_at = ''
          )
        ) AS count
    `)
    .get(requestsEnabled ? 1 : 0, enabled.has(BUSINESS_CAPABILITIES.FOOD_ORDERS) ? 1 : 0) as { count?: number } | undefined;
  return Math.max(0, Number(row?.count ?? 0));
}
