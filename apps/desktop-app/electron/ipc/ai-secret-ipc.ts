import { ipcMain } from "electron";
import type { DesktopDatabase } from "../database";
import { revealStoredAiApiKey, type AiApiKeyRevealResult } from "../ai-secret-service";

export function registerAiSecretIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
}) {
  const { getDatabase, assertUnlocked } = options;

  ipcMain.handle("ai:revealApiKey", (_event, serviceValue: unknown): AiApiKeyRevealResult => {
    assertUnlocked();
    return revealStoredAiApiKey(getDatabase(), serviceValue);
  });
}
