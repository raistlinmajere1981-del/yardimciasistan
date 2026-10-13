import { randomBytes } from "node:crypto";
import { Agent, request } from "node:https";
import { BUSINESS_CAPABILITIES, isSupportedSttBaseUrl, supportsSttModel, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopSetupData } from "./database";
import { getWebSyncConfig } from "./sync-config";
import { DICTATION_MAX_BYTES, DICTATION_MIME_TYPES, type DesktopDictationResult, type DesktopDictationStatus } from "./desktop-dictation-contract";

const CHANGED = "Ses ayarları veya oturum değişti. Yeniden kayıt başlatın.";
const FAILED = "Ses metne çevrilemedi. Bağlantıyı ve kayıtlı konuşma modelini kontrol edin.";
const RESPONSE_LIMIT = 128 * 1024;
const TIMEOUT_MS = 70000;

/** HTTPS only, no redirects/retries/proxy, bounded streaming response; no audio file or logging. */
export function uploadDesktopDictation(url: URL, secret: string, mime: string, audio: Buffer, signal: AbortSignal): Promise<{ status: number; body: string }> {
  const boundary = `ya-${randomBytes(16).toString("hex")}`;
  const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\ndesktop\r\n--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="recording.${mime.split("/")[1]}"\r\nContent-Type: ${mime}\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "POST", signal, rejectUnauthorized: true,
      agent: new Agent({ keepAlive: false, proxyEnv: {} }),
      headers: { "X-YA-Sync-Secret": secret, "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": prefix.length + audio.length + suffix.length, "Accept": "application/json" }
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
  getSetupData: () => DesktopSetupData;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  upload?: typeof uploadDesktopDictation;
}) {
  let revision = 1;
  let signature = "";
  const jobs = new Map<number, { id: string; controller: AbortController }>();
  const cancelled = new Map<number, Set<string>>();
  function invalidate() {
    revision++;
    for (const job of jobs.values()) job.controller.abort();
  }
  function current() {
    try {
      options.assertUnlocked();
      options.assertCapability(BUSINESS_CAPABILITIES.AI);
    } catch {
      if (signature !== "denied") { invalidate(); signature = "denied"; }
      return { available: false, revision, message: "Dikte için uygulama kilidi açık ve AI Yardımcı etkin olmalı." };
    }
    const setup = options.getSetupData();
    const config = getWebSyncConfig(setup);
    // Identity never leaves main. A serial revision reveals no URL, key or secret digest.
    const next = JSON.stringify([setup.aiEnabled, setup.aiService, setup.aiBaseUrl, setup.aiSttModel, setup.aiApiKeyConfigured, config]);
    if (signature !== next) { invalidate(); signature = next; }
    const available = setup.aiEnabled && setup.aiApiKeyConfigured && supportsSttModel(setup.aiService, setup.aiSttModel ?? "")
      && isSupportedSttBaseUrl(setup.aiService, setup.aiBaseUrl) && Boolean(hostingEndpoint(config.baseUrl))
      && config.syncSecret.trim().length >= 12 && config.syncSecret.length <= 4096 && !/[\r\n]/.test(config.syncSecret);
    return { available, revision, message: available ? "Dikte hazır · yalnız Durdur ile ses gönderilir."
      : "Dikte için Servisler'de AI Yardımcı, konuşma modeli ve HTTPS web bağlantısını kaydedin." };
  }
  function getStatus(): DesktopDictationStatus {
    try { return current(); } catch { return { available: false, revision, message: FAILED }; }
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
      const config = getWebSyncConfig(options.getSetupData());
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
  return { getStatus, transcribe, cancel, releaseSender, invalidate };
}
