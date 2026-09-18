import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  MarkRequestsSyncedResult,
  PullRequestsResult,
  PushAiSettingsResult,
  PushAndroidSnapshotResult,
  PushMenuResult
} from "@yardimci-asistan/sync-core";
import type { AutomaticSyncCycleResult, AutomaticSyncStatus, SyncCoordinator } from "../sync-coordinator";
import type { DesktopDatabase } from "../database";
import {
  markRequestsSyncedOnWeb,
  pullRequestsFromWeb,
  pushMenuToWeb
} from "../sync-request-menu-service";

export function registerSyncIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  getCoordinator: () => SyncCoordinator;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  afterSuccessfulPull: () => Promise<unknown>;
  publishAndroidSnapshot: () => Promise<PushAndroidSnapshotResult>;
  publishAiSettings: () => Promise<PushAiSettingsResult>;
}) {
  const {
    getDatabase,
    getCoordinator,
    assertCapability,
    afterSuccessfulPull,
    publishAndroidSnapshot,
    publishAiSettings
  } = options;

  ipcMain.handle("sync:getStatus", (): AutomaticSyncStatus => {
    return getCoordinator().getStatus();
  });

  ipcMain.handle("sync:runNow", async (): Promise<AutomaticSyncCycleResult> => {
    return getCoordinator().runNow();
  });

  ipcMain.handle("sync:setAutoEnabled", (_event, enabled: unknown): AutomaticSyncStatus => {
    return getCoordinator().setEnabled(enabled === true);
  });

  ipcMain.handle("sync:pullRequests", async (): Promise<PullRequestsResult> => {
    return pullRequestsFromWeb(getDatabase(), afterSuccessfulPull);
  });

  ipcMain.handle("sync:markRequestsSynced", async (_event, requestIds: string[]): Promise<MarkRequestsSyncedResult> => {
    return markRequestsSyncedOnWeb(getDatabase(), requestIds);
  });

  ipcMain.handle("sync:pushMenu", async (): Promise<PushMenuResult> => {
    assertCapability(BUSINESS_CAPABILITIES.QR_MENU, "QR menü yayını bu işletmede etkin değil.");
    return pushMenuToWeb(getDatabase());
  });

  ipcMain.handle("sync:pushAndroidSnapshot", async (): Promise<PushAndroidSnapshotResult> => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android yayını bu işletmede etkin değil.");
    return publishAndroidSnapshot();
  });

  ipcMain.handle("sync:pushAiSettings", async (): Promise<PushAiSettingsResult> => {
    return publishAiSettings();
  });
}
