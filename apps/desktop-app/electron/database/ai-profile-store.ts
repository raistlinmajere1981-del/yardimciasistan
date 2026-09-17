import type { DatabaseSync } from "node:sqlite";
import type {
  DesktopAiService,
  DesktopAiServiceProfile
} from "../database-types.js";
import {
  AI_SERVICE_DEFAULT_BASE_URLS,
  AI_SERVICE_IDS,
  DEFAULT_AI_TIMEOUT_SECONDS,
  normalizeAiBaseUrl,
  normalizeAiModelOptions,
  normalizeAiService,
  normalizePublishedTimestamp,
  normalizeStoredAiService,
  normalizeStoredAiTimeout,
  normalizeStoredTimestamp
} from "./ai-settings-utils.js";

export interface AiServiceProfileUpsert {
  service: string;
  projectName: string;
  baseUrl: string;
  model: string;
  modelOptionsJson: string;
  timeoutSeconds: number;
  apiKeyEncrypted: string;
  createdAt: string;
  now: string;
}

export function getAiServiceProfiles(db: DatabaseSync): DesktopAiServiceProfile[] {
  const settings = db
    .prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  const activeService = normalizeStoredAiService(settings?.ai_service);
  const rows = db
    .prepare("SELECT * FROM ai_service_profiles ORDER BY service")
    .all() as Array<Record<string, unknown>>;
  const rowsByService = new Map<DesktopAiService, Record<string, unknown>>();

  for (const row of rows) {
    const service = normalizeAiService(row.service);
    if (service) {
      rowsByService.set(service, row);
    }
  }

  return AI_SERVICE_IDS.map((service) => {
    const row = rowsByService.get(service);
    const useActiveSettings = !row && service === activeService;
    const model = String(row?.model ?? (useActiveSettings ? settings?.ai_model : "") ?? "").trim();
    const baseUrl = normalizeAiBaseUrl(row?.base_url ?? (useActiveSettings ? settings?.ai_base_url : ""))
      || AI_SERVICE_DEFAULT_BASE_URLS[service];
    return {
      service,
      projectName: String(row?.project_name ?? (useActiveSettings ? settings?.ai_project_name : "") ?? "").trim(),
      baseUrl,
      model,
      modelOptions: normalizeAiModelOptions(row?.model_options_json, model),
      timeoutSeconds: normalizeStoredAiTimeout(row?.timeout_seconds ?? (useActiveSettings ? settings?.ai_timeout_seconds : DEFAULT_AI_TIMEOUT_SECONDS)),
      apiKeyConfigured: Boolean(String(row?.api_key_encrypted ?? (useActiveSettings ? settings?.ai_api_key_encrypted : "") ?? "").trim()),
      updatedAt: normalizeStoredTimestamp(row?.updated_at ?? (useActiveSettings ? settings?.updated_at : ""))
    };
  });
}

export function getEncryptedAiApiKey(db: DatabaseSync, service?: DesktopAiService | string): string {
  const settings = db
    .prepare("SELECT ai_service, ai_api_key_encrypted FROM settings WHERE deleted_at = '' LIMIT 1")
    .get() as { ai_service?: string; ai_api_key_encrypted?: string } | undefined;
  const requestedService = service === undefined ? normalizeStoredAiService(settings?.ai_service) : normalizeAiService(service);

  if (!requestedService) {
    return "";
  }

  const profile = db
    .prepare("SELECT api_key_encrypted FROM ai_service_profiles WHERE service = ? LIMIT 1")
    .get(requestedService) as { api_key_encrypted?: string } | undefined;
  if (profile) {
    return String(profile.api_key_encrypted ?? "").trim();
  }

  return normalizeStoredAiService(settings?.ai_service) === requestedService
    ? String(settings?.ai_api_key_encrypted ?? "").trim()
    : "";
}

export function markAiSettingsPublished(db: DatabaseSync, timestamp: string): void {
  const publishedAt = normalizePublishedTimestamp(timestamp);
  if (!publishedAt) {
    throw new Error("AI ayarları için geçerli yayın zamanı gerekli.");
  }

  const result = db
    .prepare(`
        UPDATE settings
        SET ai_last_published_at = ?,
            updated_at = ?
        WHERE deleted_at = ''
      `)
    .run(publishedAt, new Date().toISOString());

  if (Number(result.changes) === 0) {
    throw new Error("Yayınlandı olarak işaretlenecek AI ayarı bulunamadı.");
  }
}

export function upsertAiServiceProfileInTransaction(db: DatabaseSync, profile: AiServiceProfileUpsert): void {
  db
    .prepare(`
        INSERT INTO ai_service_profiles (
          service,
          project_name,
          base_url,
          model,
          model_options_json,
          timeout_seconds,
          api_key_encrypted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(service) DO UPDATE SET
          project_name = excluded.project_name,
          base_url = excluded.base_url,
          model = excluded.model,
          model_options_json = excluded.model_options_json,
          timeout_seconds = excluded.timeout_seconds,
          api_key_encrypted = excluded.api_key_encrypted,
          updated_at = excluded.updated_at
      `)
    .run(
      profile.service,
      profile.projectName,
      profile.baseUrl,
      profile.model,
      profile.modelOptionsJson,
      profile.timeoutSeconds,
      profile.apiKeyEncrypted,
      profile.createdAt,
      profile.now
    );
}
