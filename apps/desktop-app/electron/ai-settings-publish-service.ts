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
      sttModel: setup.aiSttModel ?? "",
      ...(setup.aiService === "cloudflare" ? { visionModel: setup.aiVisionModel ?? "" } : {}),
      apiKey: aiCapabilityEnabled ? getEffectiveAiApiKey(database, setup.aiService) : "",
      timeoutSeconds: normalizeAiTimeoutSeconds(setup.aiTimeoutSeconds)
    };
  // Optional provider configuration can be absent even while the AI capability
  // is installed. Retain intent until configured; don't fail unrelated sync.
  if (!refresh && desired.enabled && (!desired.apiKey || !desired.baseUrl || !desired.model)) {
    const restore = database.getRestoreReconciliationStatus();
    if (!restore || restore.state === "complete") return null;
    // An explicitly restored unconfigured provider is unavailable, not permission
    // to keep a newer remote provider active. Preserve local desired config. An
    // unreadable EXISTING key is different: retain the job rather than clear it.
    if (setup.aiApiKeyConfigured && !desired.apiKey) return { ok: false, message: "Geri yüklenen AI anahtarı okunamıyor; reconciliation bekliyor.", error: "restore_ai_secret_unavailable" };
    desired.enabled = false;
    desired.apiKey = "";
  }
  const result = await publishDesktopProjection(database, syncConfig, "ai_settings_publish", desired,
    (identity, frozen) => pushAiSettings({ ...syncConfig, ...identity, aiSettings: frozen }),
    { refresh, acknowledge: (sent, receipt) => {
      // In-flight mutations retain pending metadata as well as their newer job.
      const current = database.getSetupData();
      const currentCapabilityEnabled = hasBusinessCapability(database.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.AI);
      const restore = database.getRestoreReconciliationStatus();
      const effectiveEnabled = currentCapabilityEnabled && (!(restore && restore.state !== "complete")
        || Boolean(current.aiBaseUrl && current.aiModel && getEffectiveAiApiKey(database, current.aiService)));
      if (current.aiProvider === sent.provider && current.aiService === sent.service && current.aiBaseUrl === sent.baseUrl
          && current.aiModel === sent.model && normalizeAiTimeoutSeconds(current.aiTimeoutSeconds) === sent.timeoutSeconds
          && (current.aiSttModel ?? "") === sent.sttModel
          && (current.aiService !== "cloudflare" || (current.aiVisionModel ?? "") === (sent.visionModel ?? ""))
          && effectiveEnabled === sent.enabled
          && (!sent.enabled || getEffectiveAiApiKey(database, current.aiService) === sent.apiKey)) database.markAiSettingsPublished(receipt.published_at);
    } });
  if (!result) return null;

  database.recordSyncEvent({
    direction: "push",
    entityType: "ai_settings",
    ok: result.ok,
    recordCount: result.ok ? 1 : 0,
    message: result.message,
    ...(!result.ok && result.status !== undefined ? { status: result.status } : {})
  });

  return result;
}
