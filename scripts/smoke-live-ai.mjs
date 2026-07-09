import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generateOwnerReplySuggestion, generateWebChatReply } = require("../packages/ai-core/dist");

const config = readConfig();

validateConfig(config);

console.log(`live-ai-smoke-start: provider=${config.provider} model=${config.model}`);

const webResult = await generateWebChatReply(
  {
    businessName: "Deniz Çiçeği Pansiyon & Kafe",
    message: "Merhaba, 12-14 Temmuz için 2 yetişkin 1 çocuk balkonlu oda müsait mi? Fiyatı da öğrenebilir miyim?",
    history: [
      {
        role: "assistant",
        content: "Merhaba, size yardımcı olayım."
      }
    ],
    knowledgeDocuments: [
      {
        id: "firma",
        title: "Firma Bilgisi",
        content: [
          "Deniz Çiçeği Pansiyon & Kafe küçük bir sahil işletmesidir.",
          "Pansiyon odaları ve kafe/serpme kahvaltı hizmeti vardır.",
          "Müsaitlik ve fiyat işletme sahibi tarafından kontrol edildikten sonra kesinleşir.",
          "WhatsApp üzerinden tarih, kişi sayısı ve telefon bilgisiyle dönüş yapılır."
        ].join("\n"),
        sourcePath: "inline-live-smoke",
        truncated: false
      }
    ]
  },
  config
);

if (!webResult.ok || webResult.fallback) {
  console.error(`live-ai-smoke-failed: ${webResult.ok ? "fallback cevap döndü" : webResult.message}`);
  if (!webResult.ok && webResult.status) {
    console.error(`status: ${webResult.status}`);
  }
  process.exit(1);
}

const webQualityFailure = validateWebReply(webResult.answer);
if (webQualityFailure) {
  console.error(`live-ai-smoke-failed: web cevabı bağlam doğrulamasından geçmedi (${webQualityFailure})`);
  console.error(`web-reply: ${shorten(webResult.answer)}`);
  process.exit(1);
}

const ownerResult = await generateOwnerReplySuggestion(
  {
    businessName: "Deniz Çiçeği Pansiyon & Kafe",
    customerName: "Canlı AI Test",
    requestType: "pension_reservation",
    dateText: "12-14 Temmuz",
    guestCount: 3,
    message: "Balkonlu oda müsaitliği ve fiyat bilgisi soruluyor.",
    tone: "warm"
  },
  config
);

if (ownerResult.fallback) {
  console.error(`live-ai-smoke-failed: işletme sahibi taslağı provider cevabı yerine fallback kullandı (${ownerResult.providerMessage ?? "sebep yok"})`);
  console.error(`owner-reply-text: ${shorten(ownerResult.suggestedReply)}`);
  process.exit(1);
}

const ownerQualityFailure = validateOwnerReply(ownerResult.suggestedReply);
if (ownerQualityFailure) {
  console.error(`live-ai-smoke-failed: işletme sahibi taslağı bağlam doğrulamasından geçmedi (${ownerQualityFailure})`);
  console.error(`owner-reply: ${shorten(ownerResult.suggestedReply)}`);
  process.exit(1);
}

console.log("live-ai-smoke-ok");
console.log(`web-reply: ${shorten(webResult.answer)}`);
console.log(`owner-reply: ${shorten(ownerResult.suggestedReply)}`);

function readConfig() {
  return {
    enabled: readBoolean(process.env.YARDIMCI_ASISTAN_AI_ENABLED, true),
    provider: process.env.YARDIMCI_ASISTAN_AI_PROVIDER ?? "openai_compatible",
    baseUrl: process.env.YARDIMCI_ASISTAN_AI_BASE_URL ?? "",
    model: process.env.YARDIMCI_ASISTAN_AI_MODEL ?? "",
    apiKey: process.env.YARDIMCI_ASISTAN_AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
    timeoutMs: readTimeoutMs(process.env.YARDIMCI_ASISTAN_AI_TIMEOUT_SECONDS)
  };
}

function validateConfig(candidate) {
  const missing = [];

  if (!candidate.enabled) {
    missing.push("YARDIMCI_ASISTAN_AI_ENABLED=1");
  }

  if (candidate.provider !== "openai_compatible") {
    missing.push("YARDIMCI_ASISTAN_AI_PROVIDER=openai_compatible");
  }

  if (!candidate.baseUrl.trim()) {
    missing.push("YARDIMCI_ASISTAN_AI_BASE_URL");
  }

  if (!candidate.model.trim()) {
    missing.push("YARDIMCI_ASISTAN_AI_MODEL");
  }

  if (!candidate.apiKey.trim()) {
    missing.push("YARDIMCI_ASISTAN_AI_API_KEY");
  }

  if (missing.length > 0) {
    console.error(`live-ai-smoke-config-missing: ${missing.join(", ")}`);
    process.exit(1);
  }
}

function readBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return /^(1|true|yes|on)$/i.test(value.trim());
}

function readTimeoutMs(value) {
  const parsed = Number(value ?? "30000");
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return 30000;
  }

  return Math.min(Math.trunc(parsed), 120000);
}

function shorten(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function validateWebReply(answer) {
  const normalized = normalize(answer);
  if (!/[ğüşıöçİĞÜŞÖÇ]/.test(answer) && /\b(hello|how are you|thank you)\b/i.test(answer)) {
    return "Türkçe işletme cevabı yerine genel İngilizce cevap döndü";
  }

  if (!/(müsait|musait|fiyat|işletme|isletme|kontrol|dönüş|donus|whatsapp|talep|rezervasyon)/.test(normalized)) {
    return "müsaitlik/fiyat/talep bağlamı yok";
  }

  if (/(kesin.*(rezervasyon|müsait|musait|fiyat)|onaylandı|onaylandi|garanti)/.test(normalized)) {
    return "bağlayıcı onay dili içeriyor";
  }

  return "";
}

function validateOwnerReply(reply) {
  const normalized = normalize(reply);
  if (!/(müsait|musait|fiyat|kontrol|dönüş|donus|talep)/.test(normalized)) {
    return "işletme sahibinin kontrol/dönüş sınırı yok";
  }

  if (/(rezervasyonunuz onaylandı|rezervasyonunuz onaylandi|kesin rezervasyon|fiyat garantili|garanti)/.test(normalized)) {
    return "bağlayıcı onay dili içeriyor";
  }

  return "";
}

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}
