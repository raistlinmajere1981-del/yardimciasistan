import { SYSTEM_TTS_ENGINE_ID, validateTtsPreferences } from "../../tts-preferences";
import type { TtsAdapter, TtsError, TtsPreferences, TtsSelection, TtsSnapshot, TtsSpeakResult, TtsVoice } from "./tts-adapter";

const NO_VOICES: TtsError = { code: "no-voices", message: "Yerel ses bulunamadı. İşletim sisteminin konuşma seslerini kontrol edin ve yeniden deneyin." };
const UNAVAILABLE: TtsError = { code: "unavailable", message: "Bu cihazda sistem konuşma motoru kullanılamıyor." };

function languageKey(language: string): string { return language.toLowerCase().replaceAll("_", "-"); }
function voiceId(voice: SpeechSynthesisVoice): string {
  // URI is provider-owned. Language/name disambiguate engines that reuse a URI.
  return JSON.stringify([voice.voiceURI, voice.lang, voice.name]);
}

export function createWebSpeechTtsAdapter(): TtsAdapter {
  let synthesis: SpeechSynthesis | null = null;
  try {
    if (typeof SpeechSynthesisUtterance !== "undefined") synthesis = window.speechSynthesis ?? null;
  } catch { /* An exposed API does not guarantee a working Linux backend. */ }
  let snapshot: TtsSnapshot = {
    engineId: SYSTEM_TTS_ENGINE_ID, engineName: "Sistem / Yerel", state: "idle",
    // Web Speech exposes pitch but no per-engine support metadata. Do not assert support.
    features: { rate: true, pitch: false, volume: true }, voices: [], error: null
  };
  const listeners = new Set<() => void>();
  let nativeVoices: SpeechSynthesisVoice[] = [];
  let discoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let listening = false;
  let active: { utterance: SpeechSynthesisUtterance; cancel: () => void } | null = null;

  function update(patch: Partial<TtsSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  function stopDiscovery() {
    clearTimeout(discoveryTimer);
    clearInterval(pollTimer);
    discoveryTimer = undefined;
    pollTimer = undefined;
  }

  function readVoices() {
    if (!synthesis || snapshot.state === "disposed") return;
    try {
      // Never fall through to a remote/default browser voice when local voices are absent.
      nativeVoices = synthesis.getVoices().filter(voice => voice.localService === true);
      const voices: TtsVoice[] = nativeVoices.map(voice => ({
        engineId: SYSTEM_TTS_ENGINE_ID, id: voiceId(voice), name: voice.name,
        language: voice.lang, isDefault: voice.default
      }));
      if (voices.length) {
        stopDiscovery();
        update({ voices, state: "available", error: null });
      } else {
        update({ voices, state: discoveryTimer === undefined ? "unavailable" : "discovering", error: NO_VOICES });
      }
    } catch {
      nativeVoices = [];
      stopDiscovery();
      update({ voices: [], state: "error", error: { code: "discovery-failed", message: "Yerel ses listesi okunamadı. Yeniden deneyin." } });
    }
  }

  function refresh() {
    if (snapshot.state === "disposed") return;
    if (!synthesis) { update({ state: "unavailable", error: UNAVAILABLE }); return; }
    if (!listening) {
      try {
        synthesis.addEventListener("voiceschanged", readVoices);
        listening = true;
      } catch {
        nativeVoices = [];
        update({ voices: [], state: "error", error: { code: "discovery-failed", message: "Sistem konuşma motoru başlatılamadı. Yeniden deneyin." } });
        return;
      }
    }
    stopDiscovery();
    update({ state: "discovering", error: null });
    // Some Chromium backends populate getVoices later without emitting voiceschanged.
    discoveryTimer = setTimeout(() => { stopDiscovery(); readVoices(); }, 1500);
    pollTimer = setInterval(readVoices, 250);
    readVoices();
  }

  function start() { if (snapshot.state === "idle") refresh(); }

  function resolveVoice(preferences: TtsPreferences): TtsSelection {
    const voices = snapshot.voices;
    const selected = voices.find(voice => voice.id === preferences.voiceId);
    const requested = languageKey(preferences.language ?? "tr-TR");
    const exact = voices.filter(voice => languageKey(voice.language) === requested);
    const related = voices.filter(voice => languageKey(voice.language).split("-")[0] === requested.split("-")[0]);
    const preferred = (items: readonly TtsVoice[]) => items.find(voice => voice.isDefault) ?? items[0];
    const voice = selected ?? preferred(exact) ?? preferred(related) ?? preferred(voices) ?? null;
    return {
      voice,
      preferredVoiceMissing: preferences.voiceId !== null && !selected,
      languageFallback: !selected && voice !== null && languageKey(voice.language).split("-")[0] !== requested.split("-")[0]
    };
  }

  function cancel() {
    // Detach callbacks before native cancel; interrupted/canceled events can arrive late.
    active?.cancel();
    try { synthesis?.cancel(); } catch { /* Local promise is already settled. */ }
  }

  function speak(text: string, preferences: TtsPreferences, onStart?: () => void): Promise<TtsSpeakResult> {
    start();
    cancel();
    readVoices(); // Re-resolve native instances after an install/uninstall or refresh.
    const invalid = validateTtsPreferences(preferences);
    if (invalid || !text.trim() || text.length > 500 || /[<>]/.test(text)) {
      return Promise.resolve({ status: "failed", error: { code: "invalid-preferences", message: invalid ?? "Konuşma metni geçersiz." } });
    }
    if (!synthesis || snapshot.state === "disposed") return Promise.resolve({ status: "failed", error: UNAVAILABLE });
    const selection = resolveVoice(preferences);
    const nativeVoice = nativeVoices.find(voice => voiceId(voice) === selection.voice?.id);
    if (!nativeVoice) return Promise.resolve({ status: "failed", error: snapshot.error ?? NO_VOICES });

    return new Promise(resolve => {
      let started = false;
      let settled = false;
      let startTimer: ReturnType<typeof setTimeout> | undefined;
      let completionTimer: ReturnType<typeof setTimeout> | undefined;
      let utterance: SpeechSynthesisUtterance;
      const finish = (result: TtsSpeakResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(startTimer);
        clearTimeout(completionTimer);
        if (utterance) utterance.onstart = utterance.onend = utterance.onerror = null;
        active = null;
        resolve(result);
      };
      const fail = (error: TtsError) => {
        if (settled) return;
        finish({ status: "failed", error });
        try { synthesis?.cancel(); } catch { /* Failure remains explicit. */ }
      };
      try {
        utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = nativeVoice;
        utterance.lang = nativeVoice.lang;
        utterance.rate = preferences.rate;
        utterance.volume = preferences.volume / 100;
        // Unsupported pitch stays at the native default; future adapters may honor it.
        utterance.pitch = snapshot.features.pitch ? preferences.pitch : 1;
        active = { utterance, cancel: () => finish({ status: "cancelled" }) };
        startTimer = setTimeout(() => fail({ code: "start-timeout", message: "Konuşma başlatılamadı. Sistem sesini kontrol edip yeniden deneyin." }), 500);
        completionTimer = setTimeout(() => fail({ code: "completion-timeout", message: "Konuşma tamamlanamadı. Yeniden deneyin." }), 30000);
        utterance.onstart = () => {
          if (settled) return;
          started = true;
          clearTimeout(startTimer);
          onStart?.();
        };
        utterance.onend = () => {
          if (started) finish({ status: "completed", selection });
          else fail({ code: "start-timeout", message: "Konuşma başlamadan sona erdi. Yeniden deneyin." });
        };
        utterance.onerror = () => fail({ code: "synthesis-failed", message: "Sistem sesi oynatılamadı. Başka bir yerel ses seçip yeniden deneyin." });
        if (synthesis.paused) synthesis.resume();
        synthesis.speak(utterance);
      } catch { fail({ code: "synthesis-failed", message: "Sistem sesi oynatılamadı. Yeniden deneyin." }); }
    });
  }

  return {
    engineId: SYSTEM_TTS_ENGINE_ID,
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start, refresh, resolveVoice, speak, cancel,
    dispose: () => {
      cancel();
      stopDiscovery();
      if (listening) synthesis?.removeEventListener("voiceschanged", readVoices);
      listening = false;
      nativeVoices = [];
      update({ state: "disposed", voices: [], error: null });
      listeners.clear();
    }
  };
}
