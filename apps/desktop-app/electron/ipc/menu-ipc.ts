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
  finalizeRecordDeletion: (result: DesktopStatusUpdateResult) => DesktopStatusUpdateResult;
}) {
  const { getDatabase, assertCapability, assertMenuItemSubfeatureMutation, finalizeRecordDeletion } = options;

  ipcMain.handle("menu:saveCategory", (_event, input: SaveMenuCategoryInput): DesktopMenuSaveResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return getDatabase().saveMenuCategory(input);
  });

  ipcMain.handle("menu:saveItem", (_event, input: SaveMenuItemInput): DesktopMenuSaveResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    assertMenuItemSubfeatureMutation(input);
    return getDatabase().saveMenuItem(input);
  });

  ipcMain.handle("menu:reorder", (_event, input: ReorderMenuRecordsInput): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return getDatabase().reorderMenuRecords(input);
  });

  ipcMain.handle("menu:deleteCategory", (_event, categoryId: unknown): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return finalizeRecordDeletion(getDatabase().deleteMenuCategory(String(categoryId ?? "")));
  });

  ipcMain.handle("menu:deleteItem", (_event, itemId: unknown): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_MENU, "Menü yönetimi bu işletmede etkin değil.");
    return finalizeRecordDeletion(getDatabase().deleteMenuItem(String(itemId ?? "")));
  });
}
