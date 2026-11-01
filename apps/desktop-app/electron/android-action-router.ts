import { applyAndroidCommerceOrderAction } from "./android-commerce-order-actions";
import type { DatabaseSync } from "node:sqlite";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { applyAndroidReservationAction } from "./android-reservation-actions.js";
import { applyAndroidDailyTaskAction } from "./android-daily-task-actions.js";
import { applyAndroidFinanceAction } from "./android-finance-actions.js";
import { applyAndroidRoomFolioAction } from "./android-room-folio-actions.js";
import { applyMarketAndroidAction } from "./market-android-actions.js";
import {
  applyAndroidTableOrderOpen,
  applyAndroidTableOrderAddItem,
  applyAndroidTableOrderItemQuantity,
  applyAndroidTableOrderRemoveItem,
  applyAndroidTableOrderStatus,
  applyAndroidTableOrderClose
} from "./android-table-order-actions.js";
import {
  authorizeAndroidAction,
  applyAndroidRequestStatus,
  applyAndroidCustomerSave,
  applyAndroidDailyTaskStatus,
  applyAndroidMenuStockAction,
  applyAndroidCustomerRoomAssignment,
  applyAndroidCustomerRoomStayStatus,
  applyAndroidReservationStatus,
  applyAndroidRoomStatus,
  applyAndroidRequestConversion,
  insertAndroidActionEvent
} from "./android-action-service.js";
import {
  androidPayloadString,
  getAndroidVersionConflict,
  nextMutationTimestamp,
  normalizeAndroidDeviceRole,
  type AndroidActionMutationResult
} from "./database/android-utils.js";
import {
  normalizeStockImageImportId,
  isSha256Hex,
  normalizeStockImageApplyLines
} from "./database/stock-utils.js";
import {
  deleteRequestInTransaction
} from "./database/request-store.js";
import {
  deleteMenuCategoryInTransaction,
  deleteMenuProductEntryInTransaction
} from "./database/menu-store.js";
import { deleteMessageInTransaction } from "./database/prepared-message-store.js";
import { deleteCustomerInTransaction } from "./database/customer-deletion-service.js";
import {
  createStockImageImport,
  applyStockImageImportInTransaction
} from "./database/stock-image-store.js";
import { queueSyncJob } from "./database/sync-runtime-store.js";
import { applyAndroidKbsAction } from "./android-kbs-actions.js";
import { getPublishedMenu } from "./database/menu-store.js";
import { saveMenuProductEntryInTransaction } from "./database/menu-product-entry-store.js";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { SaveMenuProductEntryInput } from "./database-types.js";
import type { LocalCompanionActionContext } from "./local-companion-server.js";

export function routeAndroidActionInTransaction(
  db: DatabaseSync,
  action: AndroidSyncAction,
  now: string,
  enabledCapabilities: BusinessCapability[],
  // Reserved for a future explicit spend route. Existing actions never consume it.
  _localContext?: LocalCompanionActionContext
): AndroidActionMutationResult {
  const authorization = authorizeAndroidAction(db, action, enabledCapabilities);
  if (!authorization.ok) {
    return authorization;
  }

  const insertEvent = (
    sinkAction: AndroidSyncAction,
    type: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
    eventNow: string
  ) => insertAndroidActionEvent(db, sinkAction, type, entityType, entityId, payload, eventNow);

  switch (action.action_type) {
    case "kbs_send_request":
    case "kbs_retry_prepare":
    case "kbs_mark_sent_externally":
      return applyAndroidKbsAction(db, action, now);
    case "commerce_order_confirm":
    case "commerce_order_cancel":
      return applyAndroidCommerceOrderAction(db, action, now);
    case "customer_request_mark_answered":
      return applyAndroidRequestStatus(db, action, "answered", now, enabledCapabilities);
    case "customer_request_reopen":
      return applyAndroidRequestStatus(db, action, "new", now, enabledCapabilities);
    case "customer_request_approve":
      return applyAndroidRequestStatus(db, action, "approved", now, enabledCapabilities);
    case "customer_request_reject":
      return applyAndroidRequestStatus(db, action, "rejected", now, enabledCapabilities);
    case "customer_request_convert_to_reservation":
      return applyAndroidRequestConversion(db, action, now, enabledCapabilities);
    case "customer_request_delete":
      return deleteRequestInTransaction(
        db,
        androidPayloadString(action.payload, "request_id"),
        now,
        action,
        insertEvent
      );
    case "customer_create":
      return applyAndroidCustomerSave(db, action, now, false);
    case "customer_update":
      return applyAndroidCustomerSave(db, action, now, true);
    case "customer_delete":
      return deleteCustomerInTransaction(
        db,
        androidPayloadString(action.payload, "customer_id"),
        now,
        action,
        insertEvent
      );
    case "customer_room_assign":
      return applyAndroidCustomerRoomAssignment(db, action, now);
    case "customer_room_stay_status":
      return applyAndroidCustomerRoomStayStatus(db, action, now);
    case "reservation_room_create":
    case "reservation_room_update":
    case "reservation_table_create":
    case "reservation_table_update":
      return applyAndroidReservationAction({
        db,
        action,
        now
      });
    case "reservation_approve":
      return applyAndroidReservationStatus(db, action, "approved", now);
    case "reservation_reject":
      return applyAndroidReservationStatus(db, action, "rejected", now);
    case "reservation_cancel":
      return applyAndroidReservationStatus(db, action, "cancelled", now);
    case "room_status_update":
      return applyAndroidRoomStatus(db, action, now);
    case "daily_task_create":
    case "daily_task_update":
    case "daily_task_delete":
      return applyAndroidDailyTaskAction({
        db,
        action,
        now,
        insertEvent: (type, entityId, payload) =>
          insertEvent(action, type, "daily_task", entityId, payload, now)
      });
    case "daily_task_complete":
      return applyAndroidDailyTaskStatus(db, action, "done", now);
    case "daily_task_reopen":
      return applyAndroidDailyTaskStatus(db, action, "pending", now);
    case "daily_task_cancel":
      return applyAndroidDailyTaskStatus(db, action, "cancelled", now);
    case "finance_manual_create":
      return applyAndroidFinanceAction({
        db,
        action,
        now,
        insertEvent: (type, entityId, payload) =>
          insertEvent(action, type, "finance_entry", entityId, payload, now)
      });
    case "room_folio_payment_add":
    case "room_folio_menu_item_add":
    case "room_folio_manual_charge_add":
    case "room_folio_checkout":
      return applyAndroidRoomFolioAction({
        db,
        action,
        now,
        insertEvent: (type, entityId, payload) =>
          insertEvent(action, type, "room_folio", entityId, payload, now)
      });
    case "table_status_update":
      return applyAndroidTableStatus(db, action, now);
    case "table_order_open":
      return applyAndroidTableOrderOpen(db, action, now);
    case "table_order_add_item":
      return applyAndroidTableOrderAddItem(db, action, now);
    case "table_order_update_item_quantity":
      return applyAndroidTableOrderItemQuantity(db, action, now);
    case "table_order_remove_item":
      return applyAndroidTableOrderRemoveItem(db, action, now);
    case "table_order_set_preparing":
      return applyAndroidTableOrderStatus(db, action, now, "preparing");
    case "table_order_set_served":
      return applyAndroidTableOrderStatus(db, action, now, "served");
    case "table_order_set_payment_waiting":
      return applyAndroidTableOrderStatus(db, action, now, "payment");
    case "table_order_close_paid":
      return applyAndroidTableOrderClose(db, action, now, "paid");
    case "table_order_cancel":
      return applyAndroidTableOrderClose(db, action, now, "cancelled");
    case "menu_entry_create":
    case "menu_entry_update":
      return applyAndroidMenuEntrySave(db, action, now, enabledCapabilities);
    case "menu_category_delete":
      return deleteMenuCategoryInTransaction(
        db,
        androidPayloadString(action.payload, "category_id"),
        now,
        action,
        insertEvent
      );
    case "menu_item_delete":
      return deleteMenuProductEntryInTransaction(
        db,
        androidPayloadString(action.payload, "menu_entry_id"),
        now,
        action,
        insertEvent
      );
    case "message_delete":
      return deleteMessageInTransaction(
        db,
        androidPayloadString(action.payload, "message_id"),
        androidPayloadString(action.payload, "request_id"),
        now,
        action,
        insertEvent
      );
    case "menu_stock_add":
      return applyAndroidMenuStockAction(db, action, "add", now);
    case "menu_stock_set":
      return applyAndroidMenuStockAction(db, action, "set", now);
    case "menu_stock_adjust":
      return applyAndroidMenuStockAction(db, action, "adjust", now);
    case "menu_stock_image_import_apply":
      return applyAndroidStockImageImport(db, action, now);
    case "market_stock_count":
    case "market_purchase_receive":
    case "market_product_create":
    case "market_cart_draft_create":
    case "market_barcode_scan":
    case "market_sale_complete":
    case "customer_credit_payment_add":
      return applyMarketAndroidAction({
        db,
        action,
        now,
        insertEvent: (type, entityType, entityId, payload) =>
          insertEvent(action, type, entityType, entityId, payload, now),
        queueSnapshot: () => queueSyncJob(db, "android_snapshot", now)
      });
    default:
      return { ok: false, message: "Telefon işlem türü bu masaüstü sürümünde desteklenmiyor." };
  }
}

function applyAndroidMenuEntrySave(db: DatabaseSync, action: AndroidSyncAction, now: string, capabilities: BusinessCapability[]): AndroidActionMutationResult {
  const updating = action.action_type === "menu_entry_update";
  const entryId = androidPayloadString(action.payload, "menu_entry_id");
  const existing = updating ? getPublishedMenu(db, true).items.find(entry => entry.id === entryId) : undefined;
  if (updating && !existing) return { ok: false, message: "Menü ürünü bulunamadı." };
  if (existing) {
    const conflict = getAndroidVersionConflict(action.payload, "expected_updated_at", existing.updated_at, "Menü ürünü");
    if (conflict) return conflict;
  }
  const input = action.payload as unknown as SaveMenuProductEntryInput;
  if (!capabilities.includes(C.INVENTORY) && ((input.product && input.product.trackInventory !== false) || Number(input.stock_consumption_quantity ?? 1) !== Number(existing?.stock_consumption_quantity ?? 1))) {
    return { ok: false, message: "Stok alanları bu işletmede etkin değil." };
  }
  if (Boolean(input.hide_when_out_of_stock) !== Boolean(existing?.hide_when_out_of_stock)
      && (!capabilities.includes(C.INVENTORY) || !capabilities.includes(C.QR_MENU))) return { ok: false, message: "Stokta yokken QR menüden gizleme bu işletmede etkin değil." };
  try {
    const result = saveMenuProductEntryInTransaction(db, { ...input,
      ...(updating ? { id: entryId, product_id: existing!.product_id } : {}) }, nextMutationTimestamp(existing?.updated_at, now));
    insertAndroidActionEvent(db, action, updating ? "menu.entry_updated" : "menu.entry_created", "menu_product_entry", result.savedId,
      { product_id: getPublishedMenu(db, true).items.find(entry => entry.id === result.savedId)?.product_id }, now);
    return result;
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Menü ürünü kaydedilemedi." }; }
}

function applyAndroidTableStatus(
  db: DatabaseSync,
  action: AndroidSyncAction,
  now: string
): AndroidActionMutationResult {
  const tableId = androidPayloadString(action.payload, "table_id");
  const statusValue = androidPayloadString(action.payload, "status");
  const status = ["available", "reserved", "occupied", "bill_waiting", "cleaning"].includes(statusValue)
    ? statusValue
    : "";
  if (!tableId || !status) {
    return { ok: false, message: "Masa veya yeni masa durumu geçersiz." };
  }

  const table = db
    .prepare("SELECT status, updated_at FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''")
    .get(tableId) as { status?: string; updated_at?: string } | undefined;
  if (!table) {
    return { ok: false, message: "Masa masaüstü kayıtlarında bulunamadı." };
  }

  const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", table.updated_at, "Masa");
  if (versionConflict) {
    return versionConflict;
  }

  const activeOrder = db
    .prepare("SELECT id, status FROM table_orders WHERE table_id = ? AND status IN ('open', 'preparing', 'served', 'payment') LIMIT 1")
    .get(tableId) as { id?: string; status?: string } | undefined;
  if (activeOrder) {
    return { ok: false, message: "Aktif adisyonu olan masanın durumu adisyon üzerinden değiştirilmelidir." };
  }

  const updatedAt = nextMutationTimestamp(table.updated_at, now);
  db
    .prepare("UPDATE tables SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
    .run(status, updatedAt, tableId);
  insertAndroidActionEvent(db, action, "table.status_changed", "table", tableId, {
    old_status: String(table.status ?? ""),
    new_status: status
  }, now);
  return { ok: true, message: "Masa durumu telefondan güncellendi." };
}

function applyAndroidStockImageImport(
  db: DatabaseSync,
  action: AndroidSyncAction,
  now: string
): AndroidActionMutationResult {
  const importId = normalizeStockImageImportId(androidPayloadString(action.payload, "import_id"));
  const imageHash = androidPayloadString(action.payload, "image_hash").toLowerCase();
  const lines = normalizeStockImageApplyLines(action.payload.lines);
  if (!importId || !isSha256Hex(imageHash) || !lines) {
    return { ok: false, message: "Görsel stok taslağı eksik veya geçersiz." };
  }

  const existing = db
    .prepare("SELECT status FROM stock_image_imports WHERE import_id = ?")
    .get(importId) as { status?: string } | undefined;
  if (existing) {
    return {
      ok: false,
      message: existing.status === "applied"
        ? "Bu içe aktarma daha önce uygulanmış."
        : "Bu içe aktarma kimliği daha önce kullanılmış."
    };
  }

  const created = createStockImageImport(db, {
    importId,
    source: "android",
    deviceId: action.device_id,
    imageHash
  });
  if (!created.ok) {
    return created;
  }

  db
    .prepare("UPDATE stock_image_imports SET status = 'review', raw_analysis_json = ? WHERE import_id = ?")
    .run(JSON.stringify({ lines }), importId);
  const device = db
    .prepare("SELECT role FROM android_devices WHERE device_id = ? LIMIT 1")
    .get(action.device_id) as { role?: string } | undefined;
  const result = applyStockImageImportInTransaction(db, {
    importId,
    imageHash,
    lines,
    source: "android",
    actorDeviceId: action.device_id,
    duplicateWarningAcknowledged: action.payload.duplicate_warning_acknowledged === true,
    canOverrideDuplicate: normalizeAndroidDeviceRole(device?.role) === "admin",
    now
  });
  if (!result.ok) {
    return result;
  }

  insertAndroidActionEvent(db, action, "menu.stock_image_import_applied", "stock_image_import", importId, {
    image_hash: imageHash,
    applied_line_count: result.appliedLineCount,
    total_quantity: result.totalQuantity
  }, now);
  return { ok: true, message: "Görsel stok girişi telefondan uygulandı." };
}
