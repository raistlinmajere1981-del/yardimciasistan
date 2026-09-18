import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import type { AndroidActionMutationResult } from "./android-utils.js";
import { insertDatabaseEvent } from "./event-store.js";

export type DeletionAndroidEventSink = (
  action: AndroidSyncAction,
  type: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
  now: string
) => void;

export function runDesktopDeletion(
  db: DatabaseSync,
  operation: () => AndroidActionMutationResult,
  successMessage: string
): { ok: true; message: string } | { ok: false; message: string } {
  let transactionStarted = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    const result = operation();
    if (!result.ok) {
      db.exec("ROLLBACK");
      transactionStarted = false;
      return result;
    }
    db.exec("COMMIT");
    transactionStarted = false;
    return {
      ok: true,
      message: result.message || successMessage
    };
  } catch {
    if (transactionStarted) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // SQLite işlemi zaten sonlandıysa kullanıcı dostu hata sonucunu koru.
      }
    }
    return { ok: false, message: "Kayıt silinemedi. Yerel kayıtları kontrol edip tekrar deneyin." };
  }
}

export function insertDeletionEvent(
  db: DatabaseSync,
  androidAction: AndroidSyncAction | undefined,
  insertAndroidEvent: DeletionAndroidEventSink | undefined,
  type: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
  now: string
) {
  if (androidAction) {
    insertAndroidEvent?.(androidAction, type, entityType, entityId, payload, now);
    return;
  }
  insertDatabaseEvent(db, { type, entityType, entityId, payload, now });
}
