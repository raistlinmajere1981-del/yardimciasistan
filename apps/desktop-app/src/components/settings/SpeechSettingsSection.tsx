import { useEffect, useRef, useState } from "react";
import { getDesktopTts } from "../../app/tts/desktop-tts";
import { readTtsPreferences, TTS_PREFERENCES_CHANGED } from "../../tts-preferences";
import type { useTtsSettings } from "../../app/use-tts-settings";
import { ActionButton } from "../ui/ActionButton";
import { ServiceSettingsCard } from "./ServiceSettingsCard";

export function SpeechSettingsSection({ controller, disabled = false }: {
  controller: ReturnType<typeof useTtsSettings>;
  disabled?: boolean;
}) {
  const [adapter] = useState(getDesktopTts);
  const [snapshot, setSnapshot] = useState(() => adapter.getSnapshot());
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [committedEnabled, setCommittedEnabled] = useState(() => readTtsPreferences().enabled);
  const mounted = useRef(false);
  const previewActive = useRef(false);
  const { preferences, change } = controller;

  useEffect(() => {
    const update = () => setCommittedEnabled(readTtsPreferences().enabled);
    window.addEventListener(TTS_PREFERENCES_CHANGED, update);
    return () => window.removeEventListener(TTS_PREFERENCES_CHANGED, update);
  }, []);

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

  const selection = adapter.resolveVoice(preferences);
  const languages = [...new Set(snapshot.voices.map(voice => voice.language))].sort();
  const visibleVoices = snapshot.voices.filter(voice => !preferences.language || voice.language === preferences.language);
  const status = snapshot.state === "discovering" ? "Yerel sesler aranıyor…"
    : snapshot.state === "available" ? `${snapshot.voices.length} yerel ses`
      : snapshot.error?.message ?? "Sistem konuşma motoru kullanılamıyor.";

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
    setMessage(result.status === "failed" ? result.error.message
      : result.status === "cancelled" ? "Ses denemesi durduruldu."
        : preferences.volume === 0 ? "Ses düzeyi 0: sessiz deneme tamamlandı." : "Ses denemesi tamamlandı.");
  }

  return <ServiceSettingsCard id="settings-speech" title="Konuşma ve Yazma" enabled status={preferences.enabled ? status : "Seslendirme kapalı"} disabled={disabled}>
    <p>Bu masaüstündeki uygulamaya özeldir. Kaydet ile uygulanır; Sesi Dene taslağı kullanır.</p>
    <label className="form-check"><input type="checkbox" checked={preferences.enabled} disabled={disabled || testing}
      onChange={event => change({ ...preferences, enabled: event.target.checked })} />Seslendirme etkin</label>
    <p>Hoparlör, bu tercih kaydedildiğinde ve yerel ses bulunduğunda görünür. Metin yalnız Seslendir ile okunur. Kapalıyken kamera güvenlik bipleri devam eder.</p>
    {preferences.enabled && !committedEnabled && <p role="status">Seslendirmeyi açmak için önce Kaydet seçin.</p>}
    <fieldset className="settings-resource-fields form-grid" disabled={disabled || testing}>
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
    </fieldset>
    {!snapshot.features.pitch && <small>Sistem motoru ton desteğini bildirmiyor.</small>}
    {selection.voice && <p role="status">Kullanılacak ses: {selection.voice.name} · {selection.voice.language}
      {selection.preferredVoiceMissing && ". Kayıtlı ses bulunamadı; kullanılabilir yerel sese dönüldü."}
      {selection.languageFallback && ". İstenen dilde yerel ses yok; bu sesin dili kullanılacak."}
    </p>}
    <div className="settings-inline-actions">
      <ActionButton type="button" variant="secondary" disabled={disabled || testing} onClick={() => adapter.refresh()}>Sesleri Yenile</ActionButton>
      <ActionButton type="button" variant="secondary" disabled={disabled || testing || !preferences.enabled || !committedEnabled || !selection.voice} onClick={() => { void testVoice(); }}>Sesi Dene</ActionButton>
      {testing && <ActionButton type="button" variant="secondary" onClick={() => adapter.cancel()}>Sesi Durdur</ActionButton>}
    </div>
    {message && <p role="status">{message}</p>}
    {controller.error && <p role="alert">{controller.error}</p>}
  </ServiceSettingsCard>;
}
