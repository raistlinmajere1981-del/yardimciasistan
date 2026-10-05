import type { MarketingMetricCapability, MarketingMetricName } from "@yardimci-asistan/shared";

/** Main-process-only seam. A concrete adapter must verify official permissions/support.
 * Production D5 credentials prove publishing only; no Insights adapter is activated. */
export interface MarketingMetricsProviderAdapter {
  readonly channel: "instagram";
  /** Opaque identity bound to provider account/credential generation, never a secret. */
  readonly cacheKey: string;
  /** Canonical D5 account identity; a different account cannot read this publication. */
  readonly accountKey: string;
  supportedMetrics(): readonly MarketingMetricCapability[];
  fetchMetrics(target: { type: "publication"; id: string; providerTargetId: string }, range: { kind: "lifetime"; startAt: string }, signal: AbortSignal): Promise<Array<{
    metric: MarketingMetricName; value: number; measuredAt: string;
    /** Internal mapping only. Never persisted, logged or exposed via IPC. */
    providerMetric?: string;
  }>>;
}
