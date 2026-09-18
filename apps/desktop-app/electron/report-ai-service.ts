import { generateConfiguredChat } from "@yardimci-asistan/ai-core";
import { BUSINESS_CAPABILITIES, hasBusinessCapability } from "@yardimci-asistan/shared";
import type {
  DesktopDatabase,
  GenerateDesktopReportAiInput,
  GenerateDesktopReportAiResult
} from "./database";
import { createDesktopAiConfig } from "./ai-config";
import {
  buildReportAiMessages,
  buildReportAiPayload,
  reportHasEnoughData,
  sanitizeReportAiAnswer
} from "./report-ai";

export async function generateDesktopReportAiComment(
  database: DesktopDatabase,
  input: GenerateDesktopReportAiInput
): Promise<GenerateDesktopReportAiResult> {
  const mode = input?.mode;
  if (!["summary", "attention", "sales", "recommendations"].includes(mode)) {
    return { ok: false, message: "Geçerli bir AI yorum türü seçin." };
  }
  if (mode === "sales" && !hasBusinessCapability(database.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.FOOD_ORDERS)) {
    return { ok: false, message: "Restoran satış yorumu bu işletmede etkin değil." };
  }

  const setup = database.getSetupData();
  const config = createDesktopAiConfig(database, setup);
  if (!config.enabled || config.provider === "disabled") {
    return { ok: false, message: "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
  }

  let report;
  try {
    report = database.getReportData(input.range);
  } catch {
    return { ok: false, message: "Rapor verileri hazırlanamadı." };
  }
  const payload = buildReportAiPayload(report);
  if (!reportHasEnoughData(payload)) {
    return { ok: true, content: "Bu dönem için yeterli veri yok." };
  }

  try {
    const completion = await generateConfiguredChat({
      ...config,
      messages: buildReportAiMessages(mode, payload, setup.businessName || "İşletme")
    });
    if (!completion.ok) {
      return { ok: false, message: "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
    }
    const sanitized = sanitizeReportAiAnswer(completion.answer, payload, mode);
    return sanitized.ok
      ? sanitized
      : { ok: false, message: "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
  } catch {
    return { ok: false, message: "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
  }
}
