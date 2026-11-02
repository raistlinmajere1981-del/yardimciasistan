import { IconButton } from "../ui/IconButton";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { WebConnectionSettings } from "../../app/settings-draft-model";
import { reportAppStatus } from "../../app/runtime-state";
import { StatusBadge } from "../ui/StatusBadge";
import { ActionButton } from "../ui/ActionButton";

type TestState = "unchecked" | "testing" | "verified" | "failed";

export function WebSettingsSection({ canonical, web, onChange, enabled: usesWeb, onEnabledChange, trafficEnabled, onTrafficChange, onVerified, onBusyChange, resetVersion, disabled, initialized }: {
  canonical: WebConnectionSettings;
  web: WebConnectionSettings;
  onChange: (web: WebConnectionSettings) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  trafficEnabled: boolean;
  onTrafficChange: (enabled: boolean) => void;
  onVerified: (web: WebConnectionSettings | null) => void;
  onBusyChange: (busy: boolean) => void;
  resetVersion: number;
  disabled: boolean;
  initialized: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  const [savedEvidence, setSavedEvidence] = useState<{ url: string; secret: string; state: TestState }>(() => ({
    url: canonical.webModuleUrl, secret: canonical.syncSecret,
    state: (initialized && canonical.webModuleUrl.trim() && canonical.syncSecret.trim() ? "testing" : "unchecked")
  }));
  const [evidence, setEvidence] = useState<{ url: string; secret: string; state: TestState } | null>(null);
  useEffect(() => { setEvidence(null); }, [resetVersion]);
  function updateWeb(next: WebConnectionSettings) {
    if (next.webModuleUrl !== web.webModuleUrl || next.syncSecret !== web.syncSecret) setEvidence(null);
    onChange(next);
  }
  const [connecting, setConnecting] = useState(false);
  const requestGeneration = useRef(0);
  // Reuse only this mounted form's current probe (including StrictMode effect replay).
  const probe = useRef<{ url: string; secret: string; result: Promise<{ ok: boolean }> } | null>(null);

  useEffect(() => {
    let active = true;
    setEvidence(null);
    const setState = (state: TestState) => setSavedEvidence({ url: canonical.webModuleUrl, secret: canonical.syncSecret, state });
    setState("unchecked");
    if (!initialized || !canonical.webModuleUrl.trim() || !canonical.syncSecret.trim()) return;
    setState("testing");
    if (!probe.current || probe.current.url !== canonical.webModuleUrl || probe.current.secret !== canonical.syncSecret) {
      const result = Promise.resolve().then(() => window.yardimciDesktop?.probeWebConnection({
        baseUrl: canonical.webModuleUrl.trim().replace(/\/+$/, ""), syncSecret: canonical.syncSecret.trim()
      })).then(result => ({ ok: result?.ok === true }), () => ({ ok: false }));
      probe.current = { url: canonical.webModuleUrl, secret: canonical.syncSecret, result };
    }
    // The main-process probe already bounds network work to 10 seconds; also bound UI waiting.
    const timeout = window.setTimeout(() => {
      if (active) { active = false; setState("failed"); }
    }, 12_000);
    void probe.current.result.then(result => {
      if (active) setState(result.ok ? "verified" : "failed");
      window.clearTimeout(timeout);
    });
    return () => { active = false; window.clearTimeout(timeout); };
  }, [initialized, canonical.webModuleUrl, canonical.syncSecret]);

  async function connect() {
    onVerified(null);
    const generation = ++requestGeneration.current;
    const setState = (state: TestState) => setEvidence({ url: web.webModuleUrl, secret: web.syncSecret, state });
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
    onBusyChange(true);
    setState("testing");
    reportAppStatus("loading", "Web bağlantısı ve yayın kaynağı doğrulanıyor…");
    try {
      const result = await bridge.testWebConnection(input);
      if (generation !== requestGeneration.current) return;
      if (!result.ok) {
        setState("failed");
        reportAppStatus("error", result.message || "Web bağlantısı doğrulanamadı.");
        return;
      }
      const source = await bridge.connectWebPublicationSource(input);
      if (generation !== requestGeneration.current) return;
      if (!source.ok) {
        setState("failed");
        reportAppStatus("error", source.message || "Web yayın kaynağı bağlanamadı.");
        return;
      }
      onVerified(web);
      setState("verified");
      reportAppStatus("success", "Web bağlantısı doğrulandı. Tercihleri uygulamak için Kaydet düğmesini kullanın.");
    } catch {
      setState("failed");
      reportAppStatus("error", "Web bağlantısı tamamlanamadı. Tekrar deneyin.");
    } finally {
      setConnecting(false);
      onBusyChange(false);
    }
  }

  const matchingEvidence = [evidence, savedEvidence].find(value => value?.url === web.webModuleUrl && value?.secret === web.syncSecret);
  const state = matchingEvidence?.state ?? "unchecked";
  const busy = disabled || connecting;
  const canConnect = Boolean(web.webModuleUrl.trim() && web.syncSecret.trim());
  const draftConnection = web.webModuleUrl !== canonical.webModuleUrl || web.syncSecret !== canonical.syncSecret;
  const displayState = !usesWeb ? "unused" : connecting ? "testing" : draftConnection && state === "unchecked" ? "draft" : !canConnect ? "unconfigured" : state;
  const status = displayState === "unused" ? "Web kullanılmıyor" : displayState === "draft" ? "Bağlantı değişikliği bekliyor" : displayState === "unconfigured" ? "Bağlantı yapılandırılmadı" : connecting ? "Bağlanıyor" : displayState === "verified" ? "Bağlantı doğrulandı"
    : displayState === "failed" ? "Bağlantı doğrulanamadı" : displayState === "testing" ? "Bağlantı kontrol ediliyor…" : "Bağlantı henüz kontrol edilmedi";

  return (
    <section id="settings-web" tabIndex={-1} className="settings-web-bar" aria-label="Web bağlantısı">
      <div className="settings-web-heading">
        <strong>Web bağlantısı</strong>
        {usesWeb && <StatusBadge className="settings-web-indicator" role="status"
          tone={displayState === "verified" ? "success" : displayState === "failed" ? "danger" : displayState === "testing" ? "info" : displayState === "draft" ? "warning" : "neutral"}>{status}</StatusBadge>}
        <label className="settings-web-choice settings-web-enable">
          <input type="checkbox" checked={usesWeb} disabled={busy}
            onChange={event => onEnabledChange(event.target.checked)} />
          Etkin
        </label>
      </div>
      {usesWeb && <div className="settings-web-fields">
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
            <IconButton variant={reveal ? "selected" : "quiet"} className="settings-web-secret-toggle"
              disabled={busy} aria-label={reveal ? "Anahtarı gizle" : "Anahtarı göster"}
              title={reveal ? "Anahtarı gizle" : "Anahtarı göster"}
              aria-pressed={reveal} onClick={() => setReveal(value => !value)}>
              {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </IconButton>
          </span>
        </label>
        <div className="settings-web-actions">
          <label className="settings-web-choice">
            <input type="checkbox" checked={web.autoSyncEnabled} disabled={busy}
              onChange={event => updateWeb({ ...web, autoSyncEnabled: event.target.checked })} />
            Otomatik eşitle
          </label>
          <ActionButton type="button" disabled={busy || !canConnect}
            onClick={() => void connect()}>{connecting ? "Bağlanıyor…" : "Bağlan"}</ActionButton>
        </div>
        <label className="settings-web-choice settings-web-traffic">
          <input type="checkbox" checked={trafficEnabled} disabled={busy}
            onChange={event => onTrafficChange(event.target.checked)} />
          Site trafiğini ölç
        </label>
        <p className="settings-web-traffic-note">Yalnız anonim ve yaklaşık oturum, sayfa gösterimi ve iletişim tıklaması sayılır. IP adresi, e-posta ve tam URL saklanmaz; kapatıldığında site ziyaretleri kaydedilmez.</p>
      </div>}
    </section>
  );
}
