import type { AICompletionFailure, AICompletionResult, AIMessage, AIProviderConfig } from "../types";
import { classifyAIProviderFailure, parseRetryAfterSeconds } from "./failure-classification";
import { supportsImageGenerationModel } from "@yardimci-asistan/shared";

export interface GoogleAiStudioModel {
  id: string;
  displayName: string;
  description: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

export interface GoogleAiStudioChatOptions extends AIProviderConfig {
  messages: AIMessage[];
}

export type GoogleAiStudioModelListResult =
  | { ok: true; models: GoogleAiStudioModel[]; imageModels: GoogleAiStudioModel[] }
  | { ok: false; message: string; status?: number };

export interface GoogleAiStudioVisionCheckOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
}

interface GoogleModelResponse {
  models?: Array<{
    name?: string;
    baseModelId?: string;
    displayName?: string;
    description?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface GoogleGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export async function generateGoogleAiStudioChat(
  options: GoogleAiStudioChatOptions,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<AICompletionResult> {
  const validationFailure = validateGoogleChatOptions(options);
  if (validationFailure) {
    return validationFailure;
  }

  const url = createGoogleGenerateContentUrl(options.baseUrl, options.model);
  if (!url) {
    return {
      ok: false,
      provider: "openai_compatible",
      service: "gemini",
      model: options.model,
      message: "Google AI Studio bağlantı adresi geçersiz.",
      reason: "configuration",
      fallbackAnswer: ""
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": options.apiKey
      },
      body: JSON.stringify(createGoogleGenerateContentBody(options.messages)),
      redirect: "error",
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as GoogleGenerateContentResponse | null;

    if (!response.ok) {
      const message = payload?.error?.message || "Google AI Studio cevabı alınamadı.";
      const providerCode = String(payload?.error?.status || payload?.error?.code || "").trim();
      const classification = classifyAIProviderFailure({
        status: response.status,
        providerCode,
        message
      });
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
      return {
        ok: false,
        provider: "openai_compatible",
        service: "gemini",
        model: options.model,
        status: response.status,
        message,
        reason: classification.reason,
        ...(classification.providerCode ? { providerCode: classification.providerCode } : {}),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        fallbackAnswer: ""
      };
    }

    const answer = (payload?.candidates?.[0]?.content?.parts ?? [])
      .map((part) => String(part.text ?? ""))
      .join("")
      .trim();
    if (!answer) {
      return {
        ok: false,
        provider: "openai_compatible",
        service: "gemini",
        model: options.model,
        message: "Google AI Studio cevabı boş döndü.",
        reason: "provider_error",
        fallbackAnswer: ""
      };
    }

    return {
      ok: true,
      provider: "openai_compatible",
      service: "gemini",
      model: options.model,
      answer
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const classification = classifyAIProviderFailure({ error: errorMessage, timedOut });
    return {
      ok: false,
      provider: "openai_compatible",
      service: "gemini",
      model: options.model,
      message: timedOut ? "Google AI Studio yanıtı zaman aşımına uğradı." : "Google AI Studio bağlantısı sırasında sorun oldu.",
      error: errorMessage,
      reason: classification.reason,
      fallbackAnswer: ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createGoogleGenerateContentUrl(baseUrl: string, model: string): string {
  const modelsUrl = createGoogleModelsUrl(baseUrl);
  const modelId = model.trim().replace(/^models\//, "");
  if (!modelsUrl || !modelId) {
    return "";
  }

  const parsed = new URL(modelsUrl);
  parsed.pathname = `${parsed.pathname}/${encodeURIComponent(modelId)}:generateContent`;
  parsed.search = "";
  return parsed.toString();
}

export function createGoogleGenerateContentBody(messages: AIMessage[]) {
  const systemText = messages
    .filter((message) => message.role === "system" || message.role === "developer")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");
  const contents = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    }));

  return {
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents
  };
}

export function rankGoogleAiStudioModels(models: string[]): string[] {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))]
    .sort((left, right) => {
      const scoreDifference = scoreGoogleAiStudioModel(right) - scoreGoogleAiStudioModel(left);
      return scoreDifference || left.localeCompare(right, "en");
    });
}

export async function verifyGoogleAiStudioVisionModel(
  options: GoogleAiStudioVisionCheckOptions,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<AICompletionResult> {
  const model = options.model.trim().replace(/^models\//, "");
  const url = createGoogleGenerateContentUrl(options.baseUrl, model);
  if (!url || !model) {
    return {
      ok: false,
      provider: "openai_compatible",
      service: "gemini",
      model,
      message: "Google AI Studio model bilgisi geçersiz.",
      reason: "configuration",
      fallbackAnswer: ""
    };
  }
  if (!options.apiKey.trim()) {
    return {
      ok: false,
      provider: "openai_compatible",
      service: "gemini",
      model,
      message: "Google AI Studio API anahtarı gerekli.",
      reason: "configuration",
      fallbackAnswer: ""
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": options.apiKey
      },
      body: JSON.stringify(createGoogleVisionCheckBody()),
      redirect: "error",
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as GoogleGenerateContentResponse | null;
    if (!response.ok) {
      const message = payload?.error?.message || "Google AI Studio görsel girişi kabul etmedi.";
      const providerCode = String(payload?.error?.status || payload?.error?.code || "").trim();
      const classification = classifyAIProviderFailure({
        status: response.status,
        providerCode,
        message
      });
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
      return {
        ok: false,
        provider: "openai_compatible",
        service: "gemini",
        model,
        status: response.status,
        message,
        reason: classification.reason,
        ...(classification.providerCode ? { providerCode: classification.providerCode } : {}),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        fallbackAnswer: ""
      };
    }

    const answer = (payload?.candidates?.[0]?.content?.parts ?? [])
      .map((part) => String(part.text ?? ""))
      .join("")
      .trim();
    if (!answer) {
      return {
        ok: false,
        provider: "openai_compatible",
        service: "gemini",
        message: "Google AI Studio görsel kontrolüne boş yanıt verdi.",
        fallbackAnswer: ""
      };
    }

    return {
      ok: true,
      provider: "openai_compatible",
      service: "gemini",
      model,
      answer
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const classification = classifyAIProviderFailure({ error: errorMessage, timedOut });
    return {
      ok: false,
      provider: "openai_compatible",
      service: "gemini",
      model,
      message: timedOut
        ? "Google AI Studio görsel kontrolü zaman aşımına uğradı."
        : "Google AI Studio görsel kontrolü sırasında bağlantı sorunu oldu.",
      error: errorMessage,
      reason: classification.reason,
      fallbackAnswer: ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createGoogleVisionCheckBody() {
  return {
    systemInstruction: {
      parts: [{ text: "Bu yalnızca görsel giriş uyumluluğu kontrolüdür." }]
    },
    contents: [{
      role: "user",
      parts: [
        { text: "Görsel girdisini aldıysan yalnız geçerli bir JSON nesnesi döndür." },
        {
          inlineData: {
            mimeType: "image/png",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
          }
        }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };
}

export function isGoogleAiStudioVisionModel(model: Pick<GoogleAiStudioModel, "id" | "displayName" | "description">): boolean {
  const id = model.id.trim().toLowerCase().replace(/^models\//, "");
  if (!id.startsWith("gemini-")) {
    return false;
  }

  const specializedModel = /(?:^|[-_.])(?:image|imagen|tts|live|audio|native-audio|embedding|robotics?|computer-use|deep-research|omni|translate|veo|lyria|aqa|vision)(?:[-_.]|$)/i;
  if (specializedModel.test(id)
      || /(?:^|[-_.])(?:experimental|exp|preview|latest|customtools)(?:[-_.]|$)/i.test(id)) {
    return false;
  }

  const searchableDescription = `${model.displayName} ${model.description}`.toLowerCase();
  if (/\b(?:deprecated|discontinued|shut down)\b/.test(searchableDescription)) {
    return false;
  }

  // Discover current general-purpose text + vision families from the live API.
  // Avoid a minor-version allowlist: the provider controls what is actually available.
  // Specialized (image, audio, embedding, preview, etc.) models were filtered above.
  const generalFamily = id.match(/^gemini-(\d+)(?:\.(\d+))?-(?:flash-lite|flash|pro)$/);
  return Boolean(generalFamily) && Number(generalFamily?.[1]) >= 3;
}

export async function listGoogleAiStudioModels(
  options: { baseUrl: string; apiKey: string; timeoutMs?: number },
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<GoogleAiStudioModelListResult> {
  if (!options.apiKey.trim()) {
    return { ok: false, message: "Google AI Studio API anahtarı gerekli." };
  }

  const modelsUrl = createGoogleModelsUrl(options.baseUrl);
  if (!modelsUrl) {
    return { ok: false, message: "Google AI Studio bağlantı adresi geçersiz." };
  }

  if (!fetchImpl) {
    return { ok: false, message: "AI bağlantı aracı bulunamadı." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    const response = await fetchImpl(modelsUrl, {
      headers: {
        "x-goog-api-key": options.apiKey
      },
      redirect: "error",
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as GoogleModelResponse | null;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: payload?.error?.message || "Google AI Studio model listesi alınamadı."
      };
    }

    const compatibleModels = (payload?.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => {
        const inputTokenLimit = normalizeTokenLimit(model.inputTokenLimit);
        const outputTokenLimit = normalizeTokenLimit(model.outputTokenLimit);
        return {
          id: String(model.baseModelId || model.name || "").replace(/^models\//, "").trim(),
          displayName: String(model.displayName || model.baseModelId || model.name || "").trim(),
          description: String(model.description || "").trim(),
          ...(inputTokenLimit !== undefined ? { inputTokenLimit } : {}),
          ...(outputTokenLimit !== undefined ? { outputTokenLimit } : {})
        };
      })
      .filter((model) => model.id && (isGoogleAiStudioVisionModel(model) || supportsImageGenerationModel("gemini", model.id)));
    const uniqueModels = new Map<string, GoogleAiStudioModel>();
    for (const model of compatibleModels) {
      if (!uniqueModels.has(model.id)) {
        uniqueModels.set(model.id, model);
      }
    }
    const catalog = [...uniqueModels.values()];
    const imageModels = catalog.filter(model => supportsImageGenerationModel("gemini", model.id));
    const models = catalog.filter(model => isGoogleAiStudioVisionModel(model))
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "tr"));

    if (models.length === 0) {
      return { ok: false, message: "Bu API anahtarı için görsel ve metin işleyebilen güncel Gemini modeli bulunamadı." };
    }

    return { ok: true, models, imageModels };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      message: timedOut
        ? "Google AI Studio model listesi alınırken zaman aşımı oldu."
        : "Google AI Studio model listesi alınırken bağlantı sorunu oldu."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createGoogleModelsUrl(baseUrl: string): string {
  const candidate = baseUrl.trim();
  if (!candidate) {
    return "";
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.hostname !== "generativelanguage.googleapis.com" || parsed.username || parsed.password) {
      return "";
    }

    parsed.pathname = parsed.pathname
      .replace(/\/(?:openai(?:\/chat\/completions)?|chat\/completions)\/?$/i, "")
      .replace(/\/+$/, "") + "/models";
    parsed.search = "?pageSize=1000";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeTokenLimit(value: unknown): number | undefined {
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : undefined;
}

function scoreGoogleAiStudioModel(model: string): number {
  const name = model.toLowerCase();
  const versionMatch = name.match(/gemini-(\d+)(?:\.(\d+))?/);
  const major = Number(versionMatch?.[1] ?? 0);
  const minor = Number(versionMatch?.[2] ?? 0);
  let score = major * 100 + minor * 10;

  if (name.includes("flash")) score += 50;
  if (name.includes("lite")) score += 5;
  if (!/(preview|experimental|exp|latest)/.test(name)) score += 30;
  if (name.includes("latest")) score -= 20;
  if (name.includes("preview")) score -= 60;
  if (/(experimental|\bexp\b)/.test(name)) score -= 100;
  if (major > 0 && (major < 2 || (major === 2 && minor < 5))) score -= 400;
  if (/(image|tts|live|robotics|computer-use|embedding|aqa|vision)/.test(name)) score -= 1000;
  return score;
}

function validateGoogleChatOptions(options: GoogleAiStudioChatOptions): AICompletionFailure | null {
  if (!options.model.trim()) {
    return { ok: false, provider: "openai_compatible", service: "gemini", model: options.model, message: "AI model adı gerekli.", reason: "configuration", fallbackAnswer: "" };
  }
  if (!options.apiKey.trim()) {
    return { ok: false, provider: "openai_compatible", service: "gemini", model: options.model, message: "Google AI Studio API anahtarı gerekli.", reason: "configuration", fallbackAnswer: "" };
  }
  if (options.messages.length === 0) {
    return { ok: false, provider: "openai_compatible", service: "gemini", model: options.model, message: "AI mesaj listesi boş.", reason: "configuration", fallbackAnswer: "" };
  }
  return null;
}
