import { activatePublicationSource, type SyncCoreConfig } from "@yardimci-asistan/sync-core";
import type { DesktopDatabase } from "./database";

/** Bootstrap only. A replacement requires an explicit CAS activation with the
 * hosting's expected epoch; never infer takeover from a random client ID.
 */
export async function ensurePublicationSource(database: DesktopDatabase, config: SyncCoreConfig) {
  const target = config.baseUrl.trim().replace(/\/+$/, "");
  database.ensurePublicationTarget(target);
  const clientId = database.getSyncRuntimeStatus().clientId;
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
