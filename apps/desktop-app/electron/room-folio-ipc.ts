import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type SaveRoomPublicDetailsInput } from "@yardimci-asistan/shared";
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
import { listRoomProfiles, saveRoomProfile } from "./room-profile";
import {
  assertPersistedBusinessCapability,
  hasPersistedBusinessCapability
} from "./business-capability-runtime";

type RoomFolioManualItemIpcInput = AddRoomFolioManualItemInput & {
  sourceTableOrderId?: string;
};

type RoomProfileIpcInput = SetRoomNightlyPriceInput & {
  name?: string;
  publicDetails?: SaveRoomPublicDetailsInput;
};

export function registerRoomFolioIpcHandlers(options: {
  databasePath: () => string;
  assertUnlocked: () => void;
  assertCapability?: () => void;
  assertRoomCapability?: () => void;
  hasFolioCapability?: () => boolean;
  canUseMenu?: () => boolean;
  assertMenuCapability?: () => void;
  assertOrderTransferCapability?: () => void;
  onMutation?: () => void;
}) {
  const service = () => new DesktopRoomFolioService(options.databasePath());
  const hasFolioCapability = () => options.hasFolioCapability?.()
    ?? hasPersistedBusinessCapability(options.databasePath(), BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO);
  const assertAccess = () => {
    options.assertUnlocked();
    options.assertCapability?.();
  };
  const assertRoomAccess = () => {
    options.assertUnlocked();
    if (options.assertRoomCapability) {
      options.assertRoomCapability();
      return;
    }
    assertPersistedBusinessCapability(
      options.databasePath(),
      BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS,
      "Oda yönetimi bu işletme profilinde etkin değil."
    );
  };
  const roomProfileData = (): DesktopRoomFolioData => ({
    generatedAt: new Date().toISOString(),
    rooms: listRoomProfiles(options.databasePath()),
    activeStays: [],
    folios: [],
    menuCategories: [],
    menuItems: []
  });
  const folioData = (): DesktopRoomFolioData => {
    const data = service().getData();
    return options.canUseMenu?.() === false
      ? { ...data, menuCategories: [], menuItems: [] }
      : data;
  };
  const finalize = (result: DesktopRoomFolioMutationResult): DesktopRoomFolioMutationResult => {
    if (result.ok) {
      options.onMutation?.();
    }
    return result;
  };

  ipcMain.handle("roomFolio:getData", (): DesktopRoomFolioData => {
    options.assertUnlocked();
    if (!hasFolioCapability()) {
      assertRoomAccess();
      return roomProfileData();
    }
    options.assertCapability?.();
    return folioData();
  });

  ipcMain.handle("roomFolio:setRoomNightlyPrice", (_event, input: RoomProfileIpcInput): DesktopRoomFolioMutationResult => {
    assertRoomAccess();

    const currentRoom = listRoomProfiles(options.databasePath()).find((room) => room.id === String(input?.roomId ?? "").trim());
    const roomName = input?.publicDetails?.name
      ?? (typeof input?.name === "string" ? input.name : currentRoom?.name ?? "");
    const result = saveRoomProfile(options.databasePath(), {
      roomId: input?.roomId,
      name: roomName,
      amountMinor: input?.amountMinor,
      currency: input?.currency,
      publicDetails: input?.publicDetails
    });
    if (!result.ok) {
      return result;
    }

    return finalize({
      ok: true,
      message: result.message,
      data: hasFolioCapability() ? folioData() : roomProfileData()
    });
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
