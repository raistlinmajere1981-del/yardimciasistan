import { ipcMain } from "electron";
import type { DesktopDatabase } from "./database";
import {
  testWebConnection,
  type WebConnectionTestInput,
  type WebConnectionTestResult
} from "./web-connection-test";

export function registerWebConnectionIpcHandlers(options: { assertUnlocked: () => void; getDatabase: () => DesktopDatabase }) {
  ipcMain.handle(
    "sync:testConnection",
    async (_event, input: WebConnectionTestInput): Promise<WebConnectionTestResult> => {
      options.assertUnlocked();
      const config = { baseUrl: input.baseUrl.trim().replace(/\/+$/, ""), syncSecret: input.syncSecret.trim() };
      const result = await testWebConnection(config);
      options.assertUnlocked();
      if (result.ok) options.getDatabase().recordServiceSettingsVerification("web", config);
      return result;
    }
  );
}
