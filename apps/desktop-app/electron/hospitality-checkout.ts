import type { DatabaseSync } from "node:sqlite";
import { insertDatabaseEvent } from "./database/event-store.js";
import { refreshRoomStatusFromStays } from "./room-state-service.js";

interface CheckoutOrigin {
  now?: string;
  android?: { actionId: string; deviceId: string };
}
type CheckoutTarget = { stayId: string; folioId?: never } | { folioId: string; stayId?: never };
type CheckoutResult = { ok: false; message: string } | {
  ok: true; message: string; savedId: string; folioId: string; remainingMinor: number; folioClosed: boolean;
};

/** Financial closure only. Caller owns the transaction; never mutates a Stay or Room. */
function closeFolioIfSettled(db: DatabaseSync, folioId: string, now: string): { closed: boolean; remainingMinor: number } {
  const totals = db.prepare("SELECT remaining_minor FROM room_folio_totals WHERE folio_id = ?").get(folioId) as { remaining_minor: number } | undefined;
  if (!totals) throw new Error("room_folio_totals_missing");
  const remainingMinor = Number(totals.remaining_minor);
  if (remainingMinor !== 0) return { closed: false, remainingMinor };
  db.prepare("UPDATE room_folios SET status = 'closed', closed_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND status = 'open'").run(now, now, folioId);
  return { closed: true, remainingMinor: 0 };
}

/** One departure contract for desktop Stay/Folio and both Android action paths. */
export function checkoutHospitalityStay(db: DatabaseSync, target: CheckoutTarget, origin: CheckoutOrigin = {}): CheckoutResult {
  const now = origin.now ?? new Date().toISOString();
  // Composes with the Android action/receipt transaction; standalone calls are atomic too.
  db.exec("SAVEPOINT hospitality_checkout");
  try {
    const result = checkoutInTransaction(db, target, now, origin);
    if (!result.ok) db.exec("ROLLBACK TO hospitality_checkout");
    db.exec("RELEASE hospitality_checkout");
    return result;
  } catch (error) {
    db.exec("ROLLBACK TO hospitality_checkout; RELEASE hospitality_checkout");
    throw error;
  }
}

function checkoutInTransaction(db: DatabaseSync, target: CheckoutTarget, now: string, origin: CheckoutOrigin): CheckoutResult {
  const folio = db.prepare(`SELECT id, stay_id FROM room_folios WHERE deleted_at = '' AND status = 'open' AND ${target.folioId !== undefined ? "id" : "stay_id"} = ?`)
    .get(target.folioId ?? target.stayId) as { id: string; stay_id: string } | undefined;
  if (target.folioId !== undefined && !folio) return { ok: false, message: "Açık oda adisyonu bulunamadı." };
  const stayId = folio?.stay_id ?? target.stayId;
  const stay = db.prepare("SELECT * FROM customer_room_stays WHERE id = ? AND deleted_at = ''").get(stayId!) as {
    status: string; customer_id: string; room_id: string; check_out_date: string;
  } | undefined;
  if (!stay) return { ok: false, message: "Konaklama kaydı bulunamadı." };
  if (!["checked_in", "checked_out"].includes(stay.status)) return { ok: false, message: "Bu konaklama kaydı seçilen duruma geçirilemez." };

  const departing = stay.status === "checked_in";
  if (departing) {
    db.prepare(`UPDATE customer_room_stays SET status = 'checked_out', checked_out_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?`).run(now, now, stayId!);
    refreshRoomStatusFromStays(db, stay.room_id, now, true);
  }
  const financial = folio ? closeFolioIfSettled(db, folio.id, now) : { closed: false, remainingMinor: 0 };
  // Repeated checkout after payment is an explicit financial-close request. It never releases the room again.
  if (departing || financial.closed) {
    const folioEntry = target.folioId !== undefined || !departing;
    insertDatabaseEvent(db, {
      type: !departing ? "room_folio.closed" : folioEntry ? "room_folio.checked_out" : "customer.room_stay_status_changed",
      entityType: folioEntry ? "room_folio" : "customer_room_stay",
      entityId: folioEntry ? folio!.id : stayId!,
      payload: {
        ...(folioEntry ? { stay_id: stayId, checkout_date: stay.check_out_date } : { customer_id: stay.customer_id, previous_status: stay.status, status: "checked_out" }),
        room_id: stay.room_id,
        folio_id: folio?.id ?? "",
        folio_closed: financial.closed,
        remaining_minor: financial.remainingMinor,
        ...(origin.android ? { source: "android", device_id: origin.android.deviceId, android_action_id: origin.android.actionId } : {})
      },
      now,
      actorType: origin.android ? "android" : "desktop",
      ...(origin.android?.deviceId !== undefined ? { actorId: origin.android.deviceId } : {})
    });
  }
  return {
    ok: true, savedId: stayId!, folioId: folio?.id ?? "", remainingMinor: financial.remainingMinor, folioClosed: financial.closed,
    message: financial.remainingMinor > 0
      ? "Müşteri çıkışı tamamlandı; kalan tutar açık oda hesabında korunuyor."
      : "Müşteri çıkışı tamamlandı; oda temizlik durumuna alındı."
  };
}
