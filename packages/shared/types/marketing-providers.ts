/** D-039: credentials are write-only. Configuration reads contain presence flags only. */
export const INSTAGRAM_API_VERSION = "v25.0";
export const INSTAGRAM_PUBLISH_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"] as const;
export interface SmsConfigurationInput {
  enabled: boolean; senderId: string; apiKey?: string; apiHash?: string; clearApiKey?: boolean; clearApiHash?: boolean;
  iysList: "BIREYSEL" | "TACIR";
}
export interface SmsConfiguration {
  providerId: "iletimerkezi"; enabled: boolean; senderId: string; iysList: "BIREYSEL" | "TACIR";
  hasApiKey: boolean; hasApiHash: boolean; configured: boolean;
}
export interface InstagramConfiguration {
  providerId: "instagram_api"; enabled: boolean; accountId: string; apiVersion: string; hasSecret: boolean; configured: boolean;
  username: string; expiresAt: string;
}
export type InstagramOAuthProgress = {status:"pending"} | {status:"connected";username:string} | {status:"failed";message:string};
export interface MarketingProviderConnectionResult {
  ok: boolean; message: string; testedAt: string; username?: string; accountType?: "BUSINESS" | "MEDIA_CREATOR";
  senderIds?: string[];
}
export const emptySmsConfiguration = (): SmsConfiguration => ({ providerId: "iletimerkezi", enabled: false, senderId: "", iysList: "BIREYSEL", hasApiKey: false, hasApiHash: false, configured: false });
export const emptyInstagramConfiguration = (): InstagramConfiguration => ({ providerId: "instagram_api", enabled: false, accountId: "", username: "", expiresAt: "", apiVersion: INSTAGRAM_API_VERSION, hasSecret: false, configured: false });
export interface MarketingProviderBridge {
  getSmsConfiguration(): Promise<SmsConfiguration>;
  getInstagramConfiguration(): Promise<InstagramConfiguration>;
  testSmsConnection(input?: SmsConfigurationInput): Promise<MarketingProviderConnectionResult>;
  listSmsSenderIds(input?: SmsConfigurationInput): Promise<import("./marketing").MarketingResult<string[]>>;
  testInstagramConnection(): Promise<MarketingProviderConnectionResult>;
  beginInstagramOAuth(): Promise<{ok:boolean;message:string}>;
  pollInstagramOAuth(): Promise<InstagramOAuthProgress>;
  cancelInstagramOAuth(): Promise<{ok:boolean;message:string}>;
  disconnectInstagramOAuth(): Promise<InstagramConfiguration>;
}
export interface InstagramPublicationState {
  publicationId: string; accountKey: string; containerId: string; providerMediaId: string; permalink: string;
  createSubmitted: boolean; publishSubmitted: boolean; failureCode: string;
  /** Expiring staging capability, deliberately absent from renderer projections. */
  stageToken: string; stageExpiresAt: string; stageBaseUrl: string;
}
