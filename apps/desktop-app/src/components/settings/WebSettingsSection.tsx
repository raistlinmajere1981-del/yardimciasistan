import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { WebConnectionSettings } from "../../app/settings-draft-model";
import type { SettingsOperationResult } from "../../app/settings-save";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";

type TestState = "unchecked" | "testing" | "verified" | "failed";

export function WebSettingsSection({ canonical, onSave, disabled, initialized, onSetupChange }: {
  canonical: WebConnectionSettings;
  onSetupChange?: (web: WebConnectionSettings) => void;
  onSave: (web: WebConnectionSettings) => Promise<SettingsOperationResult>;
  disabled: boolean;
  initialized: boolean;
}) {
  const [web, setWeb] = useState<WebConnectionSettings>(() => ({
    webModuleUrl: canonical.webModuleUrl, syncSecret: canonical.syncSecret, autoSyncEnabled: canonical.autoSyncEnabled
  }));
  function updateWeb(next: WebConnectionSettings) {
    setWeb(next);
    if (!initialized) onSetupChange?.(next);
  }
  const [reveal, setReveal] = useState(false);
  const [state, setState] = useState<TestState>("unchecked");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setWeb({ webModuleUrl: canonical.webModuleUrl, syncSecret: canonical.syncSecret, autoSyncEnabled: canonical.autoSyncEnabled });
  }, [canonical.webModuleUrl, canonical.syncSecret, canonical.autoSyncEnabled]);

  async function connect() {
    const input = {
      baseUrl: web.webModuleUrl.trim().replace(/\/+$/, ""),
      syncSecret: web.syncSecret.trim()
    };
    const bridge = window.yardimciDesktop;
    if (!bridge?.testWebConnection || !bridge?.connectWebPublicationSource) {
      setState("failed");
      reportAppStatus("error", "Web bağlantı kontrolü hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    setConnecting(true);
    setState("testing");
    reportAppStatus("loading", "Web bağlantısı ve yayın kaynağı doğrulanıyor…");
    try {
      const result = await bridge.testWebConnection(input);
      if (!result.ok) {
        setState("failed");
        reportAppStatus("error", result.message || "Web bağlantısı doğrulanamadı.");
        return;
      }
      const source = await bridge.connectWebPublicationSource(input);
      if (!source.ok) {
        setState("failed");
        reportAppStatus("error", source.message || "Web yayın kaynağı bağlanamadı.");
        return;
      }
      const saved = await onSave(web);
      if (!saved.ok) {
        setState("failed");
        reportAppStatus("error", saved.message || "Web bağlantısı kaydedilemedi.");
        return;
      }
      setState("verified");
      const warning = saved.message && /başarısız|uygulanamadı|hata|uyarı/i.test(saved.message);
      reportAppStatus(warning ? "error" : "success", warning ? saved.message! : "Web bağlantısı ve yayın kaynağı hazır.");
    } catch {
      setState("failed");
      reportAppStatus("error", "Web bağlantısı tamamlanamadı. Tekrar deneyin.");
    } finally {
      setConnecting(false);
    }
  }

  const busy = disabled || connecting;
  const canConnect = Boolean(web.webModuleUrl.trim() && web.syncSecret.trim());
  const status = connecting ? "Bağlanıyor" : state === "verified" ? "Bağlantı doğrulandı"
    : state === "failed" ? "Bağlantı doğrulanamadı" : "Bağlantı henüz kontrol edilmedi";

  return (
    <section id="settings-web" tabIndex={-1} className="settings-web-bar" aria-label="Web bağlantısı">
      <div className="settings-web-heading">
        <strong>Web bağlantısı</strong>
        <span className={`settings-web-indicator is-${state}`} role="img" aria-label={status} title={status} />
        <label className="settings-web-choice">
          <input type="checkbox" checked={web.autoSyncEnabled}
            disabled={busy}
            onChange={event => updateWeb({ ...web, autoSyncEnabled: event.target.checked })} />
          Otomatik eşitle
        </label>
      </div>
      <div className="settings-web-fields">
        <label className="form-field settings-web-url">
          Web eşitleme adresi
          <input value={web.webModuleUrl} disabled={busy} spellCheck={false}
            onChange={event => updateWeb({ ...web, webModuleUrl: event.target.value })} />
        </label>
        <label className="form-field settings-web-secret">
          Web güvenlik anahtarı
          <span className="settings-web-secret-control">
            <input type={reveal ? "text" : "password"} disabled={busy}
              autoComplete="new-password" spellCheck={false} value={web.syncSecret}
              onChange={event => updateWeb({ ...web, syncSecret: event.target.value })} />
            <button type="button" className="settings-web-secret-toggle"
              disabled={busy} aria-label={reveal ? "Anahtarı gizle" : "Anahtarı göster"}
              title={reveal ? "Anahtarı gizle" : "Anahtarı göster"}
              aria-pressed={reveal} onClick={() => setReveal(value => !value)}>
              {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </span>
        </label>
        <div className="settings-web-actions">
          <ActionButton type="button" disabled={busy || !canConnect}
            onClick={() => void connect()}>{connecting ? "Bağlanıyor…" : "Bağlan"}</ActionButton>
        </div>
      </div>
    </section>
  );
}
