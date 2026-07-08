import type { ISODateTimeString, RelatedEntityType } from "./common";

export type ActorType = "customer" | "owner" | "staff" | "system" | "ai" | "web" | "desktop" | "android" | "whatsapp";

export type EventType =
  | "request.created"
  | "request.seen"
  | "request.updated"
  | "request.answered"
  | "request.converted_to_reservation"
  | "request.cancelled"
  | "request.archived"
  | "reservation.created"
  | "reservation.approved"
  | "reservation.rejected"
  | "reservation.cancelled"
  | "reservation.completed"
  | "reservation.no_show"
  | "room.created"
  | "room.updated"
  | "room.status_changed"
  | "room.deleted"
  | "table.created"
  | "table.updated"
  | "table.status_changed"
  | "table.deleted"
  | "customer.created"
  | "customer.updated"
  | "customer.contacted"
  | "menu.category_created"
  | "menu.category_updated"
  | "menu.item_created"
  | "menu.item_updated"
  | "menu.item_availability_changed"
  | "menu.published"
  | "ai.conversation_started"
  | "ai.message_received"
  | "ai.message_replied"
  | "ai.summary_created"
  | "ai.reply_suggested"
  | "ai.request_created_from_chat"
  | "ai.failed"
  | "whatsapp.message_prepared"
  | "whatsapp.link_opened"
  | "whatsapp.message_sent_by_user"
  | "whatsapp.webview_connected"
  | "whatsapp.webview_disconnected"
  | "notification.created"
  | "notification.read"
  | "notification.archived"
  | "sync.started"
  | "sync.completed"
  | "sync.failed";

export interface SystemEvent<Payload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  type: EventType;
  actor_type: ActorType;
  actor_id: string;
  entity_type: RelatedEntityType;
  entity_id: string;
  payload: Payload;
  created_at: ISODateTimeString;
}
