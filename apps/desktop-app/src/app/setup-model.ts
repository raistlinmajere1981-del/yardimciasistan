import type {
  DesktopAiModelOption,
  DesktopAiService,
  DesktopSetupData,
  SaveInitialSetupInput
} from "../../electron/database";
import { normalizeBirthdaySettings, type BirthdaySettings } from "@yardimci-asistan/shared";

interface TableCategoryFormState {
  key: string;
  sourceName: string;
  name: string;
  tableCount: string;
}

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
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  webModuleUrl: string;
  syncSecret: string;
  autoSyncEnabled: boolean;
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
  roomCount: string;
  tableCategories: TableCategoryFormState[];
  birthdaySettings: BirthdaySettings;
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
    businessName: setupData.businessName || "Deniz Çiçeği Pansiyon & Kafe",
    profileId: setupData.profileId || "pension_restaurant",
    phone: setupData.phone || "+905321234567",
    whatsapp: setupData.whatsapp || "+905321234567",
    email: setupData.email || "",
    address: setupData.address || "",
    webModuleUrl: setupData.webModuleUrl || "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
    syncSecret: setupData.syncSecret && setupData.syncSecret !== "change-this-secret" ? setupData.syncSecret : generateSyncSecret(),
    autoSyncEnabled: setupData.autoSyncEnabled,
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
    roomCount: String(Math.max(0, setupData.initialCounts.rooms || 2)),
    tableCategories: toTableCategoryForm(setupData),
    birthdaySettings: normalizeBirthdaySettings(setupData.birthdaySettings)
  };
}

let tableCategoryFormSequence = 0;

export function nextTableCategoryFormKey() {
  tableCategoryFormSequence += 1;
  return `table-category-${tableCategoryFormSequence}`;
}

function toTableCategoryForm(setupData: DesktopSetupData): TableCategoryFormState[] {
  const savedCategories = Array.isArray(setupData.tableCategories) ? setupData.tableCategories : [];
  if (savedCategories.length > 0) {
    return savedCategories.map((category) => ({
      key: nextTableCategoryFormKey(),
      sourceName: category.name,
      name: category.name,
      tableCount: String(Math.max(1, category.tableCount))
    }));
  }

  const tableCount = Math.max(0, Number(setupData.initialCounts?.tables ?? 0));
  return tableCount > 0
    ? [{
        key: nextTableCategoryFormKey(),
        sourceName: "Genel",
        name: "Genel",
        tableCount: String(tableCount)
      }]
    : [];
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

export function createSaveAiServiceProfiles(form: SetupFormState): NonNullable<SaveInitialSetupInput["aiProfiles"]> {
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
