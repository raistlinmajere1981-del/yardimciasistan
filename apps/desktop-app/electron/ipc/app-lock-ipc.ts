import { ipcMain } from "electron";
import type { AppLockActionResult, AppLockStatus } from "../app-lock";
import type { DesktopAppLockService } from "../app-lock-service";

export function registerAppLockIpcHandlers(service: DesktopAppLockService) {
  ipcMain.handle("appLock:getStatus", (): AppLockStatus => service.getStatus());

  ipcMain.handle("appLock:lock", (): AppLockActionResult => service.lock());

  ipcMain.handle("appLock:unlock", async (_event, passwordValue: unknown): Promise<AppLockActionResult> => {
    return service.unlock(passwordValue);
  });

  ipcMain.handle(
    "appLock:updatePassword",
    async (_event, inputValue: unknown): Promise<AppLockActionResult> => {
      return service.updatePassword(inputValue);
    }
  );

  ipcMain.handle(
    "appLock:resetWithWebSecurityKey",
    (_event, webSecurityKeyValue: unknown): AppLockActionResult => {
      return service.resetWithWebSecurityKey(webSecurityKeyValue);
    }
  );
}
