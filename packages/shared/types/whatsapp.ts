import type { ISODateTimeString, TimestampedRecord } from "./common";

export type WhatsAppDirection = "incoming" | "outgoing";
export type WhatsAppMessageMode = "wa_link" | "manual_copy" | "webview" | "official_api";
export type WhatsAppMessageStatus = "prepared" | "opened" | "sent_by_user" | "failed" | "cancelled";

export interface WhatsAppMessage extends TimestampedRecord {
  request_id: string;
  customer_id: string;
  phone: string;
  direction: WhatsAppDirection;
  mode: WhatsAppMessageMode;
  status: WhatsAppMessageStatus;
  message: string;
  prepared_by_ai: boolean;
  sent_at: ISODateTimeString | "";
}
