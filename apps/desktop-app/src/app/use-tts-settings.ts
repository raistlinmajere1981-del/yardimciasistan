import { useCallback, useEffect, useRef, useState } from "react";
import { readTtsPreferences, saveTtsPreferences, TTS_PREFERENCES_CHANGED } from "../tts-preferences";
import type { TtsPreferences } from "./tts/tts-adapter";
import type { SettingsOperationResult } from "./settings-save";

/** Device-local resource draft, committed by the existing Services category footer. */
export function useTtsSettings() {
  const [preferences, setPreferences] = useState(readTtsPreferences);
  const draft = useRef(preferences);
  const baseline = useRef(preferences);
  const [savedPreferences, setSavedPreferences] = useState(preferences);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(preferences) !== JSON.stringify(baseline.current);
  useEffect(() => {
    const update = () => {
      const next = readTtsPreferences();
      setSavedPreferences(next);
      if (JSON.stringify(draft.current) === JSON.stringify(baseline.current)) {
        draft.current = baseline.current = next;
        setPreferences(next);
      }
    };
    window.addEventListener(TTS_PREFERENCES_CHANGED, update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener(TTS_PREFERENCES_CHANGED, update); window.removeEventListener("storage", update); };
  }, []);

  const change = useCallback((next: TtsPreferences) => {
    draft.current = next;
    setPreferences(next);
    setError("");
  }, []);

  const save = useCallback((): SettingsOperationResult => {
    if (JSON.stringify(draft.current) === JSON.stringify(baseline.current)) return { ok: true, changed: false };
    try {
      saveTtsPreferences(draft.current);
      baseline.current = { ...draft.current };
      setSavedPreferences(baseline.current);
      setPreferences({ ...draft.current });
      setError("");
      return { ok: true, changed: true };
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Konuşma tercihleri kaydedilemedi.";
      setError(message);
      return { ok: false, message };
    }
  }, []);

  const discard = useCallback(() => {
    draft.current = baseline.current = readTtsPreferences();
    setSavedPreferences(baseline.current);
    setPreferences(draft.current);
    setError("");
  }, []);

  return { preferences, savedPreferences, change, save, discard, dirty, error };
}
