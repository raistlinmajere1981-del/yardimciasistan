import { ipcMain } from "electron";
import type { SaveTranslationInput, TranslateSelectionInput, TranslationIdentity, TranslationFilter, TranslationResult, TranslationSettings } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import type { PublicTranslationService } from "../public-translation-service";

export function registerPublicTranslationIpc(options: {
  database: () => DesktopDatabase; service: PublicTranslationService;
  assertUnlocked: () => void; onChanged: () => void;
}) {
  async function operation<T>(action: () => T | Promise<T>): Promise<TranslationResult<T>> {
    options.assertUnlocked();
    try { const value = await action(); options.assertUnlocked(); return {ok:true,value}; }
    catch (error) { return {ok:false,message:error instanceof Error ? error.message : "Dil işlemi tamamlanamadı."}; }
  }
  ipcMain.handle("translation:settings", () => operation(() => options.database().translations().settings()));
  ipcMain.handle("translation:saveSettings", (_event, input: TranslationSettings) => operation(() => {
    const settings = options.database().translations().saveSettings(input);
    options.service.reconcile(); options.onChanged(); return settings;
  }));
  ipcMain.handle("translation:get", (_event, identity: TranslationIdentity, language: string) => operation(() => options.database().translations().get(identity, language)));
  ipcMain.handle("translation:list", (_event, filter: TranslationFilter) => operation(() => options.database().translations().list(filter)));
  ipcMain.handle("translation:save", (_event, input: SaveTranslationInput) => operation(() => { options.database().translations().saveManual(input); options.onChanged(); }));
  ipcMain.handle("translation:start", (_event, input: TranslateSelectionInput) => operation(() => options.service.start(input)));
  ipcMain.handle("translation:job", () => operation(() => options.service.status()));
  ipcMain.handle("translation:pause", () => operation(() => options.service.pause()));
  ipcMain.handle("translation:resume", () => operation(() => options.service.resume()));
  ipcMain.handle("translation:cancel", () => operation(() => options.service.cancel()));
}
