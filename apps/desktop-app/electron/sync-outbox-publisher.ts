import { pushMenu, pushAndroidSnapshot, pushOnlineCatalog,
  type AndroidOperationsSnapshot, type PushMenuResult, type PushAndroidSnapshotResult, type SyncTransport } from "@yardimci-asistan/sync-core";
import type { DesktopDatabase, DesktopSyncJob } from "./database";
import type { MarketingWebsitePublicationService } from "./marketing/website-publication";
import { DESKTOP_PUBLICATIONS } from "./desktop-publication-registry";
import { publishDesktopProjection } from "./desktop-publication-service";
import { calculateNextAttempt } from "./sync-network-policy";
import { prepareDealerProductMedia } from "./dealer-product-media-publication";
import type { DealerAccessProjection } from "@yardimci-asistan/shared";

export interface SyncOutboxPublisherOptions {
  database: DesktopDatabase;
  marketingWebsite?: MarketingWebsitePublicationService;
  getSyncConfig: () => { baseUrl: string; syncSecret: string };
  createAndroidSnapshot: () => AndroidOperationsSnapshot;
  onDashboardChanged: () => void;
}

/** Job selection and in-process serialization only. The existing durable outbox
 * owns frozen payloads/revisions, retry state and exact receipt completion. */
export class SyncOutboxPublisher {
  private onlineCatalogSupported = false;
  private dealerAccessSupported = false;
  setSupportedFeatures(features: readonly string[]) {
    this.onlineCatalogSupported = features.includes("online_catalog_v1");
    this.dealerAccessSupported = features.includes("dealer_access_v2");
  }
  private readonly outboxPublicationsInFlight = new Map<string, { sourceRevision: number; promise: Promise<unknown> }>();
  constructor(private readonly options: SyncOutboxPublisherOptions,
    private readonly isSuspended: () => boolean,
    private readonly operationId: () => string,
    private readonly logSyncFailure: (stage: string, failure: { status?: number; message?: string; error?: string }, meta?: Record<string, unknown>) => void) {}
  async drain() { await Promise.allSettled([...this.outboxPublicationsInFlight.values()].map(item => item.promise)); }

  async publishMenuNow(): Promise<PushMenuResult> {
    const config = this.options.getSyncConfig();
    this.options.database.ensurePublicationTarget(config.baseUrl.trim().replace(/\/+$/, ""));
    this.options.database.prepareSyncPublication("menu_publish", this.options.database.getQrMenuPublication(), true);
    const job = this.options.database.getPendingSyncJobs().find(item => item.jobType === "menu_publish");
    if (!job || this.isSuspended()) return { ok: false, message: "Menü yayın niyeti hazırlanamadı." };
    return await this.publishMenuJob(job) ?? { ok: false, message: "Menü yayın niyeti hazırlanamadı." };
  }

  async publishAndroidSnapshotNow(): Promise<PushAndroidSnapshotResult> {
    const config = this.options.getSyncConfig();
    const snapshot = this.options.createAndroidSnapshot();
    this.options.database.ensurePublicationTarget(config.baseUrl.trim().replace(/\/+$/, ""));
    this.options.database.prepareSyncPublication("android_snapshot", snapshot, true);
    const job = this.options.database.getPendingSyncJobs().find(item => item.jobType === "android_snapshot");
    if (!job || this.isSuspended()) return { ok: false, message: "Android yayın niyeti hazırlanamadı." };
    const result: PushAndroidSnapshotResult = await this.publishAndroidSnapshotJob(job) ?? { ok: false, message: "Android yayın niyeti hazırlanamadı." };
    this.options.database.recordSyncEvent({ direction: "push", entityType: "android_snapshot", ok: result.ok,
      recordCount: result.ok ? result.task_count + snapshot.requests.length + snapshot.rooms.length + snapshot.tables.length : 0,
      message: result.message, ...(result.ok || result.status === undefined ? {} : { status: result.status }) });
    return result;
  }

  private async publishSerializedOutboxJob<R>(job: DesktopSyncJob, publish: (current: DesktopSyncJob) => Promise<R | null>): Promise<R | null> {
    const active = this.outboxPublicationsInFlight.get(job.jobKey);
    if (active) {
      const result = await active.promise as R | null;
      const newer = this.options.database.getPendingSyncJobs().find(item => item.jobKey === job.jobKey && item.sourceRevision > active.sourceRevision);
      return newer ? this.publishSerializedOutboxJob(newer, publish) : result;
    }
    if (this.isSuspended()) return null;
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

  async publishOutbox(transport: SyncTransport): Promise<{ published: number; errors: string[] }> {
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
            acknowledge: (sent, receipt) => publisher!.acknowledge(sent.sent, receipt.published_at, this.operationId()) }) : prepared;
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
      let dealerProjection: DealerAccessProjection | undefined;
      if (job.jobType === "dealer_access_publish") {
        const prepared = await prepareDealerProductMedia(this.options.database, config, job.sourceRevision);
        if (!prepared.ok) {
          this.options.database.failSyncJob(job.jobKey, job.sourceRevision, prepared.message, calculateNextAttempt(job.attemptCount));
          errors.push(prepared.message);
          continue;
        }
        dealerProjection = prepared.value;
      }
      const result = job.jobType === "menu_publish"
        ? await this.publishMenuJob(job)
        : job.jobType === "online_catalog_publish"
          ? await publishDesktopProjection(this.options.database, config, job.jobType, this.options.database.createCommerceOnlineCatalog(),
              (identity, catalog) => pushOnlineCatalog({ ...config, ...identity, catalog }),
              { nextAttemptAt: calculateNextAttempt(job.attemptCount) })
        : job.jobType === "dealer_access_publish"
          ? await publishDesktopProjection(this.options.database, config, job.jobType, dealerProjection!,
              (identity, value) => transport.publishDealerAccess!({ sourceRevision: identity.sourceRevision, idempotencyKey: identity.idempotencyKey, value }),
              { expectedRevision: job.sourceRevision, nextAttemptAt: calculateNextAttempt(job.attemptCount) })
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
        ...(result.status === undefined ? {} : { status: result.status })
      });
      errors.push(result.message);
    }
    return { published, errors };
  }
}
