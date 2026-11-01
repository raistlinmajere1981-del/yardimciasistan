import { CLOUDFLARE_AI_MODELS, isCloudflareAiBaseUrl, supportsVisionModel } from "@yardimci-asistan/shared";
import type { AICompletionFailureReason, AICompletionResult, AIProviderConfig } from "../types";
import type { OpenAICompatibleChatOptions } from "./openai-compatible";
import { classifyAIProviderFailure, parseRetryAfterSeconds } from "./failure-classification";

export function cloudflareFailureMessage(reason: AICompletionFailureReason): string {
  const messages: Partial<Record<AICompletionFailureReason, string>> = {
    configuration: "Cloudflare Account ID, API Token ve model ayarlarını kontrol edin.",
    authentication: "Cloudflare API Token veya hesap bilgisi kabul edilmedi.",
    permission: "Cloudflare hesabının bu modele erişim izni yok. Token yetkisini ve planı kontrol edin.",
    quota_exhausted: "Cloudflare günlük ücretsiz AI kotası doldu. Kota yenilendiğinde tekrar deneyin.",
    rate_limited: "Cloudflare istek sınırına ulaşıldı. Kısa süre sonra tekrar deneyin.",
    service_busy: "Cloudflare şu anda yoğun veya geçici olarak kullanılamıyor.",
    timeout: "Cloudflare yanıtı zamanında alınamadı.",
    network: "Cloudflare bağlantısı kurulamadı. İnternet bağlantısını kontrol edin.",
    model_unavailable: "Seçilen Cloudflare modeli bulunamadı veya kullanılamıyor.",
    invalid_request: "Cloudflare isteği modelin kabul ettiği biçime uygun değil.",
    invalid_response: "Cloudflare yanıtı uygulamanın beklediği biçimde değil."
  };
  return messages[reason] ?? "Cloudflare AI işlemi tamamlanamadı. Tekrar deneyin.";
}

export class CloudflareAiError extends Error {
  constructor(readonly reason: AICompletionFailureReason, readonly status?: number,
    readonly providerCode?: string, readonly retryAfterSeconds?: number) {
    super(providerCode === "8007"
      ? "Cloudflare isteği içerik filtresi nedeniyle reddetti. Açıklamayı değiştirip tekrar deneyin."
      : cloudflareFailureMessage(reason));
    this.name = "CloudflareAiError";
  }
}

/** Cloudflare codes take precedence over HTTP: daily quota and capacity both use 429. */
export function classifyCloudflareFailure(status: number, code: string, message = ""): AICompletionFailureReason {
  if (["10000", "9109", "10001", "7003"].includes(code)) return "authentication";
  if (["5018", "5016", "3023", "3041", "5035"].includes(code)) return "permission";
  if (code === "3036") return "quota_exhausted";
  if (code === "3040") return "service_busy";
  if (["3007", "3008"].includes(code)) return "timeout";
  if (["5007", "3042"].includes(code)) return "model_unavailable";
  if (status >= 500 && status !== 504) return "service_busy";
  return classifyAIProviderFailure({ status, providerCode: code, message }).reason;
}

interface CloudflareEnvelope {
  success?: boolean;
  errors?: Array<{ code?: unknown; message?: unknown }>;
  result?: unknown;
}

export async function runCloudflareModel(config: AIProviderConfig, body: object,
  fetchImpl: typeof fetch = globalThis.fetch, responseLimit = 128 * 1024): Promise<unknown> {
  if (!config.enabled || config.service !== "cloudflare" || config.provider !== "openai_compatible" || !isCloudflareAiBaseUrl(config.baseUrl)
    || !(/^@cf\/[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_.-]*$/i.test(config.model) && config.model.length <= 160)
    || !config.apiKey || config.apiKey.length > 8192 || /[\x00-\x20\x7f]/.test(config.apiKey)) {
    throw new CloudflareAiError("configuration");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 30000);
  try {
    const response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, "")}/run/${config.model}`, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body)
    });
    const reader = response.body?.getReader();
    if (!reader) throw new CloudflareAiError("invalid_response", response.status);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.length;
      if (size > responseLimit) { await reader.cancel(); throw new CloudflareAiError("invalid_response", response.status); }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let payload: CloudflareEnvelope | null = null;
    try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as CloudflareEnvelope; } catch { /* fixed failure below */ }
    if (!response.ok || payload?.success === false) {
      const error = payload?.errors?.[0];
      const code = /^\d{3,6}$/.test(String(error?.code ?? "")) ? String(error?.code) : "";
      // Provider messages classify locally; they never leave the adapter or enter logs.
      throw new CloudflareAiError(classifyCloudflareFailure(response.status, code,
        typeof error?.message === "string" ? error.message : ""), response.status, code || undefined,
        parseRetryAfterSeconds(response.headers.get("retry-after")));
    }
    if (!payload || payload.success !== true || !payload.result || typeof payload.result !== "object") {
      throw new CloudflareAiError("invalid_response", response.status);
    }
    return payload.result;
  } catch (error) {
    if (error instanceof CloudflareAiError) throw error;
    throw new CloudflareAiError(controller.signal.aborted ? "timeout" : "network");
  } finally { clearTimeout(timeout); }
}

async function cloudflareCompletion(config: AIProviderConfig, messages: object[], fetchImpl: typeof fetch): Promise<AICompletionResult> {
  try {
    const result = await runCloudflareModel(config, { messages, stream: false }, fetchImpl) as {
      response?: unknown; choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
    };
    const choice = result.choices?.[0];
    const text = result.response ?? choice?.message?.content;
    if (typeof text !== "string" || !text.trim() || text.length > 64000
      || (choice?.finish_reason && choice.finish_reason !== "stop")) throw new CloudflareAiError("invalid_response");
    return { ok: true, provider: "openai_compatible", service: "cloudflare", model: config.model, answer: text.trim().split(config.apiKey).join("[gizlendi]") };
  } catch (error) {
    const failure = error instanceof CloudflareAiError ? error : new CloudflareAiError("invalid_response");
    return { ok: false, provider: "openai_compatible", service: "cloudflare", model: config.model,
      message: failure.message, reason: failure.reason, fallbackAnswer: "",
      ...(failure.status !== undefined ? { status: failure.status } : {}),
      ...(failure.providerCode ? { providerCode: failure.providerCode } : {}),
      ...(failure.retryAfterSeconds !== undefined ? { retryAfterSeconds: failure.retryAfterSeconds } : {}) };
  }
}

export function generateCloudflareChat(options: OpenAICompatibleChatOptions, fetchImpl: typeof fetch = globalThis.fetch): Promise<AICompletionResult> {
  const messages = options.messages.map(message => ({ ...message, role: message.role === "developer" ? "system" : message.role }));
  return cloudflareCompletion({ ...options, enabled: options.enabled && messages.length > 0
    && /^@cf\/[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_.-]*$/i.test(options.model)
    && options.model !== CLOUDFLARE_AI_MODELS.image && options.model !== CLOUDFLARE_AI_MODELS.stt }, messages, fetchImpl);
}

/** Inline images only: no remote URL fetching and no hidden provider/model fallback. */
export function analyzeCloudflareImage(config: AIProviderConfig, prompt: string, imageDataUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch): Promise<AICompletionResult> {
  const valid = supportsVisionModel("cloudflare", config.model) && Boolean(prompt.trim())
    && imageDataUrl.length <= 7 * 1024 * 1024 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageDataUrl);
  return cloudflareCompletion({ ...config, enabled: config.enabled && valid }, [{ role: "user", content: [
    { type: "text", text: prompt }, { type: "image_url", image_url: { url: imageDataUrl } }
  ] }], fetchImpl);
}

export async function generateCloudflareImage(config: AIProviderConfig, prompt: string, fetchImpl: typeof fetch = globalThis.fetch) {
  if (config.model !== CLOUDFLARE_AI_MODELS.image || !prompt.trim() || prompt.length > 2048) throw new CloudflareAiError("invalid_request");
  const result = await runCloudflareModel(config, { prompt, steps: 4 }, fetchImpl, 42 * 1024 * 1024) as { image?: unknown };
  const encoded = result.image;
  if (typeof encoded !== "string" || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new CloudflareAiError("invalid_response");
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new CloudflareAiError("invalid_response");
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new CloudflareAiError("invalid_response");
  return { bytes, mimeType: png ? "image/png" as const : "image/jpeg" as const };
}
