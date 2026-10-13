import { createHash, randomBytes } from "node:crypto";
import { Agent, request } from "node:https";
import { BUSINESS_CAPABILITIES, isSupportedSttBaseUrl, supportsSttModel, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "./database";
import { getEffectiveAiApiKey } from "./ai-secret-service";
import { serviceConfigFingerprint } from "./service-settings-validation";
import { readDesktopDictationPreference, saveDesktopDictationPreference } from "./desktop-dictation-preferences";
import { getWebSyncConfig } from "./sync-config";
import { DICTATION_MAX_BYTES, DICTATION_MIME_TYPES, type DesktopDictationResult, type DesktopDictationStatus, type DesktopDictationSettingsResult } from "./desktop-dictation-contract";

const CHANGED = "Ses ayarları veya oturum değişti. Yeniden kayıt başlatın.";
const FAILED = "Ses metne çevrilemedi. Bağlantıyı ve kayıtlı konuşma modelini kontrol edin.";
const RESPONSE_LIMIT = 128 * 1024;
const TIMEOUT_MS = 70000;

/** HTTPS only, no redirects/retries/proxy, bounded streaming response; no audio file or logging. */
export function uploadDesktopDictation(url: URL, secret: string, mime: string, audio: Buffer, signal: AbortSignal, configuration?: string): Promise<{ status: number; body: string }> {
  const boundary = `ya-${randomBytes(16).toString("hex")}`;
  const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\ndesktop\r\n--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="recording.${mime.split("/")[1]}"\r\nContent-Type: ${mime}\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "POST", signal, rejectUnauthorized: true,
      agent: new Agent({ keepAlive: false, proxyEnv: {} }),
      headers: { "X-YA-Sync-Secret": secret, "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": prefix.length + audio.length + suffix.length, "Accept": "application/json",
        ...(configuration ? { "X-YA-STT-Configuration": configuration } : {}) }
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > RESPONSE_LIMIT) { response.destroy(); req.destroy(new Error("response-limit")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.write(prefix);
    req.write(audio);
    req.end(suffix);
  });
}

function hostingEndpoint(baseUrl: string): URL | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/audio-transcribe.php`;
    return url;
  } catch { return null; }
}

function validId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(value); }

// Hosting finfo remains authoritative. Reject obvious MIME spoofing before upload as well.
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
  upload?: typeof uploadDesktopDictation;
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
    const database = options.getDatabase(), setup = database.getSetupData(), web = getWebSyncConfig(setup);
    const apiKey = getEffectiveAiApiKey(database, setup.aiService);
    const config = { provider: setup.aiProvider, service: setup.aiService, baseUrl: setup.aiBaseUrl.replace(/\/+$/, ""),
      model: setup.aiSttModel ?? "", apiKey, timeoutSeconds: setup.aiTimeoutSeconds,
      aiEnabled: setup.aiEnabled, chatModel: setup.aiModel, imageModel: setup.aiImageModel ?? "",
      webBaseUrl: web.baseUrl, syncSecret: web.syncSecret, autoSyncEnabled: setup.autoSyncEnabled };
    // Bound to the actual private provider configuration checked by Hosting, never renderer evidence.
    const binding = createHash("sha256").update(JSON.stringify([config.provider, config.service, config.baseUrl,
      config.model, apiKey, config.timeoutSeconds])).digest("hex");
    return { database, setup, web, config, binding, fingerprint: serviceConfigFingerprint(config) };
  }
  function current(): DesktopDictationStatus {
    const denied = (message: string): DesktopDictationStatus => {
      if (signature !== message) { invalidate(); signature = message; }
      return { available: false, enabled: false, ready: false, canTest: false, revision, message };
    };
    try { options.assertUnlocked(); } catch { return denied("Oturum kilitli"); }
    try { options.assertCapability(BUSINESS_CAPABILITIES.AI); } catch { return denied("AI özelliği kapalı"); }
    const { setup, web, config, database, fingerprint } = configuration();
    const preference = readDesktopDictationPreference(database.databasePath);
    const verification = database.getServiceSettingsVerification("desktop_stt");
    // Also fence effective environment/credential changes outside the Setup writer.
    if (verification && verification !== fingerprint) database.clearServiceSettingsVerification("desktop_stt");
    const activation = serviceConfigFingerprint({ fingerprint, testedAt: database.getServiceSettingsVerificationTime("desktop_stt") });
    // Identity never leaves main. A serial revision reveals no URL, key or secret digest.
    const next = JSON.stringify([activation, preference, setup.aiLastPublishedAt]);
    if (signature !== next) { invalidate(); signature = next; }
    const reason = !setup.aiEnabled ? "AI Yardımcı kapalı"
      : !supportsSttModel(setup.aiService, setup.aiSttModel ?? "") ? "AI modeli gerekli"
        : setup.aiProvider !== "openai_compatible" || !isSupportedSttBaseUrl(setup.aiService, setup.aiBaseUrl) ? "STT sağlayıcısı desteklenmiyor"
          : !setup.aiApiKeyConfigured || !config.apiKey ? "AI anahtarı gerekli"
            : setup.autoSyncEnabled === false ? "Web eşitlemesi kapalı"
              : !hostingEndpoint(web.baseUrl) || web.syncSecret.trim().length < 12 || web.syncSecret.length > 4096
                || web.syncSecret === "change-this-secret" || /[\r\n]/.test(web.syncSecret) ? "HTTPS web bağlantısı gerekli"
                : !setup.aiLastPublishedAt ? "AI ayarlarının yayını bekleniyor" : "";
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
      const { database, web, config, fingerprint, binding } = configuration();
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
        const response = await (options.upload ?? uploadDesktopDictation)(hostingEndpoint(web.baseUrl)!, web.syncSecret, "audio/wav", sample, controller.signal, binding);
        if (controller.signal.aborted || !current().canTest || revision !== expectedRevision) return { ok: false, message: CHANGED };
        if (response.status !== 200 || Buffer.byteLength(response.body) > RESPONSE_LIMIT) return { ok: false, message: "STT bağlantısı doğrulanamadı" };
        const result = JSON.parse(response.body) as Record<string, unknown>;
        if (result?.ok !== true || typeof result.text !== "string" || result.stt_configuration !== binding) {
          return { ok: false, message: "STT modeli doğrulanamadı; web hizmetini kontrol edin" };
        }
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
      const config = getWebSyncConfig(options.getDatabase().getSetupData());
      const controller = new AbortController();
      const job = { id: input.id, controller };
      const expectedRevision = revision;
      jobs.set(sender, job);
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      // Also catches persisted/environment changes outside the Settings IPC path.
      const gate = setInterval(() => { if (getStatus().revision !== expectedRevision) controller.abort(); }, 250);
      try {
        const response = await (options.upload ?? uploadDesktopDictation)(hostingEndpoint(config.baseUrl)!, config.syncSecret, mime, audio, controller.signal);
        const latest = current();
        if (controller.signal.aborted || !latest.available || latest.revision !== expectedRevision) return { ok: false, message: CHANGED };
        if (response.status !== 200 || Buffer.byteLength(response.body) > RESPONSE_LIMIT) return { ok: false, message: FAILED };
        const body: unknown = JSON.parse(response.body);
        if (!body || typeof body !== "object") return { ok: false, message: FAILED };
        const record = body as Record<string, unknown>;
        if (record.ok !== true || typeof record.text !== "string" || [...record.text].length > 16000
          || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(record.text)
          || record.text.includes(config.syncSecret)) return { ok: false, message: FAILED };
        return { ok: true, text: record.text, revision: expectedRevision };
      } finally {
        clearTimeout(timeout); clearInterval(gate);
        if (jobs.get(sender) === job) jobs.delete(sender);
      }
    } catch { return { ok: false, message: FAILED }; }
  }
  return { getStatus, saveEnabled, testConnection, transcribe, cancel, releaseSender, invalidate };
}
