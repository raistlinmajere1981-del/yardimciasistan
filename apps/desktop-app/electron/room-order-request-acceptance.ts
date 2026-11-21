import { timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getQrRoomOrderConfig, qrRoomOrderTokenHash } from "./database/qr-room-order-config.js";
import { getPublishedMenu } from "./database/menu-store.js";
import { addRoomFolioMenuItemInTransaction, getRoomFolioChargeState } from "./room-folio.js";
import { insertDatabaseEvent } from "./database/event-store.js";

type IncomingItem = { menu_entry_id: string; quantity: number; note: string; unit_price: number; currency: string; name: string };
function equalDigest(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Owner approval, never public/automatic. One transaction owns approval,
 * folio lines and inventory movements; repeat approvals are read-only. */
export function acceptQrRoomOrderRequest(db: DatabaseSync, requestId: string, inOwnerTransaction = false):
  { ok: true; message: string; folioId: string } | { ok: false; message: string } {
  if (!requestId?.trim()) return { ok: false, message: "Onaylanacak oda siparişi bulunamadı." };
  const begin = inOwnerTransaction ? "SAVEPOINT qr_room_accept" : "BEGIN IMMEDIATE";
  const commit = inOwnerTransaction ? "RELEASE qr_room_accept" : "COMMIT";
  const rollback = inOwnerTransaction
    ? "ROLLBACK TO qr_room_accept; RELEASE qr_room_accept" : "ROLLBACK";
  db.exec(begin);
  try {
    const request=db.prepare(
      "SELECT * FROM requests WHERE id=? AND deleted_at='' AND request_type='room_order'"
    ).get(requestId);
    if (!request) throw Error("Oda sipariş talebi bulunamadı.");
    if (request.status==="approved" && request.accepted_folio_id) {
      db.exec(commit);
      return { ok: true, message: "Bu sipariş daha önce oda hesabına işlendi.", folioId:String(request.accepted_folio_id) };
    }
    if (!["new","seen","waiting_owner"].includes(String(request.status)) || request.accepted_folio_id) {
      throw Error("Yalnızca bekleyen oda siparişleri onaylanabilir.");
    }
    const createdAt=Date.parse(String(request.created_at??""));
    if (!Number.isFinite(createdAt) || createdAt > Date.now()+60_000 || Date.now()-createdAt>2*60*60_000) {
      throw Error("Oda siparişinin süresi doldu. Misafirin güncel QR kodla yeniden sipariş vermesi gerekiyor.");
    }
    const roomId=String(request.room_id??"");
    const config=getQrRoomOrderConfig(db);
    if (!config.enabled || !config.secret) throw Error("Odaya QR sipariş servisi kapalı.");
    const stay=db.prepare(
      "SELECT s.id AS stay_id,f.id AS folio_id " +
      "FROM customer_room_stays s JOIN room_folios f ON f.stay_id=s.id AND f.room_id=s.room_id " +
      "JOIN rooms r ON r.id=s.room_id WHERE s.room_id=? AND s.status='checked_in' AND s.deleted_at='' " +
      "AND f.status='open' AND f.deleted_at='' AND r.is_active=1 AND r.deleted_at='' LIMIT 1"
    ).get(roomId);
    if (!stay) throw Error("Odanın aktif konaklaması ve açık oda hesabı yok.");
    if (!equalDigest(String(request.order_token_hash??""),qrRoomOrderTokenHash(config.secret,roomId,String(stay.stay_id)))) {
      throw Error("QR kodu mevcut konaklamaya ait değil. Eski oda koduyla sipariş onaylanamaz.");
    }
    const folioId=String(stay.folio_id);
    if (!getRoomFolioChargeState(db,folioId)?.canAddItems) throw Error("Oda hesabı yeni ürün kabul etmiyor.");

    let items:unknown;
    try { items=JSON.parse(String(request.order_items_json??"")); } catch { throw Error("Sipariş ürünleri okunamadı."); }
    if (!Array.isArray(items) || items.length<1 || items.length>20) throw Error("Sipariş ürünleri geçersiz.");
    const parsed=items as IncomingItem[];
    const menu=getPublishedMenu(db);
    let totalQuantity=0;
    let currency="";
    for (const item of parsed) {
      if (!item || typeof item.menu_entry_id!=="string" || !Number.isSafeInteger(item.quantity) ||
        item.quantity<1 || item.quantity>20 || typeof item.note!=="string" || item.note.length>300 ||
        !Number.isFinite(item.unit_price) || item.unit_price<0 || !/^[A-Z]{3}$/.test(item.currency)) {
        throw Error("Siparişte geçersiz ürün, miktar veya not var.");
      }
      totalQuantity+=item.quantity;
      if (totalQuantity>60) throw Error("Sipariş adedi sınırı aşıldı.");
      const product=menu.items.find(candidate=>candidate.id===item.menu_entry_id && candidate.is_available
        && menu.categories.some(category=>category.id===candidate.category_id && category.is_active));
      if (!product) throw Error("Sipariş ürünü artık menüde bulunmuyor.");
      if (Math.abs(Number(product.price)-item.unit_price)>0.001 || product.currency!==item.currency) {
        throw Error(String(product.name)+" fiyatı değişmiş; misafirin yeni sipariş göndermesi gerekiyor.");
      }
      if (currency && currency!==item.currency) throw Error("Farklı para birimleri birleştirilemez.");
      currency=item.currency;
      if (product.hide_when_out_of_stock && product.stock_quantity!==null
          && Number(product.stock_quantity)<Number(product.stock_consumption_quantity)*item.quantity) {
        throw Error(String(product.name)+" için yeterli stok yok.");
      }
    }
    const now=new Date().toISOString();
    parsed.forEach((item,index)=>{
      // Stable row identity is bound to the request; a failed transaction rolls
      // back all earlier lines and movements, never a half-approved folio.
      const itemId="room_folio_qr_"+requestId+"_"+index;
      const added=addRoomFolioMenuItemInTransaction(db,
        {folioId,menuEntryId:item.menu_entry_id,quantity:item.quantity},
        {itemId,now,actorSource:"qr_room_order"});
      if (!added.ok) throw Error(added.message);
      if (item.note) db.prepare("UPDATE room_folio_items SET note=? WHERE id=? AND folio_id=?")
        .run(item.note,itemId,folioId);
    });
    const changed=db.prepare(
      "UPDATE requests SET status='approved',accepted_folio_id=?,updated_at=?,sync_status='local_only' " +
      "WHERE id=? AND status IN ('new','seen','waiting_owner') AND accepted_folio_id=''"
    ).run(folioId,now,requestId);
    if(changed.changes!==1) throw Error("Sipariş talebi bu sırada değişmiş.");
    insertDatabaseEvent(db,{type:"request.status_changed",entityType:"request",entityId:requestId,
      payload:{previous_status:request.status,status:"approved",folio_id:folioId,room_id:roomId},now});
    db.exec(commit);
    return {ok:true,message:"Oda siparişi onaylandı ve açık oda hesabına işlendi.",folioId};
  }catch(error){
    db.exec(rollback);
    return {ok:false,message:error instanceof Error?error.message:"Oda siparişi onaylanamadı."};
  }
}
