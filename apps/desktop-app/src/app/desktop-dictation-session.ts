import { DICTATION_MAX_BYTES, type DesktopDictationInput, type DesktopDictationResult, type DesktopDictationStatus } from "@yardimci-asistan/shared";

export interface DictationSnapshot {
  phase: "idle" | "permission" | "recording" | "uploading" | "review";
  transcript: string;
  message: string;
}
const IDLE: DictationSnapshot = { phase: "idle", transcript: "", message: "" };

export function supportedRecordingMime(): string | null {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return null;
  try {
    return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"]
      .find(mime => MediaRecorder.isTypeSupported(mime)) ?? null;
  } catch { return null; }
}

/** One opt-in capture, transient audio, explicit Stop/upload and explicit transcript use. */
export function createDesktopDictationSession(options: {
  getStatus: () => Promise<DesktopDictationStatus>;
  transcribe: (input: DesktopDictationInput) => Promise<DesktopDictationResult>;
  cancelRemote: (id: string) => Promise<boolean>;
  onChange: (snapshot: DictationSnapshot) => void;
}) {
  let state = IDLE;
  let generation = 0;
  let revision = 0;
  let id = "";
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  let chunks: Blob[] = [];
  let size = 0;
  let uploadOnStop = false;
  const update = (next: DictationSnapshot) => { state = next; options.onChange(next); };
  function releaseTracks() { stream?.getTracks().forEach(track => track.stop()); stream = null; }
  function cancel(message = "") {
    generation++;
    uploadOnStop = false;
    clearTimeout(limitTimer);
    if (id) void options.cancelRemote(id).catch(() => undefined);
    id = "";
    if (recorder) {
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
      if (recorder.state !== "inactive") { try { recorder.stop(); } catch { /* Tracks still stop. */ } }
    }
    recorder = null;
    releaseTracks(); chunks = []; size = 0;
    update({ ...IDLE, message });
  }
  async function start() {
    if (state.phase !== "idle") return;
    const run = ++generation;
    revision = 0;
    id = crypto.randomUUID();
    const mime = supportedRecordingMime();
    if (!mime) { cancel("Bu cihazda güvenli mikrofon kaydı desteklenmiyor."); return; }
    update({ ...IDLE, phase: "permission", message: "Mikrofon izni bekleniyor…" });
    try {
      const status = await options.getStatus();
      if (run !== generation) return;
      if (!status.available) { cancel(status.message); return; }
      revision = status.revision;
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (run !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired;
      const latest = await options.getStatus();
      if (run !== generation) return;
      if (!latest.available || latest.revision !== revision) { cancel("Ses ayarları değişti. Yeniden kayıt başlatın."); return; }
      recorder = new MediaRecorder(acquired, { mimeType: mime });
      const actualMime = recorder.mimeType.split(";")[0]!.toLowerCase();
      if (!["audio/webm", "audio/ogg", "audio/mp4"].includes(actualMime)) { cancel("Kayıt biçimi desteklenmiyor."); return; }
      chunks = []; size = 0; uploadOnStop = false;
      recorder.ondataavailable = event => {
        if (run !== generation) return;
        size += event.data.size;
        if (size > DICTATION_MAX_BYTES) { cancel("Kayıt 5 MiB sınırını aştı; ses gönderilmedi."); return; }
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => { if (run === generation) cancel("Mikrofon kaydı tamamlanamadı; ses gönderilmedi."); };
      recorder.onstop = () => { void upload(run, actualMime); };
      recorder.start(250);
      limitTimer = setTimeout(() => { if (run === generation) cancel("Kayıt süresi doldu; ses gönderilmedi. Daha kısa bir kayıt yapın."); }, 120000);
      update({ ...IDLE, phase: "recording", message: "Kayıt sürüyor. Durdur ile gönderin veya İptal seçin." });
    } catch (error) {
      if (run !== generation) return;
      const denied = error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name);
      cancel(denied ? "Mikrofon izni verilmedi. Sistem ve uygulama mikrofon iznini kontrol edin."
        : "Mikrofon başlatılamadı. Cihaz bağlantısını ve mikrofon iznini kontrol edin.");
    }
  }
  function stop() {
    if (state.phase !== "recording" || !recorder) return;
    uploadOnStop = true;
    clearTimeout(limitTimer);
    update({ ...IDLE, phase: "uploading", message: "Ses metne çevriliyor…" });
    try { recorder.stop(); } catch { cancel("Kayıt durdurulamadı; ses gönderilmedi."); }
    releaseTracks();
  }
  async function upload(run: number, mimeType: string) {
    if (run !== generation) return;
    releaseTracks(); clearTimeout(limitTimer);
    if (!uploadOnStop) { cancel("Kayıt kesildi; ses gönderilmedi."); return; }
    uploadOnStop = false;
    const audio = new Blob(chunks, { type: mimeType });
    chunks = []; recorder = null;
    if (!audio.size || audio.size > DICTATION_MAX_BYTES) { cancel("Kayıt boş veya 5 MiB sınırını aşıyor; ses gönderilmedi."); return; }
    try {
      const latest = await options.getStatus();
      if (run !== generation) return;
      if (!latest.available || latest.revision !== revision) { cancel("Ses ayarları değişti; ses gönderilmedi."); return; }
      const bytes = new Uint8Array(await audio.arrayBuffer());
      if (run !== generation) return;
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      const result = await options.transcribe({ id, revision, mimeType, audioBase64: btoa(binary) });
      if (run !== generation) return;
      const current = await options.getStatus();
      if (run !== generation) return;
      if (!current.available || current.revision !== revision || (result.ok && result.revision !== revision)) {
        cancel("Ses ayarları değişti. Yeniden kayıt başlatın."); return;
      }
      if (!result.ok) { cancel(result.message); return; }
      update({ phase: "review", transcript: result.text, message: result.text.trim()
        ? "Metni düzenleyip Metni Kullan seçin. Hiçbir işlem otomatik yapılmaz."
        : "Konuşma algılanmadı. İptal edip yeniden kayıt yapabilirsiniz." });
    } catch { if (run === generation) cancel("Ses metne çevrilemedi. Bağlantıyı kontrol edip yeniden deneyin."); }
  }
  async function apply(onApply: (text: string) => void) {
    if (state.phase !== "review" || !state.transcript.trim()) return;
    const run = generation;
    try {
      const status = await options.getStatus();
      if (run !== generation) return;
      if (!status.available || status.revision !== revision) { cancel("Ses ayarları değişti. Yeniden kayıt başlatın."); return; }
      const text = state.transcript;
      cancel();
      onApply(text);
    } catch { if (run === generation) cancel("Dikte durumu kontrol edilemedi; metin uygulanmadı."); }
  }
  return { start, stop, cancel, apply, getSnapshot: () => state,
    editTranscript: (text: string) => { if (state.phase === "review") update({ ...state, transcript: text }); },
    checkStatus: (status: DesktopDictationStatus) => {
      if (state.phase !== "idle" && (!status.available || (revision && status.revision !== revision))) cancel("Ses ayarları veya oturum değişti. Kayıt iptal edildi.");
    }
  };
}
