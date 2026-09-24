import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  DeleteWhatsAppMessageInput,
  DesktopBirthdayPrepareResult,
  DesktopDatabase,
  DesktopStatusUpdateResult,
  MarkWhatsAppMessageSentInput
} from "../database";

export function registerWhatsAppIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  finalizeRecordDeletion: (result: DesktopStatusUpdateResult) => DesktopStatusUpdateResult;
}) {
  const { getDatabase, assertCapability, finalizeRecordDeletion } = options;

  ipcMain.handle("birthday:prepareWhatsApp", (_event, customerId: unknown): DesktopBirthdayPrepareResult => {
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.WHATSAPP, "WhatsApp bu işletmede etkin değil.");
    return getDatabase().prepareBirthdayWhatsApp(String(customerId ?? ""));
  });

  ipcMain.handle("whatsapp:markMessageSent", (_event, input: MarkWhatsAppMessageSentInput): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri talepleri bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.WHATSAPP, "WhatsApp bu işletmede etkin değil.");
    return getDatabase().markWhatsAppMessageSent(input);
  });

  ipcMain.handle("whatsapp:deleteMessage", (_event, input: DeleteWhatsAppMessageInput): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri talepleri bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.WHATSAPP, "WhatsApp bu işletmede etkin değil.");
    return finalizeRecordDeletion(getDatabase().deleteWhatsAppMessage(input));
  });
}

export function registerWhatsAppWebviewIpcEvents(options: {
  isTrustedRendererUrl: (url: string) => boolean;
  attachWebview: (webContentsId: number) => boolean;
  detachWebview: (webContentsId: number) => void;
  setUserBusy: (busy: boolean) => void;
  takeoverWebview: () => Promise<{ ok: boolean; message: string }>;
  evaluateBirthdayNow: () => void;
}) {
  const { isTrustedRendererUrl, attachWebview, detachWebview, setUserBusy, takeoverWebview, evaluateBirthdayNow } = options;

  ipcMain.on("whatsapp:registerWebview", (event, webContentsId: unknown) => {
    if (!isTrustedRendererUrl(event.sender.getURL())) return;
    const id = Number(webContentsId);
    if (!Number.isInteger(id) || id <= 0) return;
    if (attachWebview(id)) {
      evaluateBirthdayNow();
    }
  });

  ipcMain.on("whatsapp:unregisterWebview", (event, webContentsId: unknown) => {
    if (!isTrustedRendererUrl(event.sender.getURL())) return;
    const id = Number(webContentsId);
    if (Number.isInteger(id) && id > 0) detachWebview(id);
  });

  ipcMain.on("whatsapp:userActivity", (event, active: unknown) => {
    if (!isTrustedRendererUrl(event.sender.getURL())) return;
    setUserBusy(active === true);
    if (active !== true) evaluateBirthdayNow();
  });

  ipcMain.handle("whatsapp:takeoverWebview", async (event) => {
    if (!isTrustedRendererUrl(event.sender.getURL())) {
      return { ok: false, message: "WhatsApp Web devralma isteği reddedildi." };
    }
    return takeoverWebview();
  });
}
