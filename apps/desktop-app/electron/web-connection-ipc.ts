import { ipcMain } from "electron";
import { connectPublicationSource } from "./publication-source-service";
import type { DesktopDatabase } from "./database";
import {
  testWebConnection,
  type WebConnectionTestInput,
  type WebConnectionTestResult
} from "./web-connection-test";

export function registerWebConnectionIpcHandlers(options: { assertUnlocked: () => void; getDatabase: () => DesktopDatabase }) {
  // Opening Settings may check connectivity, but must not update verification/save authority.
  ipcMain.handle("sync:probeConnection", async (_event, input: WebConnectionTestInput): Promise<WebConnectionTestResult> => {
    options.assertUnlocked();
    const result = await testWebConnection(input);
    options.assertUnlocked();
    return result;
  });
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
  ipcMain.handle("sync:connectSource", async (_event, input: WebConnectionTestInput) => {
    options.assertUnlocked();
    const result = await connectPublicationSource(options.getDatabase(), {
      baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
      syncSecret: input.syncSecret.trim()
    });
    options.assertUnlocked();
    return result;
  });
}
