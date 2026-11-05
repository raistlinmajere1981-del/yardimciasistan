import type { SetupFormState } from "../../app/setup-model";
import type { useDesktopDictationSettings } from "../../app/use-desktop-dictation-settings";
import { ActionButton } from "../ui/ActionButton";
import { ServiceSettingsCard } from "./ServiceSettingsCard";
import { dictationBlockedReason } from "./service-prerequisites";

export function DesktopDictationSetup({ controller, form, canonical, aiCapability, disabled = false }: {
  controller: ReturnType<typeof useDesktopDictationSettings>;
  form: SetupFormState;
  canonical: SetupFormState;
  aiCapability: boolean;
  disabled?: boolean;
}) {
  const blockedReason = dictationBlockedReason(form, canonical, aiCapability, controller.status);
  const ready = !blockedReason && controller.status?.ready === true;
  const message = blockedReason ?? (ready && controller.enabled !== controller.status?.enabled ? (controller.enabled ? "Etkinleştirilecek · Masaüstü dikte" : "Kapatılacak · Masaüstü dikte")
    : controller.status?.message ?? "Kayıtlı durum kontrol ediliyor…");
  const canTest = !blockedReason && controller.status?.canTest === true;
  return <ServiceSettingsCard id="settings-dictation" title="Konuşmadan Metne" enabled={controller.enabled}
    readiness={controller.testing ? "Kontrol ediliyor…" : controller.error ? "Hata" : ready ? "Hazır" : canTest ? "Test edilmedi" : "Test kullanılamıyor"} testMessage={controller.error}
    status={message} blockedReason={blockedReason} disabled={disabled || controller.busy} toggleDisabled={!ready}
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
