import type { PublicationIdentity, PublicationReceipt, SyncCoreConfig, SyncFailure } from "@yardimci-asistan/sync-core";
import type { DesktopDatabase } from "./database";
import type { DesktopSyncJobType } from "./database-types";
import { ensurePublicationSource, publicationIdempotencyKey } from "./publication-source-service";
import { DESKTOP_PUBLICATIONS } from "./desktop-publication-registry";

/** All Desktop writers share durable preparation/retry/completion. Transport
 * callbacks must use sync-core's exact receipt validation, not raw HTTP success.
 */
export async function publishDesktopProjection<T, R extends PublicationReceipt & { ok: true; published_at: string }>(
  database: DesktopDatabase,
  config: SyncCoreConfig,
  jobType: DesktopSyncJobType,
  value: T,
  send: (identity: PublicationIdentity, frozen: T) => Promise<R | SyncFailure>,
  options: { refresh?: boolean; expectedRevision?: number; nextAttemptAt?: string; isCurrent?: () => boolean; acknowledge?: (sent: T, result: R) => void } = {}
): Promise<R | SyncFailure | null> {
  database.ensurePublicationTarget(config.baseUrl.trim().replace(/\/+$/, ""));
  const prepared = database.prepareSyncPublication(jobType, value, options.refresh, options.expectedRevision);
  if (!prepared) return null;
  if (!options.refresh && !database.getPendingSyncJobs().some((job) => job.jobKey === prepared.jobKey && job.sourceRevision === prepared.sourceRevision)) return null;
  const source = await ensurePublicationSource(database, config);
  // Media preparation/activation can outlive a capability, target or photo edit.
  // Retain reusable uploads, but do not send the superseded frozen revision.
  if (options.isCurrent && !options.isCurrent()) return null;
  let result = source.ok ? await send({ clientId: source.clientId, sourceEpoch: source.sourceEpoch,
    sourceRevision: prepared.sourceRevision,
    idempotencyKey: publicationIdempotencyKey(source.clientId, source.sourceEpoch, prepared.jobKey, prepared.sourceRevision)
  }, prepared.value) : source;
  if (result.ok && source.ok && (result.source_client_id !== source.clientId || result.source_epoch !== source.sourceEpoch
      || result.source_revision !== prepared.sourceRevision || result.accepted !== true
      || result.publication_name !== DESKTOP_PUBLICATIONS[jobType].name
      || result.idempotency_key !== publicationIdempotencyKey(source.clientId, source.sourceEpoch, prepared.jobKey, prepared.sourceRevision)
      || !/^[a-f0-9]{64}$/.test(result.payload_hash ?? ""))) {
    result = { ok: false, message: "Publication apply onayı doğrulanamadı.", error: "publication_ack_mismatch" };
  }
  if (result.ok) {
    options.acknowledge?.(prepared.value, result);
    database.completeSyncJob(prepared.jobKey, prepared.sourceRevision, result.source_epoch);
  } else {
    database.failSyncJob(prepared.jobKey, prepared.sourceRevision, result.message, options.nextAttemptAt ?? new Date(Date.now() + 5_000).toISOString());
  }
  return result;
}
