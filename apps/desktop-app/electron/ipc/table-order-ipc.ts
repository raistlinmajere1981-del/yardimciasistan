import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  AddTableOrderItemInput,
  DesktopDatabase,
  DesktopTableOrder,
  DesktopTableOrderResult,
  UpdateTableOrderItemNoteInput,
  UpdateTableOrderItemQuantityInput,
  UpdateTableOrderStatusInput
} from "../database";

export function registerTableOrderIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
}) {
  const { getDatabase, assertCapability } = options;
  const assertFoodOrdersAccess = () => assertCapability(
    BUSINESS_CAPABILITIES.FOOD_ORDERS,
    "Sipariş yönetimi bu işletmede etkin değil."
  );

  ipcMain.handle("tableOrder:list", (): DesktopTableOrder[] => {
    assertFoodOrdersAccess();
    return getDatabase().listTableOrders();
  });

  ipcMain.handle("tableOrder:getActive", (_event, tableId: unknown): DesktopTableOrder | null => {
    assertFoodOrdersAccess();
    return typeof tableId === "string" ? getDatabase().getActiveTableOrder(tableId) : null;
  });

  ipcMain.handle("tableOrder:open", (_event, tableId: unknown): DesktopTableOrderResult => {
    assertFoodOrdersAccess();
    return typeof tableId === "string"
      ? getDatabase().openTableOrder(tableId)
      : invalidTableOrderPayload("Sipariş açmak için geçerli bir masa seçin.");
  });

  ipcMain.handle("tableOrder:addItem", (_event, input: unknown): DesktopTableOrderResult => {
    assertFoodOrdersAccess();
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Siparişe ürün eklemek için menü yönetimi etkin olmalı.");
    const parsedInput = parseAddTableOrderItemInput(input);
    return parsedInput
      ? getDatabase().addTableOrderItem(parsedInput)
      : invalidTableOrderPayload("Ürün ekleme bilgileri geçersiz.");
  });

  ipcMain.handle("tableOrder:updateItemQuantity", (_event, input: unknown): DesktopTableOrderResult => {
    assertFoodOrdersAccess();
    const parsedInput = parseUpdateTableOrderItemQuantityInput(input);
    return parsedInput
      ? getDatabase().updateTableOrderItemQuantity(parsedInput)
      : invalidTableOrderPayload("Ürün adedi bilgisi geçersiz.");
  });

  ipcMain.handle("tableOrder:updateItemNote", (_event, input: unknown): DesktopTableOrderResult => {
    assertFoodOrdersAccess();
    const parsedInput = parseUpdateTableOrderItemNoteInput(input);
    return parsedInput
      ? getDatabase().updateTableOrderItemNote(parsedInput)
      : invalidTableOrderPayload("Ürün notu bilgisi geçersiz.");
  });

  ipcMain.handle("tableOrder:removeItem", (_event, itemId: unknown): DesktopTableOrderResult => {
    assertFoodOrdersAccess();
    return typeof itemId === "string"
      ? getDatabase().removeTableOrderItem(itemId)
      : invalidTableOrderPayload("Silinecek sipariş satırı geçersiz.");
  });

  ipcMain.handle("tableOrder:updateStatus", (_event, input: unknown): DesktopTableOrderResult => {
    assertFoodOrdersAccess();
    const parsedInput = parseUpdateTableOrderStatusInput(input);
    return parsedInput
      ? getDatabase().updateTableOrderStatus(parsedInput)
      : invalidTableOrderPayload("Adisyon durumu bilgisi geçersiz.");
  });

  ipcMain.handle("tableOrder:close", (_event, input: unknown): DesktopTableOrderResult => {
    assertFoodOrdersAccess();
    const parsedInput = parseUpdateTableOrderStatusInput(input);
    return parsedInput
      ? getDatabase().closeTableOrder(parsedInput)
      : invalidTableOrderPayload("Adisyon kapatma bilgisi geçersiz.");
  });

  ipcMain.handle("tableOrder:recalculate", (_event, orderId: unknown): DesktopTableOrderResult => {
    assertFoodOrdersAccess();
    return typeof orderId === "string"
      ? getDatabase().recalculateTableOrderTotal(orderId)
      : invalidTableOrderPayload("Toplamı hesaplanacak adisyon geçersiz.");
  });
}

function invalidTableOrderPayload(message: string): DesktopTableOrderResult {
  return { ok: false, message };
}

function parseAddTableOrderItemInput(value: unknown): AddTableOrderItemInput | null {
  const record = toUnknownRecord(value);
  return record
    && typeof record.orderId === "string"
    && typeof record.menuItemId === "string"
    && typeof record.quantity === "number"
    && Number.isFinite(record.quantity)
    && typeof record.note === "string"
    ? {
        orderId: record.orderId,
        menuItemId: record.menuItemId,
        quantity: record.quantity,
        note: record.note
      }
    : null;
}

function parseUpdateTableOrderItemQuantityInput(value: unknown): UpdateTableOrderItemQuantityInput | null {
  const record = toUnknownRecord(value);
  return record
    && typeof record.itemId === "string"
    && typeof record.quantity === "number"
    && Number.isFinite(record.quantity)
    ? { itemId: record.itemId, quantity: record.quantity }
    : null;
}

function parseUpdateTableOrderItemNoteInput(value: unknown): UpdateTableOrderItemNoteInput | null {
  const record = toUnknownRecord(value);
  return record && typeof record.itemId === "string" && typeof record.note === "string"
    ? { itemId: record.itemId, note: record.note }
    : null;
}

function parseUpdateTableOrderStatusInput(value: unknown): UpdateTableOrderStatusInput | null {
  const record = toUnknownRecord(value);
  return record && typeof record.orderId === "string" && typeof record.status === "string"
    ? { orderId: record.orderId, status: record.status }
    : null;
}

function toUnknownRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
