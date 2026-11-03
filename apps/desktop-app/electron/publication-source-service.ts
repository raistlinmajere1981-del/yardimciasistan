import { activatePublicationSource, readRestoreSyncState, type SyncCoreConfig } from "@yardimci-asistan/sync-core";
import type { DesktopDatabase } from "./database";

/** Bootstrap only. A replacement requires an explicit CAS activation with the
 * hosting's expected epoch; never infer takeover from a random client ID.
 */
export async function ensurePublicationSource(database: DesktopDatabase, config: SyncCoreConfig) {
  const target = config.baseUrl.trim().replace(/\/+$/, "");
  database.ensurePublicationTarget(target);
  const clientId = database.getSyncRuntimeStatus().clientId;
  let restore = database.getRestoreReconciliationStatus();
  if (restore && restore.state !== "complete") {
    if (restore.target && restore.target !== target) return { ok: false as const, message: "Restore senkron hedefi değişti; bekleyen reconciliation korunuyor.", error: "restore_target_changed" };
    if (restore.state === "activation_pending") {
      if (restore.expectedEpoch === null) {
        const remote = await readRestoreSyncState(config);
        if (!remote.ok) return remote;
        database.saveRestoreActivationExpectation(restore.operationId, target, remote.source_epoch, remote.requests_through, remote.orders_through);
        restore = database.getRestoreReconciliationStatus()!;
      }
      if (restore.target !== target) return { ok: false as const, message: "Restore senkron hedefi değişti; bekleyen reconciliation korunuyor.", error: "restore_target_changed" };
      const activated = await activatePublicationSource({ ...config, clientId, expectedEpoch: restore.expectedEpoch!, activationKey: `${restore.operationId}:activate` });
      if (!activated.ok) return activated;
      database.finishRestoreActivation(restore.operationId, target, activated.source_epoch);
      return { ok: true as const, clientId, sourceEpoch: activated.source_epoch };
    }
  }
  const epoch = database.getPublicationSourceEpoch(target);
  if (epoch) return { ok: true as const, sourceEpoch: epoch, clientId };
  const result = await activatePublicationSource({ ...config, clientId, expectedEpoch: 0, activationKey: `${clientId}:activate:0` });
  if (!result.ok) return result;
  database.savePublicationSourceEpoch(target, result.source_epoch);
  return { ok: true as const, sourceEpoch: result.source_epoch, clientId };
}

export function publicationIdempotencyKey(clientId: string, epoch: number, jobKey: string, revision: number) {
  return `${clientId}:${epoch}:${jobKey}:${revision}`;
}


/** An explicit Connect action claims this publication target after authenticated
 * validation. Background retries never take over an existing publication source. */
export async function connectPublicationSource(database: DesktopDatabase, config: SyncCoreConfig) {
  // A restored database already owns a durable activation operation/key. Reuse
  // that CAS continuation when Settings connects; claiming a separate key here
  // would retire this freshly rotated client ID before reconciliation can start.
  const restore = database.getRestoreReconciliationStatus();
  if (restore && restore.state !== "complete") {
    return ensurePublicationSource(database, config);
  }
  const target = config.baseUrl.trim().replace(/\/+$/, "");
  const clientId = database.getSyncRuntimeStatus().clientId;
  if (!clientId) return { ok: false as const, message: "Masaüstü yayın kimliği bulunamadı." };
  const remote = await readRestoreSyncState(config);
  if (!remote.ok) return remote;
  const epoch = remote.source_epoch;
  if (epoch > 0 && remote.source_client_id === clientId) {
    database.replacePublicationSourceEpoch(target, epoch);
    database.ensurePublicationTarget(target);
    return { ok: true as const, message: "Bu masaüstü yayın kaynağı zaten etkin.", sourceEpoch: epoch };
  }
  // The user explicitly requested connection. CAS preserves remote ordering;
  // unauthenticated tests and passive synchronization never transfer ownership.
  const result = await activatePublicationSource({
    ...config, clientId, expectedEpoch: epoch, activationKey: `${clientId}:connect:${epoch}`
  });
  if (!result.ok) return result;
  database.replacePublicationSourceEpoch(target, result.source_epoch);
  database.ensurePublicationTarget(target);
  return { ok: true as const, message: "Web yayın kaynağı bağlandı.", sourceEpoch: result.source_epoch };
}
