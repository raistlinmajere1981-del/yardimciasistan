import type { SyncFailure } from "@yardimci-asistan/sync-core";
import { desktopLog } from "./desktop-logger";

export type WebDiagnosticFailureReason =
  | "invalid_config"
  | "authentication"
  | "endpoint_missing"
  | "method_rejected"
  | "protocol_mismatch"
  | "timeout"
  | "dns"
  | "tls"
  | "network"
  | "rate_limited"
  | "server_error"
  | "client_error"
  | "invalid_response"
  | "unknown";

export function safeWebTarget(value: string) {
  try {
    const url = new URL(String(value || "").trim());
    return {
      protocol: url.protocol,
      host: url.host,
      pathname: url.pathname.replace(/\/+$/, "") || "/"
    };
  } catch {
    return { protocol: "", host: "", pathname: "" };
  }
}

function classifyWebFailure(input: {
  status?: number;
  message?: string;
  error?: string;
}): WebDiagnosticFailureReason {
  const status = Number(input.status ?? 0);
  const text = [input.message ?? "", input.error ?? ""].join(" ").toLowerCase();

  if (/protocol|protokol|sqlite.*destek|güncel senkron/.test(text)) return "protocol_mismatch";
  if (/abort|aborted|timeout|timed out|time.?out|zaman aş/.test(text) || status === 408 || status === 504) return "timeout";
  if (/enotfound|eai_again|dns|name or service not known|getaddrinfo/.test(text)) return "dns";
  if (/certificate|cert_|tls|ssl|self signed|unable to verify/.test(text)) return "tls";
  if (status === 401 || status === 403 || /güvenlik anahtarı|unauthorized|forbidden|authentication/.test(text)) return "authentication";
  if (status === 404) return "endpoint_missing";
  if (status === 405) return "method_rejected";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  if (/geçerli.*yanıt|invalid.*response|json|beklenmeyen yanıt/.test(text)) return "invalid_response";
  if (/adres.*gerekli|geçerli.*adres|http:\/\/|https:\/\//.test(text)) return "invalid_config";
  if (/ulaşılamadı|bağlantı|internet|fetch failed|econnreset|econnrefused|socket/.test(text)) return "network";
  return "unknown";
}

export function logWebFailure(input: {
  scope?: string;
  event: string;
  message: string;
  targetUrl: string;
  failure: Pick<SyncFailure, "status" | "message" | "error"> | { status?: number; message?: string; error?: string };
  operationId?: string;
  meta?: Record<string, unknown>;
}) {
  const reason = classifyWebFailure(input.failure);
  const logInput = {
    scope: input.scope || "web",
    event: input.event,
    message: input.message,
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
    meta: {
      reason,
      status: input.failure.status ?? 0,
      target: safeWebTarget(input.targetUrl),
      remoteMessage: input.failure.message ?? "",
      ...(input.meta ?? {})
    },
    ...(input.failure.error ? { error: input.failure.error } : {})
  };
  if (reason === "invalid_config" || reason === "protocol_mismatch" || reason === "endpoint_missing" || reason === "method_rejected") {
    desktopLog.warn(logInput);
  } else {
    desktopLog.error(logInput);
  }
  return reason;
}
