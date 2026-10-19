import { IconButton } from "../ui/IconButton";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { WebConnectionSettings } from "../../app/settings-draft-model";
import type { SettingsOperationResult } from "../../app/settings-save";
import { reportAppStatus } from "../../app/runtime-state";
import { StatusBadge } from "../ui/StatusBadge";
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
  const [evidence, setEvidence] = useState<{ url: string; secret: string; state: TestState }>(() => ({
    url: canonical.webModuleUrl, secret: canonical.syncSecret,
    state: (initialized && canonical.webModuleUrl.trim() && canonical.syncSecret.trim() ? "testing" : "unchecked")
  }));
  const [connecting, setConnecting] = useState(false);
  const requestGeneration = useRef(0);
  // Reuse only this mounted form's current probe (including StrictMode effect replay).
  const probe = useRef<{ url: string; secret: string; result: Promise<{ ok: boolean }> } | null>(null);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    let active = true;
    const setState = (state: TestState) => setEvidence({ url: canonical.webModuleUrl, secret: canonical.syncSecret, state });
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
      if (active && generation === requestGeneration.current) { active = false; setState("failed"); }
    }, 12_000);
    void probe.current.result.then(result => {
      if (active && generation === requestGeneration.current) setState(result.ok ? "verified" : "failed");
      window.clearTimeout(timeout);
    });
    return () => { active = false; window.clearTimeout(timeout); };
  }, [initialized, canonical.webModuleUrl, canonical.syncSecret]);

  useEffect(() => {
    setWeb({ webModuleUrl: canonical.webModuleUrl, syncSecret: canonical.syncSecret, autoSyncEnabled: canonical.autoSyncEnabled });
  }, [canonical.webModuleUrl, canonical.syncSecret, canonical.autoSyncEnabled]);

  async function connect() {
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

  const state = evidence.url === canonical.webModuleUrl && evidence.secret === canonical.syncSecret ? evidence.state : "testing";
  const busy = disabled || connecting;
  const canConnect = Boolean(web.webModuleUrl.trim() && web.syncSecret.trim());
  const draftConnection = web.webModuleUrl !== canonical.webModuleUrl || web.syncSecret !== canonical.syncSecret;
  const displayState = connecting ? "testing" : draftConnection ? "draft" : !canConnect ? "unconfigured" : state;
  const status = displayState === "draft" ? "Bağlantı değişikliği bekliyor" : displayState === "unconfigured" ? "Bağlantı yapılandırılmadı" : connecting ? "Bağlanıyor" : displayState === "verified" ? "Bağlantı doğrulandı"
    : displayState === "failed" ? "Bağlantı doğrulanamadı" : displayState === "testing" ? "Bağlantı kontrol ediliyor…" : "Bağlantı henüz kontrol edilmedi";

  return (
    <section id="settings-web" tabIndex={-1} className="settings-web-bar" aria-label="Web bağlantısı">
      <div className="settings-web-heading">
        <strong>Web bağlantısı</strong>
        <StatusBadge className="settings-web-indicator" role="status"
          tone={displayState === "verified" ? "success" : displayState === "failed" ? "danger" : displayState === "testing" ? "info" : displayState === "draft" ? "warning" : "neutral"}>{status}</StatusBadge>
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
            <IconButton variant={reveal ? "selected" : "quiet"} className="settings-web-secret-toggle"
              disabled={busy} aria-label={reveal ? "Anahtarı gizle" : "Anahtarı göster"}
              title={reveal ? "Anahtarı gizle" : "Anahtarı göster"}
              aria-pressed={reveal} onClick={() => setReveal(value => !value)}>
              {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </IconButton>
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
