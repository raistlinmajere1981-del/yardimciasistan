import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";

export interface DomainMutationContext {
  now?: string;
  androidAction?: AndroidSyncAction;
}

export function insertDatabaseEvent(db: DatabaseSync, input: {
  type: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  now: string;
  actorType?: "desktop" | "android";
  actorId?: string;
  androidAction?: AndroidSyncAction;
}) {
  db
    .prepare(`
        INSERT INTO events (
          id,
          type,
          actor_type,
          actor_id,
          entity_type,
          entity_id,
          payload_json,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
      `)
    .run(
      createId("event_"),
      input.type,
      input.androidAction ? "android" : input.actorType ?? "desktop",
      input.androidAction?.device_id ?? input.actorId ?? "",
      input.entityType,
      input.entityId,
      JSON.stringify(input.androidAction ? { ...input.payload, android_action_id: input.androidAction.id } : input.payload),
      input.now,
      input.now
    );
}
