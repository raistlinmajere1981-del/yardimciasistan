import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  DailyBusinessEvaluationResult,
  DesktopDatabase,
  RequestAiSuggestionResult,
  RewriteRequestAiSuggestionInput
} from "../database";
import {
  createOwnerReplySuggestionForRequest,
  generateDailyBusinessEvaluation,
  rewriteOwnerReplySuggestionForRequest
} from "../business-ai-service";

export function registerBusinessAiIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
}) {
  const { getDatabase, assertCapability } = options;

  ipcMain.handle("ai:createOwnerReplySuggestion", async (_event, requestId: string): Promise<RequestAiSuggestionResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri kayıtları bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.REQUESTS, "Müşteri talepleri bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.AI, "AI bu işletmede etkin değil.");
    return createOwnerReplySuggestionForRequest(getDatabase(), requestId);
  });

  ipcMain.handle("ai:rewriteOwnerReplySuggestion", async (_event, input: RewriteRequestAiSuggestionInput): Promise<RequestAiSuggestionResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri kayıtları bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.REQUESTS, "Müşteri talepleri bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.AI, "AI bu işletmede etkin değil.");
    return rewriteOwnerReplySuggestionForRequest(getDatabase(), input);
  });

  ipcMain.handle("ai:generateDailyBusinessEvaluation", async (): Promise<DailyBusinessEvaluationResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.AI, "AI bu işletmede etkin değil.");
    return generateDailyBusinessEvaluation(getDatabase());
  });
}
