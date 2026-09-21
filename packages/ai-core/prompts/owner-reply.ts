import type { AIMessage, AIProviderConfig, OwnerReplyInput, OwnerReplySuggestion } from "../types";
import { generateConfiguredChat } from "../providers/generate-chat";

const requestTypeLabels: Record<string, string> = {
  general_info: "bilgi talebi",
  pension_reservation: "pansiyon rezervasyonu",
  restaurant_reservation: "masa rezervasyonu",
  breakfast_request: "kahvaltı talebi",
  qr_menu_question: "menü sorusu",
  location_question: "ulaşım sorusu",
  price_question: "fiyat sorusu",
  other: "genel talep"
};

export function createOwnerReplySuggestion(input: OwnerReplyInput): OwnerReplySuggestion {
  const missingFields = getMissingFields(input);
  const requestType = requestTypeLabels[input.requestType] ?? "genel talep";
  const summary = [
    input.customerName ? `${input.customerName} adlı müşteri` : "Müşteri",
    `${requestType} iletti`,
    input.dateText ? `tarih: ${input.dateText}` : "",
    input.guestCount > 0 ? `${input.guestCount} kişi` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const greeting = input.customerName ? `Merhaba ${input.customerName},` : "Merhaba,";
  const missingText = missingFields.length > 0 ? ` Net kontrol için ${missingFields.join(", ")} bilgisini de paylaşabilir misiniz?` : "";
  const availabilityCheckRequired = [
    "pension_reservation",
    "restaurant_reservation",
    "breakfast_request"
  ].includes(input.requestType);
  const responseBody = availabilityCheckRequired
    ? `${input.businessName} için talebinizi aldık. Müsaitlik ve fiyat bilgisi işletme sahibi tarafından kontrol edilip size dönüş yapılacaktır.`
    : `${input.businessName} için mesajınızı aldık. Gerekli bilgiyi kontrol edip size dönüş yapacağız.`;
  const suggestedReply = [
    greeting,
    `${responseBody}${missingText}`,
    "Teşekkür ederiz."
  ].join(" ");

  return {
    summary,
    missingFields,
    suggestedReply,
    provider: "disabled",
    fallback: true
  };
}

export function buildOwnerReplyMessages(input: OwnerReplyInput, fallbackSuggestion = createOwnerReplySuggestion(input)): AIMessage[] {
  return [
    {
      role: "system",
      content: [
        `${input.businessName} için işletme sahibine WhatsApp cevap taslağı hazırlayan yardımcı asistansın.`,
        "Türkçe, kısa, sıcak ve işletme sahibinin gönderebileceği doğal bir metin yaz.",
        "Kesin rezervasyon, kesin müsaitlik veya bağlayıcı fiyat onayı verme.",
        "Müsaitlik veya bağlayıcı fiyat sorulursa ve güncel bağlamda doğrulanmış bilgi yoksa işletme sahibinin kontrol edip dönüş yapacağını belirt.",
        "Eksik bilgi varsa yalnız talebin türü için gerçekten gerekli olan bilgiyi müşteriden nazikçe iste.",
        "Güncel işletme bağlamı verilmişse onu esas al; bağlamda bulunmayan sektör, hizmet, saat veya özellik bilgisini varsayma.",
        "Ürün/menü eşleşmeleri verilmişse fiyat ve bulunabilirlik sorularında yalnız bu güncel eşleşmeleri kullan; eşleşme yoksa ürün veya fiyat uydurma.",
        "Katalogda eşleşme olmaması ürünün kesinlikle satılmadığını kanıtlamaz; eşleşme yoksa yalnız güncel katalogda doğrulanamadığını belirt ve satılmayan ürün kategorileri hakkında çıkarım yapma.",
        "Yanıtı sadece JSON olarak ver: {\"summary\":\"...\",\"missingFields\":[\"...\"],\"suggestedReply\":\"...\"}.",
        "JSON dışında açıklama veya markdown yazma."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        businessName: input.businessName,
        customerName: input.customerName,
        requestType: requestTypeLabels[input.requestType] ?? "genel talep",
        dateText: input.dateText,
        guestCount: input.guestCount,
        message: input.message,
        tone: input.tone ?? "warm",
        additionalInstructions: String(input.instructions ?? "").trim().slice(0, 800),
        businessContext: input.businessContext ?? {},
        catalogContext: input.catalogContext ?? {},
        fallbackSummary: fallbackSuggestion.summary,
        fallbackMissingFields: fallbackSuggestion.missingFields,
        fallbackSuggestedReply: fallbackSuggestion.suggestedReply
      })
    }
  ];
}

export async function generateOwnerReplySuggestion(input: OwnerReplyInput, config: AIProviderConfig, fetchImpl?: typeof fetch): Promise<OwnerReplySuggestion> {
  const fallbackSuggestion = createOwnerReplySuggestion(input);

  if (!config.enabled || config.provider === "disabled") {
    return fallbackSuggestion;
  }

  if (config.provider !== "openai_compatible") {
    return {
      ...fallbackSuggestion,
      provider: config.provider,
      fallback: true,
      providerMessage: "AI provider desteklenmiyor."
    };
  }

  const result = await generateConfiguredChat(
    {
      ...config,
      messages: buildOwnerReplyMessages(input, fallbackSuggestion)
    },
    fetchImpl
  );

  if (!result.ok) {
    return {
      ...fallbackSuggestion,
      provider: result.provider,
      fallback: true,
      providerMessage: result.message
    };
  }

  const parsedSuggestion = parseOwnerReplyJson(result.answer, fallbackSuggestion);
  return {
    ...parsedSuggestion,
    provider: result.provider,
    model: result.model,
    fallback: parsedSuggestion.fallback === true
  };
}

function parseOwnerReplyJson(answer: string, fallbackSuggestion: OwnerReplySuggestion): OwnerReplySuggestion {
  try {
    const parsed = JSON.parse(answer) as Partial<OwnerReplySuggestion>;
    const summary = sanitizeText(parsed.summary);
    const suggestedReply = sanitizeText(parsed.suggestedReply);
    const missingFields = Array.isArray(parsed.missingFields)
      ? parsed.missingFields.map((field) => sanitizeText(field)).filter(Boolean).slice(0, 6)
      : fallbackSuggestion.missingFields;

    if (!summary || !suggestedReply) {
      return {
        ...fallbackSuggestion,
        providerMessage: "AI cevabı eksik döndü."
      };
    }

    if (hasUnsafeApprovalLanguage(suggestedReply)) {
      return {
        ...fallbackSuggestion,
        providerMessage: "AI cevabı bağlayıcı onay dili içerdi."
      };
    }

    return {
      summary,
      missingFields,
      suggestedReply
    };
  } catch {
    return {
      ...fallbackSuggestion,
      providerMessage: "AI cevabı JSON formatında değildi."
    };
  }
}

function sanitizeText(value: unknown): string {
  return String(value ?? "").trim().slice(0, 1200);
}

function hasUnsafeApprovalLanguage(value: string): boolean {
  return /rezervasyonunuz\s+(onaylandı|kesinleşti)|kesin\s+(rezervasyon|müsaitlik|fiyat)|fiyat\s+garantisi/i.test(value);
}

function getMissingFields(input: OwnerReplyInput): string[] {
  const missingFields: string[] = [];

  const reservationDetailsRequired = [
    "pension_reservation",
    "restaurant_reservation",
    "breakfast_request"
  ].includes(input.requestType);

  if (reservationDetailsRequired && !input.dateText.trim()) {
    missingFields.push("tarih");
  }

  if (reservationDetailsRequired && (!Number.isFinite(input.guestCount) || input.guestCount < 1)) {
    missingFields.push("kişi sayısı");
  }

  if (!input.message.trim()) {
    missingFields.push("kısa not");
  }

  return missingFields;
}
