import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { insertAndroidActionEvent } from "./android-action-service.js";
import { updateTableStatusForOrder } from "./table-order-service.js";
import {
  getMutableTableOrderItem,
  isActiveTableOrder,
  recalculateTableOrderTotalInTransaction,
  resolveAndroidActiveOrderId,
  restoreCancelledOrderStockInTransaction
} from "./database/table-order-store.js";
import { mutateMenuStockInTransaction as mutateStoredMenuStock } from "./database/menu-stock-store.js";
import { normalizeStatus } from "./database/request-utils.js";
import {
  normalizeOrderQuantity,
  normalizeTableOrderCurrency,
  roundMoney
} from "./database/stock-utils.js";
import type { AndroidActionMutationResult } from "./database/android-utils.js";
import { isInventoryTrackingEnabled } from "./inventory-tracking.js";
import {
  androidPayloadNumber,
  androidPayloadString,
  createAndroidEntityId,
  getAndroidVersionConflict,
  nextMutationTimestamp
} from "./database/android-utils.js";

export function applyAndroidTableOrderOpen(
  db: DatabaseSync,
  action: AndroidSyncAction,
  now: string
): AndroidActionMutationResult {
  const tableId = androidPayloadString(action.payload, "table_id");
  if (!tableId) {
    return { ok: false, message: "Sipariş açılacak masa seçilmemiş." };
  }
  const table = db
    .prepare("SELECT id, updated_at FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''")
    .get(tableId) as { id?: string; updated_at?: string } | undefined;
  if (!table) {
    return { ok: false, message: "Sipariş açılacak masa bulunamadı." };
  }
  const versionConflict = getAndroidVersionConflict(action.payload, "expected_table_updated_at", table.updated_at, "Masa");
  if (versionConflict) {
    return versionConflict;
  }
  const activeOrder = db
    .prepare("SELECT id, status FROM table_orders WHERE table_id = ? AND status IN ('open', 'preparing', 'served', 'payment') LIMIT 1")
    .get(tableId) as { id?: string; status?: string } | undefined;
  if (activeOrder?.id) {
    updateTableStatusForOrder(db, tableId, activeOrder.status === "payment" ? "bill_waiting" : "occupied", activeOrder.id, now, action);
    return { ok: true, message: "Masada zaten açık bir adisyon var." };
  }

  const orderId = createAndroidEntityId("table_order_", action.id);
  db
    .prepare(`
        INSERT INTO table_orders (
          id, table_id, status, opened_at, closed_at, subtotal, discount_total, total, note, created_at, updated_at
        ) VALUES (?, ?, 'open', ?, '', 0, 0, 0, '', ?, ?)
      `)
    .run(orderId, tableId, now, now, now);
  updateTableStatusForOrder(db, tableId, "occupied", orderId, now, action);
  insertAndroidActionEvent(db, action, "table_order.opened", "table_order", orderId, { table_id: tableId }, now);
  return { ok: true, message: "Masa adisyonu telefondan açıldı." };
}

export function applyAndroidTableOrderAddItem(
  db: DatabaseSync,
  action: AndroidSyncAction,
  now: string
): AndroidActionMutationResult {
  const explicitOrderId = androidPayloadString(action.payload, "order_id");
  const dependencyActionId = androidPayloadString(action.payload, "depends_on_action_id");
  let orderId = "";
  if (explicitOrderId) {
    orderId = resolveAndroidActiveOrderId(db, action.payload);
  } else if (dependencyActionId) {
    const dependencyReceipt = db
      .prepare("SELECT action_type FROM android_action_receipts WHERE id = ?")
      .get(dependencyActionId) as { action_type?: string } | undefined;
    const dependentOrderId = createAndroidEntityId("table_order_", dependencyActionId);
    if (dependencyReceipt?.action_type !== "table_order_open" || !isActiveTableOrder(db, dependentOrderId)) {
      return { ok: false, message: "Ürün eklenemedi çünkü bağlı adisyon açma işlemi uygulanmadı." };
    }
    orderId = dependentOrderId;
  } else {
    return { ok: false, message: "Ürün eklemek için açık adisyon veya uygulanmış adisyon açma işlemi gerekli." };
  }
  const menuItemId = androidPayloadString(action.payload, "menu_item_id");
  const quantity = normalizeOrderQuantity(androidPayloadNumber(action.payload, "quantity", 1));
  if (!orderId || !menuItemId || !quantity) {
    return { ok: false, message: "Ürün, adisyon veya adet bilgisi geçersiz." };
  }
  const order = db
    .prepare("SELECT table_id, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
    .get(orderId) as { table_id?: string; updated_at?: string } | undefined;
  if (!order) {
    return { ok: false, message: "Ürün eklenecek aktif adisyon bulunamadı." };
  }
  const payloadTableId = androidPayloadString(action.payload, "table_id");
  if (payloadTableId && payloadTableId !== String(order.table_id ?? "")) {
    return { ok: false, message: "Ürün ile adisyonun masa bilgisi eşleşmiyor." };
  }
  const versionConflict = getAndroidVersionConflict(action.payload, "expected_order_updated_at", order.updated_at, "Adisyon");
  if (versionConflict) {
    return versionConflict;
  }
  const menuItem = db
    .prepare(`
        SELECT menu_items.id, menu_items.name, menu_items.price, menu_items.currency
        FROM menu_items
        INNER JOIN menu_categories ON menu_categories.id = menu_items.category_id
        WHERE menu_items.id = ?
          AND menu_items.is_available = 1
          AND menu_items.deleted_at = ''
          AND menu_categories.is_active = 1
          AND menu_categories.deleted_at = ''
        LIMIT 1
      `)
    .get(menuItemId) as { id?: string; name?: string; price?: number; currency?: string } | undefined;
  if (!menuItem?.id) {
    return { ok: false, message: "Menü ürünü artık satışta değil veya bulunamadı." };
  }
  const productName = String(menuItem.name ?? "Ürün").trim() || "Ürün";
  const unitPrice = roundMoney(Number(menuItem.price ?? 0));
  const currency = normalizeTableOrderCurrency(menuItem.currency);
  const orderCurrency = db
    .prepare("SELECT currency FROM table_order_items WHERE order_id = ? AND status != 'cancelled' ORDER BY created_at ASC LIMIT 1")
    .get(orderId) as { currency?: string } | undefined;
  if (orderCurrency?.currency && normalizeTableOrderCurrency(orderCurrency.currency) !== currency) {
    return { ok: false, message: "Farklı para birimindeki ürün aynı adisyona eklenemez." };
  }
  const existingItem = db
    .prepare(`
        SELECT id, quantity, updated_at FROM table_order_items
        WHERE order_id = ? AND menu_item_id = ? AND product_name = ? AND unit_price = ? AND currency = ? AND note = '' AND status = 'open'
        ORDER BY created_at DESC LIMIT 1
      `)
    .get(orderId, menuItemId, productName, unitPrice, currency) as { id?: string; quantity?: number; updated_at?: string } | undefined;
  const itemId = existingItem?.id || createAndroidEntityId("table_order_item_", action.id);
  if (existingItem?.id) {
    const nextQuantity = Number(existingItem.quantity ?? 0) + quantity;
    if (nextQuantity > 999) {
      return { ok: false, message: "Bir sipariş satırındaki ürün adedi 999'u aşamaz." };
    }
    if (isInventoryTrackingEnabled(db)) {
      const stockResult = mutateStoredMenuStock(db, {
        menuItemId,
        type: "order_add",
        quantityChange: -quantity,
        sourceType: "table_order",
        sourceId: orderId,
        actorDeviceId: action.device_id,
        note: `${productName} Android siparişinden adisyona eklendi.`,
        now
      });
      if (!stockResult.ok) {
        return stockResult;
      }
    }
    const itemUpdatedAt = nextMutationTimestamp(existingItem.updated_at, now);
    db
      .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
      .run(nextQuantity, roundMoney(unitPrice * nextQuantity), itemUpdatedAt, itemId);
  } else {
    if (isInventoryTrackingEnabled(db)) {
      const stockResult = mutateStoredMenuStock(db, {
        menuItemId,
        type: "order_add",
        quantityChange: -quantity,
        sourceType: "table_order",
        sourceId: orderId,
        actorDeviceId: action.device_id,
        note: `${productName} Android siparişinden adisyona eklendi.`,
        now
      });
      if (!stockResult.ok) {
        return stockResult;
      }
    }
    db
      .prepare(`
          INSERT INTO table_order_items (
            id, order_id, menu_item_id, product_name, unit_price, currency, quantity, line_total, note, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 'open', ?, ?)
        `)
      .run(itemId, orderId, menuItemId, productName, unitPrice, currency, quantity, roundMoney(unitPrice * quantity), now, now);
  }
  recalculateTableOrderTotalInTransaction(db, orderId, now);
  insertAndroidActionEvent(db, action, "table_order.item_added", "table_order", orderId, {
    item_id: itemId,
    menu_item_id: menuItemId,
    quantity,
    unit_price: unitPrice,
    currency
  }, now);
  return { ok: true, message: "Ürün telefondan adisyona eklendi." };
}

export function applyAndroidTableOrderItemQuantity(
  db: DatabaseSync,
  action: AndroidSyncAction,
  now: string
): AndroidActionMutationResult {
  const itemId = androidPayloadString(action.payload, "item_id");
  const quantity = normalizeOrderQuantity(androidPayloadNumber(action.payload, "quantity", 0));
  if (!itemId || !quantity) {
    return { ok: false, message: "Sipariş satırı veya adet bilgisi geçersiz." };
  }
  const item = getMutableTableOrderItem(db, itemId);
  if (!item) {
    return { ok: false, message: "Güncellenecek aktif sipariş satırı bulunamadı." };
  }
  const versionConflict = getAndroidVersionConflict(action.payload, "expected_item_updated_at", item.updated_at, "Sipariş satırı");
  if (versionConflict) {
    return versionConflict;
  }
  const updatedAt = nextMutationTimestamp(item.updated_at, now);
  const orderId = String(item.order_id ?? "");
  const previousQuantity = Number(item.quantity ?? 0);
  if (quantity !== previousQuantity) {
    if (isInventoryTrackingEnabled(db)) {
      const stockResult = mutateStoredMenuStock(db, {
        menuItemId: String(item.menu_item_id ?? ""),
        type: "order_update",
        quantityChange: previousQuantity - quantity,
        sourceType: "table_order",
        sourceId: orderId,
        actorDeviceId: action.device_id,
        note: "Android siparişinde ürün adedi değiştirildi.",
        now
      });
      if (!stockResult.ok) {
        return stockResult;
      }
    }
  }
  db
    .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
    .run(quantity, roundMoney(Number(item.unit_price ?? 0) * quantity), updatedAt, itemId);
  recalculateTableOrderTotalInTransaction(db, orderId, now);
  insertAndroidActionEvent(db, action, "table_order.item_quantity_changed", "table_order", orderId, {
    item_id: itemId,
    quantity
  }, now);
  return { ok: true, message: "Ürün adedi telefondan güncellendi." };
}

export function applyAndroidTableOrderRemoveItem(
  db: DatabaseSync,
  action: AndroidSyncAction,
  now: string
): AndroidActionMutationResult {
  const itemId = androidPayloadString(action.payload, "item_id");
  const item = getMutableTableOrderItem(db, itemId);
  if (!item) {
    return { ok: false, message: "Silinecek aktif sipariş satırı bulunamadı." };
  }
  const versionConflict = getAndroidVersionConflict(action.payload, "expected_item_updated_at", item.updated_at, "Sipariş satırı");
  if (versionConflict) {
    return versionConflict;
  }
  const updatedAt = nextMutationTimestamp(item.updated_at, now);
  const orderId = String(item.order_id ?? "");
  if (isInventoryTrackingEnabled(db)) {
    const stockResult = mutateStoredMenuStock(db, {
      menuItemId: String(item.menu_item_id ?? ""),
      type: "order_remove",
      quantityChange: Number(item.quantity ?? 0),
      sourceType: "table_order",
      sourceId: orderId,
      actorDeviceId: action.device_id,
      note: "Ürün Android siparişinden silindi.",
      now
    });
    if (!stockResult.ok) {
      return stockResult;
    }
  }
  db
    .prepare("UPDATE table_order_items SET status = 'cancelled', updated_at = ? WHERE id = ?")
    .run(updatedAt, itemId);
  recalculateTableOrderTotalInTransaction(db, orderId, now);
  insertAndroidActionEvent(db, action, "table_order.item_removed", "table_order", orderId, { item_id: itemId }, now);
  return { ok: true, message: "Ürün telefondan adisyondan kaldırıldı." };
}

export function applyAndroidTableOrderStatus(
  db: DatabaseSync,
  action: AndroidSyncAction,
  now: string,
  forcedStatus?: "preparing" | "served" | "payment"
): AndroidActionMutationResult {
  const orderId = resolveAndroidActiveOrderId(db, action.payload);
  const status = forcedStatus ?? normalizeStatus(androidPayloadString(action.payload, "status"), ["open", "preparing", "served", "payment"]);
  if (!orderId || !status) {
    return { ok: false, message: "Adisyon veya yeni durum bilgisi geçersiz." };
  }
  const current = db
    .prepare("SELECT status, table_id, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
    .get(orderId) as { status?: string; table_id?: string; updated_at?: string } | undefined;
  if (!current) {
    return { ok: false, message: "Güncellenecek aktif adisyon bulunamadı." };
  }
  const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", current.updated_at, "Adisyon");
  if (versionConflict) {
    return versionConflict;
  }
  const updatedAt = nextMutationTimestamp(current.updated_at, now);
  db.prepare("UPDATE table_orders SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, orderId);
  if (status === "preparing") {
    db
      .prepare("UPDATE table_order_items SET status = 'preparing', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
      .run(updatedAt, orderId);
  } else if (status === "served") {
    db
      .prepare("UPDATE table_order_items SET status = 'served', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
      .run(updatedAt, orderId);
  }
  updateTableStatusForOrder(db, String(current.table_id ?? ""), status === "payment" ? "bill_waiting" : "occupied", orderId, now, action);
  insertAndroidActionEvent(db, action, "table_order.status_changed", "table_order", orderId, {
    old_status: String(current.status ?? ""),
    new_status: status
  }, now);
  return { ok: true, message: "Adisyon durumu telefondan güncellendi." };
}

export function applyAndroidTableOrderClose(
  db: DatabaseSync,
  action: AndroidSyncAction,
  now: string,
  forcedStatus?: "paid" | "cancelled"
): AndroidActionMutationResult {
  const orderId = resolveAndroidActiveOrderId(db, action.payload);
  const status = forcedStatus ?? normalizeStatus(androidPayloadString(action.payload, "status"), ["paid", "cancelled"]);
  if (!orderId || !status) {
    return { ok: false, message: "Kapatılacak adisyon veya kapanış durumu geçersiz." };
  }
  const current = db
    .prepare("SELECT status, table_id, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
    .get(orderId) as { status?: string; table_id?: string; updated_at?: string } | undefined;
  if (!current) {
    return { ok: false, message: "Kapatılacak aktif adisyon bulunamadı." };
  }
  const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", current.updated_at, "Adisyon");
  if (versionConflict) {
    return versionConflict;
  }
  const updatedAt = nextMutationTimestamp(current.updated_at, now);
  if (status === "cancelled" && isInventoryTrackingEnabled(db)) {
    const stockRestore = restoreCancelledOrderStockInTransaction(db, orderId, action.device_id, now);
    if (!stockRestore.ok) {
      return stockRestore;
    }
  }
  recalculateTableOrderTotalInTransaction(db, orderId, now);
  db
    .prepare("UPDATE table_orders SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?")
    .run(status, now, updatedAt, orderId);
  updateTableStatusForOrder(db, String(current.table_id ?? ""), "available", orderId, now, action);
  insertAndroidActionEvent(db, action, status === "paid" ? "table_order.paid" : "table_order.cancelled", "table_order", orderId, {
    old_status: String(current.status ?? ""),
    status
  }, now);
  return { ok: true, message: status === "paid" ? "Adisyon telefondan ödendi olarak kapatıldı." : "Adisyon telefondan iptal edildi." };
}
