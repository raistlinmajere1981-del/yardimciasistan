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
