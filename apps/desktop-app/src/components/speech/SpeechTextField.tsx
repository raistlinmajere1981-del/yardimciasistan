import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mic, Volume2, Square } from "lucide-react";
import { ActionButton } from "../ui/ActionButton";
import { getDesktopTts } from "../../app/tts/desktop-tts";
import { readTtsPreferences, TTS_PREFERENCES_CHANGED } from "../../tts-preferences";
import { createDesktopDictationSession, supportedRecordingMime, type DictationSnapshot } from "../../app/desktop-dictation-session";
import type { DesktopDictationStatus } from "../../../electron/desktop-dictation-contract";
import { desktopNexa } from "../../app/nexa-activity";

let playbackOwner: symbol | null = null;

/** Opt-in playback for a visible, public-facing answer/text, owned by its current surface. */
export function ReadAloudButton({ text, disabled = false }: { text: string; disabled?: boolean }) {
  const [adapter] = useState(getDesktopTts);
  const [available, setAvailable] = useState(() => readTtsPreferences().enabled && adapter.getSnapshot().voices.length > 0);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(0), owner = useRef(Symbol("read-aloud"));
  useEffect(() => {
    const update = () => setAvailable(readTtsPreferences().enabled && adapter.getSnapshot().voices.length > 0);
    const unsubscribe = adapter.subscribe(update);
    window.addEventListener(TTS_PREFERENCES_CHANGED, update);
    window.addEventListener("storage", update);
    update();
    return () => { unsubscribe(); window.removeEventListener(TTS_PREFERENCES_CHANGED, update); window.removeEventListener("storage", update); };
  }, [adapter]);
  useLayoutEffect(() => {
    const stop = () => { active.current++; if (playbackOwner === owner.current) { adapter.cancel(); playbackOwner = null; } setPlaying(false); };
    if (disabled || !available) stop();
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); stop(); };
  }, [adapter, text, disabled, available]);
  if (!available) return null;
  async function speak() {
    const run = ++active.current;
    playbackOwner = owner.current; setPlaying(true); setMessage("");
    const result = await adapter.speak(text, readTtsPreferences());
    if (run !== active.current) return;
    if (playbackOwner === owner.current) playbackOwner = null;
    setPlaying(false);
    if (result.status === "failed") setMessage(result.error.message);
  }
  return <div className="settings-inline-actions">
    <ActionButton type="button" variant="secondary" size="sm" disabled={disabled || !text.trim() || text.length > 16000}
      onClick={() => { if (playing) { active.current++; if (playbackOwner === owner.current) { adapter.cancel(); playbackOwner = null; } setPlaying(false); } else void speak(); }}>
      {playing ? <Square size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}{playing ? "Sesi Durdur" : "Seslendir"}
    </ActionButton>{message && <span role="status">{message}</span>}
  </div>;
}

/** Field draft ownership and business submission remain with the existing canonical editor. */
export function SpeechTextField({ label, value, onChange, maxLength, rows, placeholder, disabled = false, contextKey, showRecordingHint = true }: {
  label: string; value: string; onChange: (text: string) => void; maxLength: number; rows: number; placeholder?: string; disabled?: boolean; contextKey?: string; showRecordingHint?: boolean;
}) {
  const [status, setStatus] = useState<DesktopDictationStatus | null>(null);
  const [capture, setCapture] = useState<DictationSnapshot>({ phase: "idle", transcript: "", message: "" });
  const [session] = useState(() => createDesktopDictationSession({
    getStatus: () => window.yardimciDesktop!.getDictationStatus(),
    transcribe: input => window.yardimciDesktop!.transcribeAudio(input),
    cancelRemote: id => window.yardimciDesktop!.cancelDictation(id), onChange: setCapture
  }));
  useEffect(() => {
    // Only an acquired, recording microphone is a listening signal. Permission,
    // upload and transcript review do not pretend the microphone is still live.
    if (capture.phase === "recording") return desktopNexa.beginListening();
  }, [capture.phase]);
  useEffect(() => {
    let mounted = true, pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const next = await window.yardimciDesktop?.getDictationStatus?.();
        if (mounted) { setStatus(next ?? null); if (next) session.checkStatus(next); }
      } catch { if (mounted) { setStatus(null); session.cancel("Dikte durumu kontrol edilemedi."); } }
      finally { pending = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    const hide = () => { if (document.hidden) session.cancel(); };
    document.addEventListener("visibilitychange", hide);
    return () => { mounted = false; clearInterval(timer); document.removeEventListener("visibilitychange", hide); session.cancel(); };
  }, [session]);
  // Input replacement, editing, pane/operation transition and unmount invalidate late results.
  useLayoutEffect(() => { session.cancel(); return () => session.cancel(); }, [session, value, disabled, contextKey]);
  const microphone = status?.available && supportedRecordingMime();
  const busy = capture.phase !== "idle";
  return <div className="form-stack">
    <label className="form-field form-field--fluid">{label}<textarea aria-label={label} value={value} maxLength={maxLength} rows={rows}
      disabled={disabled} {...(placeholder === undefined ? {} : { placeholder })} onChange={event => { session.cancel(); onChange(event.target.value); }} /></label>
    <div className="settings-inline-actions">
      {microphone && !busy && <ActionButton type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => void session.start()}><Mic size={16} aria-hidden="true" />Dikte Başlat</ActionButton>}
      {capture.phase === "recording" && <ActionButton type="button" variant="secondary" size="sm" onClick={session.stop}>Durdur ve Metne Çevir</ActionButton>}
      {busy && <ActionButton type="button" variant="secondary" size="sm" onClick={() => session.cancel("Kayıt iptal edildi.")}>İptal</ActionButton>}
      <ReadAloudButton text={value} disabled={disabled || busy} />
    </div>
    {showRecordingHint && microphone && !busy && <small>Mikrofon ile kayıt başlar. Yalnız Durdur ile ses web hizmetine gönderilir; en fazla 5 MiB / 2 dakika. İptal sesi göndermez.</small>}
    {capture.phase === "review" && <div className="form-stack">
      <label className="form-field">Dikte önizlemesi<textarea aria-label="Dikte önizlemesi" rows={3} maxLength={16000} value={capture.transcript} onChange={event => session.editTranscript(event.target.value)} /></label>
      {capture.transcript.length > maxLength && <p role="alert">Bu alan en fazla {maxLength} karakter alır. Önizlemeyi kısaltın.</p>}
      <ActionButton type="button" disabled={disabled || !capture.transcript.trim() || capture.transcript.length > maxLength} onClick={() => void session.apply(onChange)}>Metni Kullan</ActionButton>
    </div>}
    {capture.message && <p role="status">{capture.message}</p>}
  </div>;
}
