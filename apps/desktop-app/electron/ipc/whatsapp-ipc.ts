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
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  finalizeRecordDeletion: (result: DesktopStatusUpdateResult) => DesktopStatusUpdateResult;
}) {
  const { getDatabase, assertCapability, finalizeRecordDeletion } = options;

  ipcMain.handle("birthday:prepareWhatsApp", (_event, customerId: unknown): DesktopBirthdayPrepareResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.WHATSAPP, "WhatsApp bu işletmede etkin değil.");
    return getDatabase().prepareBirthdayWhatsApp(String(customerId ?? ""));
  });

  ipcMain.handle("whatsapp:markMessageSent", (_event, input: MarkWhatsAppMessageSentInput): DesktopStatusUpdateResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri talepleri bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.WHATSAPP, "WhatsApp bu işletmede etkin değil.");
    return getDatabase().markWhatsAppMessageSent(input);
  });

  ipcMain.handle("whatsapp:deleteMessage", (_event, input: DeleteWhatsAppMessageInput): DesktopStatusUpdateResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri talepleri bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.WHATSAPP, "WhatsApp bu işletmede etkin değil.");
    return finalizeRecordDeletion(getDatabase().deleteWhatsAppMessage(input));
  });
}
