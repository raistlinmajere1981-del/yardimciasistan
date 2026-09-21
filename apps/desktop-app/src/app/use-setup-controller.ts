import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
  DesktopDashboardData,
  DesktopSetupData,
  SaveInitialSetupInput
} from "../../electron/database";
import { parseGoogleAiStudioCurl } from "../google-ai-studio";
import { defaultSetupData } from "./bootstrap-defaults";
import { type SyncState } from "./runtime-state";
import type { SettingsOperationResult } from "./settings-save";
import {
  createSaveAiServiceProfiles,
  toSetupForm,
  type SetupFormState
} from "./setup-model";

interface UseSetupControllerOptions {
  onInitialSetupRequired?: () => void;
  onInitialSetupReady?: () => void;
}

export function useSetupController({ onInitialSetupRequired, onInitialSetupReady }: UseSetupControllerOptions = {}) {
  const onInitialSetupRequiredRef = useRef(onInitialSetupRequired);
  const onInitialSetupReadyRef = useRef(onInitialSetupReady);
  const [setupData, setSetupData] = useState<DesktopSetupData>(defaultSetupData);
  const [setupForm, setSetupFormState] = useState<SetupFormState>(() => toSetupForm(defaultSetupData));
  const [setupDirty, setSetupDirty] = useState(false);
  const [aiConnectionTestState, setAiConnectionTestState] = useState<SyncState>("idle");
  const [aiConnectionTestMessage, setAiConnectionTestMessage] = useState("Bağlantı henüz denenmedi.");

  const setSetupForm = useCallback<Dispatch<SetStateAction<SetupFormState>>>((nextState) => {
    setSetupDirty(true);
    setSetupFormState(nextState);
  }, []);

  onInitialSetupRequiredRef.current = onInitialSetupRequired;
  onInitialSetupReadyRef.current = onInitialSetupReady;

  useEffect(() => {
    setAiConnectionTestState("idle");
    setAiConnectionTestMessage(
      setupForm.aiStoredApiKeyConfigured
        ? "Bu sağlayıcının kayıtlı bağlantısı kullanılabilir."
        : "Bağlantı henüz denenmedi."
    );
  }, [setupForm.aiService, setupForm.aiStoredApiKeyConfigured]);

  function applyBootstrapSetup(
    nextSetupData: DesktopSetupData,
    firstApplicationLoad: boolean
  ) {
    setSetupData(nextSetupData);
    setSetupFormState(toSetupForm(nextSetupData));
    setSetupDirty(false);
    if (firstApplicationLoad) {
      if (nextSetupData.setupRequired) {
        onInitialSetupRequiredRef.current?.();
      } else {
        onInitialSetupReadyRef.current?.();
      }
    }
  }

  async function testAiConnection() {
    setAiConnectionTestState("loading");
    setAiConnectionTestMessage("AI servisine bağlanılıyor...");

    const bridge = window.yardimciDesktop;
    if (!bridge) {
      setAiConnectionTestState("error");
      setAiConnectionTestMessage("Bağlantı kontrolü hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    let baseUrl = setupForm.aiBaseUrl;
    let model = setupForm.aiModel;
    let apiKey = setupForm.clearAiApiKey ? "" : setupForm.aiApiKey;
    if (setupForm.aiService === "gemini" && setupForm.aiGoogleCurl.trim()) {
      const parsed = parseGoogleAiStudioCurl(setupForm.aiGoogleCurl);
      if (!parsed.ok) {
        setAiConnectionTestState("error");
        setAiConnectionTestMessage(parsed.message);
        return;
      }

      baseUrl = parsed.baseUrl;
      model = "";
      apiKey = parsed.apiKey;
      setSetupForm((current) => ({
        ...current,
        aiProjectName: current.aiProjectName || "Google AI Studio",
        aiGoogleCurl: "",
        aiBaseUrl: parsed.baseUrl,
        aiModel: "",
        aiApiKey: parsed.apiKey,
        clearAiApiKey: false
      }));
    }

    const result = await bridge.testAiConnection({
      provider: setupForm.aiProvider,
      service: setupForm.aiService,
      projectName: setupForm.aiProjectName,
      baseUrl,
      model,
      apiKey,
      useStoredApiKey: !setupForm.clearAiApiKey && setupForm.aiStoredApiKeyConfigured && apiKey.trim() === "",
      timeoutSeconds: Number(setupForm.aiTimeoutSeconds)
    });

    setAiConnectionTestState(result.ok ? "success" : "error");
    setAiConnectionTestMessage(result.message);
    if (result.ok) {
      setSetupForm((current) => ({
        ...current,
        aiModel: result.model,
        aiModelOptions: result.models
      }));
    } else if (setupForm.aiService === "gemini") {
      setSetupForm((current) => ({
        ...current,
        aiModel: result.model || current.aiModel,
        aiModelOptions: result.models ?? current.aiModelOptions
      }));
    }
  }

  async function saveSetup(setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>): Promise<SettingsOperationResult> {
    if (!setupData.setupRequired && !setupDirty) {
      return { ok: true, changed: false, message: "Ayarlar zaten güncel." };
    }


    const bridge = window.yardimciDesktop;
    if (!bridge) {
      return { ok: false, message: "Ayarlar kaydedilemedi. Masaüstü uygulamasını yeniden başlatın." };
    }

    const input: SaveInitialSetupInput = {
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
      initialCounts: {
        rooms: Number(setupForm.roomCount),
        tables: setupForm.tableCategories.reduce((total, category) => total + Number(category.tableCount || 0), 0)
      },
      tableCategories: setupForm.tableCategories.map((category) => ({
        sourceName: category.sourceName,
        name: category.name,
        tableCount: Number(category.tableCount)
      })),
      birthdaySettings: setupForm.birthdaySettings
    };

    let result;
    try {
      result = await bridge.saveInitialSetup(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ayarlar kaydedilemedi.";
      return { ok: false, message };
    }
    if (!result.ok) {
      return { ok: false, message: result.message };
    }

    const nextSetupData = result.setupData;
    setSetupData(nextSetupData);
    setDashboardData(result.dashboardData);
    setSetupFormState(toSetupForm(nextSetupData));
    setSetupDirty(false);
    const aiConnectionCouldNotBePublished = setupForm.aiEnabled && result.aiWebSync?.ok === false;
    const businessContextCouldNotBePublished = setupForm.aiEnabled && result.businessContextWebSync?.ok === false;
    return aiConnectionCouldNotBePublished || businessContextCouldNotBePublished
      ? { ok: false, message: result.message }
      : { ok: true, changed: true, message: "Ayarlar kaydedildi." };
  }

  function setPasswordConfigured(configured: boolean) {
    setSetupData((current) => ({ ...current, appPasswordConfigured: configured }));
  }

  return {
    setupData,
    setupForm,
    setSetupForm,
    aiConnectionTestState,
    aiConnectionTestMessage,
    applyBootstrapSetup,
    testAiConnection,
    saveSetup,
    setPasswordConfigured
  };
}
