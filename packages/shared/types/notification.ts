import type { ISODateString, ISODateTimeString, RelatedEntityType, TimeString } from "./common";

export type DailyTaskType =
  | "check_in"
  | "check_out"
  | "reservation_followup"
  | "customer_call"
  | "table_reservation"
  | "cleaning"
  | "maintenance"
  | "note"
  | "other";

export type DailyTaskStatus = "pending" | "done" | "cancelled" | "archived";

export interface DailyTask {
  id: string;
  title: string;
  description: string;
  task_type: DailyTaskType;
  status: DailyTaskStatus;
  due_date: ISODateString;
  due_time: TimeString | "";
  related_type: RelatedEntityType;
  related_id: string;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}
