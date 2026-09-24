import { PhpHostingSyncTransport } from "@yardimci-asistan/sync-core";

const DEFAULT_WEB_CONNECTION_TIMEOUT_MS = 10_000;
const WEB_CONNECTION_TEST_CLIENT_ID = "desktop-connection-test";

export interface WebConnectionTestInput {
  baseUrl: string;
  syncSecret: string;
}

export type WebConnectionTestResult =
  | {
      ok: true;
      message: string;
      protocolVersion: number;
      storage: string;
    }
  | { ok: false; message: string };

export async function testWebConnection(
  input: unknown,
  timeoutMs = DEFAULT_WEB_CONNECTION_TIMEOUT_MS
): Promise<WebConnectionTestResult> {
  const candidate = input && typeof input === "object"
    ? input as Partial<WebConnectionTestInput>
    : {};
  const baseUrl = typeof candidate.baseUrl === "string"
    ? candidate.baseUrl.trim().replace(/\/+$/, "")
    : "";
  const syncSecret = typeof candidate.syncSecret === "string"
    ? candidate.syncSecret.trim()
    : "";

  if (!isValidHttpUrl(baseUrl)) {
    return { ok: false, message: "Web eşitleme adresi http:// veya https:// ile başlayan geçerli bir adres olmalı." };
  }
  if (syncSecret.length < 12) {
    return { ok: false, message: "Web güvenlik anahtarı en az 12 karakter olmalı." };
  }
  if (syncSecret.length > 512) {
    return { ok: false, message: "Web güvenlik anahtarı çok uzun." };
  }

  const transport = new PhpHostingSyncTransport({
    baseUrl,
    syncSecret,
    clientId: WEB_CONNECTION_TEST_CLIENT_ID,
    fetchImpl: createTimedFetch(timeoutMs)
  });
  const result = await transport.getCapabilities();

  if (!result.ok) {
    const timedOut = /abort|aborted|zaman aşım/i.test(result.error ?? "");
    return {
      ok: false,
      message: timedOut
        ? "Web modülü 10 saniye içinde yanıt vermedi. Adres, SSL ve hosting durumunu kontrol edin."
        : result.message
    };
  }

  if (result.protocol_version < 2 || result.storage !== "sqlite") {
    return {
      ok: false,
      message: "Web modülü güncel senkron protokolünü desteklemiyor. Hosting paketini güncelleyin."
    };
  }

  return {
    ok: true,
    message: "Web bağlantısı hazır. Güvenlik anahtarı ve SQLite senkron protokolü doğrulandı.",
    protocolVersion: result.protocol_version,
    storage: result.storage
  };
}

function isValidHttpUrl(value: string): boolean {
  if (!value || value.length > 2048) {
    return false;
  }
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && Boolean(url.hostname)
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function createTimedFetch(timeoutMs: number): typeof fetch {
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
    const timeout = globalThis.setTimeout(() => controller.abort(), boundedTimeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      globalThis.clearTimeout(timeout);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    }
  };
}
