import {
  BUSINESS_CAPABILITIES,
  hasBusinessCapability
} from "@yardimci-asistan/shared";
import {
  markAndroidActionResult,
  pullAndroidActions,
  type SyncTransport
} from "@yardimci-asistan/sync-core";
import type { DesktopDatabase, DesktopDashboardData } from "./database";
import { getWebSyncConfig } from "./sync-config";
import { archiveAndroidProductImage } from "./product-data-service";

export interface AndroidActionProcessSummary {
  pulled: number;
  applied: number;
  failed: number;
  devicesChanged: number;
  error: string;
}

type AndroidActionTransport = Pick<SyncTransport, "pullAndroidActions" | "completeAndroidAction">;
const emptySummary = (): AndroidActionProcessSummary => ({ pulled: 0, applied: 0, failed: 0, devicesChanged: 0, error: "" });

type AndroidActionSyncServiceOptions = {
  database: DesktopDatabase;
  isSuspended: () => boolean;
  markLocalSnapshotDirty: () => void;
  notifyDashboardChanged: (dashboardData: DesktopDashboardData) => void;
  onActionCommitted?: () => void;
};

export class AndroidActionSyncService {
  private readonly database: DesktopDatabase;
  private readonly isSuspended: () => boolean;
  private readonly markLocalSnapshotDirty: () => void;
  private readonly notifyDashboardChanged:
    (dashboardData: DesktopDashboardData) => void;
  private readonly onActionCommitted: (() => void) | undefined;

  private inFlight: Promise<AndroidActionProcessSummary> | null = null;
  private suspended = false;

  constructor(options: AndroidActionSyncServiceOptions) {
    this.database = options.database;
    this.isSuspended = options.isSuspended;
    this.markLocalSnapshotDirty = options.markLocalSnapshotDirty;
    this.notifyDashboardChanged = options.notifyDashboardChanged;
    this.onActionCommitted = options.onActionCommitted;
  }

  currentInFlight() {
    return this.inFlight;
  }

  resume() { this.suspended = false; }

  async suspendAndDrain() {
    this.suspended = true;
    if (this.inFlight) await Promise.allSettled([this.inFlight]);
  }

  processQueue(
    allowPlaceholderSecret: boolean,
    transport?: AndroidActionTransport
  ): Promise<AndroidActionProcessSummary> {
    if (this.suspended || this.isSuspended()) {
      return Promise.resolve(emptySummary());
    }
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.processQueueOnce(allowPlaceholderSecret, transport)
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private canUseSync(allowPlaceholderSecret: boolean, transport?: AndroidActionTransport) {
    if (!hasBusinessCapability(this.database.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.ANDROID)) return false;
    // Automatic transport already passed the coordinator's sync configuration gate.
    if (transport) return true;
    const setup = this.database.getSetupData();
    const { baseUrl, syncSecret } = getWebSyncConfig(setup);
    return Boolean(baseUrl.trim())
      && Boolean(syncSecret.trim())
      && (
        allowPlaceholderSecret
        || syncSecret.trim() !== "change-this-secret"
      );
  }

  private async processQueueOnce(
    allowPlaceholderSecret: boolean,
    transport?: AndroidActionTransport
  ): Promise<AndroidActionProcessSummary> {
    const summary = emptySummary();

    if (!this.canUseSync(allowPlaceholderSecret, transport)) {
      return summary;
    }

    const syncConfig = getWebSyncConfig(this.database.getSetupData());
    const ingress = transport ?? {
      pullAndroidActions: ({ limit }: { limit?: number } = {}) => pullAndroidActions({ ...syncConfig, limit: limit ?? 100 }),
      completeAndroidAction: (input: Parameters<AndroidActionTransport["completeAndroidAction"]>[0]) => markAndroidActionResult({ ...syncConfig, ...input })
    };
    const pullResult = await ingress.pullAndroidActions({ limit: 100 });

    if (!pullResult.ok) {
      summary.error = pullResult.message;
      this.database.recordSyncEvent({
        direction: "pull",
        entityType: "android_action",
        ok: false,
        message: pullResult.message,
        ...(pullResult.status !== undefined ? { status: pullResult.status } : {})
      });
      return summary;
    }

    summary.devicesChanged =
      this.database.upsertAndroidDeviceSightings(pullResult.devices ?? []);
    summary.pulled = pullResult.count;

    for (const action of pullResult.actions) {
      const applyResult = this.database.applyAndroidAction(action);
      if (applyResult.ok) this.onActionCommitted?.();
      this.database.recordAndroidActionResult(action, applyResult);
      if (applyResult.ok && action.action_type === "market_product_create") {
        await archiveAndroidProductImage(this.database.databasePath, action);
      }

      const markResult = await ingress.completeAndroidAction({
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
        // Preserve committed receipts and continue independent actions. A later pull
        // replays the same action safely when its ACK did not reach Hosting.
        summary.error ||= markResult.message;
        this.database.recordSyncEvent({
          direction: "push",
          entityType: "android_action_result",
          ok: false,
          message: markResult.message,
          ...(markResult.status !== undefined ? { status: markResult.status } : {})
        });
      }
    }

    this.database.recordSyncEvent({
      direction: "pull",
      entityType: "android_action",
      ok: !summary.error,
      recordCount: summary.pulled,
      message:
        `${summary.applied} telefon işlemi uygulandı, ${summary.failed} işlem uygulanamadı.`
    });

    if (
      summary.applied > 0
      || summary.failed > 0
      || summary.devicesChanged > 0
    ) {
      this.markLocalSnapshotDirty();
      this.notifyDashboardChanged(this.database.getDashboardData());
      this.database.queueSyncJob("android_snapshot");
    }

    return summary;
  }
}
