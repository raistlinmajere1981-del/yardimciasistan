import type { ISODateTimeString, TimestampedRecord } from "./common";

export type KnowledgeCategory = "business" | "rooms" | "restaurant" | "menu" | "faq" | "reservation_rules" | "location" | "other";

export interface AIKnowledgeFile {
  id: string;
  title: string;
  filename: string;
  category: KnowledgeCategory;
  is_active: boolean;
  last_updated_at: ISODateTimeString;
}

export type AIConversationSource = "web_ai" | "desktop_ai" | "android_ai";
export type AIConversationStatus = "open" | "closed" | "converted_to_request" | "archived";
export type AIMessageRole = "system" | "user" | "assistant" | "owner" | "tool";

export interface AIMessage {
  role: AIMessageRole;
  content: string;
  created_at: ISODateTimeString;
}

export interface AIConversation extends TimestampedRecord {
  source: AIConversationSource;
  customer_id: string;
  request_id: string;
  status: AIConversationStatus;
  messages: AIMessage[];
  summary: string;
}

export interface AIReplySuggestion {
  summary: string;
  missing_fields: string[];
  suggested_reply: string;
  is_binding_decision: false;
}
