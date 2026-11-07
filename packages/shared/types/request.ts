import type { ISODateString, Priority, RecordSource, SyncStatus, TimeString, TimestampedRecord } from "./common";

export type RequestType =
  | "dealer_application"
  | "general_info"
  | "pension_reservation"
  | "restaurant_reservation"
  | "breakfast_request"
  | "qr_menu_question"
  | "table_order"
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
  dealer_application?: DealerApplication;
  dealer_customer_id?: string;
  documents?: RequestDocument[];
  customer_id: string;
  source: RecordSource;
  request_type: RequestType;
  table_id?: string;
  order_items?: Array<{ menu_entry_id: string; quantity: number; note: string; name: string; unit_price: number; currency: string }>;
  accepted_order_id?: string;
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

export interface DealerApplication {
  company_name: string;
  authorized_person: string;
  email: string;
  tax_office: string;
  tax_number: string;
}
export interface RequestDocument {
  id: string;
  name: string;
  kind: "tax_certificate" | "activity_certificate" | "authorization" | "other";
  mime: "application/pdf" | "image/jpeg" | "image/png";
  size: number;
  sha256: string;
}
