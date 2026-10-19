import type { SetupFormState } from "../../app/setup-model";
import type { useDesktopDictationSettings } from "../../app/use-desktop-dictation-settings";
import { ActionButton } from "../ui/ActionButton";
import { ServiceSettingsCard } from "./ServiceSettingsCard";

export function DesktopDictationSetup({ controller, form, canonical, aiCapability, disabled = false }: {
  controller: ReturnType<typeof useDesktopDictationSettings>;
  form: SetupFormState;
  canonical: SetupFormState;
  aiCapability: boolean;
  disabled?: boolean;
}) {
  const changed = (["aiEnabled", "aiProvider", "aiService", "aiBaseUrl", "aiModel", "aiImageModel", "aiSttModel",
    "aiTimeoutSeconds", "webModuleUrl", "syncSecret", "autoSyncEnabled"] as const).some(key => form[key] !== canonical[key])
    || Boolean(form.aiApiKey || form.aiGoogleCurl || form.clearAiApiKey);
  const ready = aiCapability && !changed && controller.status?.ready === true;
  const message = !form.aiEnabled ? "AI Yardımcı kapalı"
    : !form.aiSttModel ? "AI modeli gerekli"
      : changed ? "AI ve web ayarlarını kaydedin"
        : ready && controller.enabled !== controller.status?.enabled ? (controller.enabled ? "Etkinleştirilecek · Masaüstü dikte" : "Kapatılacak · Masaüstü dikte")
          : controller.status?.message ?? "Kayıtlı durum kontrol ediliyor…";
  const canTest = aiCapability && !changed && controller.status?.canTest === true;
  return <ServiceSettingsCard id="settings-dictation" title="Konuşmadan Metne" enabled={controller.enabled}
    readiness={controller.testing ? "Kontrol ediliyor…" : controller.error ? "Hata" : ready ? "Hazır" : canTest ? "Test edilmedi" : "Test kullanılamıyor"} testMessage={controller.error}
    status={message} disabled={disabled} toggleDisabled={!ready || controller.busy}
    toggleLabel="Masaüstü dikte etkin" onEnabledChange={controller.change}
    prerequisiteActions={canTest && <><ActionButton variant="secondary" size="sm" disabled={disabled || controller.busy}
      title="Tek kısa deneme sesi gönderir; sağlayıcı ücretlendirebilir." onClick={() => void controller.test()}>
      {controller.testing ? "Deneniyor…" : "STT Bağlantısını Dene"}
    </ActionButton>
      <small>Test tek kısa ses gönderir; sağlayıcı ücretlendirebilir.</small>
    </>}
    >
    <small>Masaüstündeki mikrofon düğmelerini etkinleştirir.</small>
  </ServiceSettingsCard>;
}
