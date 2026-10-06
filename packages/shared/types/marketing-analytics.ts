import type { MarketingChannel, MarketingResult, MarketingPublication } from "./marketing";
import type { MessagingCampaign } from "./messaging-campaigns";

/** D-041: a read-only projection; names never contain provider-specific vocabulary. */
export type MarketingMetricName = "audience" | "eligible" | "prepared" | "pending" | "attempted" | "accepted" | "delivered" | "read" | "failed" | "skipped" | "publishing" | "published" | "unpublished" | "active_publications" | "total_publications" | "impressions" | "reach" | "views" | "likes" | "comments" | "saves" | "shares" | "clicks";
export type MarketingMetricAvailability = "available" | "no_data" | "unsupported" | "unconfigured" | "disabled" | "permission_denied" | "permission_unverified" | "refresh_failed";
export type MarketingMetricSource = "canonical_operations" | "canonical_delivery" | "provider_snapshot";
export interface MarketingMetric {
  channel: MarketingChannel; metric: MarketingMetricName; value: number | null;
  source: MarketingMetricSource; measuredAt: string | null;
  freshness: "current" | "fresh" | "stale" | "unavailable";
  availability: MarketingMetricAvailability;
}
export type MarketingAnalyticsRangeInput = { preset: "7d" | "30d" | "90d"; timezone?: string } | { preset: "custom"; startDate: string; endDate: string; timezone?: string };
export interface MarketingAnalyticsRange { startDate: string; endDate: string; startAt: string; endAt: string; timezone: string }
export interface MarketingMetricCapability { metric: MarketingMetricName; availability: Exclude<MarketingMetricAvailability, "no_data" | "refresh_failed"> }
export interface MarketingAnalyticsChannel {
  channel: MarketingChannel; serviceState: "ready" | "unconfigured" | "disabled";
  metrics: MarketingMetric[]; providerCapabilities: MarketingMetricCapability[];
  deliveryRate: number | null; readRate: number | null;
}
/** Rates are for the same prepared-recipient cohort, and use canonical delivery evidence. */
export interface MarketingCampaignAnalytics {
  id: string; channel: "whatsapp" | "sms"; status: MessagingCampaign["status"]; createdAt: string;
  metrics: MarketingMetric[];
}
export interface MarketingPublicationAnalytics {
  id: string; channel: "website" | "instagram"; status: MarketingPublication["status"];
  createdAt: string; publishedAt: string | null; updatedAt: string;
  metrics: MarketingMetric[]; canRefresh: boolean; nextRefreshAt: string | null;
}
export interface MarketingAnalyticsSnapshot {
  range: MarketingAnalyticsRange; measuredAt: string;
  summary: { published: number | null; accepted: number | null; usedChannels: number | null };
  channels: MarketingAnalyticsChannel[];
  trends: Array<{ date: string; accepted: number | null; published: number | null }>;
  recentResults: Array<{ kind: "campaign"; result: MarketingCampaignAnalytics } | { kind: "publication"; result: MarketingPublicationAnalytics }>;
}
export interface MarketingAnalyticsBridge {
  getMarketingAnalytics(range: MarketingAnalyticsRangeInput, opened?: boolean): Promise<MarketingResult<MarketingAnalyticsSnapshot>>;
  getMarketingCampaignAnalytics(id: string): Promise<MarketingResult<MarketingCampaignAnalytics>>;
  getMarketingPublicationAnalytics(id: string): Promise<MarketingResult<MarketingPublicationAnalytics>>;
  refreshMarketingPublicationMetrics(id: string): Promise<MarketingResult<MarketingPublicationAnalytics>>;
}
