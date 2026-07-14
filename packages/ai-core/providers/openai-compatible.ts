import type { AICompletionFailure, AICompletionResult, AIMessage, AIProviderConfig } from "../types";

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
      message: "AI bağlantı aracı bulunamadı.",
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
      return {
        ok: false,
        provider: "openai_compatible",
        status: response.status,
        message: payload?.error?.message || "AI cevabı alınamadı.",
        fallbackAnswer: ""
      };
    }

    const answer = extractAssistantText(payload);
    if (!answer) {
      return {
        ok: false,
        provider: "openai_compatible",
        message: "AI cevabı boş döndü.",
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
    return {
      ok: false,
      provider: "openai_compatible",
      message: "AI bağlantısı sırasında sorun oldu.",
      error: error instanceof Error ? error.message : String(error),
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
      message: "AI base URL gerekli.",
      fallbackAnswer: ""
    };
  }

  if (!options.model.trim()) {
    return {
      ok: false,
      provider: "openai_compatible",
      message: "AI model adı gerekli.",
      fallbackAnswer: ""
    };
  }

  if (!options.apiKey.trim()) {
    return {
      ok: false,
      provider: "openai_compatible",
      message: "AI API anahtarı gerekli.",
      fallbackAnswer: ""
    };
  }

  if (options.messages.length === 0) {
    return {
      ok: false,
      provider: "openai_compatible",
      message: "AI mesaj listesi boş.",
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
