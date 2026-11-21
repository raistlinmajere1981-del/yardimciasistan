import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type SeoFields, type SeoPageKey, type SeoActionResult } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database.js";
import { suggestSeoCopy } from "../seo-ai-service.js";

export function registerSeoIpc(options: {
  database: () => DesktopDatabase;
  assertUnlocked: () => void;
  onChanged: () => void;
}): void {
  async function operation<T>(action: () => T | Promise<T>): Promise<SeoActionResult<T>> {
    options.assertUnlocked();
    if (!options.database().getEnabledBusinessCapabilities().includes(BUSINESS_CAPABILITIES.WEB))
      return {ok:false,message:"Web servisi bu işletmede etkin değil."};
    try {
      const value = await action();
      options.assertUnlocked();
      return {ok:true,value};
    } catch(error) {
      return {ok:false,message:error instanceof Error ? error.message : "SEO işlemi tamamlanamadı."};
    }
  }
  ipcMain.handle("seo:snapshot", () => operation(() => options.database().getSeoPages()));
  ipcMain.handle("seo:save", (_event, page: SeoPageKey, fields: SeoFields, expectedUpdatedAt: string) => operation(() => {
    options.database().saveSeoSource(page, fields, expectedUpdatedAt);
    options.onChanged();
  }));
  ipcMain.handle("seo:suggest", (_event, page: SeoPageKey, language: string) =>
    operation(() => {
      if (!options.database().getEnabledBusinessCapabilities().includes(BUSINESS_CAPABILITIES.AI))
        throw Error("AI servisi bu işletmede etkin değil.");
      return suggestSeoCopy(options.database(),page,language);
    }));
}
