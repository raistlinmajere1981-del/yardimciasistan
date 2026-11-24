import { ipcMain } from "electron";
import {
  checkDesktopUpdate,
  downloadDesktopUpdate,
  getDesktopUpdateStatus,
  restartForPendingDesktopUpdate,
  saveDesktopUpdatePreferences,
  type DesktopUpdatePreferencesInput
} from "../desktop-update-service";

export function registerDesktopUpdateIpcHandlers(userDataPath: () => string, assertUnlocked: () => void) {
  const channels = [
    "update:getStatus",
    "update:check",
    "update:download",
    "update:savePreferences",
    "update:restartAndInstall"
  ];
  for (const channel of channels) ipcMain.removeHandler(channel);

  // Local read-only update status is available while locked; explicit network,
  // configuration and installer actions require the authoritative session.
  ipcMain.handle("update:getStatus", () => getDesktopUpdateStatus(userDataPath()));
  ipcMain.handle("update:check", (_event, force = true) => {
    assertUnlocked();
    return checkDesktopUpdate(userDataPath(), force === true);
  });
  ipcMain.handle("update:download", () => {
    assertUnlocked();
    return downloadDesktopUpdate(userDataPath());
  });
  ipcMain.handle(
    "update:savePreferences",
    (_event, input: DesktopUpdatePreferencesInput) => {
      assertUnlocked();
      return saveDesktopUpdatePreferences(userDataPath(), input);
    }
  );
  ipcMain.handle("update:restartAndInstall", () => {
    assertUnlocked();
    return restartForPendingDesktopUpdate(userDataPath());
  });
}
