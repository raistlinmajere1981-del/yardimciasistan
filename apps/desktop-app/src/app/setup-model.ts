import { defaultSetupData } from "./bootstrap-defaults";
import { type SmsConfigurationInput, type InstagramConfiguration } from "@yardimci-asistan/shared";
import { type WhatsAppCloudConfigurationInput } from "@yardimci-asistan/shared";
import type {
  DesktopAiModelOption,
  DesktopAiService,
  DesktopSetupData,
  SaveInitialSetupInput
} from "../../electron/database";
import {
  type ArasShippingConfigurationInput,
  normalizeBirthdaySettings,
  type BirthdaySettings,
  type OnlineSalesDeliverySettings,
  type BusinessCapability
} from "@yardimci-asistan/shared";

interface AiServiceFormDraft {
  projectName: string;
  googleCurl: string;
  baseUrl: string;
  model: string;
  visionModel: string;
  imageModel: string;
  sttModel: string;
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
  trafficEnabled: boolean;
  localNetworkEnabled: boolean;
  aiEnabled: boolean;
  aiProvider: string;
  aiService: DesktopAiService;
  aiProjectName: string;
  aiGoogleCurl: string;
  aiBaseUrl: string;
  aiModel: string;
  aiVisionModel: string;
  aiImageModel: string;
  aiSttModel: string;
  aiModelOptions: DesktopAiModelOption[];
  aiApiKey: string;
  aiStoredApiKeyConfigured: boolean;
  clearAiApiKey: boolean;
  aiTimeoutSeconds: string;
  aiServiceDrafts: Partial<Record<DesktopAiService, AiServiceFormDraft>>;
  whatsappEnabled: boolean;
  androidEnabled: boolean;
  productDataEnabled: boolean;
  productDataAutoSearch: boolean;
  productDataIncludeImages: boolean;
  birthdaySettings: BirthdaySettings;
  sms: SmsConfigurationInput & { hasApiKey: boolean; hasApiHash: boolean; configured: boolean };
  instagram: InstagramConfiguration;
  whatsappCloud: WhatsAppCloudConfigurationInput & { hasSecret: boolean; configured: boolean };
  arasShipping: Omit<ArasShippingConfigurationInput, "enabled"> & { hasSecret: boolean };
  dealerPortalEnabled: boolean;
  dealerApplicationEnabled: boolean;
  onlineSalesDelivery: OnlineSalesDeliverySettings;
  onlineSalesDeliveryEnabled: boolean;
}

export const aiServicePresets = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "gemini", label: "Google AI Studio (Gemini)", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "cloudflare", label: "Cloudflare Workers AI", baseUrl: "" },
  { id: "custom", label: "Özel OpenAI uyumlu servis", baseUrl: "" }
] as const satisfies ReadonlyArray<{
  id: DesktopAiService;
  label: string;
  baseUrl: string;
}>;

function normalizeAiService(service: string): DesktopAiService {
  return aiServicePresets.some((preset) => preset.id === service)
    ? service as DesktopAiService
    : "openai";
}

export function toSetupForm(setupData: DesktopSetupData): SetupFormState {
  const service = normalizeAiService(setupData.aiService);
  const aiServiceDrafts = createAiServiceFormDrafts(setupData);
  const activeAiDraft = aiServiceDrafts[service] ?? createDefaultAiServiceDraft(service);
  const shipping = setupData.arasShipping ?? defaultSetupData.arasShipping;

  return {
    businessName: setupData.businessName || "",
    profileId: setupData.profileId || defaultSetupData.profileId,
    profileOptions: [...setupData.profileOptions],
    phone: setupData.phone || "",
    whatsapp: setupData.whatsapp || "",
    email: setupData.email || "",
    address: setupData.address || "",
    webModuleUrl: setupData.webModuleUrl,
    syncSecret: setupData.syncSecret && setupData.syncSecret !== "change-this-secret" ? setupData.syncSecret : "",
    autoSyncEnabled: setupData.autoSyncEnabled,
    trafficEnabled: setupData.trafficEnabled !== false,
    localNetworkEnabled: setupData.localNetworkEnabled !== false,
    aiEnabled: setupData.aiEnabled,
    aiProvider: setupData.aiProvider || defaultSetupData.aiProvider,
    aiService: service,
    aiProjectName: activeAiDraft.projectName,
    aiGoogleCurl: activeAiDraft.googleCurl,
    aiBaseUrl: activeAiDraft.baseUrl,
    aiModel: activeAiDraft.model,
    aiVisionModel: activeAiDraft.visionModel,
    aiImageModel: activeAiDraft.imageModel,
    aiSttModel: activeAiDraft.sttModel,
    aiModelOptions: activeAiDraft.modelOptions,
    aiApiKey: activeAiDraft.apiKey,
    aiStoredApiKeyConfigured: activeAiDraft.storedApiKeyConfigured,
    clearAiApiKey: activeAiDraft.clearApiKey,
    aiTimeoutSeconds: activeAiDraft.timeoutSeconds,
    aiServiceDrafts,
    whatsappEnabled: setupData.servicePreferences.whatsapp,
    androidEnabled: setupData.servicePreferences.android,
    sms: { ...(setupData.sms ?? defaultSetupData.sms), apiKey: "", apiHash: "", clearApiKey: false, clearApiHash: false },
    instagram: setupData.instagram ?? defaultSetupData.instagram,
    whatsappCloud: { ...(setupData.whatsappCloud ?? defaultSetupData.whatsappCloud), accessToken: "", clearAccessToken: false },
    arasShipping: {
      environment: shipping.environment, customerCode: shipping.customerCode,
      username: shipping.username, hasSecret: shipping.hasSecret,
      password: "", clearPassword: false
    },
    dealerPortalEnabled: setupData.dealerPortalEnabled ?? false,
    dealerApplicationEnabled: setupData.dealerApplicationEnabled ?? false,
    onlineSalesDelivery: { ...(setupData.onlineSalesDelivery ?? defaultSetupData.onlineSalesDelivery) },
    onlineSalesDeliveryEnabled: setupData.onlineSalesDeliveryEnabled ?? false,
    productDataEnabled: setupData.productData.enabled,
    productDataAutoSearch: setupData.productData.autoSearchUnknownBarcode,
    productDataIncludeImages: setupData.productData.includeImages,
    birthdaySettings: { ...normalizeBirthdaySettings(setupData.birthdaySettings), mode: "manual" }
  };
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
      visionModel: profile?.visionModel ?? (isActiveService ? setupData.aiVisionModel ?? "" : ""),
      imageModel: profile?.imageModel ?? (isActiveService ? setupData.aiImageModel ?? "" : ""),
      sttModel: profile?.sttModel ?? (isActiveService ? setupData.aiSttModel ?? "" : ""),
      modelOptions: profile?.modelOptions ?? (
        isActiveService && setupData.aiModel
          ? [{ id: setupData.aiModel, label: setupData.aiModel }]
          : []
      ),
      timeoutSeconds: String(profile?.timeoutSeconds ?? (isActiveService ? setupData.aiTimeoutSeconds : 30) ?? 30),
      storedApiKeyConfigured: profile?.apiKeyConfigured ?? (isActiveService && setupData.aiApiKeyConfigured)
    } satisfies AiServiceFormDraft];
  }));
}

function createDefaultAiServiceDraft(service: DesktopAiService): AiServiceFormDraft {
  const preset = aiServicePresets.find((candidate) => candidate.id === service);
  return {
    projectName: service === "gemini" ? "Google AI Studio" : "",
    googleCurl: "",
    baseUrl: preset?.baseUrl ?? "",
    model: "",
    visionModel: "",
    imageModel: "",
    sttModel: "",
    modelOptions: [],
    apiKey: "",
    storedApiKeyConfigured: false,
    clearApiKey: false,
    timeoutSeconds: "30"
  };
}

function toAiServiceFormDraft(form: SetupFormState): AiServiceFormDraft {
  return {
    projectName: form.aiProjectName,
    googleCurl: form.aiGoogleCurl,
    baseUrl: form.aiBaseUrl,
    model: form.aiModel,
    visionModel: form.aiVisionModel,
    imageModel: form.aiImageModel,
    sttModel: form.aiSttModel,
    modelOptions: form.aiModelOptions,
    apiKey: form.aiApiKey,
    storedApiKeyConfigured: form.aiStoredApiKeyConfigured,
    clearApiKey: form.clearAiApiKey,
    timeoutSeconds: form.aiTimeoutSeconds
  };
}

export function selectAiService(form: SetupFormState, service: string): SetupFormState {
  const selected = normalizeAiService(service);
  const target = form.aiServiceDrafts[selected] ?? createDefaultAiServiceDraft(selected);
  return {
    ...form, aiService: selected, aiProjectName: target.projectName, aiGoogleCurl: target.googleCurl,
    aiBaseUrl: target.baseUrl, aiModel: target.model, aiVisionModel: target.visionModel, aiImageModel: target.imageModel, aiSttModel: target.sttModel,
    aiModelOptions: target.modelOptions, aiApiKey: target.apiKey, aiStoredApiKeyConfigured: target.storedApiKeyConfigured,
    clearAiApiKey: target.clearApiKey, aiTimeoutSeconds: target.timeoutSeconds,
    aiServiceDrafts: { ...form.aiServiceDrafts, [form.aiService]: toAiServiceFormDraft(form) }
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
      visionModel: draft.visionModel,
      imageModel: draft.imageModel,
      sttModel: draft.sttModel,
      modelOptions: draft.modelOptions,
      timeoutSeconds: Number(draft.timeoutSeconds),
      apiKey: draft.apiKey,
      clearApiKey: draft.clearApiKey
    };
  });
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
      trafficEnabled: setupForm.trafficEnabled,
      localNetworkEnabled: setupForm.localNetworkEnabled,
      aiEnabled: setupForm.aiEnabled,
      aiProvider: setupForm.aiProvider,
      aiService: setupForm.aiService,
      aiProjectName: setupForm.aiProjectName,
      aiBaseUrl: setupForm.aiBaseUrl,
      aiModel: setupForm.aiModel,
      aiVisionModel: setupForm.aiVisionModel,
      aiImageModel: setupForm.aiImageModel,
      aiSttModel: setupForm.aiSttModel,
      aiModelOptions: setupForm.aiModelOptions,
      aiApiKey: setupForm.aiApiKey,
      clearAiApiKey: setupForm.clearAiApiKey,
      aiProfiles: createSaveAiServiceProfiles(setupForm),
      aiTimeoutSeconds: Number(setupForm.aiTimeoutSeconds),
      instagram: { enabled: setupForm.instagram.enabled },
      sms: { enabled: setupForm.sms.enabled, senderId: setupForm.sms.senderId, iysList: setupForm.sms.iysList, ...(setupForm.sms.apiKey === undefined ? {} : { apiKey: setupForm.sms.apiKey }), ...(setupForm.sms.apiHash === undefined ? {} : { apiHash: setupForm.sms.apiHash }), ...(setupForm.sms.clearApiKey === undefined ? {} : { clearApiKey: setupForm.sms.clearApiKey }), ...(setupForm.sms.clearApiHash === undefined ? {} : { clearApiHash: setupForm.sms.clearApiHash }) },
      whatsappCloud: { enabled: setupForm.whatsappCloud.enabled, wabaId: setupForm.whatsappCloud.wabaId,
        phoneNumberId: setupForm.whatsappCloud.phoneNumberId, ...(setupForm.whatsappCloud.accessToken === undefined ? {} : { accessToken: setupForm.whatsappCloud.accessToken }), ...(setupForm.whatsappCloud.clearAccessToken === undefined ? {} : { clearAccessToken: setupForm.whatsappCloud.clearAccessToken }) },
      arasShipping: { enabled: setupForm.onlineSalesDeliveryEnabled && setupForm.onlineSalesDelivery.shippingEnabled, environment: setupForm.arasShipping.environment,
        customerCode: setupForm.arasShipping.customerCode, username: setupForm.arasShipping.username,
        ...(setupForm.arasShipping.password === undefined ? {} : { password: setupForm.arasShipping.password }), ...(setupForm.arasShipping.clearPassword === undefined ? {} : { clearPassword: setupForm.arasShipping.clearPassword }) },
      dealerPortalEnabled: setupForm.dealerPortalEnabled,
      dealerApplicationEnabled: setupForm.dealerApplicationEnabled,
      onlineSalesDelivery: setupForm.onlineSalesDelivery,
      onlineSalesDeliveryEnabled: setupForm.onlineSalesDeliveryEnabled,
      productData: {
        enabled: setupForm.productDataEnabled,
        provider: "open_food_facts",
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
