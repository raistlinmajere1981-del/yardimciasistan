import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  DesktopDatabase,
  DesktopIdentityImageAnalyzeResult,
  DesktopStockImageAnalyzeResult,
  DesktopStockImageApplyResult
} from "../database";
import {
  analyzeDesktopIdentityImage,
  analyzeDesktopStockImage,
  cancelDesktopStockImageAnalysis,
  parseStockImageApplyInput
} from "../image-analysis-service";

export function registerImageAnalysisIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  finalizeStockImageApply: (result: DesktopStockImageApplyResult) => DesktopStockImageApplyResult;
}) {
  const { getDatabase, assertCapability, finalizeStockImageApply } = options;

  ipcMain.handle("stockImage:analyze", async (_event, value: unknown): Promise<DesktopStockImageAnalyzeResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.AI, "AI stok analizi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.INVENTORY, "Stok yönetimi bu işletmede etkin değil.");
    return analyzeDesktopStockImage(getDatabase(), value);
  });

  ipcMain.handle("stockImage:cancel", (_event, importIdValue: unknown): boolean => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.AI, "AI stok analizi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.INVENTORY, "Stok yönetimi bu işletmede etkin değil.");
    return cancelDesktopStockImageAnalysis(getDatabase(), importIdValue);
  });

  ipcMain.handle("stockImage:apply", (_event, value: unknown): DesktopStockImageApplyResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.AI, "AI stok analizi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.INVENTORY, "Stok yönetimi bu işletmede etkin değil.");
    const input = parseStockImageApplyInput(value);
    if (!input) {
      return { ok: false, message: "Görsel stok taslağı geçersiz." };
    }
    return finalizeStockImageApply(getDatabase().applyStockImageImport(input));
  });

  ipcMain.handle(
    "customer:analyzeIdentityImage",
    async (_event, value: unknown): Promise<DesktopIdentityImageAnalyzeResult> => {
      options.assertUnlocked();
      assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
      assertCapability(BUSINESS_CAPABILITIES.AI, "AI kimlik analizi bu işletmede etkin değil.");
      return analyzeDesktopIdentityImage(getDatabase(), value);
    }
  );
}
