import { ipcMain } from "electron";
import {
  getBusinessLayout,
  saveBusinessLayout,
  type BusinessLayoutSaveResult,
  type BusinessLayoutSnapshot,
  type SaveBusinessLayoutInput
} from "./business-layout";

export function registerBusinessLayoutIpcHandlers(options: {
  databasePath: () => string;
  assertUnlocked: () => void;
  onMutation?: () => void;
}) {
  ipcMain.handle("businessLayout:get", (): BusinessLayoutSnapshot => {
    options.assertUnlocked();
    return getBusinessLayout(options.databasePath());
  });

  ipcMain.handle(
    "businessLayout:save",
    (_event, input: SaveBusinessLayoutInput): BusinessLayoutSaveResult => {
      options.assertUnlocked();
      const result = saveBusinessLayout(options.databasePath(), input ?? {});
      if (result.ok) {
        options.onMutation?.();
      }
      return result;
    }
  );
}
