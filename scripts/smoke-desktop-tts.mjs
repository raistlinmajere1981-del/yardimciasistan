import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { installSpeechMock, localTtsVoice as local } from "./test-helpers/tts-fixtures.mjs";

// Actual renderer modules, without a browser, network port or audio device.
// Deterministic deadlines avoid sleeps and exercise late native callbacks.
let now = 0, nextTimer = 0;
const timers = new Map();
const schedule = (fn, delay, repeat = false) => {
  const id = ++nextTimer;
  timers.set(id, { fn, at: now + delay, interval: repeat ? delay : 0 });
  return id;
};
function advance(milliseconds) {
  const until = now + milliseconds;
  while (true) {
    const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    const [id, timer] = next;
    now = timer.at;
    if (timer.interval) timer.at += timer.interval;
    else timers.delete(id);
    timer.fn();
  }
  now = until;
}
const data = new Map();
let blockRead = false, blockWrite = false;
const localStorage = {
  getItem: key => { if (blockRead) throw new Error("Storage blocked"); return data.get(key) ?? null; },
  setItem: (key, value) => { if (blockWrite) throw new Error("Storage blocked"); data.set(key, value); }
};
const globals = {
  EventTarget, Event, localStorage,
  setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => timers.delete(id),
  setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => timers.delete(id)
};
globals.window = globals;
const events = new EventTarget();
globals.addEventListener = events.addEventListener.bind(events);
globals.removeEventListener = events.removeEventListener.bind(events);
globals.dispatchEvent = events.dispatchEvent.bind(events);
const context = createContext(globals);
runInContext(`(${installSpeechMock.toString()})()`, context);
const modules = new Map();
function load(file) {
  const filename = resolve(file);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {};
  modules.set(filename, exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInContext(`(function(exports, require) { ${code}\n})`, context)(exports,
    name => load(resolve(dirname(filename), `${name}.ts`)));
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const { DEFAULT_TTS_PREFERENCES: defaults, readTtsPreferences: read, saveTtsPreferences: save, validateTtsPreferences: validate } = load("apps/desktop-app/src/tts-preferences.ts");
const { createWebSpeechTtsAdapter } = load("apps/desktop-app/src/app/tts/web-speech-adapter.ts");
const state = globals.__ttsMock;
const voices = [local("tr-one", "Türkçe Bir", "tr-TR"), local("en-one", "English One", "en-US", true), local("tr-two", "Türkçe İki", "tr-TR")];
const key = "yardimci-asistan.desktop-tts";
assert.deepEqual(plain(read()), plain(defaults));
for (const patch of [
  { rate: 0.49 }, { rate: 1.51 }, { rate: NaN }, { rate: Infinity }, { rate: "1" },
  { volume: -1 }, { volume: 101 }, { volume: NaN }, { pitch: -0.01 }, { pitch: 2.01 },
  { engineId: "freya" }, { language: "bad language" }, { voiceId: "" }, { version: 2 },
  { enabled: undefined }, { enabled: "false" }, { enabled: 1 }, { enabled: null }
]) {
  const preferences = { ...defaults, ...patch };
  assert.ok(validate(preferences), JSON.stringify(patch));
  assert.throws(() => save(preferences));
}
for (const patch of [{ rate: 0.5, volume: 0, pitch: 0 }, { rate: 1.5, volume: 100, pitch: 2 }]) assert.equal(validate({ ...defaults, ...patch }), null);
const preferences = { ...defaults, voiceId: "real-voice", language: "tr-TR", rate: 1.25, volume: 42 };
save(preferences);
assert.deepEqual(plain(read()), plain(preferences));
data.set(key, JSON.stringify({ ...preferences, rate: 3, volume: "50", pitch: -1 }));
assert.deepEqual(plain(read()), { ...plain(preferences), rate: 1, volume: 100, pitch: 1 });
for (const record of ["{broken", "null", "[]", "5", JSON.stringify({ ...preferences, version: 2 }), JSON.stringify({ ...preferences, engineId: "freya" })]) {
  data.set(key, record);
  assert.deepEqual(plain(read()), plain(defaults));
}
blockRead = true;
assert.deepEqual(plain(read()), plain(defaults));
blockRead = false;
blockWrite = true;
assert.throws(() => save(preferences), /saklanamadı/);
blockWrite = false;
data.delete(key);
const legacy = { ...defaults }; delete legacy.enabled;
data.set(key, JSON.stringify(legacy));
assert.equal(read().enabled, true, "Existing version 1 voice preferences remain enabled");
data.set(key, JSON.stringify({ ...defaults, enabled: "true" }));
assert.equal(read().enabled, false, "Malformed switch fails closed");
save({ ...defaults, enabled: false });
assert.equal(read().enabled, false);
save(defaults);

const adapter = createWebSpeechTtsAdapter();
let notifications = 0;
const unsubscribe = adapter.subscribe(() => notifications++);
adapter.start();
assert.equal(adapter.getSnapshot().state, "discovering");
advance(1500);
assert.equal(adapter.getSnapshot().state, "unavailable");
assert.equal((await adapter.speak("Deneme", defaults)).error.code, "no-voices");
assert.equal(state.spoken.length, 0);
globals.__ttsVoices([{ ...voices[0], localService: false }]);
assert.equal(adapter.getSnapshot().voices.length, 0);
assert.equal((await adapter.speak("Deneme", defaults)).error.code, "no-voices");
globals.__ttsVoices(voices);
assert.equal(adapter.getSnapshot().state, "available", "Late voiceschanged must recover after deadline");
assert.deepEqual(plain(adapter.getSnapshot().features), { rate: true, pitch: false, volume: true });
assert.equal(adapter.getSnapshot().voices.some(voice => "gender" in voice), false);
assert.ok(notifications > 0);
unsubscribe();
const count = notifications;
adapter.refresh();
assert.equal(notifications, count);
const all = adapter.getSnapshot().voices;
assert.equal(adapter.resolveVoice(defaults).voice.name, "Türkçe Bir");
assert.equal(adapter.resolveVoice({ ...defaults, language: "en-US" }).voice.name, "English One");
assert.equal(adapter.resolveVoice({ ...defaults, language: "en-GB" }).languageFallback, false);
assert.equal(adapter.resolveVoice({ ...defaults, language: "de-DE" }).languageFallback, true);
assert.equal(adapter.resolveVoice({ ...defaults, voiceId: all[1].id }).languageFallback, false, "Explicit English voice is not a failed Turkish lookup");
assert.equal(adapter.resolveVoice({ ...defaults, voiceId: all[2].id }).voice.name, "Türkçe İki");
globals.__ttsVoices(voices.slice(0, 2));
const missing = { ...defaults, voiceId: all[2].id };
assert.equal(adapter.resolveVoice(missing).preferredVoiceMissing, true);
assert.equal(adapter.resolveVoice(missing).voice.name, "Türkçe Bir");
globals.__ttsVoices(voices);
assert.equal(adapter.resolveVoice(missing).preferredVoiceMissing, false);
assert.equal(missing.voiceId, all[2].id);

async function speak(mode, text = "Deneme", preferences = defaults) {
  state.mode = mode;
  const pending = adapter.speak(text, preferences);
  advance(600);
  return pending;
}
let starts = 0;
state.mode = "complete";
globals.speechSynthesis.paused = true;
const successful = adapter.speak("Deneme", { ...defaults, rate: 1.25, volume: 42, language: "en-US" }, () => starts++);
advance(100);
assert.equal((await successful).status, "completed");
assert.equal(starts, 1);
assert.equal(globals.speechSynthesis.paused, false);
const utterance = state.spoken.at(-1);
assert.deepEqual({ voice: utterance.voice.name, language: utterance.lang, rate: utterance.rate, pitch: utterance.pitch, volume: utterance.volume },
  { voice: "English One", language: "en-US", rate: 1.25, pitch: 1, volume: 0.42 });
for (const mode of ["error-before", "error-after", "never-start", "end-before", "throw"]) assert.equal((await speak(mode)).status, "failed", mode);
assert.equal((await speak("never-start")).error.code, "start-timeout");
for (const text of ["", " ", "x".repeat(16001), "<speak>markup</speak>"]) assert.equal((await speak("complete", text)).error.code, "invalid-preferences");
assert.equal((await speak("complete", "Deneme", { ...defaults, rate: 5 })).error.code, "invalid-preferences");
assert.equal((await speak("complete", "Sessiz", { ...defaults, volume: 0 })).status, "completed");
assert.equal(state.spoken.at(-1).volume, 0);
const spokenBeforeOff = state.spoken.length;
save({ ...defaults, enabled: false });
assert.equal((await speak("complete")).error.code, "disabled", "Even an enabled caller cannot bypass saved OFF");
assert.equal(state.spoken.length, spokenBeforeOff);
save(defaults);
state.mode = "hang";
const offDuringSpeech = adapter.speak("Durdur", defaults);
advance(10);
save({ ...defaults, enabled: false });
assert.equal((await offDuringSpeech).status, "cancelled");
save(defaults);
state.mode = "never-start";
const cancelled = adapter.speak("İptal", defaults);
const staleError = state.spoken.at(-1).onerror;
adapter.cancel();
assert.equal((await cancelled).status, "cancelled");
state.mode = "complete";
const next = adapter.speak("Sonraki", defaults);
const cancellations = state.cancels;
staleError({ error: "interrupted" });
advance(600);
assert.equal((await next).status, "completed");
assert.equal(state.cancels, cancellations, "Stale error must not cancel newer playback");
state.mode = "hang";
const hung = adapter.speak("Deneme", defaults);
advance(30000);
assert.equal((await hung).error.code, "completion-timeout");
globals.__ttsVoices([]);
adapter.refresh();
globals.__ttsVoices(voices, false);
advance(250);
assert.equal(adapter.getSnapshot().state, "available", "Polling recovers a missing Chromium event");
state.failDiscovery = true;
adapter.refresh();
assert.equal(adapter.getSnapshot().error.code, "discovery-failed");
state.failDiscovery = false;
adapter.refresh();
assert.equal(adapter.getSnapshot().state, "available");
state.mode = "never-start";
const disposed = adapter.speak("İptal", defaults);
adapter.dispose();
assert.equal((await disposed).status, "cancelled");
globals.__ttsVoices(voices);
assert.equal(adapter.getSnapshot().state, "disposed");
assert.equal((await adapter.speak("Deneme", defaults)).error.code, "unavailable");
const constructor = globals.SpeechSynthesisUtterance;
globals.SpeechSynthesisUtterance = undefined;
const unsupported = createWebSpeechTtsAdapter();
assert.equal((await unsupported.speak("Deneme", defaults)).error.code, "unavailable");
unsupported.dispose();
globals.SpeechSynthesisUtterance = constructor;

// Camera fallback retains existing beep frequencies/gain; cancel is silent.
const { announceIdentityCamera: announce, primeIdentityCameraFeedback: prime } = load("apps/desktop-app/src/app/identity-camera-feedback.ts");
save({ ...defaults, rate: 1.3, volume: 60, voiceId: all[2].id });
globals.__ttsVoices(voices.slice(0, 2));
prime();
async function announceAndAdvance(mode, tone) {
  state.mode = mode;
  announce("Kimlik analizi tamamlanamadı.", tone);
  advance(600);
  await Promise.resolve();
}
await announceAndAdvance("complete", "prompt");
assert.equal(state.spoken.at(-1).voice.name, "Türkçe Bir");
assert.equal(state.spoken.at(-1).rate, 1.3);
assert.equal(state.spoken.at(-1).volume, 0.6);
assert.deepEqual(plain(state.beeps), []);
globals.__ttsVoices([]);
await announceAndAdvance("complete", "error");
assert.deepEqual(plain(state.beeps), [300, 220]);
state.beeps = [];
globals.__ttsVoices(voices);
await announceAndAdvance("never-start", "success");
assert.deepEqual(plain(state.beeps), [660, 840]);
state.beeps = [];
await announceAndAdvance("error-after", "error");
assert.deepEqual(plain(state.beeps), [300, 220]);
assert.ok(state.gains.includes(0.14) && state.gains.includes(0.22));
state.beeps = [];
state.mode = "never-start";
announce("Sabit tutun.", "ready");
state.mode = "complete";
announce("İşlem tamam.", "success");
advance(600);
await Promise.resolve();
assert.deepEqual(plain(state.beeps), []);
save({ ...defaults, enabled: false });
const cameraSpokenBeforeOff = state.spoken.length;
await announceAndAdvance("complete", "ready");
assert.equal(state.spoken.length, cameraSpokenBeforeOff);
assert.deepEqual(plain(state.beeps), [640], "Disabled speech retains camera safety signal");
console.log("desktop-tts-smoke-ok: preferences/defaults/ranges, local-only late discovery, selection/refresh, speak/cancel/deadlines/errors and camera fallback");
