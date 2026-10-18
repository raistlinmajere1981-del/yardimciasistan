import { useContext, useEffect, useRef, useState } from "react";
import { getDesktopTts } from "../../app/tts/desktop-tts";
import { readTtsPreferences } from "../../tts-preferences";
import type { useTtsSettings } from "../../app/use-tts-settings";
import { ActionButton } from "../ui/ActionButton";
import { ServiceSettingsContext, ServiceSettingsCard } from "./ServiceSettingsCard";

export function SpeechSettingsSection({ controller, disabled = false }: {
  controller: ReturnType<typeof useTtsSettings>;
  disabled?: boolean;
}) {
  const host = useContext(ServiceSettingsContext);
  const [adapter] = useState(getDesktopTts);
  const [snapshot, setSnapshot] = useState(() => adapter.getSnapshot());
  const [testing, setTesting] = useState(false);
  const [readiness, setReadiness] = useState<"Test edilmedi" | "Hazır" | "Hata">("Test edilmedi");
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  const previewActive = useRef(false);
  const { preferences, change } = controller;
  const committedEnabled = controller.savedPreferences.enabled;

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = adapter.subscribe(() => setSnapshot(adapter.getSnapshot()));
    setSnapshot(adapter.getSnapshot());
    return () => {
      mounted.current = false;
      unsubscribe();
      if (previewActive.current) adapter.cancel();
    };
  }, [adapter]);

  useEffect(() => { setReadiness("Test edilmedi"); setMessage(""); }, [preferences]);

  useEffect(() => {
    if (host && host.active !== "settings-speech" && previewActive.current) adapter.cancel();
  }, [host, adapter]);
  const selection = adapter.resolveVoice(preferences);
  const languages = [...new Set(snapshot.voices.map(voice => voice.language))].sort();
  const visibleVoices = snapshot.voices.filter(voice => !preferences.language || voice.language === preferences.language);
  const status = snapshot.state === "discovering" ? "Yerel sesler aranıyor…"
    : snapshot.state === "available" ? `${snapshot.voices.length} yerel ses`
      : snapshot.state === "unavailable" ? "Yerel ses yok" : "Motor kullanılamıyor";

  async function testVoice() {
    if (previewActive.current || !preferences.enabled || !readTtsPreferences().enabled) return;
    previewActive.current = true;
    setTesting(true);
    setMessage("Ses denemesi başlatılıyor…");
    const result = await adapter.speak("Yardımcı Asistan. Ses denemesi.", preferences, () => {
      if (mounted.current) setMessage(preferences.volume === 0 ? "Ses düzeyi 0: deneme sessiz oynatılıyor." : "Ses denemesi oynatılıyor…");
    });
    previewActive.current = false;
    if (!mounted.current) return;
    setTesting(false);
    setReadiness(result.status === "failed" ? "Hata" : result.status === "cancelled" ? "Test edilmedi" : "Hazır");
    setMessage(result.status === "failed" ? result.error.message
      : result.status === "cancelled" ? "Ses denemesi durduruldu."
        : preferences.volume === 0 ? "Ses düzeyi 0: sessiz deneme tamamlandı." : "Ses denemesi tamamlandı.");
  }

  return <ServiceSettingsCard id="settings-speech" title="Metin Seslendirme" enabled={preferences.enabled}
    readiness={snapshot.state === "unavailable" || snapshot.state === "error" ? "Kullanılamıyor" : testing ? "Kontrol ediliyor…" : readiness} testMessage={message}
    status={status} disabled={disabled} toggleLabel="Seslendirme etkin"
    onEnabledChange={enabled => { if (!enabled && previewActive.current) adapter.cancel(); change({ ...preferences, enabled }); }}
    >
    {preferences.enabled && !committedEnabled && <small>Etkinleştirmek için Kaydet seçin.</small>}
    <fieldset className="settings-resource-fields" disabled={disabled || testing}>
      <div className="form-grid">
        <div className="form-field"><span>Konuşma motoru</span><strong>{snapshot.engineName}</strong></div>
        <label className="form-field">Konuşma dili
          <select value={preferences.language ?? ""} onChange={event => change({ ...preferences, language: event.target.value || null, voiceId: null })}>
            <option value="">Otomatik (Türkçe öncelikli)</option>
            {preferences.language && !languages.includes(preferences.language) && <option value={preferences.language}>{preferences.language} — yerel ses yok</option>}
            {languages.map(language => <option key={language} value={language}>{language}</option>)}
          </select>
        </label>
        <label className="form-field">Konuşma sesi
          <select value={preferences.voiceId ?? ""} onChange={event => change({ ...preferences, voiceId: event.target.value || null })}>
            <option value="">Otomatik</option>
            {preferences.voiceId && !visibleVoices.some(voice => voice.id === preferences.voiceId) && <option value={preferences.voiceId}>Kayıtlı ses kullanılamıyor</option>}
            {visibleVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.name} · {voice.language}{voice.isDefault ? " · Sistem varsayılanı" : ""}{voice.gender ? ` · ${voice.gender}` : ""}</option>)}
          </select>
        </label>
        <label className="form-field">Konuşma hızı ({preferences.rate.toFixed(2)}×)
          <input type="range" min="0.5" max="1.5" step="0.05" value={preferences.rate}
            onChange={event => change({ ...preferences, rate: Number(event.target.value) })} />
        </label>
        {snapshot.features.pitch && <label className="form-field">Konuşma tonu
          <input type="range" min="0" max="2" step="0.1" value={preferences.pitch}
            onChange={event => change({ ...preferences, pitch: Number(event.target.value) })} />
        </label>}
        <label className="form-field">Ses düzeyi (%{preferences.volume})
          <input type="range" min="0" max="100" step="1" value={preferences.volume}
            onChange={event => change({ ...preferences, volume: Number(event.target.value) })} />
        </label>
      </div>
    </fieldset>
    {selection.voice && <small>Ses: {selection.voice.name} · {selection.voice.language}
      {selection.preferredVoiceMissing && " · Kayıtlı ses bulunamadı"}
      {selection.languageFallback && " · Dil için yedek ses"}
    </small>}
    <div className="settings-inline-actions">
      <ActionButton type="button" variant="secondary" disabled={disabled || testing} onClick={() => adapter.refresh()}>Sesleri Yenile</ActionButton>
      <ActionButton type="button" variant="secondary" disabled={disabled || testing || !preferences.enabled || !committedEnabled || !selection.voice} onClick={() => { void testVoice(); }}>Sesi Dene</ActionButton>
      {testing && <ActionButton type="button" variant="secondary" onClick={() => adapter.cancel()}>Sesi Durdur</ActionButton>}
    </div>

  </ServiceSettingsCard>;
}
