import { DatabaseSync } from "node:sqlite";
import { safeStorage } from "electron";

export interface GoogleReviewsSettings {
  enabled: boolean;
  placeId: string;
  apiKeyConfigured: boolean;
  lastPublishedAt: string;
  publicationPending: boolean;
}

export interface SaveGoogleReviewsSettingsInput {
  enabled: boolean;
  placeId: string;
  apiKey: string;
  clearApiKey: boolean;
}

export type GoogleReviewsSettingsSaveResult =
  | { ok: true; message: string; settings: GoogleReviewsSettings; warning?: boolean }
  | { ok: false; message: string };

export type GoogleReviewsConnectionTestResult =
  | { ok: true; message: string; name: string; rating: number | null; userRatingCount: number }
  | { ok: false; message: string };

export interface GoogleReviewsPublishResult {
  ok: boolean;
  message: string;
  status?: number;
  publishedAt?: string;
}

interface StoredGoogleReviewsSettings {
  enabled: boolean;
  placeId: string;
  encryptedApiKey: string;
  lastPublishedAt: string;
  publicationPending: boolean;
}

const SAFE_STORAGE_PREFIX = "safe-storage:v1:";

export function getGoogleReviewsSettings(databasePath: string): GoogleReviewsSettings {
  const stored = readStoredSettings(databasePath);
  return {
    enabled: stored.enabled,
    placeId: stored.placeId,
    apiKeyConfigured: Boolean(stored.encryptedApiKey),
    lastPublishedAt: stored.lastPublishedAt,
    publicationPending: stored.publicationPending
  };
}

export function saveGoogleReviewsSettings(
  databasePath: string,
  input: SaveGoogleReviewsSettingsInput
): GoogleReviewsSettingsSaveResult {
  const current = readStoredSettings(databasePath);
  const placeId = normalizePlaceId(input.placeId);
  if (input.placeId.trim() && !placeId) {
    return { ok: false, message: "Google Place ID geçersiz. Boşluk içermeyen geçerli Place ID değerini girin." };
  }

  const keyUpdate = resolveApiKeyUpdate(input.apiKey, input.clearApiKey, current.encryptedApiKey);
  if (!keyUpdate.ok) return keyUpdate;

  if (input.enabled && (!placeId || !keyUpdate.encryptedValue)) {
    return { ok: false, message: "Google yorumları açıkken Place ID ve Places API anahtarı gerekli." };
  }

  const db = new DatabaseSync(databasePath);
  try {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE settings
      SET google_reviews_enabled = ?,
          google_place_id = ?,
          google_places_api_key_encrypted = ?,
          google_reviews_last_published_at = '',
          google_reviews_publish_pending = 1,
          updated_at = ?
      WHERE deleted_at = ''
    `).run(input.enabled ? 1 : 0, placeId, keyUpdate.encryptedValue, now);
  } finally {
    db.close();
  }

  return {
    ok: true,
    message: input.enabled ? "Google yorumları ayarları kaydedildi." : "Google yorumları web sitesinde kapatıldı.",
    settings: getGoogleReviewsSettings(databasePath)
  };
}

export async function testGoogleReviewsConnection(
  databasePath: string,
  input: Pick<SaveGoogleReviewsSettingsInput, "placeId" | "apiKey" | "clearApiKey">
): Promise<GoogleReviewsConnectionTestResult> {
  const placeId = normalizePlaceId(input.placeId);
  if (!placeId) {
    return { ok: false, message: "Bağlantıyı denemek için geçerli Google Place ID gerekli." };
  }

  const current = readStoredSettings(databasePath);
  const rawKey = String(input.apiKey ?? "").trim();
  const apiKey = rawKey || (input.clearApiKey ? "" : decryptApiKey(current.encryptedApiKey));
  if (!apiKey) {
    return { ok: false, message: "Bağlantıyı denemek için Places API anahtarı gerekli." };
  }

  return fetchGooglePlaceSummary(apiKey, placeId);
}

export async function publishGoogleReviewsSettings(
  databasePath: string,
  syncConfig: { baseUrl: string; syncSecret: string },
  clientId: string
): Promise<GoogleReviewsPublishResult> {
  const stored = readStoredSettings(databasePath);
  const baseUrl = syncConfig.baseUrl.trim().replace(/\/+$/, "");
  const syncSecret = syncConfig.syncSecret.trim();
  if (!baseUrl || !syncSecret || !clientId.trim()) {
    return { ok: false, message: "Google yorumları web yayını için web modül bağlantısı hazır değil." };
  }

  const apiKey = stored.enabled ? decryptApiKey(stored.encryptedApiKey) : "";
  if (stored.enabled && (!stored.placeId || !apiKey)) {
    return { ok: false, message: "Google yorumları açık ancak Place ID veya API anahtarı okunamıyor." };
  }

  try {
    const response = await fetch(`${baseUrl}/api/sync.php?action=publish_google_reviews_settings`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-YA-Sync-Secret": syncSecret
      },
      body: JSON.stringify({
        action: "publish_google_reviews_settings",
        client_id: clientId,
        google_reviews: {
          enabled: stored.enabled,
          place_id: stored.placeId,
          api_key: apiKey
        }
      })
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string; published_at?: string } | null;
    if (!response.ok || payload?.ok !== true) {
      return {
        ok: false,
        status: response.status,
        message: String(payload?.message || `Google yorumları web modülüne gönderilemedi (HTTP ${response.status}).`)
      };
    }

    const publishedAt = String(payload.published_at ?? "").trim();
    markPublished(databasePath, publishedAt);
    return {
      ok: true,
      message: String(payload.message || "Google yorumları ayarları web modülüne uygulandı."),
      publishedAt
    };
  } catch {
    return { ok: false, message: "Google yorumları ayarları gönderilirken web modülüne ulaşılamadı." };
  }
}

function readStoredSettings(databasePath: string): StoredGoogleReviewsSettings {
  const db = new DatabaseSync(databasePath);
  try {
    const row = db.prepare(`
      SELECT google_reviews_enabled, google_place_id, google_places_api_key_encrypted,
             google_reviews_last_published_at, google_reviews_publish_pending
      FROM settings
      WHERE deleted_at = ''
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    return {
      enabled: Number(row?.google_reviews_enabled ?? 0) === 1,
      placeId: String(row?.google_place_id ?? "").trim(),
      encryptedApiKey: String(row?.google_places_api_key_encrypted ?? "").trim(),
      lastPublishedAt: String(row?.google_reviews_last_published_at ?? "").trim(),
      publicationPending: Number(row?.google_reviews_publish_pending ?? 0) === 1
    };
  } finally {
    db.close();
  }
}

function resolveApiKeyUpdate(
  rawValue: unknown,
  clearRequested: boolean,
  existingEncryptedValue: string
): { ok: true; encryptedValue: string } | { ok: false; message: string } {
  if (clearRequested) return { ok: true, encryptedValue: "" };

  const apiKey = String(rawValue ?? "").trim();
  if (!apiKey) return { ok: true, encryptedValue: existingEncryptedValue };
  if (apiKey.length > 8192 || /[\x00-\x1F\x7F]/.test(apiKey)) {
    return { ok: false, message: "Places API anahtarı geçersiz karakter içeriyor." };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, message: "Places API anahtarı bu cihazda güvenli biçimde saklanamıyor." };
  }

  try {
    return {
      ok: true,
      encryptedValue: SAFE_STORAGE_PREFIX + safeStorage.encryptString(apiKey).toString("base64")
    };
  } catch {
    return { ok: false, message: "Places API anahtarı güvenli biçimde kaydedilemedi." };
  }
}

function decryptApiKey(encryptedValue: string): string {
  if (!encryptedValue.startsWith(SAFE_STORAGE_PREFIX) || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(encryptedValue.slice(SAFE_STORAGE_PREFIX.length), "base64")).trim();
  } catch {
    return "";
  }
}

function normalizePlaceId(value: unknown): string {
  const placeId = String(value ?? "").trim();
  if (!placeId || placeId.length > 255 || /\s|[\x00-\x1F\x7F]/.test(placeId)) return "";
  return placeId;
}

async function fetchGooglePlaceSummary(apiKey: string, placeId: string): Promise<GoogleReviewsConnectionTestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=tr`,
      {
        headers: {
          "Accept": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "displayName,rating,userRatingCount"
        },
        signal: controller.signal
      }
    );
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      if (response.status === 403) {
        return { ok: false, message: "Google bağlantısı reddedildi. API anahtarı, Places API (New), faturalandırma ve anahtar kısıtlamalarını kontrol edin." };
      }
      if (response.status === 400 || response.status === 404) {
        return { ok: false, message: "Google Place ID doğrulanamadı. İşletmenin Place ID değerini kontrol edin." };
      }
      return { ok: false, message: `Google Places bağlantısı doğrulanamadı (HTTP ${response.status}).` };
    }

    const displayName = payload?.displayName;
    const name = displayName && typeof displayName === "object"
      ? String((displayName as Record<string, unknown>).text ?? "").trim()
      : "";
    const ratingValue = Number(payload?.rating);
    const countValue = Number(payload?.userRatingCount);
    return {
      ok: true,
      message: "Google Places bağlantısı doğrulandı.",
      name: name || "Google işletmesi",
      rating: Number.isFinite(ratingValue) ? ratingValue : null,
      userRatingCount: Number.isFinite(countValue) ? Math.max(0, Math.trunc(countValue)) : 0
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.name === "AbortError"
        ? "Google Places bağlantısı zaman aşımına uğradı."
        : "Google Places servisine ulaşılamadı."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function markPublished(databasePath: string, publishedAt: string) {
  if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) return;
  const db = new DatabaseSync(databasePath);
  try {
    db.prepare(`
      UPDATE settings
      SET google_reviews_last_published_at = ?, google_reviews_publish_pending = 0, updated_at = ?
      WHERE deleted_at = ''
    `).run(publishedAt, new Date().toISOString());
  } finally {
    db.close();
  }
}
