import {
  markRequestsSynced,
  pullRequests,
  type MarkRequestsSyncedResult,
  type PullRequestsResult,
  type PushMenuResult
} from "@yardimci-asistan/sync-core";
import type { DesktopDatabase } from "./database";
import { getWebSyncConfig } from "./sync-config";
import type { SyncCoordinator } from "./sync-coordinator";

export async function pullRequestsFromWeb(
  database: DesktopDatabase,
  afterSuccessfulPull?: () => Promise<unknown>
): Promise<PullRequestsResult> {
  const setup = database.getSetupData();
  const { baseUrl, syncSecret } = getWebSyncConfig(setup);
  const result = await pullRequests({
    baseUrl,
    syncSecret,
    limit: 50
  });

  if (result.ok) {
    database.upsertRequests(result.requests);
    const requestIds = result.requests.map((request) => request.id);
    if (requestIds.length > 0) {
      const markResult = await markRequestsSynced({
        baseUrl,
        syncSecret,
        requestIds
      });

      if (markResult.ok) {
        database.markLocalRequestsSynced(requestIds);
      } else {
        database.recordSyncEvent({
          direction: "push",
          entityType: "request",
          ok: false,
          message: markResult.message,
          ...(markResult.status !== undefined ? { status: markResult.status } : {})
        });
      }
    }
    database.recordSyncEvent({
      direction: "pull",
      entityType: "request",
      ok: true,
      recordCount: result.count
    });
  } else {
    database.recordSyncEvent({
      direction: "pull",
      entityType: "request",
      ok: false,
      message: result.message,
      ...(result.status !== undefined ? { status: result.status } : {})
    });
  }

  if (result.ok) {
    await afterSuccessfulPull?.();
  }

  return result;
}

export async function markRequestsSyncedOnWeb(
  database: DesktopDatabase,
  requestIds: string[]
): Promise<MarkRequestsSyncedResult> {
  const setup = database.getSetupData();
  const syncConfig = getWebSyncConfig(setup);
  const result = await markRequestsSynced({
    ...syncConfig,
    requestIds
  });
  database.recordSyncEvent({
    direction: "push",
    entityType: "request",
    ok: result.ok,
    recordCount: result.ok ? result.updated_count : 0,
    message: result.ok ? result.message : result.message,
    ...(!result.ok && result.status !== undefined ? { status: result.status } : {})
  });

  return result;
}

export async function pushMenuToWeb(database: DesktopDatabase, coordinator: SyncCoordinator): Promise<PushMenuResult> {
  const runtime = database.getSyncRuntimeStatus();
  const clientId = runtime.clientId.trim();

  if (!clientId) {
    const result: PushMenuResult = {
      ok: false,
      message: "Masaüstü senkron kimliği oluşturulamadı."
    };
    database.recordSyncEvent({
      direction: "push",
      entityType: "menu",
      ok: false,
      message: result.message
    });
    return result;
  }

  const result = await coordinator.publishMenuNow();

  if (result.ok) {
    database.recordSyncEvent({
      direction: "push",
      entityType: "menu",
      ok: true,
      recordCount: result.category_count + result.item_count
    });
  } else {
    database.recordSyncEvent({
      direction: "push",
      entityType: "menu",
      ok: false,
      message: result.message,
      ...(result.status !== undefined ? { status: result.status } : {})
    });
  }

  return result;
}
