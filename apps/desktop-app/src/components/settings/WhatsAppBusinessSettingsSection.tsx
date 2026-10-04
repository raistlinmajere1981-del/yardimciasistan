import { useState } from "react";
import type { SetupFormState } from "../../app/setup-model";
import { ServiceSettingsCard } from "./ServiceSettingsCard";
import { ActionButton } from "../ui/ActionButton";
export function WhatsAppBusinessSettingsSection({ draft, busy, onChange }: {
  draft: SetupFormState["whatsappCloud"]; busy: boolean; onChange: (draft: SetupFormState["whatsappCloud"]) => void;
}) {
  const [testing, setTesting] = useState(false), [message, setMessage] = useState("");
  const change = (patch: Partial<typeof draft>) => { setMessage(""); onChange({ ...draft, ...patch }); };
  const complete = Boolean(draft.wabaId && draft.phoneNumberId && (draft.accessToken || (draft.hasSecret && !draft.clearAccessToken)));
  async function test() {
    const bridge = window.yardimciDesktop; if (!bridge) return;
    setTesting(true);
    try { const result = await bridge.testBusinessMessagingConnection({ enabled: draft.enabled, wabaId: draft.wabaId, phoneNumberId: draft.phoneNumberId, accessToken: draft.accessToken, clearAccessToken: draft.clearAccessToken }); setMessage(result.message); }
    catch { setMessage("Bağlantı testi tamamlanamadı."); } finally { setTesting(false); }
  }
  return <ServiceSettingsCard id="settings-whatsapp-business" title="WhatsApp Business" enabled={draft.enabled}
    status={complete ? "Etkin · Yapılandırılmış" : "Etkin · Yapılandırılmamış"} disabled={busy || testing} onEnabledChange={(enabled) => change({ enabled })}>
    <div className="form-grid">
      <label className="form-field">WABA ID<input aria-label="WABA ID" value={draft.wabaId} maxLength={40} inputMode="numeric" onChange={(event) => change({ wabaId: event.target.value })} /></label>
      <label className="form-field">Phone Number ID<input aria-label="Phone Number ID" value={draft.phoneNumberId} maxLength={40} inputMode="numeric" onChange={(event) => change({ phoneNumberId: event.target.value })} /></label>
      <label className="form-field">Access Token<input aria-label="Access Token" type="password" autoComplete="new-password" value={draft.accessToken ?? ""} maxLength={4096}
        placeholder={draft.hasSecret ? "Kayıtlı anahtarı değiştirmek için girin" : "Erişim anahtarı"} onChange={(event) => change({ accessToken: event.target.value, clearAccessToken: false })} /></label>
    </div>
    {draft.hasSecret && <label className="form-check"><input type="checkbox" checked={Boolean(draft.clearAccessToken)} onChange={(event) => change({ clearAccessToken: event.target.checked, accessToken: "" })} />Kayıtlı erişim anahtarını kaldır</label>}
    <p>Değişiklikler Servisler kategorisi kaydedildiğinde uygulanır. Bağlantı testi ayarları kaydetmez.</p>
    <ActionButton variant="secondary" size="sm" disabled={busy || testing || !complete} busy={testing} onClick={() => void test()}>Bağlantıyı test et</ActionButton>
    {message && <p role="status">{message}</p>}
  </ServiceSettingsCard>;
}
