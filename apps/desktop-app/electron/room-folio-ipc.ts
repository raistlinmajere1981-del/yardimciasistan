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
import { transferTableOrderToRoomFolio } from "./room-folio-order-transfer";
import { saveRoomProfile } from "./room-profile";

type RoomFolioManualItemIpcInput = AddRoomFolioManualItemInput & {
  sourceTableOrderId?: string;
};

export function registerRoomFolioIpcHandlers(options: {
  databasePath: () => string;
  assertUnlocked: () => void;
  assertCapability?: () => void;
  canUseMenu?: () => boolean;
  assertMenuCapability?: () => void;
  assertOrderTransferCapability?: () => void;
  onMutation?: () => void;
}) {
  const service = () => new DesktopRoomFolioService(options.databasePath());
  const assertAccess = () => {
    options.assertUnlocked();
    options.assertCapability?.();
  };
  const finalize = (result: DesktopRoomFolioMutationResult): DesktopRoomFolioMutationResult => {
    if (result.ok) {
      options.onMutation?.();
    }
    return result;
  };

  ipcMain.handle("roomFolio:getData", (): DesktopRoomFolioData => {
    assertAccess();
    const data = service().getData();
    return options.canUseMenu?.() === false
      ? { ...data, menuCategories: [], menuItems: [] }
      : data;
  });

  ipcMain.handle("roomFolio:setRoomNightlyPrice", (_event, input: SetRoomNightlyPriceInput & { name?: string }): DesktopRoomFolioMutationResult => {
    assertAccess();

    if (typeof input?.name === "string") {
      const result = saveRoomProfile(options.databasePath(), {
        roomId: input.roomId,
        name: input.name,
        amountMinor: input.amountMinor,
        currency: input.currency
      });
      if (!result.ok) {
        return result;
      }
      return finalize({ ok: true, message: result.message, data: service().getData() });
    }

    return finalize(service().setRoomNightlyPrice(input));
  });

  ipcMain.handle("roomFolio:open", (_event, stayId: string): DesktopRoomFolioMutationResult => {
    assertAccess();
    return finalize(service().openFolio(stayId));
  });

  ipcMain.handle("roomFolio:updateDetails", (_event, input: UpdateRoomFolioDetailsInput): DesktopRoomFolioMutationResult => {
    assertAccess();
    return finalize(service().updateFolioDetails(input));
  });

  ipcMain.handle("roomFolio:addMenuItem", (_event, input: AddRoomFolioMenuItemInput): DesktopRoomFolioMutationResult => {
    assertAccess();
    options.assertMenuCapability?.();
    return finalize(service().addMenuItem(input));
  });

  ipcMain.handle("roomFolio:updateItemQuantity", (_event, input: UpdateRoomFolioItemQuantityInput): DesktopRoomFolioMutationResult => {
    assertAccess();
    return finalize(service().updateItemQuantity(input));
  });

  ipcMain.handle("roomFolio:addManualItem", (_event, input: RoomFolioManualItemIpcInput): DesktopRoomFolioMutationResult => {
    assertAccess();
    const sourceTableOrderId = typeof input?.sourceTableOrderId === "string" ? input.sourceTableOrderId.trim() : "";
    if (sourceTableOrderId) {
      options.assertOrderTransferCapability?.();
      return finalize(transferTableOrderToRoomFolio(options.databasePath(), {
        folioId: input.folioId,
        tableOrderId: sourceTableOrderId
      }));
    }
    return finalize(service().addManualItem(input));
  });

  ipcMain.handle("roomFolio:removeItem", (_event, itemId: string): DesktopRoomFolioMutationResult => {
    assertAccess();
    return finalize(service().removeItem(itemId));
  });

  ipcMain.handle("roomFolio:addPayment", (_event, input: AddRoomFolioPaymentInput): DesktopRoomFolioMutationResult => {
    assertAccess();
    return finalize(service().addPayment(input));
  });

  ipcMain.handle("roomFolio:voidPayment", (_event, paymentId: string): DesktopRoomFolioMutationResult => {
    assertAccess();
    return finalize(service().voidPayment(paymentId));
  });

  ipcMain.handle("roomFolio:checkout", (_event, input: CheckoutRoomFolioInput): DesktopRoomFolioMutationResult => {
    assertAccess();
    return finalize(service().checkout(input));
  });
}
