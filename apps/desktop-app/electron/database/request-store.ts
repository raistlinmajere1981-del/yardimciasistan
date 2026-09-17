import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type {
  SaveRequestAiSuggestionInput,
  UpdateRequestStatusInput
} from "../database-types.js";
import { insertDatabaseEvent } from "./event-store.js";
import { markPreparedWhatsAppMessagesSentInTransaction } from "./prepared-message-store.js";
import { normalizeStatus } from "./request-utils.js";

export function updateRequestStatus(db: DatabaseSync, input: UpdateRequestStatusInput): { ok: true; message: string } | { ok: false; message: string } {
  const requestId = input.requestId.trim();
  const status = normalizeStatus(input.status, ["new", "seen", "waiting_owner", "waiting_customer", "approved", "rejected", "answered", "cancelled", "archived"]);
  if (!requestId || !status) {
    return {
      ok: false,
      message: "Talep durumu için geçerli kayıt ve durum seçilmeli."
    };
  }

  const request = db.prepare("SELECT status FROM requests WHERE id = ? AND deleted_at = ''").get(requestId) as { status?: string } | undefined;
  if (!request) {
    return {
      ok: false,
      message: "Talep bulunamadı."
    };
  }

  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE requests SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, requestId);
    if (status === "answered") {
      markPreparedWhatsAppMessagesSentInTransaction(db, requestId, now);
    }
    insertDatabaseEvent(db, {
      type: "request.status_changed",
      entityType: "request",
      entityId: requestId,
      payload: {
        previous_status: String(request.status ?? ""),
        status
      },
      now
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    message: "Talep durumu güncellendi."
  };
}

export function getRequestById(db: DatabaseSync, requestId: string): SyncedCustomerRequest | null {
  const id = requestId.trim();
  if (!id) {
    return null;
  }

  const row = db
    .prepare(`
        SELECT
          id,
          customer_id,
          source,
          request_type,
          status,
          customer_name,
          customer_phone,
          date_text,
          start_date,
          end_date,
          time,
          guest_count,
          adult_count,
          child_count,
          message,
          ai_summary,
          ai_suggested_reply,
          whatsapp_message,
          assigned_to,
          priority,
          sync_status,
          created_at,
          updated_at
        FROM requests
        WHERE id = ? AND deleted_at = ''
        LIMIT 1
      `)
    .get(id) as Record<string, unknown> | undefined;

  return row ? mapRequestRow(row) : null;
}

export function saveRequestAiSuggestion(db: DatabaseSync, input: SaveRequestAiSuggestionInput): { ok: true; message: string; requestId: string; summary: string; suggestedReply: string; missingFields: string[] } | { ok: false; message: string } {
  const requestId = input.requestId.trim();
  const summary = input.summary.trim();
  const suggestedReply = input.suggestedReply.trim();

  if (!requestId) {
    return {
      ok: false,
      message: "AI taslağı için talep seçilmeli."
    };
  }

  if (!suggestedReply) {
    return {
      ok: false,
      message: "AI cevap taslağı boş olamaz."
    };
  }

  const request = db.prepare("SELECT * FROM requests WHERE id = ? AND deleted_at = ''").get(requestId) as Record<string, unknown> | undefined;
  if (!request) {
    return {
      ok: false,
      message: "Talep bulunamadı."
    };
  }

  const now = new Date().toISOString();
  const existingMessage = db
    .prepare("SELECT id FROM whatsapp_messages WHERE request_id = ? AND direction = 'outgoing' AND deleted_at = '' LIMIT 1")
    .get(requestId) as { id?: string } | undefined;
  const messageId = existingMessage?.id || createId("wa_msg_");
  const missingFields = input.missingFields.map((field) => field.trim()).filter(Boolean);

  db.exec("BEGIN");
  try {
    db
      .prepare(`
          UPDATE requests
          SET ai_summary = ?,
              ai_suggested_reply = ?,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
      .run(summary, suggestedReply, now, requestId);

    db
      .prepare(`
          INSERT INTO whatsapp_messages (
            id,
            request_id,
            customer_id,
            phone,
            direction,
            mode,
            status,
            message,
            prepared_by_ai,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, 'outgoing', 'manual_copy', 'prepared', ?, 1, ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            customer_id = excluded.customer_id,
            phone = excluded.phone,
            status = 'prepared',
            message = excluded.message,
            prepared_by_ai = 1,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
      .run(
        messageId,
        requestId,
        String(request.customer_id ?? ""),
        String(request.customer_phone ?? ""),
        suggestedReply,
        now,
        now
      );

    insertDatabaseEvent(db, {
      type: "ai.reply_suggested",
      entityType: "request",
      entityId: requestId,
      payload: {
        summary,
        missing_fields: missingFields,
        whatsapp_message_id: messageId
      },
      now
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    message: "AI cevap taslağı yenilendi.",
    requestId,
    summary,
    suggestedReply,
    missingFields
  };
}

export function getRequests(db: DatabaseSync): SyncedCustomerRequest[] {
  const rows = db
    .prepare(`
        SELECT
          id,
          customer_id,
          source,
          request_type,
          status,
          customer_name,
          customer_phone,
          date_text,
          start_date,
          end_date,
          time,
          guest_count,
          adult_count,
          child_count,
          message,
          ai_summary,
          ai_suggested_reply,
          whatsapp_message,
          assigned_to,
          priority,
          sync_status,
          created_at,
          updated_at
        FROM requests
        WHERE deleted_at = ''
        ORDER BY
          CASE
            WHEN status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') AND priority = 'urgent' THEN 0
            WHEN status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') AND priority = 'high' THEN 1
            WHEN status = 'new' THEN 2
            WHEN status IN ('seen', 'waiting_owner', 'pending', 'in_progress') AND priority <> 'low' THEN 3
            WHEN status IN ('seen', 'waiting_owner', 'pending', 'in_progress') THEN 4
            ELSE 5
          END,
          created_at DESC
        LIMIT 80
      `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => mapRequestRow(row));
}

function mapRequestRow(row: Record<string, unknown>): SyncedCustomerRequest {
  return {
    id: String(row.id ?? ""),
    customer_id: String(row.customer_id ?? ""),
    source: row.source as SyncedCustomerRequest["source"],
    request_type: row.request_type as SyncedCustomerRequest["request_type"],
    status: row.status as SyncedCustomerRequest["status"],
    customer_name: String(row.customer_name ?? ""),
    customer_phone: String(row.customer_phone ?? ""),
    date_text: String(row.date_text ?? ""),
    start_date: String(row.start_date ?? ""),
    end_date: String(row.end_date ?? ""),
    time: String(row.time ?? ""),
    guest_count: Number(row.guest_count ?? 0),
    adult_count: Number(row.adult_count ?? 0),
    child_count: Number(row.child_count ?? 0),
    message: String(row.message ?? ""),
    ai_summary: String(row.ai_summary ?? ""),
    ai_suggested_reply: String(row.ai_suggested_reply ?? ""),
    whatsapp_message: String(row.whatsapp_message ?? ""),
    assigned_to: String(row.assigned_to ?? ""),
    priority: row.priority as SyncedCustomerRequest["priority"],
    sync_status: row.sync_status as SyncedCustomerRequest["sync_status"],
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? "")
  };
}
