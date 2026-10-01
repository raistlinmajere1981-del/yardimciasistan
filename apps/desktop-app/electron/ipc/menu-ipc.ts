import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  DesktopDatabase,
  DesktopMenuSaveResult,
  DesktopStatusUpdateResult,
  ReorderMenuRecordsInput,
  SaveMenuCategoryInput,
  SaveMenuItemInput
} from "../database";

export function registerMenuIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  assertMenuItemSubfeatureMutation: (input: SaveMenuItemInput) => void;
  finalizeMutation: <T extends DesktopMenuSaveResult | DesktopStatusUpdateResult>(result: T) => T;
  scheduleSync: () => void;
}) {
  const { getDatabase, assertCapability, assertMenuItemSubfeatureMutation, finalizeMutation, scheduleSync } = options;

  ipcMain.handle("menu:getWebPublication", () => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return { enabled: getDatabase().getQrMenuWebPublicationEnabled() };
  });

  ipcMain.handle("menu:setWebPublication", (_event, enabled: unknown) => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.QR_MENU, "QR Menü modülü Ayarlar'dan etkinleştirilmelidir.");
    const current = getDatabase().getQrMenuWebPublicationEnabled();
    if (typeof enabled !== "boolean") {
      return { ok: false, message: "QR Menü web görünürlüğü geçersiz.", enabled: current };
    }
    try {
      getDatabase().setQrMenuWebPublicationEnabled(enabled);
      getDatabase().queueSyncJob("menu_publish");
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

  ipcMain.handle("menu:saveCategory", (_event, input: SaveMenuCategoryInput): DesktopMenuSaveResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return finalizeMutation(getDatabase().saveMenuCategory(input));
  });

  ipcMain.handle("menu:saveItem", (_event, input: SaveMenuItemInput): DesktopMenuSaveResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    assertMenuItemSubfeatureMutation(input);
    return finalizeMutation(getDatabase().saveMenuItem(input));
  });

  ipcMain.handle("menu:reorder", (_event, input: ReorderMenuRecordsInput): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return finalizeMutation(getDatabase().reorderMenuRecords(input));
  });

  ipcMain.handle("menu:deleteCategory", (_event, categoryId: unknown): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return finalizeMutation(getDatabase().deleteMenuCategory(String(categoryId ?? "")));
  });

  ipcMain.handle("menu:deleteItem", (_event, itemId: unknown): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return finalizeMutation(getDatabase().deleteMenuItem(String(itemId ?? "")));
  });
}
