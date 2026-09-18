import type { AIProviderName } from "@yardimci-asistan/ai-core";
import { BUSINESS_CAPABILITIES, hasBusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopDatabase, DesktopSetupData } from "./database";
import { getEffectiveAiApiKey } from "./ai-secret-service";

export function normalizeAiTimeoutSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.max(5, Math.min(120, Math.trunc(value)));
}

export function createDesktopAiConfig(database: DesktopDatabase, setup: DesktopSetupData) {
  const enabled = hasBusinessCapability(database.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.AI);
  const provider = (setup.aiProvider || "openai_compatible") as AIProviderName;
  const timeoutSeconds = normalizeAiTimeoutSeconds(setup.aiTimeoutSeconds);

  return {
    enabled,
    provider: enabled ? provider : "disabled" as AIProviderName,
    service: setup.aiService,
    baseUrl: setup.aiBaseUrl,
    model: setup.aiModel,
    apiKey: getEffectiveAiApiKey(database, setup.aiService),
    authMode: setup.aiService === "gemini" ? "google_api_key" as const : "bearer" as const,
    timeoutMs: timeoutSeconds * 1000
  };
}
