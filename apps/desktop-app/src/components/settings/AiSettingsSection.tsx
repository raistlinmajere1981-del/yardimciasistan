import { useConfirmDialog } from "../ui/useConfirmDialog";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { aiServicePresets, createDefaultAiServiceDraft, isAiServiceProfileStored, normalizeAiService, toAiServiceFormDraft, type SetupFormState } from "../../app/setup-model";
import type { ServicesSettingsProps } from "./ServicesSettingsSection";
import { ActionButton } from "../ui/ActionButton";
const STORED_AI_API_KEY_MASK = "*".repeat(20);
export function AiSettingsSection({ form, onFormChange, onTestAiConnection, aiConnectionTestState, aiConnectionTestMessage }: Pick<ServicesSettingsProps, "form" | "onFormChange" | "onTestAiConnection" | "aiConnectionTestState" | "aiConnectionTestMessage">) {
  const update = <Key extends keyof SetupFormState,>(key: Key, value: SetupFormState[Key]) => {
    onFormChange({ ...form, [key]: value });
  };

  const { confirm, confirmDialog } = useConfirmDialog();
  const [showAiApiKey, setShowAiApiKey] = useState(false);
  const [showGoogleCurl, setShowGoogleCurl] = useState(false);
  const [revealedAiApiKey, setRevealedAiApiKey] = useState("");
  const [aiApiKeyRevealState, setAiApiKeyRevealState] = useState<"idle" | "loading" | "error">("idle");
  const [aiApiKeyRevealMessage, setAiApiKeyRevealMessage] = useState("");
  const selectedAiServiceRef = useRef(form.aiService);
  useEffect(() => {
    selectedAiServiceRef.current = form.aiService;
    setShowAiApiKey(false);
    setShowGoogleCurl(false);
    setRevealedAiApiKey("");
    setAiApiKeyRevealState("idle");
    setAiApiKeyRevealMessage("");
  }, [form.aiService, form.clearAiApiKey]);

  const googleUsesStoredApiKey = form.aiStoredApiKeyConfigured && !form.clearAiApiKey && !form.aiGoogleCurl && !form.aiApiKey;
  const genericUsesStoredApiKey = form.aiStoredApiKeyConfigured && !form.clearAiApiKey && !form.aiApiKey;
  const googleSecretValue = form.aiGoogleCurl
    || form.aiApiKey
    || (googleUsesStoredApiKey ? (showGoogleCurl ? revealedAiApiKey : STORED_AI_API_KEY_MASK) : "");
  const genericSecretValue = form.aiApiKey
    || (genericUsesStoredApiKey ? (showAiApiKey ? revealedAiApiKey : STORED_AI_API_KEY_MASK) : "");

  const toggleAiApiKeyVisibility = async (field: "google" | "generic") => {
    const isVisible = field === "google" ? showGoogleCurl : showAiApiKey;
    const setVisible = field === "google" ? setShowGoogleCurl : setShowAiApiKey;
    if (isVisible) {
      setVisible(false);
      setRevealedAiApiKey("");
      setAiApiKeyRevealState("idle");
      setAiApiKeyRevealMessage("");
      return;
    }

    const pendingValue = field === "google" ? form.aiGoogleCurl || form.aiApiKey : form.aiApiKey;
    if (pendingValue || !form.aiStoredApiKeyConfigured) {
      setVisible(true);
      return;
    }

    const requestedService = form.aiService;
    const bridge = window.yardimciDesktop;
    if (!bridge?.revealAiApiKey) {
      setAiApiKeyRevealState("error");
      setAiApiKeyRevealMessage("Bağlantı anahtarı gösterilemiyor. Uygulamayı yeniden başlatın.");
      return;
    }

    setAiApiKeyRevealState("loading");
    setAiApiKeyRevealMessage("");
    const result = await bridge.revealAiApiKey(requestedService);
    if (selectedAiServiceRef.current !== requestedService) {
      return;
    }
    if (!result.ok) {
      setAiApiKeyRevealState("error");
      setAiApiKeyRevealMessage(result.message);
      return;
    }

    setRevealedAiApiKey(result.apiKey);
    setVisible(true);
    setAiApiKeyRevealState("idle");
  };

  const replaceGoogleSecret = (value: string) => {
    let nextValue = value;
    if (googleUsesStoredApiKey && !showGoogleCurl && nextValue.startsWith(STORED_AI_API_KEY_MASK)) {
      nextValue = nextValue.slice(STORED_AI_API_KEY_MASK.length);
    }

    setRevealedAiApiKey("");
    setAiApiKeyRevealState("idle");
    setAiApiKeyRevealMessage("");
    if (form.aiApiKey && !form.aiGoogleCurl) {
      onFormChange({ ...form, aiApiKey: nextValue });
      return;
    }
    if (googleUsesStoredApiKey && showGoogleCurl) {
      onFormChange({ ...form, aiApiKey: nextValue, aiGoogleCurl: "" });
      return;
    }
    onFormChange({ ...form, aiGoogleCurl: nextValue, aiApiKey: "" });
  };

  const replaceGenericSecret = (value: string) => {
    const nextValue = genericUsesStoredApiKey && !showAiApiKey && value.startsWith(STORED_AI_API_KEY_MASK)
      ? value.slice(STORED_AI_API_KEY_MASK.length)
      : value;
    setRevealedAiApiKey("");
    setAiApiKeyRevealState("idle");
    setAiApiKeyRevealMessage("");
    update("aiApiKey", nextValue);
  };

  const updateAiService = (service: string) => {
    const normalizedService = normalizeAiService(service);
    const currentDraft = toAiServiceFormDraft(form);
    const targetDraft = form.aiServiceDrafts[normalizedService] ?? createDefaultAiServiceDraft(normalizedService);
    onFormChange({
      ...form,
      aiService: normalizedService,
      aiProjectName: targetDraft.projectName,
      aiGoogleCurl: targetDraft.googleCurl,
      aiBaseUrl: targetDraft.baseUrl,
      aiModel: targetDraft.model,
      aiModelOptions: targetDraft.modelOptions,
      aiApiKey: targetDraft.apiKey,
      aiStoredApiKeyConfigured: targetDraft.storedApiKeyConfigured,
      clearAiApiKey: targetDraft.clearApiKey,
      aiTimeoutSeconds: targetDraft.timeoutSeconds,
      aiServiceDrafts: {
        ...form.aiServiceDrafts,
        [form.aiService]: currentDraft
      }
    });
  };

  const renderAiConnectionActions = (inline: boolean) => (
    <div id="settings-ai-test" tabIndex={-1} className={`setup-ai-actions${inline ? " is-inline" : ""} sync-${aiConnectionTestState}`}>
      <ActionButton variant="secondary" className="setup-secondary" type="button" onClick={onTestAiConnection} disabled={!form.aiEnabled || aiConnectionTestState === "loading" || (form.aiService === "gemini" && !form.aiGoogleCurl.trim() && !form.aiApiKey.trim() && !form.aiStoredApiKeyConfigured)}>
        <RefreshCw size={16} aria-hidden="true" />
        {aiConnectionTestState === "loading" ? "Bağlantı deneniyor" : "Bağlantıyı Dene"}
      </ActionButton>
      <span className="setup-connection-message" role={aiConnectionTestState === "error" ? "alert" : "status"} aria-live="polite">{aiConnectionTestMessage}</span>
    </div>
  );

  return (
        <section id="settings-ai" tabIndex={-1} className={`settings-service-card setup-ai-section${form.aiEnabled ? " is-enabled" : " is-disabled"}`}>
          {confirmDialog}
          <div className="settings-service-card-header">
            <div>
              <strong>AI Yardımcı</strong>
              <span>{form.aiEnabled ? (form.aiStoredApiKeyConfigured ? "Hazır" : "Açık · anahtar bekliyor") : "Kapalı"}</span>
            </div>
            <label className="settings-service-toggle">
              <input aria-label="AI Yardımcı servisi" checked={form.aiEnabled} onChange={(event) => update("aiEnabled", event.target.checked)} type="checkbox" />
              <span>{form.aiEnabled ? "Açık" : "Kapalı"}</span>
            </label>
          </div>
          <div className="settings-service-card-body">
          <div className="form-grid">
            <div className="setup-ai-provider-row form-field--span">
              <label className="form-field form-field--medium setup-ai-service-field">
                Servis sağlayıcı
                <select value={form.aiService} onChange={(event) => updateAiService(event.target.value)} disabled={!form.aiEnabled}>
                  {aiServicePresets.map((preset) => (
                    <option value={preset.id} key={preset.id}>
                      {preset.label}{isAiServiceProfileStored(form, preset.id) ? " · kayıtlı" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {form.aiStoredApiKeyConfigured && (
                <ActionButton
                  variant="danger"
                  size="sm"
                  className="setup-ai-delete-key"
                  type="button"
                  disabled={form.clearAiApiKey}
                  onClick={async () => {
                    if (await confirm({ title: "Kayıtlı anahtarı sil", tone: "danger", confirmLabel: "Anahtarı Sil",
                      description: "Bu sağlayıcının kayıtlı AI anahtarı silinsin mi?",
                      details: "Anahtar, bu ayar alanı kaydedildiğinde silinecek ve AI Yardımcı kapatılacak." })) {
                      onFormChange({ ...form, clearAiApiKey: true, aiEnabled: false });
                    }
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  {form.clearAiApiKey ? "Anahtar silinecek" : "Kayıtlı Anahtarı Sil"}
                </ActionButton>
              )}
            </div>
            {form.aiService === "gemini" ? (
              <>
                <div className="setup-field setup-ai-studio-help">
                  <ActionButton variant="secondary" className="setup-secondary" type="button" onClick={() => void window.yardimciDesktop?.openExternal("https://aistudio.google.com/apikey")} disabled={!form.aiEnabled}>
                    <ExternalLink size={16} aria-hidden="true" />
                    Google AI Studio'yu Aç
                  </ActionButton>
                </div>
                <div className="form-field form-field--long form-field--span setup-ai-curl-field">
                  <span>Google AI Studio API anahtarı veya cURL</span>
                  <div className="field-control-group setup-secret-input">
                    <input
                      aria-label="Google AI Studio API anahtarı veya cURL"
                      value={googleSecretValue}
                      onChange={(event) => replaceGoogleSecret(event.target.value)}
                      onFocus={(event) => {
                        if (googleUsesStoredApiKey) event.currentTarget.select();
                      }}
                      type={showGoogleCurl || googleUsesStoredApiKey ? "text" : "password"}
                      placeholder={form.aiStoredApiKeyConfigured ? "Kayıtlı anahtarı değiştirmek için yeni API anahtarı veya cURL yapıştırın" : "Google AI Studio API anahtarını yapıştırın"}
                      disabled={!form.aiEnabled || form.clearAiApiKey}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <ActionButton variant="secondary" size="sm" type="button" onClick={() => void toggleAiApiKeyVisibility("google")} disabled={!form.aiEnabled || form.clearAiApiKey || aiApiKeyRevealState === "loading"} aria-pressed={showGoogleCurl}>
                      {aiApiKeyRevealState === "loading" ? "Açılıyor" : showGoogleCurl ? "Gizle" : "Göster"}
                    </ActionButton>
                  </div>
                  {!form.aiStoredApiKeyConfigured && (
                    <small>Anahtar güvenli depoda saklanır. cURL yapıştırılırsa adres, anahtar ve varsa örnek model otomatik hazırlanır.</small>
                  )}
                  {aiApiKeyRevealMessage && <small className="setup-secret-error" role="alert">{aiApiKeyRevealMessage}</small>}
                </div>
                {renderAiConnectionActions(true)}
              </>
            ) : (
              <label className="form-field form-field--long form-field--span">
                Bağlantı adresi
                <input value={form.aiBaseUrl} onChange={(event) => update("aiBaseUrl", event.target.value)} placeholder="https://servis.example/v1" disabled={!form.aiEnabled} spellCheck={false} />
              </label>
            )}
            <label className="form-field form-field--medium">
              Model adı
              {form.aiService === "gemini" && form.aiModelOptions.length > 0 ? (
                <select value={form.aiModel} onChange={(event) => update("aiModel", event.target.value)} disabled={!form.aiEnabled}>
                  {form.aiModelOptions.map((model) => (
                    <option value={model.id} key={model.id}>{model.label}</option>
                  ))}
                </select>
              ) : (
                <input value={form.aiModel} onChange={(event) => update("aiModel", event.target.value)} placeholder={form.aiService === "gemini" ? "Bağlantı kontrolünden sonra listelenir" : "Serviste görünen model adı"} disabled={!form.aiEnabled || form.aiService === "gemini"} spellCheck={false} />
              )}
              {form.aiService === "gemini" && (
                <small>{form.aiModelOptions.length > 0
                  ? form.aiStoredApiKeyConfigured
                    ? `${form.aiModelOptions.length} görsel ve metin modeli bu sağlayıcı altında kayıtlı.`
                    : `${form.aiModelOptions.length} görsel ve metin modeli hazır; kalıcı olması için ayarları kaydedin.`
                  : "Bağlantıyı Dene ile görsel destekli, güncel modeller otomatik alınır."}</small>
              )}
            </label>
            <label className="form-field form-field--short">
              Yanıt bekleme süresi (saniye)
              <input value={form.aiTimeoutSeconds} onChange={(event) => update("aiTimeoutSeconds", event.target.value)} inputMode="numeric" min="5" max="120" disabled={!form.aiEnabled} />
            </label>
            {form.aiService !== "gemini" && <div className="form-field form-field--long form-field--span">
              <span>AI güvenlik anahtarı</span>
              <div className="field-control-group setup-secret-input">
                <input
                  aria-label="AI güvenlik anahtarı"
                  value={genericSecretValue}
                  onChange={(event) => replaceGenericSecret(event.target.value)}
                  onFocus={(event) => {
                    if (genericUsesStoredApiKey) event.currentTarget.select();
                  }}
                  type={showAiApiKey || genericUsesStoredApiKey ? "text" : "password"}
                  placeholder={form.aiStoredApiKeyConfigured ? "Yeni anahtar girmezseniz bu sağlayıcının kayıtlı anahtarı korunur" : "Servis erişim anahtarını girin"}
                  disabled={!form.aiEnabled || form.clearAiApiKey}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <ActionButton variant="secondary" size="sm" type="button" onClick={() => void toggleAiApiKeyVisibility("generic")} disabled={!form.aiEnabled || form.clearAiApiKey || aiApiKeyRevealState === "loading"} aria-pressed={showAiApiKey}>
                  {aiApiKeyRevealState === "loading" ? "Açılıyor" : showAiApiKey ? "Gizle" : "Göster"}
                </ActionButton>
              </div>
              <small>{form.aiStoredApiKeyConfigured ? "Kayıtlı bağlantı anahtarı maskelenir; Göster ile görüntüleyebilirsiniz." : "Bu sağlayıcı için anahtar henüz kayıtlı değil."}</small>
              {aiApiKeyRevealMessage && <small className="setup-secret-error" role="alert">{aiApiKeyRevealMessage}</small>}
            </div>}
          </div>
          {form.aiService !== "gemini" && renderAiConnectionActions(false)}
          </div>
        </section>

  );
}
