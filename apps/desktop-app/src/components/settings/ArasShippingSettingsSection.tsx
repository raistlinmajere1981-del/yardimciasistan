import { reportAppStatus } from "../../app/runtime-state";
import { useEffect, useState } from "react";
import { ARAS_SHIPPING_PROVIDER, isArasShippingConfigurationReady, type ArasShippingConfiguration, type ShippingConnectionTestResult } from "@yardimci-asistan/shared";
import { useSettingsConnectionTest } from "../../app/use-settings-connection-test";
import type { SetupFormState } from "../../app/setup-model";
import { ActionButton } from "../ui/ActionButton";

export function ArasShippingSettingsSection({ draft, busy, onChange }: {
  draft: SetupFormState["arasShipping"]; busy: boolean; onChange: (next: SetupFormState["arasShipping"]) => void;
}) {
  const connection = useSettingsConnectionTest<ShippingConnectionTestResult>(draft);
  const { testing } = connection;
  const message = connection.result?.message ?? "";
  useEffect(() => { if (message) reportAppStatus(connection.result?.ok ? "success" : "error", message); }, [message, connection.result]);
  const canTest = isArasShippingConfigurationReady(draft);
  const [stored, setStored] = useState<ArasShippingConfiguration | null>(null);
  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop?.commerce;
    setStored(null);
    if (bridge?.getShippingProviderConfiguration) void bridge.getShippingProviderConfiguration()
      .then(config => { if (active) setStored(config); })
      .catch(() => { /* No main-owned evidence: remain untested. */ });
    return () => { active = false; };
  }, [draft.environment, draft.customerCode, draft.username, draft.password, draft.clearPassword, draft.hasSecret]);
  const matchesStored = !draft.password && !draft.clearPassword && draft.hasSecret && stored?.verified
    && stored.environment === draft.environment && stored.customerCode === draft.customerCode && stored.username === draft.username;
  const ready = connection.result ? connection.result.ok : matchesStored;
  const status = testing ? "Kontrol ediliyor…" : connection.result?.ok === false ? "Hata" : !canTest ? "Yapılandırılmadı" : ready ? "Hazır" : "Test edilmedi";
  function change(patch: Partial<typeof draft>) { connection.clear(); onChange({ ...draft, ...patch }); }
  async function testConnection() {
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge || testing || !canTest) return;
    await connection.run(async () => {
      try { return await bridge.testShippingProviderConnection({ enabled: false, environment: draft.environment,
        customerCode: draft.customerCode, username: draft.username,
        ...(draft.password === undefined ? {} : { password: draft.password }),
        ...(draft.clearPassword === undefined ? {} : { clearPassword: draft.clearPassword }) });
      } catch { return { ok: false, providerId: "aras", message: "Kargo bağlantısı kontrol edilemedi.", testedAt: new Date().toISOString() }; }
    });
  }
  return <section id="settings-shipping-provider" aria-label={ARAS_SHIPPING_PROVIDER.name} tabIndex={-1} className="form-stack">
    <div className="settings-panel-header"><h4>{ARAS_SHIPPING_PROVIDER.name}</h4><span>{status}</span></div>
    <fieldset className="settings-resource-fields form-stack" disabled={busy || testing}>
    <div className="form-grid">
      <label className="form-field form-field--fluid">Müşteri kodu<input value={draft.customerCode} maxLength={100} onChange={(event) => change({ customerCode: event.target.value })} /></label>
      <label className="form-field form-field--fluid">Kullanıcı adı<input value={draft.username} maxLength={160} autoComplete="off" onChange={(event) => change({ username: event.target.value })} /></label>
      <label className="form-field form-field--fluid">Şifre<input type="password" value={draft.password ?? ""} maxLength={512} autoComplete="new-password"
        placeholder={draft.hasSecret ? "Kayıtlı şifre korunur" : "Şifre girin"} onChange={(event) => change({ password: event.target.value, clearPassword: false })} /></label>
      <label className="form-field form-field--fluid">Ortam<select aria-label="Ortam" value={draft.environment} onChange={(event) => change({ environment: event.target.value === "production" ? "production" : "test" })}>
        <option value="test">Test</option><option value="production">Canlı</option></select></label>
    </div>
    {draft.hasSecret && <label className="form-check setup-checkline"><input type="checkbox" checked={Boolean(draft.clearPassword)} onChange={(event) => change({ clearPassword: event.target.checked, password: "" })} /><span>Kayıtlı şifreyi kaldır</span></label>}
    <small>Bağlantı testi ayarları kaydetmez.</small>
    <div className="settings-inline-actions"><ActionButton variant="secondary" size="sm" disabled={busy || testing || !canTest} busy={testing} onClick={() => void testConnection()}>Bağlantıyı test et</ActionButton></div>

    </fieldset>
  </section>;
}
