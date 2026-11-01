import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type { LocalCompanionPairingService } from "../local-companion-pairing-service";
import type {
  DesktopAndroidDeviceMutationResult,
  DesktopAndroidPermissionGroupsUpdate,
  DesktopDatabase
} from "../database";

export function registerAndroidDeviceIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  getLocalPairingService: () => LocalCompanionPairingService;
  prepareLocalPairing: () => Promise<void>;
  getLocalPairingEndpoint: () => string;
  getLocalPairingSpkiSha256: () => string;
  isTrustedRendererUrl: (url: string) => boolean;
  finalizeDeviceMutation: (result: DesktopAndroidDeviceMutationResult) => DesktopAndroidDeviceMutationResult;
}) {
  const {
    getDatabase,
    assertCapability,
    finalizeDeviceMutation
  } = options;

  const assertPairingAccess = (event: Electron.IpcMainInvokeEvent) => {
    if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame
        || !options.isTrustedRendererUrl(event.senderFrame.url)) {
      throw new Error("Eşleştirme yalnız güvenilir masaüstü penceresinden yönetilebilir.");
    }
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android bağlantısı bu işletmede etkin değil.");
    if (getDatabase().getSetupData().localNetworkEnabled === false) {
      throw new Error("Yerel ağ bağlantısı masaüstü ayarlarından kapatılmış.");
    }
  };
  let pairingGeneration = 0;
  ipcMain.handle("androidDevice:beginLocalPairing", async (event, deviceId: unknown) => {
    assertPairingAccess(event);
    const generation = ++pairingGeneration;
    options.getLocalPairingService().cancel();
    await options.prepareLocalPairing();
    // Lock/settings/cancellation may change during keystore access or SAN renewal.
    assertPairingAccess(event);
    if (generation !== pairingGeneration) throw new Error("local_pairing_cancelled");
    const endpoint = options.getLocalPairingEndpoint();
    const spkiSha256 = options.getLocalPairingSpkiSha256();
    if (!endpoint.startsWith("https://") || !/^[A-Za-z0-9_-]{43}$/.test(spkiSha256)) {
      throw new Error("local_secure_pairing_unavailable");
    }
    return { ...options.getLocalPairingService().begin(deviceId), endpoint, spkiSha256 };
  });
  ipcMain.handle("androidDevice:readLocalPairing", (event) => {
    assertPairingAccess(event);
    const session = options.getLocalPairingService().read();
    return session ? { ...session, endpoint: options.getLocalPairingEndpoint(), spkiSha256: options.getLocalPairingSpkiSha256() } : null;
  });
  ipcMain.handle("androidDevice:cancelLocalPairing", (event) => {
    assertPairingAccess(event);
    pairingGeneration++;
    options.getLocalPairingService().cancel();
  });

  ipcMain.handle("androidDevice:setRole", (_event, deviceId: unknown, role: unknown): DesktopAndroidDeviceMutationResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    const result = getDatabase().setAndroidDeviceRole(String(deviceId ?? ""), String(role ?? ""));
    return finalizeDeviceMutation(result);
  });

  ipcMain.handle("androidDevice:setPermissionGroupsBatch", (_event, updates: DesktopAndroidPermissionGroupsUpdate[]): DesktopAndroidDeviceMutationResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    return finalizeDeviceMutation(getDatabase().setAndroidDevicePermissionGroupsBatch(updates));
  });

  ipcMain.handle("androidDevice:setActive", (_event, deviceId: unknown, active: unknown): DesktopAndroidDeviceMutationResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    const result = getDatabase().setAndroidDeviceActive(String(deviceId ?? ""), active === true);
    return finalizeDeviceMutation(result);
  });

  ipcMain.handle("androidDevice:resetPermissions", (_event, deviceId: unknown): DesktopAndroidDeviceMutationResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    return finalizeDeviceMutation(getDatabase().resetAndroidDevicePermissions(String(deviceId ?? "")));
  });

  ipcMain.handle("androidDevice:revoke", (_event, deviceId: unknown): DesktopAndroidDeviceMutationResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ANDROID, "Android cihaz yönetimi bu işletmede etkin değil.");
    return finalizeDeviceMutation(getDatabase().revokeAndroidDevice(String(deviceId ?? "")));
  });
}
