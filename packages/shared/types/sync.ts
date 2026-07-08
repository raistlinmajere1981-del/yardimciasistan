import type { ISODateTimeString, TimestampedRecord } from "./common";

export type SyncEntityType = "request" | "reservation" | "menu" | "business" | "notification" | "settings";
export type SyncDirection = "pull" | "push" | "two_way";
export type SyncRecordStatus = "pending" | "success" | "failed" | "conflict" | "skipped";

export interface SyncRecord extends TimestampedRecord {
  entity_type: SyncEntityType;
  entity_id: string;
  direction: SyncDirection;
  status: SyncRecordStatus;
  last_attempt_at: ISODateTimeString | "";
  error_message: string;
}
