import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopUpdateStatus } from "../../../electron/desktop-update-service";
import type { SettingsOperationResult } from "../../app/settings-save";
import { ActionButton } from "../ui/ActionButton";

type UpdateAction = "load" | "save" | "check" | "download" | "restart" | "reset" | null;

export function useUpdateSettings(enabled: boolean) {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true);
  const [action, setAction] = useState<UpdateAction>("load");
  const [localMessage, setLocalMessage] = useState("");
  const [error, setError] = useState(false);
  const preferencesDirtyRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const baseUrlInputRef = useRef<HTMLInputElement>(null);

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
        setBaseUrl(nextStatus.customBaseUrl || nextStatus.defaultBaseUrl);
        setAutoCheckEnabled(nextStatus.autoCheckEnabled);
        setLocalMessage("");
      })
      .catch(() => {
        setError(true);
        if (!active) return;
        setLocalMessage("Güncelleme durumu okunamadı.");
      })
      .finally(() => {
        if (active) setAction(null);
      });

    const unsubscribe = bridge.onUpdateStatusChanged?.((nextStatus) => {
      if (!active) return;
      setStatus(nextStatus);
      if (!preferencesDirtyRef.current) {
        setBaseUrl(nextStatus.customBaseUrl || nextStatus.defaultBaseUrl);
        setAutoCheckEnabled(nextStatus.autoCheckEnabled);
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [enabled]);

  const busy = action !== null || status?.phase === "checking" || status?.phase === "downloading";
  const updateAvailable = status?.phase === "available";
  const updateReady = status?.phase === "ready";

  function markPreferencesDirty() {
    preferencesDirtyRef.current = true;
  }

  const validatePreferences = useCallback(() => {
    if (!preferencesDirtyRef.current) return null;
    if (busy) return "Güncelleme işlemi devam ediyor.";
    if (!window.yardimciDesktop?.saveUpdatePreferences) {
      return "Güncelleme ayarları kaydedilemiyor. Uygulamayı yeniden başlatın.";
    }
    return null;
  }, [busy]);

  const savePreferences = useCallback(async (): Promise<SettingsOperationResult> => {
    const validationMessage = validatePreferences();
    if (validationMessage) {
      setError(true);
      setLocalMessage(validationMessage);
      return { ok: false, message: validationMessage };
    }
    if (!preferencesDirtyRef.current) return { ok: true, changed: false };

    const bridge = window.yardimciDesktop;
    if (!bridge?.saveUpdatePreferences) {
      const message = "Güncelleme ayarları kaydedilemiyor. Uygulamayı yeniden başlatın.";
      setLocalMessage(message);
      return { ok: false, message };
    }

    setError(false);
    setAction("save");
    setLocalMessage("Güncelleme ayarları kaydediliyor...");
    try {
      const result = await bridge.saveUpdatePreferences({
        customBaseUrl: baseUrl,
        autoCheckEnabled
      });
      setStatus(result.status);
      if (!result.ok) {
        setError(true);
        setLocalMessage(result.message);
        return { ok: false, message: result.message };
      }
      setBaseUrl(result.status.customBaseUrl || result.status.defaultBaseUrl);
      setAutoCheckEnabled(result.status.autoCheckEnabled);
      preferencesDirtyRef.current = false;
      setLocalMessage(result.message);
      return { ok: true, changed: true, message: result.message };
    } catch {
      setError(true);
      const message = "Güncelleme ayarları kaydedilemedi.";
      setLocalMessage(message);
      return { ok: false, message };
    } finally {
      setAction(null);
    }
  }, [autoCheckEnabled, baseUrl, validatePreferences]);

  async function resetToDefault() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.saveUpdatePreferences) return;
    setError(false);
    setAction("reset");
    setLocalMessage("Varsayılan güncelleme sunucusuna dönülüyor...");
    try {
      const result = await bridge.saveUpdatePreferences({
        customBaseUrl: "",
        autoCheckEnabled
      });
      setStatus(result.status);
      if (result.ok) {
        setBaseUrl(result.status.defaultBaseUrl);
        preferencesDirtyRef.current = false;
      } else setError(true);
      setLocalMessage(result.message);
    } catch {
      setError(true);
      setLocalMessage("Varsayılan güncelleme sunucusuna dönülemedi.");
    } finally {
      setAction(null);
    }
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

  const dirty = preferencesDirtyRef.current;
  function discard() {
    if (busy || !status) return;
    setBaseUrl(status.customBaseUrl || status.defaultBaseUrl);
    setAutoCheckEnabled(status.autoCheckEnabled);
    preferencesDirtyRef.current = false;
    setError(false);
    setLocalMessage("Güncelleme tercihleri geri alındı.");
  }
  return { status, baseUrl, setBaseUrl, autoCheckEnabled, setAutoCheckEnabled, action, localMessage, error, sectionRef, baseUrlInputRef, busy, updateAvailable, updateReady, markPreferencesDirty, savePreferences, resetToDefault, checkNow, downloadNow, restartAndInstall, dirty, discard };
}

export function UpdateSettings({ controller }: { controller: ReturnType<typeof useUpdateSettings> }) {
  const { status, baseUrl, setBaseUrl, autoCheckEnabled, setAutoCheckEnabled, action, localMessage, error, sectionRef, baseUrlInputRef, busy, updateAvailable, updateReady, markPreferencesDirty, savePreferences, resetToDefault, checkNow, downloadNow, restartAndInstall, dirty, discard } = controller;
  return (
    <section ref={sectionRef} id="settings-updates" tabIndex={-1} className="settings-application-subsection settings-update-section">
      <div className="settings-subsection-heading">
        <div>
          <h3>Güncellemeler</h3>
        </div>
        {status && (
          <span>
            {status.currentVersion}
            {status.latestVersion && status.latestVersion !== status.currentVersion
              ? ` → ${status.latestVersion}`
              : ""}
          </span>
        )}
      </div>

      <div className="form-grid">
        <label className="form-field form-field--long">
          Güncelleme sunucusu
          <input
            disabled={busy}
            ref={baseUrlInputRef}
            value={baseUrl}
            onChange={(event) => {
              markPreferencesDirty();
              setBaseUrl(event.target.value);
            }}
            placeholder={status?.defaultBaseUrl || "https://.../updates/stable"}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <small>Normalde varsayılan adres kullanılır. Sunucu taşınırsa bu alan bir kez değiştirilebilir.</small>
        </label>

        <div className="setup-field">
          <span>Otomatik kontrol</span>
          <label className="form-check setup-checkline">
            <input
              disabled={busy}
              checked={autoCheckEnabled}
              onChange={(event) => {
                markPreferencesDirty();
                setAutoCheckEnabled(event.target.checked);
              }}
              type="checkbox"
            />
            Günde en fazla bir kez güncelleme kontrol et
          </label>
        </div>
      </div>

      <div className="form-actions">
        <ActionButton type="button" disabled={!dirty || busy} onClick={() => void savePreferences()}>Güncelleme Tercihlerini Kaydet</ActionButton>
        <ActionButton variant="secondary" type="button" disabled={!dirty || busy} onClick={discard}>Güncelleme Tercihlerini Geri Al</ActionButton>
        {dirty && <span>Kaydedilmemiş değişiklikler</span>}
      </div>
      <div id="settings-update-actions" tabIndex={-1} className="form-actions">
        <ActionButton
          variant="ghost"
          type="button"
          onClick={() => void resetToDefault()}
          disabled={busy || !status}
        >
          <RotateCcw size={16} aria-hidden="true" />
          Varsayılana Dön
        </ActionButton>
        <ActionButton
          variant="secondary"
          type="button"
          onClick={() => void checkNow()}
          disabled={busy}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {status?.phase === "checking" || action === "check" ? "Kontrol Ediliyor" : "Güncellemeleri Kontrol Et"}
        </ActionButton>
        {updateAvailable && (
          <ActionButton
            variant="secondary"
            type="button"
            onClick={() => void downloadNow()}
            disabled={busy || !status?.installSupported}
          >
            <Download size={16} aria-hidden="true" />
            Güncellemeyi İndir
          </ActionButton>
        )}
        {updateReady && (
          <ActionButton
            variant="primary"
            type="button"
            onClick={() => void restartAndInstall()}
            disabled={busy}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Yeniden Başlat ve Güncelle
          </ActionButton>
        )}
      </div>

      {status?.phase === "downloading" && status.totalBytes > 0 && (
        <div className="setup-field">
          <span>İndirme</span>
          <progress max={100} value={status.progressPercent} />
          <small>
            %{status.progressPercent} · {formatBytes(status.downloadedBytes)} / {formatBytes(status.totalBytes)}
          </small>
        </div>
      )}

      {status?.notes?.length ? (
        <div className="setup-field">
          <span>Bu sürüm</span>
          <ul>
            {status.notes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="setup-field">
        <span>Durum</span>
        <small>
          {status?.message || "Güncelleme durumu okunuyor..."}
          {status?.lastCheckedAt ? ` · Son kontrol: ${formatDateTime(status.lastCheckedAt)}` : ""}
        </small>
        {!status?.installSupported && status && (
          <small>Bu geliştirme ortamında güncelleme kontrolü denenebilir; kurulum yalnız paketlenmiş Windows uygulamasında yapılır.</small>
        )}
        {status?.lastResult && (
          <small>
            Son kurulum: {status.lastResult.kind === "success" ? "başarılı" : "başarısız"} · {status.lastResult.version}
          </small>
        )}
      </div>

      {localMessage && (
        <p className={`menu-status sync-${status?.phase === "error" ? "error" : "idle"}`} role={error || status?.phase === "error" ? "alert" : "status"} aria-live="polite">
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
