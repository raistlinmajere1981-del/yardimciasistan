import { generateConfiguredChat } from "@yardimci-asistan/ai-core";
import type { DesktopDatabase } from "./database";
import {
  DesktopFinanceService,
  type GenerateDesktopFinanceAiInput,
  type GenerateDesktopFinanceAiResult
} from "./finance";
import { createDesktopAiConfig } from "./ai-config";
import { createDiagnosticOperationId } from "./desktop-logger";
import { logAiOperationCompleted, logAiOperationStarted } from "./ai-diagnostics";
import {
  buildFinanceAiMessages,
  buildFinanceAiPayload,
  financeHasEnoughData,
  sanitizeFinanceAiAnswer
} from "./finance-ai";

export async function generateDesktopFinanceAiComment(
  database: DesktopDatabase,
  input: GenerateDesktopFinanceAiInput
): Promise<GenerateDesktopFinanceAiResult> {
  const mode = input?.mode;
  if (!["summary", "flow", "receivables", "recommendations"].includes(mode)) {
    return { ok: false, message: "Geçerli bir kasa yorum türü seçin." };
  }

  const setup = database.getSetupData();
  const config = createDesktopAiConfig(database, setup);
  if (!config.enabled || config.provider === "disabled") {
    return { ok: false, message: "Kasa verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
  }

  let finance;
  try {
    finance = new DesktopFinanceService(database.databasePath).getData(100);
  } catch {
    return { ok: false, message: "Kasa verileri hazırlanamadı." };
  }

  const payload = buildFinanceAiPayload(finance);
  if (!financeHasEnoughData(payload)) {
    return { ok: true, content: "Bugün için yorumlanacak kasa hareketi yok." };
  }

  const operationId = createDiagnosticOperationId("ai-finance");
  const startedAt = Date.now();
  logAiOperationStarted("finance", config, operationId);
  try {
    const completion = await generateConfiguredChat({
      ...config,
      messages: buildFinanceAiMessages(mode, payload, setup.businessName || "İşletme")
    });
    logAiOperationCompleted("finance", config, completion, startedAt, operationId);
    if (!completion.ok) {
      return { ok: false, message: "Kasa verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
    }

    const sanitized = sanitizeFinanceAiAnswer(completion.answer, payload, mode);
    return sanitized.ok
      ? sanitized
      : { ok: false, message: "Kasa verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
  } catch (error) {
    logAiOperationCompleted("finance", config, {
      ok: false,
      provider: config.provider,
      service: config.service,
      model: config.model,
      message: "AI kasa işlemi beklenmedik biçimde kesildi.",
      error: error instanceof Error ? error.message : String(error),
      reason: "provider_error",
      fallbackAnswer: ""
    }, startedAt, operationId);
    return { ok: false, message: "Kasa verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
  }
}
