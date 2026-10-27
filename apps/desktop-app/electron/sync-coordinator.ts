import type { MarketingWebsitePublicationService } from "./marketing/website-publication";
import type { OnlineOrderIngressService } from "./online-order-ingress-service";
import { PhpHostingSyncTransport, type AndroidOperationsSnapshot, type SyncCapabilitiesSuccess, type PushMenuResult, type PushAndroidSnapshotResult, type SyncTransport } from "@yardimci-asistan/sync-core";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type BusinessAiCatalog, type RoomPublicCatalog, type TablePublicCatalog } from "@yardimci-asistan/shared";
import type { DesktopDatabase, DesktopSyncRuntimeStatus } from "./database";
import { createDiagnosticOperationId, desktopLog } from "./desktop-logger";
import { logWebFailure, safeWebTarget } from "./web-diagnostics";
import { AndroidActionSyncService } from "./android-action-sync-service";
import { ensurePublicationSource } from "./publication-source-service";
import { publishBusinessAiContext } from "./business-ai-context-service";
import { publishSavedAiSettings } from "./ai-settings-publish-service";
import { publishGoogleReviewsSettings } from "./google-reviews-settings";
import { WebSyncIngress } from "./web-sync-ingress";
import { SyncCatalogPublisher } from "./sync-catalog-publisher";
import { SyncOutboxPublisher } from "./sync-outbox-publisher";
import { createSyncFetchWithTimeout, calculateRetryDelayMs, classifyFailurePhase, isConnectionFailureMessage, isUsableSyncConfig } from "./sync-network-policy";


const NORMAL_PULL_INTERVAL_MS = 15_000;
const MARKET_BARCODE_FAST_PULL_INTERVAL_MS = 1_500;
const OUTBOX_SCAN_INTERVAL_MS = 1_000;
const INITIAL_SYNC_DELAY_MS = 1_500;
const DEBOUNCE_DELAY_MS = 750;
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
  androidActions?: AndroidActionSyncService;
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
  private readonly androidActions: AndroidActionSyncService;
  private readonly ingress: WebSyncIngress;
  private readonly catalogs: SyncCatalogPublisher;
  private readonly publications: SyncOutboxPublisher;
  private pullTimer: NodeJS.Timeout | null = null;
  private marketBarcodeFastPullTimer: NodeJS.Timeout | null = null;
  private outboxTimer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private publicationRequested = false;
  private inFlight: Promise<AutomaticSyncCycleResult> | null = null;
  private phase: AutomaticSyncPhase = "idle";
  private message = "Otomatik senkron hazır.";
  private capabilitiesTarget = "";
  private webOrdersSupported = false;
  private businessMessagingStatusesSupported = false;
  private nextPassiveRunAt = 0;
  private marketBarcodeFastPullActive = false;
  private suspendedForMaintenance = false;
  private activeOperationId = "";
  private activeCycleStartedAt = 0;
  private activeTargetUrl = "";

  constructor(private readonly options: SyncCoordinatorOptions) {
    const logFailure = this.logSyncFailure.bind(this);
    this.ingress = new WebSyncIngress(options, () => this.activeOperationId, logFailure);
    this.catalogs = new SyncCatalogPublisher(options, () => this.activeOperationId, logFailure);
    this.publications = new SyncOutboxPublisher(options, () => this.suspendedForMaintenance, () => this.activeOperationId, logFailure);
    // Main injects the same owner used by manual ingress. Standalone coordinator
    // consumers compose one owner here, retained for their entire lifecycle.
    this.androidActions = options.androidActions ?? new AndroidActionSyncService({
      database: options.database,
      isSuspended: () => this.suspendedForMaintenance,
      markLocalSnapshotDirty: () => {},
      notifyDashboardChanged: () => options.onDashboardChanged()
    });
  }

  start() {
    this.suspendedForMaintenance = false;
    this.androidActions.resume();
    this.stop();
    this.catalogs.resetCatalogSupport();
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
    this.publicationRequested = false;
    this.marketBarcodeFastPullActive = false;
  }

  async suspendAndDrain() {
    this.suspendedForMaintenance = true;
    this.stop();
    const androidDrain = this.androidActions.suspendAndDrain();
    const active = this.inFlight;
    if (active) {
      try {
        await active;
      } catch {
        // run() already normalizes failures; maintenance only needs the cycle to finish.
      }
    }
    await androidDrain;
    await this.publications.drain();
    // A mutation may have tried to schedule work while the previous cycle was draining.
    this.stop();
  }

  restart() {
    const restoreMarketBarcodeFastPull = this.marketBarcodeFastPullActive;
    this.capabilitiesTarget = "";
    this.catalogs.resetAvailabilitySupport();
    this.nextPassiveRunAt = 0;
    this.start();
    if (restoreMarketBarcodeFastPull) {
      this.setMarketBarcodeFastPullEnabled(true);
    }
  }

  scheduleSoon(delayMs = DEBOUNCE_DELAY_MS, publicationIntent = false) {
    if (this.suspendedForMaintenance) return;
    // An explicit publication setting/write uses this same cycle even with passive sync OFF.
    this.publicationRequested ||= publicationIntent;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.inFlight && this.publicationRequested) return; // finally drains the newer intent.
      const force = this.publicationRequested;
      this.publicationRequested = false;
      void this.run(force);
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

  publishMenuNow(): Promise<PushMenuResult> { return this.publications.publishMenuNow(); }
  publishAndroidSnapshotNow(): Promise<PushAndroidSnapshotResult> { return this.publications.publishAndroidSnapshotNow(); }

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
        if (this.publicationRequested) this.scheduleSoon(0);
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
      this.publications.setSupportedFeatures(capabilities.features);
      this.capabilitiesTarget = targetKey;
    }

    if (this.businessMessagingStatusesSupported && this.options.pullBusinessMessagingStatuses) {
      const failure = await this.options.pullBusinessMessagingStatuses(config);
      if (failure) errors.push(failure);
    }

    const accountResult = await this.ingress.pullCustomerAccountPages(transport);
    if (accountResult.error) errors.push(accountResult.error);
    let dashboardChanged = accountResult.count > 0;
    const restore = this.options.database.getRestoreReconciliationStatus();
    const replayRequests = restore?.state === "reconciliation_pending" && !restore.requestsComplete;
    const replayOrders = restore?.state === "reconciliation_pending" && !restore.ordersComplete;
    if (requestsEnabled || replayRequests) {
      const requestResult = await this.ingress.pullRequestPages(transport);
      counts.pulledRequests = requestResult.count;
      dashboardChanged ||= requestResult.count > 0;
      if (requestResult.error) {
        errors.push(requestResult.error);
      }
    }

    if (this.webOrdersSupported
        && (replayOrders || hasBusinessCapability(enabledCapabilities, BUSINESS_CAPABILITIES.ONLINE_SALES))) {
      const orderResult = await this.ingress.pullWebOrderPages(transport);
      dashboardChanged ||= orderResult.count > 0;
      if (orderResult.count > 0) this.options.onCommerceOrdersChanged?.();
      if (orderResult.error) errors.push(orderResult.error);
    }

    const actionResult = await this.processAndroidActions(transport);
    counts.pulledActions = actionResult.pulled;
    counts.appliedActions = actionResult.applied;
    counts.failedActions = actionResult.failed;
    if (actionResult.error) {
      errors.push(actionResult.error);
    }

    if (requestsEnabled || replayRequests) {
      const acknowledgementError = await this.ingress.acknowledgeImportedRequests(transport);
      if (acknowledgementError) {
        errors.push(acknowledgementError);
      }
    }

    const availabilityError = await this.catalogs.publishAvailabilityHeartbeat(config, enabledCapabilities);
    if (availabilityError) {
      errors.push(availabilityError);
    }

    const roomCatalogError = await this.catalogs.publishRoomCatalogIfChanged(config, clientId);
    if (roomCatalogError) {
      errors.push(roomCatalogError);
    }

    const tableCatalogError = await this.catalogs.publishTableCatalogIfChanged(config, clientId);
    if (tableCatalogError) {
      errors.push(tableCatalogError);
    }

    const aiCatalogError = await this.catalogs.publishAiCatalogIfChanged(config);
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

    const publicationResult = await this.publications.publishOutbox(transport);
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

  private async processAndroidActions(transport: SyncTransport) {
    const result = await this.androidActions.processQueue(false, transport);
    if (result.error) this.logSyncFailure("android-actions", { message: result.error });
    return result;
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
