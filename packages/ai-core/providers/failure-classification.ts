import type { AICompletionFailureReason } from "../types";

export interface AIProviderFailureClassificationInput {
  status?: number;
  providerCode?: string;
  message?: string;
  error?: string;
  timedOut?: boolean;
}

export interface AIProviderFailureClassification {
  reason: AICompletionFailureReason;
  providerCode?: string;
}

export function classifyAIProviderFailure(input: AIProviderFailureClassificationInput): AIProviderFailureClassification {
  const status = Number(input.status ?? 0);
  const providerCode = String(input.providerCode ?? "").trim();
  const haystack = [
    providerCode,
    input.message ?? "",
    input.error ?? ""
  ].join(" ").toLowerCase();

  if (input.timedOut || status === 408 || status === 504 || /timeout|timed out|time.?out|deadline exceeded|zaman aş/.test(haystack)) {
    return { reason: "timeout", ...(providerCode ? { providerCode } : {}) };
  }
  if (status === 401 || /invalid[_ -]?api[_ -]?key|unauthenticated|authentication|api key not valid|incorrect api key/.test(haystack)) {
    return { reason: "authentication", ...(providerCode ? { providerCode } : {}) };
  }
  if (status === 403 || /permission denied|forbidden|insufficient permission|not authorized/.test(haystack)) {
    return { reason: "permission", ...(providerCode ? { providerCode } : {}) };
  }
  if (
    /quota|billing|resource_exhausted|insufficient_quota|credit balance|free tier|daily limit|monthly limit|usage limit/.test(haystack)
  ) {
    return { reason: "quota_exhausted", ...(providerCode ? { providerCode } : {}) };
  }
  if (status === 429 || /rate[_ -]?limit|too many requests|rate limit exceeded/.test(haystack)) {
    return { reason: "rate_limited", ...(providerCode ? { providerCode } : {}) };
  }
  if (status === 503 || status === 529 || /overloaded|service unavailable|server busy|temporarily unavailable|high demand|capacity/.test(haystack)) {
    return { reason: "service_busy", ...(providerCode ? { providerCode } : {}) };
  }
  if (status === 404 || /model.*not found|unknown model|model.*unavailable|unsupported model/.test(haystack)) {
    return { reason: "model_unavailable", ...(providerCode ? { providerCode } : {}) };
  }
  if (status === 400 || status === 409 || status === 422 || /invalid request|invalid argument|malformed/.test(haystack)) {
    return { reason: "invalid_request", ...(providerCode ? { providerCode } : {}) };
  }
  if (
    !status
    && /fetch failed|network|econnreset|econnrefused|enotfound|eai_again|socket|certificate|tls|dns|internet/.test(haystack)
  ) {
    return { reason: "network", ...(providerCode ? { providerCode } : {}) };
  }
  if (!status && /base url|required|api key gerekli|model adı gerekli|mesaj listesi boş/.test(haystack)) {
    return { reason: "configuration", ...(providerCode ? { providerCode } : {}) };
  }
  return { reason: "provider_error", ...(providerCode ? { providerCode } : {}) };
}

export function parseRetryAfterSeconds(value: string | null): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(86_400, Math.ceil(seconds));
  }
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return undefined;
  return Math.max(0, Math.min(86_400, Math.ceil((at - Date.now()) / 1000)));
}
