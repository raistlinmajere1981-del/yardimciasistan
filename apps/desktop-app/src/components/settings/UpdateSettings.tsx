import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { compareVersions } from "@yardimci-asistan/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopUpdateStatus } from "../../../electron/desktop-update-service";
import type { SettingsOperationResult } from "../../app/settings-save";
import { IconButton } from "../ui/IconButton";
import { ActionButton } from "../ui/ActionButton";
import { reportAppStatus } from "../../app/runtime-state";

type UpdateAction = "load" | "save" | "check" | "download" | "restart" | "reset" | null;

export function useUpdateSettings(enabled: boolean) {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true);
  const [action, setAction] = useState<UpdateAction>("load");
  const [localMessage, setLocalMessage] = useState("");
  const [error, setError] = useState(false);
  const baselineBaseUrlRef = useRef("");
  const baselineAutoCheckRef = useRef(true);
  const currentBaseUrlRef = useRef("");
  const currentAutoCheckRef = useRef(true);
  const sectionRef = useRef<HTMLElement>(null);
  const baseUrlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    currentBaseUrlRef.current = baseUrl;
    currentAutoCheckRef.current = autoCheckEnabled;
  }, [autoCheckEnabled, baseUrl]);

  useEffect(() => {
    if (!enabled) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getUpdateStatus) {
      setAction(null);
      setLocalMessage("Güncelleme yönetimi hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    let active = true;
    void bridge.getUpdateStatus()
      .then((nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        const nextBaseUrl = nextStatus.customBaseUrl || nextStatus.defaultBaseUrl;
        setBaseUrl(nextBaseUrl);
        setAutoCheckEnabled(nextStatus.autoCheckEnabled);
        baselineBaseUrlRef.current = nextBaseUrl;
        baselineAutoCheckRef.current = nextStatus.autoCheckEnabled;
        setLocalMessage("");
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLocalMessage("Güncelleme durumu okunamadı.");
      })
      .finally(() => {
        if (active) setAction(null);
      });

    const unsubscribe = bridge.onUpdateStatusChanged?.((nextStatus) => {
      if (!active) return;
      setStatus(nextStatus);
      const currentDirty = currentBaseUrlRef.current !== baselineBaseUrlRef.current
        || currentAutoCheckRef.current !== baselineAutoCheckRef.current;
      if (!currentDirty) {
        const nextBaseUrl = nextStatus.customBaseUrl || nextStatus.defaultBaseUrl;
        setBaseUrl(nextBaseUrl);
        setAutoCheckEnabled(nextStatus.autoCheckEnabled);
        baselineBaseUrlRef.current = nextBaseUrl;
        baselineAutoCheckRef.current = nextStatus.autoCheckEnabled;
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [enabled]);

  const busy = action !== null || status?.phase === "checking" || status?.phase === "downloading";
  const newerRemote = Boolean(status?.latestVersion && compareVersions(status.latestVersion, status.currentVersion) > 0);
  const updateAvailable = status?.phase === "available" && newerRemote;
  const updateReady = status?.phase === "ready" && newerRemote;

  const validatePreferences = useCallback(() => {
    if (baseUrl === baselineBaseUrlRef.current && autoCheckEnabled === baselineAutoCheckRef.current) return null;
    if (busy) return "Güncelleme işlemi devam ediyor.";
    if (!window.yardimciDesktop?.saveUpdatePreferences) {
      return "Güncelleme ayarları kaydedilemiyor. Uygulamayı yeniden başlatın.";
    }
    return null;
  }, [autoCheckEnabled, baseUrl, busy]);

  const savePreferences = useCallback(async (): Promise<SettingsOperationResult> => {
    const validationMessage = validatePreferences();
    if (validationMessage) {
      setError(true);
      setLocalMessage("");
      return { ok: false, message: validationMessage };
    }
    if (baseUrl === baselineBaseUrlRef.current && autoCheckEnabled === baselineAutoCheckRef.current) {
      return { ok: true, changed: false };
    }

    const bridge = window.yardimciDesktop;
    if (!bridge?.saveUpdatePreferences) {
      const message = "Güncelleme ayarları kaydedilemiyor. Uygulamayı yeniden başlatın.";
      setLocalMessage("");
      return { ok: false, message };
    }

    setError(false);
    setAction("save");
    setLocalMessage("");
    try {
      const result = await bridge.saveUpdatePreferences({
        customBaseUrl: status && baseUrl.trim() === status.defaultBaseUrl.trim() ? "" : baseUrl,
        autoCheckEnabled
      });
      setStatus(result.status);
      if (!result.ok) {
        setError(true);
        setLocalMessage("");
        return { ok: false, message: result.message };
      }
      const nextBaseUrl = result.status.customBaseUrl || result.status.defaultBaseUrl;
      setBaseUrl(nextBaseUrl);
      setAutoCheckEnabled(result.status.autoCheckEnabled);
      baselineBaseUrlRef.current = nextBaseUrl;
      baselineAutoCheckRef.current = result.status.autoCheckEnabled;
      setLocalMessage("");
      return { ok: true, changed: true, message: result.message };
    } catch {
      setError(true);
      const message = "Güncelleme ayarları kaydedilemedi.";
      setLocalMessage("");
      return { ok: false, message };
    } finally {
      setAction(null);
    }
  }, [autoCheckEnabled, baseUrl, status, validatePreferences]);

  function resetToDefault() {
    if (busy || !status) return;
    setError(false);
    setBaseUrl(status.defaultBaseUrl);
    setLocalMessage("");
  }

  async function checkNow() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.checkForUpdates) return;
    setError(false);
    setAction("check");
    setLocalMessage("");
    try {
      setStatus(await bridge.checkForUpdates(true));
    } catch {
      setError(true);
      setLocalMessage("Güncelleme kontrolü başlatılamadı.");
    } finally {
      setAction(null);
    }
  }

  async function downloadNow() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.downloadUpdate) return;
    setError(false);
    setAction("download");
    setLocalMessage("");
    try {
      setStatus(await bridge.downloadUpdate());
    } catch {
      setError(true);
      setLocalMessage("Güncelleme indirilemedi.");
    } finally {
      setAction(null);
    }
  }

  async function restartAndInstall() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.restartAndInstallUpdate) return;
    setError(false);
    setAction("restart");
    setLocalMessage("Uygulama güncelleme için yeniden başlatılıyor...");
    try {
      const result = await bridge.restartAndInstallUpdate();
      setStatus(result.status);
      setLocalMessage(result.message);
      if (!result.ok) setAction(null);
    } catch {
      setError(true);
      setAction(null);
      setLocalMessage("Güncelleme yeniden başlatması başlatılamadı.");
    }
  }

  const dirty = baseUrl !== baselineBaseUrlRef.current
    || autoCheckEnabled !== baselineAutoCheckRef.current;

  function discard() {
    if (busy) return;
    setBaseUrl(baselineBaseUrlRef.current);
    setAutoCheckEnabled(baselineAutoCheckRef.current);
    setError(false);
    setLocalMessage("");
  }

  return {
    status,
    baseUrl,
    setBaseUrl,
    autoCheckEnabled,
    setAutoCheckEnabled,
    action,
    localMessage,
    error,
    sectionRef,
    baseUrlInputRef,
    busy,
    updateAvailable,
    updateReady,
    savePreferences,
    resetToDefault,
    checkNow,
    downloadNow,
    restartAndInstall,
    dirty,
    discard
  };
}

export function UpdateSettings({ controller }: { controller: ReturnType<typeof useUpdateSettings> }) {
  const {
    status, baseUrl, setBaseUrl, autoCheckEnabled, setAutoCheckEnabled, action, localMessage, error,
    sectionRef, baseUrlInputRef, busy, updateAvailable, updateReady, resetToDefault,
    checkNow, downloadNow, restartAndInstall, savePreferences, dirty
  } = controller;

  async function save() {
    const result = await savePreferences();
    reportAppStatus(
      result.ok ? "success" : "error",
      result.message || (result.ok ? "Güncelleme tercihleri kaydedildi." : "Güncelleme tercihleri kaydedilemedi.")
    );
  }

  const summary = status?.phase === "up-to-date" && !status.lastCheckedAt
    ? "Henüz kontrol edilmedi."
    : status?.message || "Güncelleme durumu okunuyor...";
  const newerVersion = Boolean(status?.latestVersion
    && compareVersions(status.latestVersion, status.currentVersion) > 0);

  return (
    <section ref={sectionRef} id="settings-updates" tabIndex={-1} className="settings-update-section">
      <div className="settings-update-summary" role="status" aria-live="polite">
        <span>{summary}</span>
        {newerVersion && <strong>{status?.currentVersion} → {status?.latestVersion}</strong>}
        {status?.lastCheckedAt && <small>Son kontrol: {formatDateTime(status.lastCheckedAt)}</small>}
        {status?.lastResult && (
          <small>Son kurulum: {status.lastResult.kind === "success" ? "başarılı" : "başarısız"} · {status.lastResult.version}</small>
        )}
      </div>

      <div className="settings-update-address-row">
        <label className="form-field settings-update-url">
          Güncelleme sunucusu
          <input
            disabled={busy}
            ref={baseUrlInputRef}
            value={baseUrl}
            onChange={event => setBaseUrl(event.target.value)}
            placeholder={status?.defaultBaseUrl || "https://.../updates/stable"}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>
        <IconButton className="settings-update-url-reset" aria-label="Güncelleme adresini varsayılana döndür"
          title="Güncelleme adresini varsayılana döndür"
          onClick={resetToDefault} disabled={busy || !status || baseUrl === status.defaultBaseUrl}>
          <RotateCcw size={18} aria-hidden="true" />
        </IconButton>
      </div>

      <label className="form-check setup-checkline settings-update-checkbox">
        <input
          disabled={busy}
          checked={autoCheckEnabled}
          onChange={event => setAutoCheckEnabled(event.target.checked)}
          type="checkbox"
        />
        Otomatik güncellemeleri kontrol et
      </label>

      <div id="settings-update-actions" tabIndex={-1} className="settings-update-actions" aria-label="Güncelleme işlemleri">
        <ActionButton variant="secondary" aria-label="Güncellemeleri Kontrol Et"
          onClick={() => void checkNow()} disabled={busy} busy={action === "check"}
          busyLabel="Kontrol ediliyor…">
          Güncellemeleri Kontrol Et
        </ActionButton>
        {updateAvailable && (
          <IconButton aria-label="Güncellemeyi İndir" title="Güncellemeyi İndir"
            onClick={() => void downloadNow()} disabled={busy || !status?.installSupported}>
            <Download size={18} aria-hidden="true" />
          </IconButton>
        )}
        {updateReady && (
          <IconButton variant="selected" aria-label="Yeniden Başlat ve Güncelle" title="Yeniden Başlat ve Güncelle"
            onClick={() => void restartAndInstall()} disabled={busy}>
            <RefreshCw size={18} aria-hidden="true" />
          </IconButton>
        )}
        <ActionButton className="settings-update-save" aria-label="Güncelleme Tercihlerini Kaydet"
          onClick={() => void save()} disabled={busy || !dirty}
          busy={action === "save"} busyLabel="Kaydediliyor…">
          Kaydet
        </ActionButton>
      </div>

      {status?.phase === "downloading" && status.totalBytes > 0 && (
        <div className="settings-update-progress">
          <progress max={100} value={status.progressPercent} aria-label="Güncelleme indirme ilerlemesi" />
          <small>%{status.progressPercent} · {formatBytes(status.downloadedBytes)} / {formatBytes(status.totalBytes)}</small>
        </div>
      )}
      {status?.notes?.length ? (
        <div className="settings-update-notes">
          <strong>Bu sürüm</strong>
          <ul>{status.notes.map((note, index) => <li key={index + "-" + note}>{note}</li>)}</ul>
        </div>
      ) : null}
      {localMessage && localMessage !== status?.message && (
        <p className={"menu-status sync-" + (error || status?.phase === "error" ? "error" : "idle")}
          role={error || status?.phase === "error" ? "alert" : "status"} aria-live="polite">
          {localMessage}
        </p>
      )}
    </section>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
}
