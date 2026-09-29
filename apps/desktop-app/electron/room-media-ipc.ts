import { BrowserWindow, ipcMain } from "electron";
import {
  BUSINESS_CAPABILITIES,
  type AddRoomMediaInput,
  type BusinessCapability,
  type DeleteRoomMediaInput,
  type RoomMediaAsset,
  type RoomMediaDraftResult,
  type RoomMediaDraftState,
  type RoomMediaMutationResult,
  type UpdateRoomMediaInput
} from "@yardimci-asistan/shared";
import {
  addRoomMediaFromDialog,
  commitRoomMediaDraft,
  deleteRoomMedia,
  discardRoomMediaDraft,
  getRoomMediaDraftState,
  listRoomMedia,
  updateRoomMedia
} from "./room-media-service";

export function registerRoomMediaIpcHandlers(options: {
  userDataPath: () => string;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  onCommit?: () => void;
}) {
  ipcMain.handle("roomMedia:list", (_event, roomId: string): RoomMediaAsset[] => {
    options.assertUnlocked();
    options.assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda medyası bu işletmede etkin değil.");
    return listRoomMedia(options.userDataPath(), roomId);
  });

  ipcMain.handle("roomMedia:draftState", (): RoomMediaDraftState => {
    options.assertUnlocked();
    options.assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda medyası bu işletmede etkin değil.");
    return getRoomMediaDraftState(options.userDataPath());
  });

  ipcMain.handle("roomMedia:commitDraft", (): RoomMediaDraftResult => {
    options.assertUnlocked();
    options.assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda medyası bu işletmede etkin değil.");
    const result = commitRoomMediaDraft(options.userDataPath());
    if (result.ok && result.changed) options.onCommit?.();
    return result;
  });

  ipcMain.handle("roomMedia:discardDraft", (): RoomMediaDraftResult => {
    options.assertUnlocked();
    options.assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda medyası bu işletmede etkin değil.");
    return discardRoomMediaDraft(options.userDataPath());
  });

  ipcMain.handle(
    "roomMedia:add",
    async (event, input: AddRoomMediaInput): Promise<RoomMediaMutationResult> => {
      options.assertUnlocked();
      options.assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda medyası bu işletmede etkin değil.");
      const result = await addRoomMediaFromDialog(
        options.userDataPath(),
        BrowserWindow.fromWebContents(event.sender),
        input
      );
      return result;
    }
  );

  ipcMain.handle(
    "roomMedia:update",
    (_event, input: UpdateRoomMediaInput): RoomMediaMutationResult => {
      options.assertUnlocked();
      options.assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda medyası bu işletmede etkin değil.");
      const result = updateRoomMedia(options.userDataPath(), input);
      return result;
    }
  );

  ipcMain.handle(
    "roomMedia:delete",
    (_event, input: DeleteRoomMediaInput): RoomMediaMutationResult => {
      options.assertUnlocked();
      options.assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda medyası bu işletmede etkin değil.");
      const result = deleteRoomMedia(options.userDataPath(), input);
      return result;
    }
  );
}
