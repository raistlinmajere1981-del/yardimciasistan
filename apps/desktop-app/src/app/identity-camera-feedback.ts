export type IdentityCameraFeedbackTone = "prompt" | "ready" | "success" | "error";

let audioContext: AudioContext | null = null;

export function primeIdentityCameraFeedback() {
  try {
    window.speechSynthesis?.getVoices();
  } catch {
    // Some Linux builds expose speechSynthesis without a working voice backend.
  }
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

export function announceIdentityCamera(
  text: string,
  fallbackTone: IdentityCameraFeedbackTone = "prompt"
) {
  if (trySpeak(text, fallbackTone)) return;
  playFeedbackTone(fallbackTone);
}

function trySpeak(text: string, fallbackTone: IdentityCameraFeedbackTone): boolean {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return false;
  }

  let voices: SpeechSynthesisVoice[];
  try {
    voices = window.speechSynthesis.getVoices();
  } catch {
    return false;
  }
  const voice = voices.find((item) => item.lang.toLowerCase().startsWith("tr"))
    ?? voices.find((item) => item.default)
    ?? voices[0];
  if (!voice) return false;

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang || "tr-TR";
    utterance.rate = 0.96;

    let started = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!started) playFeedbackTone(fallbackTone);
    }, 500);
    utterance.onstart = () => {
      started = true;
      window.clearTimeout(fallbackTimer);
    };
    utterance.onend = () => window.clearTimeout(fallbackTimer);
    utterance.onerror = () => {
      window.clearTimeout(fallbackTimer);
      playFeedbackTone(fallbackTone);
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

function playFeedbackTone(kind: IdentityCameraFeedbackTone) {
  const context = getAudioContext();
  if (!context) return;

  const patterns: Record<IdentityCameraFeedbackTone, Array<[number, number, number]>> = {
    prompt: [[520, 0, 0.08]],
    ready: [[640, 0, 0.07]],
    success: [[660, 0, 0.07], [840, 0.1, 0.09]],
    error: [[280, 0, 0.11], [220, 0.14, 0.13]]
  };

  const start = context.currentTime + 0.015;
  try {
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
    for (const [frequency, offset, duration] of patterns[kind]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.035, start + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + duration + 0.02);
    }
  } catch {
    // Audio feedback is supplementary; capture continues without it.
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  try {
    audioContext ??= new AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}
