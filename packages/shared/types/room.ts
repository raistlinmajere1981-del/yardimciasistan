import type { SoftDeletableRecord, TimestampedRecord } from "./common";

export type RoomStatus = "available" | "occupied" | "reserved" | "cleaning" | "maintenance" | "out_of_service";

export interface Room extends TimestampedRecord, SoftDeletableRecord {
  name: string;
  number: string;
  capacity: number;
  bed_info: string;
  floor: string;
  status: RoomStatus;
  features: string[];
  description: string;
  price_note: string;
  is_active: boolean;
  sort_order: number;
}

export type CustomerRoomStayStatus = "planned" | "checked_in" | "checked_out" | "cancelled";

export interface CustomerRoomStay extends TimestampedRecord, SoftDeletableRecord {
  customer_id: string;
  room_id: string;
  reservation_id: string;
  status: CustomerRoomStayStatus;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  notes: string;
  source: string;
  checked_in_at: string;
  checked_out_at: string;
}
