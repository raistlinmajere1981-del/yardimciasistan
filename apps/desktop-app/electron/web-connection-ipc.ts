import { ipcMain } from "electron";
import {
  testWebConnection,
  type WebConnectionTestInput,
  type WebConnectionTestResult
} from "./web-connection-test";

export function registerWebConnectionIpcHandlers() {
  ipcMain.handle(
    "sync:testConnection",
    async (_event, input: WebConnectionTestInput): Promise<WebConnectionTestResult> => testWebConnection(input)
  );
}
