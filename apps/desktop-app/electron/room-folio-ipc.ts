import { ipcMain } from "electron";
import {
  DesktopRoomFolioService,
  type AddRoomFolioManualItemInput,
  type AddRoomFolioMenuItemInput,
  type AddRoomFolioPaymentInput,
  type CheckoutRoomFolioInput,
  type DesktopRoomFolioData,
  type DesktopRoomFolioMutationResult,
  type SetRoomNightlyPriceInput,
  type UpdateRoomFolioDetailsInput,
  type UpdateRoomFolioItemQuantityInput
} from "./room-folio";

export function registerRoomFolioIpcHandlers(options: {
  databasePath: () => string;
  assertUnlocked: () => void;
}) {
  const service = () => new DesktopRoomFolioService(options.databasePath());

  ipcMain.handle("roomFolio:getData", (): DesktopRoomFolioData => {
    options.assertUnlocked();
    return service().getData();
  });

  ipcMain.handle("roomFolio:setRoomNightlyPrice", (_event, input: SetRoomNightlyPriceInput): DesktopRoomFolioMutationResult => {
    options.assertUnlocked();
    return service().setRoomNightlyPrice(input);
  });

  ipcMain.handle("roomFolio:open", (_event, stayId: string): DesktopRoomFolioMutationResult => {
    options.assertUnlocked();
    return service().openFolio(stayId);
  });

  ipcMain.handle("roomFolio:updateDetails", (_event, input: UpdateRoomFolioDetailsInput): DesktopRoomFolioMutationResult => {
    options.assertUnlocked();
    return service().updateFolioDetails(input);
  });

  ipcMain.handle("roomFolio:addMenuItem", (_event, input: AddRoomFolioMenuItemInput): DesktopRoomFolioMutationResult => {
    options.assertUnlocked();
    return service().addMenuItem(input);
  });

  ipcMain.handle("roomFolio:updateItemQuantity", (_event, input: UpdateRoomFolioItemQuantityInput): DesktopRoomFolioMutationResult => {
    options.assertUnlocked();
    return service().updateItemQuantity(input);
  });

  ipcMain.handle("roomFolio:addManualItem", (_event, input: AddRoomFolioManualItemInput): DesktopRoomFolioMutationResult => {
    options.assertUnlocked();
    return service().addManualItem(input);
  });

  ipcMain.handle("roomFolio:removeItem", (_event, itemId: string): DesktopRoomFolioMutationResult => {
    options.assertUnlocked();
    return service().removeItem(itemId);
  });

  ipcMain.handle("roomFolio:addPayment", (_event, input: AddRoomFolioPaymentInput): DesktopRoomFolioMutationResult => {
    options.assertUnlocked();
    return service().addPayment(input);
  });

  ipcMain.handle("roomFolio:voidPayment", (_event, paymentId: string): DesktopRoomFolioMutationResult => {
    options.assertUnlocked();
    return service().voidPayment(paymentId);
  });

  ipcMain.handle("roomFolio:checkout", (_event, input: CheckoutRoomFolioInput): DesktopRoomFolioMutationResult => {
    options.assertUnlocked();
    return service().checkout(input);
  });
}
