import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  DesktopDatabase,
  DesktopReportQueryResult,
  GenerateDesktopReportAiInput,
  GenerateDesktopReportAiResult
} from "../database";
import { generateDesktopReportAiComment } from "../report-ai-service";
import {
  type GenerateDesktopFinanceAiInput,
  type GenerateDesktopFinanceAiResult
} from "../finance";
import { generateDesktopFinanceAiComment } from "../finance-ai-service";

export function registerReportIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
}) {
  const { getDatabase, assertUnlocked, assertCapability } = options;

  ipcMain.handle("report:getData", (_event, input: GenerateDesktopReportAiInput["range"]): DesktopReportQueryResult => {
    assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.REPORTS, "Raporlar bu işletmede etkin değil.");
    try {
      return { ok: true, data: getDatabase().getReportData(input) };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Rapor verileri hazırlanamadı."
      };
    }
  });

  ipcMain.handle(
    "report:generateAiComment",
    async (_event, input: GenerateDesktopReportAiInput): Promise<GenerateDesktopReportAiResult> => {
      assertUnlocked();
      assertCapability(BUSINESS_CAPABILITIES.REPORTS, "Raporlar bu işletmede etkin değil.");
      assertCapability(BUSINESS_CAPABILITIES.AI, "AI rapor yorumu bu işletmede etkin değil.");
      return generateDesktopReportAiComment(getDatabase(), input);
    }
  );

  ipcMain.handle(
    "finance:generateAiComment",
    async (_event, input: GenerateDesktopFinanceAiInput): Promise<GenerateDesktopFinanceAiResult> => {
      assertUnlocked();
      assertCapability(BUSINESS_CAPABILITIES.FINANCE, "Kasa bu işletmede etkin değil.");
      assertCapability(BUSINESS_CAPABILITIES.AI, "AI kasa yorumu bu işletmede etkin değil.");
      return generateDesktopFinanceAiComment(getDatabase(), input);
    }
  );
}
