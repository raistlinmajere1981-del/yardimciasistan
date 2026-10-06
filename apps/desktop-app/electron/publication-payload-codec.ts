import { safeStorage } from "electron";

/** Freeze sensitive config with the same OS key boundary as saved provider keys. */
export function encodePublicationPayload(name: string, json: string): string {
  const candidate = JSON.parse(json) as { apiKey?: string; api_key?: string };
  if ((name === "ai_settings" || name === "google_reviews_settings") && (candidate.apiKey || candidate.api_key)) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Publication secret güvenli biçimde saklanamıyor.");
    return `safe-storage:v1:${safeStorage.encryptString(json).toString("base64")}`;
  }
  return json;
}

export function decodePublicationPayload(payload: string): string {
  return payload.startsWith("safe-storage:v1:")
    ? safeStorage.decryptString(Buffer.from(payload.slice("safe-storage:v1:".length), "base64")) : payload;
}
