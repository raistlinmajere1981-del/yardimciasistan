import { BUSINESS_CAPABILITIES, isSupportedSttBaseUrl, supportsSttModel, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "./database";
import { getEffectiveAiApiKey } from "./ai-secret-service";
import { serviceConfigFingerprint } from "./service-settings-validation";
import { readDesktopDictationPreference, saveDesktopDictationPreference } from "./desktop-dictation-preferences";
import { transcribeDesktopStt, type DesktopSttTransport } from "./desktop-stt-direct";
import { DICTATION_MAX_BYTES, DICTATION_MIME_TYPES, type DesktopDictationResult, type DesktopDictationStatus, type DesktopDictationSettingsResult } from "./desktop-dictation-contract";

const CHANGED = "Ses ayarları veya oturum değişti. Yeniden kayıt başlatın.";
const FAILED = "Ses metne çevrilemedi. Bağlantıyı ve kayıtlı konuşma modelini kontrol edin.";
const TIMEOUT_MS = 70000;

function validId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(value); }

// Reject obvious MIME spoofing before provider upload; decoding remains provider-owned.
function matchesContainer(audio: Buffer, mime: string): boolean {
  const ascii = (start: number, length: number) => audio.subarray(start, start + length).toString("ascii");
  if (mime === "audio/webm") return audio.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mime === "audio/ogg") return ascii(0, 4) === "OggS";
  if (mime === "audio/mp4") return ascii(4, 4) === "ftyp";
  if (mime === "audio/wav") return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
  if (mime === "audio/flac") return ascii(0, 4) === "fLaC";
  return mime === "audio/mpeg" && (ascii(0, 3) === "ID3" || (audio[0] === 0xff && ((audio[1] ?? 0) & 0xe0) === 0xe0));
}

export function createDesktopDictationService(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  transport?: DesktopSttTransport;
}) {
  let revision = 1;
  let signature = "";
  const jobs = new Map<number, { id: string; controller: AbortController }>();
  const cancelled = new Map<number, Set<string>>();
  let testJob: { sender: number; controller: AbortController } | null = null;
  function invalidate() {
    revision++;
    for (const job of jobs.values()) job.controller.abort();
    testJob?.controller.abort();
  }
  function configuration() {
    const database = options.getDatabase(), setup = database.getSetupData();
    const apiKey = getEffectiveAiApiKey(database, setup.aiService);
    const config = { provider: setup.aiProvider, service: setup.aiService, baseUrl: setup.aiBaseUrl.replace(/\/+$/, ""),
      model: setup.aiSttModel ?? "", apiKey, timeoutSeconds: setup.aiTimeoutSeconds, aiEnabled: setup.aiEnabled };
    return { database, setup, config, fingerprint: serviceConfigFingerprint(config) };
  }
  function current(): DesktopDictationStatus {
    const denied = (message: string): DesktopDictationStatus => {
      if (signature !== message) { invalidate(); signature = message; }
      return { available: false, enabled: false, ready: false, canTest: false, revision, message };
    };
    try { options.assertUnlocked(); } catch { return denied("Oturum kilitli"); }
    try { options.assertCapability(BUSINESS_CAPABILITIES.AI); } catch { return denied("AI özelliği kapalı"); }
    const { setup, config, database, fingerprint } = configuration();
    const preference = readDesktopDictationPreference(database.databasePath);
    const verification = database.getServiceSettingsVerification("desktop_stt");
    // Also fence effective environment/credential changes outside the Setup writer.
    if (verification && verification !== fingerprint) database.clearServiceSettingsVerification("desktop_stt");
    const activation = serviceConfigFingerprint({ fingerprint, testedAt: database.getServiceSettingsVerificationTime("desktop_stt") });
    // Identity never leaves main. A serial revision reveals no URL, key or secret digest.
    const next = JSON.stringify([activation, preference]);
    if (signature !== next) { invalidate(); signature = next; }
    const reason = !setup.aiEnabled ? "AI Yardımcı kapalı"
      : !supportsSttModel(setup.aiService, setup.aiSttModel ?? "") ? "AI modeli gerekli"
        : setup.aiProvider !== "openai_compatible" || !isSupportedSttBaseUrl(setup.aiService, setup.aiBaseUrl) ? "STT sağlayıcısı desteklenmiyor"
          : !setup.aiApiKeyConfigured || !config.apiKey || config.apiKey.length > 4096 || /[\u0000-\u0020\u007f]/.test(config.apiKey) ? "AI anahtarı gerekli"
            : !Number.isFinite(config.timeoutSeconds) || config.timeoutSeconds <= 0 ? "STT zaman aşımı geçersiz" : "";
    const canTest = !reason;
    const ready = canTest && verification === fingerprint;
    const enabled = ready && preference.enabled && preference.configuration === activation;
    return { available: enabled, enabled, ready, canTest, revision,
      message: reason || (!ready ? "STT bağlantısı doğrulanmadı" : enabled ? "Etkin · Masaüstü dikte hazır" : "Kapalı · STT bağlantısı doğrulandı") };
  }
  function getStatus(): DesktopDictationStatus {
    try { return current(); } catch { return { available: false, enabled: false, ready: false, canTest: false, revision, message: "Dikte durumu okunamadı" }; }
  }
  function saveEnabled(value: unknown): DesktopDictationSettingsResult {
    try {
      options.assertUnlocked();
      if (typeof value !== "boolean") return { ok: false, message: "Masaüstü dikte seçimi geçersiz." };
      const status = current();
      if (value && !status.ready) return { ok: false, message: status.message };
      const { database, fingerprint } = configuration();
      const activation = serviceConfigFingerprint({ fingerprint, testedAt: database.getServiceSettingsVerificationTime("desktop_stt") });
      saveDesktopDictationPreference(database.databasePath, { enabled: value, configuration: activation });
      invalidate();
      return { ok: true, status: current() };
    } catch { return { ok: false, message: "Masaüstü dikte tercihi saklanamadı." }; }
  }
  async function testConnection(sender: number): Promise<DesktopDictationSettingsResult> {
    if (testJob) return { ok: false, message: "STT bağlantısı deneniyor." };
    try {
      const status = current();
      if (!status.canTest) return { ok: false, message: status.message };
      const { database, config, fingerprint } = configuration();
      database.clearServiceSettingsVerification("desktop_stt");
      const expectedRevision = current().revision, controller = new AbortController();
      testJob = { sender, controller };
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const gate = setInterval(() => { if (getStatus().revision !== expectedRevision) controller.abort(); }, 250);
      // One explicit, 250ms silent PCM WAV proves audio endpoint/model access, not speech quality.
      const sample = Buffer.alloc(44 + 8000);
      sample.write("RIFF", 0); sample.writeUInt32LE(sample.length - 8, 4); sample.write("WAVEfmt ", 8);
      sample.writeUInt32LE(16, 16); sample.writeUInt16LE(1, 20); sample.writeUInt16LE(1, 22);
      sample.writeUInt32LE(16000, 24); sample.writeUInt32LE(32000, 28); sample.writeUInt16LE(2, 32);
      sample.writeUInt16LE(16, 34); sample.write("data", 36); sample.writeUInt32LE(8000, 40);
      try {
        const result = await transcribeDesktopStt(config, "audio/wav", sample, controller.signal, options.transport);
        if (controller.signal.aborted || !current().canTest || revision !== expectedRevision) return { ok: false, message: CHANGED };
        if (!result.ok) return result;
        if (configuration().fingerprint !== fingerprint) return { ok: false, message: CHANGED };
        database.recordServiceSettingsVerification("desktop_stt", config);
        invalidate();
        return { ok: true, status: current() };
      } finally { clearTimeout(timeout); clearInterval(gate); testJob = null; }
    } catch { return { ok: false, message: "STT bağlantısı doğrulanamadı" }; }
  }
  function cancel(sender: number, value: unknown) {
    if (!validId(value)) return false;
    const ids = cancelled.get(sender) ?? new Set<string>();
    ids.add(value);
    if (ids.size > 32) ids.delete(ids.values().next().value!);
    cancelled.set(sender, ids);
    const job = jobs.get(sender);
    if (job?.id === value) job.controller.abort();
    return true;
  }
  function releaseSender(sender: number) {
    jobs.get(sender)?.controller.abort();
    if (testJob?.sender === sender) testJob.controller.abort();
    cancelled.delete(sender);
  }
  async function transcribe(sender: number, value: unknown): Promise<DesktopDictationResult> {
    try {
      // Authorization precedes input parsing/transport; current saved settings are the only authority.
      const status = current();
      if (!status.available) return { ok: false, message: status.message };
      if (!value || typeof value !== "object") return { ok: false, message: "Ses kaydı geçersiz." };
      const input = value as Record<string, unknown>;
      if (!validId(input.id) || input.revision !== revision) return { ok: false, message: CHANGED };
      if (cancelled.get(sender)?.has(input.id)) return { ok: false, message: "Kayıt iptal edildi." };
      if (jobs.has(sender)) return { ok: false, message: "Önce devam eden dikteyi durdurun." };
      const mime = typeof input.mimeType === "string" ? input.mimeType : "";
      const encoded = input.audioBase64;
      if (!DICTATION_MIME_TYPES.some(type => type === mime) || typeof encoded !== "string" || !encoded.length
        || encoded.length > 4 * Math.ceil(DICTATION_MAX_BYTES / 3) || encoded.length % 4 !== 0
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return { ok: false, message: "Ses biçimi veya boyutu geçersiz (en fazla 5 MiB)." };
      const audio = Buffer.from(encoded, "base64");
      if (!audio.length || audio.length > DICTATION_MAX_BYTES || audio.toString("base64") !== encoded || !matchesContainer(audio, mime)) {
        return { ok: false, message: "Ses biçimi veya boyutu geçersiz (en fazla 5 MiB)." };
      }
      const { config } = configuration();
      const controller = new AbortController();
      const job = { id: input.id, controller };
      const expectedRevision = revision;
      jobs.set(sender, job);
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      // Also catches persisted/environment changes outside the Settings IPC path.
      const gate = setInterval(() => { if (getStatus().revision !== expectedRevision) controller.abort(); }, 250);
      try {
        const result = await transcribeDesktopStt(config, mime, audio, controller.signal, options.transport);
        const latest = current();
        if (controller.signal.aborted || !latest.available || latest.revision !== expectedRevision) return { ok: false, message: CHANGED };
        return result.ok ? { ok: true, text: result.text, revision: expectedRevision } : result;
      } finally {
        clearTimeout(timeout); clearInterval(gate);
        if (jobs.get(sender) === job) jobs.delete(sender);
      }
    } catch { return { ok: false, message: FAILED }; }
  }
  return { getStatus, saveEnabled, testConnection, transcribe, cancel, releaseSender, invalidate };
}
