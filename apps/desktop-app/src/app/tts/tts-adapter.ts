/** Renderer-local speech contract. Providers own discovery and playback, never persistence. */
export interface TtsVoice {
  engineId: string;
  id: string;
  name: string;
  language: string;
  isDefault: boolean;
  gender?: string; // Only metadata supplied by a provider; never inferred from a name.
}

export interface TtsPreferences {
  version: 1;
  engineId: string;
  voiceId: string | null;
  language: string | null;
  rate: number;
  pitch: number;
  volume: number; // Application volume, 0–100; never changes system settings.
}

export interface TtsFeatures {
  rate: boolean;
  pitch: boolean;
  volume: boolean;
}

export interface TtsError {
  code: "unavailable" | "no-voices" | "discovery-failed" | "invalid-preferences"
    | "start-timeout" | "synthesis-failed" | "completion-timeout";
  message: string;
}

export interface TtsSnapshot {
  engineId: string;
  engineName: string;
  state: "idle" | "discovering" | "available" | "unavailable" | "error" | "disposed";
  features: TtsFeatures;
  voices: readonly TtsVoice[];
  error: TtsError | null;
}

export interface TtsSelection {
  voice: TtsVoice | null;
  preferredVoiceMissing: boolean;
  languageFallback: boolean;
}

export type TtsSpeakResult =
  | { status: "completed"; selection: TtsSelection }
  | { status: "cancelled" }
  | { status: "failed"; error: TtsError };

export interface TtsAdapter {
  readonly engineId: string;
  getSnapshot(): TtsSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  refresh(): void;
  resolveVoice(preferences: TtsPreferences): TtsSelection;
  speak(text: string, preferences: TtsPreferences, onStart?: () => void): Promise<TtsSpeakResult>;
  cancel(): void;
  dispose(): void;
}
