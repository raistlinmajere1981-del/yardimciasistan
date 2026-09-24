import type { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  getBusinessProfile,
  normalizeBirthdaySettings,
  normalizeBusinessType,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { DesktopSetupData } from "./database-types.js";
import { getAiServiceProfiles as getStoredAiServiceProfiles } from "./database/ai-profile-store.js";
import {
  normalizeStoredAiService,
  normalizeStoredTimestamp
} from "./database/ai-settings-utils.js";
import { normalizeBoolean } from "./database/request-utils.js";

export function getSetupData(db: DatabaseSync, enabledCapabilities: ReadonlySet<BusinessCapability>): DesktopSetupData {
  const business = db.prepare("SELECT * FROM business WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
  const settings = db.prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
  const syncSecret = String(settings?.sync_secret ?? "");
  const businessName = String(business?.display_name ?? "");
  const aiService = normalizeStoredAiService(settings?.ai_service);
  const aiProfiles = getStoredAiServiceProfiles(db);
  const activeAiProfile = aiProfiles.find((profile) => profile.service === aiService);
  const profileId = normalizeBusinessType(String(business?.profile_id ?? ""));
  const profile = getBusinessProfile(profileId);
  const setupCompleted = Number(settings?.setup_completed ?? 0) === 1;
  const setupRequired =
    !setupCompleted ||
    !businessName.trim() ||
    syncSecret.length < 12 ||
    syncSecret === "change-this-secret";

  return {
    setupRequired,
    appPasswordConfigured: Boolean(String(settings?.app_password_verifier ?? "").trim()),
    businessName,
    profileId,
    profileOptions: setupCompleted
      ? profile.optionalCapabilities.filter((capability) => enabledCapabilities.has(capability))
      : [...profile.defaultOptionalCapabilities],
    phone: String(business?.phone ?? ""),
    whatsapp: String(business?.whatsapp ?? ""),
    email: String(business?.email ?? ""),
    address: String(business?.address ?? ""),
    webModuleUrl: String(settings?.web_module_url ?? "https://yardimciasistan.alwaysdata.net/yardimci-asistan"),
    syncSecret,
    autoSyncEnabled: Number(settings?.auto_sync_enabled ?? 1) === 1,
    localNetworkEnabled: Number(settings?.local_network_enabled ?? 1) === 1,
    aiEnabled: enabledCapabilities.has(BUSINESS_CAPABILITIES.AI),
    aiProvider: String(settings?.ai_provider ?? "openai_compatible") || "openai_compatible",
    aiService,
    aiProjectName: activeAiProfile?.projectName ?? "",
    aiModel: activeAiProfile?.model ?? "",
    aiBaseUrl: activeAiProfile?.baseUrl ?? "",
    aiTimeoutSeconds: activeAiProfile?.timeoutSeconds ?? 30,
    aiApiKeyConfigured: activeAiProfile?.apiKeyConfigured ?? false,
    aiLastPublishedAt: normalizeStoredTimestamp(settings?.ai_last_published_at),
    aiProfiles,
    productData: {
      enabled: Number(settings?.product_data_enabled ?? 0) === 1,
      provider: "open_food_facts",
      autoSearchUnknownBarcode: Number(settings?.product_data_auto_search ?? 1) === 1,
      includeImages: Number(settings?.product_data_include_images ?? 1) === 1
    },
    servicePreferences: {
      whatsapp: enabledCapabilities.has(BUSINESS_CAPABILITIES.WHATSAPP),
      android: enabledCapabilities.has(BUSINESS_CAPABILITIES.ANDROID)
    },
    birthdaySettings: normalizeBirthdaySettings({
      enabled: normalizeBoolean(settings?.birthday_enabled, true),
      mode: settings?.birthday_mode === "automatic" ? "automatic" : "manual",
      sendTime: String(settings?.birthday_send_time ?? "10:00"),
      messageTemplate: String(settings?.birthday_message_template ?? "")
    })
  };
}

