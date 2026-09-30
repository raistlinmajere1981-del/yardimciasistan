import { ipcMain } from "electron";
import type { DesktopDatabase } from "./database";
import {
  getKbsSettings,
  saveKbsSettings,
  testKbsConnection,
  type KbsConnectionTestResult,
  type KbsSettings,
  type KbsSettingsSaveResult,
  type SaveKbsSettingsInput
} from "./kbs-settings";

export function registerKbsSettingsIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
}) {
  const { getDatabase, assertUnlocked } = options;

  ipcMain.handle("kbs:getSettings", (): KbsSettings => {
    assertUnlocked();
    return getKbsSettings(getDatabase().databasePath);
  });

  ipcMain.handle(
    "kbs:saveSettings",
    (_event, input: SaveKbsSettingsInput): KbsSettingsSaveResult => {
      assertUnlocked();
      return saveKbsSettings(getDatabase().databasePath, input);
    }
  );

  ipcMain.handle(
    "kbs:testConnection",
    async (_event, input: SaveKbsSettingsInput): Promise<KbsConnectionTestResult> => {
      assertUnlocked();
      return testKbsConnection(getDatabase().databasePath, input);
    }
  );
}
