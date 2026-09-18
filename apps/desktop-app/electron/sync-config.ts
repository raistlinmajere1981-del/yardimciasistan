import type { DesktopSetupData } from "./database";

export function getWebSyncConfig(setup: DesktopSetupData) {
  const baseUrl = process.env.YA_WEB_MODULE_URL ?? setup.webModuleUrl;
  const syncSecret = process.env.YA_SYNC_SECRET ?? setup.syncSecret;

  return { baseUrl, syncSecret };
}
