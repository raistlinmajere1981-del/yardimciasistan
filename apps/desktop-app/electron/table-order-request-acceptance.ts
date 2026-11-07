import type { DatabaseSync } from "node:sqlite";
import { openTableOrder, addTableOrderItem } from "./table-order-service.js";
import { getActiveTableOrder } from "./database/table-order-store.js";
import { getPublishedMenu } from "./database/menu-store.js";
import { insertDatabaseEvent } from "./database/event-store.js";

type IncomingItem = {
  menu_entry_id: string; quantity: number; note: string;
  unit_price: number; currency: string; name: string;
};

export function acceptQrTableOrderRequest(db: DatabaseSync, requestId: string): { ok: true; message: string; orderId: string } | { ok: false; message: string } {
  if (!requestId.trim()) return { ok: false, message: "Onaylanacak sipariş talebi seçilmedi." };
  db.exec("BEGIN IMMEDIATE");
  try {
    const request = db.prepare(
      "SELECT id, request_type, status, table_id, order_items_json, accepted_order_id, created_at FROM requests WHERE id = ? AND deleted_at = ''"
    ).get(requestId) as Record<string, unknown> | undefined;
    if (!request || request.request_type !== "table_order") throw new Error("Masadan sipariş talebi bulunamadı.");
    if (request.status === "approved" && request.accepted_order_id) {
      db.exec("COMMIT");
      return { ok: true, message: "Sipariş daha önce adisyona aktarıldı.", orderId: String(request.accepted_order_id) };
    }
    if (!["new", "seen", "waiting_owner"].includes(String(request.status))) {
      throw new Error("Yalnızca bekleyen sipariş talepleri onaylanabilir.");
    }
    const tableId = String(request.table_id ?? "");
    const table = db.prepare("SELECT id FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''")
      .get(tableId);
    if (!table) throw new Error("Talebin masası artık aktif değil.");
    const createdAt = Date.parse(String(request.created_at ?? ""));
    if (!Number.isFinite(createdAt) || createdAt > Date.now() + 60_000 || Date.now() - createdAt > 2 * 60 * 60_000) {
      throw new Error("Sipariş talebinin süresi dolmuş. Müşteriden yeniden göndermesini isteyin.");
    }
    const lastClosed = db.prepare(
      "SELECT MAX(closed_at) AS closed_at FROM table_orders WHERE table_id = ? AND closed_at != ''"
    ).get(tableId) as { closed_at?: string } | undefined;
    if (lastClosed?.closed_at && Date.parse(lastClosed.closed_at) > createdAt) {
      throw new Error("Sipariş talebinin ait olduğu masa oturumu kapanmış. Eski sipariş yeni adisyona eklenemez.");
    }
    const existing = getActiveTableOrder(db, tableId);
    if (existing?.status === "payment") throw new Error("Masa ödeme aşamasında. Önce adisyonu sonuçlandırın.");

    let items: IncomingItem[];
    try { items = JSON.parse(String(request.order_items_json)) as IncomingItem[]; }
    catch { throw new Error("Sipariş ürün verisi geçersiz."); }
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new Error("Sipariş ürünleri geçersiz.");
    const menu = getPublishedMenu(db);
    for (const item of items) {
      if (!item || typeof item.menu_entry_id !== "string" || !Number.isSafeInteger(item.quantity)
          || item.quantity < 1 || item.quantity > 20 || typeof item.note !== "string" || item.note.length > 500) {
        throw new Error("Siparişte geçersiz ürün veya adet var.");
      }
      const product = menu.items.find(candidate => candidate.id === item.menu_entry_id && candidate.is_available
        && menu.categories.some(category => category.id === candidate.category_id && category.is_active));
      if (!product) throw new Error("Ürün artık menüde mevcut değil. Siparişi kontrol edin.");
      if (Math.abs(Number(product.price) - Number(item.unit_price)) > 0.001 || product.currency !== item.currency) {
        throw new Error(product.name + " ürününün fiyatı değişmiş. Müşteri talebini yeniden değerlendirin.");
      }
      if (product.hide_when_out_of_stock && product.stock_quantity !== null
          && product.stock_quantity < product.stock_consumption_quantity * item.quantity) {
        throw new Error(product.name + " için yeterli stok bulunmuyor.");
      }
    }
    const opened = openTableOrder(db, tableId);
    if (!opened.ok) throw new Error(opened.message);
    for (const item of items) {
      const added = addTableOrderItem(db, {
        orderId: opened.order.id, menuEntryId: item.menu_entry_id, quantity: item.quantity, note: item.note
      });
      if (!added.ok) throw new Error(added.message);
    }
    const now = new Date().toISOString();
    const updated = db.prepare(
      "UPDATE requests SET status = 'approved', accepted_order_id = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND status IN ('new', 'seen', 'waiting_owner') AND accepted_order_id = ''"
    ).run(opened.order.id, now, requestId);
    if (Number(updated.changes) !== 1) throw new Error("Sipariş onayı sırasında kayıt değişti.");
    insertDatabaseEvent(db, {
      type: "request.status_changed", entityType: "request", entityId: requestId,
      payload: { previous_status: request.status, status: "approved", order_id: opened.order.id }, now
    });
    db.exec("COMMIT");
    return { ok: true, message: "Masa siparişi mevcut adisyona aktarıldı.", orderId: opened.order.id };
  } catch (error) {
    db.exec("ROLLBACK");
    return { ok: false, message: error instanceof Error ? error.message : "Sipariş onaylanamadı." };
  }
}
