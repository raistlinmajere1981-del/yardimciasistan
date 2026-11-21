import { createHash, createHmac, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { queueSyncJob } from "./sync-runtime-store.js";

/** QR is scoped to ONE checked-in stay, not the physical room. The next guest
 * receives a different bearer; publishing exposes only a digest. */
export function qrRoomOrderToken(secret: string, roomId: string, stayId: string): string {
  return createHmac("sha256", secret).update("yardimci:room-order:v1:" + roomId + ":" + stayId)
    .digest("base64url").slice(0, 24);
}
export function qrRoomOrderTokenHash(secret: string, roomId: string, stayId: string): string {
  return createHash("sha256").update(qrRoomOrderToken(secret, roomId, stayId)).digest("hex");
}
export function getQrRoomOrderConfig(db: DatabaseSync): { enabled: boolean; secret: string } {
  const row=db.prepare(
    "SELECT qr_room_orders_enabled,qr_room_order_secret,publish_qr_menu_web,publish_rooms_web " +
    "FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1"
  ).get();
  return {enabled:Number(row?.qr_room_orders_enabled)===1 && Number(row?.publish_qr_menu_web)===1
    && Number(row?.publish_rooms_web)===1,secret:String(row?.qr_room_order_secret??"")};
}
export function setQrRoomOrdersEnabled(db:DatabaseSync,enabled:boolean):void {
  const now=new Date().toISOString();
  db.exec("SAVEPOINT qr_room_orders_config");
  try {
    const current=getQrRoomOrderConfig(db);
    const secret=current.secret || (enabled ? randomBytes(32).toString("hex") : "");
    const changed=db.prepare(
      "UPDATE business SET qr_room_orders_enabled=?,qr_room_order_secret=?,updated_at=?,sync_status='local_only' WHERE deleted_at=''"
    ).run(enabled?1:0,secret,now);
    if(!changed.changes)throw Error("Odaya sipariş ayarı kaydedilemedi.");
    queueSyncJob(db,"menu_publish",now);
    queueSyncJob(db,"room_catalog_publish",now);
    db.exec("RELEASE qr_room_orders_config");
  }catch(error){
    db.exec("ROLLBACK TO qr_room_orders_config; RELEASE qr_room_orders_config");
    throw error;
  }
}
export function queueRoomOrderPublicationIfEnabled(db:DatabaseSync,now:string):void {
  if(!getQrRoomOrderConfig(db).enabled)return;
  queueSyncJob(db,"room_catalog_publish",now);
}
export function listQrOrderRooms(db:DatabaseSync):Array<{id:string;name:string;number:string;token:string}>{
  const config=getQrRoomOrderConfig(db);
  if(!config.enabled || !config.secret)return [];
  return (db.prepare(
    "SELECT r.id,r.name,r.number,s.id AS stay_id FROM rooms r " +
    "JOIN customer_room_stays s ON s.room_id=r.id AND s.deleted_at='' AND s.status='checked_in' " +
    "JOIN room_folios f ON f.stay_id=s.id AND f.room_id=r.id AND f.deleted_at='' AND f.status='open' " +
    "WHERE r.deleted_at='' AND r.is_active=1 ORDER BY r.sort_order,r.number,r.name"
  ).all() as Array<{id:string;name:string;number:string;stay_id:string}>)
    .map(r=>({id:r.id,name:r.name,number:r.number,token:qrRoomOrderToken(config.secret,r.id,r.stay_id)}));
}
