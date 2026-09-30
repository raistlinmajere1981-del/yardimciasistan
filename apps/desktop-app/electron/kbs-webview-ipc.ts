import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "./database";
import type { EgmKbsSessionResult } from "./egm-kbs-webview-driver";
import { resolveKbsRuntimeCredentials, type SaveKbsSettingsInput } from "./kbs-settings";

export function registerKbsWebviewIpcEvents(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  isTrustedRendererUrl: (url: string) => boolean;
  attachWebview: (webContentsId: number) => boolean;
  detachWebview: (webContentsId: number) => void;
  inspect: () => Promise<EgmKbsSessionResult>;
  prepareLogin: (input: SaveKbsSettingsInput) => Promise<EgmKbsSessionResult>;
}) {
  const {
    getDatabase,
    assertUnlocked,
    assertCapability,
    isTrustedRendererUrl,
    attachWebview,
    detachWebview,
    inspect,
    prepareLogin
  } = options;

  ipcMain.on("kbs:registerWebview", (event, webContentsId: unknown) => {
    if (!isTrustedRendererUrl(event.sender.getURL())) return;
    const id = Number(webContentsId);
    if (!Number.isInteger(id) || id <= 0) return;
    attachWebview(id);
  });

  ipcMain.on("kbs:unregisterWebview", (event, webContentsId: unknown) => {
    if (!isTrustedRendererUrl(event.sender.getURL())) return;
    const id = Number(webContentsId);
    if (Number.isInteger(id) && id > 0) detachWebview(id);
  });

  ipcMain.handle("kbs:inspectEgmSession", async (event): Promise<EgmKbsSessionResult> => {
    if (!isTrustedRendererUrl(event.sender.getURL())) {
      return { ok: false, state: "unavailable", message: "EGM KBS oturum sorgusu reddedildi.", url: "" };
    }
    assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Konaklama yönetimi bu işletmede etkin değil.");
    return inspect();
  });

  ipcMain.handle(
    "kbs:prepareEgmLogin",
    async (event, input: SaveKbsSettingsInput): Promise<EgmKbsSessionResult> => {
      if (!isTrustedRendererUrl(event.sender.getURL())) {
        return { ok: false, state: "unavailable", message: "EGM KBS giriş isteği reddedildi.", url: "" };
      }
      assertUnlocked();
      assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Konaklama yönetimi bu işletmede etkin değil.");

      const resolved = resolveKbsRuntimeCredentials(getDatabase().databasePath, input);
      if (!resolved.ok) {
        return { ok: false, state: "login_required", message: resolved.message, url: "" };
      }
      if (resolved.credentials.provider !== "egm") {
        return { ok: false, state: "unknown", message: "EGM web oturumu yalnız Emniyet KBS sağlayıcısı için kullanılabilir.", url: "" };
      }
      return prepareLogin(input);
    }
  );
}
