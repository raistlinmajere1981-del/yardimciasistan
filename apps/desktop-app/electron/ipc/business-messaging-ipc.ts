import { ipcMain } from "electron";
import type { BusinessMessagingResult, BusinessTemplateIntentInput, WhatsAppCloudConfigurationInput } from "@yardimci-asistan/shared";
import type { BusinessMessagingService } from "../business-messaging/service";
import { normalizeBusinessMessagingError } from "../business-messaging/provider-error";
export function registerBusinessMessagingIpc(options: { service: BusinessMessagingService; assertUnlocked: () => void; onChanged: () => void }) {
  async function operation<T>(action: () => Promise<T> | T): Promise<BusinessMessagingResult<T>> {
    options.assertUnlocked();
    try { return { ok: true, value: await action() }; } catch (caught) { const error = normalizeBusinessMessagingError(caught); return { ok: false, code: error.code, message: error.message }; }
  }
  ipcMain.handle("businessMessaging:configuration", () => { options.assertUnlocked(); return options.service.getConfiguration(); });
  ipcMain.handle("businessMessaging:testConnection", (_event, input?: WhatsAppCloudConfigurationInput) => { options.assertUnlocked(); return options.service.testConnection(input); });
  ipcMain.handle("businessMessaging:templates", () => operation(() => options.service.listTemplates()));
  ipcMain.handle("businessMessaging:prepare", (_event, input: BusinessTemplateIntentInput) => operation(() => options.service.prepare(input)));
  ipcMain.handle("businessMessaging:send", (_event, id: string, parameters: string[][]) => operation(async () => { const message = await options.service.send(id, parameters); options.onChanged(); return message; }));
  ipcMain.handle("businessMessaging:message", (_event, id: string) => operation(() => options.service.getMessage(id)));
}
