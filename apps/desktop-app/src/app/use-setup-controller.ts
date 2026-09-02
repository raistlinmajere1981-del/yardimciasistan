import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { legacyModuleDefaultsForProfile } from "@yardimci-asistan/shared";
import type { DesktopDashboardData, DesktopSetupData, SaveInitialSetupInput } from "../../electron/database";
import { parseGoogleAiStudioCurl } from "../google-ai-studio";
import { defaultSetupData } from "./bootstrap-defaults";
import { type SyncState } from "./runtime-state";
import {
  createSaveAiServiceProfiles,
  toSetupForm,
  type SetupFormState
} from "./setup-model";

interface UseSetupControllerOptions {
  onInitialSetupReady?: () => void;
}

export function useSetupController({ onInitialSetupReady }: UseSetupControllerOptions = {}) {
  const onInitialSetupReadyRef = useRef(onInitialSetupReady);
  const [setupData, setSetupData] = useState<DesktopSetupData>(defaultSetupData);
  const [setupForm, setSetupFormState] = useState<SetupFormState>(() => toSetupForm(defaultSetupData));
  const [setupMode, setSetupMode] = useState(false);
  const [setupSaveState, setSetupSaveState] = useState<SyncState>("idle");
  const [setupMessage, setSetupMessage] = useState("Kurulum bilgileri bekliyor.");
  const [aiConnectionTestState, setAiConnectionTestState] = useState<SyncState>("idle");
  const [aiConnectionTestMessage, setAiConnectionTestMessage] = useState("Bağlantı henüz denenmedi.");

  const setSetupForm = useCallback<Dispatch<SetStateAction<SetupFormState>>>((nextState) => {
    setSetupFormState((current) => {
      const next = typeof nextState === "function" ? nextState(current) : nextState;
      if (next.businessType !== current.businessType) {
        return {
          ...next,
          ...legacyModuleDefaultsForProfile(next.businessType)
        };
      }
      return next;
    });
  }, []);

  onInitialSetupReadyRef.current = onInitialSetupReady;

  useEffect(() => {
    setAiConnectionTestState("idle");
    setAiConnectionTestMessage(
      setupForm.aiStoredApiKeyConfigured
        ? "Bu sağlayıcının kayıtlı bağlantısı kullanılabilir."
        : "Bağlantı henüz denenmedi."
    );
  }, [setupForm.aiService, setupForm.aiStoredApiKeyConfigured]);

  function applyBootstrapSetup(nextSetupData: DesktopSetupData, firstApplicationLoad: boolean) {
    setSetupData(nextSetupData);
    setSetupFormState(toSetupForm(nextSetupData));
    setSetupMode(nextSetupData.setupRequired);
    if (!nextSetupData.setupRequired && firstApplicationLoad) {
      onInitialSetupReadyRef.current?.();
    }
    setSetupMessage(nextSetupData.setupRequired ? "İlk kurulum bilgilerini tamamlayın." : "Ayarlar düzenlenebilir.");
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
      setSetupSaveState("idle");
      setSetupMessage("AI bağlantısı hazır. Ayarları kaydedin.");
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

  async function saveSetup(setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>) {
    setSetupSaveState("loading");
    setSetupMessage("Kurulum ayarları kaydediliyor...");

    const bridge = window.yardimciDesktop;
    if (!bridge) {
      setSetupSaveState("error");
      setSetupMessage("Ayarlar kaydedilemedi. Masaüstü uygulamasını yeniden başlatın.");
      return;
    }

    // Domain workspaces are now profile/capability driven. The old setup IPC
    // still requires module-shaped fields while database.ts is being split, so
    // submit a canonical compatibility projection instead of treating the old
    // room/table/QR checkboxes as an independent runtime source of truth.
    const profileModules = legacyModuleDefaultsForProfile(setupForm.businessType);

    const input: SaveInitialSetupInput = {
      businessName: setupForm.businessName,
      businessType: setupForm.businessType,
      phone: setupForm.phone,
      whatsapp: setupForm.whatsapp,
      email: setupForm.email,
      address: setupForm.address,
      webModuleUrl: setupForm.webModuleUrl,
      syncSecret: setupForm.syncSecret,
      autoSyncEnabled: setupForm.autoSyncEnabled,
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
      modules: {
        rooms: profileModules.roomsEnabled,
        tables: profileModules.tablesEnabled,
        qrMenu: profileModules.qrMenuEnabled,
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
      }))
    };

    const result = await bridge.saveInitialSetup(input);
    if (!result.ok) {
      setSetupSaveState("error");
      setSetupMessage(result.message);
      return;
    }

    setSetupData(result.setupData);
    setDashboardData(result.dashboardData);
    setSetupFormState(toSetupForm(result.setupData));
    const aiConnectionCouldNotBePublished = setupForm.aiEnabled && result.aiWebSync?.ok === false;
    setSetupSaveState(aiConnectionCouldNotBePublished ? "error" : "success");
    setSetupMessage(aiConnectionCouldNotBePublished ? result.message : "Ayarlar kaydedildi.");
    if (!aiConnectionCouldNotBePublished) {
      setSetupMode(false);
    }
  }

  function setPasswordConfigured(configured: boolean) {
    setSetupData((current) => ({ ...current, appPasswordConfigured: configured }));
  }

  return {
    setupData,
    setupForm,
    setSetupForm,
    setupMode,
    setSetupMode,
    setupSaveState,
    setupMessage,
    aiConnectionTestState,
    aiConnectionTestMessage,
    applyBootstrapSetup,
    testAiConnection,
    saveSetup,
    setPasswordConfigured
  };
}
