import { BrowserWindow, ipcMain } from "electron";
import {
  BUSINESS_CAPABILITIES,
  type AddRoomMediaInput,
  type BusinessCapability,
  type DeleteRoomMediaInput,
  type RoomMediaAsset,
  type RoomMediaMutationResult,
  type UpdateRoomMediaInput
} from "@yardimci-asistan/shared";
import {
  addRoomMediaFromDialog,
  deleteRoomMedia,
  listRoomMedia,
  updateRoomMedia
} from "./room-media-service";

export function registerRoomMediaIpcHandlers(options: {
  userDataPath: () => string;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  onMutation?: () => void;
}) {
  ipcMain.handle("roomMedia:list", (_event, roomId: string): RoomMediaAsset[] => {
    options.assertUnlocked();
    options.assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda medyası bu işletmede etkin değil.");
    return listRoomMedia(options.userDataPath(), roomId);
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
      if (result.ok && !result.message.includes("iptal")) options.onMutation?.();
      return result;
    }
  );

  ipcMain.handle(
    "roomMedia:update",
    (_event, input: UpdateRoomMediaInput): RoomMediaMutationResult => {
      options.assertUnlocked();
      options.assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda medyası bu işletmede etkin değil.");
      const result = updateRoomMedia(options.userDataPath(), input);
      if (result.ok) options.onMutation?.();
      return result;
    }
  );

  ipcMain.handle(
    "roomMedia:delete",
    (_event, input: DeleteRoomMediaInput): RoomMediaMutationResult => {
      options.assertUnlocked();
      options.assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda medyası bu işletmede etkin değil.");
      const result = deleteRoomMedia(options.userDataPath(), input);
      if (result.ok) options.onMutation?.();
      return result;
    }
  );
}
