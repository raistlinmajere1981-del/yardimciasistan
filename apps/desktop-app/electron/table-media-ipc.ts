import { BrowserWindow, ipcMain } from "electron";
import {
  BUSINESS_CAPABILITIES,
  type AddTableMediaInput,
  type BusinessCapability,
  type DeleteTableMediaInput,
  type TableMediaAsset,
  type TableMediaDraftResult,
  type TableMediaDraftState,
  type TableMediaMutationResult,
  type UpdateTableMediaInput
} from "@yardimci-asistan/shared";
import {
  addTableMediaFromDialog,
  commitTableMediaDraft,
  deleteTableMedia,
  discardTableMediaDraft,
  getTableMediaDraftState,
  listTableMedia,
  updateTableMedia
} from "./table-media-service";

export function registerTableMediaIpcHandlers(options: {
  userDataPath: () => string;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  onCommit?: () => void;
}) {
  ipcMain.handle("tableMedia:list", (_event, tableId: string): TableMediaAsset[] => {
    options.assertUnlocked();
    options.assertCapability(BUSINESS_CAPABILITIES.FOOD_TABLES, "Masa medyası bu işletmede etkin değil.");
    return listTableMedia(options.userDataPath(), tableId);
  });

  ipcMain.handle("tableMedia:draftState", (): TableMediaDraftState => {
    options.assertUnlocked();
    options.assertCapability(BUSINESS_CAPABILITIES.FOOD_TABLES, "Masa medyası bu işletmede etkin değil.");
    return getTableMediaDraftState(options.userDataPath());
  });

  ipcMain.handle("tableMedia:commitDraft", (): TableMediaDraftResult => {
    options.assertUnlocked();
    options.assertCapability(BUSINESS_CAPABILITIES.FOOD_TABLES, "Masa medyası bu işletmede etkin değil.");
    const result = commitTableMediaDraft(options.userDataPath());
    if (result.ok && result.changed) options.onCommit?.();
    return result;
  });

  ipcMain.handle("tableMedia:discardDraft", (): TableMediaDraftResult => {
    options.assertUnlocked();
    options.assertCapability(BUSINESS_CAPABILITIES.FOOD_TABLES, "Masa medyası bu işletmede etkin değil.");
    return discardTableMediaDraft(options.userDataPath());
  });

  ipcMain.handle(
    "tableMedia:add",
    async (event, input: AddTableMediaInput): Promise<TableMediaMutationResult> => {
      options.assertUnlocked();
      options.assertCapability(BUSINESS_CAPABILITIES.FOOD_TABLES, "Masa medyası bu işletmede etkin değil.");
      return addTableMediaFromDialog(
        options.userDataPath(),
        BrowserWindow.fromWebContents(event.sender),
        input
      );
    }
  );

  ipcMain.handle(
    "tableMedia:update",
    (_event, input: UpdateTableMediaInput): TableMediaMutationResult => {
      options.assertUnlocked();
      options.assertCapability(BUSINESS_CAPABILITIES.FOOD_TABLES, "Masa medyası bu işletmede etkin değil.");
      return updateTableMedia(options.userDataPath(), input);
    }
  );

  ipcMain.handle(
    "tableMedia:delete",
    (_event, input: DeleteTableMediaInput): TableMediaMutationResult => {
      options.assertUnlocked();
      options.assertCapability(BUSINESS_CAPABILITIES.FOOD_TABLES, "Masa medyası bu işletmede etkin değil.");
      return deleteTableMedia(options.userDataPath(), input);
    }
  );
}
