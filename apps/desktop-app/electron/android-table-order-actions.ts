import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { openTableOrder, addTableOrderItem, updateTableOrderItemQuantity, removeTableOrderItem, updateTableOrderStatus, closeTableOrder } from "./table-order-service.js";
import { getMutableTableOrderItem, isActiveTableOrder, resolveAndroidActiveOrderId } from "./database/table-order-store.js";
import { normalizeStatus } from "./database/request-utils.js";
import { normalizeOrderQuantity } from "./database/stock-utils.js";
import { androidPayloadNumber, androidPayloadString, createAndroidEntityId, getAndroidVersionConflict, nextMutationTimestamp, type AndroidActionMutationResult } from "./database/android-utils.js";

export function applyAndroidTableOrderOpen(db: DatabaseSync, action: AndroidSyncAction, now: string): AndroidActionMutationResult {
  const tableId = androidPayloadString(action.payload, "table_id");
  if (!tableId) return { ok: false, message: "Sipariş açılacak masa seçilmemiş." };
  const table = db.prepare("SELECT id, updated_at FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''").get(tableId) as { id: string; updated_at: string } | undefined;
  if (!table) return { ok: false, message: "Sipariş açılacak masa bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_table_updated_at", table.updated_at, "Masa");
  if (conflict) return conflict;
  const id = createAndroidEntityId("table_order_", action.id);
  const result = openTableOrder(db, tableId, { now, androidAction: action, newOrderId: id });
  return result.ok ? { ok: true, message: result.order?.id !== id ? "Masada zaten açık bir adisyon var." : "Masa adisyonu telefondan açıldı." } : result;
}

export function applyAndroidTableOrderAddItem(db: DatabaseSync, action: AndroidSyncAction, now: string): AndroidActionMutationResult {
  const explicitOrderId = androidPayloadString(action.payload, "order_id");
  const dependencyActionId = androidPayloadString(action.payload, "depends_on_action_id");
  let orderId = "";
  if (explicitOrderId) orderId = resolveAndroidActiveOrderId(db, action.payload);
  else if (dependencyActionId) {
    const receipt = db.prepare("SELECT action_type FROM android_action_receipts WHERE id = ?").get(dependencyActionId) as { action_type?: string } | undefined;
    const dependentOrderId = createAndroidEntityId("table_order_", dependencyActionId);
    if (receipt?.action_type !== "table_order_open" || !isActiveTableOrder(db, dependentOrderId)) {
      return { ok: false, message: "Ürün eklenemedi çünkü bağlı adisyon açma işlemi uygulanmadı." };
    }
    orderId = dependentOrderId;
  } else return { ok: false, message: "Ürün eklemek için açık adisyon veya uygulanmış adisyon açma işlemi gerekli." };
  const menuItemId = androidPayloadString(action.payload, "menu_entry_id");
  const quantity = normalizeOrderQuantity(androidPayloadNumber(action.payload, "quantity", 1));
  if (!orderId || !menuItemId || !quantity) return { ok: false, message: "Ürün, adisyon veya adet bilgisi geçersiz." };
  const order = db.prepare("SELECT table_id, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')").get(orderId) as { table_id: string; updated_at: string } | undefined;
  if (!order) return { ok: false, message: "Ürün eklenecek aktif adisyon bulunamadı." };
  const tableId = androidPayloadString(action.payload, "table_id");
  if (tableId && tableId !== order.table_id) return { ok: false, message: "Ürün ile adisyonun masa bilgisi eşleşmiyor." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_order_updated_at", order.updated_at, "Adisyon");
  if (conflict) return conflict;
  const result = addTableOrderItem(db, { orderId, menuEntryId: menuItemId, quantity, note: "" }, {
    now: nextMutationTimestamp(order.updated_at, now), androidAction: action, newItemId: createAndroidEntityId("table_order_item_", action.id)
  });
  return result.ok ? { ok: true, message: "Ürün telefondan adisyona eklendi." } : result;
}

export function applyAndroidTableOrderItemQuantity(db: DatabaseSync, action: AndroidSyncAction, now: string): AndroidActionMutationResult {
  const itemId = androidPayloadString(action.payload, "item_id");
  const quantity = normalizeOrderQuantity(androidPayloadNumber(action.payload, "quantity", 0));
  if (!itemId || !quantity) return { ok: false, message: "Sipariş satırı veya adet bilgisi geçersiz." };
  const item = getMutableTableOrderItem(db, itemId);
  if (!item) return { ok: false, message: "Güncellenecek aktif sipariş satırı bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_item_updated_at", item.updated_at, "Sipariş satırı");
  if (conflict) return conflict;
  const result = updateTableOrderItemQuantity(db, { itemId, quantity }, { now, androidAction: action });
  return result.ok ? { ok: true, message: "Ürün adedi telefondan güncellendi." } : result;
}

export function applyAndroidTableOrderRemoveItem(db: DatabaseSync, action: AndroidSyncAction, now: string): AndroidActionMutationResult {
  const itemId = androidPayloadString(action.payload, "item_id");
  const item = getMutableTableOrderItem(db, itemId);
  if (!item) return { ok: false, message: "Silinecek aktif sipariş satırı bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_item_updated_at", item.updated_at, "Sipariş satırı");
  if (conflict) return conflict;
  const result = removeTableOrderItem(db, itemId, { now, androidAction: action });
  return result.ok ? { ok: true, message: "Ürün telefondan adisyondan kaldırıldı." } : result;
}

export function applyAndroidTableOrderStatus(db: DatabaseSync, action: AndroidSyncAction, now: string,
  forcedStatus?: "preparing" | "served" | "payment"): AndroidActionMutationResult {
  const orderId = resolveAndroidActiveOrderId(db, action.payload);
  const status = forcedStatus ?? normalizeStatus(androidPayloadString(action.payload, "status"), ["open", "preparing", "served", "payment"]);
  if (!orderId || !status) return { ok: false, message: "Adisyon veya yeni durum bilgisi geçersiz." };
  const current = db.prepare("SELECT updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')").get(orderId) as { updated_at: string } | undefined;
  if (!current) return { ok: false, message: "Güncellenecek aktif adisyon bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_updated_at", current.updated_at, "Adisyon");
  if (conflict) return conflict;
  const result = updateTableOrderStatus(db, { orderId, status }, {
    now: nextMutationTimestamp(current.updated_at, now), androidAction: action
  });
  return result.ok ? { ok: true, message: "Adisyon durumu telefondan güncellendi." } : result;
}

export function applyAndroidTableOrderClose(db: DatabaseSync, action: AndroidSyncAction, now: string,
  forcedStatus?: "paid" | "cancelled"): AndroidActionMutationResult {
  const orderId = resolveAndroidActiveOrderId(db, action.payload);
  const status = forcedStatus ?? normalizeStatus(androidPayloadString(action.payload, "status"), ["paid", "cancelled"]);
  if (!orderId || !status) return { ok: false, message: "Kapatılacak adisyon veya kapanış durumu geçersiz." };
  const current = db.prepare("SELECT updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')").get(orderId) as { updated_at: string } | undefined;
  if (!current) return { ok: false, message: "Kapatılacak aktif adisyon bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_updated_at", current.updated_at, "Adisyon");
  if (conflict) return conflict;
  const result = closeTableOrder(db, { orderId, status }, {
    now: nextMutationTimestamp(current.updated_at, now), androidAction: action
  });
  return result.ok ? { ok: true, message: status === "paid" ? "Adisyon telefondan ödendi olarak kapatıldı." : "Adisyon telefondan iptal edildi." } : result;
}
