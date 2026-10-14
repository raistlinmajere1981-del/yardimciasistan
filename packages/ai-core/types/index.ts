import type { BusinessAiContext, BusinessAiCatalogSource } from "@yardimci-asistan/shared";

export type AIProviderName = "disabled" | "openai_compatible";

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  sourcePath: string;
  truncated: boolean;
}

export interface KnowledgeReaderOptions {
  directory: string;
  fileNames?: string[];
  maxCharsPerFile?: number;
  maxTotalChars?: number;
}

export interface AIMessage {
  role: "system" | "developer" | "user" | "assistant";
  content: string;
}

export interface AIProviderConfig {
  enabled: boolean;
  provider: AIProviderName;
  service?: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface AICompletionSuccess {
  ok: true;
  answer: string;
  provider: AIProviderName;
  service?: string;
  model?: string;
  fallback?: boolean;
}

export type AICompletionFailureReason =
  | "configuration"
  | "authentication"
  | "permission"
  | "quota_exhausted"
  | "rate_limited"
  | "service_busy"
  | "timeout"
  | "network"
  | "model_unavailable"
  | "invalid_request"
  | "invalid_response"
  | "provider_error";

export interface AICompletionFailure {
  ok: false;
  message: string;
  provider: AIProviderName;
  service?: string;
  model?: string;
  status?: number;
  error?: string;
  reason?: AICompletionFailureReason;
  providerCode?: string;
  retryAfterSeconds?: number;
  fallbackAnswer: string;
}

export type AICompletionResult = AICompletionSuccess | AICompletionFailure;

export interface WebChatRequest {
  message: string;
  businessName: string;
  knowledgeDocuments: KnowledgeDocument[];
  /** Trusted business authority; omission is an empty capability set, never inferred from knowledge. */
  businessContext?: Pick<BusinessAiContext, "capabilityIds">;
  history?: Array<Pick<AIMessage, "role" | "content">>;
}

export interface OwnerReplyInput {
  businessName: string;
  customerName: string;
  requestType: string;
  dateText: string;
  guestCount: number;
  message: string;
  tone?: "warm" | "formal" | "short";
  instructions?: string;
  /** Trusted business authority; customer message and instructions are intent only. */
  businessContext?: Pick<BusinessAiContext, "capabilityIds"> & Partial<BusinessAiContext>;
  catalogContext?: object & { matches?: Array<{ source: BusinessAiCatalogSource }> };
}

export interface OwnerReplySuggestion {
  summary: string;
  missingFields: string[];
  suggestedReply: string;
  provider?: AIProviderName;
  model?: string;
  fallback?: boolean;
  providerMessage?: string;
  providerReason?: AICompletionFailureReason;
  providerStatus?: number;
  providerCode?: string;
  retryAfterSeconds?: number;
}
