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

export interface AICompletionFailure {
  ok: false;
  message: string;
  provider: AIProviderName;
  service?: string;
  status?: number;
  error?: string;
  fallbackAnswer: string;
}

export type AICompletionResult = AICompletionSuccess | AICompletionFailure;

export interface WebChatRequest {
  message: string;
  businessName: string;
  knowledgeDocuments: KnowledgeDocument[];
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
}

export interface OwnerReplySuggestion {
  summary: string;
  missingFields: string[];
  suggestedReply: string;
  provider?: AIProviderName;
  model?: string;
  fallback?: boolean;
  providerMessage?: string;
}
