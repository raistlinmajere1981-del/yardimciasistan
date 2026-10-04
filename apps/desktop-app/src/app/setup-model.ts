import { emptyWhatsAppCloudConfiguration, type WhatsAppCloudConfigurationInput } from "@yardimci-asistan/shared";
import type {
  DesktopAiModelOption,
  DesktopAiService,
  DesktopSetupData,
  SaveInitialSetupInput
} from "../../electron/database";
import {
  emptyArasShippingConfiguration,
  type ArasShippingConfigurationInput,
  getBusinessProfile,
  normalizeBirthdaySettings,
  type BirthdaySettings,
  type OnlineSalesDeliverySettings,
  type BusinessCapability
} from "@yardimci-asistan/shared";

export interface AiServiceFormDraft {
  projectName: string;
  googleCurl: string;
  baseUrl: string;
  model: string;
  modelOptions: DesktopAiModelOption[];
  apiKey: string;
  storedApiKeyConfigured: boolean;
  clearApiKey: boolean;
  timeoutSeconds: string;
}

export interface SetupFormState {
  businessName: string;
  profileId: string;
  profileOptions: BusinessCapability[];
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  webModuleUrl: string;
  syncSecret: string;
  autoSyncEnabled: boolean;
  localNetworkEnabled: boolean;
  aiEnabled: boolean;
  aiProvider: string;
  aiService: DesktopAiService;
  aiProjectName: string;
  aiGoogleCurl: string;
  aiBaseUrl: string;
  aiModel: string;
  aiModelOptions: DesktopAiModelOption[];
  aiApiKey: string;
  aiStoredApiKeyConfigured: boolean;
  clearAiApiKey: boolean;
  aiTimeoutSeconds: string;
  aiServiceDrafts: Partial<Record<DesktopAiService, AiServiceFormDraft>>;
  whatsappEnabled: boolean;
  androidEnabled: boolean;
  productDataEnabled: boolean;
  productDataProvider: "open_food_facts";
  productDataAutoSearch: boolean;
  productDataIncludeImages: boolean;
  birthdaySettings: BirthdaySettings;
  whatsappCloud: WhatsAppCloudConfigurationInput & { hasSecret: boolean; configured: boolean };
  arasShipping: ArasShippingConfigurationInput & { hasSecret: boolean; configured: boolean };
  dealerPortalEnabled: boolean;
  onlineSalesDelivery: OnlineSalesDeliverySettings;
}

export const aiServicePresets = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "gemini", label: "Google AI Studio (Gemini)", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "custom", label: "Özel OpenAI uyumlu servis", baseUrl: "" }
] as const satisfies ReadonlyArray<{
  id: DesktopAiService;
  label: string;
  baseUrl: string;
}>;

export function normalizeAiService(service: string): DesktopAiService {
  return aiServicePresets.some((preset) => preset.id === service)
    ? service as DesktopAiService
    : "openai";
}

export function toSetupForm(setupData: DesktopSetupData): SetupFormState {
  const service = normalizeAiService(setupData.aiService);
  const aiServiceDrafts = createAiServiceFormDrafts(setupData);
  const activeAiDraft = aiServiceDrafts[service] ?? createDefaultAiServiceDraft(service);

  return {
    businessName: setupData.businessName || "",
    profileId: setupData.profileId || "pension_restaurant",
    profileOptions: [...setupData.profileOptions],
    phone: setupData.phone || "",
    whatsapp: setupData.whatsapp || "",
    email: setupData.email || "",
    address: setupData.address || "",
    webModuleUrl: setupData.webModuleUrl || "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
    syncSecret: setupData.syncSecret && setupData.syncSecret !== "change-this-secret" ? setupData.syncSecret : generateSyncSecret(),
    autoSyncEnabled: setupData.autoSyncEnabled,
    localNetworkEnabled: setupData.localNetworkEnabled !== false,
    aiEnabled: setupData.aiEnabled,
    aiProvider: setupData.aiProvider || "openai_compatible",
    aiService: service,
    aiProjectName: activeAiDraft.projectName,
    aiGoogleCurl: activeAiDraft.googleCurl,
    aiBaseUrl: activeAiDraft.baseUrl,
    aiModel: activeAiDraft.model,
    aiModelOptions: activeAiDraft.modelOptions,
    aiApiKey: activeAiDraft.apiKey,
    aiStoredApiKeyConfigured: activeAiDraft.storedApiKeyConfigured,
    clearAiApiKey: activeAiDraft.clearApiKey,
    aiTimeoutSeconds: activeAiDraft.timeoutSeconds,
    aiServiceDrafts,
    whatsappEnabled: setupData.servicePreferences.whatsapp,
    androidEnabled: setupData.servicePreferences.android,
    whatsappCloud: { ...(setupData.whatsappCloud ?? emptyWhatsAppCloudConfiguration()), accessToken: "", clearAccessToken: false },
    arasShipping: { ...(setupData.arasShipping ?? emptyArasShippingConfiguration()), password: "", clearPassword: false },
    dealerPortalEnabled: setupData.dealerPortalEnabled ?? false,
    onlineSalesDelivery: { ...(setupData.onlineSalesDelivery ?? { pickupEnabled: true, shippingEnabled: false }) },
    productDataEnabled: setupData.productData.enabled,
    productDataProvider: setupData.productData.provider,
    productDataAutoSearch: setupData.productData.autoSearchUnknownBarcode,
    productDataIncludeImages: setupData.productData.includeImages,
    birthdaySettings: { ...normalizeBirthdaySettings(setupData.birthdaySettings), mode: "manual" }
  };
}

export function createProfileOptionDefaults(profileId: string): BusinessCapability[] {
  return [...getBusinessProfile(profileId).defaultOptionalCapabilities];
}

function createAiServiceFormDrafts(setupData: DesktopSetupData): Partial<Record<DesktopAiService, AiServiceFormDraft>> {
  const profiles = Array.isArray(setupData.aiProfiles) ? setupData.aiProfiles : [];
  return Object.fromEntries(aiServicePresets.map((preset) => {
    const profile = profiles.find((candidate) => candidate.service === preset.id);
    const isActiveService = setupData.aiService === preset.id;
    const draft = createDefaultAiServiceDraft(preset.id);
    return [preset.id, {
      ...draft,
      projectName: profile?.projectName ?? (isActiveService ? setupData.aiProjectName : ""),
      baseUrl: profile?.baseUrl || (isActiveService ? setupData.aiBaseUrl : preset.baseUrl) || "",
      model: profile?.model ?? (isActiveService ? setupData.aiModel : ""),
      modelOptions: profile?.modelOptions ?? (
        isActiveService && setupData.aiModel
          ? [{ id: setupData.aiModel, label: setupData.aiModel }]
          : []
      ),
      timeoutSeconds: String(profile?.timeoutSeconds ?? (isActiveService ? setupData.aiTimeoutSeconds : 30) ?? 30),
      storedApiKeyConfigured: profile?.apiKeyConfigured ?? (isActiveService && setupData.aiApiKeyConfigured)
    } satisfies AiServiceFormDraft];
  })) as Partial<Record<DesktopAiService, AiServiceFormDraft>>;
}

export function createDefaultAiServiceDraft(service: DesktopAiService): AiServiceFormDraft {
  const preset = aiServicePresets.find((candidate) => candidate.id === service);
  return {
    projectName: service === "gemini" ? "Google AI Studio" : "",
    googleCurl: "",
    baseUrl: preset?.baseUrl ?? "",
    model: "",
    modelOptions: [],
    apiKey: "",
    storedApiKeyConfigured: false,
    clearApiKey: false,
    timeoutSeconds: "30"
  };
}

export function toAiServiceFormDraft(form: SetupFormState): AiServiceFormDraft {
  return {
    projectName: form.aiProjectName,
    googleCurl: form.aiGoogleCurl,
    baseUrl: form.aiBaseUrl,
    model: form.aiModel,
    modelOptions: form.aiModelOptions,
    apiKey: form.aiApiKey,
    storedApiKeyConfigured: form.aiStoredApiKeyConfigured,
    clearApiKey: form.clearAiApiKey,
    timeoutSeconds: form.aiTimeoutSeconds
  };
}

export function isAiServiceProfileStored(form: SetupFormState, service: DesktopAiService): boolean {
  return service === form.aiService
    ? form.aiStoredApiKeyConfigured
    : Boolean(form.aiServiceDrafts[service]?.storedApiKeyConfigured);
}

function createSaveAiServiceProfiles(form: SetupFormState): NonNullable<SaveInitialSetupInput["aiProfiles"]> {
  return aiServicePresets.map((preset) => {
    const draft = preset.id === form.aiService
      ? toAiServiceFormDraft(form)
      : form.aiServiceDrafts[preset.id] ?? createDefaultAiServiceDraft(preset.id);
    return {
      service: preset.id,
      projectName: draft.projectName,
      baseUrl: draft.baseUrl,
      model: draft.model,
      modelOptions: draft.modelOptions,
      timeoutSeconds: Number(draft.timeoutSeconds),
      apiKey: draft.apiKey,
      clearApiKey: draft.clearApiKey
    };
  });
}

function generateSyncSecret() {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return `ya-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function createSetupInput(setupForm: SetupFormState): SaveInitialSetupInput {
  return {
      businessName: setupForm.businessName,
      profileId: setupForm.profileId,
      profileOptions: setupForm.profileOptions,
      phone: setupForm.phone,
      whatsapp: setupForm.whatsapp,
      email: setupForm.email,
      address: setupForm.address,
      webModuleUrl: setupForm.webModuleUrl,
      syncSecret: setupForm.syncSecret,
      autoSyncEnabled: setupForm.autoSyncEnabled,
      localNetworkEnabled: setupForm.localNetworkEnabled,
      aiEnabled: setupForm.aiEnabled,
      aiProvider: setupForm.aiProvider,
      aiService: setupForm.aiService,
      aiProjectName: setupForm.aiProjectName,
      aiBaseUrl: setupForm.aiBaseUrl,
      aiModel: setupForm.aiModel,
      aiModelOptions: setupForm.aiModelOptions,
      aiApiKey: setupForm.aiApiKey,
      clearAiApiKey: setupForm.clearAiApiKey,
      aiProfiles: createSaveAiServiceProfiles(setupForm),
      aiTimeoutSeconds: Number(setupForm.aiTimeoutSeconds),
      whatsappCloud: { enabled: setupForm.whatsappCloud.enabled, wabaId: setupForm.whatsappCloud.wabaId,
        phoneNumberId: setupForm.whatsappCloud.phoneNumberId, accessToken: setupForm.whatsappCloud.accessToken, clearAccessToken: setupForm.whatsappCloud.clearAccessToken },
      arasShipping: { enabled: setupForm.arasShipping.enabled, environment: setupForm.arasShipping.environment,
        customerCode: setupForm.arasShipping.customerCode, username: setupForm.arasShipping.username,
        password: setupForm.arasShipping.password, clearPassword: setupForm.arasShipping.clearPassword },
      dealerPortalEnabled: setupForm.dealerPortalEnabled,
      onlineSalesDelivery: setupForm.onlineSalesDelivery,
      productData: {
        enabled: setupForm.productDataEnabled,
        provider: setupForm.productDataProvider,
        autoSearchUnknownBarcode: setupForm.productDataAutoSearch,
        includeImages: setupForm.productDataIncludeImages
      },
      servicePreferences: {
        whatsapp: setupForm.whatsappEnabled,
        android: setupForm.androidEnabled
      },
      birthdaySettings: setupForm.birthdaySettings
    };

}
