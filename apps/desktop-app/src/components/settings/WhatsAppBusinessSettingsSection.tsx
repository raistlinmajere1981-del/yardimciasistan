import { useSettingsConnectionTest } from "../../app/use-settings-connection-test";
import type { BusinessMessagingConnectionResult } from "@yardimci-asistan/shared";
import type { SetupFormState } from "../../app/setup-model";
import { ServiceSettingsCard } from "./ServiceSettingsCard";
import { ActionButton } from "../ui/ActionButton";
import { whatsappBusinessConfigured } from "./service-prerequisites";
export function WhatsAppBusinessSettingsSection({ draft, busy, onChange }: {
  draft: SetupFormState["whatsappCloud"]; busy: boolean; onChange: (draft: SetupFormState["whatsappCloud"]) => void;
}) {
  const connection = useSettingsConnectionTest<BusinessMessagingConnectionResult>(draft);
  const { testing } = connection, message = connection.result?.message ?? "";
  const change = (patch: Partial<typeof draft>) => { connection.clear(); onChange({ ...draft, ...patch }); };
  const complete = whatsappBusinessConfigured(draft);
  async function test() {
    const bridge = window.yardimciDesktop; if (!bridge) return;
    await connection.run(async () => {
      try { return await bridge.testBusinessMessagingConnection({ enabled: draft.enabled, wabaId: draft.wabaId, phoneNumberId: draft.phoneNumberId, ...(draft.accessToken === undefined ? {} : { accessToken: draft.accessToken }), ...(draft.clearAccessToken === undefined ? {} : { clearAccessToken: draft.clearAccessToken }) }); }
      catch { return { ok: false, providerId: "whatsapp_cloud", message: "Bağlantı testi tamamlanamadı.", testedAt: new Date().toISOString() }; }
    });
  }
  return <ServiceSettingsCard id="settings-whatsapp-business" title="WhatsApp Business" readiness={testing ? "Kontrol ediliyor…" : connection.result ? connection.result.ok ? "Hazır" : "Hata" : "Test edilmedi"} testMessage={message} enabled={draft.enabled}
    status={complete ? "Yapılandırılmış" : "Hesap bilgileri eksik"} disabled={busy || testing} toggleDisabled={!complete}
    onEnabledChange={(enabled) => { if (!enabled || complete) change({ enabled }); }}
    prerequisiteLabel="Hesap bilgileri" prerequisiteActions={<>
    <div className="form-grid">
      <label className="form-field">WABA ID<input aria-label="WABA ID" value={draft.wabaId} maxLength={40} inputMode="numeric" onChange={(event) => change({ wabaId: event.target.value })} /></label>
      <label className="form-field">Phone Number ID<input aria-label="Phone Number ID" value={draft.phoneNumberId} maxLength={40} inputMode="numeric" onChange={(event) => change({ phoneNumberId: event.target.value })} /></label>
      <label className="form-field">Access Token<input aria-label="Access Token" type="password" autoComplete="new-password" value={draft.accessToken ?? ""} maxLength={4096}
        placeholder={draft.hasSecret ? "Kayıtlı anahtarı değiştirmek için girin" : "Erişim anahtarı"} onChange={(event) => change({ accessToken: event.target.value, clearAccessToken: false })} /></label>
    </div>
    {draft.hasSecret && <label className="form-check"><input type="checkbox" checked={Boolean(draft.clearAccessToken)} onChange={(event) => change({ clearAccessToken: event.target.checked, accessToken: "" })} />Kayıtlı erişim anahtarını kaldır</label>}
    </>}>
    <small>Bağlantı testi ayarları kaydetmez.</small>
    <ActionButton variant="secondary" size="sm" disabled={busy || testing || !complete} busy={testing} onClick={() => void test()}>Bağlantıyı test et</ActionButton>

  </ServiceSettingsCard>;
}
