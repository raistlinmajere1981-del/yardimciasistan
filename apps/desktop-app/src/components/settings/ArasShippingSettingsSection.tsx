import { useRef, useState } from "react";
import { ARAS_SHIPPING_PROVIDER } from "@yardimci-asistan/shared";
import type { SetupFormState } from "../../app/setup-model";
import { ActionButton } from "../ui/ActionButton";
import { ServiceSettingsCard } from "./ServiceSettingsCard";

export function ArasShippingSettingsSection({ draft, busy, onChange }: {
  draft: SetupFormState["arasShipping"]; busy: boolean; onChange: (next: SetupFormState["arasShipping"]) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const testGeneration = useRef(0);
  const canTest = draft.enabled && Boolean(draft.customerCode.trim() && draft.username.trim()
    && (draft.password || (draft.hasSecret && !draft.clearPassword)));
  function change(patch: Partial<typeof draft>) { ++testGeneration.current; setMessage(""); onChange({ ...draft, ...patch }); }
  async function testConnection() {
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge || testing || !canTest) return;
    const request = ++testGeneration.current;
    setTesting(true);
    try {
      const result = await bridge.testShippingProviderConnection({ enabled: draft.enabled, environment: draft.environment,
        customerCode: draft.customerCode, username: draft.username, password: draft.password, clearPassword: draft.clearPassword });
      if (request === testGeneration.current) setMessage(result.message);
    } catch {
      if (request === testGeneration.current) setMessage("Kargo bağlantısı kontrol edilemedi.");
    } finally { setTesting(false); }
  }
  return <ServiceSettingsCard id="settings-shipping-provider" title={ARAS_SHIPPING_PROVIDER.name}
    status={`Etkin · ${draft.configured ? "Yapılandırılmış" : "Yapılandırılmamış"}`}
    enabled={draft.enabled} disabled={busy || testing} onEnabledChange={(enabled) => change({ enabled })}>
    <div className="form-grid">
      <label className="form-field form-field--fluid">Müşteri kodu<input value={draft.customerCode} maxLength={100} onChange={(event) => change({ customerCode: event.target.value })} /></label>
      <label className="form-field form-field--fluid">Kullanıcı adı<input value={draft.username} maxLength={160} autoComplete="off" onChange={(event) => change({ username: event.target.value })} /></label>
      <label className="form-field form-field--fluid">Şifre<input type="password" value={draft.password ?? ""} maxLength={512} autoComplete="new-password"
        placeholder={draft.hasSecret ? "Kayıtlı şifre korunur" : "Şifre girin"} onChange={(event) => change({ password: event.target.value, clearPassword: false })} /></label>
      <label className="form-field form-field--fluid">Ortam<select aria-label="Ortam" value={draft.environment} onChange={(event) => change({ environment: event.target.value === "production" ? "production" : "test" })}>
        <option value="test">Test</option><option value="production">Canlı</option></select></label>
    </div>
    {draft.hasSecret && <label className="form-check setup-checkline"><input type="checkbox" checked={Boolean(draft.clearPassword)} onChange={(event) => change({ clearPassword: event.target.checked, password: "" })} /><span>Kayıtlı şifreyi kaldır</span></label>}
    <p>Değişiklikler Servisler kategorisi kaydedildiğinde uygulanır. Bağlantı testi ayarları kaydetmez.</p>
    <div className="settings-inline-actions"><ActionButton variant="secondary" size="sm" disabled={busy || testing || !canTest} busy={testing} onClick={() => void testConnection()}>Bağlantıyı test et</ActionButton></div>
    {message && <p role="status">{message}</p>}
  </ServiceSettingsCard>;
}
