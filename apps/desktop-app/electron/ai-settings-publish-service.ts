import { BUSINESS_CAPABILITIES, hasBusinessCapability } from "@yardimci-asistan/shared";
import { pushAiSettings, type PushAiSettingsResult } from "@yardimci-asistan/sync-core";
import type { DesktopDatabase } from "./database";
import { normalizeAiTimeoutSeconds } from "./ai-config";
import { getEffectiveAiApiKey } from "./ai-secret-service";

export interface AiSettingsSyncConfig {
  baseUrl: string;
  syncSecret: string;
}

export async function publishSavedAiSettings(
  database: DesktopDatabase,
  syncConfig: AiSettingsSyncConfig
): Promise<PushAiSettingsResult> {
  const setup = database.getSetupData();
  const aiCapabilityEnabled = hasBusinessCapability(database.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.AI);
  const result = await pushAiSettings({
    ...syncConfig,
    aiSettings: {
      enabled: aiCapabilityEnabled,
      provider: setup.aiProvider || "openai_compatible",
      service: setup.aiService || "custom",
      baseUrl: setup.aiBaseUrl,
      model: setup.aiModel,
      apiKey: aiCapabilityEnabled ? getEffectiveAiApiKey(database, setup.aiService) : "",
      timeoutSeconds: normalizeAiTimeoutSeconds(setup.aiTimeoutSeconds)
    }
  });

  if (result.ok) {
    try {
      database.markAiSettingsPublished(result.published_at);
    } catch {
      const invalidResponse: PushAiSettingsResult = {
        ok: false,
        message: "Web modülü AI ayarını aldı ancak yayın zamanı doğrulanamadı. Web modülünü güncelleyip tekrar deneyin."
      };
      database.recordSyncEvent({
        direction: "push",
        entityType: "ai_settings",
        ok: false,
        recordCount: 0,
        message: invalidResponse.message
      });
      return invalidResponse;
    }
  }

  database.recordSyncEvent({
    direction: "push",
    entityType: "ai_settings",
    ok: result.ok,
    recordCount: result.ok ? 1 : 0,
    message: result.message,
    status: result.ok ? undefined : result.status
  });

  return result;
}
