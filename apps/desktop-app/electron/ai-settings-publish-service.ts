import { BUSINESS_CAPABILITIES, hasBusinessCapability } from "@yardimci-asistan/shared";
import { pushAiSettings, type PushAiSettingsResult } from "@yardimci-asistan/sync-core";
import type { DesktopDatabase } from "./database";
import { normalizeAiTimeoutSeconds } from "./ai-config";
import { getEffectiveAiApiKey } from "./ai-secret-service";
import { publishDesktopProjection } from "./desktop-publication-service";

export interface AiSettingsSyncConfig {
  baseUrl: string;
  syncSecret: string;
}

export async function publishSavedAiSettings(
  database: DesktopDatabase,
  syncConfig: AiSettingsSyncConfig,
  refresh = true
): Promise<PushAiSettingsResult | null> {
  const setup = database.getSetupData();
  const aiCapabilityEnabled = hasBusinessCapability(database.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.AI);
  const desired = {
      enabled: aiCapabilityEnabled,
      provider: setup.aiProvider || "openai_compatible",
      service: setup.aiService || "custom",
      baseUrl: setup.aiBaseUrl,
      model: setup.aiModel,
      apiKey: aiCapabilityEnabled ? getEffectiveAiApiKey(database, setup.aiService) : "",
      timeoutSeconds: normalizeAiTimeoutSeconds(setup.aiTimeoutSeconds)
    };
  // Optional provider configuration can be absent even while the AI capability
  // is installed. Retain intent until configured; don't fail unrelated sync.
  if (!refresh && desired.enabled && (!desired.apiKey || !desired.baseUrl || !desired.model)) return null;
  const result = await publishDesktopProjection(database, syncConfig, "ai_settings_publish", desired,
    (identity, frozen) => pushAiSettings({ ...syncConfig, ...identity, aiSettings: frozen }),
    { refresh, acknowledge: (sent, receipt) => {
      // In-flight mutations retain pending metadata as well as their newer job.
      const current = database.getSetupData();
      if (current.aiProvider === sent.provider && current.aiService === sent.service && current.aiBaseUrl === sent.baseUrl
          && current.aiModel === sent.model && normalizeAiTimeoutSeconds(current.aiTimeoutSeconds) === sent.timeoutSeconds
          && hasBusinessCapability(database.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.AI) === sent.enabled
          && (!sent.enabled || getEffectiveAiApiKey(database, current.aiService) === sent.apiKey)) database.markAiSettingsPublished(receipt.published_at);
    } });
  if (!result) return null;

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
