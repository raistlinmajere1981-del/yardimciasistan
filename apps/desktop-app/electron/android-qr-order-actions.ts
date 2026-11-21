import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { getAndroidVersionConflict, androidPayloadString, nextMutationTimestamp, type AndroidActionMutationResult } from "./database/android-utils.js";
import { updateRequestStatus } from "./database/request-store.js";
import { acceptQrTableOrderRequest } from "./table-order-request-acceptance.js";
import { acceptQrRoomOrderRequest } from "./room-order-request-acceptance.js";

const qrTypes = new Set(["qr_table_order_accept", "qr_room_order_accept", "qr_order_reject"]);
export function isAndroidQrOrderAction(type: string): boolean { return qrTypes.has(type); }

/** A fixed, canonical intent fingerprint: a lost ACK can be retried only for
 * this same device, request, version and decision, never a different order. */
export function androidQrOrderIntentHash(action: AndroidSyncAction): string {
  return createHash("sha256").update(JSON.stringify([
    action.action_type,
    action.device_id,
    action.payload.request_id,
    action.payload.expected_updated_at
  ])).digest("hex");
}

/** Executed only inside the single BEGIN IMMEDIATE/receipt owner of the
 * Android action processor. Accept routes retain all their canonical checks. */
export function applyAndroidQrOrderAction(
  db: DatabaseSync, action: AndroidSyncAction, now: string
): AndroidActionMutationResult {
  const type = action.action_type;
  if (!isAndroidQrOrderAction(type)) return {ok:false,message:"QR işlem türü geçersiz."};
  if (Object.keys(action.payload).some(key => key !== "request_id" && key !== "expected_updated_at"))
    return {ok:false,message:"QR sipariş işlemi desteklenmeyen alan içeriyor."};
  const id = androidPayloadString(action.payload,"request_id");
  const version = androidPayloadString(action.payload,"expected_updated_at");
  if (!id || !version || id.length > 160 || version.length > 80)
    return {ok:false,message:"Güncel QR sipariş kaydı ve sürümü gerekli."};
  const row = db.prepare(
    "SELECT request_type,status,updated_at,accepted_order_id,accepted_folio_id FROM requests WHERE id=? AND deleted_at=''"
  ).get(id) as {request_type?:string,status?:string,updated_at?:string,
    accepted_order_id?:string,accepted_folio_id?:string}|undefined;
  if (!row || !["table_order","room_order"].includes(row.request_type ?? ""))
    return {ok:false,message:"QR sipariş talebi bulunamadı."};
  if (type === "qr_room_order_accept" && row.request_type !== "room_order"
    || type === "qr_table_order_accept" && row.request_type !== "table_order")
    return {ok:false,message:"QR sipariş türü eşleşmiyor."};

  const conflict = getAndroidVersionConflict(action.payload,"expected_updated_at",row.updated_at,"QR sipariş");
  if (conflict) return conflict;
  if (!["new","seen","waiting_owner"].includes(row.status ?? "")
    || row.accepted_order_id || row.accepted_folio_id)
    return {ok:false,message:"Yalnızca bekleyen ve henüz aktarılmamış QR siparişleri işlenebilir."};

  if (type === "qr_order_reject") {
    const result = updateRequestStatus(db, {requestId:id,status:"rejected"},{
      now:nextMutationTimestamp(row.updated_at,now),
      androidAction:action,
      markPreparedMessagesSent:false
    });
    return result.ok ? {ok:true,message:"QR siparişi reddedildi. Hesaba/adisyona aktarılmadı."} : result;
  }

  const result = type === "qr_table_order_accept"
    ? acceptQrTableOrderRequest(db,id,true)
    : acceptQrRoomOrderRequest(db,id,true);
  return result.ok ? {ok:true,message:result.message} : result;
}
