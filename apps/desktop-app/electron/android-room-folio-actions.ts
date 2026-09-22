import { checkoutHospitalityStay } from "./hospitality-checkout.js";
import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";

export interface AndroidRoomFolioMutationResult {
  ok: boolean;
  message: string;
}

export interface ApplyAndroidRoomFolioActionOptions {
  db: DatabaseSync;
  action: AndroidSyncAction;
  now: string;
  insertEvent: (type: string, entityId: string, payload: Record<string, unknown>) => void;
}

const PAYMENT_METHODS = new Set(["cash", "card", "bank", "other", "unspecified"]);

export function applyAndroidRoomFolioAction(
  options: ApplyAndroidRoomFolioActionOptions
): AndroidRoomFolioMutationResult {
  if (options.action.action_type === "room_folio_payment_add") {
    return addPayment(options);
  }
  if (options.action.action_type === "room_folio_checkout") {
    return checkout(options);
  }
  return { ok: false, message: "Telefon oda hesabı işlem türü desteklenmiyor." };
}

function addPayment(options: ApplyAndroidRoomFolioActionOptions): AndroidRoomFolioMutationResult {
  const { db, action, now, insertEvent } = options;
  const payload = actionPayload(action);
  const folioId = text(payload.folio_id);
  const amountMinor = positiveInteger(payload.amount_minor);
  const expectedRemainingMinor = nonNegativeInteger(payload.expected_remaining_minor);
  if (!folioId || amountMinor === null || expectedRemainingMinor === null) {
    return { ok: false, message: "Oda tahsilat bilgileri eksik veya geçersiz." };
  }

  const current = getOpenFolioTotals(db, folioId);
  if (!current) {
    return { ok: false, message: "Açık oda hesabı bulunamadı." };
  }
  if (current.remainingMinor !== expectedRemainingMinor) {
    return { ok: false, message: "Oda hesabı siz açtıktan sonra değişmiş. Güncel veriyi çekip tekrar deneyin." };
  }
  if (current.chargeTotalMinor <= 0) {
    return { ok: false, message: "Ödeme almadan önce oda hesabında bir tutar olmalı." };
  }
  if (current.remainingMinor <= 0) {
    return { ok: false, message: "Bu oda hesabının ödemesi tamamlanmış." };
  }
  if (amountMinor > current.remainingMinor) {
    return { ok: false, message: "Ödeme kalan tutardan büyük olamaz." };
  }

  const methodInput = text(payload.payment_method);
  const paymentMethod = PAYMENT_METHODS.has(methodInput) ? methodInput : "cash";
  const note = cleanText(payload.note, 500);
  const paymentId = `room_folio_android_payment_${safeId(action.id)}`;
  const referenceId = `android:${text(action.device_id)}/${safeId(action.id)}`;

  try {
    db.prepare(`
      INSERT INTO room_folio_payments (
        id, folio_id, amount_minor, currency, payment_method, paid_at, note,
        origin, reference_id, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'direct', ?, ?, ?, '', 'local_only')
    `).run(
      paymentId,
      folioId,
      amountMinor,
      current.currency,
      paymentMethod,
      now,
      note,
      referenceId,
      now,
      now
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.toLocaleLowerCase("tr-TR") : "";
    if (message.includes("unique") || message.includes("primary key")) {
      return { ok: true, message: "Oda tahsilatı daha önce kaydedilmiş." };
    }
    if (message.includes("room_folio_payment_exceeds_remaining")) {
      return { ok: false, message: "Ödeme kalan tutardan büyük olamaz." };
    }
    if (message.includes("room_folio_total_required")) {
      return { ok: false, message: "Ödeme almadan önce oda hesabında bir tutar olmalı." };
    }
    return { ok: false, message: "Oda tahsilatı kaydedilemedi." };
  }

  insertEvent("room_folio.payment_added", folioId, {
    payment_id: paymentId,
    amount_minor: amountMinor,
    payment_method: paymentMethod,
    source: "android",
    device_id: text(action.device_id)
  });
  return { ok: true, message: "Oda tahsilatı kaydedildi ve kasaya işlendi." };
}

function checkout(options: ApplyAndroidRoomFolioActionOptions): AndroidRoomFolioMutationResult {
  const { db, action, now } = options;
  const payload = actionPayload(action);
  const folioId = text(payload.folio_id);
  const expectedRemainingMinor = nonNegativeInteger(payload.expected_remaining_minor);
  if (!folioId || expectedRemainingMinor === null) {
    return { ok: false, message: "Çıkış yapılacak oda hesabı geçersiz." };
  }

  const current = getOpenFolioTotals(db, folioId);
  if (!current) {
    return { ok: false, message: "Açık oda hesabı bulunamadı." };
  }
  if (current.remainingMinor !== expectedRemainingMinor) {
    return { ok: false, message: "Oda hesabı siz açtıktan sonra değişmiş. Güncel veriyi çekip tekrar deneyin." };
  }
  const result = checkoutHospitalityStay(db, { folioId }, {
    now, android: { actionId: action.id, deviceId: action.device_id }
  });
  if (!result.ok) return result;
  return { ok: true, message: result.remainingMinor > 0
    ? "Çıkış yapıldı; kalan tutar açık oda hesabında korunuyor."
    : "Çıkış yapıldı ve oda hesabı kapatıldı." };
}

function getOpenFolioTotals(db: DatabaseSync, folioId: string) {
  const row = db.prepare(`
    SELECT
      folios.id,
      folios.stay_id,
      folios.room_id,
      folios.currency,
      folios.planned_check_out_date,
      totals.charge_total_minor,
      totals.paid_total_minor,
      totals.remaining_minor
    FROM room_folios AS folios
    JOIN room_folio_totals AS totals ON totals.folio_id = folios.id
    WHERE folios.id = ? AND folios.status = 'open' AND folios.deleted_at = ''
  `).get(folioId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    stayId: text(row.stay_id),
    roomId: text(row.room_id),
    currency: normalizeCurrency(row.currency),
    plannedCheckOutDate: text(row.planned_check_out_date),
    chargeTotalMinor: safeMinor(row.charge_total_minor),
    paidTotalMinor: safeMinor(row.paid_total_minor),
    remainingMinor: safeMinor(row.remaining_minor)
  };
}

function actionPayload(action: AndroidSyncAction): Record<string, unknown> {
  return action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)
    ? action.payload
    : {};
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanText(value: unknown, limit: number): string {
  return text(value).replace(/\s+/g, " ").slice(0, limit);
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function safeMinor(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : Math.max(0, Math.round(Number(value) || 0));
}

function normalizeCurrency(value: unknown): string {
  const currency = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "TRY";
}

function safeId(value: unknown): string {
  const normalized = text(value).replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 180);
  return normalized || "unknown";
}
