import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  DesktopAndroidDeviceMutationResult,
  DesktopDatabase
} from "../database";
import type { LocalCompanionPairingSession } from "../local-companion-pairing-service";

export function registerAndroidDeviceIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  finalizeDeviceMutation: (result: DesktopAndroidDeviceMutationResult) => DesktopAndroidDeviceMutationResult;
  beginLocalPairing: () => LocalCompanionPairingSession;
}) {
  const { getDatabase, assertCapability, finalizeDeviceMutation, beginLocalPairing } = options;

  ipcMain.handle("androidDevice:beginLocalPairing", (): LocalCompanionPairingSession => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz eşleştirmesi bu işletmede etkin değil.");
    return beginLocalPairing();
  });

  ipcMain.handle("androidDevice:setRole", (_event, deviceId: unknown, role: unknown): DesktopAndroidDeviceMutationResult => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    const result = getDatabase().setAndroidDeviceRole(String(deviceId ?? ""), String(role ?? ""));
    return finalizeDeviceMutation(result);
  });

  ipcMain.handle("androidDevice:setPermissionGroups", (_event, deviceId: unknown, groups: unknown): DesktopAndroidDeviceMutationResult => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    const result = getDatabase().setAndroidDevicePermissionGroups(String(deviceId ?? ""), groups);
    return finalizeDeviceMutation(result);
  });

  ipcMain.handle("androidDevice:setActive", (_event, deviceId: unknown, active: unknown): DesktopAndroidDeviceMutationResult => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    const result = getDatabase().setAndroidDeviceActive(String(deviceId ?? ""), active === true);
    return finalizeDeviceMutation(result);
  });

  ipcMain.handle("androidDevice:resetPermissions", (_event, deviceId: unknown): DesktopAndroidDeviceMutationResult => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    return finalizeDeviceMutation(getDatabase().resetAndroidDevicePermissions(String(deviceId ?? "")));
  });

  ipcMain.handle("androidDevice:revoke", (_event, deviceId: unknown): DesktopAndroidDeviceMutationResult => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    return finalizeDeviceMutation(getDatabase().revokeAndroidDevice(String(deviceId ?? "")));
  });
}
