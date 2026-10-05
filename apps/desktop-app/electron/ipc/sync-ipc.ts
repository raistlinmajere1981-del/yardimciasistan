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
  assertUnlocked: () => void;
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
    // Read-only transport status remains available to the locked shell.
    return getCoordinator().getStatus();
  });

  ipcMain.handle("sync:runNow", async (): Promise<AutomaticSyncCycleResult> => {
    options.assertUnlocked();
    return getCoordinator().runNow();
  });

  ipcMain.handle("sync:setAutoEnabled", (_event, enabled: unknown): AutomaticSyncStatus => {
    options.assertUnlocked();
    return getCoordinator().setEnabled(enabled === true);
  });

  ipcMain.handle("sync:pullRequests", async (): Promise<PullRequestsResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.REQUESTS, "Müşteri talepleri bu işletmede etkin değil.");
    return pullRequestsFromWeb(getDatabase(), afterSuccessfulPull);
  });

  ipcMain.handle("sync:markRequestsSynced", async (_event, requestIds: string[]): Promise<MarkRequestsSyncedResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.REQUESTS, "Müşteri talepleri bu işletmede etkin değil.");
    return markRequestsSyncedOnWeb(getDatabase(), requestIds);
  });

  ipcMain.handle("sync:pushMenu", async (): Promise<PushMenuResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.QR_MENU, "QR menü yayını bu işletmede etkin değil.");
    return pushMenuToWeb(getDatabase());
  });

  ipcMain.handle("sync:pushAndroidSnapshot", async (): Promise<PushAndroidSnapshotResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android yayını bu işletmede etkin değil.");
    return publishAndroidSnapshot();
  });

  ipcMain.handle("sync:pushAiSettings", async (): Promise<PushAiSettingsResult> => {
    options.assertUnlocked();
    return publishAiSettings();
  });
}
