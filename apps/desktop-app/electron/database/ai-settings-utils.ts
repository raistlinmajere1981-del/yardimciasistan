import type {
  AiApiKeyWrite,
  DesktopAiModelOption,
  DesktopAiService
} from "../database-types.js";

export const AI_SERVICE_IDS: DesktopAiService[] = ["openai", "openrouter", "groq", "gemini", "custom"];

const SUPPORTED_AI_SERVICES = new Set<DesktopAiService>(AI_SERVICE_IDS);

export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";

export const GOOGLE_AI_STUDIO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_AI_TIMEOUT_SECONDS = 30;

export const AI_SERVICE_DEFAULT_BASE_URLS: Record<DesktopAiService, string> = {
  openai: DEFAULT_AI_BASE_URL,
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  gemini: GOOGLE_AI_STUDIO_BASE_URL,
  custom: ""
};

const AI_SERVICE_DISPLAY_NAMES: Record<DesktopAiService, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  groq: "Groq",
  gemini: "Google AI Studio",
  custom: "Özel AI servisi"
};

export function normalizeAiService(value: unknown): DesktopAiService | null {
  const service = String(value ?? "").trim().toLowerCase();
  return SUPPORTED_AI_SERVICES.has(service as DesktopAiService) ? service as DesktopAiService : null;
}

export function normalizeStoredAiService(value: unknown): DesktopAiService {
  return normalizeAiService(value) ?? "openai";
}

export function getAiServiceDisplayName(service: DesktopAiService): string {
  return AI_SERVICE_DISPLAY_NAMES[service];
}

export function normalizeAiModelOptions(value: unknown, selectedModel = ""): DesktopAiModelOption[] {
  let candidates: unknown = value;
  if (!Array.isArray(candidates)) {
    try {
      candidates = JSON.parse(String(value ?? "[]"));
    } catch {
      candidates = [];
    }
  }

  const options: DesktopAiModelOption[] = [];
  const seen = new Set<string>();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const id = String(record.id ?? "").trim();
    const rawLabel = String(record.label ?? "").trim();
    if (!id || id.length > 200 || /[\x00-\x1F\x7F]/.test(id) || seen.has(id)) {
      continue;
    }
    const label = rawLabel && rawLabel.length <= 300 && !/[\x00-\x1F\x7F]/.test(rawLabel) ? rawLabel : id;
    seen.add(id);
    options.push({ id, label });
    if (options.length >= 100) {
      break;
    }
  }

  const normalizedSelectedModel = String(selectedModel ?? "").trim();
  if (normalizedSelectedModel && !seen.has(normalizedSelectedModel)) {
    if (options.length >= 100) {
      options.pop();
    }
    options.push({ id: normalizedSelectedModel, label: normalizedSelectedModel });
  }
  return options;
}

export function normalizeAiBaseUrl(value: unknown): string {
  const candidate = String(value ?? "").trim();
  if (!candidate) {
    return "";
  }

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

export function normalizeAiTimeout(value: unknown): number | null {
  const timeout = Number(value);
  return Number.isInteger(timeout) && timeout >= 5 && timeout <= 120 ? timeout : null;
}

export function normalizeStoredAiTimeout(value: unknown): number {
  return normalizeAiTimeout(value) ?? DEFAULT_AI_TIMEOUT_SECONDS;
}

export function normalizeStoredTimestamp(value: unknown): string {
  const timestamp = String(value ?? "").trim();
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : "";
}

export function normalizePublishedTimestamp(value: string): string {
  return normalizeStoredTimestamp(value);
}

export function resolveEncryptedAiApiKey(input: {
  rawKeyProvided: boolean;
  clearRequested: boolean;
  write: AiApiKeyWrite;
  existingEncryptedValue: string;
}): { ok: true; encryptedValue: string } | { ok: false; message: string } {
  const encryptedValue = String(input.write.encryptedValue ?? "").trim();

  if (input.clearRequested) {
    if (input.rawKeyProvided || input.write.mode !== "clear" || encryptedValue) {
      return {
        ok: false,
        message: "AI güvenlik anahtarını silme isteği güvenli depolama işlemiyle eşleşmiyor."
      };
    }

    return { ok: true, encryptedValue: "" };
  }

  if (input.rawKeyProvided) {
    if (input.write.mode !== "replace" || !encryptedValue) {
      return {
        ok: false,
        message: "Yeni AI güvenlik anahtarı şifrelenmeden kaydedilemez."
      };
    }

    return { ok: true, encryptedValue };
  }

  if (input.write.mode !== "keep" || encryptedValue) {
    return {
      ok: false,
      message: "Boş AI güvenlik anahtarı mevcut kayıt korunarak kaydedilmeli."
    };
  }

  return { ok: true, encryptedValue: input.existingEncryptedValue };
}
