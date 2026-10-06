import { randomUUID } from "node:crypto";
import { BUSINESS_CAPABILITIES as C, hasBusinessCapability, MARKETING_CHANNELS, type MarketingAnalyticsSnapshot,
  type MarketingAnalyticsRangeInput, type MarketingMetric, type MarketingMetricName, type MarketingMetricAvailability,
  type MarketingMetricCapability, type MarketingCampaignAnalytics, type MarketingPublicationAnalytics } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { desktopLog } from "../desktop-logger";
import { createMarketingChannelRegistry } from "./channel-registry";
import { analyticsDateOffset, analyticsDay, resolveAnalyticsRange } from "./analytics-range";
import type { MarketingMetricsProviderAdapter } from "./metrics-provider-adapter";
import { MarketingError, marketingId } from "./validation";

type Facts = ReturnType<DesktopDatabase["readMarketingAnalyticsRecords"]>;
type Publication = Facts["publications"][number];
const engagement: MarketingMetricName[] = ["reach", "views", "likes", "comments", "saves", "shares"];
const TTL = 15 * 60000, REFRESH_INTERVAL = 60000;
/** No canonical writes and no provider polling on read. Only optional normalized snapshots can be written. */
export class MarketingAnalyticsService {
  private readonly refreshes = new Map<string, { at: number; failed: boolean; pending: boolean }>();
  private lastRefreshAt = -Infinity;
  constructor(private readonly database: () => DesktopDatabase, private readonly options: {
    now?: () => Date; provider?: () => MarketingMetricsProviderAdapter | undefined;
    smsDelivered?: boolean; allowed?: () => boolean; providerTimeoutMs?: number;
  } = {}) {}
  private now() { return (this.options.now ?? (() => new Date()))(); }
  private gate() {
    if (this.options.allowed && !this.options.allowed()) throw new MarketingError("session_locked", "Analitik için uygulama kilidini açın.");
    if (!hasBusinessCapability(this.database().getEnabledBusinessCapabilities(), C.MARKETING_STUDIO)) throw new MarketingError("capability_disabled", "Pazarlama bu işletmede etkin değil.");
  }
  private audienceEnabled() {
    const enabled = this.database().getEnabledBusinessCapabilities();
    return hasBusinessCapability(enabled, C.MESSAGING_CAMPAIGNS) && hasBusinessCapability(enabled, C.CUSTOMERS);
  }
  private metric(channel: MarketingMetric["channel"], metric: MarketingMetricName, value: number | null, source: MarketingMetric["source"] = "canonical_operations", availability: MarketingMetricAvailability = value === null ? "no_data" : "available"): MarketingMetric {
    return { channel, metric, value, source, availability, measuredAt: value === null ? null : this.now().toISOString(), freshness: value === null ? "unavailable" : "current" };
  }
  private delivery(channel: "whatsapp" | "sms", recipients: Facts["recipients"], eligible?: number | null): MarketingMetric[] {
    const rows = recipients.filter(r => r.channel === channel), count = (predicate: (r: typeof rows[number]) => boolean) => rows.length ? rows.filter(predicate).length : null;
    const accepted = (r: typeof rows[number]) => Boolean(r.acceptedAt) || r.outboxStatus === "dispatched" || ["accepted", "delivered", "read"].includes(r.messageStatus);
    const delivered = (r: typeof rows[number]) => Boolean(r.deliveredAt || r.readAt) || ["delivered", "read"].includes(r.messageStatus);
    const counts: Array<[MarketingMetricName, number | null]> = [
      ["audience", rows.length || null], ["eligible", eligible ?? count(r => Boolean(r.outboxStatus))],
      ["prepared", count(r => Boolean(r.outboxStatus))], ["pending", count(r => ["pending", "claimed"].includes(r.outboxStatus))],
      ["attempted", count(r => r.attempts > 0)], ["accepted", count(accepted)],
      ["failed", count(r => !delivered(r) && (r.messageStatus === "failed" || r.outboxStatus === "failed"))],
      ["skipped", count(r => r.recipientStatus === "skipped" || r.outboxStatus === "skipped")]
    ];
    const metrics = counts.map(([name, value]) => this.metric(channel, name, value));
    metrics.push(this.metric(channel, "delivered", channel === "sms" && this.options.smsDelivered === false ? null : count(delivered), "canonical_delivery", channel === "sms" && this.options.smsDelivered === false ? "unsupported" : undefined));
    metrics.push(this.metric(channel, "read", channel === "whatsapp" ? count(r => Boolean(r.readAt) || r.messageStatus === "read") : null, "canonical_delivery", channel === "sms" ? "unsupported" : undefined));
    return metrics;
  }
  private campaignProjection(c: Facts["campaigns"][number], facts: Facts): MarketingCampaignAnalytics {
    const metrics = this.delivery(c.channel, facts.recipients.filter(r => r.campaignId === c.id), c.eligible);
    // A prepared, empty audience is a real zero; a draft has no frozen audience yet.
    if (c.preparedAt) for (const m of metrics) if (m.availability === "no_data") Object.assign(m, this.metric(m.channel, m.metric, 0, m.source));
    return { id: c.id, channel: c.channel, status: c.status, createdAt: c.createdAt, metrics };
  }
  private providerCapabilities(): MarketingMetricCapability[] {
    const adapter = this.options.provider?.();
    // Existing D5 basic/publish credential configuration contains no verified Insights grant.
    const capabilities = adapter?.supportedMetrics() ?? [];
    return engagement.map(metric => {
      const found = capabilities.find(c => c.metric === metric);
      const availability = found && ["available", "unsupported", "unconfigured", "disabled", "permission_denied", "permission_unverified"].includes(found.availability) ? found.availability : adapter ? "unsupported" : "permission_unverified";
      // Never spread adapter objects: extra fields may contain provider vocabulary/response data.
      return { metric, availability };
    });
  }
  private publicationRange(p: Publication) {
    // Post metrics describe this publication's lifetime, never engagement within the overview date range.
    return { kind: "lifetime" as const, startAt: p.createdAt, endAt: "" };
  }
  private publicationProjection(p: Publication): MarketingPublicationAnalytics {
    const metrics = [this.metric(p.channel, "published", p.publishedAt || p.status === "published" ? 1 : 0), this.metric(p.channel, "failed", p.status === "failed" ? 1 : 0)];
    if (p.channel === "website") metrics.push(this.metric("website", "unpublished", p.unpublishedAt ? 1 : 0));
    const adapter = this.options.provider?.(), registry = createMarketingChannelRegistry(this.database()).find(c => c.id === p.channel)!;
    const range = this.publicationRange(p), key = `${adapter?.cacheKey ?? "none"}:${p.id}`;
    const attempt = this.refreshes.get(key);
    const snapshots = adapter ? this.database().readMarketingMetricSnapshots(p.id, adapter.cacheKey, range.startAt, range.endAt) : [];
    if (p.channel === "instagram") for (const capability of this.providerCapabilities()) {
      const available = !registry.enabled ? "disabled" : !registry.configured ? "unconfigured" : adapter && adapter.accountKey !== p.providerAccountKey ? "permission_denied" : capability.availability;
      const saved = available === "available" ? snapshots.find(s => s.metric === capability.metric) : undefined;
      metrics.push(saved ? { channel: p.channel, metric: saved.metric, value: saved.value, source: "provider_snapshot", availability: attempt?.failed ? "refresh_failed" : "available", measuredAt: saved.measuredAt, freshness: Date.parse(saved.expiresAt) > this.now().getTime() && !attempt?.failed ? "fresh" : "stale" }
        : this.metric(p.channel, capability.metric, null, "provider_snapshot", available === "available" ? attempt?.failed ? "refresh_failed" : "no_data" : available));
    }
    const latest = Math.max(-Infinity, ...snapshots.map(s => Date.parse(s.measuredAt)), attempt?.at ?? -Infinity);
    const next = Math.max(latest + REFRESH_INTERVAL, this.lastRefreshAt + REFRESH_INTERVAL);
    return { id: p.id, channel: p.channel, status: p.status, createdAt: p.createdAt, publishedAt: p.publishedAt || null, updatedAt: p.updatedAt, metrics,
      canRefresh: p.channel === "instagram" && p.status === "published" && Boolean(p.providerTargetId) && registry.enabled && registry.configured && Boolean(adapter && adapter.accountKey === p.providerAccountKey && this.providerCapabilities().some(c => c.availability === "available")) && !attempt?.pending,
      nextRefreshAt: Number.isFinite(next) ? new Date(next).toISOString() : null };
  }
  snapshot(input: MarketingAnalyticsRangeInput, opened = false): MarketingAnalyticsSnapshot {
    this.gate(); const now = this.now(), range = resolveAnalyticsRange(input, now), facts = this.database().readMarketingAnalyticsRecords(range.startAt, range.endAt);
    if (!this.audienceEnabled()) { facts.campaigns = []; facts.recipients = []; }
    const registry = createMarketingChannelRegistry(this.database());
    const channels = MARKETING_CHANNELS.map(channel => {
      const definition = registry.find(c => c.id === channel)!, rows = facts.publications.filter(p => p.channel === channel);
      const metrics = channel === "whatsapp" || channel === "sms" ? this.delivery(channel, facts.recipients)
        : ([ ["total_publications", rows.length], ["publishing", rows.filter(p => p.status === "publishing").length], ["published", rows.filter(p => p.publishedAt || p.status === "published").length], ["failed", rows.filter(p => p.status === "failed").length], ...(channel === "website" ? [["unpublished", rows.filter(p => p.unpublishedAt).length]] : []) ] as Array<[MarketingMetricName, number]>).map(([metric, count]) => this.metric(channel, metric, rows.length ? count : null));
      const unavailable = !definition.enabled ? "disabled" : !definition.configured ? "unconfigured" : "no_data";
      for (const m of metrics) if (m.availability === "no_data") m.availability = unavailable;
      if (channel === "website") metrics.push(this.metric(channel, "active_publications", facts.activeWebsitePublications));
      // Post reach is not additive; no synthetic channel reach or period engagement totals.
      const providerCapabilities = channel === "instagram" ? this.providerCapabilities() : [];
      const count = (name: MarketingMetricName) => metrics.find(m => m.metric === name)?.value ?? null;
      const ratio = (numerator: number | null, denominator: number | null) => numerator !== null && denominator !== null && denominator > 0 && numerator <= denominator ? numerator / denominator : null;
      return { channel, serviceState: definition.state === "ready" ? "ready" as const : definition.state === "unconfigured" ? "unconfigured" as const : "disabled" as const, metrics, providerCapabilities, deliveryRate: ratio(count("delivered"), count("accepted")), readRate: ratio(count("read"), count("delivered")) };
    });
    const total = (name: MarketingMetricName) => { const values = channels.flatMap(c => c.metrics.filter(m => m.metric === name && m.value !== null).map(m => m.value!)); return values.length ? values.reduce((a, b) => a + b, 0) : null; };
    const trends: MarketingAnalyticsSnapshot["trends"] = [];
    for (let date = range.startDate; date <= range.endDate; date = analyticsDateOffset(date, 1)) {
      const recipients = facts.recipients.filter(r => analyticsDay(r.createdAt, range.timezone) === date);
      const count = (name: MarketingMetricName) => { const value = ["whatsapp", "sms"].flatMap(channel => this.delivery(channel as "whatsapp" | "sms", recipients).filter(m => m.metric === name && m.value !== null).map(m => m.value!)); return total(name) === null ? null : value.reduce((a, b) => a + b, 0); };
      trends.push({ date, accepted: count("accepted"),
        published: total("published") === null ? null : facts.publications.filter(p => (p.publishedAt || p.status === "published") && analyticsDay(p.createdAt, range.timezone) === date).length });
    }
    if (opened === true) desktopLog.info({ scope: "marketing.analytics", event: "marketing.analytics.opened", message: "Pazarlama analitiği açıldı.", meta: { days: trends.length } });
    // A channel was used when a message was attempted/accepted or a publication progressed beyond draft.
    // This is a count of channels, never a comparison of recipient counts and publication counts.
    const usedChannels = channels.filter(c => c.metrics.some(m => ["attempted", "accepted", "published", "publishing", "failed"].includes(m.metric) && m.value !== null && m.value > 0)).length;
    const recentTargets = [
      ...facts.campaigns.filter(c => c.preparedAt).map(c => ({ kind: "campaign" as const, result: c })),
      ...facts.publications.filter(p => p.status !== "draft").map(p => ({ kind: "publication" as const, result: p }))
    ].sort((a, b) => b.result.createdAt.localeCompare(a.result.createdAt) || a.result.id.localeCompare(b.result.id)).slice(0, 8);
    const recentResults: MarketingAnalyticsSnapshot["recentResults"] = recentTargets.map(target => target.kind === "campaign"
      ? { kind: target.kind, result: this.campaignProjection(target.result, this.database().readMarketingAnalyticsRecords("", "", { type: "campaign", id: target.result.id })) }
      : { kind: target.kind, result: this.publicationProjection(target.result) });
    const hasActivityData = channels.some(c => c.metrics.some(m => ["attempted", "accepted", "published", "publishing", "failed"].includes(m.metric) && m.value !== null));
    return { range, measuredAt: now.toISOString(), summary: { published: total("published"), accepted: total("accepted"), usedChannels: hasActivityData ? usedChannels : null }, channels, trends, recentResults };
  }
  campaign(id: string): MarketingCampaignAnalytics {
    this.gate(); if (!this.audienceEnabled()) throw new MarketingError("capability_disabled", "Kampanyalar bu işletmede etkin değil.");
    const facts = this.database().readMarketingAnalyticsRecords("", "", { type: "campaign", id: marketingId(id) });
    if (!facts.campaigns[0]) throw new MarketingError("not_found", "Kampanya bulunamadı.");
    return this.campaignProjection(facts.campaigns[0], facts);
  }
  private publicationFacts(id: string) {
    const facts = this.database().readMarketingAnalyticsRecords("", "", { type: "publication", id: marketingId(id) });
    if (!facts.publications[0]) throw new MarketingError("not_found", "Yayın bulunamadı."); return facts.publications[0];
  }
  publication(id: string): MarketingPublicationAnalytics { this.gate(); return this.publicationProjection(this.publicationFacts(id)); }
  async refreshPublication(id: string): Promise<MarketingPublicationAnalytics> {
    this.gate(); const p = this.publicationFacts(id), view = this.publicationProjection(p), adapter = this.options.provider?.();
    if (!view.canRefresh || !adapter) throw new MarketingError("metrics_unavailable", "Bu yayın için doğrulanmış sağlayıcı metriği erişimi yok.");
    const now = this.now();
    if (view.nextRefreshAt && Date.parse(view.nextRefreshAt) > now.getTime()) throw new MarketingError("metrics_rate_limited", "Metrikleri yenilemek için en az bir dakika bekleyin.");
    const key = `${adapter.cacheKey}:${p.id}`, attempt = { at: now.getTime(), pending: true, failed: false };
    if (this.refreshes.size >= 100) for (const [old, state] of this.refreshes) if (!state.pending) { this.refreshes.delete(old); break; }
    this.refreshes.set(key, attempt); this.lastRefreshAt = now.getTime();
    const operationId = randomUUID(), range = this.publicationRange(p), database = this.database();
    const providerKey = adapter.cacheKey, accountKey = adapter.accountKey;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    desktopLog.info({ scope: "marketing.analytics", event: "marketing.analytics.provider_refresh.started", message: "Yayın metrikleri yenileniyor.", operationId, meta: { publicationId: p.id, channel: p.channel } });
    try {
      const supported = this.providerCapabilities().filter(c => c.availability === "available").map(c => c.metric);
      const result = await Promise.race([
        adapter.fetchMetrics({ type: "publication", id: p.id, providerTargetId: p.providerTargetId }, range, controller.signal),
        new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new MarketingError("metrics_timeout", "Sağlayıcı metrikleri zamanında alınamadı.")); }, Math.max(1, Math.min(15000, this.options.providerTimeoutMs ?? 15000))); })
      ]);
      this.gate();
      const currentAdapter = this.options.provider?.();
      if (this.database() !== database || currentAdapter?.cacheKey !== providerKey || currentAdapter?.accountKey !== accountKey) throw new MarketingError("metrics_account_changed", "Servis yapılandırması değişti.");
      if (!Array.isArray(result) || result.length > engagement.length || new Set(result.map(m => m.metric)).size !== result.length || result.some(m => !supported.includes(m.metric) || !Number.isSafeInteger(m.value) || m.value < 0 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m.measuredAt) || !Number.isFinite(Date.parse(m.measuredAt)) || new Date(m.measuredAt).toISOString() !== m.measuredAt || Date.parse(m.measuredAt) > this.now().getTime())) throw new MarketingError("invalid_metrics", "Sağlayıcı metrikleri doğrulanamadı.");
      database.saveMarketingMetricSnapshots(result.map(m => ({ targetId: p.id, providerKey, metric: m.metric, value: m.value, measuredAt: m.measuredAt, expiresAt: new Date(Date.parse(m.measuredAt) + TTL).toISOString() })), range.startAt, range.endAt);
      attempt.failed = false;
      desktopLog.info({ scope: "marketing.analytics", event: "marketing.analytics.provider_refresh.succeeded", message: "Yayın metrikleri güncellendi.", operationId, meta: { publicationId: p.id, metricCount: result.length } });
    } catch {
      // Untrusted adapter errors can contain secrets/content. Log an application-owned Error only.
      attempt.failed = true;
      desktopLog.warn({ scope: "marketing.analytics", event: "marketing.analytics.provider_refresh.failed", message: "Yayın metrikleri yenilenemedi; önceki ölçüm korundu.", operationId, error: new MarketingError("metrics_refresh_failed", "Sağlayıcı metrikleri yenilenemedi."), meta: { publicationId: p.id } });
    } finally { if (timeout) clearTimeout(timeout); attempt.pending = false; }
    this.gate(); return this.publicationProjection(p);
  }
}
