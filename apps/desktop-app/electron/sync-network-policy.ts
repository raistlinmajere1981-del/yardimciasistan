import type { SyncFailure } from "@yardimci-asistan/sync-core";
const SYNC_HTTP_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_SECONDS = [5, 15, 30, 60, 300] as const;

export function createSyncFetchWithTimeout(fetchImpl: typeof fetch, timeoutMs = SYNC_HTTP_TIMEOUT_MS): typeof fetch {
  const boundedTimeoutMs = Math.max(1, Math.trunc(timeoutMs));
  return async (input, init = {}) => {
    const controller = new AbortController();
    const upstreamSignal = init.signal;
    const abortFromUpstream = () => controller.abort();
    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        controller.abort();
      } else {
        upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
      }
    }
    const timeout = setTimeout(() => controller.abort(), boundedTimeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    }
  };
}

export function isUsableSyncConfig(config: { baseUrl: string; syncSecret: string }) {
  return /^https?:\/\//.test(config.baseUrl.trim())
    && config.syncSecret.trim().length >= 12
    && config.syncSecret.trim() !== "change-this-secret";
}

export function calculateNextAttempt(attemptCount: number) {
  return new Date(Date.now() + calculateRetryDelayMs(attemptCount)).toISOString();
}

export function calculateRetryDelayMs(attemptCount: number) {
  const index = Math.min(Math.max(0, attemptCount), RETRY_DELAYS_SECONDS.length - 1);
  const seconds = RETRY_DELAYS_SECONDS[index] ?? 5;
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.round(seconds * jitter * 1000);
}

export function classifyFailurePhase(result: SyncFailure | undefined): "offline" | "error" {
  // An HTTP response establishes contact with the Web target; auth/protocol/server
  // errors must not become a transport-unreachable signal because of their text.
  if (result?.status && result.status > 0) return "error";
  return result && isConnectionFailureMessage(result.message) ? "offline" : "error";
}

export function isConnectionFailureMessage(message: string) {
  // The words "internet"/"bağlantı" also occur in configuration and auth errors.
  // Recognize the transport's unreachable/timeout messages, not generic advice.
  return /ulaşılamadı|zaman aşım/i.test(message);
}
