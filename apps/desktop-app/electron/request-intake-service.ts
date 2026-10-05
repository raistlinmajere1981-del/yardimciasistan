import type { DatabaseSync } from "node:sqlite";
import {
  canConvertRequestToReservation,
  createId,
  getRequestReservationType,
  isRequestTypeAvailable,
  normalizePhone,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type {
  CreateManualRequestInput
} from "./database-types.js";
import { insertDatabaseEvent } from "./database/event-store.js";
import {
  buildManualRequestReply,
  buildReservationNotes,
  buildReservationTitle,
  getCustomerTagsForSource,
  normalizeDateInput,
  normalizeInteger,
  normalizePriority,
  normalizeRequestType,
  normalizeTimeInput
} from "./database/request-utils.js";

type StoredCreateManualRequestResult =
  | { ok: true; message: string; savedId: string }
  | { ok: false; message: string };

type StoredRequestReservationConversionResult =
  | { ok: true; message: string; reservationId: string }
  | { ok: false; message: string };

export function ensureCustomerForRequest(db: DatabaseSync, request: Record<string, unknown>, now: string): string {
  const requestCustomerId = String(request.customer_id ?? "").trim();
  if (requestCustomerId) {
    const existing = db.prepare("SELECT id FROM customers WHERE id = ? AND deleted_at = ''").get(requestCustomerId);
    if (existing) {
      return requestCustomerId;
    }
  }

  const phone = String(request.customer_phone ?? "").trim();
  const existingByPhone = phone
    ? (db.prepare("SELECT id FROM customers WHERE phone = ? AND deleted_at = '' LIMIT 1").get(phone) as { id?: string } | undefined)
    : undefined;
  const customerId = existingByPhone?.id || requestCustomerId || createId("customer_");
  const source = String(request.source ?? "web_form").trim() || "web_form";

  db
    .prepare(`
        INSERT INTO customers (
          id,
          full_name,
          phone,
          source,
          notes,
          tags_json,
          last_contact_at,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
        ON CONFLICT(id) DO UPDATE SET
          full_name = excluded.full_name,
          phone = excluded.phone,
          source = excluded.source,
          notes = excluded.notes,
          tags_json = excluded.tags_json,
          last_contact_at = excluded.last_contact_at,
          updated_at = excluded.updated_at,
          deleted_at = '',
          sync_status = 'local_only'
      `)
    .run(
      customerId,
      String(request.customer_name ?? "Misafir").trim() || "Misafir",
      phone,
      source,
      String(request.message ?? ""),
      JSON.stringify(getCustomerTagsForSource(source)),
      now,
      now,
      now
    );

  return customerId;
}

export function createManualRequest(
  db: DatabaseSync,
  input: CreateManualRequestInput,
  enabledCapabilities: BusinessCapability[]
): StoredCreateManualRequestResult {
  const requestType = normalizeRequestType(input.requestType);
  if (!isRequestTypeAvailable(enabledCapabilities, requestType)) {
    return {
      ok: false,
      message: "Bu talep türü işletmenin etkin yeteneklerinde kullanılamıyor."
    };
  }
  const customerName = input.customerName.trim();
  if (!customerName) {
    return {
      ok: false,
      message: "Müşteri adı gerekli."
    };
  }

  const phone = normalizePhone(input.customerPhone);
  if (!phone.ok) {
    return {
      ok: false,
      message: phone.error
    };
  }

  const dateText = input.dateText.trim();
  const startDate = normalizeDateInput(input.startDate);
  const endDate = normalizeDateInput(input.endDate);
  const time = normalizeTimeInput(input.time);
  const message = input.message.trim();
  const guestCount = normalizeInteger(input.guestCount);
  const adultCount = Math.max(0, normalizeInteger(input.adultCount));
  const childCount = Math.max(0, normalizeInteger(input.childCount));

  if (input.startDate.trim() && !startDate) {
    return {
      ok: false,
      message: "Giriş tarihi YYYY-AA-GG formatında olmalı."
    };
  }

  if (input.endDate.trim() && !endDate) {
    return {
      ok: false,
      message: "Çıkış tarihi YYYY-AA-GG formatında olmalı."
    };
  }

  if (startDate && endDate && endDate < startDate) {
    return {
      ok: false,
      message: "Çıkış tarihi giriş tarihinden önce olamaz."
    };
  }

  if (input.time.trim() && !time) {
    return {
      ok: false,
      message: "Saat HH:DD formatında olmalı."
    };
  }

  if (guestCount < 1) {
    return {
      ok: false,
      message: "Kişi sayısı en az 1 olmalı."
    };
  }

  if (!dateText && !startDate && !message) {
    return {
      ok: false,
      message: "Talep için tarih notu, giriş tarihi veya not girin."
    };
  }

  const now = new Date().toISOString();
  const request: SyncedCustomerRequest = {
    id: createId("request_"),
    customer_id: "",
    source: "manual",
    request_type: requestType as SyncedCustomerRequest["request_type"],
    status: "new",
    customer_name: customerName,
    customer_phone: phone.e164,
    date_text: dateText,
    start_date: startDate,
    end_date: endDate,
    time,
    guest_count: guestCount,
    adult_count: adultCount,
    child_count: childCount,
    message,
    ai_summary: "",
    ai_suggested_reply: "",
    whatsapp_message: buildManualRequestReply(customerName),
    assigned_to: "",
    priority: normalizePriority(input.priority) as SyncedCustomerRequest["priority"],
    sync_status: "local_only",
    created_at: now,
    updated_at: now
  };

  db.exec("BEGIN");
  try {
    const customerId = ensureCustomerForRequest(db, request as unknown as Record<string, unknown>, now);
    request.customer_id = customerId;

    db
      .prepare(`
          INSERT INTO requests (
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
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
      .run(
        request.id,
        request.customer_id,
        request.source,
        request.request_type,
        request.status,
        request.customer_name,
        request.customer_phone,
        request.date_text,
        request.start_date,
        request.end_date,
        request.time,
        request.guest_count,
        request.adult_count,
        request.child_count,
        request.message,
        request.ai_summary,
        request.ai_suggested_reply,
        request.whatsapp_message,
        request.assigned_to,
        request.priority,
        request.created_at,
        request.updated_at,
        request.sync_status
      );

    insertDatabaseEvent(db, {
      type: "request.created",
      entityType: "request",
      entityId: request.id,
      payload: {
        source: request.source,
        request_type: request.request_type,
        customer_id: customerId
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
    message: "Manuel talep kaydedildi.",
    savedId: request.id
  };
}

export function convertRequestToReservation(
  db: DatabaseSync,
  requestId: string,
  enabledCapabilities: BusinessCapability[]
): StoredRequestReservationConversionResult {
  const id = requestId.trim();
  if (!id) {
    return {
      ok: false,
      message: "Rezervasyona çevrilecek talep seçilmeli."
    };
  }

  const request = db.prepare("SELECT * FROM requests WHERE id = ? AND deleted_at = ''").get(id) as Record<string, unknown> | undefined;
  if (!request) {
    return {
      ok: false,
      message: "Talep bulunamadı."
    };
  }

  const requestType = String(request.request_type ?? "");
  const reservationType = getRequestReservationType(requestType);
  if (!reservationType || !canConvertRequestToReservation(enabledCapabilities, requestType)) {
    return {
      ok: false,
      message: reservationType
        ? "Bu rezervasyon türü işletmenin etkin yeteneklerinde kullanılamıyor."
        : "Bu talep türü rezervasyona dönüştürülemez."
    };
  }

  const existingReservation = db.prepare("SELECT id FROM reservations WHERE request_id = ? AND deleted_at = '' LIMIT 1").get(id) as { id?: string } | undefined;
  const now = new Date().toISOString();
  const reservationId = existingReservation?.id || createId("reservation_");
  const title = buildReservationTitle(request, reservationType);
  let customerId = "";

  db.exec("BEGIN");
  try {
    customerId = ensureCustomerForRequest(db, request, now);
    db
      .prepare(`
          INSERT INTO reservations (
            id,
            request_id,
            customer_id,
            reservation_type,
            status,
            title,
            start_date,
            end_date,
            time,
            guest_count,
            adult_count,
            child_count,
            room_ids_json,
            table_ids_json,
            notes,
            price_note,
            payment_status,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, 'not_required', ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            customer_id = excluded.customer_id,
            reservation_type = excluded.reservation_type,
            status = 'approved',
            title = excluded.title,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            time = excluded.time,
            guest_count = excluded.guest_count,
            adult_count = excluded.adult_count,
            child_count = excluded.child_count,
            notes = excluded.notes,
            price_note = excluded.price_note,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
      .run(
        reservationId,
        id,
        customerId,
        reservationType,
        title,
        String(request.start_date ?? ""),
        String(request.end_date ?? ""),
        String(request.time ?? ""),
        Number(request.guest_count ?? 1),
        Number(request.adult_count ?? 0),
        Number(request.child_count ?? 0),
        buildReservationNotes(request),
        "Fiyat ve kaynak ataması işletme sahibi tarafından netleştirilecek.",
        now,
        now
      );

    db
      .prepare(`
          UPDATE requests
          SET status = 'converted_to_reservation',
              customer_id = ?,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
      .run(customerId, now, id);

    insertDatabaseEvent(db, {
      type: "request.converted_to_reservation",
      entityType: "request",
      entityId: id,
      payload: {
        reservation_id: reservationId,
        customer_id: customerId,
        previous_status: String(request.status ?? "")
      },
      now
    });
    insertDatabaseEvent(db, {
      type: "reservation.approved",
      entityType: "reservation",
      entityId: reservationId,
      payload: {
        request_id: id,
        customer_id: customerId,
        reservation_type: reservationType
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
    message: existingReservation ? "Mevcut rezervasyon onaylandı." : "Talep rezervasyona çevrildi ve onaylandı.",
    reservationId
  };
}


export function upsertSyncedRequests(
  db: DatabaseSync,
  requests: SyncedCustomerRequest[],
  nextCursor?: number
) {
  if (requests.length === 0 && nextCursor === undefined) {
    return;
  }

  const statement = db.prepare(`
    INSERT INTO requests (
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
      created_at,
      updated_at,
      sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      customer_name = excluded.customer_name,
      customer_phone = excluded.customer_phone,
      date_text = excluded.date_text,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      time = excluded.time,
      guest_count = excluded.guest_count,
      adult_count = excluded.adult_count,
      child_count = excluded.child_count,
      message = excluded.message
    WHERE requests.deleted_at = '' AND requests.source = excluded.source
  `);

  db.exec("BEGIN");
  try {
    for (const request of requests) {
      // Web owns ingress facts; identity and post-import operator/AI decisions
      // (including customer linkage, summary, drafts and updated_at) stay local.
      // Replay must not recreate a deleted/detached customer either.
      const existing = db.prepare("SELECT customer_id FROM requests WHERE id = ?").get(request.id) as { customer_id: string } | undefined;
      const customerId = existing ? existing.customer_id
        : ensureCustomerForRequest(db, request as unknown as Record<string, unknown>, new Date().toISOString());
      statement.run(
        request.id,
        customerId,
        request.source,
        request.request_type,
        request.status,
        request.customer_name,
        request.customer_phone,
        request.date_text,
        request.start_date,
        request.end_date,
        request.time,
        request.guest_count,
        request.adult_count,
        request.child_count,
        request.message,
        request.ai_summary,
        request.ai_suggested_reply,
        request.whatsapp_message,
        request.assigned_to,
        request.priority,
        request.created_at,
        request.updated_at,
        "synced"
      );
    }
    if (nextCursor !== undefined) {
      const now = new Date().toISOString();
      db
        .prepare(`
          UPDATE sync_runtime
          SET request_cursor = MAX(request_cursor, ?), updated_at = ?
          WHERE id = 'primary'
        `)
        .run(Math.max(0, Math.trunc(nextCursor)), now);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
