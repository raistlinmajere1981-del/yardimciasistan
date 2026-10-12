import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { getCommerceOrderOperationState, updateCommerceOrderStatusInTransaction } from "./commerce-order-store";
import { insertAndroidActionEvent } from "./android-action-service";
import { androidPayloadString, getAndroidVersionConflict, nextMutationTimestamp, type AndroidActionMutationResult } from "./database/android-utils";

export function commerceAndroidActionIntentHash(action: AndroidSyncAction): string {
  const orderId = androidPayloadString(action.payload, "order_id");
  const expected = androidPayloadString(action.payload, "expected_updated_at");
  const expectedStatus = androidPayloadString(action.payload, "expected_status");
  if (!["placed", "confirmed", "fulfilled", "cancelled"].includes(expectedStatus) || !/^[A-Za-z0-9._:-]{1,120}$/.test(orderId) || !expected || expected.length > 40 || !Number.isFinite(Date.parse(expected))) return "";
  return createHash("sha256").update(JSON.stringify([action.action_type, action.device_id, orderId, expected, expectedStatus])).digest("hex");
}

export function applyAndroidCommerceOrderAction(db: DatabaseSync, action: AndroidSyncAction, now: string): AndroidActionMutationResult {
  const intentHash = commerceAndroidActionIntentHash(action);
  if (!intentHash) return { ok: false, message: "Sipariş kimliği, beklenen durum ve güncelleme zamanı gerekli." };
  const orderId = androidPayloadString(action.payload, "order_id");
  const order = getCommerceOrderOperationState(db, orderId);
  if (!order) return { ok: false, message: "Sipariş bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_updated_at", order.updatedAt, "Ticari sipariş");
  if (conflict) return conflict;
  if (order.status !== androidPayloadString(action.payload, "expected_status")) {
    return { ok: false, message: "Ticari sipariş masaüstünde değişmiş. Telefonda canlı veriyi yenileyip tekrar deneyin." };
  }
  try {
    const result = updateCommerceOrderStatusInTransaction(db, {
      orderId, status: action.action_type === "commerce_order_confirm" ? "confirmed" : "cancelled"
    }, nextMutationTimestamp(order.updatedAt, now));
    insertAndroidActionEvent(db, action, "commerce.order_status_changed", "commerce_order", orderId,
      { status: result.order.status }, now);
    return { ok: true, message: "Ticari sipariş durumu telefondan güncellendi." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Sipariş güncellenemedi." };
  }
}
