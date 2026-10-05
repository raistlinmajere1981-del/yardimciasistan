import { ipcMain } from "electron";
import type { MarketingAnalyticsRangeInput, MarketingResult } from "@yardimci-asistan/shared";
import type { MarketingAnalyticsService } from "../marketing/analytics-service";
import { MarketingError } from "../marketing/validation";
export function registerMarketingAnalyticsIpc(options: { service: MarketingAnalyticsService; assertUnlocked: () => void }) {
  async function operation<T>(action: () => T | Promise<T>): Promise<MarketingResult<T>> {
    options.assertUnlocked();
    try { const value = await action(); options.assertUnlocked(); return { ok: true, value }; }
    catch (error) { return { ok: false, code: error instanceof MarketingError ? error.code : "operation_failed", message: error instanceof MarketingError ? error.message : "Pazarlama analitiği okunamadı." }; }
  }
  const service = options.service;
  ipcMain.handle("marketingAnalytics:snapshot", (_event, range: MarketingAnalyticsRangeInput, opened?: boolean) => operation(() => service.snapshot(range, opened)));
  ipcMain.handle("marketingAnalytics:campaign", (_event, id: string) => operation(() => service.campaign(id)));
  ipcMain.handle("marketingAnalytics:publication", (_event, id: string) => operation(() => service.publication(id)));
  ipcMain.handle("marketingAnalytics:refreshPublication", (_event, id: string) => operation(() => service.refreshPublication(id)));
}
