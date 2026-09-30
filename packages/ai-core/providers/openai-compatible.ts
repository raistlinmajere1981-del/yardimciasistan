import type { AICompletionFailure, AICompletionResult, AIMessage, AIProviderConfig } from "../types";
import { classifyAIProviderFailure, parseRetryAfterSeconds } from "./failure-classification";

export interface OpenAICompatibleChatOptions extends AIProviderConfig {
  messages: AIMessage[];
  authMode?: "bearer" | "google_api_key";
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export async function generateOpenAICompatibleChat(options: OpenAICompatibleChatOptions, fetchImpl: typeof fetch = globalThis.fetch): Promise<AICompletionResult> {
  const validationFailure = validateOptions(options);
  if (validationFailure) {
    return validationFailure;
  }

  if (!fetchImpl) {
    return {
      ok: false,
      provider: "openai_compatible",
      service: options.service,
      model: options.model,
      message: "AI bağlantı aracı bulunamadı.",
      reason: "configuration",
      fallbackAnswer: ""
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    const response = await fetchImpl(createChatCompletionsUrl(options.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.authMode === "google_api_key"
          ? { "x-goog-api-key": options.apiKey }
          : { Authorization: `Bearer ${options.apiKey}` })
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        store: false
      }),
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as ChatCompletionResponse | null;

    if (!response.ok) {
      const providerCode = String(payload?.error?.code || payload?.error?.type || "").trim();
      const message = payload?.error?.message || "AI cevabı alınamadı.";
      const classification = classifyAIProviderFailure({
        status: response.status,
        providerCode,
        message
      });
      return {
        ok: false,
        provider: "openai_compatible",
        service: options.service,
        model: options.model,
        status: response.status,
        message,
        reason: classification.reason,
        ...(classification.providerCode ? { providerCode: classification.providerCode } : {}),
        ...(parseRetryAfterSeconds(response.headers.get("retry-after")) !== undefined
          ? { retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after")) }
          : {}),
        fallbackAnswer: ""
      };
    }

    const answer = extractAssistantText(payload);
    if (!answer) {
      return {
        ok: false,
        provider: "openai_compatible",
        service: options.service,
        model: options.model,
        message: "AI cevabı boş döndü.",
        reason: "provider_error",
        fallbackAnswer: ""
      };
    }

    return {
      ok: true,
      provider: "openai_compatible",
      model: options.model,
      answer
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const classification = classifyAIProviderFailure({
      error: errorMessage,
      timedOut
    });
    return {
      ok: false,
      provider: "openai_compatible",
      service: options.service,
      model: options.model,
      message: timedOut ? "AI yanıtı zaman aşımına uğradı." : "AI bağlantısı sırasında sorun oldu.",
      error: errorMessage,
      reason: classification.reason,
      fallbackAnswer: ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createChatCompletionsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (normalizedBaseUrl.endsWith("/chat/completions")) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}/chat/completions`;
}

function validateOptions(options: OpenAICompatibleChatOptions): AICompletionFailure | null {
  if (!options.baseUrl.trim()) {
    return {
      ok: false,
      provider: "openai_compatible",
      service: options.service,
      model: options.model,
      message: "AI base URL gerekli.",
      reason: "configuration",
      fallbackAnswer: ""
    };
  }

  if (!options.model.trim()) {
    return {
      ok: false,
      provider: "openai_compatible",
      service: options.service,
      model: options.model,
      message: "AI model adı gerekli.",
      reason: "configuration",
      fallbackAnswer: ""
    };
  }

  if (!options.apiKey.trim()) {
    return {
      ok: false,
      provider: "openai_compatible",
      service: options.service,
      model: options.model,
      message: "AI API anahtarı gerekli.",
      reason: "configuration",
      fallbackAnswer: ""
    };
  }

  if (options.messages.length === 0) {
    return {
      ok: false,
      provider: "openai_compatible",
      service: options.service,
      model: options.model,
      message: "AI mesaj listesi boş.",
      reason: "configuration",
      fallbackAnswer: ""
    };
  }

  return null;
}

function extractAssistantText(payload: ChatCompletionResponse | null): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? "").join("").trim();
  }

  return "";
}
