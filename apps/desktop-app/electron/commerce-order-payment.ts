import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type CommerceOrderPaymentCommand, type CommerceWebOrderStatus } from "@yardimci-asistan/shared";
import { getCommerceOrderDetailInTransaction } from "./commerce-order-store";
import { readEnabledBusinessCapabilities } from "./business-capability-store";

export interface OrderPaymentActor { id: string; role: string; assertAuthorized(): void }

/** Operator records a verified external bank movement; this never runs a card charge. */
export function manageOrderPayment(databasePath: string, command: CommerceOrderPaymentCommand, actor: OrderPaymentActor) {
  actor.assertAuthorized();
  if (actor.role !== "desktop_owner" || !actor.id) throw new Error("Sipariş ödeme onayı için yetkili işletme kullanıcısı gerekli.");
  if (!command || !["approve","reject","refund","prepare"].includes(command.action)
    || typeof command.operationKey !== "string" || !/^[A-Za-z0-9:_-]{16,180}$/.test(command.operationKey)
    || typeof command.reason !== "string" || command.reason.length > 500 || /[\u0000-\u001f\u007f]/.test(command.reason)
    || (["reject","refund"].includes(command.action) && !command.reason.trim())) throw new Error("Sipariş ödeme işlemi geçersiz.");
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
  try {
    actor.assertAuthorized();
    const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get()?.id ?? "");
    const capabilities = readEnabledBusinessCapabilities(db);
    if (!hasBusinessCapability(capabilities, BUSINESS_CAPABILITIES.ORDERS) || !hasBusinessCapability(capabilities, BUSINESS_CAPABILITIES.ONLINE_SALES)) throw new Error("Sipariş ödeme yönetimi bu işletmede etkin değil.");
    const order = getCommerceOrderDetailInTransaction(db,businessId,command.orderId);
    if (!order?.order.checkoutSnapshot) throw new Error("Sipariş ödeme kaydı bulunamadı.");
    const fingerprint = JSON.stringify([command.orderId,command.action,command.reason.trim(),command.expectedUpdatedAt,actor.id]);
    const previous = db.prepare("SELECT request_json FROM commerce_order_events WHERE id = ? AND business_id = ?").get(command.operationKey,businessId);
    if (previous) {
      if (previous.request_json !== fingerprint) throw new Error("Sipariş ödeme işlem kimliği başka bir istek için kullanıldı.");
      db.exec("COMMIT"); return order;
    }
    const current=order.order;
    if (current.updatedAt !== command.expectedUpdatedAt) throw new Error("Sipariş ödeme kaydı değişti. Siparişi yeniden açın.");
    const status=current.paymentStatus;
    if (command.action === "approve" && (!["unpaid","verification_pending","rejected"].includes(status || "") || current.status === "cancelled")) throw new Error("Sipariş ödeme onayı bu durumda uygulanamaz.");
    if (command.action === "reject" && !["unpaid","verification_pending"].includes(status || "")) throw new Error("Sipariş ödeme reddi bu durumda uygulanamaz.");
    if (command.action === "refund" && (status !== "paid" || current.status !== "cancelled")) throw new Error("Sipariş ödeme iadesi için ödenmiş sipariş önce iptal edilmeli.");
    if (command.action === "prepare" && (status !== "paid" || current.status !== "confirmed" || current.deliveryStatus !== "unfulfilled")) throw new Error("Sipariş ödeme ve sipariş onayı hazırlık için gerekli.");
    const now=new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1)).toISOString();
    const payment=command.action === "approve" ? "paid" : command.action === "reject" ? "rejected" : command.action === "refund" ? "refunded" : status!;
    const delivery=command.action === "prepare" ? "preparing" : current.deliveryStatus!;
    db.prepare("UPDATE commerce_orders SET payment_status=?,delivery_status=?,updated_at=? WHERE id=? AND business_id=?").run(payment,delivery,now,current.id,businessId);
    db.prepare("INSERT INTO commerce_order_events(id,business_id,order_id,type,actor_id,reason,request_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(command.operationKey,businessId,current.id,`payment_${command.action}`,actor.id,command.reason.trim(),fingerprint,now);
    const result=getCommerceOrderDetailInTransaction(db,businessId,current.id)!;
    db.exec("COMMIT"); return result;
  } catch(error) {db.exec("ROLLBACK");throw error;}
  finally {db.close();}
}

/** Same durable hosting inbox/cursor as order intake. Replays never downgrade paid/refunded. */
export function importOrderPaymentNotice(databasePath: string, eventId: string, sourceReference: string, createdAt: string): void {
  const db=new DatabaseSync(databasePath);db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
  try {
    const row=db.prepare("SELECT id,business_id,payment_status FROM commerce_orders WHERE source_reference=? AND source IN ('web-online-sales','web-dealer') AND business_id=(SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1) AND deleted_at=''").get(sourceReference);
    if(!row) {
      const rejected=db.prepare("SELECT 1 FROM commerce_dealer_order_rejections r JOIN customer_web_access a ON a.id=r.dealer_access_id WHERE r.web_order_id=? AND a.business_id=(SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1)").get(sourceReference);
      if(rejected){db.exec("COMMIT");return;} // Terminal rejected intent remains on Hosting; never invent a payment/order.
      throw new Error("Sipariş ödeme bildirimi için sipariş henüz alınmadı.");
    }
    const previous=db.prepare("SELECT order_id FROM commerce_order_events WHERE id=?").get(eventId);
    if(previous && previous.order_id!==row.id)throw new Error("Sipariş ödeme olayı çakışıyor.");
    if(!previous){
      db.prepare("INSERT INTO commerce_order_events(id,business_id,order_id,type,actor_id,reason,request_json,created_at) VALUES (?,?,?,'payment_reported','customer','','',?)").run(eventId,String(row.business_id),String(row.id),createdAt);
      db.prepare("UPDATE commerce_orders SET payment_status=CASE WHEN payment_status IN ('unpaid','rejected') AND status <> 'cancelled' THEN 'verification_pending' ELSE payment_status END,updated_at=? WHERE id=?").run(new Date().toISOString(),String(row.id));
    }
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}finally{db.close();}
}

/** Private existing dealer_access publication also transports guest order state.
 * Public reads must first prove ownership against the retained hosting intake.
 */
export function createWebOrderStatuses(db: DatabaseSync): CommerceWebOrderStatus[] {
  return db.prepare("SELECT * FROM commerce_orders WHERE business_id=(SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1) AND source IN ('web-online-sales','web-dealer') AND checkout_snapshot_json <> 'null' AND deleted_at='' ORDER BY placed_at,id").all().map(row=>({
    order_id:String(row.source_reference),order_number:String(row.order_number),status:String(row.status),
    payment_status:String(row.payment_status) as CommerceWebOrderStatus["payment_status"],delivery_status:String(row.delivery_status) as CommerceWebOrderStatus["delivery_status"],updated_at:String(row.updated_at),
    events:db.prepare("SELECT id,type,created_at FROM commerce_order_events WHERE order_id=? ORDER BY created_at,id").all(String(row.id)).map(event=>({id:String(event.id),type:String(event.type),created_at:String(event.created_at)}))
  }));
}
