import { ipcMain } from "electron";
import type {
  DesktopSetupData,
  DesktopSetupSaveResult,
  SaveInitialSetupInput
} from "../database";

export function registerSetupIpcHandlers(options: {
  assertUnlocked: () => void;
  getSetupData: () => DesktopSetupData;
  saveInitial: (input: SaveInitialSetupInput) => Promise<DesktopSetupSaveResult>;
}) {
  const { assertUnlocked, getSetupData, saveInitial } = options;

  ipcMain.handle("setup:getData", (): DesktopSetupData => {
    assertUnlocked();
    return getSetupData();
  });

  ipcMain.handle("setup:saveInitial", async (_event, input: SaveInitialSetupInput): Promise<DesktopSetupSaveResult> => {
    return saveInitial(input);
  });
}
