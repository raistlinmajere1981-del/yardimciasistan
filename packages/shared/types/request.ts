import type { ISODateString, ISODateTimeString, Priority, RecordSource, SyncStatus, TimeString, TimestampedRecord } from "./common";

export type RequestType =
  | "general_info"
  | "pension_reservation"
  | "restaurant_reservation"
  | "breakfast_request"
  | "qr_menu_question"
  | "location_question"
  | "price_question"
  | "other";

export type RequestStatus =
  | "new"
  | "seen"
  | "waiting_owner"
  | "waiting_customer"
  | "approved"
  | "rejected"
  | "answered"
  | "converted_to_reservation"
  | "cancelled"
  | "archived";

export interface CustomerRequest extends TimestampedRecord {
  customer_id: string;
  source: RecordSource;
  request_type: RequestType;
  status: RequestStatus;
  customer_name: string;
  customer_phone: string;
  date_text: string;
  start_date: ISODateString | "";
  end_date: ISODateString | "";
  time: TimeString | "";
  guest_count: number;
  adult_count: number;
  child_count: number;
  message: string;
  ai_summary: string;
  ai_suggested_reply: string;
  whatsapp_message: string;
  assigned_to: string;
  priority: Priority;
  sync_status: SyncStatus;
}

export type RequestRecord = CustomerRequest;
