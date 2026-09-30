import { PhpHostingSyncTransport } from "@yardimci-asistan/sync-core";
import { createDiagnosticOperationId, desktopLog } from "./desktop-logger";
import { logWebFailure, safeWebTarget } from "./web-diagnostics";

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
    desktopLog.warn({
      scope: "web",
      event: "web.connection-test.invalid-config",
      message: "Web bağlantı testi geçersiz adres nedeniyle başlatılmadı.",
      meta: { target: safeWebTarget(baseUrl), reason: "invalid_config" }
    });
    return { ok: false, message: "Web eşitleme adresi http:// veya https:// ile başlayan geçerli bir adres olmalı." };
  }
  if (syncSecret.length < 12) {
    desktopLog.warn({
      scope: "web",
      event: "web.connection-test.invalid-config",
      message: "Web bağlantı testi güvenlik anahtarı doğrulamasında durdu.",
      meta: { target: safeWebTarget(baseUrl), reason: "invalid_config", secretConfigured: Boolean(syncSecret) }
    });
    return { ok: false, message: "Web güvenlik anahtarı en az 12 karakter olmalı." };
  }
  if (syncSecret.length > 512) {
    return { ok: false, message: "Web güvenlik anahtarı çok uzun." };
  }

  const operationId = createDiagnosticOperationId("web-test");
  const startedAt = Date.now();
  desktopLog.info({
    scope: "web",
    event: "web.connection-test.started",
    message: "Web bağlantı testi başlatıldı.",
    operationId,
    meta: { target: safeWebTarget(baseUrl), timeoutMs }
  });

  const transport = new PhpHostingSyncTransport({
    baseUrl,
    syncSecret,
    clientId: WEB_CONNECTION_TEST_CLIENT_ID,
    fetchImpl: createTimedFetch(timeoutMs)
  });
  const result = await transport.getCapabilities();

  if (!result.ok) {
    const timedOut = /abort|aborted|zaman aşım/i.test(result.error ?? "");
    logWebFailure({
      event: "web.connection-test.failed",
      message: "Web bağlantı testi başarısız oldu.",
      targetUrl: baseUrl,
      failure: result,
      operationId,
      meta: { durationMs: Date.now() - startedAt }
    });
    return {
      ok: false,
      message: timedOut
        ? "Web modülü 10 saniye içinde yanıt vermedi. Adres, SSL ve hosting durumunu kontrol edin."
        : result.message
    };
  }

  if (result.protocol_version < 2 || result.storage !== "sqlite") {
    logWebFailure({
      event: "web.connection-test.failed",
      message: "Web bağlantı testi protokol uyumsuzluğu nedeniyle başarısız oldu.",
      targetUrl: baseUrl,
      failure: {
        message: "Web modülü güncel senkron protokolünü desteklemiyor.",
        error: "protocol_mismatch"
      },
      operationId,
      meta: {
        durationMs: Date.now() - startedAt,
        protocolVersion: result.protocol_version,
        storage: result.storage
      }
    });
    return {
      ok: false,
      message: "Web modülü güncel senkron protokolünü desteklemiyor. Hosting paketini güncelleyin."
    };
  }

  desktopLog.info({
    scope: "web",
    event: "web.connection-test.completed",
    message: "Web bağlantı testi başarıyla tamamlandı.",
    operationId,
    meta: {
      target: safeWebTarget(baseUrl),
      durationMs: Date.now() - startedAt,
      protocolVersion: result.protocol_version,
      storage: result.storage
    }
  });

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
