import { ipcMain, shell } from "electron";
import {
  BUSINESS_CAPABILITIES,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type {
  DesktopDashboardData,
  DesktopSetupData
} from "../database";

export interface DesktopBootstrapData {
  appName: string;
  version: string;
  platform: NodeJS.Platform;
  syncSettings: {
    webModuleUrl: string;
    hasSyncSecret: boolean;
  };
  databasePath: string;
  userDataPath: string;
  backupPath: string;
  setup: DesktopSetupData;
}

export function isWhatsAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["wa.me", "www.wa.me", "web.whatsapp.com", "api.whatsapp.com"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function registerAppIpcHandlers(options: {
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  getBootstrapData: () => DesktopBootstrapData;
  getDashboardData: () => DesktopDashboardData;
}) {
  const {
    assertUnlocked,
    assertCapability,
    getBootstrapData,
    getDashboardData
  } = options;

  ipcMain.handle("app:getBootstrapData", (): DesktopBootstrapData => {
    assertUnlocked();
    return getBootstrapData();
  });

  ipcMain.handle("shell:openExternal", async (_event, url: string) => {
    assertUnlocked();
    if (!/^https?:\/\//.test(url) && !/^tel:/.test(url)) {
      return false;
    }
    if (isWhatsAppUrl(url)) {
      assertCapability(BUSINESS_CAPABILITIES.WHATSAPP, "WhatsApp bu işletmede etkin değil.");
    }

    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("dashboard:getData", (): DesktopDashboardData => {
    assertUnlocked();
    return getDashboardData();
  });
}
