import type { SoftDeletableRecord, TimestampedRecord } from "./common";

export type TableStatus = "available" | "occupied" | "reserved" | "service" | "waiting_bill" | "cleaning" | "out_of_service";

export interface BusinessTable extends TimestampedRecord, SoftDeletableRecord {
  name: string;
  area: string;
  capacity: number;
  status: TableStatus;
  current_customer_id: string;
  current_reservation_id: string;
  notes: string;
  is_active: boolean;
  sort_order: number;
}
