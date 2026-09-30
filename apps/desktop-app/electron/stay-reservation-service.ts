import type { DatabaseSync } from "node:sqlite";
import { checkoutHospitalityStay } from "./hospitality-checkout.js";
import { refreshRoomStatusFromStays, enforceActiveStayRoomStatus } from "./room-state-service.js";
import { createId } from "@yardimci-asistan/shared";
import type {
  AssignCustomerRoomInput,
  CreateStayFromReservationInput,
  SaveManualReservationInput,
  UpdateCustomerRoomStayStatusInput,
  UpdateReservationStatusInput
} from "./database-types.js";
import { insertDatabaseEvent } from "./database/event-store.js";
import {
  findActiveCustomerRoomStay as findStoredActiveCustomerRoomStay,
  hasOverlappingCustomerRoomStay as hasStoredOverlappingCustomerRoomStay
} from "./database/customer-room-stay-store.js";
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
  return createCustomerStay(db, input, "");
}

/** Explicit booking conversion: source fields are read from Reservation, never supplied by the caller. */
export function createStayFromReservation(db: DatabaseSync, input: CreateStayFromReservationInput) {
  db.exec("SAVEPOINT reservation_stay");
  try {
    const result = createReservationStayInTransaction(db, input);
    if (!result.ok) db.exec("ROLLBACK TO reservation_stay");
    db.exec("RELEASE reservation_stay");
    return result;
  } catch {
    db.exec("ROLLBACK TO reservation_stay; RELEASE reservation_stay");
    return { ok: false as const, message: "Rezervasyondan konaklama oluşturulamadı." };
  }
}

function createReservationStayInTransaction(db: DatabaseSync, input: CreateStayFromReservationInput) {
  const reservationId = String(input?.reservationId ?? "").trim();
  const reservation = db.prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''").get(reservationId) as Record<string, unknown> | undefined;
  if (!reservation) return { ok: false as const, message: "Rezervasyon bulunamadı." };
  if (reservation.reservation_type !== "room" || reservation.status !== "approved") {
    return { ok: false as const, message: "Bu rezervasyondan konaklama oluşturulamaz." };
  }
  if (!normalizeDateInput(String(reservation.start_date ?? "")) || !normalizeDateInput(String(reservation.end_date ?? ""))
    || String(reservation.end_date) <= String(reservation.start_date)) {
    return { ok: false as const, message: "Rezervasyonun giriş ve çıkış tarihleri geçersiz." };
  }
  const roomIds = parseStringArray(reservation.room_ids_json);
  if (roomIds.length > 1) return { ok: false as const, message: "Çok odalı rezervasyonu oda başına ayrı rezervasyonlara ayırın; kapora ve ücret her odaya tekrar yazılamaz." };
  const roomId = String(input?.roomId ?? (roomIds.length === 1 ? roomIds[0] : "")).trim();
  if (!roomId || (roomIds.length && !roomIds.includes(roomId))) return { ok: false as const, message: "Rezervasyona atanmış bir oda seçilmeli." };
  const duplicate = db.prepare("SELECT id, status, room_id FROM customer_room_stays WHERE reservation_id = ? AND status <> 'cancelled' AND deleted_at = '' ORDER BY created_at DESC LIMIT 1").get(reservationId) as { id: string; status: string; room_id: string } | undefined;
  if (duplicate?.status === "checked_out") return { ok: false as const, message: "Bu rezervasyonun konaklaması tamamlandı. Yeni giriş için yeni rezervasyon oluşturun." };
  if (duplicate && duplicate.room_id !== roomId) return { ok: false as const, message: "Bu rezervasyonun konaklaması başka odaya taşındı. Mevcut konaklamayı açın." };
  if (duplicate) return input?.status === "checked_in" && duplicate.status === "planned"
    ? updateCustomerRoomStayStatus(db, { stayId: duplicate.id, status: "checked_in" })
    : { ok: true as const, savedId: duplicate.id, message: "Mevcut konaklama kullanılıyor." };
  if (!roomIds.length) db.prepare("UPDATE reservations SET room_ids_json = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
    .run(JSON.stringify([roomId]), new Date().toISOString(), reservationId);
  return createCustomerStay(db, {
    customerId: input.primaryCustomerId || String(reservation.customer_id), roomId,
    checkInDate: String(reservation.start_date), checkOutDate: String(reservation.end_date),
    guestCount: input.guestCustomerIds?.length ?? Number(reservation.guest_count), notes: String(reservation.notes),
    guestCustomerIds: input.guestCustomerIds,
    status: input?.status === "checked_in" ? "checked_in" : "planned"
  }, reservationId);
}

function createCustomerStay(db: DatabaseSync, input: AssignCustomerRoomInput, reservationId: string): { ok: true; message: string; savedId: string } | { ok: false; message: string } {
  const customerId = String(input?.customerId ?? "").trim();
  const roomId = String(input?.roomId ?? "").trim();
  const checkInDate = normalizeDateInput(String(input?.checkInDate ?? ""));
  const checkOutDate = normalizeDateInput(String(input?.checkOutDate ?? ""));
  const guestCount = normalizeInteger(Number(input?.guestCount));
  const status = input?.status === "checked_in" ? "checked_in" : input?.status === "planned" ? "planned" : "";
  const notes = normalizeLimitedText(input?.notes, 2000);
  const guestIds = Array.isArray(input?.guestCustomerIds) ? input.guestCustomerIds.map(id => String(id).trim()) : [customerId];
  if (!guestIds.includes(customerId) || guestIds.some(id => !id) || new Set(guestIds).size !== guestIds.length || guestIds.length > 50) {
    return { ok: false, message: "Ana müşteri listede olmalı; her misafir yalnız bir kez seçilmeli." };
  }
  if (status === "checked_in" && guestCount !== guestIds.length) {
    return { ok: false, message: "Giriş için her misafire ayrı müşteri kaydı ekleyin. Kişi sayısı misafir listesiyle aynı olmalı." };
  }
  if (guestIds.length > guestCount) return { ok: false, message: "Misafir listesi planlanan kişi sayısını aşıyor." };
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
  if (status === "checked_in" && db.prepare("SELECT 1 FROM customer_room_stays WHERE room_id = ? AND status = 'checked_in' AND deleted_at = ''").get(roomId)) {
    return { ok: false, message: "Odada zaten giriş yapmış bir konaklama var." };
  }
  for (const guestId of guestIds) {
    if (!db.prepare("SELECT 1 FROM customers WHERE id = ? AND deleted_at = ''").get(guestId)) return { ok: false, message: "Misafir kaydı bulunamadı." };
    if (guestId !== customerId && findStoredActiveCustomerRoomStay(db, guestId)) return { ok: false, message: "Seçilen misafirlerden biri başka bir aktif konaklamada." };
  }
  const activeCustomerStay = findStoredActiveCustomerRoomStay(db, customerId);
  if (activeCustomerStay) {
    const assignedRoom = activeCustomerStay.roomNumber
      ? `Oda ${activeCustomerStay.roomNumber}`
      : activeCustomerStay.roomName || "başka bir oda";
    return { ok: false, message: `${String(customer.full_name ?? "Müşteri")} zaten ${assignedRoom} için aktif. Önce mevcut oda kaydını çıkış veya iptal ile kapatın.` };
  }
  if (["maintenance", "out_of_service", "cleaning"].includes(String(room.status ?? ""))) {
    return { ok: false, message: "Bakımda, servis dışı veya temizlikte olan odaya müşteri atanamaz." };
  }
  if (hasStoredOverlappingCustomerRoomStay(db, roomId, checkInDate, checkOutDate)) {
    return { ok: false, message: "Seçilen tarihlerde odanın başka bir aktif müşteri kaydı var." };
  }
  const reservationConflict = findStoredConflictingRoomReservation(db, roomId, customerId, checkInDate, checkOutDate, reservationId || undefined);
  if (reservationConflict) {
    return { ok: false, message: `Oda bu tarihlerde ${reservationConflict} rezervasyonuna bağlı.` };
  }

  const id = createId("stay_");
  const now = new Date().toISOString();
  db.exec("SAVEPOINT customer_stay");
  try {
    db
      .prepare(`
          INSERT INTO customer_room_stays (
            id, customer_id, room_id, reservation_id, status, check_in_date,
            check_out_date, guest_count, notes, source, checked_in_at,
            checked_out_at, created_at, updated_at, deleted_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, '', 'local_only')
        `)
      .run(
        id,
        customerId,
        roomId,
        reservationId,
        status,
        checkInDate,
        checkOutDate,
        guestCount,
        notes,
        reservationId ? "reservation" : "manual",
        status === "checked_in" ? now : "",
        now,
        now
      );
    for (const guestId of guestIds.filter(guestId => guestId !== customerId)) {
      db.prepare(`INSERT INTO stay_guests (id, stay_id, customer_id, status, checked_in_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(createId("guest_"), id, guestId, status, status === "checked_in" ? now : "", now, now);
    }
    refreshRoomStatusFromStays(db, roomId, now, false);
    insertDatabaseEvent(db, {
      type: "customer.room_assigned",
      entityType: "customer_room_stay",
      entityId: id,
      payload: {
        ...(reservationId ? { reservation_id: reservationId } : {}),
        customer_id: customerId,
        room_id: roomId,
        status,
        check_in_date: checkInDate,
        check_out_date: checkOutDate
      },
      now
    });
    db.exec("RELEASE customer_stay");
  } catch {
    db.exec("ROLLBACK TO customer_stay; RELEASE customer_stay");
    return { ok: false, message: "Müşteri oda kaydı oluşturulamadı." };
  }

  const roomLabel = String(room.number ?? "").trim() || String(room.name ?? "").trim();
  return {
    ok: true,
    message: status === "checked_in"
      ? `${String(customer.full_name ?? "Müşteri")} ${roomLabel ? `· ${roomLabel}` : ""} giriş yaptı.`
      : `${String(customer.full_name ?? "Müşteri")} ${roomLabel ? `· ${roomLabel}` : ""} oda planına eklendi.`,
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
  if (status === "checked_out") {
    try { return checkoutHospitalityStay(db, { stayId }); }
    catch { return { ok: false, message: "Konaklama durumu güncellenemedi." }; }
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
    checked_in: [],
    cancelled: ["planned"],
    checked_out: []
  };
  if (!(allowedTransitions[previousStatus] ?? []).includes(status)) {
    return { ok: false, message: "Bu konaklama kaydı seçilen duruma geçirilemez." };
  }
  if (["planned", "checked_in"].includes(status)) {
    const activeCustomerStay = findStoredActiveCustomerRoomStay(db, String(stay.customer_id ?? ""), stayId);
    if (activeCustomerStay) {
      const assignedRoom = activeCustomerStay.roomNumber
        ? `Oda ${activeCustomerStay.roomNumber}`
        : activeCustomerStay.roomName || "başka bir oda";
      return { ok: false, message: `Müşteri zaten ${assignedRoom} için aktif. Önce mevcut oda kaydını çıkış veya iptal ile kapatın.` };
    }
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
  db.exec("SAVEPOINT stay_status");
  try {
    if (status === "checked_in") {
      const guests = db.prepare("SELECT COUNT(*) AS count FROM stay_guests WHERE stay_id = ? AND status = 'planned'").get(stayId) as { count: number };
      if (!guests.count) throw new Error("Konaklamaya en az bir misafir eklenmeli.");
      db.prepare("UPDATE customer_room_stays SET guest_count = ? WHERE id = ?").run(guests.count, stayId);
      db.prepare("UPDATE room_folios SET guest_count = ?, updated_at = ?, sync_status = 'local_only' WHERE stay_id = ? AND status = 'open'").run(guests.count, now, stayId);
    }
    db
      .prepare(`
          UPDATE customer_room_stays
          SET status = ?,
              checked_in_at = CASE WHEN ? = 'checked_in' THEN ? ELSE checked_in_at END,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
      .run(status, status, now, now, stayId);
    refreshRoomStatusFromStays(
      db,
      String(stay.room_id ?? ""),
      now,
      false
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
    db.exec("RELEASE stay_status");
  } catch {
    db.exec("ROLLBACK TO stay_status; RELEASE stay_status");
    return { ok: false, message: "Konaklama durumu güncellenemedi." };
  }

  return {
    ok: true,
    message: status === "checked_in"
      ? "Müşteri odaya giriş yaptı."
      : status === "cancelled"
        ? "Oda ataması iptal edildi."
        : "Oda ataması yeniden planlandı.",
    savedId: stayId
  };
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
        db.prepare("UPDATE rooms SET status = 'reserved', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND status IN ('available', 'reserved') AND deleted_at = ''").run(now, roomId);
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
