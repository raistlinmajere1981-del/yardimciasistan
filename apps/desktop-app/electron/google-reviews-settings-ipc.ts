import { ipcMain } from "electron";
import type { DesktopDatabase } from "./database";
import {
  getGoogleReviewsSettings,
  publishGoogleReviewsSettings,
  saveGoogleReviewsSettings,
  testGoogleReviewsConnection,
  type GoogleReviewsConnectionTestResult,
  type GoogleReviewsSettings,
  type GoogleReviewsSettingsSaveResult,
  type SaveGoogleReviewsSettingsInput
} from "./google-reviews-settings";
import { getWebSyncConfig } from "./sync-config";

export function registerGoogleReviewsSettingsIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
}) {
  const { getDatabase, assertUnlocked } = options;

  ipcMain.handle("googleReviews:getSettings", (): GoogleReviewsSettings => {
    assertUnlocked();
    return getGoogleReviewsSettings(getDatabase().databasePath);
  });

  ipcMain.handle(
    "googleReviews:testConnection",
    async (_event, input: Pick<SaveGoogleReviewsSettingsInput, "placeId" | "apiKey" | "clearApiKey">): Promise<GoogleReviewsConnectionTestResult> => {
      assertUnlocked();
      const database = getDatabase();
      return testGoogleReviewsConnection(
        database.databasePath,
        input,
        getWebSyncConfig(database.getSetupData()),
        database.getSyncRuntimeStatus().clientId
      );
    }
  );

  ipcMain.handle(
    "googleReviews:saveSettings",
    async (_event, input: SaveGoogleReviewsSettingsInput): Promise<GoogleReviewsSettingsSaveResult> => {
      assertUnlocked();
      const database = getDatabase();
      const local = saveGoogleReviewsSettings(database.databasePath, input);
      if (!local.ok) return local;

      const publication = await publishGoogleReviewsSettings(
        database.databasePath,
        getWebSyncConfig(database.getSetupData()),
        database.getSyncRuntimeStatus().clientId
      );
      if (!publication.ok) {
        return {
          ok: true,
          warning: true,
          message: `${local.message} Web yayını tamamlanamadı: ${publication.message}`,
          settings: getGoogleReviewsSettings(database.databasePath)
        };
      }

      return {
        ok: true,
        message: `${local.message} ${publication.message}`,
        settings: getGoogleReviewsSettings(database.databasePath)
      };
    }
  );
}
