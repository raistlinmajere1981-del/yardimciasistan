import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GoogleReviewsConnectionTestResult,
  GoogleReviewsSettings,
  SaveGoogleReviewsSettingsInput
} from "../../../electron/google-reviews-settings";
import type { SettingsOperationResult } from "../../app/settings-save";
import { ActionButton } from "../ui/ActionButton";

interface GoogleReviewsDraft {
  enabled: boolean;
  placeId: string;
  apiKey: string;
  clearApiKey: boolean;
}

const EMPTY_SETTINGS: GoogleReviewsSettings = {
  enabled: false,
  placeId: "",
  apiKeyConfigured: false,
  lastPublishedAt: "",
  publicationPending: false
};

function toDraft(settings: GoogleReviewsSettings): GoogleReviewsDraft {
  return {
    enabled: settings.enabled,
    placeId: settings.placeId,
    apiKey: "",
    clearApiKey: false
  };
}

export function useGoogleReviewsSettings(enabled: boolean) {
  const [settings, setSettings] = useState<GoogleReviewsSettings>(EMPTY_SETTINGS);
  const [draft, setDraft] = useState<GoogleReviewsDraft>(() => toDraft(EMPTY_SETTINGS));
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; warning: boolean; message: string }>({
    error: false,
    warning: false,
    message: ""
  });
  const saveInFlight = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void window.yardimciDesktop!.getGoogleReviewsSettings()
      .then((next) => {
        if (!active) return;
        setSettings(next);
        setDraft(toDraft(next));
      })
      .catch(() => {
        if (active) setFeedback({ error: true, warning: false, message: "Google yorumları ayarları yüklenemedi." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [enabled]);

  const dirty = draft.enabled !== settings.enabled
    || draft.placeId.trim() !== settings.placeId
    || Boolean(draft.apiKey.trim())
    || draft.clearApiKey;

  const update = <K extends keyof GoogleReviewsDraft>(key: K, value: GoogleReviewsDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback({ error: false, warning: false, message: "" });
  };

  const buildInput = useCallback((): SaveGoogleReviewsSettingsInput => ({
    enabled: draft.enabled,
    placeId: draft.placeId.trim(),
    apiKey: draft.apiKey.trim(),
    clearApiKey: draft.clearApiKey
  }), [draft]);

  const save = useCallback(async (): Promise<SettingsOperationResult> => {
    if (!dirty && !settings.publicationPending) return { ok: true, changed: false };
    if (saveInFlight.current) return { ok: false, message: "Google yorumları ayarları kaydediliyor." };
    saveInFlight.current = true;
    setSaving(true);
    setFeedback({ error: false, warning: false, message: "" });
    try {
      const result = await window.yardimciDesktop!.saveGoogleReviewsSettings(buildInput());
      if (!result.ok) {
        setFeedback({ error: true, warning: false, message: result.message });
        return { ok: false, message: result.message };
      }
      setSettings(result.settings);
      setDraft(toDraft(result.settings));
      setFeedback({ error: false, warning: Boolean(result.warning), message: result.message });
      return { ok: true, changed: true, message: result.message };
    } catch {
      const message = "Google yorumları ayarları kaydedilemedi.";
      setFeedback({ error: true, warning: false, message });
      return { ok: false, message };
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }, [buildInput, dirty, settings.publicationPending]);

  const testConnection = useCallback(async (): Promise<GoogleReviewsConnectionTestResult> => {
    setTesting(true);
    setFeedback({ error: false, warning: false, message: "" });
    try {
      const result = await window.yardimciDesktop!.testGoogleReviewsConnection({
        placeId: draft.placeId.trim(),
        apiKey: draft.apiKey.trim(),
        clearApiKey: draft.clearApiKey
      });
      setFeedback({
        error: !result.ok,
        warning: false,
        message: result.ok
          ? `${result.message} ${result.name}${result.rating !== null ? ` · ${result.rating.toFixed(1)} ★` : ""} · ${result.userRatingCount} değerlendirme`
          : result.message
      });
      return result;
    } catch {
      const result = { ok: false as const, message: "Google Places bağlantısı denenemedi." };
      setFeedback({ error: true, warning: false, message: result.message });
      return result;
    } finally {
      setTesting(false);
    }
  }, [draft]);

  const discard = () => {
    if (saving) return;
    setDraft(toDraft(settings));
    setFeedback({ error: false, warning: false, message: "" });
  };

  return {
    draft,
    settings,
    loading,
    saving,
    testing,
    dirty,
    feedback,
    update,
    save,
    discard,
    testConnection
  };
}

export function GoogleReviewsSettingsSection({
  controller,
  disabled = false
}: {
  controller: ReturnType<typeof useGoogleReviewsSettings>;
  disabled?: boolean;
}) {
  const { draft, settings, loading, saving, testing, feedback, update, save, testConnection } = controller;
  const apiKeyConfigured = settings.apiKeyConfigured && !draft.clearApiKey;

  return (
    <section id="settings-google-reviews" tabIndex={-1} className="settings-panel" aria-busy={loading || saving || testing}>
      <div className="settings-panel-header">
        <div>
          <h2>Google Yorumları</h2>
          <p>Web sitesinde Google puanı ve misafir yorumlarını güvenli sunucu bağlantısıyla yayınlar.</p>
        </div>
      </div>

      <fieldset className="settings-resource-fields settings-panel-body" disabled={loading || saving || testing || disabled}>
        {feedback.message && (
          <p role={feedback.error ? "alert" : "status"}>
            {feedback.warning ? "Uyarı: " : ""}{feedback.message}
          </p>
        )}

        <label className="setting-switch-row">
          <span>
            <strong>Google yorumlarını web sitesinde göster</strong>
            <small>Kapalıysa yorum alanları ve yorum bağlantıları web sitesinde gizli kalır.</small>
          </span>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => update("enabled", event.target.checked)}
          />
        </label>

        <div className="form-grid">
          <label className="form-field form-field--span">
            Google Place ID
            <input
              value={draft.placeId}
              maxLength={255}
              onChange={(event) => update("placeId", event.target.value)}
              placeholder="ChIJ..."
              autoComplete="off"
            />
            <small>Google Maps'teki işletmenin Place ID değerini girin.</small>
          </label>

          <label className="form-field form-field--span">
            Places API anahtarı
            <input
              type="password"
              value={draft.apiKey}
              onChange={(event) => {
                update("apiKey", event.target.value);
                if (event.target.value) update("clearApiKey", false);
              }}
              placeholder={apiKeyConfigured ? "Kayıtlı anahtarı değiştirmek için yeni anahtar girin" : "AIza..."}
              autoComplete="new-password"
            />
            <small>
              {apiKeyConfigured
                ? "API anahtarı bu cihazda şifreli saklanıyor ve web sayfasına gönderilmiyor."
                : "Places API (New) için bir Google Cloud API anahtarı gerekli."}
            </small>
          </label>
        </div>

        {settings.apiKeyConfigured && (
          <label className="setting-switch-row">
            <span>
              <strong>Kayıtlı API anahtarını sil</strong>
              <small>Google yorumları açıkken anahtar silinemez.</small>
            </span>
            <input
              type="checkbox"
              checked={draft.clearApiKey}
              onChange={(event) => update("clearApiKey", event.target.checked)}
            />
          </label>
        )}

        <div className="settings-inline-actions">
          <ActionButton
            variant="secondary"
            type="button"
            disabled={!draft.placeId.trim() || (!draft.apiKey.trim() && !apiKeyConfigured)}
            onClick={() => { void testConnection(); }}
          >
            {testing ? "Bağlantı deneniyor…" : "Google Bağlantısını Dene"}
          </ActionButton>
          {settings.publicationPending ? (
            <>
              <small>Web yayını bekliyor. Yerel ayar kaydedildi; web modülüne yeniden gönderebilirsiniz.</small>
              <ActionButton
                variant="secondary"
                type="button"
                onClick={() => { void save(); }}
              >
                {saving ? "Web'e gönderiliyor…" : "Web Yayınını Yeniden Dene"}
              </ActionButton>
            </>
          ) : settings.lastPublishedAt ? (
            <small>Son web yayını: {new Date(settings.lastPublishedAt).toLocaleString("tr-TR")}</small>
          ) : null}
        </div>
      </fieldset>
    </section>
  );
}
