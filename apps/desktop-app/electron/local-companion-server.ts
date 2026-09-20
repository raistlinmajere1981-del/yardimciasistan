import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  LOCAL_COMPANION_DEVICE_ID_HEADER,
  LOCAL_COMPANION_ENDPOINTS,
  LOCAL_COMPANION_PROTOCOL_VERSION,
  LOCAL_COMPANION_TOKEN_HEADER,
  type AndroidSyncAction
} from "@yardimci-asistan/sync-core";

export const DEFAULT_LOCAL_COMPANION_PORT = 47_831;
const MAX_JSON_BODY_BYTES = 128 * 1024;

export interface LocalCompanionAuthorizationInput {
  deviceId: string;
  token: string;
  remoteAddress: string;
}

export interface LocalCompanionActionResult {
  ok: boolean;
  message: string;
  alreadyApplied?: boolean;
}

export interface LocalCompanionPairingRequest {
  pairingSecret: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  remoteAddress: string;
}

export type LocalCompanionPairingResponse =
  | {
      ok: true;
      token: string;
      approvalRequired: boolean;
      message: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      statusCode: number;
    };

export interface LocalCompanionServerOptions {
  desktopId: () => string;
  createSummary: (deviceId: string) => unknown;
  applyAction: (action: AndroidSyncAction) => LocalCompanionActionResult;
  authorize: (input: LocalCompanionAuthorizationInput) => boolean;
  pair?: (input: LocalCompanionPairingRequest) => LocalCompanionPairingResponse;
  logInfo?: (message: string) => void;
  logWarn?: (message: string, error?: unknown) => void;
  logError?: (message: string, error?: unknown) => void;
}

export interface LocalCompanionServerAddress {
  host: string;
  port: number;
}

function headerValue(request: IncomingMessage, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? "").trim() : String(value ?? "").trim();
}

function normalizedRemoteAddress(value: string | undefined): string {
  const raw = String(value ?? "").trim();
  if (raw.startsWith("::ffff:")) return raw.slice(7);
  const zoneIndex = raw.indexOf("%");
  return zoneIndex >= 0 ? raw.slice(0, zoneIndex) : raw;
}

export function isLocalNetworkAddress(value: string | undefined): boolean {
  const address = normalizedRemoteAddress(value);
  if (!address) return false;
  if (address === "::1") return true;

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) {
    const parts = address.split(".").map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    if (parts[0] === 10 || parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    return false;
  }

  const lower = address.toLowerCase();
  return lower.startsWith("fe8")
    || lower.startsWith("fe9")
    || lower.startsWith("fea")
    || lower.startsWith("feb")
    || lower.startsWith("fc")
    || lower.startsWith("fd");
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_JSON_BODY_BYTES) {
      throw new Error("request_body_too_large");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_json_object");
  }
  return parsed as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAction(body: Record<string, unknown>, deviceId: string): AndroidSyncAction | null {
  const source = objectValue(body.action) ?? body;
  const id = stringValue(source.id);
  const actionType = stringValue(source.action_type);
  const payload = objectValue(source.payload);
  if (!id || !actionType || !payload) return null;

  const now = new Date().toISOString();
  return {
    id,
    action_type: actionType as AndroidSyncAction["action_type"],
    payload,
    created_at: stringValue(source.created_at) || now,
    device_id: deviceId,
    device_name: stringValue(source.device_name),
    app_version: stringValue(source.app_version),
    last_seen_at: now,
    status: "pending",
    error_message: ""
  };
}

export class LocalCompanionServer {
  private server: Server | null = null;
  private currentAddress: LocalCompanionServerAddress | null = null;
  private sourceRevision = Date.now();

  constructor(private readonly options: LocalCompanionServerOptions) {}

  get address(): LocalCompanionServerAddress | null {
    return this.currentAddress;
  }

  get revision(): number {
    return this.sourceRevision;
  }

  markSnapshotDirty(): number {
    this.sourceRevision = Math.max(Date.now(), this.sourceRevision + 1);
    return this.sourceRevision;
  }

  async start(host = "0.0.0.0", port = DEFAULT_LOCAL_COMPANION_PORT): Promise<LocalCompanionServerAddress> {
    if (this.server && this.currentAddress) return this.currentAddress;

    const server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    this.server = server;

    try {
      await this.listen(server, host, port);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "EADDRINUSE" || port === 0) {
        this.server = null;
        throw error;
      }
      this.options.logWarn?.(`Default local companion port ${port} is busy; selecting an available port.`, error);
      await this.listen(server, host, 0);
    }

    const address = server.address() as AddressInfo | null;
    if (!address) {
      await this.stop();
      throw new Error("Local companion server did not expose a listening address.");
    }
    this.currentAddress = { host, port: address.port };
    this.options.logInfo?.(`Local companion server listening on ${host}:${address.port}.`);
    return this.currentAddress;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.currentAddress = null;
    if (!server?.listening) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    this.options.logInfo?.("Local companion server stopped.");
  }

  private listen(server: Server, host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const remoteAddress = normalizedRemoteAddress(request.socket.remoteAddress);
      if (!isLocalNetworkAddress(remoteAddress)) {
        writeJson(response, 403, { ok: false, code: "local_network_required", message: "Yerel ağ erişimi gerekli." });
        return;
      }

      const url = new URL(request.url || "/", "http://local-companion.invalid");
      if (request.method === "GET" && url.pathname === LOCAL_COMPANION_ENDPOINTS.status) {
        writeJson(response, 200, {
          ok: true,
          protocol_version: LOCAL_COMPANION_PROTOCOL_VERSION,
          desktop_id: this.options.desktopId(),
          pairing_required: true,
          source_revision: this.sourceRevision
        });
        return;
      }

      if (request.method === "POST" && url.pathname === LOCAL_COMPANION_ENDPOINTS.pair) {
        if (!this.options.pair) {
          writeJson(response, 503, {
            ok: false,
            code: "pairing_not_configured",
            message: "Yerel cihaz eşleştirmesi henüz yapılandırılmadı."
          });
          return;
        }

        const body = await readJsonBody(request);
        const pairingSecret = stringValue(body.pairing_secret);
        const deviceId = stringValue(body.device_id);
        const deviceName = stringValue(body.device_name);
        const appVersion = stringValue(body.app_version);
        if (!pairingSecret || !/^[A-Za-z0-9._:-]{6,120}$/.test(deviceId)) {
          writeJson(response, 422, {
            ok: false,
            code: "invalid_pairing_request",
            message: "Yerel eşleştirme isteği eksik veya geçersiz."
          });
          return;
        }

        const result = this.options.pair({
          pairingSecret,
          deviceId,
          deviceName,
          appVersion,
          remoteAddress
        });
        if (!result.ok) {
          writeJson(response, result.statusCode, result);
          return;
        }
        this.markSnapshotDirty();
        this.options.logInfo?.(`Local companion paired device ${deviceId} from ${remoteAddress}.`);
        writeJson(response, 200, {
          ok: true,
          protocol_version: LOCAL_COMPANION_PROTOCOL_VERSION,
          desktop_id: this.options.desktopId(),
          local_token: result.token,
          approval_required: result.approvalRequired,
          message: result.message,
          source_revision: this.sourceRevision
        });
        return;
      }

      if (
        request.method !== "POST"
        || (url.pathname !== LOCAL_COMPANION_ENDPOINTS.summary && url.pathname !== LOCAL_COMPANION_ENDPOINTS.action)
      ) {
        writeJson(response, 404, { ok: false, code: "not_found", message: "Yerel companion endpoint bulunamadı." });
        return;
      }

      const deviceId = headerValue(request, LOCAL_COMPANION_DEVICE_ID_HEADER);
      const token = headerValue(request, LOCAL_COMPANION_TOKEN_HEADER);
      if (!/^[A-Za-z0-9._:-]{6,120}$/.test(deviceId) || !token) {
        writeJson(response, 401, { ok: false, code: "local_auth_required", message: "Yerel cihaz doğrulaması gerekli." });
        return;
      }
      if (!this.options.authorize({ deviceId, token, remoteAddress })) {
        this.options.logWarn?.(`Rejected local companion authorization for device ${deviceId} from ${remoteAddress}.`);
        writeJson(response, 401, { ok: false, code: "local_auth_failed", message: "Yerel cihaz doğrulaması başarısız." });
        return;
      }

      const body = await readJsonBody(request);
      if (url.pathname === LOCAL_COMPANION_ENDPOINTS.summary) {
        writeJson(response, 200, {
          ok: true,
          protocol_version: LOCAL_COMPANION_PROTOCOL_VERSION,
          desktop_id: this.options.desktopId(),
          source_revision: this.sourceRevision,
          not_modified: false,
          snapshot: this.options.createSummary(deviceId)
        });
        return;
      }

      const action = normalizeAction(body, deviceId);
      if (!action) {
        writeJson(response, 422, { ok: false, code: "invalid_action", message: "Telefon işlemi eksik veya geçersiz." });
        return;
      }
      const result = this.options.applyAction(action);
      this.markSnapshotDirty();
      writeJson(response, 200, {
        ok: true,
        action_id: action.id,
        status: result.ok ? "applied" : "failed",
        message: result.message,
        error_message: result.ok ? "" : result.message,
        already_applied: result.ok ? Boolean(result.alreadyApplied) : false,
        source_revision: this.sourceRevision
      });
    } catch (error) {
      const message = error instanceof Error && error.message === "request_body_too_large"
        ? "Yerel companion isteği çok büyük."
        : "Yerel companion isteği işlenemedi.";
      const status = error instanceof Error && error.message === "request_body_too_large" ? 413 : 400;
      this.options.logError?.(message, error);
      if (!response.headersSent) {
        writeJson(response, status, { ok: false, code: "invalid_request", message });
      } else {
        response.end();
      }
    }
  }
}
