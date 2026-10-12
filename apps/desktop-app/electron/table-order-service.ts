import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import type {
  AddTableOrderItemInput,
  DesktopTableOrderResult,
  TableOrderStatus,
  UpdateTableOrderDiscountInput,
  UpdateTableOrderItemNoteInput,
  UpdateTableOrderItemQuantityInput,
  UpdateTableOrderStatusInput
} from "./database-types.js";
import { insertDatabaseEvent, type DomainMutationContext } from "./database/event-store.js";
import {
  getActiveTableOrder,
  getMutableTableOrderItem,
  getTableOrderById,
  getTableOrderMutationResult,
  isActiveTableOrder,
  recalculateTableOrderTotalInTransaction,
  restoreCancelledOrderStockInTransaction
} from "./database/table-order-store.js";
import { getPublishedMenu } from "./database/menu-store.js";
import { snapshotProductConsumption, applyProductConsumptionInTransaction } from "./product-inventory-consumption.js";
import { normalizeStatus } from "./database/request-utils.js";
import {
  createTableOrderId,
  normalizeOrderQuantity,
  normalizeTableOrderCurrency,
  roundMoney,
  TABLE_ORDER_STATUSES
} from "./database/stock-utils.js";
import { nextMutationTimestamp } from "./database/android-utils.js";
import { synchronizeFinanceSourceInTransaction } from "./finance.js";

interface TableOrderMutationContext extends DomainMutationContext { newOrderId?: string; newItemId?: string }

function tableOrderTransaction(db: DatabaseSync) {
  const nested = db.isTransaction;
  return {
    begin: nested ? "SAVEPOINT table_order" : "BEGIN IMMEDIATE",
    commit: nested ? "RELEASE table_order" : "COMMIT",
    rollback: nested ? "ROLLBACK TO table_order; RELEASE table_order" : "ROLLBACK"
  };
}

export function openTableOrder(db: DatabaseSync, tableId: string, context: TableOrderMutationContext = {}): DesktopTableOrderResult {
  const normalizedTableId = tableId.trim();
  if (!normalizedTableId) {
    return { ok: false, message: "Sipariş açmak için geçerli bir masa seçin." };
  }

  const id = context.newOrderId ?? createTableOrderId("table_order_");
  const now = context.now ?? new Date().toISOString();
  let tableName = "Masa";
  const tx = tableOrderTransaction(db);
  db.exec(tx.begin);
  try {
    const table = db
      .prepare("SELECT id, name, status FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''")
      .get(normalizedTableId) as { id?: string; name?: string; status?: string } | undefined;
    if (!table?.id) {
      db.exec(tx.rollback);
      return { ok: false, message: "Sipariş açılacak aktif masa bulunamadı." };
    }
    tableName = String(table.name ?? "Masa");

    const activeOrder = getActiveTableOrder(db, normalizedTableId);
    if (activeOrder) {
      updateTableStatusForOrder(db, normalizedTableId, activeOrder.status === "payment" ? "bill_waiting" : "occupied", activeOrder.id, now, context.androidAction);
      db.exec(tx.commit);
      return {
        ok: true,
        message: `${tableName} için açık adisyon gösteriliyor.`,
        order: activeOrder
      };
    }

    db
      .prepare(`
          INSERT INTO table_orders (
            id,
            table_id,
            status,
            opened_at,
            closed_at,
            subtotal,
            discount_total,
            total,
            note,
            created_at,
            updated_at
          ) VALUES (?, ?, 'open', ?, '', 0, 0, 0, '', ?, ?)
        `)
      .run(id, normalizedTableId, now, now, now);
    updateTableStatusForOrder(db, normalizedTableId, "occupied", id, now, context.androidAction);
    insertDatabaseEvent(db, {
      type: "table_order.opened",
      ...(context.androidAction ? { androidAction: context.androidAction } : {}),
      entityType: "table_order",
      entityId: id,
      payload: { table_id: normalizedTableId },
      now
    });
    db.exec(tx.commit);
  } catch (error) {
    db.exec(tx.rollback);
    throw error;
  }

  const order = getTableOrderById(db, id);
  if (!order) {
    return { ok: false, message: "Adisyon açıldı ancak yeniden yüklenemedi." };
  }

  return {
    ok: true,
    message: `${tableName} için adisyon açıldı.`,
    order
  };
}

export function addTableOrderItem(db: DatabaseSync, input: AddTableOrderItemInput, context: TableOrderMutationContext = {}): DesktopTableOrderResult {
  const orderId = input.orderId.trim();
  const menuItemId = input.menuEntryId.trim();
  const quantity = normalizeOrderQuantity(input.quantity);
  const note = String(input.note ?? "").trim().slice(0, 500);
  if (!orderId || !menuItemId || !quantity) {
    return { ok: false, message: "Ürün, aktif adisyon ve geçerli adet bilgisi gerekli." };
  }

  const now = context.now ?? new Date().toISOString();
  const tx = tableOrderTransaction(db);
  db.exec(tx.begin);
  try {
    if (!isActiveTableOrder(db, orderId)) {
      db.exec(tx.rollback);
      return { ok: false, message: "Ürün yalnızca aktif bir adisyona eklenebilir." };
    }

    const menu = getPublishedMenu(db);
    const menuItem = menu.items.find(item => item.id === menuItemId && item.is_available
      && menu.categories.some(category => category.id === item.category_id && category.is_active));
    if (!menuItem?.id) {
      db.exec(tx.rollback);
      return { ok: false, message: "Yalnızca aktif ve mevcut menü ürünleri siparişe eklenebilir." };
    }

    const productName = String(menuItem.name ?? "Ürün").trim() || "Ürün";
    const unitPrice = roundMoney(Number(menuItem.price ?? 0));
    const currency = normalizeTableOrderCurrency(menuItem.currency);
    const consumption = snapshotProductConsumption(db, menuItem.product_id!, menuItem.stock_consumption_quantity, now);
    const orderCurrency = db
      .prepare(`
          SELECT currency
          FROM table_order_items
          WHERE order_id = ?
            AND status != 'cancelled'
          ORDER BY created_at ASC
          LIMIT 1
        `)
      .get(orderId) as { currency?: string } | undefined;
    if (orderCurrency?.currency && normalizeTableOrderCurrency(orderCurrency.currency) !== currency) {
      db.exec(tx.rollback);
      return {
        ok: false,
        message: `Bu adisyon ${normalizeTableOrderCurrency(orderCurrency.currency)} para birimiyle açık; ${currency} ürün eklenemez.`
      };
    }

    const existingItem = db
      .prepare(`
          SELECT id, quantity, updated_at
          FROM table_order_items
          WHERE order_id = ?
            AND product_id = ?
            AND menu_entry_id = ?
            AND inventory_quantity_per_item = ?
            AND inventory_location_id IS ?
            AND product_name = ?
            AND unit_price = ?
            AND currency = ?
            AND note = ?
            AND status = 'open'
          ORDER BY created_at DESC
          LIMIT 1
        `)
      .get(orderId, consumption.product_id, menuItemId, consumption.inventory_quantity_per_item, consumption.inventory_location_id,
        productName, unitPrice, currency, note) as { id?: string; quantity?: number; updated_at?: string } | undefined;

    const itemId = existingItem?.id || context.newItemId || createTableOrderId("table_order_item_");
    if (existingItem?.id) {
      const nextQuantity = Number(existingItem.quantity ?? 0) + quantity;
      if (nextQuantity > 999) {
        db.exec(tx.rollback);
        return { ok: false, message: "Bir sipariş satırındaki ürün adedi 999'u aşamaz." };
      }
      {
        const stockResult = applyProductConsumptionInTransaction(db, consumption, -quantity, {
          referenceType: "table_order",
          referenceId: orderId,
          actorSource: context.androidAction ? "android" : "desktop",
          note: `${productName} adisyona eklendi.`,
          now
        });
        if (!stockResult.ok) {
          db.exec(tx.rollback);
          return stockResult;
        }
      }
      db
        .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
        .run(nextQuantity, roundMoney(unitPrice * nextQuantity), context.androidAction ? nextMutationTimestamp(existingItem.updated_at, now) : now, itemId);
    } else {
      {
        const stockResult = applyProductConsumptionInTransaction(db, consumption, -quantity, {
          referenceType: "table_order",
          referenceId: orderId,
          actorSource: context.androidAction ? "android" : "desktop",
          note: `${productName} adisyona eklendi.`,
          now
        });
        if (!stockResult.ok) {
          db.exec(tx.rollback);
          return stockResult;
        }
      }
      db
        .prepare(`
            INSERT INTO table_order_items (
              id,
              order_id,
              product_id, menu_entry_id, inventory_quantity_per_item, inventory_location_id,
              product_name,
              unit_price,
              currency,
              quantity,
              line_total,
              note,
              status,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
          `)
        .run(
          itemId,
          orderId,
          consumption.product_id,
          menuItemId,
          consumption.inventory_quantity_per_item,
          consumption.inventory_location_id,
          productName,
          unitPrice,
          currency,
          quantity,
          roundMoney(unitPrice * quantity),
          note,
          now,
          now
        );
    }
    recalculateTableOrderTotalInTransaction(db, orderId, now);
    insertDatabaseEvent(db, {
      type: "table_order.item_added",
      ...(context.androidAction ? { androidAction: context.androidAction } : {}),
      entityType: "table_order",
      entityId: orderId,
      payload: { item_id: itemId, product_id: consumption.product_id, menu_entry_id: menuItemId, product_name: productName, quantity, unit_price: unitPrice, currency },
      now
    });
    db.exec(tx.commit);
  } catch (error) {
    db.exec(tx.rollback);
    throw error;
  }

  return getTableOrderMutationResult(db, orderId, "Ürün adisyona eklendi.");
}

export function updateTableOrderItemQuantity(db: DatabaseSync, input: UpdateTableOrderItemQuantityInput, context: DomainMutationContext = {}): DesktopTableOrderResult {
  const itemId = input.itemId.trim();
  const quantity = normalizeOrderQuantity(input.quantity);
  if (!itemId || !quantity) {
    return { ok: false, message: "Sipariş satırı için 1 ile 999 arasında bir adet girin." };
  }

  const now = context.now ?? new Date().toISOString();
  let orderId = "";
  const tx = tableOrderTransaction(db);
  db.exec(tx.begin);
  try {
    const item = getMutableTableOrderItem(db, itemId);
    if (!item) {
      db.exec(tx.rollback);
      return { ok: false, message: "Güncellenecek aktif sipariş satırı bulunamadı." };
    }
    orderId = String(item.order_id);
    const previousQuantity = Number(item.quantity ?? 0);
    if (quantity !== previousQuantity) {
      {
        const stockResult = applyProductConsumptionInTransaction(db, {
          product_id: String(item.product_id), inventory_quantity_per_item: Number(item.inventory_quantity_per_item),
          inventory_location_id: item.inventory_location_id ? String(item.inventory_location_id) : null
        }, previousQuantity - quantity, {
          referenceType: "table_order",
          referenceId: orderId,
          actorSource: context.androidAction ? "android" : "desktop",
          note: "Adisyon ürün adedi değiştirildi.",
          now
        });
        if (!stockResult.ok) {
          db.exec(tx.rollback);
          return stockResult;
        }
      }
    }
    const lineTotal = roundMoney(Number(item.unit_price ?? 0) * quantity);
    const updatedAt = nextMutationTimestamp(item.updated_at, now);
    db
      .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
      .run(quantity, lineTotal, updatedAt, itemId);
    recalculateTableOrderTotalInTransaction(db, orderId, now);
    insertDatabaseEvent(db, {
      type: "table_order.item_quantity_changed",
      ...(context.androidAction ? { androidAction: context.androidAction } : {}),
      entityType: "table_order",
      entityId: orderId,
      payload: { item_id: itemId, quantity },
      now
    });
    db.exec(tx.commit);
  } catch (error) {
    db.exec(tx.rollback);
    throw error;
  }

  return getTableOrderMutationResult(db, orderId, "Ürün adedi güncellendi.");
}

export function updateTableOrderItemNote(db: DatabaseSync, input: UpdateTableOrderItemNoteInput): DesktopTableOrderResult {
  const itemId = input.itemId.trim();
  const note = String(input.note ?? "").trim().slice(0, 500);
  const now = new Date().toISOString();
  let orderId = "";
  const tx = tableOrderTransaction(db);
  db.exec(tx.begin);
  try {
    const item = getMutableTableOrderItem(db, itemId);
    if (!item) {
      db.exec(tx.rollback);
      return { ok: false, message: "Not eklenecek aktif sipariş satırı bulunamadı." };
    }
    orderId = String(item.order_id);
    const updatedAt = nextMutationTimestamp(item.updated_at, now);
    db.prepare("UPDATE table_order_items SET note = ?, updated_at = ? WHERE id = ?").run(note, updatedAt, itemId);
    db.prepare("UPDATE table_orders SET updated_at = ? WHERE id = ?").run(now, orderId);
    insertDatabaseEvent(db, {
      type: "table_order.item_note_changed",
      entityType: "table_order",
      entityId: orderId,
      payload: { item_id: itemId, has_note: Boolean(note) },
      now
    });
    db.exec(tx.commit);
  } catch (error) {
    db.exec(tx.rollback);
    throw error;
  }
  return getTableOrderMutationResult(db, orderId, "Ürün notu kaydedildi.");
}

export function removeTableOrderItem(db: DatabaseSync, itemIdInput: string, context: DomainMutationContext = {}): DesktopTableOrderResult {
  const normalizedItemId = itemIdInput.trim();
  const now = context.now ?? new Date().toISOString();
  let orderId = "";
  const tx = tableOrderTransaction(db);
  db.exec(tx.begin);
  try {
    const item = getMutableTableOrderItem(db, normalizedItemId);
    if (!item) {
      db.exec(tx.rollback);
      return { ok: false, message: "Silinecek aktif sipariş satırı bulunamadı." };
    }
    orderId = String(item.order_id);
    {
      const stockResult = applyProductConsumptionInTransaction(db, {
        product_id: String(item.product_id), inventory_quantity_per_item: Number(item.inventory_quantity_per_item),
        inventory_location_id: item.inventory_location_id ? String(item.inventory_location_id) : null
      }, Number(item.quantity ?? 0), {
        referenceType: "table_order",
        referenceId: orderId,
        actorSource: context.androidAction ? "android" : "desktop",
        note: "Ürün adisyondan silindi.",
        now
      });
      if (!stockResult.ok) {
        db.exec(tx.rollback);
        return stockResult;
      }
    }
    const updatedAt = nextMutationTimestamp(item.updated_at, now);
    db.prepare("UPDATE table_order_items SET status = 'cancelled', updated_at = ? WHERE id = ?").run(updatedAt, normalizedItemId);
    recalculateTableOrderTotalInTransaction(db, orderId, now);
    insertDatabaseEvent(db, {
      type: "table_order.item_removed",
      ...(context.androidAction ? { androidAction: context.androidAction } : {}),
      entityType: "table_order",
      entityId: orderId,
      payload: { item_id: normalizedItemId },
      now
    });
    db.exec(tx.commit);
  } catch (error) {
    db.exec(tx.rollback);
    throw error;
  }

  return getTableOrderMutationResult(db, orderId, "Ürün adisyondan kaldırıldı.");
}

export function updateTableOrderDiscount(db: DatabaseSync, input: UpdateTableOrderDiscountInput): DesktopTableOrderResult {
  const orderId = input.orderId.trim();
  const rawDiscountTotal = Number(input.discountTotal);
  if (!orderId || !Number.isFinite(rawDiscountTotal) || rawDiscountTotal < 0) {
    return { ok: false, message: "İndirim tutarı geçersiz." };
  }
  const discountTotal = roundMoney(rawDiscountTotal);

  const now = new Date().toISOString();
  const tx = tableOrderTransaction(db);
  db.exec(tx.begin);
  try {
    const current = db
      .prepare("SELECT subtotal, discount_total, status, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .get(orderId) as { subtotal?: number; discount_total?: number; status?: string; updated_at?: string } | undefined;
    if (!current) {
      db.exec(tx.rollback);
      return { ok: false, message: "İndirim uygulanacak aktif adisyon bulunamadı." };
    }

    const subtotal = roundMoney(Number(current.subtotal ?? 0));
    if (discountTotal > subtotal) {
      db.exec(tx.rollback);
      return { ok: false, message: "İndirim ara toplamı aşamaz." };
    }

    const updatedAt = nextMutationTimestamp(current.updated_at, now);
    db.prepare("UPDATE table_orders SET discount_total = ?, updated_at = ? WHERE id = ?")
      .run(discountTotal, updatedAt, orderId);
    recalculateTableOrderTotalInTransaction(db, orderId, now);
    insertDatabaseEvent(db, {
      type: "table_order.discount_changed",
      entityType: "table_order",
      entityId: orderId,
      payload: {
        old_discount_total: roundMoney(Number(current.discount_total ?? 0)),
        new_discount_total: discountTotal
      },
      now
    });
    db.exec(tx.commit);
  } catch (error) {
    db.exec(tx.rollback);
    throw error;
  }

  return getTableOrderMutationResult(
    db,
    orderId,
    discountTotal > 0 ? "Adisyon indirimi güncellendi." : "Adisyon indirimi kaldırıldı."
  );
}

export function updateTableOrderStatus(db: DatabaseSync, input: UpdateTableOrderStatusInput, context: DomainMutationContext = {}): DesktopTableOrderResult {
  const orderId = input.orderId.trim();
  const status = normalizeStatus(input.status, TABLE_ORDER_STATUSES) as TableOrderStatus;
  if (!orderId || !status) {
    return { ok: false, message: "Adisyon için geçerli bir durum seçin." };
  }

  if (status === "paid" || status === "cancelled") {
    return closeTableOrder(db, { orderId, status }, context);
  }

  const now = context.now ?? new Date().toISOString();
  const tx = tableOrderTransaction(db);
  db.exec(tx.begin);
  try {
    const current = db
      .prepare("SELECT status, table_id FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .get(orderId) as { status?: string; table_id?: string } | undefined;
    if (!current) {
      db.exec(tx.rollback);
      return { ok: false, message: "Durumu güncellenecek aktif adisyon bulunamadı." };
    }

    const updateResult = db
      .prepare("UPDATE table_orders SET status = ?, updated_at = ? WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .run(status, now, orderId);
    if (Number(updateResult.changes) !== 1) {
      db.exec(tx.rollback);
      return { ok: false, message: "Adisyon başka bir işlem tarafından güncellendi; yeniden yükleyin." };
    }
    if (status === "preparing") {
      db
        .prepare("UPDATE table_order_items SET status = 'preparing', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
        .run(now, orderId);
    } else if (status === "served") {
      db
        .prepare("UPDATE table_order_items SET status = 'served', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
        .run(now, orderId);
    }
    updateTableStatusForOrder(
      db,
      String(current.table_id ?? ""),
      status === "payment" ? "bill_waiting" : "occupied",
      orderId,
      now,
      context.androidAction
    );
    insertDatabaseEvent(db, {
      type: "table_order.status_changed",
      ...(context.androidAction ? { androidAction: context.androidAction } : {}),
      entityType: "table_order",
      entityId: orderId,
      payload: { old_status: String(current.status ?? ""), new_status: status },
      now
    });
    db.exec(tx.commit);
  } catch (error) {
    db.exec(tx.rollback);
    throw error;
  }

  return getTableOrderMutationResult(db, orderId, "Adisyon durumu güncellendi.");
}

export function closeTableOrder(db: DatabaseSync, input: UpdateTableOrderStatusInput, context: DomainMutationContext = {}): DesktopTableOrderResult {
  const orderId = input.orderId.trim();
  const status = normalizeStatus(input.status, ["paid", "cancelled"]) as "paid" | "cancelled";
  if (!orderId || !status) {
    return { ok: false, message: "Adisyon yalnızca ödendi veya iptal durumuyla kapatılabilir." };
  }

  const now = context.now ?? new Date().toISOString();
  const tx = tableOrderTransaction(db);
  db.exec(tx.begin);
  try {
    const current = db
      .prepare("SELECT status, table_id FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .get(orderId) as { status?: string; table_id?: string } | undefined;
    if (!current) {
      db.exec(tx.rollback);
      return { ok: false, message: "Kapatılacak aktif adisyon bulunamadı." };
    }
    if (status === "cancelled") {
      const stockRestore = restoreCancelledOrderStockInTransaction(db, orderId, context.androidAction?.device_id ?? "", now);
      if (!stockRestore.ok) {
        db.exec(tx.rollback);
        return stockRestore;
      }
    }
    recalculateTableOrderTotalInTransaction(db, orderId, now);
    const updateResult = db
      .prepare(`
          UPDATE table_orders
          SET status = ?, closed_at = ?, updated_at = ?
          WHERE id = ?
            AND status IN ('open', 'preparing', 'served', 'payment')
        `)
      .run(status, now, now, orderId);
    if (Number(updateResult.changes) !== 1) {
      db.exec(tx.rollback);
      return { ok: false, message: "Adisyon başka bir işlem tarafından kapatıldı; yeniden yükleyin." };
    }
    synchronizeFinanceSourceInTransaction(db, "restaurant_order", orderId);
    updateTableStatusForOrder(db, String(current.table_id ?? ""), "available", orderId, now, context.androidAction);
    insertDatabaseEvent(db, {
      type: status === "paid" ? "table_order.paid" : "table_order.cancelled",
      ...(context.androidAction ? { androidAction: context.androidAction } : {}),
      entityType: "table_order",
      entityId: orderId,
      payload: { old_status: String(current.status ?? ""), status },
      now
    });
    db.exec(tx.commit);
  } catch (error) {
    db.exec(tx.rollback);
    throw error;
  }

  return getTableOrderMutationResult(
    db,
    orderId,
    status === "paid" ? "Adisyon ödendi olarak kapatıldı." : "Adisyon iptal edildi."
  );
}

function updateTableStatusForOrder(
  db: DatabaseSync,
  tableId: string,
  status: "available" | "occupied" | "bill_waiting",
  orderId: string,
  now: string,
  androidAction?: AndroidSyncAction
) {
  if (!tableId) {
    return;
  }

  const table = db
    .prepare("SELECT status, current_customer_id, current_reservation_id, updated_at FROM tables WHERE id = ? AND deleted_at = ''")
    .get(tableId) as { status?: string; current_customer_id?: string; current_reservation_id?: string; updated_at?: string } | undefined;
  const shouldClearAssignment = status === "available"
    && (Boolean(String(table?.current_customer_id ?? "")) || Boolean(String(table?.current_reservation_id ?? "")));
  if (!table || (table.status === status && !shouldClearAssignment)) {
    return;
  }
  const updatedAt = nextMutationTimestamp(table.updated_at, now);

  const updateResult = db
    .prepare(`
        UPDATE tables
        SET status = ?,
            current_customer_id = CASE WHEN ? = 'available' THEN '' ELSE current_customer_id END,
            current_reservation_id = CASE WHEN ? = 'available' THEN '' ELSE current_reservation_id END,
            updated_at = ?,
            sync_status = 'local_only'
        WHERE id = ? AND deleted_at = ''
      `)
    .run(status, status, status, updatedAt, tableId);
  if (Number(updateResult.changes) !== 1) {
    throw new Error("Table status could not be synchronized with the active order.");
  }
  const payload = {
    old_status: String(table.status ?? ""),
    new_status: status,
    source: "table_order",
    order_id: orderId
  };
  insertDatabaseEvent(db, { type: "table.status_changed", entityType: "table", entityId: tableId, payload, now, ...(androidAction ? { androidAction } : {}) });
}
