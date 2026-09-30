import { useCallback, useEffect, useRef, useState } from "react";
import {
  type KbsConnectionTestResult,
  type KbsProvider,
  type KbsSettings,
  type SaveKbsSettingsInput
} from "../../../electron/kbs-settings";
import type { SettingsOperationResult } from "../../app/settings-save";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";

const EGM_KBS_PORTAL_URL = "https://kbs.egm.gov.tr";

interface KbsDraft {
  enabled: boolean;
  provider: KbsProvider;
  facilityCode: string;
  username: string;
  authorizedIdentityNumber: string;
  password: string;
  clearPassword: boolean;
  secondFactorSecret: string;
  clearSecondFactorSecret: boolean;
}

type KbsWebViewElement = HTMLElement & {
  reload?: () => void;
};

const EMPTY_SETTINGS: KbsSettings = {
  enabled: false,
  provider: "egm",
  facilityCode: "",
  username: "",
  authorizedIdentityNumber: "",
  passwordConfigured: false,
  secondFactorConfigured: false
};

function toDraft(settings: KbsSettings): KbsDraft {
  return {
    enabled: settings.enabled,
    provider: settings.provider,
    facilityCode: settings.facilityCode,
    username: settings.username,
    authorizedIdentityNumber: settings.authorizedIdentityNumber,
    password: "",
    clearPassword: false,
    secondFactorSecret: "",
    clearSecondFactorSecret: false
  };
}

export function useKbsSettings(enabled: boolean) {
  const [settings, setSettings] = useState<KbsSettings>(EMPTY_SETTINGS);
  const [draft, setDraft] = useState<KbsDraft>(() => toDraft(EMPTY_SETTINGS));
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string }>({ error: false, message: "" });
  const saveInFlight = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void window.yardimciDesktop!.getKbsSettings()
      .then((next) => {
        if (!active) return;
        setSettings(next);
        setDraft(toDraft(next));
      })
      .catch(() => {
        if (active) setFeedback({ error: true, message: "Kimlik Bildirim Sistemi ayarları yüklenemedi." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [enabled]);

  const dirty = draft.enabled !== settings.enabled
    || draft.provider !== settings.provider
    || draft.facilityCode.trim() !== settings.facilityCode
    || draft.username.trim() !== settings.username
    || draft.authorizedIdentityNumber.replace(/\D/g, "") !== settings.authorizedIdentityNumber
    || Boolean(draft.password.trim())
    || draft.clearPassword
    || Boolean(draft.secondFactorSecret.trim())
    || draft.clearSecondFactorSecret;

  const update = <K extends keyof KbsDraft>(key: K, value: KbsDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback({ error: false, message: "" });
  };

  const buildInput = useCallback((): SaveKbsSettingsInput => ({
    enabled: draft.enabled,
    provider: draft.provider,
    facilityCode: draft.facilityCode.trim(),
    username: draft.username.trim(),
    authorizedIdentityNumber: draft.authorizedIdentityNumber.replace(/\D/g, ""),
    password: draft.password.trim(),
    clearPassword: draft.clearPassword,
    secondFactorSecret: draft.secondFactorSecret.trim(),
    clearSecondFactorSecret: draft.clearSecondFactorSecret
  }), [draft]);

  const save = useCallback(async (): Promise<SettingsOperationResult> => {
    if (!dirty) return { ok: true, changed: false };
    if (saveInFlight.current) return { ok: false, message: "KBS ayarları kaydediliyor." };
    saveInFlight.current = true;
    setSaving(true);
    setFeedback({ error: false, message: "" });
    try {
      const result = await window.yardimciDesktop!.saveKbsSettings(buildInput());
      if (!result.ok) {
        setFeedback({ error: true, message: result.message });
        return { ok: false, message: result.message };
      }
      setSettings(result.settings);
      setDraft(toDraft(result.settings));
      setFeedback({ error: false, message: result.message });
      return { ok: true, changed: true, message: result.message };
    } catch {
      const message = "Kimlik Bildirim Sistemi ayarları kaydedilemedi.";
      setFeedback({ error: true, message });
      return { ok: false, message };
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }, [buildInput, dirty]);

  const testConnection = useCallback(async (): Promise<KbsConnectionTestResult> => {
    setTesting(true);
    setFeedback({ error: false, message: "" });
    try {
      const result = await window.yardimciDesktop!.testKbsConnection(buildInput());
      setFeedback({ error: !result.ok, message: result.message });
      return result;
    } catch {
      const result = { ok: false as const, message: "KBS bağlantısı denenemedi." };
      setFeedback({ error: true, message: result.message });
      return result;
    } finally {
      setTesting(false);
    }
  }, [buildInput]);

  const discard = () => {
    if (saving) return;
    setDraft(toDraft(settings));
    setFeedback({ error: false, message: "KBS değişiklikleri geri alındı." });
  };

  return { settings, draft, loading, saving, testing, dirty, feedback, update, save, discard, testConnection };
}

export function KbsSettingsSection({
  controller,
  disabled = false
}: {
  controller: ReturnType<typeof useKbsSettings>;
  disabled?: boolean;
}) {
  const { settings, draft, loading, saving, testing, feedback, update, testConnection } = controller;
  const [webLoginOpen, setWebLoginOpen] = useState(false);
  const [webError, setWebError] = useState("");
  const webViewRef = useRef<KbsWebViewElement | null>(null);
  const passwordConfigured = settings.passwordConfigured && !draft.clearPassword;
  const secondFactorConfigured = settings.secondFactorConfigured && !draft.clearSecondFactorSecret;

  useEffect(() => {
    if (!webLoginOpen) return;
    const webview = webViewRef.current;
    if (!webview) return;
    const onLoad = () => setWebError("");
    const onFail = (event: Event) => {
      const detail = event as Event & { errorCode?: number; errorDescription?: string };
      if (detail.errorCode === -3) return;
      setWebError(detail.errorDescription
        ? `EGM KBS sayfası yüklenemedi: ${detail.errorDescription}`
        : "EGM KBS sayfası yüklenemedi.");
    };
    webview.addEventListener("did-finish-load", onLoad);
    webview.addEventListener("did-fail-load", onFail);
    return () => {
      webview.removeEventListener("did-finish-load", onLoad);
      webview.removeEventListener("did-fail-load", onFail);
    };
  }, [webLoginOpen]);

  async function runTest() {
    const result = await testConnection();
    if (result.ok && result.requiresWebLogin) {
      setWebLoginOpen(true);
      setWebError("");
    }
  }

  return (
    <section id="settings-kbs" tabIndex={-1} className={`settings-service-card${draft.enabled ? " is-enabled" : " is-disabled"}`} aria-busy={loading || saving || testing}>
      <div className="settings-service-card-header">
        <div>
          <strong>Kimlik Bildirim Sistemi (KBS)</strong>
          <span>{draft.enabled ? (draft.provider === "egm" ? "Emniyet" : "Jandarma") : "Kapalı"}</span>
        </div>
        <label className="settings-service-toggle">
          <input
            aria-label="Kimlik Bildirim Sistemi servisi"
            type="checkbox"
            checked={draft.enabled}
            disabled={loading || saving || testing || disabled}
            onChange={(event) => update("enabled", event.target.checked)}
          />
          <span>{draft.enabled ? "Açık" : "Kapalı"}</span>
        </label>
      </div>

      {draft.enabled && (
        <fieldset className="settings-service-card-body form-stack" disabled={loading || saving || testing || disabled}>
          <p className="settings-service-empty">
            Konaklayan misafirlerin giriş, çıkış ve oda değişikliği bildirimlerini resmi KBS altyapısına iletmek için kullanılır.
          </p>

          {feedback.message && <p role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}

          <div className="form-grid">
            <label className="form-field form-field--medium">
              Bildirim kurumu
              <select
                value={draft.provider}
                onChange={(event) => {
                  update("provider", event.target.value === "jandarma" ? "jandarma" : "egm");
                  setWebLoginOpen(false);
                }}
              >
                <option value="egm">Emniyet Genel Müdürlüğü</option>
                <option value="jandarma">Jandarma Genel Komutanlığı</option>
              </select>
            </label>

            {draft.provider === "jandarma" && (
              <label className="form-field form-field--medium">
                Tesis kodu
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={draft.facilityCode}
                  onChange={(event) => update("facilityCode", event.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="off"
                />
                <small>Jandarma KBS tarafından tesise verilen 6 haneli kod.</small>
              </label>
            )}

            {draft.provider === "egm" && (
              <label className="form-field form-field--medium">
                KBS kullanıcı adı
                <input
                  value={draft.username}
                  maxLength={120}
                  onChange={(event) => update("username", event.target.value)}
                  autoComplete="off"
                />
              </label>
            )}

            <label className="form-field form-field--medium">
              {draft.provider === "jandarma" ? "Yetkili T.C. kimlik no" : "KBS kullanıcı T.C. kimlik no"}
              <input
                inputMode="numeric"
                maxLength={11}
                value={draft.authorizedIdentityNumber}
                onChange={(event) => update("authorizedIdentityNumber", event.target.value.replace(/\D/g, "").slice(0, 11))}
                autoComplete="off"
              />
            </label>

            <label className="form-field form-field--medium">
              {draft.provider === "jandarma" ? "Web servis şifresi" : "KBS parolası"}
              <input
                type="password"
                value={draft.password}
                onChange={(event) => {
                  update("password", event.target.value);
                  if (event.target.value) update("clearPassword", false);
                }}
                placeholder={passwordConfigured ? "Kayıtlı parolayı değiştirmek için yeni değer girin" : ""}
                autoComplete="new-password"
              />
              <small>{passwordConfigured ? "Parola bu cihazda şifreli saklanıyor." : "Parola kaydedildiğinde işletim sistemi anahtar kasasıyla korunur."}</small>
            </label>

            {draft.provider === "egm" && (
              <label className="form-field form-field--medium">
                EGMSEC / TOTP anahtarı
                <input
                  type="password"
                  value={draft.secondFactorSecret}
                  onChange={(event) => {
                    update("secondFactorSecret", event.target.value);
                    if (event.target.value) update("clearSecondFactorSecret", false);
                  }}
                  placeholder={secondFactorConfigured ? "Kayıtlı anahtarı değiştirmek için yeni değer girin" : "İsteğe bağlı"}
                  autoComplete="new-password"
                />
                <small>Tam otomatik oturum yenilemesi için kullanılabilir. Anahtar yalnız bu cihazda şifreli saklanır.</small>
              </label>
            )}
          </div>

          {settings.passwordConfigured && (
            <label className="setting-switch-row">
              <span><strong>Kayıtlı parolayı sil</strong></span>
              <input type="checkbox" checked={draft.clearPassword} onChange={(event) => update("clearPassword", event.target.checked)} />
            </label>
          )}

          {draft.provider === "egm" && settings.secondFactorConfigured && (
            <label className="setting-switch-row">
              <span><strong>Kayıtlı EGMSEC/TOTP anahtarını sil</strong></span>
              <input type="checkbox" checked={draft.clearSecondFactorSecret} onChange={(event) => update("clearSecondFactorSecret", event.target.checked)} />
            </label>
          )}

          <div className="settings-inline-actions">
            <ActionButton variant="secondary" type="button" onClick={() => { void runTest(); }}>
              {testing ? "Bağlantı deneniyor…" : draft.provider === "egm" ? "KBS Girişini Dene" : "Jandarma Bağlantısını Dene"}
            </ActionButton>
            <StatusBadge tone={draft.provider === "egm" ? "info" : "neutral"}>
              {draft.provider === "egm" ? "Web oturumu" : "Web servis"}
            </StatusBadge>
          </div>

          {draft.provider === "egm" && webLoginOpen && (
            <div className="kbs-login-test">
              <div className="page-toolbar compact">
                <div className="page-toolbar__copy">
                  <strong>EGM KBS giriş testi</strong>
                  <small>Resmi KBS sayfası kalıcı, yalnız KBS için ayrılmış oturumda açılır.</small>
                </div>
                <ActionButton variant="ghost" size="sm" type="button" onClick={() => setWebLoginOpen(false)}>Kapat</ActionButton>
              </div>
              {webError && (
                <div className="status-message status-message--danger" role="alert">
                  <span>{webError}</span>
                  <ActionButton size="sm" type="button" onClick={() => webViewRef.current?.reload?.()}>Yeniden Yükle</ActionButton>
                </div>
              )}
              <webview
                ref={webViewRef}
                className="kbs-login-webview"
                src={EGM_KBS_PORTAL_URL}
                partition="persist:yardimci-kbs-egm"
                allowpopups
                webpreferences="contextIsolation=yes,nodeIntegration=no"
              />
            </div>
          )}
        </fieldset>
      )}
    </section>
  );
}
