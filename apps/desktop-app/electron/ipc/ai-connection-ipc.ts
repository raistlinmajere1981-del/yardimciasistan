import { ipcMain } from "electron";
import type { DesktopDatabase } from "../database";
import {
  testAiConnection,
  type AiConnectionTestInput,
  type AiConnectionTestResult
} from "../ai-connection-service";

export function registerAiConnectionIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
}) {
  const { getDatabase } = options;

  ipcMain.handle("ai:testConnection", async (_event, input: AiConnectionTestInput): Promise<AiConnectionTestResult> => {
    return testAiConnection(getDatabase(), input);
  });
}
