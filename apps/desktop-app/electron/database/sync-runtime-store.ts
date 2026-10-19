import type { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { encodePublicationPayload, decodePublicationPayload } from "../publication-payload-codec.js";
import { DESKTOP_PUBLICATIONS } from "../desktop-publication-registry";
import { getRestoreReconciliationStatus, finishRestoreReconciliationIfReady } from "./restore-reconciliation-store";
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
  const restoreReconciliation = getRestoreReconciliationStatus(db);
  return {
    ...(restoreReconciliation !== undefined ? { restoreReconciliation } : {}),
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
  const jobKey = jobType.replace(/_publish$/, "");
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

export function getPublicationSourceEpoch(db: DatabaseSync, target: string): number {
  return Number((db.prepare('SELECT source_epoch FROM sync_publication_sources WHERE target = ?').get(target) as { source_epoch: number } | undefined)?.source_epoch ?? 0);
}

export function savePublicationSourceEpoch(db: DatabaseSync, target: string, epoch: number) {
  db.prepare('INSERT INTO sync_publication_sources(target, source_epoch) VALUES (?, ?) ON CONFLICT(target) DO UPDATE SET source_epoch = MAX(source_epoch, excluded.source_epoch)').run(target, epoch);
}

/** Explicit user connection can rebind after a clean hosting reset (epoch may decrease). */
export function replacePublicationSourceEpoch(db: DatabaseSync, target: string, epoch: number) {
  db.prepare('INSERT INTO sync_publication_sources(target, source_epoch) VALUES (?, ?) ON CONFLICT(target) DO UPDATE SET source_epoch = excluded.source_epoch').run(target, epoch);
}

export function ensurePublicationTarget(db: DatabaseSync, target: string) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare("SELECT publication_target FROM sync_runtime WHERE id = 'primary'").get() as { publication_target: string };
    if (current.publication_target !== target) {
      const payloads = db.prepare('SELECT job_key FROM sync_publication_payloads').all() as { job_key: string }[];
      for (const { job_key: key } of payloads) {
        queueSyncJob(db, (key === 'android_snapshot' ? key : `${key}_publish`) as DesktopSyncJobType);
      }
      db.prepare("UPDATE sync_runtime SET publication_target = ? WHERE id = 'primary'").run(target);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

/** One allocator, one immutable body per revision. The comparison is persisted,
 * not an in-memory cache. Canonical readers reconstitute missing derived intent.
 * refresh means "publish now"; a pending retry keeps its identity/body.
 */
export function prepareSyncPublication<T>(db: DatabaseSync, jobType: DesktopSyncJobType, value: T, refresh = false, expectedRevision?: number) {
  const jobKey = jobType.replace(/_publish$/, "");
  const json = JSON.stringify(value);
  const content = { ...(value as object) } as Record<string, unknown>;
  delete content.updatedAt;
  delete content.updated_at;
  delete content.generated_at;
  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    let job = db.prepare('SELECT source_revision FROM sync_outbox WHERE job_key = ?').get(jobKey) as { source_revision: number } | undefined;
    // Async media/projection preparation may have raced a domain mutation. Never
    // attach an older prepared body to the newer invalidation it did not observe.
    if (expectedRevision !== undefined && job?.source_revision !== expectedRevision) { db.exec('COMMIT'); return null; }
    const stored = db.prepare('SELECT * FROM sync_publication_payloads WHERE job_key = ?').get(jobKey) as {
      source_revision: number; payload: string; content_hash: string;
    } | undefined;
    if ((!job && (refresh || !stored || stored.content_hash !== hash))
        || (job && stored?.source_revision === job.source_revision && stored.content_hash !== hash
          && DESKTOP_PUBLICATIONS[jobType].publisher !== "outbox")) {
      queueSyncJob(db, jobType);
      job = db.prepare('SELECT source_revision FROM sync_outbox WHERE job_key = ?').get(jobKey) as { source_revision: number };
    }
    if (!job) { db.exec('COMMIT'); return null; }
    let frozen = value;
    if (stored?.source_revision === job.source_revision) {
      frozen = JSON.parse(decodePublicationPayload(stored.payload)) as T;
    } else {
      db.prepare('INSERT INTO sync_publication_payloads(job_key, source_revision, payload, content_hash) VALUES (?, ?, ?, ?) ON CONFLICT(job_key) DO UPDATE SET source_revision = excluded.source_revision, payload = excluded.payload, content_hash = excluded.content_hash')
        .run(jobKey, job.source_revision, encodePublicationPayload(jobKey, json), hash);
    }
    if (refresh) db.prepare("UPDATE sync_outbox SET next_attempt_at = '' WHERE job_key = ? AND source_revision = ?").run(jobKey, job.source_revision);
    db.exec('COMMIT');
    return { jobKey, sourceRevision: job.source_revision, value: frozen };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function completeSyncJob(db: DatabaseSync, jobKey: string, sourceRevision: number, sourceEpoch?: number) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db.prepare("DELETE FROM sync_outbox WHERE job_key = ? AND source_revision = ?").run(jobKey, sourceRevision);
    if (result.changes && sourceEpoch) db.prepare("UPDATE sync_restore_publications SET applied_revision = ? WHERE job_key = ? AND EXISTS (SELECT 1 FROM sync_restore_reconciliation WHERE state = 'reconciliation_pending' AND source_epoch = ?)")
      .run(sourceRevision, jobKey, sourceEpoch);
    // Only an exact completed online publication changes the companion pending status.
    // Raw outbox deletion during restore/reset must not create new runtime work.
    if (result.changes && jobKey === "online_catalog") {
      const unfrozenAndroidJob = db.prepare(`SELECT 1 FROM sync_outbox o WHERE o.job_key='android_snapshot'
        AND NOT EXISTS (SELECT 1 FROM sync_publication_payloads p WHERE p.job_key=o.job_key AND p.source_revision=o.source_revision)`).get();
      // An unfrozen Android job already reads the newly completed state. Preserve
      // its revision so the current coordinator batch can still publish it.
      if (!unfrozenAndroidJob) queueSyncJob(db, "android_snapshot");
    }
    finishRestoreReconciliationIfReady(db);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
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

/** Called inside the facade's serialized schema/identity initialization transaction. */
export function ensureSyncClientId(db: DatabaseSync) {
  db
    .prepare(`
      INSERT INTO desktop_sync_identity (id, client_id)
      VALUES ('primary', ?)
      ON CONFLICT(id) DO NOTHING
    `)
    .run(`desktop-${randomUUID()}`);
}
