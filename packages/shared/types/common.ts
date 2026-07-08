export type ISODateString = string;
export type ISODateTimeString = string;
export type TimeString = string;
export type CurrencyCode = "TRY" | "USD" | "EUR" | string;

export interface TimestampedRecord {
  id: string;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export interface SoftDeletableRecord {
  deleted_at?: ISODateTimeString | "";
  is_active?: boolean;
}

export type RecordSource =
  | "web_form"
  | "web_ai"
  | "whatsapp"
  | "manual"
  | "phone"
  | "android";

export type SyncStatus = "local_only" | "pending" | "synced" | "failed" | "conflict";

export type Priority = "low" | "normal" | "high" | "urgent";

export type RelatedEntityType =
  | "request"
  | "reservation"
  | "customer"
  | "room"
  | "table"
  | "menu"
  | "ai_conversation"
  | "whatsapp_message"
  | "notification"
  | "sync"
  | "settings"
  | "system";
