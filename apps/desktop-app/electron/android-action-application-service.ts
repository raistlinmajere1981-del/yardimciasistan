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

  const existingReceipt = db
    .prepare("SELECT id FROM android_action_receipts WHERE id = ?")
    .get(actionId);
  if (existingReceipt) {
    return {
      ok: true,
      message: "Telefon işlemi daha önce uygulanmış.",
      alreadyApplied: true
    };
  }

  const now = new Date().toISOString();
  let transactionStarted = false;

  try {
    db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;

    const concurrentReceipt = db
      .prepare("SELECT id FROM android_action_receipts WHERE id = ?")
      .get(actionId);
    if (concurrentReceipt) {
      db.exec("COMMIT");
      transactionStarted = false;
      return {
        ok: true,
        message: "Telefon işlemi daha önce uygulanmış.",
        alreadyApplied: true
      };
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
      "INSERT INTO android_action_receipts (id, action_type, device_id, applied_at) VALUES (?, ?, ?, ?)"
    ).run(actionId, actionType, deviceId, now);
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
