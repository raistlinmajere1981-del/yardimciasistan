import { observeNexaAi } from "./nexa-activity";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { parseGoogleAiStudioCurl } from "../google-ai-studio";
import type { SetupFormState } from "./setup-model";
import { useRequestGeneration } from "../components/workspace/use-request-generation";
import type { SyncState } from "./runtime-state";
export function useSettingsAiTest(setupForm: SetupFormState, setSetupForm: Dispatch<SetStateAction<SetupFormState>>) {
  const beginTest = useRequestGeneration();
  const [aiConnectionTestState, setAiConnectionTestState] = useState<SyncState>("idle");
  const [aiConnectionTestMessage, setAiConnectionTestMessage] = useState("Bağlantı henüz denenmedi.");
  const signature = aiTestSignature(setupForm);
  const acceptedSignature = useRef("");

  useEffect(() => {
    if (signature === acceptedSignature.current) return;
    beginTest();
    setAiConnectionTestState("idle");
    setAiConnectionTestMessage("Bağlantı henüz denenmedi.");
  }, [beginTest, signature, setupForm.aiStoredApiKeyConfigured]);

  function invalidate() {
    acceptedSignature.current = "";
    beginTest();
    setAiConnectionTestState("idle");
    setAiConnectionTestMessage("Bağlantı henüz denenmedi.");
  }

  async function testAiConnection() {
    acceptedSignature.current = signature;
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
    let projectName = setupForm.aiProjectName;
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
      projectName ||= "Google AI Studio";
      model = "";
      apiKey = parsed.apiKey;
      acceptedSignature.current = aiTestSignature({ ...setupForm, aiProjectName: setupForm.aiProjectName || "Google AI Studio",
        aiGoogleCurl: "", aiBaseUrl: baseUrl, aiModel: "", aiApiKey: apiKey, clearAiApiKey: false });
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
      projectName,
      baseUrl,
      model,
      imageModel: setupForm.aiImageModel,
      visionModel: setupForm.aiVisionModel,
      apiKey,
      useStoredApiKey: !setupForm.clearAiApiKey && setupForm.aiStoredApiKeyConfigured && apiKey.trim() === "",
      timeoutSeconds: Number(setupForm.aiTimeoutSeconds)
    }), "success", isCurrent);

    if (!isCurrent()) return;
    setAiConnectionTestState(result.ok ? "success" : "error");
    setAiConnectionTestMessage(result.message);
    if (result.ok) {
      acceptedSignature.current = aiTestSignature({ ...setupForm,
        aiProjectName: projectName,
        aiGoogleCurl: "", aiBaseUrl: baseUrl, aiApiKey: apiKey, clearAiApiKey: false, aiModel: result.model });
      setSetupForm((current) => ({
        ...current,
        aiModel: result.model,
        aiModelOptions: result.models
      }));
    } else if (setupForm.aiService === "gemini" || setupForm.aiService === "cloudflare") {
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

function aiTestSignature(form: SetupFormState) {
  return JSON.stringify([form.aiService, form.aiProvider, form.aiProjectName, form.aiBaseUrl, form.aiModel,
    form.aiImageModel, form.aiVisionModel, form.aiApiKey, form.clearAiApiKey, form.aiStoredApiKeyConfigured, form.aiTimeoutSeconds, form.aiGoogleCurl]);
}
