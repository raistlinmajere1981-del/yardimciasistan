import { ipcMain } from "electron";
import type { BusinessPublicProfile, SaveBusinessPublicProfileInput } from "@yardimci-asistan/shared";
import {
  getBusinessPublicProfile,
  saveBusinessPublicProfile,
  type BusinessPublicProfileSaveResult
} from "./business-public-profile";

export function registerBusinessPublicProfileIpcHandlers(options: {
  databasePath: () => string;
  assertUnlocked: () => void;
  onMutation?: () => void;
}) {
  ipcMain.handle("businessPublicProfile:get", (): BusinessPublicProfile => {
    options.assertUnlocked();
    return getBusinessPublicProfile(options.databasePath());
  });

  ipcMain.handle(
    "businessPublicProfile:save",
    (_event, input: SaveBusinessPublicProfileInput): BusinessPublicProfileSaveResult => {
      options.assertUnlocked();
      const result = saveBusinessPublicProfile(options.databasePath(), input);
      if (result.ok) {
        options.onMutation?.();
      }
      return result;
    }
  );
}
