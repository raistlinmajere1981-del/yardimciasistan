import type { AICompletionResult, AIMessage, AIProviderConfig, WebChatRequest } from "../types";
import { generateOpenAICompatibleChat } from "../providers/openai-compatible";

const FALLBACK_WEB_ANSWER = "AI yardımcı şu anda aktif değil. Talebinizi form veya WhatsApp üzerinden iletebilirsiniz; işletme sahibi müsaitlik ve fiyat bilgisini kontrol edip dönüş yapacaktır.";

export function buildWebChatMessages(request: WebChatRequest): AIMessage[] {
  const history = (request.history ?? [])
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim())
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 900)
    }));

  return [
    {
      role: "system",
      content: buildWebChatSystemPrompt(request)
    },
    ...history,
    {
      role: "user",
      content: request.message.trim().slice(0, 1200)
    }
  ];
}

export function buildWebChatSystemPrompt(request: Pick<WebChatRequest, "businessName" | "knowledgeDocuments">): string {
  const knowledge = request.knowledgeDocuments
    .map((document) => [`## ${document.title}`, document.content].join("\n"))
    .join("\n\n");

  return [
    `${request.businessName} için web sitesinde müşteriye yardımcı olan kısa yanıtlı bir asistansın.`,
    "Türkçe, samimi ve net cevap ver.",
    "Kesin rezervasyon, kesin müsaitlik veya bağlayıcı fiyat onayı verme.",
    "Müsaitlik ve fiyat için işletme sahibinin kontrol edip dönüş yapacağını belirt.",
    "Eksik tarih, saat, kişi sayısı, telefon veya tercih bilgisi varsa en fazla iki kısa soru sor.",
    "Gerekirse talep formuna veya WhatsApp'a yönlendir.",
    "Bilmediğin konuda tahmin yürütme; işletme sahibinin dönüş yapacağını söyle.",
    "",
    "Firma bilgileri:",
    knowledge || "Firma bilgi dosyası bulunamadı."
  ].join("\n");
}

export async function generateWebChatReply(request: WebChatRequest, config: AIProviderConfig, fetchImpl?: typeof fetch): Promise<AICompletionResult> {
  if (!config.enabled || config.provider === "disabled") {
    return {
      ok: true,
      provider: "disabled",
      fallback: true,
      answer: FALLBACK_WEB_ANSWER
    };
  }

  if (config.provider !== "openai_compatible") {
    return {
      ok: false,
      provider: config.provider,
      message: "AI provider desteklenmiyor.",
      fallbackAnswer: FALLBACK_WEB_ANSWER
    };
  }

  const result = await generateOpenAICompatibleChat(
    {
      ...config,
      messages: buildWebChatMessages(request)
    },
    fetchImpl
  );

  if (!result.ok) {
    return {
      ...result,
      fallbackAnswer: FALLBACK_WEB_ANSWER
    };
  }

  return result;
}

export function getFallbackWebAnswer(): string {
  return FALLBACK_WEB_ANSWER;
}
