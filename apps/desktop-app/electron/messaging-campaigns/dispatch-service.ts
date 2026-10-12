import type { DesktopDatabase } from "../database";
import { desktopLog } from "../desktop-logger";
import type { CampaignDispatchTransport, DispatchResult } from "./dispatch-contract";
import { MessagingCampaignError } from "./validation";

export interface CampaignDispatchPolicy {
  batchSize: number; minimumIntervalMs: number; maxAttempts: number; claimLeaseMs: number;
  pollIntervalMs: number; transientBackoffMs: number; rateLimitBackoffMs: number; maxBackoffMs: number;
}
/** Internal conservative policy, not a claim about any provider's account limits. */
const DEFAULT_CAMPAIGN_DISPATCH_POLICY: Readonly<CampaignDispatchPolicy> = {
  batchSize: 3, minimumIntervalMs: 3000, maxAttempts: 4, claimLeaseMs: 300000,
  pollIntervalMs: 15000, transientBackoffMs: 5000, rateLimitBackoffMs: 60000, maxBackoffMs: 900000
};
export class CampaignDispatchService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flight: Promise<void> | null = null;
  private active = false;
  private readonly policy: CampaignDispatchPolicy;
  constructor(private readonly getDatabase: () => DesktopDatabase, private readonly transport: CampaignDispatchTransport,
    private readonly options: { allowed: () => boolean; onChanged?: () => void; now?: () => Date; policy?: Partial<CampaignDispatchPolicy> }) {
    this.policy = { ...DEFAULT_CAMPAIGN_DISPATCH_POLICY, ...options.policy };
    for (const value of Object.values(this.policy)) if (!Number.isSafeInteger(value) || value < 1 || value > 86400000) throw new Error("Invalid campaign dispatch policy");
    if (this.policy.batchSize > 20 || this.policy.maxAttempts > 20 || this.policy.claimLeaseMs < 60000) throw new Error("Invalid campaign dispatch policy");
  }
  private now() { return (this.options.now ?? (() => new Date()))(); }
  private log(event: string, meta: Record<string, string | number>, operationId?: string) {
    desktopLog[event === "message.failed" ? "error" : event === "message.retry_scheduled" ? "warn" : "info"]({ scope: "messaging", event: `messaging.dispatch.${event}`, message: "Kontrollü kampanya gönderimi güncellendi.", ...(operationId !== undefined ? { operationId } : {}), meta });
  }
  start() { if (this.active) return; this.active = true; this.wake(); }
  wake() {
    if (!this.active) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.runOnce().finally(() => this.schedule()); }, 0);
  }
  private schedule() {
    if (!this.active || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.runOnce().finally(() => this.schedule()); }, this.policy.pollIntervalMs);
  }
  async suspendAndDrain() {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.flight;
  }
  /** Single-flight per runtime; SQLite lease + message fence protect concurrent runtimes too. */
  runOnce(): Promise<void> {
    if (this.flight) return this.flight;
    const work = this.runBatch();
    this.flight = work.finally(() => { this.flight = null; });
    return this.flight;
  }
  private async runBatch() {
    if (!this.active || !this.options.allowed()) return;
    try {
      const db = this.getDatabase(), now = this.now();
      const recovered = db.recoverCampaignDispatchClaims(now.toISOString(), new Date(now.getTime() - this.policy.claimLeaseMs).toISOString());
      const rows = db.claimCampaignDispatchBatch(now.toISOString(), this.policy.batchSize);
      if (rows.length) this.log("batch.claimed", { count: rows.length });
      for (const row of rows) {
        let result: DispatchResult;
        if (!this.active || !this.options.allowed()) result = { kind: "deferred", nextAttemptAt: this.now().toISOString() };
        else if (row.attemptCount > this.policy.maxAttempts) result = { kind: "failed", category: "max_attempts" };
        else result = await this.transport.dispatchCampaignItem(row.id, row.claimToken, this.policy.minimumIntervalMs,
          () => this.active && this.options.allowed(), () => this.now());
        let next = "";
        if (result.kind === "retry") {
          const base = result.category === "rate_limit" ? this.policy.rateLimitBackoffMs : this.policy.transientBackoffMs;
          const backoff = Math.min(this.policy.maxBackoffMs, base * 2 ** Math.min(row.attemptCount - 1, 20));
          next = new Date(this.now().getTime() + Math.max(backoff, result.retryAfterMs ?? 0)).toISOString();
        }
        const rateLimitUntil = result.kind === "retry" && result.category === "rate_limit" ? next : "";
        if (result.kind === "retry" && row.attemptCount >= this.policy.maxAttempts) result = { kind: "failed", category: result.category === "submission_uncertain" ? "submission_uncertain" : "max_attempts" };
        const saved = db.finishCampaignDispatchClaim(row.id, row.claimToken, result, this.now().toISOString(), next, rateLimitUntil);
        if (saved && result.kind !== "deferred") {
          const event = saved.status === "dispatched" ? "accepted" : saved.status === "pending" ? "retry_scheduled" : saved.status;
          this.log(`message.${event}`, { campaignId: row.campaignId, outboxId: row.id,
            ...(saved.businessMessageId ? { businessMessageId: saved.businessMessageId } : {}), ...(saved.category ? { category: saved.category } : {}) }, row.id);
        }
      }
      const completed = db.completeDispatchCampaigns(this.now().toISOString());
      for (const id of completed) this.log("campaign.completed", { campaignId: id }, id);
      if (rows.length || recovered || completed.length) this.options.onChanged?.();
    } catch (error) {
      if (error instanceof MessagingCampaignError && error.code === "feature_disabled") return;
      // Never collect arbitrary transport errors or payloads. Claims remain durable and recoverable.
      desktopLog.error({ scope: "messaging", event: "messaging.dispatch.batch.failed", message: "Kampanya gönderim grubu tamamlanamadı.", meta: { category: "operation_failed" } });
    }
  }
}
