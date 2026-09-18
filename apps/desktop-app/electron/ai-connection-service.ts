import {
  generateConfiguredChat,
  listGoogleAiStudioModels,
  rankGoogleAiStudioModels,
  verifyGoogleAiStudioVisionModel
} from "@yardimci-asistan/ai-core";
import type { DesktopDatabase } from "./database";
import { normalizeAiTimeoutSeconds } from "./ai-config";
import { getEffectiveAiApiKey } from "./ai-secret-service";

const GOOGLE_AI_STUDIO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface AiConnectionTestInput {
  provider: string;
  service: string;
  projectName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  useStoredApiKey: boolean;
  timeoutSeconds: number;
}

export type AiConnectionTestResult =
  | { ok: true; message: string; model: string; models: Array<{ id: string; label: string }> }
  | { ok: false; message: string; model?: string; models?: Array<{ id: string; label: string }> };

export async function testAiConnection(
  database: DesktopDatabase,
  input: AiConnectionTestInput
): Promise<AiConnectionTestResult> {
  const provider = String(input?.provider ?? "").trim();
  const service = String(input?.service ?? "").trim();
  const projectName = String(input?.projectName ?? "").trim();
  const baseUrl = normalizeAiConnectionUrl(input?.baseUrl);
  let model = String(input?.model ?? "").trim();
  let models: Array<{ id: string; label: string }> = [];

  if (provider !== "openai_compatible") {
    return {
      ok: false,
      message: "Bu AI bağlantı türü henüz desteklenmiyor."
    };
  }

  if (!baseUrl) {
    return {
      ok: false,
      message: "AI bağlantı adresi geçerli bir http veya https adresi olmalı ve kullanıcı bilgisi içermemeli."
    };
  }

  if (service === "gemini" && !isGoogleAiStudioUrl(baseUrl)) {
    return {
      ok: false,
      message: "Google AI Studio için resmi Gemini bağlantı adresi kullanılmalı."
    };
  }

  const timeoutCandidate = Number(input?.timeoutSeconds);
  if (!Number.isInteger(timeoutCandidate) || timeoutCandidate < 5 || timeoutCandidate > 120) {
    return {
      ok: false,
      message: "Yanıt bekleme süresi 5 ile 120 saniye arasında olmalı."
    };
  }

  const apiKey = String(input?.apiKey ?? "").trim() || (input?.useStoredApiKey ? getEffectiveAiApiKey(database, service) : "");
  const timeoutSeconds = normalizeAiTimeoutSeconds(timeoutCandidate);

  if (service === "gemini") {
    const modelListResult = await listGoogleAiStudioModels({
      baseUrl,
      apiKey,
      timeoutMs: timeoutSeconds * 1000
    });
    if (!modelListResult.ok) {
      return {
        ok: false,
        message: modelListResult.message
      };
    }

    models = modelListResult.models.map((item) => ({
      id: item.id,
      label: item.displayName && item.displayName !== item.id
        ? `${item.displayName} (${item.id})`
        : item.id
    }));
    const rankedIds = rankGoogleAiStudioModels(models.map((item) => item.id));
    models.sort((left, right) => rankedIds.indexOf(left.id) - rankedIds.indexOf(right.id));
    if (!models.some((item) => item.id === model)) {
      model = "";
    }
  }

  const rankedGoogleModels = service === "gemini"
    ? rankGoogleAiStudioModels(models.map((item) => item.id))
    : [];
  const modelCandidates = service === "gemini"
    ? [...new Set([model, ...rankedGoogleModels].filter(Boolean))].slice(0, 6)
    : model
      ? [model]
      : [];
  if (modelCandidates.length === 0) {
    return {
      ok: false,
      message: "AI model adı gerekli."
    };
  }

  let result: Awaited<ReturnType<typeof generateConfiguredChat>> | null = null;
  const attemptedModels: string[] = [];
  for (const candidate of modelCandidates) {
    attemptedModels.push(candidate);
    result = service === "gemini"
      ? await verifyGoogleAiStudioVisionModel({
          baseUrl,
          model: candidate,
          apiKey,
          timeoutMs: timeoutSeconds * 1000
        })
      : await generateConfiguredChat({
          enabled: true,
          provider: "openai_compatible",
          service,
          baseUrl,
          model: candidate,
          apiKey,
          authMode: "bearer",
          timeoutMs: timeoutSeconds * 1000,
          messages: [
            {
              role: "system",
              content: "Bu bir bağlantı kontrolüdür. Türkçe ve tek kısa cümleyle bağlantının çalıştığını belirt."
            },
            {
              role: "user",
              content: "Bağlantı kontrolü"
            }
          ]
        });
    if (result.ok) {
      model = candidate;
      break;
    }
    if (service !== "gemini" || modelCandidates.length === 1 || !shouldTryNextGoogleModel(result)) {
      break;
    }
  }

  if (!result || !result.ok) {
    return {
      ok: false,
      message: formatAiConnectionFailure(attemptedModels.at(-1) || modelCandidates[0], result, attemptedModels),
      model: service === "gemini" ? attemptedModels.at(-1) : undefined,
      models: service === "gemini" ? models : undefined
    };
  }

  return {
    ok: true,
    message: service === "gemini"
      ? `${projectName || "Google AI Studio"} bağlantısında ${model} modeliyle görsel girişi doğrulandı; ${models.length} uygun Gemini modeli bulundu. Kullanmak için ayarları kaydedin.`
      : `${getAiServiceLabel(service)} bağlantısı çalışıyor.`,
    model: result.model || model,
    models
  };
}

function normalizeAiConnectionUrl(value: unknown) {
  const candidate = String(value ?? "").trim();
  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) {
      return "";
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function isGoogleAiStudioUrl(value: string) {
  return value === GOOGLE_AI_STUDIO_BASE_URL;
}

function shouldTryNextGoogleModel(result: { status?: number; message: string }) {
  return result.status === 404
    || result.status === 429
    || (result.status === 400 && /model|not found|support|image|vision|multimodal|mime/i.test(result.message));
}

function formatAiConnectionFailure(
  model: string,
  result: { status?: number; message: string } | null,
  attemptedModels: string[]
) {
  if (!result) {
    return "AI bağlantı testi tamamlanamadı.";
  }

  const attempted = attemptedModels.length > 1 ? ` Denenen modeller: ${attemptedModels.join(", ")}.` : "";
  if (result.status === 429) {
    return `${model} modeli için kullanılabilir Google kotası bulunamadı (HTTP 429). Rate Limit ekranında limiti 0'dan büyük bir model seçin veya faturalandırmayı etkinleştirin.${attempted}`;
  }
  if (result.status === 401 || result.status === 403) {
    return `Google AI Studio erişim anahtarı veya proje yetkisi kabul edilmedi (HTTP ${result.status}). Anahtar durumunu ve proje erişimini kontrol edin.`;
  }
  if (result.status === 404) {
    return `${model} modeli bu proje için bulunamadı (HTTP 404).${attempted}`;
  }

  const shortMessage = result.message.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 280);
  return `${model} modeliyle bağlantı kurulamadı${result.status ? ` (HTTP ${result.status})` : ""}: ${shortMessage || "Bilinmeyen sağlayıcı hatası."}${attempted}`;
}

function getAiServiceLabel(service: string) {
  const labels: Record<string, string> = {
    openai: "OpenAI",
    openrouter: "OpenRouter",
    groq: "Groq",
    gemini: "Google Gemini",
    custom: "Özel AI servisi"
  };

  return labels[service] || "AI servisi";
}
