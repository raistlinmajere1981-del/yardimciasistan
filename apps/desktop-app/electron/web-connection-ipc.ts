import { ipcMain } from "electron";
import {
  testWebConnection,
  type WebConnectionTestInput,
  type WebConnectionTestResult
} from "./web-connection-test";

export function registerWebConnectionIpcHandlers(options: { assertUnlocked: () => void }) {
  ipcMain.handle(
    "sync:testConnection",
    async (_event, input: WebConnectionTestInput): Promise<WebConnectionTestResult> => {
      options.assertUnlocked();
      return testWebConnection(input);
    }
  );
}
