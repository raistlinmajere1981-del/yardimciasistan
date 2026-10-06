import type { MarketingChannel, MarketingContentDetail, MarketingContentInput, MarketingResult } from "./marketing";
import type { MessagingTemplateBinding } from "./messaging-campaigns";

/** Editorial options only. Recipients, delivery and provider state keep their canonical owners. */
export interface MarketingShareOptions {
  channels: MarketingChannel[];
  audienceId: string;
  whatsapp: { templateName: string; templateLanguage: string; bindings: MessagingTemplateBinding[][] };
  timing: "now" | "scheduled";
  startsLocal: string;
  timezone: string;
}
export interface MarketingShareInput { content: MarketingContentInput; options: MarketingShareOptions }
export interface MarketingShareTarget {
  channel: MarketingChannel;
  targetType: "public_publication" | "audience_campaign";
  targetId: string;
}
export interface MarketingShareDetail {
  content: MarketingContentDetail;
  options: MarketingShareOptions;
  targets: MarketingShareTarget[];
}
export interface MarketingShareOutcome extends MarketingShareTarget {
  state: "accepted" | "scheduled" | "failed";
  message: string;
  scheduleId?: string;
}
export interface MarketingShareBridge {
  getMarketingShare(contentId: string): Promise<MarketingResult<MarketingShareDetail>>;
  saveMarketingShare(input: MarketingShareInput): Promise<MarketingResult<MarketingShareDetail>>;
  submitMarketingShare(contentId: string, expectedRevision: number): Promise<MarketingResult<MarketingShareOutcome[]>>;
}
