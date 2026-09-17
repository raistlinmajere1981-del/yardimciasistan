import type { DatabaseSync } from "node:sqlite";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type {
  DesktopPreparedMessage,
  MarkWhatsAppMessageSentInput
} from "../database-types.js";
import { insertDatabaseEvent } from "./event-store.js";

export function getAndroidPreparedMessages(db: DatabaseSync, requests: SyncedCustomerRequest[]): DesktopPreparedMessage[] {
  const rows = db
    .prepare(`
        SELECT
          whatsapp_messages.id,
          whatsapp_messages.request_id,
          COALESCE(NULLIF(customers.full_name, ''), NULLIF(requests.customer_name, ''), 'Misafir') AS customer_name,
          COALESCE(NULLIF(whatsapp_messages.phone, ''), NULLIF(customers.phone, ''), requests.customer_phone, '') AS customer_phone,
          whatsapp_messages.message,
          whatsapp_messages.status,
          whatsapp_messages.updated_at
        FROM whatsapp_messages
        LEFT JOIN requests ON requests.id = whatsapp_messages.request_id AND requests.deleted_at = ''
        LEFT JOIN customers ON customers.id = whatsapp_messages.customer_id AND customers.deleted_at = ''
        WHERE whatsapp_messages.direction = 'outgoing'
          AND whatsapp_messages.status = 'prepared'
          AND whatsapp_messages.deleted_at = ''
          AND (
            requests.id IS NULL
            OR requests.status NOT IN ('answered', 'rejected', 'cancelled', 'archived', 'converted_to_reservation')
          )
        ORDER BY whatsapp_messages.updated_at DESC, whatsapp_messages.created_at DESC
        LIMIT 300
      `)
    .all() as Array<Record<string, unknown>>;
  const messages: DesktopPreparedMessage[] = rows.map((row) => ({
    id: String(row.id ?? ""),
    requestId: String(row.request_id ?? ""),
    customerName: String(row.customer_name ?? "Misafir"),
    customerPhone: String(row.customer_phone ?? ""),
    message: String(row.message ?? ""),
    status: String(row.status ?? "prepared"),
    updatedAt: String(row.updated_at ?? "")
  }));

  const requestIdsWithMessage = new Set(
    (db
      .prepare("SELECT request_id FROM whatsapp_messages WHERE direction = 'outgoing' AND request_id != '' AND deleted_at = ''")
      .all() as Array<{ request_id?: string }>)
      .map((row) => String(row.request_id ?? ""))
  );
  for (const request of requests) {
    if (messages.length >= 300 || requestIdsWithMessage.has(request.id)
        || ["answered", "rejected", "cancelled", "archived", "converted_to_reservation"].includes(request.status)) {
      continue;
    }
    const message = String(request.ai_suggested_reply || request.whatsapp_message || "").trim();
    if (!message) {
      continue;
    }
    messages.push({
      id: `message_${request.id}`,
      requestId: request.id,
      customerName: request.customer_name,
      customerPhone: request.customer_phone,
      message,
      status: "prepared",
      updatedAt: request.updated_at
    });
  }
  return messages;
}

export function markWhatsAppMessageSent(db: DatabaseSync, input: MarkWhatsAppMessageSentInput): { ok: true; message: string } | { ok: false; message: string } {
  const requestId = input.requestId.trim();
  const message = input.message.trim();
  if (!requestId || !message) {
    return {
      ok: false,
      message: "Gönderilen WhatsApp mesajı için talep ve metin bilgisi gerekli."
    };
  }

  const preparedMessage = db
    .prepare(`
        SELECT id, message, status
        FROM whatsapp_messages
        WHERE request_id = ?
          AND direction = 'outgoing'
          AND deleted_at = ''
        ORDER BY updated_at DESC
        LIMIT 1
      `)
    .get(requestId) as { id?: string; message?: string; status?: string } | undefined;

  if (!preparedMessage?.id) {
    return {
      ok: false,
      message: "Talebe ait hazır WhatsApp mesajı bulunamadı."
    };
  }

  if (String(preparedMessage.message ?? "").trim() !== message) {
    return {
      ok: false,
      message: "Gönderilen metin yerel AI taslağıyla eşleşmediği için kayıt güncellenmedi."
    };
  }

  if (preparedMessage.status === "sent") {
    return {
      ok: true,
      message: "WhatsApp mesajı daha önce gönderildi olarak kaydedilmiş."
    };
  }

  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db
      .prepare(`
          UPDATE whatsapp_messages
          SET mode = 'webview',
              status = 'sent',
              sent_at = ?,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
      .run(now, now, preparedMessage.id);

    insertDatabaseEvent(db, {
      type: "whatsapp.message_sent",
      entityType: "whatsapp_message",
      entityId: preparedMessage.id,
      payload: {
        request_id: requestId,
        mode: "webview",
        user_approved: true
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
    message: "WhatsApp mesajı gönderildi olarak kaydedildi."
  };
}

export function markPreparedWhatsAppMessagesSentInTransaction(db: DatabaseSync, requestId: string, now: string) {
  db
    .prepare(`
        UPDATE whatsapp_messages
        SET mode = 'manual_copy',
            status = 'sent',
            sent_at = CASE WHEN sent_at = '' THEN ? ELSE sent_at END,
            updated_at = ?,
            sync_status = 'local_only'
        WHERE request_id = ?
          AND direction = 'outgoing'
          AND status = 'prepared'
          AND deleted_at = ''
      `)
    .run(now, now, requestId);
}
