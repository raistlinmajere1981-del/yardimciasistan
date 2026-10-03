import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import type { AndroidActionMutationResult } from "./android-utils.js";
import {
  getAndroidVersionConflict,
  nextMutationTimestamp
} from "./android-utils.js";
import {
  insertDeletionEvent,
  type DeletionAndroidEventSink
} from "./deletion-store.js";

export function deleteCustomerInTransaction(
  db: DatabaseSync,
  customerId: string,
  now: string,
  androidAction?: AndroidSyncAction,
  insertAndroidEvent?: DeletionAndroidEventSink
): AndroidActionMutationResult {
  if (!customerId) {
    return { ok: false, message: "Silinecek müşteri seçilmemiş." };
  }
  const customer = db
    .prepare("SELECT full_name, updated_at FROM customers WHERE id = ? AND deleted_at = ''")
    .get(customerId) as { full_name?: string; updated_at?: string } | undefined;
  if (!customer) {
    return { ok: false, message: "Müşteri masaüstü kayıtlarında bulunamadı." };
  }

  const creditDebt = db.prepare(`
    SELECT 1 FROM customer_credit_balances
    WHERE customer_id = ? AND amount_minor > 0 LIMIT 1
  `).get(customerId);
  if (creditDebt) {
    return { ok: false, message: "Bu müşterinin açık veresiye borcu var." };
  }
  if (db.prepare("SELECT 1 FROM room_folios WHERE customer_id = ? AND deleted_at = '' AND status = 'open'").get(customerId)) {
    return { ok: false, message: "Bu müşterinin açık konaklama hesabı var; önce hesabı sonuçlandırın." };
  }
  if (db.prepare("SELECT 1 FROM reservations WHERE customer_id = ? AND status IN ('pending', 'approved') AND deleted_at = '' LIMIT 1").get(customerId)) {
    return { ok: false, message: "Bu müşterinin aktif rezervasyonu var; önce rezervasyonu tamamlayın veya iptal edin." };
  }

  const activeStay = db
    .prepare(`
      SELECT customer_room_stays.id, rooms.name AS room_name
      FROM customer_room_stays
      JOIN rooms ON rooms.id = customer_room_stays.room_id
      WHERE EXISTS (
        SELECT 1
        FROM stay_guests g
        WHERE g.stay_id = customer_room_stays.id
          AND g.customer_id = ?
          AND g.status IN ('planned', 'checked_in')
      )
        AND customer_room_stays.status IN ('planned', 'checked_in')
        AND customer_room_stays.deleted_at = ''
      LIMIT 1
    `)
    .get(customerId) as { id?: string; room_name?: string } | undefined;
  if (activeStay) {
    return {
      ok: false,
      message: `${String(activeStay.room_name ?? "Oda")} için aktif konaklama kaydı var. Önce çıkış veya iptal işlemini tamamlayın.`
    };
  }

  const versionConflict = androidAction
    ? getAndroidVersionConflict(androidAction.payload, "expected_updated_at", customer.updated_at, "Müşteri")
    : null;
  if (versionConflict) {
    return versionConflict;
  }

  const updatedAt = nextMutationTimestamp(customer.updated_at, now);
  const requestResult = db
    .prepare("UPDATE requests SET customer_id = '', updated_at = ?, sync_status = 'local_only' WHERE customer_id = ? AND deleted_at = ''")
    .run(updatedAt, customerId);
  const reservationResult = db
    .prepare("UPDATE reservations SET customer_id = '', updated_at = ?, sync_status = 'local_only' WHERE customer_id = ? AND deleted_at = ''")
    .run(updatedAt, customerId);
  db
    .prepare("UPDATE whatsapp_messages SET customer_id = '', updated_at = ?, sync_status = 'local_only' WHERE customer_id = ? AND deleted_at = ''")
    .run(updatedAt, customerId);
  db
    .prepare("UPDATE notifications SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE related_type = 'customer' AND related_id = ? AND deleted_at = ''")
    .run(updatedAt, updatedAt, customerId);
  db
    .prepare("DELETE FROM customer_commercial_profiles WHERE customer_id = ?")
    .run(customerId);
  db
    .prepare("UPDATE customers SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
    .run(updatedAt, updatedAt, customerId);

  insertDeletionEvent(
    db,
    androidAction,
    insertAndroidEvent,
    "customer.deleted",
    "customer",
    customerId,
    {
      full_name: String(customer.full_name ?? ""),
      preserved_request_count: Number(requestResult.changes ?? 0),
      preserved_reservation_count: Number(reservationResult.changes ?? 0)
    },
    now
  );

  return {
    ok: true,
    message: androidAction
      ? "Müşteri telefondan silindi; talep ve rezervasyon geçmişi korundu."
      : "Müşteri silindi; talep ve rezervasyon geçmişi korundu."
  };
}
