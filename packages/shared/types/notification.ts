import type { ISODateString, ISODateTimeString, Priority, RelatedEntityType, TimeString } from "./common";

export type NotificationType =
  | "new_request"
  | "reservation_pending"
  | "reservation_today"
  | "room_status"
  | "table_status"
  | "ai_reply_ready"
  | "whatsapp_message_ready"
  | "sync_problem"
  | "system";

export type NotificationStatus = "unread" | "read" | "archived";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_type: RelatedEntityType;
  related_id: string;
  status: NotificationStatus;
  priority: Priority;
  created_at: ISODateTimeString;
  read_at: ISODateTimeString | "";
}

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
