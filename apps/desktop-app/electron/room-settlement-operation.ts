import type { DatabaseSync } from "node:sqlite";
import type { AddRoomFolioPaymentInput, RoomFolioPaymentMethod } from "./room-folio.js";
import { addRoomFolioPaymentInTransaction } from "./room-folio.js";
import { checkoutHospitalityStay } from "./hospitality-checkout.js";
import { desktopLog } from "./desktop-logger.js";
import type { DesktopDashboardData } from "./database-types.js";

export type RoomPaymentOperationResult =
  | { ok: false; message: string }
  | { ok: true; message: string; amountMinor: number; remainingMinor: number | null;
      closure: "open" | "closed" | "failed"; closureMessage?: string };

export interface CheckoutStayOperationInput {
  stayId: string;
  roomId: string;
  settleCurrent: boolean;
  previousFolioIds: string[];
  paymentMethod: RoomFolioPaymentMethod;
}

export type CheckoutStayOperationResult =
  | { ok: false; message: string }
  | { ok: true; message: string; savedId: string;
      settlements: Array<{ folioId: string; result: RoomPaymentOperationResult }> };

export type DesktopCheckoutStayOperationResult = Extract<CheckoutStayOperationResult, { ok: false }>
  | (Extract<CheckoutStayOperationResult, { ok: true }> & { dashboardData: DesktopDashboardData });

function account(db: DatabaseSync, folioId: string) {
  return db.prepare(`SELECT f.id, f.status, f.stay_id, f.customer_id, t.remaining_minor,
    s.status AS stay_status FROM room_folios f
    JOIN room_folio_totals t ON t.folio_id = f.id
    JOIN customer_room_stays s ON s.id = f.stay_id AND s.deleted_at = ''
    WHERE f.id = ? AND f.deleted_at = ''`).get(folioId) as
    { id: string; status: string; stay_id: string; customer_id: string; remaining_minor: number; stay_status: string } | undefined;
}

type SettlementTarget = { stayId: string; customerId: string; current: boolean };
function eligibleCheckoutAccount(current: ReturnType<typeof account>, target: SettlementTarget) {
  return current && current.customer_id === target.customerId && (target.current
    ? current.stay_id === target.stayId && current.stay_status === "checked_out"
    : current.stay_id !== target.stayId && !["planned", "checked_in"].includes(current.stay_status));
}

/** Payment commits independently of financial closure. Never departs an active Stay. */
export function collectRoomFolioPayment(db: DatabaseSync, input: AddRoomFolioPaymentInput,
  settleRemaining = false, target?: SettlementTarget): RoomPaymentOperationResult {
  const folioId = String(input?.folioId ?? "").trim();
  let amountMinor = 0;
  let paymentActive = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    paymentActive = true;
    const current = account(db, folioId);
    if (target && !eligibleCheckoutAccount(current, target)) {
      db.exec("ROLLBACK");
      return { ok: false, message: "Seçilen hesap artık bu çıkış için uygun değil." };
    }
    if (settleRemaining && current?.status === "closed") {
      db.exec("COMMIT");
      return { ok: true, message: "Hesap zaten kapalı.", amountMinor: 0,
        remainingMinor: Number(current.remaining_minor), closure: "closed" };
    }
    if (!current || current.status !== "open") {
      db.exec("ROLLBACK");
      return { ok: false, message: "Oda adisyonu kapalı." };
    }
    amountMinor = settleRemaining ? Number(current.remaining_minor) : input.amountMinor;
    if (!settleRemaining || amountMinor > 0) {
      const payment = addRoomFolioPaymentInTransaction(db, { ...input, folioId, amountMinor });
      if (!payment.ok) { db.exec("ROLLBACK"); return payment; }
    }
    db.exec("COMMIT");
  } catch (error) {
    if (paymentActive) db.exec("ROLLBACK");
    desktopLog.error({ scope: "hospitality", event: "hospitality.collection.payment.failed",
      message: "Oda hesabı tahsilatı kaydedilemedi.", meta: { folioId }, error });
    return { ok: false, message: "Ödeme kaydedilemedi." };
  }

  // A second snapshot decides closure. A committed payment must not be lost or
  // reported as failed when closure subsequently fails.
  let closureActive = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    closureActive = true;
    const updated = account(db, folioId);
    if (!updated) throw new Error("room_settlement_account_missing");
    let closure: "open" | "closed" = updated.status === "closed" ? "closed" : "open";
    if (updated.status === "open" && (!target || eligibleCheckoutAccount(updated, target))
      && !["planned", "checked_in"].includes(updated.stay_status) && Number(updated.remaining_minor) === 0) {
      const closed = checkoutHospitalityStay(db, { folioId });
      if (!closed.ok) throw new Error(closed.message);
      closure = closed.folioClosed ? "closed" : "open";
    }
    const remainingMinor = Number(account(db, folioId)?.remaining_minor ?? updated.remaining_minor);
    db.exec("COMMIT");
    return { ok: true, message: remainingMinor === 0 ? "Borç tamamen tahsil edildi." : "Tahsilat kaydedildi.",
      amountMinor, remainingMinor, closure };
  } catch (error) {
    if (closureActive) db.exec("ROLLBACK");
    desktopLog.error({ scope: "hospitality", event: "hospitality.collection.closure.failed",
      message: "Tahsilat tamamlandı; hesap kapanışı tamamlanamadı.", meta: { folioId }, error });
    return { ok: true, message: "Tahsilat alındı; hesap kapanışı doğrulanamadı.", amountMinor,
      remainingMinor: null, closure: "failed",
      closureMessage: "Açık hesap durumunu kontrol edip hesap kapanışını yeniden deneyin." };
  }
}

/** Departure, then independent collections: deliberately not one all-or-nothing transaction. */
export function checkoutStayWithSettlement(db: DatabaseSync, input: CheckoutStayOperationInput): CheckoutStayOperationResult {
  const stayId = String(input?.stayId ?? "").trim();
  const roomId = String(input?.roomId ?? "").trim();
  const previousIds = Array.isArray(input?.previousFolioIds) ? [...new Set(input.previousFolioIds.map(String))] : [];
  if (!stayId || !roomId) return { ok: false, message: "Çıkış isteği geçersiz." };
  let customerId: string;
  let currentFolioId = "";
  let departure;
  let departureActive = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    departureActive = true;
    const stay = db.prepare("SELECT customer_id, room_id, status FROM customer_room_stays WHERE id = ? AND deleted_at = ''")
      .get(stayId) as { customer_id: string; room_id: string; status: string } | undefined;
    if (!stay || stay.room_id !== roomId || !["checked_in", "checked_out"].includes(stay.status)) {
      db.exec("ROLLBACK");
      return { ok: false, message: "Konaklama veya oda durumu değişti. Güncel kaydı kontrol edin." };
    }
    customerId = stay.customer_id;
    currentFolioId = String((db.prepare("SELECT id FROM room_folios WHERE stay_id = ? AND status = 'open' AND deleted_at = ''")
      .get(stayId) as { id: string } | undefined)?.id ?? "");
    departure = checkoutHospitalityStay(db, { stayId });
    if (!departure.ok) { db.exec("ROLLBACK"); return departure; }
    db.exec("COMMIT");
  } catch (error) {
    if (departureActive) db.exec("ROLLBACK");
    desktopLog.error({ scope: "hospitality", event: "hospitality.departure.failed",
      message: "Misafir çıkışı tamamlanamadı.", meta: { stayId }, error });
    return { ok: false, message: "Çıkış işlemi tamamlanamadı." };
  }
  const targets = [...new Set([...(input.settleCurrent && currentFolioId ? [currentFolioId] : []), ...previousIds])];
  const settlements = targets.map(folioId => {
    return { folioId, result: collectRoomFolioPayment(db, { folioId, amountMinor: 0, paymentMethod: input.paymentMethod }, true,
      { stayId, customerId, current: input.settleCurrent && folioId === currentFolioId }) };
  });
  const partial = settlements.some(step => !step.result.ok || step.result.closure !== "closed");
  return { ok: true, savedId: stayId, settlements, message: partial
    ? "Çıkış tamamlandı; bazı tahsilatlar veya hesap kapanışları tamamlanamadı. Açık hesaplardan devam edebilirsiniz."
    : targets.length ? "Misafir çıkışı tamamlandı; seçilen hesaplar tahsil edilip kapatıldı." : departure.message };
}
