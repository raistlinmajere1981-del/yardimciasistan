import { BUSINESS_CAPABILITIES as C, validateBirthdaySettings, normalizeTableCategoryInputs } from "@yardimci-asistan/shared";
import type { SetupFormState } from "./setup-model";
import { settingsCapabilities, type StagedSettingsCategoryId } from "./settings-registry";

// Every Setup field has exactly one category owner. No second setup model.
export const settingsFieldOwners = {
  business: ["businessName", "profileId", "profileOptions", "phone", "whatsapp", "email", "address"],
  operations: ["roomCount", "tableCategories"],
  services: ["webModuleUrl", "syncSecret", "autoSyncEnabled", "localNetworkEnabled", "aiEnabled", "aiProvider", "aiService", "aiProjectName", "aiGoogleCurl", "aiBaseUrl", "aiModel", "aiModelOptions", "aiApiKey", "aiStoredApiKeyConfigured", "clearAiApiKey", "aiTimeoutSeconds", "aiServiceDrafts", "whatsappEnabled", "androidEnabled", "productDataEnabled", "productDataProvider", "productDataAutoSearch", "productDataIncludeImages", "birthdaySettings"]
} as const satisfies Record<StagedSettingsCategoryId, readonly (keyof SetupFormState)[]>;
export const stagedSettingsCategories = ["business", "operations", "services"] as const;

function fieldValue(form: SetupFormState, key: keyof SetupFormState) {
  return key === "tableCategories" ? form.tableCategories.map(({ sourceName, name, tableCount }) => ({ sourceName, name, tableCount })) : form[key];
}
export function isCategoryDirty(draft: SetupFormState, baseline: SetupFormState, category: StagedSettingsCategoryId) {
  return settingsFieldOwners[category].some(key => JSON.stringify(fieldValue(draft, key)) !== JSON.stringify(fieldValue(baseline, key)));
}
export function copyCategory(target: SetupFormState, source: SetupFormState, category: StagedSettingsCategoryId): SetupFormState {
  return { ...target, ...Object.fromEntries(settingsFieldOwners[category].map(key => [key, source[key]])) };
}
export function unavailableSettingsFields(canonical: SetupFormState, category: StagedSettingsCategoryId): (keyof SetupFormState)[] {
  const capabilities = settingsCapabilities(canonical);
  const fields: (keyof SetupFormState)[] = [];
  if (category === "operations") {
    if (!capabilities.includes(C.ACCOMMODATION_ROOMS)) fields.push("roomCount");
    if (!capabilities.includes(C.FOOD_TABLES)) fields.push("tableCategories");
  }
  if (category === "services" && !capabilities.includes(C.CATALOG)) {
    fields.push("productDataEnabled", "productDataProvider", "productDataAutoSearch", "productDataIncludeImages");
  }
  return fields;
}
export function mergeSettingsCategory(canonical: SetupFormState, draft: SetupFormState, category: StagedSettingsCategoryId): SetupFormState {
  const merged = copyCategory(canonical, draft, category);
  // Unsupported fields stay canonical even when a previous sector left a pending draft.
  for (const key of unavailableSettingsFields(canonical, category)) Object.assign(merged, { [key]: canonical[key] });
  return merged;
}

export function validateSettingsCategory(form: SetupFormState, category: StagedSettingsCategoryId): string | null {
  if (category === "business" && !form.businessName.trim()) return "Firma adı gerekli.";
  if ((category === "business" || category === "services") && form.whatsappEnabled && !form.whatsapp.trim()) return "WhatsApp servisi açıkken WhatsApp numarası gerekli.";
  if (category === "operations" && settingsCapabilities(form).includes(C.FOOD_TABLES)) {
    const result = normalizeTableCategoryInputs(form.tableCategories.map(row => ({ ...row, tableCount: Number(row.tableCount) })));
    if (!result.ok) return result.message;
  }
  if (category === "services") {
    if (!/^https?:\/\//i.test(form.webModuleUrl.trim())) return "Web modül adresi http veya https ile başlamalı.";
    if (form.syncSecret.trim().length < 12 || form.syncSecret.trim() === "change-this-secret") return "Web güvenlik anahtarı en az 12 karakter olmalı ve varsayılan değer olmamalı.";
    const birthdayError = validateBirthdaySettings(form.birthdaySettings);
    if (birthdayError) return birthdayError;
    if (form.aiEnabled) {
      if (!form.aiModel.trim()) return "AI model adı gerekli.";
      if (!form.aiStoredApiKeyConfigured && !form.aiApiKey.trim() && !form.aiGoogleCurl.trim()) return "AI güvenlik anahtarı gerekli.";
      try {
        const address = new URL(form.aiBaseUrl);
        if (!["http:", "https:"].includes(address.protocol) || !address.hostname || address.username || address.password) throw new Error();
      } catch {
        return "AI bağlantı adresi http veya https ile başlamalı ve kullanıcı bilgisi içermemeli.";
      }
      if (form.aiService === "gemini" && form.aiBaseUrl.replace(/\/+$/, "") !== "https://generativelanguage.googleapis.com/v1beta") return "Google AI Studio için resmi Gemini bağlantı adresi kullanılmalı.";
      const timeout = Number(form.aiTimeoutSeconds);
      if (!Number.isInteger(timeout) || timeout < 5 || timeout > 120) return "AI zaman aşımı 5 ile 120 saniye arasında olmalı.";
    }
  }
  return null;
}
