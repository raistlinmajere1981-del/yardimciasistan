import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopKbsDeliveryMutationResult, DesktopStatusUpdateResult } from "./database-types";
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
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  deliverNotification: (notificationId: string) => Promise<DesktopKbsDeliveryMutationResult>;
  onSettingsSaved?: (settings: KbsSettings) => void | Promise<void>;
}) {
  const { getDatabase, assertUnlocked, assertCapability, deliverNotification, onSettingsSaved } = options;

  ipcMain.handle("kbs:getSettings", (): KbsSettings => {
    assertUnlocked();
    return getKbsSettings(getDatabase().databasePath);
  });

  ipcMain.handle(
    "kbs:saveSettings",
    async (_event, input: SaveKbsSettingsInput): Promise<KbsSettingsSaveResult> => {
      assertUnlocked();
      const result = saveKbsSettings(getDatabase().databasePath, input);
      if (result.ok) await onSettingsSaved?.(result.settings);
      return result;
    }
  );

  ipcMain.handle("kbs:markNotificationSentExternally", (_event, notificationId: unknown): DesktopStatusUpdateResult => {
    assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Konaklama yönetimi bu işletmede etkin değil.");
    return getDatabase().markKbsNotificationSentExternally(String(notificationId ?? ""));
  });

  ipcMain.handle("kbs:retryNotification", (_event, notificationId: unknown): DesktopStatusUpdateResult => {
    assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Konaklama yönetimi bu işletmede etkin değil.");
    return getDatabase().retryKbsNotification(String(notificationId ?? ""));
  });

  ipcMain.handle("kbs:sendNotification", async (_event, notificationId: unknown): Promise<DesktopKbsDeliveryMutationResult> => {
    assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Konaklama yönetimi bu işletmede etkin değil.");
    return deliverNotification(String(notificationId ?? ""));
  });

  ipcMain.handle(
    "kbs:testConnection",
    async (_event, input: SaveKbsSettingsInput): Promise<KbsConnectionTestResult> => {
      assertUnlocked();
      return testKbsConnection(getDatabase().databasePath, input);
    }
  );
}
