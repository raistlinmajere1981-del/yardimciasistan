/** D-038: channel identities are independent of provider adapters. */
export const MARKETING_CHANNELS = ["website", "whatsapp", "sms", "instagram"] as const;
export type MarketingChannel = typeof MARKETING_CHANNELS[number];
export type MarketingAiCapability = "text_generation" | "rewrite" | "channel_adaptation" | "image_generation";
export type MarketingPlacement = "homepage_feature";
export interface MarketingContent {
  id: string; businessId: string; title: string; purpose: "announcement" | "promotion";
  source: "manual" | "ai"; masterText: string; status: "draft" | "ready" | "archived";
  revision: number; createdAt: string; updatedAt: string;
}
export interface MarketingContentVariant {
  contentId: string; channel: MarketingChannel; text: string; title?: string;
  metadata: { version: 1; adaptation?: "manual" | "ai" };
  createdAt: string; updatedAt: string;
}
export interface MediaAsset {
  id: string; businessId: string; kind: "image"; source: "upload" | "ai";
  storageRef: string; mimeType: string; width: number; height: number; fileSize: number;
  altText: string; aiGenerationMetadata?: { providerId: string; modelId: string; intent: "marketing_image" };
  contentHash: string; createdAt: string; archivedAt?: string;
}
/** Preview bytes are ephemeral bridge projections, never canonical content/publication fields. */
export interface MarketingAssetView extends Omit<MediaAsset, "storageRef" | "contentHash"> {
  previewUrl: string; usageCount: number; activePublicationCount: number;
}
export interface MarketingContentMedia { contentId: string; mediaAssetId: string; sortOrder: number; role?: "primary" | "gallery" }
export interface MarketingPublicationMedia { publicationId: string; mediaAssetId: string; sortOrder: number }
export interface MarketingPublication {
  id: string; businessId: string; contentId: string; channel: MarketingChannel;
  status: "draft" | "publishing" | "published" | "unpublished" | "failed";
  placement: MarketingPlacement; title: string; text: string; mediaAssetIds: string[];
  revision: number; publishedRevision: number; desiredPublished: boolean;
  publishedAt: string; unpublishedAt: string; createdAt: string; updatedAt: string;
}
export interface MarketingChannelDefinition {
  id: MarketingChannel; displayName: string; enabled: boolean; configured: boolean;
  supportsText: boolean; supportsImages: boolean; maxImages?: number;
  supportsDirectPublish: boolean; supportsUnpublish: boolean; supportsEditPublished: boolean;
  connectionTestAvailable: boolean; state: "ready" | "unconfigured" | "planned" | "disabled";
}
export type MarketingChannelRegistry = readonly MarketingChannelDefinition[];
export interface MarketingContentDetail { content: MarketingContent; variants: MarketingContentVariant[]; media: MarketingContentMedia[] }
export interface MarketingContentInput {
  id?: string; expectedRevision?: number; source?: "manual" | "ai"; title: string; purpose: MarketingContent["purpose"];
  masterText: string; status: MarketingContent["status"]; variants: Array<Pick<MarketingContentVariant, "channel" | "text" | "title" | "metadata">>;
  mediaAssetIds: string[];
}
export interface MarketingPublicationInput {
  id?: string; expectedRevision?: number; contentId: string; channel: MarketingChannel; placement: MarketingPlacement;
  title: string; text: string; mediaAssetIds: string[];
}
export interface MarketingAiInput {
  capability: MarketingAiCapability; channel?: MarketingChannel; text: string; instructions: string;
  aspect?: "square" | "landscape" | "portrait"; styleHints?: string;
}
export interface MarketingAiResult { text?: string; asset?: MarketingAssetView }
export interface MarketingStudioSnapshot {
  contents: MarketingContentDetail[]; assets: MarketingAssetView[]; publications: MarketingPublication[];
  channels: MarketingChannelRegistry; aiCapabilities: MarketingAiCapability[];
}
export interface MarketingWebsiteProjection {
  version: 1; enabled: boolean; publications: Array<{
    id: string; channel: "website"; placement: MarketingPlacement; revision: number;
    published: boolean; title: string; text: string; images: Array<{ assetId: string; url: string; altText: string; width: number; height: number; sortOrder: number }>;
  }>;
}
export type MarketingResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };
export interface MarketingBridge {
  getMarketingChannels(): Promise<MarketingResult<MarketingChannelRegistry>>;
  getMarketingStudio(): Promise<MarketingResult<MarketingStudioSnapshot>>;
  saveMarketingContent(input: MarketingContentInput): Promise<MarketingResult<MarketingContentDetail>>;
  uploadMarketingAssets(): Promise<MarketingResult<MarketingAssetView[]>>;
  manageMarketingAsset(id: string, action: "archive" | "delete", altText?: string): Promise<MarketingResult<void>>;
  generateMarketingAi(input: MarketingAiInput): Promise<MarketingResult<MarketingAiResult>>;
  saveMarketingPublication(input: MarketingPublicationInput): Promise<MarketingResult<MarketingPublication>>;
  publishMarketingPublication(id: string, expectedRevision: number): Promise<MarketingResult<MarketingPublication>>;
  unpublishMarketingPublication(id: string, expectedRevision: number): Promise<MarketingResult<MarketingPublication>>;
  testMarketingWebsiteConnection(): Promise<MarketingResult<{ connected: boolean; message: string }>>;
}
