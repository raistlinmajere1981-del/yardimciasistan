import {
  BUSINESS_CAPABILITIES,
  hasBusinessCapability
} from "@yardimci-asistan/shared";
import {
  markAndroidActionResult,
  pullAndroidActions
} from "@yardimci-asistan/sync-core";
import type { DesktopDatabase, DesktopDashboardData } from "./database";
import { getWebSyncConfig } from "./sync-config";

export interface AndroidActionProcessSummary {
  pulled: number;
  applied: number;
  failed: number;
}

type AndroidActionSyncServiceOptions = {
  database: DesktopDatabase;
  isSuspended: () => boolean;
  markLocalSnapshotDirty: () => void;
  notifyDashboardChanged: (dashboardData: DesktopDashboardData) => void;
};

export class AndroidActionSyncService {
  private readonly database: DesktopDatabase;
  private readonly isSuspended: () => boolean;
  private readonly markLocalSnapshotDirty: () => void;
  private readonly notifyDashboardChanged:
    (dashboardData: DesktopDashboardData) => void;

  private inFlight: Promise<AndroidActionProcessSummary> | null = null;

  constructor(options: AndroidActionSyncServiceOptions) {
    this.database = options.database;
    this.isSuspended = options.isSuspended;
    this.markLocalSnapshotDirty = options.markLocalSnapshotDirty;
    this.notifyDashboardChanged = options.notifyDashboardChanged;
  }

  currentInFlight() {
    return this.inFlight;
  }

  processQueue(
    allowPlaceholderSecret: boolean
  ): Promise<AndroidActionProcessSummary> {
    if (this.isSuspended()) {
      return Promise.resolve({ pulled: 0, applied: 0, failed: 0 });
    }
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.processQueueOnce(allowPlaceholderSecret)
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private canUseSync(allowPlaceholderSecret: boolean) {
    const setup = this.database.getSetupData();
    const { baseUrl, syncSecret } = getWebSyncConfig(setup);
    return hasBusinessCapability(
      this.database.getEnabledBusinessCapabilities(),
      BUSINESS_CAPABILITIES.ANDROID
    )
      && Boolean(baseUrl.trim())
      && Boolean(syncSecret.trim())
      && (
        allowPlaceholderSecret
        || syncSecret.trim() !== "change-this-secret"
      );
  }

  private async processQueueOnce(
    allowPlaceholderSecret: boolean
  ): Promise<AndroidActionProcessSummary> {
    const summary: AndroidActionProcessSummary = {
      pulled: 0,
      applied: 0,
      failed: 0
    };

    if (!this.canUseSync(allowPlaceholderSecret)) {
      return summary;
    }

    const syncConfig = getWebSyncConfig(this.database.getSetupData());
    const pullResult = await pullAndroidActions({
      ...syncConfig,
      limit: 100
    });

    if (!pullResult.ok) {
      this.database.recordSyncEvent({
        direction: "pull",
        entityType: "android_action",
        ok: false,
        message: pullResult.message,
        status: pullResult.status
      });
      return summary;
    }

    const androidDevicesChanged =
      this.database.upsertAndroidDeviceSightings(pullResult.devices ?? []);
    summary.pulled = pullResult.count;

    for (const action of pullResult.actions) {
      const applyResult = this.database.applyAndroidAction(action);
      this.database.recordAndroidActionResult(action, applyResult);

      const markResult = await markAndroidActionResult({
        ...syncConfig,
        actionId: action.id,
        status: applyResult.ok ? "applied" : "failed",
        errorMessage: applyResult.ok ? "" : applyResult.message
      });

      if (applyResult.ok) {
        summary.applied += 1;
      } else {
        summary.failed += 1;
      }

      if (!markResult.ok) {
        this.database.recordSyncEvent({
          direction: "push",
          entityType: "android_action_result",
          ok: false,
          message: markResult.message,
          status: markResult.status
        });
      }
    }

    this.database.recordSyncEvent({
      direction: "pull",
      entityType: "android_action",
      ok: true,
      recordCount: summary.pulled,
      message:
        `${summary.applied} telefon işlemi uygulandı, ${summary.failed} işlem uygulanamadı.`
    });

    if (
      summary.applied > 0
      || summary.failed > 0
      || androidDevicesChanged > 0
    ) {
      this.markLocalSnapshotDirty();
      this.notifyDashboardChanged(this.database.getDashboardData());
      this.database.queueSyncJob("android_snapshot");
    }

    return summary;
  }
}
