import { ipcMain } from "electron";
import type { DesktopDatabase } from "../database";
import {
  testAiConnection,
  type AiConnectionTestInput,
  type AiConnectionTestResult
} from "../ai-connection-service";

/** A test is owned by the requesting window. Cancelling never touches normal AI work. */
const pendingAiTests = new Map<string, { owner: number; controller: AbortController }>();
const validTestId = (value: unknown): value is string =>
  typeof value === "string" && /^ai-test-[a-zA-Z0-9_-]{1,70}$/.test(value);

export function registerAiConnectionIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
}) {
  ipcMain.handle("ai:testConnection", async (event, input: AiConnectionTestInput, testId: string): Promise<AiConnectionTestResult> => {
    options.assertUnlocked();
    if (!validTestId(testId)) return { ok: false, message: "Bağlantı testi kimliği geçersiz." };
    const key = `${event.sender.id}:${testId}`;
    if (pendingAiTests.has(key)) return { ok: false, message: "Bu bağlantı testi zaten çalışıyor." };
    const controller = new AbortController();
    pendingAiTests.set(key, { owner: event.sender.id, controller });
    try {
      const result = await testAiConnection(options.getDatabase(), input, controller.signal);
      return controller.signal.aborted ? { ok: false, message: "Bağlantı testi iptal edildi." } : result;
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, message: "Bağlantı testi iptal edildi." };
      throw error;
    } finally {
      pendingAiTests.delete(key);
    }
  });
  ipcMain.handle("ai:cancelTestConnection", (event, testId: string): boolean => {
    options.assertUnlocked();
    if (!validTestId(testId)) return false;
    const test = pendingAiTests.get(`${event.sender.id}:${testId}`);
    if (!test || test.owner !== event.sender.id) return false;
    test.controller.abort();
    return true;
  });
}
