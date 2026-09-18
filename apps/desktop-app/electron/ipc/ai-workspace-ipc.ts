import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  AiWorkspaceHistoryEntry,
  DesktopDatabase,
  GenerateAiWorkspaceInput,
  GenerateAiWorkspaceResult,
  RequestAiSuggestionResult,
  SaveAiWorkspaceResult,
  SaveAiWorkspaceResultInput
} from "../database";
import {
  createOwnerReplySuggestionForRequest,
  generateAiWorkspaceEntry
} from "../ai-workspace-service";

export function registerAiWorkspaceIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
}) {
  const { getDatabase, assertCapability } = options;

  ipcMain.handle("ai:createOwnerReplySuggestion", async (_event, requestId: string): Promise<RequestAiSuggestionResult> => {
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri talepleri bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.AI, "AI bu işletmede etkin değil.");
    return createOwnerReplySuggestionForRequest(getDatabase(), requestId);
  });

  ipcMain.handle("ai:generateWorkspace", async (_event, input: GenerateAiWorkspaceInput): Promise<GenerateAiWorkspaceResult> => {
    assertCapability(BUSINESS_CAPABILITIES.AI, "AI bu işletmede etkin değil.");
    if (String(input?.requestId ?? "").trim()) {
      assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri talepleri bu işletmede etkin değil.");
    }
    return generateAiWorkspaceEntry(getDatabase(), input);
  });

  ipcMain.handle("ai:getWorkspaceHistory", (_event, limit?: number): AiWorkspaceHistoryEntry[] => {
    assertCapability(BUSINESS_CAPABILITIES.AI, "AI bu işletmede etkin değil.");
    const history = getDatabase().getAiWorkspaceHistory(limit);
    return hasBusinessCapability(getDatabase().getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.CUSTOMERS)
      ? history
      : history.filter((entry) => !entry.requestId);
  });

  ipcMain.handle("ai:saveWorkspaceResult", (_event, input: SaveAiWorkspaceResultInput): SaveAiWorkspaceResult => {
    assertCapability(BUSINESS_CAPABILITIES.AI, "AI bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri talepleri bu işletmede etkin değil.");
    return getDatabase().saveAiWorkspaceResult(input);
  });
}
