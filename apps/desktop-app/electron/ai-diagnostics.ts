import type { AICompletionFailure, AICompletionSuccess, AIProviderConfig } from "@yardimci-asistan/ai-core";
import { desktopLog } from "./desktop-logger";

type AiOperationOutcome = AICompletionSuccess | AICompletionFailure;

function safeEndpoint(value: string) {
  try {
    const url = new URL(String(value || "").trim());
    return {
      protocol: url.protocol,
      host: url.host,
      pathname: url.pathname
    };
  } catch {
    return { protocol: "", host: "", pathname: "" };
  }
}

export function logAiOperationStarted(operation: string, config: AIProviderConfig, operationId?: string) {
  desktopLog.info({
    scope: "ai",
    event: `ai.${operation}.started`,
    message: "AI işlemi başlatıldı.",
    ...(operationId !== undefined ? { operationId } : {}),
    meta: {
      operation,
      provider: config.provider,
      service: config.service || "",
      model: config.model,
      timeoutMs: config.timeoutMs ?? 15_000,
      endpoint: safeEndpoint(config.baseUrl)
    }
  });
}

export function logAiOperationCompleted(
  operation: string,
  config: AIProviderConfig,
  outcome: AiOperationOutcome,
  startedAt: number,
  operationId?: string
) {
  const durationMs = Math.max(0, Date.now() - startedAt);
  if (outcome.ok) {
    desktopLog.info({
      scope: "ai",
      event: `ai.${operation}.completed`,
      message: "AI işlemi tamamlandı.",
      ...(operationId !== undefined ? { operationId } : {}),
      meta: {
        operation,
        provider: outcome.provider || config.provider,
        service: outcome.service || config.service || "",
        model: outcome.model || config.model,
        durationMs,
        fallback: outcome.fallback === true
      }
    });
    return;
  }

  const severity = outcome.reason === "configuration"
    || outcome.reason === "invalid_request"
    || outcome.reason === "model_unavailable"
    || outcome.reason === "authentication"
    || outcome.reason === "permission"
    || outcome.reason === "quota_exhausted"
    ? "warn"
    : "error";
  const input = {
    scope: "ai",
    event: `ai.${operation}.failed`,
    message: "AI işlemi tamamlanamadı.",
    ...(operationId !== undefined ? { operationId } : {}),
    meta: {
      operation,
      provider: outcome.provider || config.provider,
      service: outcome.service || config.service || "",
      model: outcome.model || config.model,
      durationMs,
      reason: outcome.reason || "provider_error",
      status: outcome.status ?? 0,
      providerCode: outcome.providerCode || "",
      retryAfterSeconds: outcome.retryAfterSeconds ?? 0,
      providerMessage: outcome.message
    },
    ...(outcome.error ? { error: outcome.error } : {})
  };
  if (severity === "warn") desktopLog.warn(input);
  else desktopLog.error(input);
}

export function logAiFallback(operation: string, providerMessage: string, meta: Record<string, unknown> = {}) {
  desktopLog.warn({
    scope: "ai",
    event: `ai.${operation}.fallback`,
    message: "AI servisi yerine yerel fallback kullanıldı.",
    meta: {
      operation,
      providerMessage,
      ...meta
    }
  });
}
