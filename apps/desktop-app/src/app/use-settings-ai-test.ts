import { observeNexaAi } from "./nexa-activity";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { parseGoogleAiStudioCurl } from "../google-ai-studio";
import type { SetupFormState } from "./setup-model";
import { useRequestGeneration } from "../components/workspace/use-request-generation";
import type { SyncState } from "./runtime-state";
export function useSettingsAiTest(setupForm: SetupFormState, setSetupForm: Dispatch<SetStateAction<SetupFormState>>) {
  const beginTest = useRequestGeneration();
  const [aiConnectionTestState, setAiConnectionTestState] = useState<SyncState>("idle");
  const [aiConnectionTestMessage, setAiConnectionTestMessage] = useState("Bağlantı henüz denenmedi.");

  useEffect(() => {
    beginTest();
    setAiConnectionTestState("idle");
    setAiConnectionTestMessage(
      setupForm.aiStoredApiKeyConfigured
        ? "Bu sağlayıcının kayıtlı bağlantısı kullanılabilir."
        : "Bağlantı henüz denenmedi."
    );
  }, [beginTest, setupForm.aiService, setupForm.aiStoredApiKeyConfigured]);

  function invalidate() {
    beginTest();
    setAiConnectionTestState("idle");
    setAiConnectionTestMessage(
      setupForm.aiStoredApiKeyConfigured
        ? "Bu sağlayıcının kayıtlı bağlantısı kullanılabilir."
        : "Bağlantı henüz denenmedi."
    );
  }

  async function testAiConnection() {
    const isCurrent = beginTest();
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

    try {
    const result = await observeNexaAi(() => bridge.testAiConnection({
      provider: setupForm.aiProvider,
      service: setupForm.aiService,
      projectName: setupForm.aiProjectName,
      baseUrl,
      model,
      apiKey,
      useStoredApiKey: !setupForm.clearAiApiKey && setupForm.aiStoredApiKeyConfigured && apiKey.trim() === "",
      timeoutSeconds: Number(setupForm.aiTimeoutSeconds)
    }), "success", isCurrent);

    if (!isCurrent()) return;
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
    } catch (error) {
      if (!isCurrent()) return;
      setAiConnectionTestState("error");
      setAiConnectionTestMessage(error instanceof Error ? error.message : "AI bağlantısı kontrol edilemedi.");
    }
  }

  return { aiConnectionTestState, aiConnectionTestMessage, testAiConnection, invalidate };
}
