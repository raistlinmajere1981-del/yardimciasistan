import type { DatabaseSync } from "node:sqlite";
import type {
  DesktopSyncJob,
  DesktopSyncJobType,
  DesktopSyncRuntimeStatus
} from "../database-types.js";

export function setAutoSyncEnabled(db: DatabaseSync, enabled: boolean): DesktopSyncRuntimeStatus {
  const now = new Date().toISOString();
  db
    .prepare("UPDATE settings SET auto_sync_enabled = ?, updated_at = ? WHERE deleted_at = ''")
    .run(enabled ? 1 : 0, now);
  return getSyncRuntimeStatus(db);
}

export function getSyncRuntimeStatus(db: DatabaseSync): DesktopSyncRuntimeStatus {
  const settings = db
    .prepare("SELECT auto_sync_enabled FROM settings WHERE deleted_at = '' LIMIT 1")
    .get() as { auto_sync_enabled?: number } | undefined;
  const identity = db
    .prepare("SELECT client_id FROM desktop_sync_identity WHERE id = 'primary'")
    .get() as { client_id?: string } | undefined;
  const runtime = db
    .prepare("SELECT * FROM sync_runtime WHERE id = 'primary'")
    .get() as Record<string, unknown> | undefined;
  const pending = db
    .prepare("SELECT COUNT(*) AS count, MIN(NULLIF(next_attempt_at, '')) AS next_retry_at FROM sync_outbox")
    .get() as { count?: number; next_retry_at?: string } | undefined;
  return {
    enabled: Number(settings?.auto_sync_enabled ?? 1) === 1,
    clientId: String(identity?.client_id ?? ""),
    requestCursor: Number(runtime?.request_cursor ?? 0),
    webOrderCursor: Number(runtime?.web_order_cursor ?? 0),
    webOrderAcknowledgedCursor: Number(runtime?.web_order_acknowledged_cursor ?? 0),
    acknowledgedCursor: Number(runtime?.acknowledged_cursor ?? 0),
    lastAttemptAt: String(runtime?.last_attempt_at ?? ""),
    lastSuccessAt: String(runtime?.last_success_at ?? ""),
    lastError: String(runtime?.last_error ?? ""),
    consecutiveFailures: Number(runtime?.consecutive_failures ?? 0),
    pendingJobs: Number(pending?.count ?? 0),
    nextRetryAt: String(pending?.next_retry_at ?? "")
  };
}

export function getPendingSyncJobs(db: DatabaseSync, now = new Date().toISOString()): DesktopSyncJob[] {
  const rows = db
    .prepare(`
        SELECT job_key, job_type, source_revision, attempt_count, next_attempt_at, last_error, updated_at
        FROM sync_outbox
        WHERE next_attempt_at = '' OR next_attempt_at <= ?
        ORDER BY CASE job_type WHEN 'menu_publish' THEN 0 ELSE 1 END, updated_at ASC
      `)
    .all(now) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    jobKey: String(row.job_key ?? ""),
    jobType: String(row.job_type ?? "") as DesktopSyncJobType,
    sourceRevision: Number(row.source_revision ?? 0),
    attemptCount: Number(row.attempt_count ?? 0),
    nextAttemptAt: String(row.next_attempt_at ?? ""),
    lastError: String(row.last_error ?? ""),
    updatedAt: String(row.updated_at ?? "")
  }));
}

export function queueSyncJob(db: DatabaseSync, jobType: DesktopSyncJobType, timestamp = new Date().toISOString()) {
  const jobKey = jobType === "menu_publish" ? "menu"
    : jobType === "online_catalog_publish" ? "online_catalog" : "android_snapshot";
  db
    .prepare(`
        INSERT INTO sync_outbox (
          job_key, job_type, source_revision, attempt_count, next_attempt_at,
          last_error, created_at, updated_at
        ) VALUES (?, ?, 1, 0, '', '', ?, ?)
        ON CONFLICT(job_key) DO UPDATE SET
          source_revision = sync_outbox.source_revision + 1,
          attempt_count = 0,
          next_attempt_at = '',
          last_error = '',
          updated_at = excluded.updated_at
      `)
    .run(jobKey, jobType, timestamp, timestamp);
}

export function completeSyncJob(db: DatabaseSync, jobKey: string, sourceRevision: number) {
  db
    .prepare("DELETE FROM sync_outbox WHERE job_key = ? AND source_revision = ?")
    .run(jobKey, sourceRevision);
}

export function failSyncJob(db: DatabaseSync, jobKey: string, sourceRevision: number, errorMessage: string, nextAttemptAt: string) {
  db
    .prepare(`
        UPDATE sync_outbox
        SET attempt_count = attempt_count + 1,
            next_attempt_at = ?,
            last_error = ?,
            updated_at = ?
        WHERE job_key = ? AND source_revision = ?
      `)
    .run(nextAttemptAt, errorMessage.slice(0, 1000), new Date().toISOString(), jobKey, sourceRevision);
}

export function recordSyncAttempt(db: DatabaseSync, timestamp = new Date().toISOString()) {
  db
    .prepare("UPDATE sync_runtime SET last_attempt_at = ?, updated_at = ? WHERE id = 'primary'")
    .run(timestamp, timestamp);
}

export function recordAutomaticSyncSuccess(db: DatabaseSync, timestamp = new Date().toISOString()) {
  db
    .prepare(`
        UPDATE sync_runtime
        SET last_success_at = ?, last_error = '', consecutive_failures = 0, updated_at = ?
        WHERE id = 'primary'
      `)
    .run(timestamp, timestamp);
}

export function recordAutomaticSyncFailure(db: DatabaseSync, message: string, timestamp = new Date().toISOString()) {
  db
    .prepare(`
        UPDATE sync_runtime
        SET last_error = ?, consecutive_failures = consecutive_failures + 1, updated_at = ?
        WHERE id = 'primary'
      `)
    .run(message.slice(0, 1000), timestamp);
}

export function acknowledgeRequestCursor(db: DatabaseSync, cursor: number, timestamp = new Date().toISOString()) {
  db
    .prepare(`
        UPDATE sync_runtime
        SET acknowledged_cursor = MAX(acknowledged_cursor, ?), updated_at = ?
        WHERE id = 'primary'
      `)
    .run(Math.max(0, Math.trunc(cursor)), timestamp);
}

export function recordWebOrderCursor(db: DatabaseSync, cursor: number, acknowledged: boolean) {
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("Geçersiz web sipariş cursor değeri.");
  db.prepare(`
    UPDATE sync_runtime
    SET web_order_cursor = MAX(web_order_cursor, ?),
        web_order_acknowledged_cursor = MAX(web_order_acknowledged_cursor, ?),
        updated_at = ?
    WHERE id = 'primary'
  `).run(cursor, acknowledged ? cursor : 0, new Date().toISOString());
}
