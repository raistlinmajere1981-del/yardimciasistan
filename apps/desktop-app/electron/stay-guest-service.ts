import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type { CheckoutStayGuestInput, MoveStayRoomInput, StayGuestInput } from "./database-types.js";
import { findActiveCustomerRoomStay, hasOverlappingCustomerRoomStay } from "./database/customer-room-stay-store.js";
import { findConflictingRoomReservation } from "./database/reservation-store.js";
import { insertDatabaseEvent } from "./database/event-store.js";
import { checkoutHospitalityStay } from "./hospitality-checkout.js";
import { refreshRoomStatusFromStays } from "./room-state-service.js";

type Result = { ok: true; savedId: string; message: string } | { ok: false; message: string };
type Stay = { id: string; customer_id: string; room_id: string; status: string; guest_count: number;
  check_in_date: string; check_out_date: string; reservation_id: string };

function activeStay(db: DatabaseSync, id: string) {
  return db.prepare("SELECT * FROM customer_room_stays WHERE id = ? AND deleted_at = '' AND status IN ('planned', 'checked_in')")
    .get(id) as Stay | undefined;
}

function transact(db: DatabaseSync, operation: (now: string) => Result): Result {
  db.exec("SAVEPOINT stay_guest_operation");
  try {
    const result = operation(new Date().toISOString());
    if (!result.ok) db.exec("ROLLBACK TO stay_guest_operation");
    db.exec("RELEASE stay_guest_operation");
    return result;
  } catch {
    db.exec("ROLLBACK TO stay_guest_operation; RELEASE stay_guest_operation");
    return { ok: false, message: "Konaklama işlemi kaydedilemedi; hiçbir değişiklik uygulanmadı." };
  }
}

function record(db: DatabaseSync, stayId: string, event: string, now: string, payload: Record<string, unknown>) {
  db.prepare("UPDATE customer_room_stays SET updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(now, stayId);
  insertDatabaseEvent(db, { type: event, entityType: "customer_room_stay", entityId: stayId, payload, now });
}

function refreshGuestCount(db: DatabaseSync, stay: Stay, now: string) {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM stay_guests WHERE stay_id = ? AND status IN ('planned', 'checked_in')")
    .get(stay.id) as { count: number };
  const total = stay.status === "planned" ? Math.max(count, stay.guest_count) : Math.max(count, 1);
  db.prepare("UPDATE customer_room_stays SET guest_count = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(total, now, stay.id);
  db.prepare("UPDATE room_folios SET guest_count = ?, updated_at = ?, sync_status = 'local_only' WHERE stay_id = ? AND status = 'open'").run(total, now, stay.id);
}

export function addStayGuest(db: DatabaseSync, input: StayGuestInput): Result {
  return transact(db, now => {
    const stay = activeStay(db, input.stayId);
    if (!stay) return { ok: false, message: "Aktif konaklama bulunamadı." };
    const existing = findActiveCustomerRoomStay(db, input.customerId);
    if (existing?.id === stay.id) return { ok: true, savedId: stay.id, message: "Misafir zaten bu konaklamada." };
    if (existing) return { ok: false, message: "Misafir başka bir aktif konaklamada." };
    if (!db.prepare("SELECT 1 FROM customers WHERE id = ? AND deleted_at = ''").get(input.customerId)) return { ok: false, message: "Müşteri bulunamadı." };
    const room = db.prepare("SELECT capacity FROM rooms WHERE id = ?").get(stay.room_id) as { capacity: number };
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM stay_guests WHERE stay_id = ? AND status IN ('planned', 'checked_in')").get(stay.id) as { count: number };
    if (count >= 50 || (room.capacity > 0 && count >= room.capacity)) return { ok: false, message: "Oda kapasitesi dolu." };
    db.prepare(`INSERT INTO stay_guests (id, stay_id, customer_id, status, checked_in_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(createId("guest_"), stay.id, input.customerId, stay.status, stay.status === "checked_in" ? now : "", now, now);
    refreshGuestCount(db, stay, now);
    record(db, stay.id, "hospitality.guest_added", now, { customer_id: input.customerId });
    return { ok: true, savedId: stay.id, message: "Misafir konaklamaya eklendi." };
  });
}

export function changeStayPrimary(db: DatabaseSync, input: StayGuestInput): Result {
  return transact(db, now => {
    const stay = activeStay(db, input.stayId);
    if (!stay || !db.prepare("SELECT 1 FROM stay_guests WHERE stay_id = ? AND customer_id = ? AND status IN ('planned', 'checked_in')").get(input.stayId, input.customerId)) {
      return { ok: false, message: "Ana misafir, konaklamada kalan kişilerden seçilmeli." };
    }
    if (stay.customer_id === input.customerId) return { ok: true, savedId: stay.id, message: "Ana misafir zaten seçili." };
    db.prepare("UPDATE customer_room_stays SET customer_id = ? WHERE id = ?").run(input.customerId, stay.id);
    // The shared folio and its original billing customer remain intact.
    record(db, stay.id, "hospitality.primary_guest_changed", now, { previous_customer_id: stay.customer_id, customer_id: input.customerId });
    return { ok: true, savedId: stay.id, message: "Ana misafir değişti; ortak hesap ve hesap sahibi korundu." };
  });
}

export function checkoutStayGuest(db: DatabaseSync, input: CheckoutStayGuestInput): Result {
  return transact(db, now => {
    const stay = activeStay(db, input.stayId);
    if (!stay || stay.status !== "checked_in") return { ok: false, message: "Giriş yapmış konaklama bulunamadı." };
    const guests = db.prepare("SELECT customer_id FROM stay_guests WHERE stay_id = ? AND status = 'checked_in'").all(stay.id) as { customer_id: string }[];
    if (!guests.some(guest => guest.customer_id === input.customerId)) return { ok: false, message: "Bu misafir konaklamada değil." };
    if (guests.length === 1) return checkoutHospitalityStay(db, { stayId: stay.id }, { now });
    if (stay.customer_id === input.customerId) {
      if (!input.nextPrimaryCustomerId || input.nextPrimaryCustomerId === input.customerId || !guests.some(guest => guest.customer_id === input.nextPrimaryCustomerId)) {
        return { ok: false, message: "Çıkıştan önce kalan misafirlerden yeni ana misafiri seçin." };
      }
      db.prepare("UPDATE customer_room_stays SET customer_id = ? WHERE id = ?").run(input.nextPrimaryCustomerId, stay.id);
    }
    db.prepare("UPDATE stay_guests SET status = 'checked_out', checked_out_at = ?, updated_at = ? WHERE stay_id = ? AND customer_id = ? AND status = 'checked_in'")
      .run(now, now, stay.id, input.customerId);
    refreshGuestCount(db, stay, now);
    record(db, stay.id, "hospitality.guest_departed", now, { customer_id: input.customerId, primary_customer_id: input.nextPrimaryCustomerId || stay.customer_id });
    return { ok: true, savedId: stay.id, message: "Misafir çıkışı yapıldı; kalan misafirler ve ortak hesap devam ediyor." };
  });
}

export function moveStayRoom(db: DatabaseSync, input: MoveStayRoomInput): Result {
  return transact(db, now => {
    const stay = activeStay(db, input.stayId);
    if (!stay || stay.status !== "checked_in") return { ok: false, message: "Giriş yapmış konaklama bulunamadı." };
    if (stay.room_id === input.roomId) return { ok: true, savedId: stay.id, message: "Konaklama zaten bu odada." };
    const room = db.prepare("SELECT capacity, status FROM rooms WHERE id = ? AND deleted_at = '' AND is_active = 1").get(input.roomId) as { capacity: number; status: string } | undefined;
    if (!room || ["cleaning", "maintenance", "out_of_service", "occupied"].includes(room.status)) return { ok: false, message: "Yeni oda hazır ve boş olmalı." };
    if (room.capacity > 0 && stay.guest_count > room.capacity) return { ok: false, message: "Yeni odanın kapasitesi yetersiz." };
    const today = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
    if (hasOverlappingCustomerRoomStay(db, input.roomId, today, stay.check_out_date > today ? stay.check_out_date : "", stay.id)
      || db.prepare("SELECT 1 FROM customer_room_stays WHERE room_id = ? AND status = 'checked_in' AND deleted_at = ''").get(input.roomId)) {
      return { ok: false, message: "Yeni odada çakışan konaklama var." };
    }
    if (findConflictingRoomReservation(db, input.roomId, "", today, stay.check_out_date > today ? stay.check_out_date : "", stay.reservation_id)) {
      return { ok: false, message: "Yeni odada çakışan rezervasyon var." };
    }
    db.prepare("UPDATE stay_room_history SET left_at = ? WHERE stay_id = ? AND left_at = ''").run(now, stay.id);
    db.prepare("INSERT INTO stay_room_history (id, stay_id, room_id, entered_at) VALUES (?, ?, ?, ?)").run(createId("room_"), stay.id, input.roomId, now);
    db.prepare("UPDATE customer_room_stays SET room_id = ? WHERE id = ?").run(input.roomId, stay.id);
    db.prepare("UPDATE room_folios SET room_id = ?, updated_at = ?, sync_status = 'local_only' WHERE stay_id = ?").run(input.roomId, now, stay.id);
    db.prepare(`INSERT INTO hospitality_notifications (id, guest_id, stay_id, room_id, kind, occurred_at, identity_snapshot, created_at)
      SELECT lower(hex(randomblob(16))), g.id, g.stay_id, ?, 'room_change', ?,
        json_object('customerId', c.id, 'fullName', c.full_name, 'identityType', c.identity_type,
          'identityNumber', c.identity_number, 'nationality', c.nationality, 'birthDate', c.birth_date,
          'documentSerialNumber', c.document_serial_number, 'documentExpiryDate', c.document_expiry_date,
          'gender', c.gender, 'birthPlace', c.birth_place, 'motherName', c.mother_name,
          'fatherName', c.father_name, 'issuingAuthority', c.issuing_authority, 'address', c.address,
          'phone', c.phone, 'previousRoomId', ?, 'roomNumber', r.number), ?
      FROM stay_guests g JOIN customers c ON c.id = g.customer_id JOIN rooms r ON r.id = ?
      WHERE g.stay_id = ? AND g.status = 'checked_in'`).run(input.roomId, now, stay.room_id, now, input.roomId, stay.id);
    refreshRoomStatusFromStays(db, stay.room_id, now, true);
    refreshRoomStatusFromStays(db, input.roomId, now, false);
    record(db, stay.id, "hospitality.room_changed", now, { previous_room_id: stay.room_id, room_id: input.roomId });
    return { ok: true, savedId: stay.id, message: "Oda değişti; hesap, misafirler ve anlaşılmış fiyat korundu. Eski oda temizlik bekliyor." };
  });
}
