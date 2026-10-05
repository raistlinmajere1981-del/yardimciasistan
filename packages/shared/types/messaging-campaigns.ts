import type { BusinessMessageTemplate, BusinessMessagingProviderId, BusinessMessagingResult } from "./business-messaging";
import type { CustomerDealerStatus } from "./wholesale";
import type { RecordSource } from "./common";

/** D-036: channel is communication semantics; provider is transport. */
export type MessagingChannel = "whatsapp" | "sms";
export type MessagingPurpose = "marketing";
export type MessagingConsentStatus = "unknown" | "opted_in" | "opted_out";
export interface CustomerMessagingPreference {
  businessId: string; customerId: string; channel: MessagingChannel; purpose: MessagingPurpose;
  status: MessagingConsentStatus; source: string; note: string; recordedAt: string; updatedAt: string;
}
export interface SaveMessagingPreferenceInput {
  customerId: string; channel: MessagingChannel; purpose: MessagingPurpose;
  status: MessagingConsentStatus; source: string; note?: string;
}
/** Conjunction only. Empty rules select all canonical, non-deleted Customers. */
export type MessagingSegmentRule =
  | { field: "dealerStatus"; operator: "eq"; value: CustomerDealerStatus }
  | { field: "source"; operator: "eq"; value: RecordSource }
  | { field: "phone"; operator: "present" | "absent" };
export interface MessagingSegmentFilter { version: 1; rules: MessagingSegmentRule[] }
export interface MessagingSegment {
  id: string; businessId: string; name: string; description: string; filterDefinition: MessagingSegmentFilter;
  createdAt: string; updatedAt: string; archivedAt: string;
}
export interface SaveMessagingSegmentInput { id?: string; name: string; description?: string; filterDefinition: MessagingSegmentFilter }
export type MessagingTemplateBinding =
  | { type: "static_text"; value: string }
  | { type: "customer_field"; field: "customer.fullName" | "commercial.companyName" };
export interface MessagingCampaignInput {
  name: string; purpose: MessagingPurpose; channel: MessagingChannel; providerId?: BusinessMessagingProviderId;
  contentId?: string; contentRevision?: number; text?: string;
  segmentId: string; templateName: string; templateLanguage: string; bindings: MessagingTemplateBinding[][];
}
export interface MessagingAudienceCounts {
  matchedCount: number; eligibleCount: number; unknownConsentCount: number; optedOutCount: number;
  missingRecipientCount: number;
}
export interface MessagingCampaign extends MessagingCampaignInput {
  id: string; businessId: string; status: "draft" | "prepared" | "running" | "paused" | "cancelled" | "completed";
  preparedAt: string; cancelledAt: string; createdAt: string; updatedAt: string;
  /** Provider-approved metadata captured at preparation. No resolved Customer values. */
  templateSnapshot: BusinessMessageTemplate | null;
  preparationCounts: MessagingAudienceCounts | null;
}
export type MessagingRecipientSkipReason = "" | "unknown_consent" | "opted_out" | "missing_recipient" | "customer_unavailable";
export interface MessagingCampaignRecipient {
  id: string; campaignId: string; customerId: string; status: "prepared" | "skipped" | "cancelled";
  skipReason: MessagingRecipientSkipReason; createdAt: string; updatedAt: string;
}
/** Durable intent; dispatched means provider acceptance, not delivery. */
export interface MessagingOutboxItem {
  id: string; businessId: string; campaignId: string; campaignRecipientId: string; customerId: string;
  channel: MessagingChannel; providerId: BusinessMessagingProviderId; businessMessageId?: string;
  status: "pending" | "claimed" | "dispatched" | "skipped" | "failed" | "cancelled";
  claimToken: string; claimedAt: string; operationKey: string; attemptCount: number; nextAttemptAt: string; lastError: string; createdAt: string; updatedAt: string;
}
export interface MessagingCampaignDetail {
  errorCounts: { category: string; count: number }[];
  campaign: MessagingCampaign; matchedCount: number; eligibleCount: number; skippedCount: number; pendingOutboxCount: number; claimedOutboxCount: number; dispatchedCount: number; failedCount: number; cancelledCount: number;
}
export interface MessagingCampaignBridge {
  getCustomerMessagingPreference(customerId: string, channel: MessagingChannel, purpose: MessagingPurpose): Promise<BusinessMessagingResult<CustomerMessagingPreference>>;
  saveCustomerMessagingPreference(input: SaveMessagingPreferenceInput): Promise<BusinessMessagingResult<CustomerMessagingPreference>>;
  listMessagingSegments(): Promise<BusinessMessagingResult<MessagingSegment[]>>;
  saveMessagingSegment(input: SaveMessagingSegmentInput): Promise<BusinessMessagingResult<MessagingSegment>>;
  previewMessagingSegment(id: string, channel: MessagingChannel): Promise<BusinessMessagingResult<MessagingAudienceCounts>>;
  listMessagingCampaigns(): Promise<BusinessMessagingResult<MessagingCampaign[]>>;
  createMessagingCampaign(input: MessagingCampaignInput): Promise<BusinessMessagingResult<MessagingCampaign>>;
  getMessagingCampaign(id: string): Promise<BusinessMessagingResult<MessagingCampaignDetail>>;
  previewMessagingCampaign(id: string): Promise<BusinessMessagingResult<MessagingAudienceCounts>>;
  prepareMessagingCampaign(id: string): Promise<BusinessMessagingResult<MessagingCampaignDetail>>;
  startMessagingCampaign(id: string): Promise<BusinessMessagingResult<MessagingCampaignDetail>>;
  pauseMessagingCampaign(id: string): Promise<BusinessMessagingResult<MessagingCampaignDetail>>;
  resumeMessagingCampaign(id: string): Promise<BusinessMessagingResult<MessagingCampaignDetail>>;
  onMessagingCampaignsChanged(listener: () => void): () => void;
  cancelMessagingCampaign(id: string): Promise<BusinessMessagingResult<MessagingCampaignDetail>>;
}
