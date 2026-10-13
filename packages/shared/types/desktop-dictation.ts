/** Public, secret-free Desktop dictation wire contract. Audio and revisions are transient. */
export const DICTATION_MAX_BYTES = 5 * 1024 * 1024;
export const DICTATION_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg", "audio/flac"] as const;
export interface DesktopDictationStatus {
  available: boolean;
  revision: number;
  message: string;
}
export interface DesktopDictationInput {
  id: string;
  revision: number;
  mimeType: string;
  audioBase64: string;
}
export type DesktopDictationResult =
  | { ok: true; text: string; revision: number }
  | { ok: false; message: string };
