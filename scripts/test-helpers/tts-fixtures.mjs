export function installSpeechMock() {
  const state = {
    voices: [], mode: "complete", spoken: [], cancels: 0, failDiscovery: false,
    beeps: [], gains: [], active: null
  };
  const synthesis = new EventTarget();
  synthesis.paused = false;
  synthesis.getVoices = () => {
    if (state.failDiscovery) throw new Error("Backend unavailable");
    return state.voices;
  };
  synthesis.resume = () => { synthesis.paused = false; };
  synthesis.cancel = () => {
    state.cancels++;
    const previous = state.active;
    state.active = null;
    if (previous) {
      // Native cancellation can deliver a queued error after the next utterance.
      const handler = previous.onerror;
      setTimeout(() => handler?.({ error: "interrupted" }), 1);
    }
  };
  synthesis.speak = utterance => {
    if (state.mode === "throw") throw new Error("Cannot speak");
    state.spoken.push(utterance);
    state.active = utterance;
    const mode = state.mode;
    setTimeout(() => {
      if (mode === "never-start") return;
      if (mode === "error-before") { utterance.onerror?.({ error: "synthesis-failed" }); return; }
      if (mode === "end-before") { utterance.onend?.({}); return; }
      utterance.onstart?.({});
      if (mode === "hang") return;
      setTimeout(() => {
        if (mode === "error-after") utterance.onerror?.({ error: "audio-busy" });
        else utterance.onend?.({});
      }, 50);
    }, 10);
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.onstart = this.onend = this.onerror = null; }
  };
  window.AudioContext = class {
    state = "running";
    currentTime = 0;
    destination = {};
    resume() { return Promise.resolve(); }
    createOscillator() {
      let frequency;
      return {
        frequency: { setValueAtTime(value) { frequency = value; } },
        connect() {}, start() { state.beeps.push(frequency); }, stop() {}
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime(value) { state.gains.push(value); } },
        connect() {}
      };
    }
  };
  window.__ttsMock = state;
  window.__ttsVoices = (voices, notify = true) => {
    state.voices = voices;
    if (notify) synthesis.dispatchEvent(new Event("voiceschanged"));
  };
}


export const localTtsVoice = (uri, name, lang, isDefault = false) => ({
  voiceURI: uri, name, lang, localService: true, default: isDefault
});
