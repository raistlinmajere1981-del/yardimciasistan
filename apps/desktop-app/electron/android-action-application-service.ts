import { commerceAndroidActionIntentHash } from "./android-commerce-order-actions";
import { marketAndroidActionIntentHash } from "./market-android-actions";
import { androidKbsActionIntentHash, isAndroidKbsAction } from "./android-kbs-actions.js";
import { authorizeAndroidAction } from "./android-action-service";
import type { DatabaseSync } from "node:sqlite";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import type { ApplyAndroidActionResult } from "./database-types.js";
import { routeAndroidActionInTransaction } from "./android-action-router.js";
import { upsertAndroidDeviceSightings } from "./database/android-device-store.js";

export function applyAndroidActionTransaction(
  db: DatabaseSync,
  action: AndroidSyncAction,
  enabledCapabilities: BusinessCapability[]
): ApplyAndroidActionResult {
  const actionId = String(action.id ?? "").trim();
  const actionType = String(action.action_type ?? "").trim();
  const deviceId = String(action.device_id ?? "").trim();

  if (
    !actionId
    || !actionType
    || !deviceId
    || !action.payload
    || typeof action.payload !== "object"
    || Array.isArray(action.payload)
  ) {
    return {
      ok: false,
      message: "Telefon işlemi eksik veya geçersiz."
    };
  }

  try {
    upsertAndroidDeviceSightings(db, [{
      device_id: deviceId,
      device_name: String(action.device_name ?? ""),
      app_version: String(action.app_version ?? ""),
      first_seen_at: action.created_at,
      last_seen_at: action.last_seen_at || new Date().toISOString()
    }]);
  } catch {
    return {
      ok: false,
      message: "Telefon kaydı masaüstünde hazırlanamadı."
    };
  }

  const commerceAction = ["commerce_order_confirm", "commerce_order_cancel"].includes(actionType);
  const marketFinancialAction = ["market_sale_complete", "customer_credit_payment_add"].includes(actionType);
  const kbsAction = isAndroidKbsAction(actionType);
  const protectedAction = commerceAction || marketFinancialAction || kbsAction;
  const intentHash = commerceAction ? commerceAndroidActionIntentHash(action) : marketFinancialAction ? marketAndroidActionIntentHash(action)
    : kbsAction ? androidKbsActionIntentHash(action) : "";
  if (protectedAction && !/^[A-Za-z0-9_-]{12,120}$/.test(actionId)) {
    return { ok: false, message: "İşlem kimliği geçersiz." };
  }
  const receiptResult = (receipt: Record<string, unknown>): ApplyAndroidActionResult => {
    if (protectedAction || isAndroidKbsAction(String(receipt.action_type)) || ["market_sale_complete", "customer_credit_payment_add"].includes(String(receipt.action_type))) {
      const authorization = authorizeAndroidAction(db, action, enabledCapabilities);
      if (!authorization.ok) return authorization;
      if (!intentHash || receipt.intent_hash !== intentHash || receipt.action_type !== actionType || receipt.device_id !== deviceId) {
        return { ok: false, message: kbsAction || isAndroidKbsAction(String(receipt.action_type)) ? "İşlem kimliği farklı bir KBS isteği için kullanılmış." : marketFinancialAction || !commerceAction
          ? "İşlem kimliği farklı bir satış veya tahsilat isteği için kullanılmış."
          : "İşlem kimliği farklı bir sipariş kararı için kullanılmış." };
      }
    }
    return { ok: true, message: "Telefon işlemi daha önce uygulanmış.", alreadyApplied: true };
  };

  const existingReceipt = db
    .prepare("SELECT action_type, device_id, intent_hash FROM android_action_receipts WHERE id = ?")
    .get(actionId);
  if (existingReceipt) {
    return receiptResult(existingReceipt);
  }

  const now = new Date().toISOString();
  let transactionStarted = false;

  try {
    db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;

    const concurrentReceipt = db
      .prepare("SELECT action_type, device_id, intent_hash FROM android_action_receipts WHERE id = ?")
      .get(actionId);
    if (concurrentReceipt) {
      db.exec("COMMIT");
      transactionStarted = false;
      return receiptResult(concurrentReceipt);
    }

    const result = routeAndroidActionInTransaction(
      db,
      action,
      now,
      enabledCapabilities
    );
    if (!result.ok) {
      db.exec("ROLLBACK");
      transactionStarted = false;
      return result;
    }

    db.prepare(
      "INSERT INTO android_action_receipts (id, action_type, device_id, applied_at, intent_hash) VALUES (?, ?, ?, ?, ?)"
    ).run(actionId, actionType, deviceId, now, intentHash);
    db.exec("COMMIT");
    transactionStarted = false;

    return {
      ok: true,
      message: result.message,
      alreadyApplied: false
    };
  } catch {
    if (transactionStarted) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the action failure result even if SQLite already ended it.
      }
    }
    return {
      ok: false,
      message:
        "Telefon işlemi yerel kayıtlara uygulanamadı. Masaüstünde kayıtları kontrol edip tekrar deneyin."
    };
  }
}
