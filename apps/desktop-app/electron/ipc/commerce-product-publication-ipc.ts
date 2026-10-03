import { ipcMain } from "electron";
import type { SaveCommerceProductPublicationInput } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { desktopLog } from "../desktop-logger";

export function registerCommerceProductPublicationIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  onCommit: () => void;
}) {
  ipcMain.handle("commerce:productPublication:get", (_event, productId: string) => {
    options.assertUnlocked();
    return options.getDatabase().getCommerceProductPublication(productId);
  });
  ipcMain.handle("commerce:productPublication:save", (_event, input: SaveCommerceProductPublicationInput) => {
    options.assertUnlocked();
    try {
      const publication = options.getDatabase().saveCommerceProductPublication(input);
      options.onCommit();
      return publication;
    } catch (error) {
      desktopLog.warn({
        scope: "commerce-publication", event: "commerce-publication.save.failed",
        message: "Ürün web yayın tercihi kaydedilemedi.", error
      });
      throw error;
    }
  });
}
