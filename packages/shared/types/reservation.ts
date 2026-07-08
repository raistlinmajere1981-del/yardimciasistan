import type { ISODateString, TimeString, TimestampedRecord } from "./common";

export type ReservationType = "room" | "table" | "room_and_table" | "event" | "other";
export type ReservationStatus = "pending" | "approved" | "rejected" | "cancelled" | "completed" | "no_show";
export type PaymentStatus = "not_required" | "unpaid" | "partial" | "paid" | "refunded";

export interface Reservation extends TimestampedRecord {
  request_id: string;
  customer_id: string;
  reservation_type: ReservationType;
  status: ReservationStatus;
  title: string;
  start_date: ISODateString;
  end_date: ISODateString | "";
  time: TimeString | "";
  guest_count: number;
  adult_count: number;
  child_count: number;
  room_ids: string[];
  table_ids: string[];
  notes: string;
  price_note: string;
  payment_status: PaymentStatus;
}
