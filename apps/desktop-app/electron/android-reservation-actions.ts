import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { saveManualReservation } from "./stay-reservation-service.js";
import { saveManualRestaurantReservation } from "./database/reservation-store.js";
import { androidPayloadString, createAndroidEntityId, getAndroidVersionConflict, nextMutationTimestamp } from "./database/android-utils.js";

export type AndroidReservationMutationResult = { ok: true; message: string } | { ok: false; message: string };
export interface AndroidReservationActionContext {
  db: DatabaseSync; action: AndroidSyncAction; now: string;
}

export function applyAndroidReservationAction({ db, action, now }: AndroidReservationActionContext): AndroidReservationMutationResult {
  if (!["reservation_room_create", "reservation_room_update", "reservation_table_create", "reservation_table_update"].includes(action.action_type)) {
    return { ok: false, message: "Telefon rezervasyon işlem türü desteklenmiyor." };
  }
  const editing = action.action_type.endsWith("_update");
  const room = action.action_type.startsWith("reservation_room_");
  const reservationId = editing ? androidPayloadString(action.payload, "reservation_id") : createAndroidEntityId("reservation_", action.id);
  const existing = editing ? db.prepare("SELECT customer_id, updated_at FROM reservations WHERE id = ? AND deleted_at = ''").get(reservationId) as { customer_id: string; updated_at: string } | undefined : undefined;
  if (editing && !existing) return { ok: false, message: room ? "Düzenlenecek rezervasyon masaüstü kayıtlarında bulunamadı." : "Düzenlenecek restoran rezervasyonu bulunamadı." };
  const conflict = editing ? getAndroidVersionConflict(action.payload, "expected_updated_at", existing?.updated_at, "Rezervasyon") : null;
  if (conflict) return conflict;
  const customerId = existing?.customer_id ?? androidPayloadString(action.payload, "customer_id");
  const guestCount = Math.trunc(Number(action.payload.guest_count));
  const notes = androidPayloadString(action.payload, "notes");
  const context = { now: nextMutationTimestamp(existing?.updated_at, now), androidAction: action, newReservationId: reservationId, allowExtraCapacity: false };
  // Strict wire date/time decoding remains at the phone boundary, not a second overlap rule.
  const startDate = androidPayloadString(action.payload, room ? "start_date" : "date");
  const endDate = androidPayloadString(action.payload, "end_date");
  const time = androidPayloadString(action.payload, "time");
  if (!validDate(startDate) || (room && (!validDate(endDate) || endDate <= startDate)) || (!room && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) || !Number.isFinite(guestCount) || guestCount < 1 || guestCount > 99) {
    return { ok: false, message: room ? "Geçerli giriş-çıkış tarihi ve 1-99 arasında kişi sayısı gerekli." : "Geçerli tarih, saat ve 1-99 arasında kişi sayısı gerekli." };
  }
  const result = room ? saveManualReservation(db, {
    reservationId: editing ? reservationId : undefined, customerId, roomId: androidPayloadString(action.payload, "room_id"), startDate, endDate, guestCount, notes
  }, context) : saveManualRestaurantReservation(db, {
    customerId, tableId: androidPayloadString(action.payload, "table_id"), date: startDate, time, guestCount, notes
  }, { ...context, reservationId: editing ? reservationId : undefined });
  return result.ok ? { ok: true, message: room ? editing ? "Pansiyon rezervasyonu telefondan güncellendi." : "Pansiyon rezervasyonu telefondan oluşturuldu."
    : editing ? "Restoran rezervasyonu telefondan güncellendi." : "Restoran rezervasyonu telefondan oluşturuldu." } : result;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
