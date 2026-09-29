import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  DesktopAndroidDeviceMutationResult,
  DesktopAndroidPermissionGroupsUpdate,
  DesktopDatabase
} from "../database";
import type {
  DesktopAndroidInstallationSnapshot,
  DesktopAndroidInstallResult
} from "../android-installation-service";

export function registerAndroidDeviceIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  finalizeDeviceMutation: (result: DesktopAndroidDeviceMutationResult) => DesktopAndroidDeviceMutationResult;
  listInstallDevices: () => DesktopAndroidInstallationSnapshot;
  installOnDevice: (serial: string) => Promise<DesktopAndroidInstallResult>;
  provisionOnDevice: (serial: string) => Promise<DesktopAndroidInstallResult>;
}) {
  const {
    getDatabase,
    assertCapability,
    finalizeDeviceMutation,
    listInstallDevices,
    installOnDevice,
    provisionOnDevice
  } = options;

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

  ipcMain.handle("androidDevice:setPermissionGroupsBatch", (_event, updates: DesktopAndroidPermissionGroupsUpdate[]): DesktopAndroidDeviceMutationResult => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    return finalizeDeviceMutation(getDatabase().setAndroidDevicePermissionGroupsBatch(updates));
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

  ipcMain.handle("androidDevice:listInstallDevices", (): DesktopAndroidInstallationSnapshot => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android kurulumu bu işletmede etkin değil.");
    return listInstallDevices();
  });

  ipcMain.handle("androidDevice:install", async (_event, serial: unknown): Promise<DesktopAndroidInstallResult> => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android kurulumu bu işletmede etkin değil.");
    return installOnDevice(String(serial ?? ""));
  });

  ipcMain.handle("androidDevice:provision", async (_event, serial: unknown): Promise<DesktopAndroidInstallResult> => {
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android bağlantısı bu işletmede etkin değil.");
    return provisionOnDevice(String(serial ?? ""));
  });
}
