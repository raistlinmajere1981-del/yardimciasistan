import type { TtsAdapter } from "./tts-adapter";
import { createWebSpeechTtsAdapter } from "./web-speech-adapter";

let adapter: TtsAdapter | undefined;

/** One renderer playback owner shared by Settings preview and existing camera prompts. */
export function getDesktopTts(): TtsAdapter {
  adapter ??= createWebSpeechTtsAdapter();
  adapter.start();
  return adapter;
}
