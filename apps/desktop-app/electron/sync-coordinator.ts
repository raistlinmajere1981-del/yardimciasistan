import type { MarketingWebsitePublicationService } from "./marketing/website-publication";
import { DESKTOP_PUBLICATIONS } from "./desktop-publication-registry";
import { OnlineOrderIngressService } from "./online-order-ingress-service";
import { DealerWebOrderAccessRejected } from "./dealer-web-order-rejection";
import {
  PhpHostingSyncTransport,
  pushAiCatalog,
  pushRoomCatalog,
  pushTableCatalog,
  pushAvailability,
  pushMenu,
  pushAndroidSnapshot,
  pushOnlineCatalog,
  type AndroidOperationsSnapshot,
  type AndroidSyncAction,
  type SyncCapabilitiesSuccess,
  type SyncFailure,
  type PushMenuResult,
  type PushAndroidSnapshotResult,
  type SyncTransport
} from "@yardimci-asistan/sync-core";
import {
  BUSINESS_CAPABILITIES,
  hasBusinessCapability,
  type BusinessAiCatalog,
  type BusinessCapability,
  type RoomPublicCatalog,
  type TablePublicCatalog
} from "@yardimci-asistan/shared";
import {
  DesktopDatabase,
  type DesktopSyncJob,
  type DesktopSyncRuntimeStatus
} from "./database";
import { findCatalogProductByBarcode } from "./commerce-store";
import { createDiagnosticOperationId, desktopLog } from "./desktop-logger";
import { logWebFailure, safeWebTarget } from "./web-diagnostics";
import { archiveExternalProductImage } from "./product-data-service";
import { createPublicRoomAvailabilityPublication } from "./public-room-availability-publication";
import { publishDesktopProjection } from "./desktop-publication-service";
import { ensurePublicationSource } from "./publication-source-service";
import { publishBusinessAiContext } from "./business-ai-context-service";
import { publishSavedAiSettings } from "./ai-settings-publish-service";
import { publishGoogleReviewsSettings } from "./google-reviews-settings";

const NORMAL_PULL_INTERVAL_MS = 15_000;
const MARKET_BARCODE_FAST_PULL_INTERVAL_MS = 1_500;
const OUTBOX_SCAN_INTERVAL_MS = 1_000;
const INITIAL_SYNC_DELAY_MS = 1_500;
const DEBOUNCE_DELAY_MS = 750;
const MAX_PULL_PAGES = 20;
const SYNC_HTTP_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_SECONDS = [5, 15, 30, 60, 300] as const;
const REQUIRED_ANDROID_SYNC_FEATURES = ["android_device_sightings", "android_device_permissions"] as const;

/** @compiledSmoke Used via dist-electron by scripts/smoke-automatic-sync.mjs. */
export function supportsAndroidDevicePermissionSync(
  capabilities: Pick<SyncCapabilitiesSuccess, "features">
): boolean {
  return Array.isArray(capabilities.features)
    && REQUIRED_ANDROID_SYNC_FEATURES.every((feature) => capabilities.features.includes(feature));
}

export type AutomaticSyncPhase = "disabled" | "idle" | "syncing" | "success" | "offline" | "error";

export interface AutomaticSyncStatus extends DesktopSyncRuntimeStatus {
  phase: AutomaticSyncPhase;
  message: string;
}

export interface AutomaticSyncCycleResult {
  ok: boolean;
  message: string;
  pulledRequests: number;
  pulledActions: number;
  appliedActions: number;
  failedActions: number;
  publishedJobs: number;
  status: AutomaticSyncStatus;
}

export interface SyncCoordinatorOptions {
  database: DesktopDatabase;
  marketingWebsite?: MarketingWebsitePublicationService;
  onlineOrderIngress?: OnlineOrderIngressService;
  pullBusinessMessagingStatuses?: (config: { baseUrl: string; syncSecret: string }) => Promise<string>;
  getSyncConfig: () => { baseUrl: string; syncSecret: string };
  createAndroidSnapshot: () => AndroidOperationsSnapshot;
  createAiCatalog?: () => BusinessAiCatalog;
  createRoomCatalog?: () => RoomPublicCatalog;
  prepareRoomCatalog?: (
    config: { baseUrl: string; syncSecret: string },
    clientId: string
  ) => Promise<{ ok: boolean; message: string; uploaded?: number; status?: number }>;
  createTableCatalog?: () => TablePublicCatalog;
  prepareTableCatalog?: (
    config: { baseUrl: string; syncSecret: string },
    clientId: string
  ) => Promise<{ ok: boolean; message: string; uploaded?: number; status?: number }>;
  onDashboardChanged: () => void;
  onCommerceOrdersChanged?: () => void;
  onStatusChanged: (status: AutomaticSyncStatus) => void;
}

export class SyncCoordinator {
  private pullTimer: NodeJS.Timeout | null = null;
  private marketBarcodeFastPullTimer: NodeJS.Timeout | null = null;
  private outboxTimer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private inFlight: Promise<AutomaticSyncCycleResult> | null = null;
  // Serialization only. Intent, frozen bodies, retries and exact completion are
  // owned by the durable outbox; losing this map cannot lose publication work.
  private readonly outboxPublicationsInFlight = new Map<string, { sourceRevision: number; promise: Promise<unknown> }>();
  private phase: AutomaticSyncPhase = "idle";
  private message = "Otomatik senkron hazır.";
  private capabilitiesTarget = "";
  private webOrdersSupported = false;
  private businessMessagingStatusesSupported = false;
  private onlineCatalogSupported = false;
  private dealerAccessSupported = false;
  private nextPassiveRunAt = 0;
  private marketBarcodeFastPullActive = false;
  private availabilityHeartbeatSupported: boolean | null = null;
  private aiCatalogSupported: boolean | null = null;
  private roomCatalogSupported: boolean | null = null;
  private tableCatalogSupported: boolean | null = null;
  private suspendedForMaintenance = false;
  private activeOperationId = "";
  private activeCycleStartedAt = 0;
  private activeTargetUrl = "";

  constructor(private readonly options: SyncCoordinatorOptions) {}

  start() {
    this.suspendedForMaintenance = false;
    this.stop();
    this.aiCatalogSupported = null;
    this.roomCatalogSupported = null;
    this.tableCatalogSupported = null;
    this.emitStatus();
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      void this.run(false);
    }, INITIAL_SYNC_DELAY_MS);
    this.pullTimer = setInterval(() => {
      if (Date.now() >= this.nextPassiveRunAt) {
        void this.run(false);
      }
    }, NORMAL_PULL_INTERVAL_MS);
    this.outboxTimer = setInterval(() => {
      const runtime = this.options.database.getSyncRuntimeStatus();
      if ((runtime.enabled || this.restorePending())
          && Date.now() >= this.nextPassiveRunAt
          && this.options.database.getPendingSyncJobs().length > 0) {
        if (!this.inFlight && !this.debounceTimer) {
          this.scheduleSoon();
        }
      }
    }, OUTBOX_SCAN_INTERVAL_MS);
  }

  stop() {
    if (this.pullTimer) clearInterval(this.pullTimer);
    if (this.marketBarcodeFastPullTimer) clearInterval(this.marketBarcodeFastPullTimer);
    if (this.outboxTimer) clearInterval(this.outboxTimer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.pullTimer = null;
    this.marketBarcodeFastPullTimer = null;
    this.outboxTimer = null;
    this.initialTimer = null;
    this.debounceTimer = null;
    this.marketBarcodeFastPullActive = false;
  }

  async suspendAndDrain() {
    this.suspendedForMaintenance = true;
    this.stop();
    const active = this.inFlight;
    if (active) {
      try {
        await active;
      } catch {
        // run() already normalizes failures; maintenance only needs the cycle to finish.
      }
    }
    await Promise.allSettled([...this.outboxPublicationsInFlight.values()].map(item => item.promise));
    // A mutation may have tried to schedule work while the previous cycle was draining.
    this.stop();
  }

  restart() {
    const restoreMarketBarcodeFastPull = this.marketBarcodeFastPullActive;
    this.capabilitiesTarget = "";
    this.availabilityHeartbeatSupported = null;
    this.nextPassiveRunAt = 0;
    this.start();
    if (restoreMarketBarcodeFastPull) {
      this.setMarketBarcodeFastPullEnabled(true);
    }
  }

  scheduleSoon(delayMs = DEBOUNCE_DELAY_MS) {
    if (this.suspendedForMaintenance) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.run(false);
    }, Math.max(0, delayMs));
  }

  setEnabled(enabled: boolean): AutomaticSyncStatus {
    this.options.database.setAutoSyncEnabled(enabled);
    if (enabled) {
      this.nextPassiveRunAt = 0;
      this.phase = "idle";
      this.message = "Otomatik senkron açıldı.";
      this.scheduleSoon(0);
    } else {
      this.phase = "disabled";
      this.message = "Otomatik senkron kapalı.";
    }
    return this.emitStatus();
  }

  /**
   * Bounded hosting fallback used only while desktop Quick Sale explicitly
   * accepts phone scans. It shares run()'s in-flight promise and retry backoff,
   * so it cannot create overlapping sync cycles or an uncontrolled request loop.
   */
  setMarketBarcodeFastPullEnabled(enabled: boolean) {
    if (enabled === this.marketBarcodeFastPullActive) {
      return this.marketBarcodeFastPullState();
    }
    this.marketBarcodeFastPullActive = enabled;
    if (this.marketBarcodeFastPullTimer) {
      clearInterval(this.marketBarcodeFastPullTimer);
      this.marketBarcodeFastPullTimer = null;
    }
    if (enabled) {
      this.scheduleSoon(0);
      this.marketBarcodeFastPullTimer = setInterval(() => {
        if (Date.now() >= this.nextPassiveRunAt) {
          void this.run(false);
        }
      }, MARKET_BARCODE_FAST_PULL_INTERVAL_MS);
    }
    return this.marketBarcodeFastPullState();
  }

  private marketBarcodeFastPullState() {
    return {
      active: this.marketBarcodeFastPullActive,
      intervalMs: MARKET_BARCODE_FAST_PULL_INTERVAL_MS,
      transport: "hosting" as const
    };
  }

  getStatus(): AutomaticSyncStatus {
    const runtime = this.options.database.getSyncRuntimeStatus();
    if (!runtime.enabled && !this.restorePending() && this.phase !== "syncing") {
      return { ...runtime, phase: "disabled", message: "Otomatik senkron kapalı." };
    }
    return { ...runtime, phase: this.phase, message: this.message };
  }

  runNow(): Promise<AutomaticSyncCycleResult> {
    return this.run(true);
  }

  async publishMenuNow(): Promise<PushMenuResult> {
    const config = this.options.getSyncConfig();
    this.options.database.ensurePublicationTarget(config.baseUrl.trim().replace(/\/+$/, ""));
    this.options.database.prepareSyncPublication("menu_publish", this.options.database.getQrMenuPublication(), true);
    const job = this.options.database.getPendingSyncJobs().find(item => item.jobType === "menu_publish");
    if (!job || this.suspendedForMaintenance) return { ok: false, message: "Menü yayın niyeti hazırlanamadı." };
    return await this.publishMenuJob(job) ?? { ok: false, message: "Menü yayın niyeti hazırlanamadı." };
  }

  async publishAndroidSnapshotNow(): Promise<PushAndroidSnapshotResult> {
    const config = this.options.getSyncConfig();
    const snapshot = this.options.createAndroidSnapshot();
    this.options.database.ensurePublicationTarget(config.baseUrl.trim().replace(/\/+$/, ""));
    this.options.database.prepareSyncPublication("android_snapshot", snapshot, true);
    const job = this.options.database.getPendingSyncJobs().find(item => item.jobType === "android_snapshot");
    if (!job || this.suspendedForMaintenance) return { ok: false, message: "Android yayın niyeti hazırlanamadı." };
    const result: PushAndroidSnapshotResult = await this.publishAndroidSnapshotJob(job) ?? { ok: false, message: "Android yayın niyeti hazırlanamadı." };
    this.options.database.recordSyncEvent({ direction: "push", entityType: "android_snapshot", ok: result.ok,
      recordCount: result.ok ? result.task_count + snapshot.requests.length + snapshot.rooms.length + snapshot.tables.length : 0,
      message: result.message, status: result.ok ? undefined : result.status });
    return result;
  }

  private async publishSerializedOutboxJob<R>(job: DesktopSyncJob, publish: (current: DesktopSyncJob) => Promise<R | null>): Promise<R | null> {
    const active = this.outboxPublicationsInFlight.get(job.jobKey);
    if (active) {
      const result = await active.promise as R | null;
      const newer = this.options.database.getPendingSyncJobs().find(item => item.jobKey === job.jobKey && item.sourceRevision > active.sourceRevision);
      return newer ? this.publishSerializedOutboxJob(newer, publish) : result;
    }
    if (this.suspendedForMaintenance) return null;
    const publication = publish(job).finally(() => { this.outboxPublicationsInFlight.delete(job.jobKey); });
    this.outboxPublicationsInFlight.set(job.jobKey, { sourceRevision: job.sourceRevision, promise: publication });
    return publication;
  }

  private publishMenuJob(job: DesktopSyncJob): Promise<PushMenuResult | null> {
    return this.publishSerializedOutboxJob(job, current => {
      const config = this.options.getSyncConfig();
      return publishDesktopProjection(this.options.database, config, "menu_publish", this.options.database.getQrMenuPublication(),
        (identity, menu) => pushMenu({ ...config, ...identity, menu }),
        { expectedRevision: current.sourceRevision, nextAttemptAt: calculateNextAttempt(current.attemptCount),
          acknowledge: sent => this.options.database.markMenuPublished(sent) });
    });
  }

  private publishAndroidSnapshotJob(job: DesktopSyncJob): Promise<PushAndroidSnapshotResult | null> {
    return this.publishSerializedOutboxJob(job, current => {
      const config = this.options.getSyncConfig();
      return publishDesktopProjection(this.options.database, config, "android_snapshot", this.options.createAndroidSnapshot(),
        (identity, snapshot) => pushAndroidSnapshot({ ...config, ...identity, snapshot }),
        { expectedRevision: current.sourceRevision, nextAttemptAt: calculateNextAttempt(current.attemptCount) });
    });
  }

  private run(force: boolean): Promise<AutomaticSyncCycleResult> {
    if (this.suspendedForMaintenance) {
      const message = "Senkron veri bakımı için duraklatıldı.";
      return Promise.resolve(this.result(true, message, {
        pulledRequests: 0,
        pulledActions: 0,
        appliedActions: 0,
        failedActions: 0,
        publishedJobs: 0
      }));
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.runCycle(force)
      .catch((error) => {
        const message = "Senkron tamamlanamadı. Biraz sonra yeniden denenecek.";
        desktopLog.error({
          scope: "sync",
          event: "sync.cycle.crashed",
          message: "Senkron döngüsü beklenmedik bir hatayla kesildi.",
          operationId: this.activeOperationId,
          meta: {
            target: safeWebTarget(this.activeTargetUrl),
            durationMs: this.activeCycleStartedAt ? Date.now() - this.activeCycleStartedAt : 0
          },
          error
        });
        const runtime = this.options.database.getSyncRuntimeStatus();
        this.options.database.recordAutomaticSyncFailure(message);
        this.deferPassiveRetry(runtime.consecutiveFailures);
        this.phase = "error";
        this.message = message;
        return this.result(false, message, {
          pulledRequests: 0,
          pulledActions: 0,
          appliedActions: 0,
          failedActions: 0,
          publishedJobs: 0
        });
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async runCycle(force: boolean): Promise<AutomaticSyncCycleResult> {
    const runtime = this.options.database.getSyncRuntimeStatus();
    const empty = { pulledRequests: 0, pulledActions: 0, appliedActions: 0, failedActions: 0, publishedJobs: 0 };
    if (!runtime.enabled && !force && !this.restorePending()) {
      this.phase = "disabled";
      this.message = "Otomatik senkron kapalı.";
      return this.result(true, this.message, empty);
    }

    const config = this.options.getSyncConfig();
    if (!isUsableSyncConfig(config)) {
      this.nextPassiveRunAt = Date.now() + 60_000;
      this.phase = "idle";
      this.message = "Otomatik senkron için web modül adresi ve güvenlik anahtarı gerekli.";
      return this.result(false, this.message, empty);
    }

    const clientId = runtime.clientId;
    if (!clientId) {
      this.nextPassiveRunAt = Date.now() + 60_000;
      this.phase = "error";
      this.message = "Masaüstü senkron kimliği oluşturulamadı.";
      return this.result(false, this.message, empty);
    }

    this.activeOperationId = createDiagnosticOperationId("sync");
    this.activeCycleStartedAt = Date.now();
    this.activeTargetUrl = config.baseUrl;
    desktopLog.info({
      scope: "sync",
      event: "sync.cycle.started",
      message: "Otomatik senkron döngüsü başlatıldı.",
      operationId: this.activeOperationId,
      meta: {
        target: safeWebTarget(config.baseUrl),
        force,
        consecutiveFailures: runtime.consecutiveFailures
      }
    });

    const runtimeFetch = globalThis.fetch;
    this.phase = "syncing";
    this.message = "Web, masaüstü ve Android verileri eşitleniyor...";
    this.options.database.recordSyncAttempt();
    this.emitStatus();
    const boundedConfig = { ...config, ...(runtimeFetch ? { fetchImpl: createSyncFetchWithTimeout(runtimeFetch) } : {}) };
    const source = await ensurePublicationSource(this.options.database, boundedConfig);
    if (!source.ok) {
      this.options.database.recordAutomaticSyncFailure(source.message);
      this.deferPassiveRetry(runtime.consecutiveFailures);
      this.phase = classifyFailurePhase(source);
      this.message = source.message;
      return this.result(false, source.message, empty);
    }
    const transport = new PhpHostingSyncTransport({
      ...config,
      clientId,
      sourceEpoch: source.sourceEpoch,
      ...(runtimeFetch ? { fetchImpl: createSyncFetchWithTimeout(runtimeFetch) } : {})
    });
    const enabledCapabilities = this.options.database.getEnabledBusinessCapabilities();
    const androidEnabled = hasBusinessCapability(enabledCapabilities, BUSINESS_CAPABILITIES.ANDROID);
    const requestsEnabled = hasBusinessCapability(enabledCapabilities, BUSINESS_CAPABILITIES.REQUESTS);

    const counts = { ...empty };
    const errors: string[] = [];
    const targetKey = `${config.baseUrl}\u0000${clientId}\u0000android:${androidEnabled ? "1" : "0"}`;
    if (this.capabilitiesTarget !== targetKey) {
      const capabilities = await transport.getCapabilities();
      const missingAndroidCapabilities = capabilities.ok
        && androidEnabled
        && !supportsAndroidDevicePermissionSync(capabilities);
      if (!capabilities.ok
           || capabilities.protocol_version < 3
          || capabilities.storage !== "sqlite"
          || missingAndroidCapabilities) {
        const message = !capabilities.ok
          ? capabilities.message
          : missingAndroidCapabilities
            ? "Web modülü Android cihaz yetkilerini desteklemiyor. Hosting paketini güncelleyin."
            : "Web modülü otomatik senkron protokolünü desteklemiyor. Hosting paketini güncelleyin.";
        this.options.database.recordAutomaticSyncFailure(message);
        this.deferPassiveRetry(runtime.consecutiveFailures);
        this.phase = classifyFailurePhase(capabilities.ok ? undefined : capabilities);
        this.message = message;
        if (!capabilities.ok) {
          this.logSyncFailure("capabilities", capabilities);
        } else {
          this.logSyncFailure("capabilities", {
            message,
            error: "protocol_mismatch"
          }, {
            protocolVersion: capabilities.protocol_version,
            storage: capabilities.storage,
            missingAndroidCapabilities
          });
        }
        return this.result(false, message, counts);
      }
      this.webOrdersSupported = capabilities.features.includes("web_orders_v1");
      this.businessMessagingStatusesSupported = capabilities.features.includes("business_messaging_status_v1");
      this.onlineCatalogSupported = capabilities.features.includes("online_catalog_v1");
      this.dealerAccessSupported = capabilities.features.includes("dealer_access_v1");
      this.capabilitiesTarget = targetKey;
    }

    if (this.businessMessagingStatusesSupported && this.options.pullBusinessMessagingStatuses) {
      const failure = await this.options.pullBusinessMessagingStatuses(config);
      if (failure) errors.push(failure);
    }

    let dashboardChanged = false;
    const restore = this.options.database.getRestoreReconciliationStatus();
    const replayRequests = restore?.state === "reconciliation_pending" && !restore.requestsComplete;
    const replayOrders = restore?.state === "reconciliation_pending" && !restore.ordersComplete;
    if (requestsEnabled || replayRequests) {
      const requestResult = await this.pullRequestPages(transport);
      counts.pulledRequests = requestResult.count;
      dashboardChanged ||= requestResult.count > 0;
      if (requestResult.error) {
        errors.push(requestResult.error);
      }
    }

    if (this.webOrdersSupported
        && (replayOrders || hasBusinessCapability(enabledCapabilities, BUSINESS_CAPABILITIES.ONLINE_SALES)
          || hasBusinessCapability(enabledCapabilities, BUSINESS_CAPABILITIES.WHOLESALE))) {
      const orderResult = await this.pullWebOrderPages(transport);
      dashboardChanged ||= orderResult.count > 0;
      if (orderResult.count > 0) this.options.onCommerceOrdersChanged?.();
      if (orderResult.error) errors.push(orderResult.error);
    }

    const actionResult = await this.processAndroidActions(transport);
    counts.pulledActions = actionResult.pulled;
    counts.appliedActions = actionResult.applied;
    counts.failedActions = actionResult.failed;
    dashboardChanged ||= actionResult.applied > 0 || actionResult.failed > 0 || actionResult.devicesChanged > 0;
    if (actionResult.error) {
      errors.push(actionResult.error);
    }

    if (requestsEnabled || replayRequests) {
      const acknowledgementError = await this.acknowledgeImportedRequests(transport);
      if (acknowledgementError) {
        errors.push(acknowledgementError);
      }
    }

    const availabilityError = await this.publishAvailabilityHeartbeat(config, enabledCapabilities);
    if (availabilityError) {
      errors.push(availabilityError);
    }

    const roomCatalogError = await this.publishRoomCatalogIfChanged(config, clientId);
    if (roomCatalogError) {
      errors.push(roomCatalogError);
    }

    const tableCatalogError = await this.publishTableCatalogIfChanged(config, clientId);
    if (tableCatalogError) {
      errors.push(tableCatalogError);
    }

    const aiCatalogError = await this.publishAiCatalogIfChanged(config);
    if (aiCatalogError) {
      errors.push(aiCatalogError);
    }

    const context = await publishBusinessAiContext(this.options.database, boundedConfig, false);
    if (context && !context.ok) errors.push(context.message);
    // AI configuration is reconstructed after a settings mutation; an untouched,
    // unconfigured install is not an automatic provider activation operation.
    if (this.options.database.getPendingSyncJobs().some((job) => job.jobType === "ai_settings_publish")) {
      const settings = await publishSavedAiSettings(this.options.database, boundedConfig, false);
      if (settings && !settings.ok) errors.push(settings.message);
    }
    if (this.options.database.getPendingSyncJobs().some((job) => job.jobType === "google_reviews_settings_publish")) {
      const reviews = await publishGoogleReviewsSettings(this.options.database, boundedConfig, clientId, false);
      if (!reviews.ok) errors.push(reviews.message);
    }

    const publicationResult = await this.publishOutbox(transport);
    counts.publishedJobs = publicationResult.published;
    errors.push(...publicationResult.errors);

    if (dashboardChanged) {
      this.options.onDashboardChanged();
    }

    if (errors.length === 0) {
      this.options.database.recordAutomaticSyncSuccess();
      this.nextPassiveRunAt = 0;
      this.phase = "success";
      this.message = this.restorePending() ? "Yerel geri yükleme tamamlandı; Web reconciliation bekliyor." : buildSuccessMessage(counts);
      desktopLog.info({
        scope: "sync",
        event: "sync.cycle.completed",
        message: "Otomatik senkron döngüsü tamamlandı.",
        operationId: this.activeOperationId,
        meta: {
          target: safeWebTarget(config.baseUrl),
          durationMs: Date.now() - this.activeCycleStartedAt,
          ...counts
        }
      });
      return this.result(true, this.message, counts);
    }

    const uniqueErrors = [...new Set(errors.filter(Boolean))];
    this.message = uniqueErrors[0] || "Senkron tamamlanamadı.";
    this.options.database.recordAutomaticSyncFailure(this.message);
    this.deferPassiveRetry(runtime.consecutiveFailures);
    this.phase = uniqueErrors.some(isConnectionFailureMessage) ? "offline" : "error";
    desktopLog.warn({
      scope: "sync",
      event: "sync.cycle.incomplete",
      message: "Otomatik senkron bazı adımları tamamlayamadı.",
      operationId: this.activeOperationId,
      meta: {
        target: safeWebTarget(config.baseUrl),
        durationMs: Date.now() - this.activeCycleStartedAt,
        errorCount: uniqueErrors.length,
        firstError: this.message,
        ...counts
      }
    });
    return this.result(false, this.message, counts);
  }

  private async pullWebOrderPages(transport: SyncTransport): Promise<{ count: number; error: string }> {
    const ingress = this.options.onlineOrderIngress ?? new OnlineOrderIngressService(this.options.database);
    let cursor = this.options.database.getSyncRuntimeStatus().webOrderCursor;
    let count = 0;
    let errorMessage = "";
    const restore = this.options.database.getRestoreReconciliationStatus();
    const replayThroughSeq = restore?.state === "reconciliation_pending" && !restore.ordersComplete ? restore.ordersThrough : undefined;
    let replayExhausted = false;
    try {
      for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
        const result = await transport.pullWebOrders({ afterSeq: cursor, limit: 100, replayThroughSeq });
        if (!result.ok) {
          this.logSyncFailure("web-orders-pull", result, { page, cursor });
          errorMessage = result.message;
          break;
        }
        for (const envelope of result.orders) {
          try {
            ingress.importOrder(envelope, cursor, replayThroughSeq !== undefined);
            count += 1;
          } catch (error) {
            if (!(error instanceof DealerWebOrderAccessRejected) || envelope.kind !== "dealer") throw error;
            this.options.database.recordRejectedDealerWebOrder(envelope.id, envelope.dealerAccessId, envelope.accessRevision);
            desktopLog.warn({ scope: "online-order-ingress", event: "dealer.order.ingress.rejected",
              message: "Geçersiz bayi erişimine ait sipariş taşıma kaydı reddedildi.", operationId: this.activeOperationId,
              meta: { accessId: envelope.dealerAccessId, webOrderId: envelope.id, category: "access_revoked" } });
          }
          cursor = envelope.syncSeq;
          this.options.database.recordWebOrderCursor(cursor);
        }
        if (!result.has_more) {
          replayExhausted = true;
          break;
        }
      }
    } catch (error) {
      errorMessage = "Web siparişi içe aktarılamadı. Yeniden denenecek.";
      desktopLog.error({
        scope: "online-order-ingress",
        event: "online-order-ingress.import.failed",
        message: errorMessage,
        operationId: this.activeOperationId,
        meta: { cursor, importedCount: count },
        error
      });
    }
    // Even on failure, acknowledge only the persisted successful prefix. Ack failure
    // leaves its own local cursor pending, so a later cycle retries the acknowledgement.
    const runtime = this.options.database.getSyncRuntimeStatus();
    if (runtime.webOrderCursor > runtime.webOrderAcknowledgedCursor) {
      const ack = await transport.acknowledgeWebOrders({ throughSeq: runtime.webOrderCursor });
      if (!ack.ok) {
        this.logSyncFailure("web-orders-ack", ack, { cursor: runtime.webOrderCursor });
        errorMessage ||= ack.message;
      } else if (ack.acknowledged_cursor !== runtime.webOrderCursor) {
        errorMessage ||= "Web sipariş onay cursor değeri geçersiz.";
        this.logSyncFailure("web-orders-ack", { message: errorMessage, error: "invalid_response" });
      } else {
        this.options.database.recordWebOrderCursor(ack.acknowledged_cursor, true);
      }
    }
    if (count > 0) {
      desktopLog.info({
        scope: "online-order-ingress",
        event: "online-order-ingress.import.completed",
        message: "Web siparişleri canonical siparişlere aktarıldı.",
        operationId: this.activeOperationId,
        meta: { importedCount: count, cursor }
      });
    }
    if (replayThroughSeq !== undefined && replayExhausted && !errorMessage) this.options.database.finishRestoreReplay("orders");
    return { count, error: errorMessage };
  }

  private async pullRequestPages(transport: SyncTransport): Promise<{ count: number; error: string }> {
    let count = 0;
    let cursor = this.options.database.getSyncRuntimeStatus().requestCursor;
    const restore = this.options.database.getRestoreReconciliationStatus();
    const replayThroughSeq = restore?.state === "reconciliation_pending" && !restore.requestsComplete ? restore.requestsThrough : undefined;
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const result = await transport.pullRequests({ afterSeq: cursor, limit: 100, replayThroughSeq });
      if (!result.ok) {
        this.options.database.recordSyncEvent({
          direction: "pull",
          entityType: "request",
          ok: false,
          message: result.message,
          status: result.status
        });
        this.logSyncFailure("requests-pull", result, { page, cursor });
        return { count, error: result.message };
      }
      if (typeof result.next_cursor !== "number") {
        const message = "Web modülü geçerli bir talep cursor değeri döndürmedi.";
        this.logSyncFailure("requests-pull", { message, error: "invalid_response" }, { page, cursor });
        return { count, error: message };
      }
      this.options.database.upsertRequests(result.requests, result.next_cursor);
      count += result.requests.length;
      cursor = result.next_cursor;
      if (!result.has_more) {
        if (replayThroughSeq !== undefined) {
          const error = await this.acknowledgeImportedRequests(transport);
          if (error) return { count, error };
          this.options.database.finishRestoreReplay("requests");
        }
        break;
      }
    }
    this.options.database.recordSyncEvent({
      direction: "pull",
      entityType: "request",
      ok: true,
      recordCount: count
    });
    return { count, error: "" };
  }

  private async acknowledgeImportedRequests(transport: SyncTransport): Promise<string> {
    const runtime = this.options.database.getSyncRuntimeStatus();
    if (runtime.requestCursor <= runtime.acknowledgedCursor) {
      return "";
    }
    const result = await transport.acknowledgeRequests({ throughSeq: runtime.requestCursor });
    if (!result.ok) {
      this.logSyncFailure("requests-ack", result, {
        requestCursor: runtime.requestCursor,
        acknowledgedCursor: runtime.acknowledgedCursor
      });
      return result.message;
    }
    this.options.database.acknowledgeRequestCursor(result.acknowledged_cursor);
    return "";
  }

  private async processAndroidActions(transport: SyncTransport): Promise<{
    pulled: number;
    applied: number;
    failed: number;
    devicesChanged: number;
    error: string;
  }> {
    const enabledCapabilities = this.options.database.getEnabledBusinessCapabilities();
    if (!hasBusinessCapability(enabledCapabilities, BUSINESS_CAPABILITIES.ANDROID)) {
      return { pulled: 0, applied: 0, failed: 0, devicesChanged: 0, error: "" };
    }
    const pulled = await transport.pullAndroidActions({ limit: 100 });
    if (!pulled.ok) {
      this.logSyncFailure("android-actions-pull", pulled);
      return { pulled: 0, applied: 0, failed: 0, devicesChanged: 0, error: pulled.message };
    }
    const devicesChanged = this.options.database.upsertAndroidDeviceSightings(pulled.devices ?? []);
    let applied = 0;
    let failed = 0;
    for (const action of pulled.actions) {
      const local = this.options.database.applyAndroidAction(action);
      this.options.database.recordAndroidActionResult(action, local);
      if (local.ok && action.action_type === "market_product_create") {
        await this.archiveAndroidProductImage(action);
      }
      const status = local.ok ? "applied" : "failed";
      const completion = await transport.completeAndroidAction({
        actionId: action.id,
        status,
        errorMessage: local.ok ? "" : local.message
      });
      if (!completion.ok) {
        this.logSyncFailure("android-action-complete", completion, {
          actionType: action.action_type
        });
        return { pulled: pulled.count, applied, failed, devicesChanged, error: completion.message };
      }
      if (local.ok) {
        applied += 1;
      } else {
        failed += 1;
      }
    }
    this.options.database.recordSyncEvent({
      direction: "pull",
      entityType: "android_action",
      ok: true,
      recordCount: pulled.count,
      message: `${applied} telefon işlemi uygulandı, ${failed} işlem reddedildi.`
    });
    return { pulled: pulled.count, applied, failed, devicesChanged, error: "" };
  }

  private async archiveAndroidProductImage(action: AndroidSyncAction): Promise<void> {
    const barcode = String(action.payload?.barcode ?? "").trim();
    const imageUrl = String(action.payload?.image_source_url ?? "").trim();
    const provider = String(action.payload?.data_source ?? "").trim();
    if (!barcode || !imageUrl || !provider) return;

    try {
      const product = findCatalogProductByBarcode(this.options.database.databasePath, barcode);
      if (!product || product.imageAssetPath) return;
      await archiveExternalProductImage(
        this.options.database.databasePath,
        product.id,
        provider,
        imageUrl
      );
    } catch (error) {
      desktopLog.warn({
        scope: "product-data",
        event: "product-data.image-archive.failed",
        message: "Android ürün görseli yerel arşive alınamadı.",
        meta: { barcode },
        error
      });
    }
  }

  private async publishAvailabilityHeartbeat(
    config: { baseUrl: string; syncSecret: string },
    enabledCapabilities: readonly BusinessCapability[]
  ): Promise<string> {
    if (this.availabilityHeartbeatSupported === false) {
      return "";
    }

    const runtimeFetch = globalThis.fetch;
    if (!runtimeFetch) {
      const message = "Canlı müsaitlik yayını için ağ istemcisi kullanılamıyor.";
      this.logSyncFailure("availability", { message, error: "fetch_unavailable" });
      return message;
    }

    const availability = createPublicRoomAvailabilityPublication(
      this.options.database.getPublicRoomAvailabilityInput(),
      enabledCapabilities
    );

    try {
      const boundedConfig = { ...config, fetchImpl: createSyncFetchWithTimeout(runtimeFetch) };
      const result = await publishDesktopProjection(this.options.database, boundedConfig, "public_room_availability_publish", availability,
        (identity, frozen) => pushAvailability({ ...boundedConfig, ...identity, availability: frozen }), { refresh: true });
      if (!result) return "";

      if (!result.ok && result.status === 404) {
        // Older hosting packages do not have the availability endpoint. Keep
        // existing sync healthy until the web module is upgraded.
        this.availabilityHeartbeatSupported = false;
        desktopLog.info({
          scope: "sync",
          event: "sync.availability.unsupported",
          message: "Canlı müsaitlik endpoint'i bu hosting sürümünde yok.",
          operationId: this.activeOperationId,
          meta: { target: safeWebTarget(config.baseUrl), status: 404 }
        });
        return "";
      }

      if (!result.ok) {
        const message = result.message;
        this.logSyncFailure("availability", result);
        return message;
      }

      this.availabilityHeartbeatSupported = true;
      return "";
    } catch (error) {
      const message = "Canlı müsaitlik yayını sırasında web modülüne ulaşılamadı.";
      this.logSyncFailure("availability", {
        message,
        error: error instanceof Error ? error.message : String(error)
      }, {
        endpoint: safeWebTarget(config.baseUrl)
      });
      return message;
    }
  }

  private async publishRoomCatalogIfChanged(
    config: { baseUrl: string; syncSecret: string },
    clientId: string
  ): Promise<string> {
    if (this.roomCatalogSupported === false) return "";

    let catalog = this.options.createRoomCatalog?.() ?? { version: 1, enabled: false, updatedAt: "", rooms: [] };
    if (catalog.enabled) {
      const preparation = await this.options.prepareRoomCatalog?.(config, clientId);
      if (preparation && !preparation.ok) {
        this.logSyncFailure("room-catalog-prepare", {
          status: preparation.status,
          message: preparation.message
        });
        if ([400, 404, 405].includes(preparation.status ?? 0)) {
          this.roomCatalogSupported = false;
          return "";
        }
        return preparation.message;
      }
      if (preparation?.uploaded) {
        catalog = this.options.createRoomCatalog?.() ?? catalog;
      }
    }


    const runtimeFetch = globalThis.fetch;
    const boundedConfig = { ...config, ...(runtimeFetch ? { fetchImpl: createSyncFetchWithTimeout(runtimeFetch) } : {}) };
    const result = await publishDesktopProjection(this.options.database, boundedConfig, "room_catalog_publish", catalog,
      (identity, frozen) => pushRoomCatalog({ ...boundedConfig, ...identity, catalog: frozen }));
    if (!result) return "";

    if (result.ok) {
      this.roomCatalogSupported = true;
      this.options.database.recordSyncEvent({
        direction: "push",
        entityType: "room_catalog",
        ok: true,
        recordCount: result.room_count,
        message: result.message
      });
      return "";
    }

    if ([400, 404, 405].includes(result.status ?? 0)) {
      this.logSyncFailure("room-catalog", result);
      this.roomCatalogSupported = false;
      return "";
    }

    this.logSyncFailure("room-catalog", result);
    this.options.database.recordSyncEvent({
      direction: "push",
      entityType: "room_catalog",
      ok: false,
      recordCount: 0,
      message: result.message,
      status: result.status
    });
    return result.message;
  }

  private async publishTableCatalogIfChanged(
    config: { baseUrl: string; syncSecret: string },
    clientId: string
  ): Promise<string> {
    if (this.tableCatalogSupported === false) return "";

    let catalog = this.options.createTableCatalog?.() ?? { version: 1, enabled: false, updatedAt: "", tables: [] };
    if (catalog.enabled) {
      const preparation = await this.options.prepareTableCatalog?.(config, clientId);
      if (preparation && !preparation.ok) {
        this.logSyncFailure("table-catalog-prepare", {
          status: preparation.status,
          message: preparation.message
        });
        if ([400, 404, 405].includes(preparation.status ?? 0)) {
          this.tableCatalogSupported = false;
          return "";
        }
        return preparation.message;
      }
      if (preparation?.uploaded) {
        catalog = this.options.createTableCatalog?.() ?? catalog;
      }
    }


    const runtimeFetch = globalThis.fetch;
    const boundedConfig = { ...config, ...(runtimeFetch ? { fetchImpl: createSyncFetchWithTimeout(runtimeFetch) } : {}) };
    const result = await publishDesktopProjection(this.options.database, boundedConfig, "table_catalog_publish", catalog,
      (identity, frozen) => pushTableCatalog({ ...boundedConfig, ...identity, catalog: frozen }));
    if (!result) return "";

    if (result.ok) {
      this.tableCatalogSupported = true;
      this.options.database.recordSyncEvent({
        direction: "push",
        entityType: "table_catalog",
        ok: true,
        recordCount: result.table_count,
        message: result.message
      });
      return "";
    }

    if ([400, 404, 405].includes(result.status ?? 0)) {
      this.logSyncFailure("table-catalog", result);
      this.tableCatalogSupported = false;
      return "";
    }

    this.logSyncFailure("table-catalog", result);
    this.options.database.recordSyncEvent({
      direction: "push",
      entityType: "table_catalog",
      ok: false,
      recordCount: 0,
      message: result.message,
      status: result.status
    });
    return result.message;
  }

  private async publishAiCatalogIfChanged(config: { baseUrl: string; syncSecret: string }): Promise<string> {
    if (this.aiCatalogSupported === false) return "";

    const catalog = this.options.createAiCatalog?.() ?? { version: 1, updatedAt: "", items: [] };

    const runtimeFetch = globalThis.fetch;
    const boundedConfig = { ...config, ...(runtimeFetch ? { fetchImpl: createSyncFetchWithTimeout(runtimeFetch) } : {}) };
    const result = await publishDesktopProjection(this.options.database, boundedConfig, "ai_catalog_publish", catalog,
      (identity, frozen) => pushAiCatalog({ ...boundedConfig, ...identity, catalog: frozen }));
    if (!result) return "";

    if (result.ok) {
      this.aiCatalogSupported = true;
      this.options.database.recordSyncEvent({
        direction: "push",
        entityType: "ai_catalog",
        ok: true,
        recordCount: result.item_count,
        message: result.message
      });
      return "";
    }

    if ([400, 404, 405].includes(result.status ?? 0)) {
      this.logSyncFailure("ai-catalog", result);
      this.aiCatalogSupported = false;
      return "";
    }

    this.logSyncFailure("ai-catalog", result);
    this.options.database.recordSyncEvent({
      direction: "push",
      entityType: "ai_catalog",
      ok: false,
      recordCount: 0,
      message: result.message,
      status: result.status
    });
    return result.message;
  }

  private async publishOutbox(transport: SyncTransport): Promise<{ published: number; errors: string[] }> {
    const jobs = this.options.database.getPendingSyncJobs();
    const clientId = this.options.database.getSyncRuntimeStatus().clientId;
    const errors: string[] = [];
    let published = 0;
    for (const job of jobs) {
      // Derived/config publishers above share this outbox but own preparation.
      if (DESKTOP_PUBLICATIONS[job.jobType].publisher !== "outbox") continue;
      if (job.jobType === "online_catalog_publish" && !this.onlineCatalogSupported) {
        // Retain the durable invalidation without turning the outbox scan into a hot loop.
        this.options.database.failSyncJob(job.jobKey, job.sourceRevision,
          "Web modülü online ürün kataloğunu desteklemiyor.", new Date(Date.now() + 300_000).toISOString());
        continue;
      }
      if (job.jobType === "dealer_access_publish" && (!this.dealerAccessSupported || !transport.publishDealerAccess)) {
        this.options.database.failSyncJob(job.jobKey, job.sourceRevision,
          "Web modülü bayi erişimini desteklemiyor.", new Date(Date.now() + 300_000).toISOString());
        continue;
      }
      if (job.jobType === "marketing_website_publish") {
        const publisher = this.options.marketingWebsite;
        const config = this.options.getSyncConfig();
        const prepared = publisher && transport.publishMarketingWebsite
          ? await publisher.prepare(config, clientId) : { ok: false as const, message: "Web modülü pazarlama yayınına hazır değil." };
        const result = prepared.ok ? await publishDesktopProjection(this.options.database, config, job.jobType,
          { projection: prepared.projection, sent: prepared.sent },
          (identity, frozen) => transport.publishMarketingWebsite!({ sourceRevision: identity.sourceRevision,
            idempotencyKey: identity.idempotencyKey, value: frozen.projection }),
          { expectedRevision: job.sourceRevision, nextAttemptAt: calculateNextAttempt(job.attemptCount),
            acknowledge: (sent, receipt) => publisher!.acknowledge(sent.sent, receipt.published_at, this.activeOperationId) }) : prepared;
        if (!result) continue;
        if (result.ok && prepared.ok) {
          this.options.onDashboardChanged(); published += 1;
        } else {
          publisher?.fail(prepared.ok ? prepared.sent : "sent" in prepared ? prepared.sent ?? [] : []);
          const message = result.ok ? "Website revision onayı doğrulanamadı." : result.message;
          if (!prepared.ok) this.options.database.failSyncJob(job.jobKey, job.sourceRevision, message, calculateNextAttempt(job.attemptCount));
          errors.push(message);
        }
        continue;
      }
      const config = this.options.getSyncConfig();
      const result = job.jobType === "menu_publish"
        ? await this.publishMenuJob(job)
        : job.jobType === "online_catalog_publish"
          ? await publishDesktopProjection(this.options.database, config, job.jobType, this.options.database.createCommerceOnlineCatalog(),
              (identity, catalog) => pushOnlineCatalog({ ...config, ...identity, catalog }),
              { nextAttemptAt: calculateNextAttempt(job.attemptCount) })
        : job.jobType === "dealer_access_publish"
          ? await publishDesktopProjection(this.options.database, config, job.jobType, this.options.database.createDealerAccessProjection(),
              (identity, value) => transport.publishDealerAccess!({ sourceRevision: identity.sourceRevision, idempotencyKey: identity.idempotencyKey, value }),
              { nextAttemptAt: calculateNextAttempt(job.attemptCount) })
        : await this.publishAndroidSnapshotJob(job);
      if (!result) continue;
      if (result.ok) {
        this.options.database.recordSyncEvent({
          direction: "push",
          entityType: job.jobType === "menu_publish" ? "menu"
            : job.jobType === "online_catalog_publish" ? "online_catalog" : job.jobType === "dealer_access_publish" ? "dealer_access" : "android_snapshot",
          ok: true
        });
        published += 1;
        continue;
      }
      const nextAttemptAt = calculateNextAttempt(job.attemptCount);
      this.logSyncFailure("outbox", result, {
        jobType: job.jobType,
        attemptCount: job.attemptCount,
        nextAttemptAt
      });
      this.options.database.recordSyncEvent({
        direction: "push",
        entityType: job.jobType === "menu_publish" ? "menu"
            : job.jobType === "online_catalog_publish" ? "online_catalog" : job.jobType === "dealer_access_publish" ? "dealer_access" : "android_snapshot",
        ok: false,
        message: result.message,
        status: result.status
      });
      errors.push(result.message);
    }
    return { published, errors };
  }

  private logSyncFailure(
    stage: string,
    failure: { status?: number; message?: string; error?: string },
    meta: Record<string, unknown> = {}
  ) {
    return logWebFailure({
      scope: "sync",
      event: `sync.${stage}.failed`,
      message: `Web senkron adımı tamamlanamadı: ${stage}.`,
      targetUrl: this.activeTargetUrl,
      failure,
      operationId: this.activeOperationId,
      meta: {
        durationMs: this.activeCycleStartedAt ? Date.now() - this.activeCycleStartedAt : 0,
        ...meta
      }
    });
  }

  private result(
    ok: boolean,
    message: string,
    counts: Omit<AutomaticSyncCycleResult, "ok" | "message" | "status">
  ): AutomaticSyncCycleResult {
    const status = this.emitStatus();
    return { ok, message, ...counts, status };
  }

  private deferPassiveRetry(failureCount: number) {
    this.nextPassiveRunAt = Date.now() + calculateRetryDelayMs(failureCount);
  }

  private restorePending() {
    const restore = this.options.database.getRestoreReconciliationStatus();
    return Boolean(restore && restore.state !== "complete");
  }

  private emitStatus(): AutomaticSyncStatus {
    const status = this.getStatus();
    this.options.onStatusChanged(status);
    return status;
  }
}

/** @compiledSmoke Used via dist-electron by scripts/smoke-sync-timeout.mjs. */
export function createSyncFetchWithTimeout(fetchImpl: typeof fetch, timeoutMs = SYNC_HTTP_TIMEOUT_MS): typeof fetch {
  const boundedTimeoutMs = Math.max(1, Math.trunc(timeoutMs));
  return async (input, init = {}) => {
    const controller = new AbortController();
    const upstreamSignal = init.signal;
    const abortFromUpstream = () => controller.abort();
    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        controller.abort();
      } else {
        upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
      }
    }
    const timeout = setTimeout(() => controller.abort(), boundedTimeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    }
  };
}

function isUsableSyncConfig(config: { baseUrl: string; syncSecret: string }) {
  return /^https?:\/\//.test(config.baseUrl.trim())
    && config.syncSecret.trim().length >= 12
    && config.syncSecret.trim() !== "change-this-secret";
}

function calculateNextAttempt(attemptCount: number) {
  return new Date(Date.now() + calculateRetryDelayMs(attemptCount)).toISOString();
}

function calculateRetryDelayMs(attemptCount: number) {
  const index = Math.min(Math.max(0, attemptCount), RETRY_DELAYS_SECONDS.length - 1);
  const seconds = RETRY_DELAYS_SECONDS[index] ?? 5;
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.round(seconds * jitter * 1000);
}

function classifyFailurePhase(result: SyncFailure | undefined): AutomaticSyncPhase {
  return result && isConnectionFailureMessage(result.message) ? "offline" : "error";
}

function isConnectionFailureMessage(message: string) {
  return /ulaşılamadı|internet|bağlantı|zaman aşım/i.test(message);
}

function buildSuccessMessage(counts: {
  pulledRequests: number;
  pulledActions: number;
  publishedJobs: number;
}) {
  const work = counts.pulledRequests + counts.pulledActions + counts.publishedJobs;
  if (work === 0) {
    return "Tüm veriler güncel.";
  }
  return `${counts.pulledRequests} talep, ${counts.pulledActions} telefon işlemi ve ${counts.publishedJobs} yayın eşitlendi.`;
}
