import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type {
  AssignCustomerRoomInput,
  SaveManualReservationInput,
  UpdateCustomerRoomStayStatusInput,
  UpdateReservationStatusInput
} from "./database-types.js";
import { insertDatabaseEvent } from "./database/event-store.js";
import { hasOverlappingCustomerRoomStay as hasStoredOverlappingCustomerRoomStay } from "./database/customer-room-stay-store.js";
import {
  findConflictingRoomReservation as findStoredConflictingRoomReservation,
  getReservations as getStoredReservations
} from "./database/reservation-store.js";
import { findActiveOrderForTables } from "./database/table-order-store.js";
import {
  normalizeDateInput,
  normalizeInteger,
  normalizeStatus
} from "./database/request-utils.js";
import { normalizeLimitedText } from "./database/customer-utils.js";

export function assignCustomerToRoom(db: DatabaseSync, input: AssignCustomerRoomInput): { ok: true; message: string; savedId: string } | { ok: false; message: string } {
  const customerId = String(input?.customerId ?? "").trim();
  const roomId = String(input?.roomId ?? "").trim();
  const checkInDate = normalizeDateInput(String(input?.checkInDate ?? ""));
  const checkOutDate = normalizeDateInput(String(input?.checkOutDate ?? ""));
  const guestCount = normalizeInteger(Number(input?.guestCount));
  const status = input?.status === "checked_in" ? "checked_in" : input?.status === "planned" ? "planned" : "";
  const notes = normalizeLimitedText(input?.notes, 2000);
  if (!customerId || !roomId || !checkInDate || !status) {
    return { ok: false, message: "Müşteri, oda, giriş tarihi ve konaklama durumu seçilmeli." };
  }
  if (checkOutDate && checkOutDate < checkInDate) {
    return { ok: false, message: "Çıkış tarihi giriş tarihinden önce olamaz." };
  }
  if (guestCount < 1 || guestCount > 50) {
    return { ok: false, message: "Konaklayan kişi sayısı 1 ile 50 arasında olmalı." };
  }

  const customer = db
    .prepare("SELECT full_name FROM customers WHERE id = ? AND deleted_at = ''")
    .get(customerId) as { full_name?: string } | undefined;
  const room = db
    .prepare("SELECT name, number, capacity, status, is_active FROM rooms WHERE id = ? AND deleted_at = ''")
    .get(roomId) as Record<string, unknown> | undefined;
  if (!customer) {
    return { ok: false, message: "Odaya atanacak müşteri bulunamadı." };
  }
  if (!room || Number(room.is_active ?? 0) !== 1) {
    return { ok: false, message: "Atama yapılacak aktif oda bulunamadı." };
  }
  if (["maintenance", "out_of_service", "cleaning"].includes(String(room.status ?? ""))) {
    return { ok: false, message: "Bakımda, servis dışı veya temizlikte olan odaya müşteri atanamaz." };
  }
  if (Number(room.capacity ?? 0) > 0 && guestCount > Number(room.capacity ?? 0)) {
    return { ok: false, message: `Bu odanın kapasitesi en fazla ${Number(room.capacity)} kişi.` };
  }
  if (hasStoredOverlappingCustomerRoomStay(db, roomId, checkInDate, checkOutDate)) {
    return { ok: false, message: "Seçilen tarihlerde odanın başka bir aktif müşteri kaydı var." };
  }
  const reservationConflict = findStoredConflictingRoomReservation(db, roomId, customerId, checkInDate, checkOutDate);
  if (reservationConflict) {
    return { ok: false, message: `Oda bu tarihlerde ${reservationConflict} rezervasyonuna bağlı.` };
  }

  const id = createId("stay_");
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db
      .prepare(`
          INSERT INTO customer_room_stays (
            id, customer_id, room_id, reservation_id, status, check_in_date,
            check_out_date, guest_count, notes, source, checked_in_at,
            checked_out_at, created_at, updated_at, deleted_at, sync_status
          ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, 'manual', ?, '', ?, ?, '', 'local_only')
        `)
      .run(
        id,
        customerId,
        roomId,
        status,
        checkInDate,
        checkOutDate,
        guestCount,
        notes,
        status === "checked_in" ? now : "",
        now,
        now
      );
    db
      .prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status === "checked_in" ? "occupied" : "reserved", now, roomId);
    insertDatabaseEvent(db, {
      type: "customer.room_assigned",
      entityType: "customer_room_stay",
      entityId: id,
      payload: {
        customer_id: customerId,
        room_id: roomId,
        status,
        check_in_date: checkInDate,
        check_out_date: checkOutDate
      },
      now
    });
    db.exec("COMMIT");
  } catch {
    db.exec("ROLLBACK");
    return { ok: false, message: "Müşteri oda kaydı oluşturulamadı." };
  }

  const roomLabel = String(room.number ?? "").trim() || String(room.name ?? "").trim();
  return {
    ok: true,
    message: `${String(customer.full_name ?? "Müşteri")} ${roomLabel ? `· ${roomLabel}` : ""} oda kaydına eklendi.`,
    savedId: id
  };
}

export function updateCustomerRoomStayStatus(db: DatabaseSync, input: UpdateCustomerRoomStayStatusInput): { ok: true; message: string; savedId: string } | { ok: false; message: string } {
  const stayId = String(input?.stayId ?? "").trim();
  const status = normalizeStatus(String(input?.status ?? ""), ["planned", "checked_in", "checked_out", "cancelled"]);
  if (!stayId || !status) {
    return { ok: false, message: "Konaklama kaydı ve yeni durum seçilmeli." };
  }
  const stay = db
    .prepare(`
        SELECT customer_room_stays.*, customers.full_name, rooms.name AS room_name
        FROM customer_room_stays
        JOIN customers ON customers.id = customer_room_stays.customer_id
        JOIN rooms ON rooms.id = customer_room_stays.room_id
        WHERE customer_room_stays.id = ? AND customer_room_stays.deleted_at = ''
      `)
    .get(stayId) as Record<string, unknown> | undefined;
  if (!stay) {
    return { ok: false, message: "Konaklama kaydı bulunamadı." };
  }
  const previousStatus = String(stay.status ?? "");
  if (previousStatus === status) {
    return {
      ok: true,
      message: "Konaklama kaydı zaten seçilen durumda.",
      savedId: stayId
    };
  }
  const allowedTransitions: Record<string, string[]> = {
    planned: ["checked_in", "cancelled"],
    checked_in: ["checked_out", "cancelled"],
    cancelled: ["planned"],
    checked_out: []
  };
  if (!(allowedTransitions[previousStatus] ?? []).includes(status)) {
    return { ok: false, message: "Bu konaklama kaydı seçilen duruma geçirilemez." };
  }
  if (
    ["planned", "checked_in"].includes(status)
    && hasStoredOverlappingCustomerRoomStay(db,
      String(stay.room_id ?? ""),
      String(stay.check_in_date ?? ""),
      String(stay.check_out_date ?? ""),
      stayId
    )
  ) {
    return { ok: false, message: "Odanın aynı tarihlerde başka bir aktif müşteri kaydı var." };
  }

  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db
      .prepare(`
          UPDATE customer_room_stays
          SET status = ?,
              checked_in_at = CASE WHEN ? = 'checked_in' THEN ? ELSE checked_in_at END,
              checked_out_at = CASE WHEN ? = 'checked_out' THEN ? ELSE checked_out_at END,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
      .run(status, status, now, status, now, now, stayId);
    refreshRoomStatusFromStays(
      db,
      String(stay.room_id ?? ""),
      now,
      status === "checked_out"
    );
    insertDatabaseEvent(db, {
      type: "customer.room_stay_status_changed",
      entityType: "customer_room_stay",
      entityId: stayId,
      payload: {
        customer_id: String(stay.customer_id ?? ""),
        room_id: String(stay.room_id ?? ""),
        previous_status: previousStatus,
        status
      },
      now
    });
    db.exec("COMMIT");
  } catch {
    db.exec("ROLLBACK");
    return { ok: false, message: "Konaklama durumu güncellenemedi." };
  }

  return {
    ok: true,
    message: status === "checked_in"
      ? "Müşteri odaya giriş yaptı."
      : status === "checked_out"
        ? "Müşteri çıkışı tamamlandı; oda temizlik durumuna alındı."
        : status === "cancelled"
          ? "Oda ataması iptal edildi."
          : "Oda ataması yeniden planlandı.",
    savedId: stayId
  };
}

export function refreshRoomStatusFromStays(db: DatabaseSync, roomId: string, now: string, checkoutToCleaning: boolean) {
  const active = db
    .prepare(`
        SELECT status
        FROM customer_room_stays
        WHERE room_id = ?
          AND status IN ('checked_in', 'planned')
          AND deleted_at = ''
        ORDER BY CASE status WHEN 'checked_in' THEN 0 ELSE 1 END, check_in_date ASC
        LIMIT 1
      `)
    .get(roomId) as { status?: string } | undefined;
  const room = db
    .prepare("SELECT status FROM rooms WHERE id = ? AND deleted_at = ''")
    .get(roomId) as { status?: string } | undefined;
  if (!room) {
    return;
  }
  const currentStatus = String(room.status ?? "");
  let nextStatus = currentStatus;
  if (active?.status === "checked_in") {
    nextStatus = "occupied";
  } else if (active?.status === "planned") {
    nextStatus = "reserved";
  } else if (checkoutToCleaning) {
    nextStatus = "cleaning";
  } else if (["occupied", "reserved"].includes(currentStatus)) {
    nextStatus = "available";
  }
  if (nextStatus !== currentStatus) {
    db
      .prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(nextStatus, now, roomId);
  }
}

export function enforceActiveStayRoomStatus(db: DatabaseSync, roomId: string, now: string) {
  const active = db
    .prepare(`
        SELECT status
        FROM customer_room_stays
        WHERE room_id = ?
          AND status IN ('checked_in', 'planned')
          AND deleted_at = ''
        ORDER BY CASE status WHEN 'checked_in' THEN 0 ELSE 1 END, check_in_date ASC
        LIMIT 1
      `)
    .get(roomId) as { status?: string } | undefined;
  if (!active) {
    return;
  }
  db
    .prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
    .run(active.status === "checked_in" ? "occupied" : "reserved", now, roomId);
}

export function saveManualReservation(db: DatabaseSync, input: SaveManualReservationInput): { ok: true; message: string } | { ok: false; message: string } {
  const reservationId = String(input?.reservationId ?? "").trim();
  const customerId = String(input?.customerId ?? "").trim();
  const roomId = String(input?.roomId ?? "").trim();
  const startDate = normalizeDateInput(input?.startDate);
  const endDate = normalizeDateInput(input?.endDate);
  const guestCount = normalizeInteger(Number(input?.guestCount ?? 0));
  const notes = normalizeLimitedText(input?.notes, 2000);

  if (!customerId || !startDate || !endDate || guestCount < 1) {
    return { ok: false, message: "Müşteri, giriş-çıkış tarihi ve kişi sayısı zorunludur." };
  }
  if (endDate <= startDate) {
    return { ok: false, message: "Çıkış tarihi giriş tarihinden sonra olmalıdır." };
  }

  const customer = db
    .prepare("SELECT id, full_name, phone FROM customers WHERE id = ? AND deleted_at = ''")
    .get(customerId) as { id?: string; full_name?: string; phone?: string } | undefined;
  if (!customer?.id) {
    return { ok: false, message: "Rezervasyon için geçerli bir müşteri seçin." };
  }

  const existingReservation = reservationId
    ? db
      .prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''")
      .get(reservationId) as Record<string, unknown> | undefined
    : undefined;
  if (reservationId && !existingReservation) {
    return { ok: false, message: "Düzenlenecek rezervasyon bulunamadı." };
  }

  const isEditing = Boolean(existingReservation);
  const existingStatus = String(existingReservation?.status ?? "approved");
  const existingRequestId = String(existingReservation?.request_id ?? "");
  const isManualReservation = existingRequestId.startsWith("manual:");
  const existingRoomIds = existingReservation ? parseStringArray(existingReservation.room_ids_json) : [];
  const previousRoomId = existingRoomIds[0] ?? "";

  if (existingReservation) {
    if (String(existingReservation.reservation_type ?? "") !== "room") {
      return { ok: false, message: "Bu ekrandan yalnızca pansiyon rezervasyonları düzenlenebilir." };
    }
    if (!["pending", "approved"].includes(existingStatus)) {
      return { ok: false, message: "Tamamlanmış veya iptal edilmiş rezervasyon düzenlenemez." };
    }
    if (existingRoomIds.length > 1) {
      return { ok: false, message: "Birden fazla odaya bağlı rezervasyon bu sade formdan düzenlenemez." };
    }
    if (String(existingReservation.customer_id ?? "") !== customerId) {
      return { ok: false, message: "Rezervasyonun müşteri kaydı bu ekrandan değiştirilemez." };
    }
    if (!isManualReservation) {
      if (String(existingReservation.start_date ?? "") !== startDate
        || String(existingReservation.end_date ?? "") !== endDate
        || Number(existingReservation.guest_count ?? 0) !== guestCount) {
        return { ok: false, message: "Web talebinden oluşan rezervasyonda tarih ve kişi bilgisi bu ekrandan değiştirilemez." };
      }
    }
    const activeStay = db
      .prepare(`
          SELECT id
          FROM customer_room_stays
          WHERE reservation_id = ?
            AND status IN ('planned', 'checked_in')
            AND deleted_at = ''
          LIMIT 1
        `)
      .get(reservationId) as { id?: string } | undefined;
    if (activeStay?.id) {
      return { ok: false, message: "Bu rezervasyon aktif konaklamaya dönüştürülmüş. Oda ve tarih değişikliğini konaklama kaydından yönetin." };
    }
  }

  let room: { id?: string; name?: string; capacity?: number; status?: string } | undefined;
  if (roomId) {
    room = db
      .prepare("SELECT id, name, capacity, status FROM rooms WHERE id = ? AND is_active = 1 AND deleted_at = ''")
      .get(roomId) as { id?: string; name?: string; capacity?: number; status?: string } | undefined;
    if (!room?.id) {
      return { ok: false, message: "Seçilen oda artık kullanılamıyor." };
    }
    if (String(room.status ?? "") === "maintenance") {
      return { ok: false, message: "Bakım durumundaki odaya rezervasyon açılamaz." };
    }
    if (Number(room.capacity ?? 0) > 0 && guestCount > Number(room.capacity)) {
      return { ok: false, message: `${String(room.name ?? "Oda")} en fazla ${Number(room.capacity)} kişi kapasitelidir.` };
    }
    if (hasStoredOverlappingCustomerRoomStay(db, roomId, startDate, endDate)) {
      return { ok: false, message: `${String(room.name ?? "Seçilen oda")} bu tarihlerde aktif bir konaklama kaydına bağlı.` };
    }

    const conflict = getStoredReservations(db).find((reservation) => {
      if (reservation.id === reservationId) return false;
      if (!["pending", "approved"].includes(reservation.status) || !reservation.roomIds.includes(roomId)) {
        return false;
      }
      const existingStart = reservation.startDate || reservation.endDate;
      const existingEnd = reservation.endDate || reservation.startDate;
      if (!existingStart || !existingEnd) return false;
      return existingStart < endDate && startDate < existingEnd;
    });
    if (conflict) {
      return {
        ok: false,
        message: `${String(room.name ?? "Seçilen oda")} bu tarih aralığında başka bir aktif rezervasyona bağlı.`
      };
    }
  }

  const now = new Date().toISOString();
  const savedReservationId = reservationId || createId("reservation_");
  const customerName = String(customer.full_name ?? "").trim() || "Misafir";
  const roomIds = roomId ? [roomId] : [];

  db.exec("BEGIN IMMEDIATE");
  try {
    if (existingReservation) {
      const nextAdultCount = isManualReservation
        ? guestCount
        : Number(existingReservation.adult_count ?? guestCount);
      const nextChildCount = isManualReservation
        ? 0
        : Number(existingReservation.child_count ?? 0);
      db
        .prepare(`
            UPDATE reservations
            SET start_date = ?,
                end_date = ?,
                guest_count = ?,
                adult_count = ?,
                child_count = ?,
                room_ids_json = ?,
                notes = ?,
                updated_at = ?,
                sync_status = 'local_only'
            WHERE id = ? AND deleted_at = ''
          `)
        .run(
          startDate,
          endDate,
          guestCount,
          nextAdultCount,
          nextChildCount,
          JSON.stringify(roomIds),
          notes,
          now,
          savedReservationId
        );

      if (previousRoomId && previousRoomId !== roomId) {
        const otherRows = db
          .prepare(`
              SELECT room_ids_json
              FROM reservations
              WHERE id != ?
                AND status IN ('pending', 'approved')
                AND deleted_at = ''
            `)
          .all(savedReservationId) as Array<{ room_ids_json?: string }>;
        const stillReserved = otherRows.some((row) => parseStringArray(row.room_ids_json).includes(previousRoomId));
        if (!stillReserved) {
          db
            .prepare("UPDATE rooms SET status = 'available', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND status = 'reserved' AND deleted_at = ''")
            .run(now, previousRoomId);
          enforceActiveStayRoomStatus(db, previousRoomId, now);
        }
      }
    } else {
      db
        .prepare(`
            INSERT INTO reservations (
              id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
              guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
              payment_status, created_at, updated_at, deleted_at, sync_status
            ) VALUES (?, ?, ?, 'room', 'approved', ?, ?, ?, '', ?, ?, 0, ?, '[]', ?, '',
              'not_required', ?, ?, '', 'local_only')
          `)
        .run(
          savedReservationId,
          `manual:${savedReservationId}`,
          customerId,
          `${customerName} - oda rezervasyonu`,
          startDate,
          endDate,
          guestCount,
          guestCount,
          JSON.stringify(roomIds),
          notes,
          now,
          now
        );
    }

    if (roomId && existingStatus === "approved" && String(room?.status ?? "") === "available") {
      db
        .prepare("UPDATE rooms SET status = 'reserved', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
        .run(now, roomId);
    }

    insertDatabaseEvent(db, {
      type: isEditing ? "reservation.updated" : "reservation.created",
      entityType: "reservation",
      entityId: savedReservationId,
      payload: {
        source: isManualReservation || !isEditing ? "manual_desktop" : "desktop_edit",
        customer_id: customerId,
        previous_room_ids: existingRoomIds,
        room_ids: roomIds,
        start_date: startDate,
        end_date: endDate,
        guest_count: guestCount
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
    message: isEditing
      ? roomId
        ? "Rezervasyon güncellendi ve oda bilgisi kaydedildi."
        : "Rezervasyon güncellendi. Odayı daha sonra atayabilirsiniz."
      : roomId
        ? "Rezervasyon oluşturuldu ve oda ayrıldı."
        : "Rezervasyon oluşturuldu. Odayı daha sonra atayabilirsiniz."
  };
}

export function updateReservationStatus(db: DatabaseSync, input: UpdateReservationStatusInput): { ok: true; message: string } | { ok: false; message: string } {
  const reservationId = input.reservationId.trim();
  const status = normalizeStatus(input.status, ["pending", "approved", "rejected", "cancelled", "completed"]);
  if (!reservationId || !status) {
    return {
      ok: false,
      message: "Rezervasyon durumu için geçerli kayıt ve durum seçilmeli."
    };
  }

  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const reservation = db
      .prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''")
      .get(reservationId) as Record<string, unknown> | undefined;
    if (!reservation) {
      db.exec("ROLLBACK");
      return {
        ok: false,
        message: "Rezervasyon bulunamadı."
      };
    }

    const roomIds = parseStringArray(reservation.room_ids_json);
    const tableIds = parseStringArray(reservation.table_ids_json);
    if (findActiveOrderForTables(db, tableIds)) {
      db.exec("ROLLBACK");
      return {
        ok: false,
        message: "Aktif adisyonu olan masaya bağlı rezervasyon değiştirilemez. Önce adisyonu kapatın."
      };
    }

    db.prepare("UPDATE reservations SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, reservationId);

    if (status === "approved") {
      for (const roomId of roomIds) {
        db.prepare("UPDATE rooms SET status = 'reserved', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''").run(now, roomId);
      }
      for (const tableId of tableIds) {
        db
          .prepare("UPDATE tables SET status = 'reserved', current_reservation_id = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
          .run(reservationId, now, tableId);
      }
    }

    if (["rejected", "cancelled", "completed"].includes(status)) {
      for (const roomId of roomIds) {
        db.prepare("UPDATE rooms SET status = 'available', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND status = 'reserved' AND deleted_at = ''").run(now, roomId);
      }
      for (const tableId of tableIds) {
        db
          .prepare(`
              UPDATE tables
              SET status = 'available',
                  current_reservation_id = '',
                  updated_at = ?,
                  sync_status = 'local_only'
              WHERE id = ?
                AND current_reservation_id = ?
                AND deleted_at = ''
            `)
          .run(now, tableId, reservationId);
      }
    }

    for (const roomId of roomIds) {
      enforceActiveStayRoomStatus(db, roomId, now);
    }

    insertDatabaseEvent(db, {
      type: "reservation.status_changed",
      entityType: "reservation",
      entityId: reservationId,
      payload: {
        previous_status: String(reservation.status ?? ""),
        status,
        room_ids: roomIds,
        table_ids: tableIds
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
    message: "Rezervasyon durumu güncellendi."
  };
}

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return [];
  }
}
