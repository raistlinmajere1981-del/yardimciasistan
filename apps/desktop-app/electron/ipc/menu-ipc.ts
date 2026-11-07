import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import { prepareProductImageForSave } from "../product-data-service";
import type {
  DesktopDatabase,
  DesktopMenuSaveResult,
  DesktopStatusUpdateResult,
  ReorderMenuRecordsInput,
  SaveMenuCategoryInput,
  SaveMenuProductEntryInput
} from "../database";

export function registerMenuIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  finalizeMutation: <T extends DesktopMenuSaveResult | DesktopStatusUpdateResult>(result: T) => T;
  scheduleSync: () => void;
}) {
  const { getDatabase, assertCapability, finalizeMutation, scheduleSync } = options;

  function assertMenuItemSubfeatureMutation(input: SaveMenuProductEntryInput) {
    const capabilities = new Set(getDatabase().getEnabledBusinessCapabilities());
    const itemId = input.id?.trim();
    const baseline = (itemId ? getDatabase().getMenuEntryMutationBaseline(itemId) : null) ?? {
      stock_consumption_quantity: 1,
      hide_when_out_of_stock: false
    };
    const stockChanged = Number(input.stock_consumption_quantity ?? 1) !== Number(baseline.stock_consumption_quantity)
      || Boolean(input.product && input.product.trackInventory !== false);
    if (stockChanged && !capabilities.has(BUSINESS_CAPABILITIES.INVENTORY)) {
      throw new Error("Stok alanları bu işletmede etkin değil.");
    }
    if (Boolean(input.hide_when_out_of_stock) !== Boolean(baseline.hide_when_out_of_stock)
        && (!capabilities.has(BUSINESS_CAPABILITIES.INVENTORY) || !capabilities.has(BUSINESS_CAPABILITIES.QR_MENU))) {
      throw new Error("Stokta yokken QR menüden gizleme bu işletmede etkin değil.");
    }
  }

  ipcMain.handle("menu:getWebPublication", () => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return { enabled: getDatabase().getQrMenuWebPublicationEnabled(),
      ordersEnabled: getDatabase().getQrTableOrderConfig().enabled, tables: getDatabase().listQrOrderTables() };
  });

  ipcMain.handle("menu:setWebPublication", (_event, enabled: unknown) => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.QR_MENU, "QR Menü modülü Ayarlar'dan etkinleştirilmelidir.");
    const current = getDatabase().getQrMenuWebPublicationEnabled();
    if (typeof enabled !== "boolean") {
      return { ok: false, message: "QR Menü web görünürlüğü geçersiz.", enabled: current };
    }
    try {
      getDatabase().setQrMenuWebPublicationEnabled(enabled);
      scheduleSync();
      return {
        ok: true,
        message: enabled ? "QR Menü webde görünür." : "QR Menü webde gizlendi.",
        enabled
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error && error.message ? error.message : "QR Menü web görünürlüğü kaydedilemedi.",
        enabled: current
      };
    }
  });

  ipcMain.handle("menu:setTableOrders", (_event, enabled: unknown) => {
    options.assertUnlocked();
    const current = getDatabase().getQrTableOrderConfig().enabled;
    if (typeof enabled !== "boolean") return { ok: false, message: "Masa siparişi seçimi geçersiz.", enabled: current, tables: getDatabase().listQrOrderTables() };
    if (enabled) {
      for (const capability of [BUSINESS_CAPABILITIES.REQUESTS, BUSINESS_CAPABILITIES.CUSTOMERS, BUSINESS_CAPABILITIES.QR_MENU, BUSINESS_CAPABILITIES.FOOD_TABLES, BUSINESS_CAPABILITIES.FOOD_ORDERS]) {
        assertCapability(capability, "QR masadan sipariş için QR Menü, masa yönetimi ve masa siparişleri etkin olmalı.");
      }
      if (!getDatabase().getQrMenuWebPublicationEnabled()) return { ok: false, message: "Önce QR Menü web yayınını açın.", enabled: current, tables: getDatabase().listQrOrderTables() };
    }
    try {
      getDatabase().setQrTableOrdersEnabled(enabled);
      scheduleSync();
      return { ok: true, message: enabled ? "Masadan sipariş açık." : "Masadan sipariş kapalı.", enabled,
        tables: getDatabase().listQrOrderTables() };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Sipariş ayarı kaydedilemedi.", enabled: current,
        tables: getDatabase().listQrOrderTables() };
    }
  });

  ipcMain.handle("menu:saveCategory", (_event, input: SaveMenuCategoryInput): DesktopMenuSaveResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return finalizeMutation(getDatabase().saveMenuCategory(input));
  });

  ipcMain.handle("menu:saveEntry", async (_event, input: SaveMenuProductEntryInput): Promise<DesktopMenuSaveResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    assertMenuItemSubfeatureMutation(input);
    const database = getDatabase();
    const image = input.product ? await prepareProductImageForSave(database.databasePath, input.product) : undefined;
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    assertMenuItemSubfeatureMutation(input);
    if (getDatabase() !== database) return { ok: false, message: "Ürün veritabanı değişti; yeniden yükleyin." };
    return finalizeMutation(database.saveMenuProductEntry(input, image));
  });

  ipcMain.handle("menu:reorder", (_event, input: ReorderMenuRecordsInput): DesktopStatusUpdateResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return finalizeMutation(getDatabase().reorderMenuRecords(input));
  });

  ipcMain.handle("menu:deleteCategory", (_event, categoryId: unknown): DesktopStatusUpdateResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return finalizeMutation(getDatabase().deleteMenuCategory(String(categoryId ?? "")));
  });

  ipcMain.handle("menu:removeEntry", (_event, itemId: unknown): DesktopStatusUpdateResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return finalizeMutation(getDatabase().deleteMenuProductEntry(String(itemId ?? "")));
  });
}
