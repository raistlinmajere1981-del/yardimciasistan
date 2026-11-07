import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import type {
  SaveRequestAiSuggestionInput,
  UpdateRequestStatusInput
} from "../database-types.js";
import { insertDatabaseEvent, type DomainMutationContext } from "./event-store.js";
import { markPreparedWhatsAppMessagesSentInTransaction } from "./prepared-message-store.js";
import { normalizeStatus } from "./request-utils.js";
import type { AndroidActionMutationResult } from "./android-utils.js";
import { getAndroidVersionConflict, nextMutationTimestamp } from "./android-utils.js";
import { insertDeletionEvent } from "./deletion-store.js";
import type { DeletionAndroidEventSink } from "./deletion-store.js";

export function updateRequestStatus(db: DatabaseSync, input: UpdateRequestStatusInput, context: DomainMutationContext & { markPreparedMessagesSent?: boolean } = {}): { ok: true; message: string } | { ok: false; message: string } {
  const requestId = input.requestId.trim();
  const status = normalizeStatus(input.status, ["new", "seen", "waiting_owner", "waiting_customer", "approved", "rejected", "answered", "cancelled", "archived"]);
  if (!requestId || !status) {
    return {
      ok: false,
      message: "Talep durumu için geçerli kayıt ve durum seçilmeli."
    };
  }

  const request = db.prepare("SELECT status, request_type, dealer_customer_id, accepted_order_id FROM requests WHERE id = ? AND deleted_at = ''").get(requestId) as { status?: string; request_type?: string; dealer_customer_id?: string; accepted_order_id?: string } | undefined;
  if (!request) {
    return {
      ok: false,
      message: "Talep bulunamadı."
    };
  }

  if (request.request_type === "table_order" && (status === "approved" || Boolean(request.accepted_order_id))) {
    return { ok: false, message: "Masa siparişleri yalnızca adisyona aktarılarak onaylanabilir." };
  }
  if (request.request_type === "dealer_application" && (status === "approved" || request.dealer_customer_id)) {
    return { ok: false, message: "Bayi başvurusu için Onayla ve Bayi Oluştur işlemini kullanın." };
  }
  const now = context.now ?? new Date().toISOString();
  db.exec("SAVEPOINT request_status");
  try {
    db.prepare("UPDATE requests SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, requestId);
    if (status === "answered" && context.markPreparedMessagesSent !== false) {
      markPreparedWhatsAppMessagesSentInTransaction(db, requestId, now);
    }
    insertDatabaseEvent(db, {
      type: "request.status_changed",
      ...(context.androidAction !== undefined ? { androidAction: context.androidAction } : {}),
      entityType: "request",
      entityId: requestId,
      payload: {
        previous_status: String(request.status ?? ""),
        status
      },
      now
    });
    db.exec("RELEASE request_status");
  } catch (error) {
    db.exec("ROLLBACK TO request_status; RELEASE request_status");
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
          dealer_application_json, documents_json, dealer_customer_id,
          customer_id,
          source,
          request_type,
          table_id, order_items_json, accepted_order_id,
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

export function getRequests(db: DatabaseSync, customerId?: string): SyncedCustomerRequest[] {
  const phone = customerId ? String(db.prepare("SELECT phone FROM customers WHERE id = ? AND deleted_at = ''").get(customerId)?.phone ?? "") : "";
  const rows = db
    .prepare(`
        SELECT
          id,
          dealer_application_json, documents_json, dealer_customer_id,
          customer_id,
          source,
          request_type,
          table_id, order_items_json, accepted_order_id,
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
        WHERE deleted_at = '' AND (? = '' OR customer_id = ? OR (? <> '' AND customer_phone = ?))
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
        LIMIT ?
      `)
    .all(customerId ?? "", customerId ?? "", phone, phone, customerId ? -1 : 80) as Array<Record<string, unknown>>;

  return rows.map((row) => mapRequestRow(row));
}

function mapRequestRow(row: Record<string, unknown>): SyncedCustomerRequest {
  return {
    id: String(row.id ?? ""),
    ...(row.dealer_application_json && row.dealer_application_json !== "null" ? { dealer_application: JSON.parse(String(row.dealer_application_json)) as NonNullable<SyncedCustomerRequest["dealer_application"]> } : {}),
    documents: JSON.parse(String(row.documents_json ?? "[]")) as NonNullable<SyncedCustomerRequest["documents"]>,
    dealer_customer_id: String(row.dealer_customer_id ?? ""),
    customer_id: String(row.customer_id ?? ""),
    source: row.source as SyncedCustomerRequest["source"],
    request_type: row.request_type as SyncedCustomerRequest["request_type"],
    table_id: String(row.table_id ?? ""),
    order_items: JSON.parse(String(row.order_items_json ?? "[]")) as NonNullable<SyncedCustomerRequest["order_items"]>,
    accepted_order_id: String(row.accepted_order_id ?? ""),
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

export function deleteRequestInTransaction(
  db: DatabaseSync,
  requestId: string,
  now: string,
  androidAction?: AndroidSyncAction,
  insertAndroidEvent?: DeletionAndroidEventSink
): AndroidActionMutationResult {
  if (!requestId) {
    return { ok: false, message: "Silinecek talep seçilmemiş." };
  }
  const request = db
    .prepare("SELECT customer_name, updated_at FROM requests WHERE id = ? AND deleted_at = ''")
    .get(requestId) as { customer_name?: string; updated_at?: string } | undefined;
  if (!request) {
    return { ok: false, message: "Talep masaüstü kayıtlarında bulunamadı." };
  }
  const versionConflict = androidAction
    ? getAndroidVersionConflict(androidAction.payload, "expected_updated_at", request.updated_at, "Talep")
    : null;
  if (versionConflict) {
    return versionConflict;
  }

  const updatedAt = nextMutationTimestamp(request.updated_at, now);
  const messageResult = db
    .prepare(`
        UPDATE whatsapp_messages
        SET deleted_at = ?, updated_at = ?, sync_status = 'local_only'
        WHERE request_id = ? AND deleted_at = ''
      `)
    .run(updatedAt, updatedAt, requestId);
  db
    .prepare("UPDATE requests SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
    .run(updatedAt, updatedAt, requestId);
  insertDeletionEvent(db, androidAction, insertAndroidEvent, "request.deleted", "request", requestId, {
    customer_name: String(request.customer_name ?? ""),
    deleted_message_count: Number(messageResult.changes ?? 0)
  }, now);
  return { ok: true, message: androidAction ? "Talep telefondan silindi." : "Talep silindi." };
}


export function markLocalRequestsSynced(db: DatabaseSync, requestIds: string[]) {
  if (requestIds.length === 0) {
    return;
  }

  const statement = db.prepare("UPDATE requests SET sync_status = 'synced' WHERE id = ? AND sync_status != 'local_only'");

  db.exec("BEGIN");
  try {
    for (const id of requestIds) {
      statement.run(id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getDeletedRequestIds(db: DatabaseSync): string[] {
  return (db
    .prepare("SELECT id FROM requests WHERE deleted_at != '' ORDER BY deleted_at ASC, id ASC")
    .all() as Array<{ id?: string }>)
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
}
