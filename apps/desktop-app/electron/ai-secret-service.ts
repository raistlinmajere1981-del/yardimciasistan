import { safeStorage } from "electron";
import type {
  DesktopAiService,
  DesktopDatabase,
  SaveAiServiceProfileInput,
  SaveInitialSetupInput
} from "./database";

export type AiApiKeyUpdate =
  | { mode: "keep" }
  | { mode: "replace"; encryptedValue: string }
  | { mode: "clear" };

export type AiApiKeyRevealResult =
  | { ok: true; apiKey: string }
  | { ok: false; message: string };

export function createAiApiKeyUpdate(input: SaveInitialSetupInput): { ok: true; update: AiApiKeyUpdate } | { ok: false; message: string } {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      message: "Kaydedilecek ayarlar okunamadı."
    };
  }

  return createEncryptedAiApiKeyUpdate(input.aiApiKey, input.clearAiApiKey);
}

export function createAiProfileApiKeyUpdates(input: SaveInitialSetupInput):
  | {
      ok: true;
      profiles: SaveAiServiceProfileInput[];
      updates: Partial<Record<DesktopAiService, AiApiKeyUpdate>>;
    }
  | { ok: false; message: string } {
  const profiles = Array.isArray(input.aiProfiles) ? input.aiProfiles : [];
  const supportedServices = new Set<DesktopAiService>(["openai", "openrouter", "groq", "gemini", "cloudflare", "custom"]);
  const updates: Partial<Record<DesktopAiService, AiApiKeyUpdate>> = {};
  const sanitizedProfiles: SaveAiServiceProfileInput[] = [];

  for (const profile of profiles) {
    const service = String(profile?.service ?? "").trim().toLowerCase() as DesktopAiService;
    if (!supportedServices.has(service)) {
      return { ok: false, message: "Kaydedilecek AI servis profillerinden biri geçersiz." };
    }

    const apiKey = String(profile.apiKey ?? "").trim();
    if (service !== input.aiService) {
      const update = createEncryptedAiApiKeyUpdate(apiKey, Boolean(profile.clearApiKey));
      if (!update.ok) {
        return update;
      }
      updates[service] = update.update;
    }
    sanitizedProfiles.push({
      ...profile,
      service,
      apiKey: apiKey ? "__encrypted_in_main_process__" : ""
    });
  }

  return { ok: true, profiles: sanitizedProfiles, updates };
}

export function getEffectiveAiApiKey(database: DesktopDatabase, service?: string) {
  const encryptedValue = database.getEncryptedAiApiKey(service);
  if (encryptedValue.startsWith("safe-storage:v1:")) {
    if (!safeStorage.isEncryptionAvailable()) {
      return "";
    }

    try {
      const payload = encryptedValue.slice("safe-storage:v1:".length);
      return safeStorage.decryptString(Buffer.from(payload, "base64")).trim();
    } catch {
      return "";
    }
  }

  return "";
}

export function revealStoredAiApiKey(database: DesktopDatabase, serviceValue: unknown): AiApiKeyRevealResult {
  const service = String(serviceValue ?? "").trim().toLowerCase() as DesktopAiService;
  if (!["openai", "openrouter", "groq", "gemini", "cloudflare", "custom"].includes(service)) {
    return { ok: false, message: "API anahtarı için geçerli bir servis sağlayıcı seçin." };
  }

  const encryptedValue = database.getEncryptedAiApiKey(service);
  if (!encryptedValue) {
    return { ok: false, message: "Bu sağlayıcı için kayıtlı bir API anahtarı bulunamadı." };
  }
  if (!encryptedValue.startsWith("safe-storage:v1:") || !safeStorage.isEncryptionAvailable()) {
    return { ok: false, message: "Kayıtlı API anahtarı bu cihazda çözülemiyor." };
  }

  try {
    const payload = encryptedValue.slice("safe-storage:v1:".length);
    const apiKey = safeStorage.decryptString(Buffer.from(payload, "base64")).trim();
    return apiKey
      ? { ok: true, apiKey }
      : { ok: false, message: "Kayıtlı API anahtarı boş." };
  } catch {
    return { ok: false, message: "Kayıtlı API anahtarı çözülemedi." };
  }
}

function createEncryptedAiApiKeyUpdate(apiKeyValue: unknown, clearRequested: boolean): { ok: true; update: AiApiKeyUpdate } | { ok: false; message: string } {
  if (clearRequested) {
    return {
      ok: true,
      update: { mode: "clear" }
    };
  }

  const apiKey = String(apiKeyValue ?? "").trim();
  if (!apiKey) {
    return {
      ok: true,
      update: { mode: "keep" }
    };
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      message: "Gizli erişim anahtarı bu cihazda güvenli biçimde saklanamıyor. İşletim sistemi anahtar kasasını kontrol edin."
    };
  }

  try {
    const encryptedValue = safeStorage.encryptString(apiKey).toString("base64");
    return {
      ok: true,
      update: {
        mode: "replace",
        encryptedValue: `safe-storage:v1:${encryptedValue}`
      }
    };
  } catch {
    return {
      ok: false,
      message: "Gizli erişim anahtarı güvenli biçimde kaydedilemedi."
    };
  }
}
