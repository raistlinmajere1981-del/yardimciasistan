import { checkoutHospitalityStay } from "./hospitality-checkout.js";
import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { createHash } from "node:crypto";
import {
  addRoomFolioPaymentInTransaction, addRoomFolioMenuItemInTransaction,
  addRoomFolioManualItemInTransaction, getRoomFolioChargeState, type RoomFolioPaymentMethod
} from "./room-folio.js";
import { getPublishedMenu } from "./database/menu-store.js";

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
  if (["room_folio_menu_item_add", "room_folio_manual_charge_add"].includes(options.action.action_type)) {
    return addCharge(options);
  }
  return { ok: false, message: "Telefon oda hesabı işlem türü desteklenmiyor." };
}

function addCharge({ db, action, now, insertEvent }: ApplyAndroidRoomFolioActionOptions): AndroidRoomFolioMutationResult {
  const payload = actionPayload(action);
  const folioId = text(payload.folio_id);
  const expectedVersion = text(payload.expected_folio_version);
  if (!folioId || !/^[a-f0-9]{64}$/.test(expectedVersion)) {
    return { ok: false, message: "Güncel oda hesabı sürümü gerekli. Veriyi yenileyip tekrar deneyin." };
  }
  const state = getRoomFolioChargeState(db, folioId);
  if (!state?.canAddItems) {
    return { ok: false, message: "Kalem eklemek için açık oda hesabı ve giriş yapılmış geçerli konaklama gerekli." };
  }
  if (state.version !== expectedVersion) {
    return { ok: false, message: "Oda hesabı siz açtıktan sonra değişmiş. Güncel veriyi çekip tekrar deneyin." };
  }
  const itemId = `room_folio_item_android_${createHash("sha256").update(action.id).digest("hex")}`;
  const menuCharge = action.action_type === "room_folio_menu_item_add";
  let result: AndroidRoomFolioMutationResult;
  try {
    if (menuCharge) {
      const entryId = text(payload.menu_entry_id);
      const quantity = positiveInteger(payload.quantity);
      const expectedMenuUpdatedAt = text(payload.expected_menu_updated_at);
      const expectedUnitPriceMinor = nonNegativeInteger(payload.expected_unit_price_minor);
      const expectedCurrency = text(payload.expected_currency).toUpperCase();
      if (!entryId || typeof payload.quantity !== "number" || quantity === null || quantity > 1000 || !expectedMenuUpdatedAt
          || typeof payload.expected_unit_price_minor !== "number" || expectedUnitPriceMinor === null || !/^[A-Z]{3}$/.test(expectedCurrency)) {
        return { ok: false, message: "Menü ürünü, adet ve güncel fiyat bilgileri gerekli." };
      }
      const menu = getPublishedMenu(db);
      const entry = menu.items.find(item => item.id === entryId && item.is_available
        && item.product_is_active !== false && menu.categories.some(category => category.id === item.category_id && category.is_active));
      if (!entry) return { ok: false, message: "Menü ürünü bulunamadı veya satışa kapalı." };
      if (entry.updated_at !== expectedMenuUpdatedAt || Math.round(entry.price * 100) !== expectedUnitPriceMinor
          || text(entry.currency).toUpperCase() !== expectedCurrency) {
        return { ok: false, message: "Menü fiyatı veya stok bilgisi değişmiş. Güncel veriyi çekip tekrar deneyin." };
      }
      result = addRoomFolioMenuItemInTransaction(db, { folioId, menuEntryId: entryId, quantity }, { itemId, now, actorSource: "android" });
    } else {
      const label = cleanText(payload.label, 121);
      const note = text(payload.note);
      const amountMinor = positiveInteger(payload.amount_minor);
      if (typeof payload.label !== "string" || !label || label.length > 120
          || (payload.note !== undefined && typeof payload.note !== "string") || note.length > 500
          || typeof payload.amount_minor !== "number" || amountMinor === null || amountMinor > 999_999_999_999) {
        return { ok: false, message: "Ek ücret adı (en fazla 120 karakter), pozitif tutar ve not (en fazla 500 karakter) gerekli." };
      }
      result = addRoomFolioManualItemInTransaction(db, { folioId, kind: "manual_charge", label, amountMinor, note }, { itemId, now });
    }
  } catch {
    return { ok: false, message: menuCharge ? "Menü ürünü oda hesabına eklenemedi." : "Ek ücret oda hesabına eklenemedi." };
  }
  if (!result.ok) return result;
  insertEvent("room_folio.item_added", folioId, { item_id: itemId, kind: menuCharge ? "menu" : "manual_charge", source: "android" });
  return result;
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
  const methodInput = text(payload.payment_method);
  const paymentMethod = PAYMENT_METHODS.has(methodInput) ? methodInput : "cash";
  const note = cleanText(payload.note, 500);
  const paymentId = `room_folio_android_payment_${safeId(action.id)}`;
  const referenceId = `android:${text(action.device_id)}/${safeId(action.id)}`;

  try {
    const result = addRoomFolioPaymentInTransaction(db, { folioId, amountMinor, paymentMethod: paymentMethod as RoomFolioPaymentMethod, note },
      { paymentId, referenceId, now });
    if (!result.ok) return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLocaleLowerCase("tr-TR") : "";
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
