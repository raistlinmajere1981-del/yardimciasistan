import {
  classifyAIProviderFailure,
  generateConfiguredChat,
  analyzeCloudflareImage,
  generateConfiguredImage,
  CloudflareAiError,
  listGoogleAiStudioModels,
  rankGoogleAiStudioModels,
  verifyGoogleAiStudioVisionModel,
  type AICompletionFailureReason
} from "@yardimci-asistan/ai-core";
import { isCloudflareAiBaseUrl, supportsVisionModel, supportsImageGenerationModel } from "@yardimci-asistan/shared";
import { normalizeGeneratedImagePng } from "./generated-image-normalization";
import type { DesktopDatabase } from "./database";
import { normalizeAiTimeoutSeconds } from "./ai-config";
import { getEffectiveAiApiKey } from "./ai-secret-service";
import { createDiagnosticOperationId, desktopLog } from "./desktop-logger";
import { logAiOperationCompleted, logAiOperationStarted } from "./ai-diagnostics";

const GOOGLE_AI_STUDIO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface AiConnectionTestInput {
  provider: string;
  service: string;
  projectName: string;
  baseUrl: string;
  model: string;
  imageModel?: string;
  visionModel?: string;
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
  let imageModels: Array<{ id: string; label: string }> = [];

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

  if (service === "cloudflare" && (!isCloudflareAiBaseUrl(String(input.baseUrl)) || !isCloudflareAiBaseUrl(baseUrl))) {
    return { ok: false, message: "Cloudflare için geçerli Account ID ile oluşturulan resmi API adresi gerekli." };
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
  const operationId = createDiagnosticOperationId("ai-connection");
  const operationStartedAt = Date.now();

  if (service === "cloudflare") {
    const config = { enabled: true, provider: "openai_compatible" as const, service, baseUrl, model, apiKey, timeoutMs: timeoutSeconds * 1000 };
    if (input.visionModel && !supportsVisionModel(service, input.visionModel)) return { ok: false, message: "Cloudflare görsel analiz modeli desteklenmiyor." };
    if (input.imageModel && !supportsImageGenerationModel(service, input.imageModel)) return { ok: false, message: "Cloudflare görsel üretim modeli desteklenmiyor." };
    logAiOperationStarted("connection-test", config, operationId);
    const text = await generateConfiguredChat({ ...config, messages: [{ role: "user", content: "Türkçe tek kısa cümleyle bağlantının çalıştığını belirt." }] });
    logAiOperationCompleted("connection-test", config, text, operationStartedAt, operationId);
    if (!text.ok) return { ok: false, message: `Metin: ${text.message}` };
    if (input.visionModel) {
      const visionConfig = { ...config, model: input.visionModel }, startedAt = Date.now();
      logAiOperationStarted("vision-test", visionConfig, operationId);
      const vision = await analyzeCloudflareImage(visionConfig, "Bu test görselini Türkçe tek cümleyle tarif et.",
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
      logAiOperationCompleted("vision-test", visionConfig, vision, startedAt, operationId);
      if (!vision.ok) return { ok: false, message: `Görsel analiz: ${vision.message}` };
    }
    if (input.imageModel) {
      const imageConfig = { ...config, model: input.imageModel }, startedAt = Date.now();
      logAiOperationStarted("image-test", imageConfig, operationId);
      try {
        await generateConfiguredImage(imageConfig, "A cozy cottage beneath a clear blue sky", "square", globalThis.fetch, normalizeGeneratedImagePng);
        logAiOperationCompleted("image-test", imageConfig, { ok: true, provider: "openai_compatible", service, model: input.imageModel, answer: "" }, startedAt, operationId);
      } catch (error) {
        const failure = error instanceof CloudflareAiError ? error : new CloudflareAiError("invalid_response");
        logAiOperationCompleted("image-test", imageConfig, { ok: false, provider: "openai_compatible", service, model: input.imageModel,
          message: failure.message, reason: failure.reason, fallbackAnswer: "", ...(failure.status !== undefined ? { status: failure.status } : {}),
          ...(failure.providerCode ? { providerCode: failure.providerCode } : {}) }, startedAt, operationId);
        return { ok: false, message: `Görsel üretim: ${failure.message}` };
      }
    }
    database.recordServiceSettingsVerification("ai", { provider, service, projectName, baseUrl, model,
      visionModel: input.visionModel ?? "", imageModel: input.imageModel ?? "", apiKey, timeoutSeconds });
    const verified = ["metin", ...(input.visionModel ? ["görsel analiz"] : []), ...(input.imageModel ? ["görsel üretim"] : [])];
    return { ok: true, message: `Cloudflare ${verified.join(", ")} isteği başarılı. STT ayrı test edilmeli; bu sonuç kalan ücretsiz kotayı garanti etmez. Ayarları kaydedin.`, model,
      models: [...new Set([model, input.visionModel, input.imageModel].filter((id): id is string => Boolean(id)))].map(id => ({ id, label: id })) };
  }

  if (service === "gemini") {
    const modelListResult = await listGoogleAiStudioModels({
      baseUrl,
      apiKey,
      timeoutMs: timeoutSeconds * 1000
    });
    if (!modelListResult.ok) {
      const classification = classifyAIProviderFailure({
        ...(modelListResult.status !== undefined ? { status: modelListResult.status } : {}),
        message: modelListResult.message
      });
      desktopLog.warn({
        scope: "ai",
        event: "ai.connection-test.model-list.failed",
        message: "AI model listesi alınamadı.",
        operationId,
        meta: {
          service,
          status: modelListResult.status ?? 0,
          reason: classification.reason,
          providerMessage: modelListResult.message,
          durationMs: Date.now() - operationStartedAt
        }
      });
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
    imageModels = modelListResult.imageModels.map(item => ({ id: item.id, label: item.displayName || item.id }));
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
    const candidateConfig = {
      enabled: true,
      provider: "openai_compatible" as const,
      service,
      baseUrl,
      model: candidate,
      apiKey,
      timeoutMs: timeoutSeconds * 1000
    };
    const candidateStartedAt = Date.now();
    logAiOperationStarted("connection-test", candidateConfig, operationId);
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
    logAiOperationCompleted("connection-test", candidateConfig, result, candidateStartedAt, operationId);
    if (result.ok) {
      model = candidate;
      break;
    }
    if (service !== "gemini" || modelCandidates.length === 1 || !shouldTryNextGoogleModel(result)) {
      break;
    }
  }

  if (!result || !result.ok) {
    const failedModel = (attemptedModels.at(-1) || modelCandidates[0]) ?? "";
    return {
      ok: false,
      message: formatAiConnectionFailure(failedModel, result, attemptedModels),
      ...(service === "gemini" ? { model: failedModel, models } : {})
    };
  }

  if (input.imageModel && !supportsImageGenerationModel(service, input.imageModel)) return { ok: false, message: "Görsel üretim modeli bu sağlayıcıda desteklenmiyor." };
  database.recordServiceSettingsVerification("ai", {
    provider, service, projectName, baseUrl, model: result.model || model,
    imageModel: input.imageModel ?? "", apiKey, timeoutSeconds
  });
  return {
    ok: true,
    message: service === "gemini"
      ? `${projectName || "Google AI Studio"} bağlantısında ${model} modeliyle görsel girişi doğrulandı; ${models.length} uygun Gemini modeli bulundu. Kullanmak için ayarları kaydedin.`
      : `${getAiServiceLabel(service)} bağlantısı çalışıyor.`,
    model: result.model || model,
    models: [...models, ...imageModels]
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
  result: { status?: number; message: string; reason?: AICompletionFailureReason; retryAfterSeconds?: number } | null,
  attemptedModels: string[]
) {
  if (!result) {
    return "AI bağlantı testi tamamlanamadı.";
  }

  const attempted = attemptedModels.length > 1 ? ` Denenen modeller: ${attemptedModels.join(", ")}.` : "";
  if (result.reason === "quota_exhausted") {
    return `${model} modeli için kullanılabilir AI kotası kalmadı${result.status ? ` (HTTP ${result.status})` : ""}. Kota/faturalandırma durumunu kontrol edin.${attempted}`;
  }
  if (result.reason === "rate_limited" || result.status === 429) {
    const retry = result.retryAfterSeconds ? ` Yaklaşık ${result.retryAfterSeconds} saniye sonra tekrar deneyin.` : " Kısa süre sonra tekrar deneyin.";
    return `${model} modeli geçici istek sınırına ulaştı${result.status ? ` (HTTP ${result.status})` : ""}.${retry}${attempted}`;
  }
  if (result.reason === "service_busy") {
    return `${model} modeli şu anda yoğun veya geçici olarak kullanılamıyor. Bir süre sonra tekrar deneyin.${attempted}`;
  }
  if (result.reason === "timeout") {
    return `${model} modeli zamanında yanıt vermedi. Ağ durumunu ve AI servis yoğunluğunu kontrol edip tekrar deneyin.${attempted}`;
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
