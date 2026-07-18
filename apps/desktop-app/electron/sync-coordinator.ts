import {
  PhpHostingSyncTransport,
  type AndroidOperationsSnapshot,
  type SyncCapabilitiesSuccess,
  type SyncFailure,
  type SyncTransport
} from "@yardimci-asistan/sync-core";
import {
  DesktopDatabase,
  type DesktopSyncRuntimeStatus
} from "./database";

const PULL_INTERVAL_MS = 15_000;
const OUTBOX_SCAN_INTERVAL_MS = 1_000;
const INITIAL_SYNC_DELAY_MS = 1_500;
const DEBOUNCE_DELAY_MS = 750;
const MAX_PULL_PAGES = 20;
const RETRY_DELAYS_SECONDS = [5, 15, 30, 60, 300] as const;
const REQUIRED_ANDROID_SYNC_FEATURES = ["android_device_sightings", "android_device_permissions"] as const;

export function supportsAndroidDevicePermissionSync(
  capabilities: Pick<SyncCapabilitiesSuccess, "schema_version" | "features">
): boolean {
  return capabilities.schema_version >= 2
    && Array.isArray(capabilities.features)
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
  getSyncConfig: () => { baseUrl: string; syncSecret: string };
  createAndroidSnapshot: () => AndroidOperationsSnapshot;
  onDashboardChanged: () => void;
  onStatusChanged: (status: AutomaticSyncStatus) => void;
}

export class SyncCoordinator {
  private pullTimer: NodeJS.Timeout | null = null;
  private outboxTimer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private inFlight: Promise<AutomaticSyncCycleResult> | null = null;
  private phase: AutomaticSyncPhase = "idle";
  private message = "Otomatik senkron hazır.";
  private capabilitiesTarget = "";
  private nextPassiveRunAt = 0;

  constructor(private readonly options: SyncCoordinatorOptions) {}

  start() {
    this.stop();
    this.emitStatus();
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      void this.run(false);
    }, INITIAL_SYNC_DELAY_MS);
    this.pullTimer = setInterval(() => {
      if (Date.now() >= this.nextPassiveRunAt) {
        void this.run(false);
      }
    }, PULL_INTERVAL_MS);
    this.outboxTimer = setInterval(() => {
      const runtime = this.options.database.getSyncRuntimeStatus();
      if (runtime.enabled
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
    if (this.outboxTimer) clearInterval(this.outboxTimer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.pullTimer = null;
    this.outboxTimer = null;
    this.initialTimer = null;
    this.debounceTimer = null;
  }

  restart() {
    this.capabilitiesTarget = "";
    this.nextPassiveRunAt = 0;
    this.start();
  }

  scheduleSoon(delayMs = DEBOUNCE_DELAY_MS) {
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

  getStatus(): AutomaticSyncStatus {
    const runtime = this.options.database.getSyncRuntimeStatus();
    if (!runtime.enabled && this.phase !== "syncing") {
      return { ...runtime, phase: "disabled", message: "Otomatik senkron kapalı." };
    }
    return { ...runtime, phase: this.phase, message: this.message };
  }

  runNow(): Promise<AutomaticSyncCycleResult> {
    return this.run(true);
  }

  private run(force: boolean): Promise<AutomaticSyncCycleResult> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.runCycle(force)
      .catch(() => {
        const message = "Senkron tamamlanamadı. Biraz sonra yeniden denenecek.";
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
    if (!runtime.enabled && !force) {
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

    const transport = new PhpHostingSyncTransport({ ...config, clientId });
    const setup = this.options.database.getSetupData();
    this.phase = "syncing";
    this.message = "Web, masaüstü ve Android verileri eşitleniyor...";
    this.options.database.recordSyncAttempt();
    this.emitStatus();

    const counts = { ...empty };
    const errors: string[] = [];
    const targetKey = `${config.baseUrl}\u0000${clientId}\u0000android:${setup.modules.android ? "1" : "0"}`;
    if (this.capabilitiesTarget !== targetKey) {
      const capabilities = await transport.getCapabilities();
      const missingAndroidCapabilities = capabilities.ok
        && setup.modules.android
        && !supportsAndroidDevicePermissionSync(capabilities);
      if (!capabilities.ok
          || capabilities.protocol_version < 2
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
        return this.result(false, message, counts);
      }
      this.capabilitiesTarget = targetKey;
    }

    let dashboardChanged = false;
    const requestResult = await this.pullRequestPages(transport);
    counts.pulledRequests = requestResult.count;
    dashboardChanged ||= requestResult.count > 0;
    if (requestResult.error) {
      errors.push(requestResult.error);
    }

    const actionResult = await this.processAndroidActions(transport);
    counts.pulledActions = actionResult.pulled;
    counts.appliedActions = actionResult.applied;
    counts.failedActions = actionResult.failed;
    dashboardChanged ||= actionResult.applied > 0 || actionResult.devicesChanged > 0;
    if (actionResult.error) {
      errors.push(actionResult.error);
    }

    const acknowledgementError = await this.acknowledgeImportedRequests(transport);
    if (acknowledgementError) {
      errors.push(acknowledgementError);
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
      this.message = buildSuccessMessage(counts);
      return this.result(true, this.message, counts);
    }

    const uniqueErrors = [...new Set(errors.filter(Boolean))];
    this.message = uniqueErrors[0] || "Senkron tamamlanamadı.";
    this.options.database.recordAutomaticSyncFailure(this.message);
    this.deferPassiveRetry(runtime.consecutiveFailures);
    this.phase = uniqueErrors.some(isConnectionFailureMessage) ? "offline" : "error";
    return this.result(false, this.message, counts);
  }

  private async pullRequestPages(transport: SyncTransport): Promise<{ count: number; error: string }> {
    let count = 0;
    let cursor = this.options.database.getSyncRuntimeStatus().requestCursor;
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const result = await transport.pullRequests({ afterSeq: cursor, limit: 100 });
      if (!result.ok) {
        this.options.database.recordSyncEvent({
          direction: "pull",
          entityType: "request",
          ok: false,
          message: result.message,
          status: result.status
        });
        return { count, error: result.message };
      }
      if (typeof result.next_cursor !== "number") {
        return { count, error: "Web modülü geçerli bir talep cursor değeri döndürmedi." };
      }
      this.options.database.upsertRequests(result.requests, result.next_cursor);
      count += result.requests.length;
      cursor = result.next_cursor;
      if (!result.has_more) {
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
    const setup = this.options.database.getSetupData();
    if (!setup.modules.android) {
      return { pulled: 0, applied: 0, failed: 0, devicesChanged: 0, error: "" };
    }
    const pulled = await transport.pullAndroidActions({ limit: 100 });
    if (!pulled.ok) {
      return { pulled: 0, applied: 0, failed: 0, devicesChanged: 0, error: pulled.message };
    }
    const devicesChanged = this.options.database.upsertAndroidDeviceSightings(pulled.devices ?? []);
    let applied = 0;
    let failed = 0;
    for (const action of pulled.actions) {
      const local = this.options.database.applyAndroidAction(action);
      const status = local.ok ? "applied" : "failed";
      const completion = await transport.completeAndroidAction({
        actionId: action.id,
        status,
        errorMessage: local.ok ? "" : local.message
      });
      if (!completion.ok) {
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

  private async publishOutbox(transport: SyncTransport): Promise<{ published: number; errors: string[] }> {
    const jobs = this.options.database.getPendingSyncJobs();
    const setup = this.options.database.getSetupData();
    const clientId = this.options.database.getSyncRuntimeStatus().clientId;
    const errors: string[] = [];
    let published = 0;
    for (const job of jobs) {
      if ((job.jobType === "menu_publish" && !setup.modules.qrMenu)
          || (job.jobType === "android_snapshot" && !setup.modules.android)) {
        this.options.database.completeSyncJob(job.jobKey, job.sourceRevision);
        continue;
      }
      const idempotencyKey = `${clientId}:${job.jobKey}:${job.sourceRevision}`;
      const result = job.jobType === "menu_publish"
        ? await transport.publishMenu({
            sourceRevision: job.sourceRevision,
            idempotencyKey,
            value: this.options.database.getPublishedMenu()
          })
        : await transport.publishAndroidSnapshot({
            sourceRevision: job.sourceRevision,
            idempotencyKey,
            value: this.options.createAndroidSnapshot()
          });
      if (result.ok) {
        this.options.database.completeSyncJob(job.jobKey, job.sourceRevision);
        if (job.jobType === "menu_publish") {
          this.options.database.markMenuPublished();
        }
        this.options.database.recordSyncEvent({
          direction: "push",
          entityType: job.jobType === "menu_publish" ? "menu" : "android_snapshot",
          ok: true
        });
        published += 1;
        continue;
      }
      const nextAttemptAt = calculateNextAttempt(job.attemptCount);
      this.options.database.failSyncJob(job.jobKey, job.sourceRevision, result.message, nextAttemptAt);
      this.options.database.recordSyncEvent({
        direction: "push",
        entityType: job.jobType === "menu_publish" ? "menu" : "android_snapshot",
        ok: false,
        message: result.message,
        status: result.status
      });
      errors.push(result.message);
    }
    return { published, errors };
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

  private emitStatus(): AutomaticSyncStatus {
    const status = this.getStatus();
    this.options.onStatusChanged(status);
    return status;
  }
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
  const seconds = RETRY_DELAYS_SECONDS[index];
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
