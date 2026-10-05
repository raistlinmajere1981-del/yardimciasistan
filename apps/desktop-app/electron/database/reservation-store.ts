import { parseStoredStringArray } from "./string-array-utils.js";
import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type {
  DesktopReservation,
  SaveManualRestaurantReservationInput
} from "../database-types.js";
import { insertDatabaseEvent, type DomainMutationContext } from "./event-store.js";
import { normalizeLimitedText } from "./customer-utils.js";
import {
  normalizeDateInput,
  normalizeInteger,
  normalizeTimeInput
} from "./request-utils.js";

export function getReservations(db: DatabaseSync, scope: "recent" | "active" = "recent"): DesktopReservation[] {
  const rows = db
    .prepare(`
        SELECT
          reservations.id,
          reservations.request_id,
          reservations.customer_id,
          customers.full_name AS customer_name,
          customers.phone AS customer_phone,
          reservations.reservation_type,
          reservations.status,
          reservations.title,
          reservations.start_date,
          reservations.end_date,
          reservations.time,
          reservations.guest_count,
          reservations.adult_count,
          reservations.child_count,
          reservations.room_ids_json,
          reservations.table_ids_json,
          reservations.notes,
          reservations.price_note,
          reservations.payment_status,
          reservations.updated_at
        FROM reservations
        LEFT JOIN customers ON customers.id = reservations.customer_id AND customers.deleted_at = ''
        WHERE reservations.deleted_at = ''
        ${scope === "active" ? "AND reservations.status IN ('pending', 'approved')" : ""}
        ORDER BY reservations.start_date ASC, reservations.time ASC, reservations.created_at DESC
        ${scope === "recent" ? "LIMIT 80" : ""}
      `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => mapReservationRow(row));
}

export function getActiveResourceReservationTitles(db: DatabaseSync, resourceType: "room" | "table"): Map<string, string> {
  const map = new Map<string, string>();
  const rows = db
    .prepare(`
        SELECT id, title, room_ids_json, table_ids_json
        FROM reservations
        WHERE deleted_at = ''
          AND status IN ('pending', 'approved')
        ORDER BY start_date ASC, time ASC, created_at DESC
      `)
    .all() as Array<Record<string, unknown>>;

  for (const row of rows) {
    const ids = parseStoredStringArray(resourceType === "room" ? row.room_ids_json : row.table_ids_json);
    for (const id of ids) {
      if (!map.has(id)) {
        map.set(id, String(row.title ?? ""));
      }
    }
  }

  return map;
}

function mapReservationRow(row: Record<string, unknown>): DesktopReservation {
  return {
    id: String(row.id ?? ""),
    requestId: String(row.request_id ?? ""),
    customerId: String(row.customer_id ?? ""),
    customerName: String(row.customer_name ?? ""),
    customerPhone: String(row.customer_phone ?? ""),
    reservationType: String(row.reservation_type ?? ""),
    status: String(row.status ?? "pending"),
    title: String(row.title ?? ""),
    startDate: String(row.start_date ?? ""),
    endDate: String(row.end_date ?? ""),
    time: String(row.time ?? ""),
    guestCount: Number(row.guest_count ?? 0),
    adultCount: Number(row.adult_count ?? 0),
    childCount: Number(row.child_count ?? 0),
    roomIds: parseStoredStringArray(row.room_ids_json),
    tableIds: parseStoredStringArray(row.table_ids_json),
    notes: String(row.notes ?? ""),
    priceNote: String(row.price_note ?? ""),
    paymentStatus: String(row.payment_status ?? "not_required"),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function saveManualRestaurantReservation(db: DatabaseSync, input: SaveManualRestaurantReservationInput,
  context: DomainMutationContext & { reservationId?: string; newReservationId?: string } = {}): { ok: true; message: string } | { ok: false; message: string } {
  const customerId = String(input?.customerId ?? "").trim();
  const tableId = String(input?.tableId ?? "").trim();
  const date = normalizeDateInput(String(input?.date ?? ""));
  const time = normalizeTimeInput(String(input?.time ?? ""));
  const guestCount = normalizeInteger(input?.guestCount);
  const notes = normalizeLimitedText(input?.notes, 2000);
  const existing = context.reservationId ? db.prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''")
    .get(context.reservationId) as Record<string, unknown> | undefined : undefined;
  if (context.reservationId && !existing) return { ok: false, message: "Düzenlenecek restoran rezervasyonu bulunamadı." };
  const previousTableIds = parseStoredStringArray(existing?.table_ids_json);
  const editableSource = !existing || /^(manual|android):/.test(String(existing.request_id));
  if (existing) {
    if (!["table", "breakfast"].includes(String(existing.reservation_type))) return { ok: false, message: "Bu işlem yalnız restoran rezervasyonlarında kullanılabilir." };
    if (!["pending", "approved"].includes(String(existing.status))) return { ok: false, message: "Tamamlanmış veya iptal edilmiş rezervasyon düzenlenemez." };
    if (previousTableIds.length > 1) return { ok: false, message: "Birden fazla masaya bağlı rezervasyon telefondan düzenlenemez." };
    if (String(existing.customer_id) !== customerId) return { ok: false, message: "Rezervasyonun müşteri kaydı değiştirilemez." };
    if (!editableSource && (existing.start_date !== date || existing.time !== time || Number(existing.guest_count) !== guestCount)) {
      return { ok: false, message: "Web talebinden oluşan rezervasyonda tarih, saat ve kişi bilgisi değiştirilemez." };
    }
  }

  if (!customerId || !date || !time || guestCount < 1 || guestCount > 99) {
    return { ok: false, message: "Müşteri, tarih, saat ve geçerli kişi sayısı zorunludur." };
  }

  const customer = db
    .prepare("SELECT id, full_name, phone FROM customers WHERE id = ? AND deleted_at = ''")
    .get(customerId) as { id?: string; full_name?: string; phone?: string } | undefined;
  if (!customer) {
    return { ok: false, message: "Rezervasyon için seçilen müşteri bulunamadı." };
  }

  if (tableId) {
    const table = db
      .prepare("SELECT id, name, capacity, status, is_active FROM tables WHERE id = ? AND deleted_at = ''")
      .get(tableId) as Record<string, unknown> | undefined;
    if (!table || Number(table.is_active ?? 0) !== 1) {
      return { ok: false, message: "Seçilen masa aktif değil veya bulunamadı." };
    }
    if (String(table.status ?? "") === "maintenance") {
      return { ok: false, message: "Bakım durumundaki masaya rezervasyon atanamaz." };
    }
    const capacity = Math.max(0, Number(table.capacity ?? 0));
    if (capacity > 0 && guestCount > capacity) {
      return { ok: false, message: `${String(table.name ?? "Masa")} en fazla ${capacity} kişi kapasitelidir.` };
    }

    const sameSlotRows = db
      .prepare(`
          SELECT id, title, table_ids_json
          FROM reservations
          WHERE reservation_type IN ('table', 'breakfast')
            AND status IN ('pending', 'approved')
            AND start_date = ?
            AND time = ?
            AND deleted_at = ''
        `)
      .all(date, time) as Array<{ id?: string; title?: string; table_ids_json?: string }>;
    const conflict = sameSlotRows.find((row) => row.id !== context.reservationId && parseStoredStringArray(row.table_ids_json).includes(tableId));
    if (conflict) {
      return {
        ok: false,
        message: `Seçilen masada ${date} ${time} için aktif rezervasyon var${conflict.title ? `: ${conflict.title}` : "."}`
      };
    }
  }

  const now = context.now ?? new Date().toISOString();
  const reservationId = context.reservationId || context.newReservationId || createId("reservation_");
  const customerName = String(customer.full_name ?? "").trim() || "Misafir";
  const tableIds = tableId ? [tableId] : [];

  db.exec("SAVEPOINT table_reservation");
  try {
    if (existing) {
      db.prepare(`UPDATE reservations SET start_date = ?, end_date = ?, time = ?, guest_count = ?, adult_count = ?, child_count = ?, table_ids_json = ?, notes = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''`)
        .run(date, date, time, guestCount, editableSource ? guestCount : Number(existing.adult_count ?? guestCount), editableSource ? 0 : Number(existing.child_count ?? 0), JSON.stringify(tableIds), notes, now, reservationId);
      const previousTableId = previousTableIds[0] ?? "";
      const previous = previousTableId ? db.prepare("SELECT current_reservation_id FROM tables WHERE id = ? AND deleted_at = ''").get(previousTableId) as { current_reservation_id?: string } | undefined : undefined;
      const wasBound = previous?.current_reservation_id === reservationId;
      if (wasBound && previousTableId !== tableId) db.prepare(`UPDATE tables SET status = CASE WHEN status = 'reserved' THEN 'available' ELSE status END, current_reservation_id = '', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND current_reservation_id = ? AND deleted_at = ''`).run(now, previousTableId, reservationId);
      if (wasBound && tableId) db.prepare(`UPDATE tables SET status = CASE WHEN status = 'available' THEN 'reserved' ELSE status END, current_reservation_id = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''`).run(reservationId, now, tableId);
    } else {
      db
        .prepare(`
            INSERT INTO reservations (
              id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
              guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
              payment_status, created_at, updated_at, deleted_at, sync_status
            ) VALUES (?, ?, ?, 'table', 'approved', ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, '',
              'not_required', ?, ?, '', 'local_only')
          `)
        .run(
          reservationId,
          context.androidAction ? `android:${context.androidAction.id}` : `manual:${reservationId}`,
          customerId,
          `${customerName} - restoran rezervasyonu`,
          date,
          date,
          time,
          guestCount,
          guestCount,
          JSON.stringify(tableIds),
          notes,
          now,
          now
        );
    }

    insertDatabaseEvent(db, {
      type: existing ? "reservation.updated" : "reservation.created",
      androidAction: context.androidAction,
      entityType: "reservation",
      entityId: reservationId,
      payload: {
        source: context.androidAction ? "android" : "manual_desktop",
        customer_id: customerId,
        reservation_type: existing ? String(existing.reservation_type) : "table",
        previous_table_ids: previousTableIds,
        table_ids: tableIds,
        date,
        time,
        guest_count: guestCount
      },
      now
    });
    db.exec("RELEASE table_reservation");
  } catch (error) {
    db.exec("ROLLBACK TO table_reservation; RELEASE table_reservation");
    throw error;
  }

  return {
    ok: true,
    message: tableId
      ? "Restoran rezervasyonu oluşturuldu ve masa planlandı."
      : "Restoran rezervasyonu oluşturuldu. Masayı daha sonra atayabilirsiniz."
  };
}

export function findConflictingRoomReservation(
  db: DatabaseSync,
  roomId: string,
  customerId: string,
  checkInDate: string,
  checkOutDate: string,
  excludedReservationId?: string
): string {
  const candidateEnd = checkOutDate || "9999-12-31";
  if (excludedReservationId !== undefined) {
    const rows = db.prepare(`
      SELECT title FROM reservations, json_each(reservations.room_ids_json) AS assigned
      WHERE reservations.id != ? AND reservations.deleted_at = ''
        AND reservations.status IN ('pending', 'approved') AND assigned.value = ?
        AND start_date < ? AND ? < COALESCE(NULLIF(end_date, ''), '9999-12-31') LIMIT 1
    `).get(excludedReservationId, roomId, candidateEnd, checkInDate) as { title: string } | undefined;
    return rows ? rows.title || "başka bir müşteri" : "";
  }

  for (const reservation of getReservations(db)) {
    if (
      reservation.customerId === customerId
      || !reservation.roomIds.includes(roomId)
      || !["pending", "approved"].includes(reservation.status)
    ) {
      continue;
    }
    const reservationStart = reservation.startDate;
    const reservationEnd = reservation.endDate || "9999-12-31";
    if (reservationStart < candidateEnd && checkInDate < reservationEnd) {
      return reservation.customerName || reservation.title || "başka bir müşteri";
    }
  }
  return "";
}
