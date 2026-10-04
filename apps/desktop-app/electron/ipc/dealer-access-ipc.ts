import { ipcMain } from "electron";
import type { DealerAccessAction } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";

export function registerDealerAccessIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  onCommit: () => void;
}) {
  ipcMain.handle("dealer:access:get", (_event, customerId: string) => {
    options.assertUnlocked();
    return options.getDatabase().getDealerWebAccess(customerId);
  });
  ipcMain.handle("dealer:access:change", (_event, customerId: string, action: DealerAccessAction) => {
    options.assertUnlocked();
    const result = options.getDatabase().changeDealerWebAccess(customerId, action);
    options.onCommit();
    return result;
  });
}
