import type { TtsPreferences } from "./app/tts/tts-adapter";

export const SYSTEM_TTS_ENGINE_ID = "system";
const STORAGE_KEY = "yardimci-asistan.desktop-tts";
export const TTS_PREFERENCES_CHANGED = "desktop-tts-preferences-changed";
/** @compiledSmoke scripts/smoke-desktop-tts.mjs (transpiled source) */
export const DEFAULT_TTS_PREFERENCES: Readonly<TtsPreferences> = {
  version: 1, enabled: true, engineId: SYSTEM_TTS_ENGINE_ID, voiceId: null, language: null,
  rate: 1, pitch: 1, volume: 100
};

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isLanguage(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}

export function validateTtsPreferences(preferences: TtsPreferences): string | null {
  if (typeof preferences.enabled !== "boolean") return "Seslendirme seçimi geçersiz.";
  if (preferences.version !== 1 || preferences.engineId !== SYSTEM_TTS_ENGINE_ID) return "Konuşma motoru kullanılamıyor.";
  if (preferences.voiceId !== null && (typeof preferences.voiceId !== "string" || !preferences.voiceId || preferences.voiceId.length > 1024)) return "Ses seçimi geçersiz.";
  if (preferences.language !== null && !isLanguage(preferences.language)) return "Konuşma dili geçersiz.";
  if (!inRange(preferences.rate, 0.5, 1.5)) return "Konuşma hızı 0,5 ile 1,5 arasında olmalı.";
  if (!inRange(preferences.pitch, 0, 2)) return "Konuşma tonu 0 ile 2 arasında olmalı.";
  if (!inRange(preferences.volume, 0, 100)) return "Ses düzeyi 0 ile 100 arasında olmalı.";
  return null;
}

export function readTtsPreferences(): TtsPreferences {
  const defaults = { ...DEFAULT_TTS_PREFERENCES };
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof stored !== "object" || stored === null) return defaults;
    const record = stored as Partial<TtsPreferences>;
    if (record.version !== 1 || record.engineId !== SYSTEM_TTS_ENGINE_ID) return defaults;
    return {
      ...defaults,
      // Version 1 records predating the switch preserve voice behavior; malformed switches fail closed.
      enabled: record.enabled === undefined ? true : record.enabled === true,
      voiceId: typeof record.voiceId === "string" && record.voiceId.length > 0 && record.voiceId.length <= 1024 ? record.voiceId : null,
      language: isLanguage(record.language) ? record.language : null,
      rate: inRange(record.rate, 0.5, 1.5) ? record.rate : defaults.rate,
      pitch: inRange(record.pitch, 0, 2) ? record.pitch : defaults.pitch,
      volume: inRange(record.volume, 0, 100) ? record.volume : defaults.volume
    };
  } catch { return defaults; }
}

/** Fail visibly if storage is blocked; a staged Save must not claim durable success. */
export function saveTtsPreferences(preferences: TtsPreferences): void {
  const error = validateTtsPreferences(preferences);
  if (error) throw new Error(error);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    throw new Error("Konuşma tercihleri bu cihazda saklanamadı.");
  }
  window.dispatchEvent(new Event(TTS_PREFERENCES_CHANGED));
}
