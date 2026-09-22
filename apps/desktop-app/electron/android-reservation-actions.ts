import { enforceActiveStayRoomStatus } from "./room-state-service.js";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";

export type AndroidReservationMutationResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export interface AndroidReservationActionContext {
  db: DatabaseSync;
  action: AndroidSyncAction;
  now: string;
  insertEvent: (type: string, entityId: string, payload: Record<string, unknown>) => void;
}

export function applyAndroidReservationAction(
  context: AndroidReservationActionContext
): AndroidReservationMutationResult {
  const actionType = String(context.action.action_type ?? "");
  if (actionType === "reservation_room_create") {
    return saveRoomReservation(context, false);
  }
  if (actionType === "reservation_room_update") {
    return saveRoomReservation(context, true);
  }
  if (actionType === "reservation_table_create") {
    return saveTableReservation(context, false);
  }
  if (actionType === "reservation_table_update") {
    return saveTableReservation(context, true);
  }
  return { ok: false, message: "Telefon rezervasyon işlem türü desteklenmiyor." };
}

function saveRoomReservation(
  context: AndroidReservationActionContext,
  editing: boolean
): AndroidReservationMutationResult {
  const { db, action, now, insertEvent } = context;
  const payload = action.payload;
  const reservationId = editing
    ? text(payload.reservation_id)
    : androidEntityId("reservation_", action.id);
  const existing = editing ? reservationRow(db, reservationId) : undefined;
  if (editing && !existing) {
    return { ok: false, message: "Düzenlenecek rezervasyon masaüstü kayıtlarında bulunamadı." };
  }
  if (existing && String(existing.reservation_type ?? "") !== "room") {
    return { ok: false, message: "Bu işlem yalnız pansiyon rezervasyonlarında kullanılabilir." };
  }

  const versionError = editing ? versionConflict(payload, existing?.updated_at, "Rezervasyon") : "";
  if (versionError) return { ok: false, message: versionError };

  const customerId = editing ? text(existing?.customer_id) : text(payload.customer_id);
  const customer = customerRow(db, customerId);
  if (!customer) {
    return { ok: false, message: "Rezervasyon için seçilen müşteri bulunamadı." };
  }

  const startDate = validDate(text(payload.start_date));
  const endDate = validDate(text(payload.end_date));
  const guestCount = integer(payload.guest_count);
  const roomId = text(payload.room_id);
  const notes = limitedText(payload.notes, 2000);
  if (!startDate || !endDate || endDate <= startDate || guestCount < 1 || guestCount > 99) {
    return { ok: false, message: "Geçerli giriş-çıkış tarihi ve 1-99 arasında kişi sayısı gerekli." };
  }

  const existingStatus = String(existing?.status ?? "approved");
  const existingRequestId = text(existing?.request_id);
  const editableSource = isEditableSource(existingRequestId);
  const previousRoomIds = parseIds(existing?.room_ids_json);
  const previousRoomId = previousRoomIds[0] ?? "";
  if (existing) {
    if (!["pending", "approved"].includes(existingStatus)) {
      return { ok: false, message: "Tamamlanmış veya iptal edilmiş rezervasyon düzenlenemez." };
    }
    if (previousRoomIds.length > 1) {
      return { ok: false, message: "Birden fazla odaya bağlı rezervasyon telefondan düzenlenemez." };
    }
    if (!editableSource && (
      text(existing.start_date) !== startDate
      || text(existing.end_date) !== endDate
      || Number(existing.guest_count ?? 0) !== guestCount
    )) {
      return { ok: false, message: "Web talebinden oluşan rezervasyonda tarih ve kişi bilgisi değiştirilemez." };
    }
    const activeStay = db.prepare(`
      SELECT id FROM customer_room_stays
      WHERE reservation_id = ?
        AND status IN ('planned', 'checked_in')
        AND deleted_at = ''
      LIMIT 1
    `).get(reservationId);
    if (activeStay) {
      return { ok: false, message: "Bu rezervasyon aktif konaklamaya dönüştürülmüş. Değişikliği konaklama kaydından yönetin." };
    }
  }

  let room: Record<string, unknown> | undefined;
  if (roomId) {
    room = db.prepare(`
      SELECT id, name, capacity, status
      FROM rooms
      WHERE id = ? AND is_active = 1 AND deleted_at = ''
    `).get(roomId) as Record<string, unknown> | undefined;
    if (!room) {
      return { ok: false, message: "Seçilen oda artık kullanılamıyor." };
    }
    if (text(room.status) === "maintenance") {
      return { ok: false, message: "Bakım durumundaki odaya rezervasyon açılamaz." };
    }
    const capacity = Math.max(0, Number(room.capacity ?? 0));
    if (capacity > 0 && guestCount > capacity) {
      return { ok: false, message: `${text(room.name) || "Oda"} en fazla ${capacity} kişi kapasitelidir.` };
    }
    if (hasStayOverlap(db, roomId, startDate, endDate)) {
      return { ok: false, message: `${text(room.name) || "Seçilen oda"} bu tarihlerde aktif bir konaklama kaydına bağlı.` };
    }
    if (hasRoomReservationOverlap(db, reservationId, roomId, startDate, endDate)) {
      return { ok: false, message: `${text(room.name) || "Seçilen oda"} bu tarih aralığında başka bir aktif rezervasyona bağlı.` };
    }
  }

  const updatedAt = editing ? nextTimestamp(existing?.updated_at, now) : now;
  const roomIds = roomId ? [roomId] : [];
  if (editing) {
    const adultCount = editableSource ? guestCount : Number(existing?.adult_count ?? guestCount);
    const childCount = editableSource ? 0 : Number(existing?.child_count ?? 0);
    db.prepare(`
      UPDATE reservations
      SET start_date = ?, end_date = ?, guest_count = ?, adult_count = ?, child_count = ?,
          room_ids_json = ?, notes = ?, updated_at = ?, sync_status = 'local_only'
      WHERE id = ? AND deleted_at = ''
    `).run(startDate, endDate, guestCount, adultCount, childCount, JSON.stringify(roomIds), notes, updatedAt, reservationId);

    if (previousRoomId && previousRoomId !== roomId && !roomStillReserved(db, previousRoomId, reservationId)) {
      db.prepare(`
        UPDATE rooms SET status = 'available', updated_at = ?, sync_status = 'local_only'
        WHERE id = ? AND status = 'reserved' AND deleted_at = ''
      `).run(updatedAt, previousRoomId);
      enforceActiveStayRoomStatus(db, previousRoomId, updatedAt);
    }
  } else {
    const customerName = text(customer.full_name) || "Misafir";
    db.prepare(`
      INSERT INTO reservations (
        id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
        guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
        payment_status, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, ?, 'room', 'approved', ?, ?, ?, '', ?, ?, 0, ?, '[]', ?, '',
        'not_required', ?, ?, '', 'local_only')
    `).run(
      reservationId,
      `android:${action.id}`,
      customerId,
      `${customerName} - oda rezervasyonu`,
      startDate,
      endDate,
      guestCount,
      guestCount,
      JSON.stringify(roomIds),
      notes,
      now,
      updatedAt
    );
  }

  if (roomId && existingStatus === "approved" && text(room?.status) === "available") {
    db.prepare(`
      UPDATE rooms SET status = 'reserved', updated_at = ?, sync_status = 'local_only'
      WHERE id = ? AND deleted_at = ''
    `).run(updatedAt, roomId);
  }

  insertEvent(editing ? "reservation.updated" : "reservation.created", reservationId, {
    source: "android",
    customer_id: customerId,
    previous_room_ids: previousRoomIds,
    room_ids: roomIds,
    start_date: startDate,
    end_date: endDate,
    guest_count: guestCount
  });
  return {
    ok: true,
    message: editing
      ? "Pansiyon rezervasyonu telefondan güncellendi."
      : "Pansiyon rezervasyonu telefondan oluşturuldu."
  };
}

function saveTableReservation(
  context: AndroidReservationActionContext,
  editing: boolean
): AndroidReservationMutationResult {
  const { db, action, now, insertEvent } = context;
  const payload = action.payload;
  const reservationId = editing
    ? text(payload.reservation_id)
    : androidEntityId("reservation_", action.id);
  const existing = editing ? reservationRow(db, reservationId) : undefined;
  if (editing && !existing) {
    return { ok: false, message: "Düzenlenecek restoran rezervasyonu bulunamadı." };
  }
  const existingType = text(existing?.reservation_type);
  if (existing && !["table", "breakfast"].includes(existingType)) {
    return { ok: false, message: "Bu işlem yalnız restoran rezervasyonlarında kullanılabilir." };
  }

  const versionError = editing ? versionConflict(payload, existing?.updated_at, "Rezervasyon") : "";
  if (versionError) return { ok: false, message: versionError };

  const customerId = editing ? text(existing?.customer_id) : text(payload.customer_id);
  const customer = customerRow(db, customerId);
  if (!customer) {
    return { ok: false, message: "Rezervasyon için seçilen müşteri bulunamadı." };
  }

  const date = validDate(text(payload.date));
  const time = validTime(text(payload.time));
  const guestCount = integer(payload.guest_count);
  const tableId = text(payload.table_id);
  const notes = limitedText(payload.notes, 2000);
  if (!date || !time || guestCount < 1 || guestCount > 99) {
    return { ok: false, message: "Geçerli tarih, saat ve 1-99 arasında kişi sayısı gerekli." };
  }

  const existingStatus = text(existing?.status) || "approved";
  const existingRequestId = text(existing?.request_id);
  const editableSource = isEditableSource(existingRequestId);
  const previousTableIds = parseIds(existing?.table_ids_json);
  const previousTableId = previousTableIds[0] ?? "";
  if (existing) {
    if (!["pending", "approved"].includes(existingStatus)) {
      return { ok: false, message: "Tamamlanmış veya iptal edilmiş rezervasyon düzenlenemez." };
    }
    if (previousTableIds.length > 1) {
      return { ok: false, message: "Birden fazla masaya bağlı rezervasyon telefondan düzenlenemez." };
    }
    if (!editableSource && (
      text(existing.start_date) !== date
      || text(existing.time) !== time
      || Number(existing.guest_count ?? 0) !== guestCount
    )) {
      return { ok: false, message: "Web talebinden oluşan rezervasyonda tarih, saat ve kişi bilgisi değiştirilemez." };
    }
  }

  let table: Record<string, unknown> | undefined;
  if (tableId) {
    table = db.prepare(`
      SELECT id, name, capacity, status, is_active, current_reservation_id
      FROM tables WHERE id = ? AND deleted_at = ''
    `).get(tableId) as Record<string, unknown> | undefined;
    if (!table || Number(table.is_active ?? 0) !== 1) {
      return { ok: false, message: "Seçilen masa aktif değil veya bulunamadı." };
    }
    if (text(table.status) === "maintenance") {
      return { ok: false, message: "Bakım durumundaki masaya rezervasyon atanamaz." };
    }
    const capacity = Math.max(0, Number(table.capacity ?? 0));
    if (capacity > 0 && guestCount > capacity) {
      return { ok: false, message: `${text(table.name) || "Masa"} en fazla ${capacity} kişi kapasitelidir.` };
    }
    if (hasTableReservationConflict(db, reservationId, tableId, date, time)) {
      return { ok: false, message: `Seçilen masada ${date} ${time} için aktif rezervasyon var.` };
    }
  }

  const updatedAt = editing ? nextTimestamp(existing?.updated_at, now) : now;
  const tableIds = tableId ? [tableId] : [];
  if (editing) {
    db.prepare(`
      UPDATE reservations
      SET start_date = ?, end_date = ?, time = ?, guest_count = ?,
          adult_count = ?, child_count = ?, table_ids_json = ?, notes = ?,
          updated_at = ?, sync_status = 'local_only'
      WHERE id = ? AND deleted_at = ''
    `).run(
      date,
      date,
      time,
      guestCount,
      editableSource ? guestCount : Number(existing?.adult_count ?? guestCount),
      editableSource ? 0 : Number(existing?.child_count ?? 0),
      JSON.stringify(tableIds),
      notes,
      updatedAt,
      reservationId
    );

    const previousBinding = previousTableId
      ? db.prepare("SELECT current_reservation_id FROM tables WHERE id = ? AND deleted_at = ''").get(previousTableId) as Record<string, unknown> | undefined
      : undefined;
    const wasBound = text(previousBinding?.current_reservation_id) === reservationId;
    if (wasBound && previousTableId !== tableId) {
      db.prepare(`
        UPDATE tables
        SET status = CASE WHEN status = 'reserved' THEN 'available' ELSE status END,
            current_reservation_id = '', updated_at = ?, sync_status = 'local_only'
        WHERE id = ? AND current_reservation_id = ? AND deleted_at = ''
      `).run(updatedAt, previousTableId, reservationId);
    }
    if (wasBound && tableId) {
      db.prepare(`
        UPDATE tables
        SET status = CASE WHEN status = 'available' THEN 'reserved' ELSE status END,
            current_reservation_id = ?, updated_at = ?, sync_status = 'local_only'
        WHERE id = ? AND deleted_at = ''
      `).run(reservationId, updatedAt, tableId);
    }
  } else {
    const customerName = text(customer.full_name) || "Misafir";
    db.prepare(`
      INSERT INTO reservations (
        id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
        guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
        payment_status, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, ?, 'table', 'approved', ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, '',
        'not_required', ?, ?, '', 'local_only')
    `).run(
      reservationId,
      `android:${action.id}`,
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
      updatedAt
    );
  }

  insertEvent(editing ? "reservation.updated" : "reservation.created", reservationId, {
    source: "android",
    customer_id: customerId,
    reservation_type: editing ? existingType : "table",
    previous_table_ids: previousTableIds,
    table_ids: tableIds,
    date,
    time,
    guest_count: guestCount
  });
  return {
    ok: true,
    message: editing
      ? "Restoran rezervasyonu telefondan güncellendi."
      : "Restoran rezervasyonu telefondan oluşturuldu."
  };
}

function reservationRow(db: DatabaseSync, reservationId: string): Record<string, unknown> | undefined {
  if (!reservationId) return undefined;
  return db.prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''")
    .get(reservationId) as Record<string, unknown> | undefined;
}

function customerRow(db: DatabaseSync, customerId: string): Record<string, unknown> | undefined {
  if (!customerId) return undefined;
  return db.prepare("SELECT id, full_name, phone FROM customers WHERE id = ? AND deleted_at = ''")
    .get(customerId) as Record<string, unknown> | undefined;
}

function hasStayOverlap(db: DatabaseSync, roomId: string, startDate: string, endDate: string): boolean {
  const rows = db.prepare(`
    SELECT check_in_date, check_out_date
    FROM customer_room_stays
    WHERE room_id = ?
      AND status IN ('planned', 'checked_in')
      AND deleted_at = ''
  `).all(roomId) as Array<Record<string, unknown>>;
  return rows.some((row) => {
    const existingStart = text(row.check_in_date);
    const existingEnd = text(row.check_out_date) || "9999-12-31";
    return existingStart < endDate && startDate < existingEnd;
  });
}

function hasRoomReservationOverlap(
  db: DatabaseSync,
  excludedReservationId: string,
  roomId: string,
  startDate: string,
  endDate: string
): boolean {
  const rows = db.prepare(`
    SELECT id, start_date, end_date, room_ids_json
    FROM reservations
    WHERE id != ?
      AND status IN ('pending', 'approved')
      AND deleted_at = ''
  `).all(excludedReservationId) as Array<Record<string, unknown>>;
  return rows.some((row) => {
    if (!parseIds(row.room_ids_json).includes(roomId)) return false;
    const existingStart = text(row.start_date) || text(row.end_date);
    const existingEnd = text(row.end_date) || text(row.start_date);
    return Boolean(existingStart && existingEnd && existingStart < endDate && startDate < existingEnd);
  });
}

function hasTableReservationConflict(
  db: DatabaseSync,
  excludedReservationId: string,
  tableId: string,
  date: string,
  time: string
): boolean {
  const rows = db.prepare(`
    SELECT id, table_ids_json
    FROM reservations
    WHERE id != ?
      AND reservation_type IN ('table', 'breakfast')
      AND status IN ('pending', 'approved')
      AND start_date = ?
      AND time = ?
      AND deleted_at = ''
  `).all(excludedReservationId, date, time) as Array<Record<string, unknown>>;
  return rows.some((row) => parseIds(row.table_ids_json).includes(tableId));
}

function roomStillReserved(db: DatabaseSync, roomId: string, excludedReservationId: string): boolean {
  const rows = db.prepare(`
    SELECT room_ids_json FROM reservations
    WHERE id != ? AND status IN ('pending', 'approved') AND deleted_at = ''
  `).all(excludedReservationId) as Array<Record<string, unknown>>;
  return rows.some((row) => parseIds(row.room_ids_json).includes(roomId));
}

function versionConflict(payload: Record<string, unknown>, actualValue: unknown, label: string): string {
  const expected = text(payload.expected_updated_at);
  const actual = text(actualValue);
  if (!expected || !actual || expected === actual) return "";
  return `${label} masaüstünde değişmiş. Canlı veriyi yenileyip tekrar deneyin.`;
}

function parseIds(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function limitedText(value: unknown, maxLength: number): string {
  return text(value).slice(0, maxLength);
}

function integer(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : "";
}

function validTime(value: string): string {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
}

function isEditableSource(requestId: string): boolean {
  return requestId.startsWith("manual:") || requestId.startsWith("android:");
}

function nextTimestamp(previousValue: unknown, candidateValue: string): string {
  const previous = Date.parse(text(previousValue));
  const candidate = Date.parse(candidateValue);
  if (!Number.isFinite(previous) || !Number.isFinite(candidate) || candidate > previous) {
    return candidateValue;
  }
  return new Date(previous + 1).toISOString();
}

function androidEntityId(prefix: string, actionId: string): string {
  const digest = createHash("sha256").update(actionId).digest("hex").slice(0, 48);
  return `${prefix}android_${digest}`;
}
