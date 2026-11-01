import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import type { LocalCompanionTlsIdentity, LocalCompanionTlsPublicIdentity } from "./local-companion-tls-identity";
import {
  LOCAL_COMPANION_DEVICE_ID_HEADER,
  LOCAL_COMPANION_ENDPOINTS,
  LOCAL_COMPANION_PROTOCOL_VERSION,
  LOCAL_COMPANION_TOKEN_HEADER,
  type AndroidOperationsSnapshot,
  type AndroidSyncAction
} from "@yardimci-asistan/sync-core";
import { desktopLog } from "./desktop-logger";
import { projectAndroidKbsForDevice } from "./android-kbs-projection.js";
import type { previewAndroidCustomerSale } from "./android-customer-sale-preview.js";
import type { quoteAndroidPointSpend } from "./android-point-spend-quote.js";
import type { authorizeCompanionCouponAttempt } from "./companion-coupon-permit.js";
import type { AndroidMarketSaleResultReceipt } from "./database-types.js";
import type { DatabaseSync } from "node:sqlite";
import type { TLSSocket } from "node:tls";
import { readCompanionCashSalePreparationScope, readCompanionPointsPreparationScope, requireCompanionCashSalePrincipal, requireCompanionPointsPrincipal } from "./companion-points-principal.js";
import { isLocalActionParentTransaction } from "./android-action-application-service.js";

declare const localActionContextBrand: unique symbol;
/** Opaque, request-scoped authority. No credentials or serializable evidence. */
export interface LocalCompanionActionContext {
  readonly [localActionContextBrand]: true;
}

// Only the authenticated HTTPS action handler can mint an entry. Neither JSON,
// the shared action model nor a caller-supplied object can reproduce its identity.
const localActionCredentials = new WeakMap<LocalCompanionActionContext, {
  action: AndroidSyncAction; deviceId: string; token: string;
}>();

/** Internal pre-BEGIN key/source preparation. No credentials escape this module. */
export function readLocalActionPointsPreparationScope(db: DatabaseSync, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, customerId: string) {
  const bound = context && localActionCredentials.get(context);
  if (!context || !bound || bound.action !== action || bound.deviceId !== action.device_id
      || action.action_type !== "market_sale_complete" || action.payload.settlement !== "paid"
      || action.payload.customer_id !== customerId || db.isTransaction) {
    throw Object.assign(new Error("Companion points authorization denied."), { code: "COMPANION_POINTS_DENIED" });
  }
  return readCompanionPointsPreparationScope(db, bound, customerId);
}

/** Internal pre-BEGIN zero-Puan paid-cash earn scope. No spend grant is required;
 * the authenticated device, capability, customer and action binding remain. */
export function readLocalActionCashSalePreparationScope(db: DatabaseSync, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, customerId: string) {
  const bound = context && localActionCredentials.get(context);
  if (!context || !bound || bound.action !== action || bound.deviceId !== action.device_id
      || action.action_type !== "market_sale_complete" || action.payload.settlement !== "paid"
      || action.payload.payment_method !== "cash" || action.payload.customer_id !== customerId
      || Number(action.payload.requestedPointsMinor ?? 0) !== 0 || db.isTransaction) {
    throw Object.assign(new Error("Companion cash earn authorization denied."), { code: "COMPANION_CASH_EARN_DENIED" });
  }
  return readCompanionCashSalePreparationScope(db, bound, customerId);
}

/** Parent-write zero-Puan cash earn principal; never authorizes points spending. */
export function requireLocalActionCashSalePrincipal(db: DatabaseSync, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, customerId: string) {
  const requireIngress = () => {
    const bound = context && localActionCredentials.get(context);
    if (!context || !bound || bound.action !== action || bound.deviceId !== action.device_id
        || action.action_type !== "market_sale_complete" || action.payload.settlement !== "paid"
        || action.payload.payment_method !== "cash" || action.payload.customer_id !== customerId
        || Number(action.payload.requestedPointsMinor ?? 0) !== 0
        || !isLocalActionParentTransaction(db, action, context)) {
      throw Object.assign(new Error("Companion cash earn authorization denied."), { code: "COMPANION_CASH_EARN_DENIED" });
    }
    return bound;
  };
  const principal = requireCompanionCashSalePrincipal(db, requireIngress(), customerId);
  return Object.freeze({ ...principal, assertAuthorized(): void {
    requireIngress();
    principal.assertAuthorized();
  } });
}

/** Future parent-write consumer only; does not enable a spend route or settle. */
export function requireLocalActionPointsPrincipal(db: DatabaseSync, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, customerId: string) {
  const requireIngress = () => {
    const bound = context && localActionCredentials.get(context);
    if (!context || !bound || bound.action !== action || bound.deviceId !== action.device_id
        || action.action_type !== "market_sale_complete" || action.payload.settlement !== "paid"
        || action.payload.customer_id !== customerId
        || !isLocalActionParentTransaction(db, action, context)) {
      throw Object.assign(new Error("Companion points authorization denied."), { code: "COMPANION_POINTS_DENIED" });
    }
    return bound;
  };
  const principal = requireCompanionPointsPrincipal(db, requireIngress(), customerId);
  return Object.freeze({ ...principal, assertAuthorized(): void {
    requireIngress();
    principal.assertAuthorized();
  } });
}

const DEFAULT_LOCAL_COMPANION_PORT = 47_831;
const MAX_JSON_BODY_BYTES = 128 * 1024;

interface LocalCompanionAuthorizationInput {
  deviceId: string;
  token: string;
  remoteAddress: string;
}

interface LocalCompanionActionResult {
  ok: boolean;
  message: string;
  alreadyApplied?: boolean;
}

interface LocalCompanionPairingRequest {
  pairingTicket: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  remoteAddress: string;
}

type LocalCompanionPairingResponse =
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

interface LocalCompanionBusinessInfo {
  displayName: string;
  phone: string;
  whatsapp: string;
}

export interface LocalCompanionServerOptions {
  desktopId: () => string;
  businessInfo: () => LocalCompanionBusinessInfo;
  /** Canonical active business identity; never derived from the request. */
  activeBusinessId?: () => string;
  createSummary: (deviceId: string) => AndroidOperationsSnapshot;
  applyAction: (action: AndroidSyncAction, context?: LocalCompanionActionContext) => LocalCompanionActionResult;
  readAuthorizedSaleReceipt?: (action: AndroidSyncAction, deviceId: string, token: string) => AndroidMarketSaleResultReceipt | undefined;
  authorize: (input: LocalCompanionAuthorizationInput) => boolean;
  readBenefitsBalance?: (input: { deviceId: string; token: string; customerId: string; currency: string }) =>
    { availableMinor: number; generatedAtMs: number } | null;
  readCustomerSalePreview?: (input: { deviceId: string; token: string; customerId?: string; lines: Array<{ productId: string; quantity: number }> }) =>
    ReturnType<typeof previewAndroidCustomerSale> | null;
  readPointSpendQuote?: (input: { deviceId: string; token: string; customerId: string; lines: Array<{ productId: string; quantity: number }> }) =>
    ReturnType<typeof quoteAndroidPointSpend>;
  /** Server-owned coupon attempt authorization/quote; never a sale authorization. */
  readCouponAttempt?: (input: { deviceId: string; token: string; actionId: string; customerId: string;
    lines: Array<{ productId: string; quantity: number }>; couponCode: string; paymentMethod: string }) =>
    ReturnType<typeof authorizeCompanionCouponAttempt>;
  enabled?: () => boolean;
  pair?: (input: LocalCompanionPairingRequest) => LocalCompanionPairingResponse;
  onStopped?: () => void;
  /** Product uses one HTTPS listener, including pairing and operations. */
  httpsExperiment?: {
    enabled: true;
    identity: Pick<LocalCompanionTlsIdentity, "load">;
  };
  /** Legacy transport mock only; requires NODE_ENV=test and a loopback bind. */
  testOnlyHttp?: true;
}

export interface LocalCompanionServerAddress {
  host: string;
  port: number;
  protocol?: "https";
}

/** QR address must belong to the current interfaces AND the live certificate. */
export function getLocalPairingEndpoint(
  address: LocalCompanionServerAddress | null,
  identity: LocalCompanionTlsPublicIdentity | null,
  interfaces = networkInterfaces()
): string {
  if (address?.protocol !== "https" || !identity) throw new Error("local_secure_pairing_unavailable");
  const matches = Object.entries(interfaces).flatMap(([name, entries]) =>
    (entries ?? []).filter(entry => entry.family === "IPv4" && !entry.internal
      && identity.ipAddresses.includes(entry.address)
      && /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(entry.address)
      && (address.host === "0.0.0.0" || address.host === entry.address))
      .map(entry => ({ name, ip: entry.address }))
  );
  const rank = (name: string) => /usb|rndis|tether|^enx|^en.*u\d/i.test(name) ? 0
    : /^(wl|wlan)/i.test(name) ? 1 : /^(en|eth)/i.test(name) ? 2 : 3;
  matches.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  if (!matches[0]) throw new Error("local_pairing_address_unavailable");
  return `https://${matches[0].ip}:${address.port}`;
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

function isLocalNetworkAddress(value: string | undefined): boolean {
  const address = normalizedRemoteAddress(value);
  if (!address) return false;
  if (address === "::1") return true;

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) {
    const parts = address.split(".").map(Number);
    const first = parts[0] ?? -1;
    const second = parts[1] ?? -1;
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    if (first === 10 || first === 127) return true;
    if (first === 169 && second === 254) return true;
    if (first === 192 && second === 168) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;
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
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
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

function pendingRequestStatus(status: string): boolean {
  return ["new", "seen", "waiting_owner", "waiting_customer"].includes(status);
}

function latestRequestTimestamp(snapshot: AndroidOperationsSnapshot): string {
  return snapshot.requests.reduce((latest, request) =>
    request.created_at && request.created_at > latest ? request.created_at : latest, "");
}

/** @compiledSmoke Final LAN projection can be tested without opening a socket. */
export function createLocalAndroidSummaryResponse(
  snapshot: AndroidOperationsSnapshot,
  business: LocalCompanionBusinessInfo,
  deviceId: string,
  sourceRevision: number
): Record<string, unknown> {
  const profile = snapshot.androidPermissions[deviceId];
  const active = Boolean(profile?.is_active);
  const now = new Date().toISOString();
  return {
    ok: true,
    message: active ? "Android özeti yerel ağdan alındı." : "Bu cihaz masaüstü onayı bekliyor.",
    approval_required: !active,
    business: {
      display_name: business.displayName,
      phone: business.phone,
      whatsapp: business.whatsapp
    },
    summary: {
      total_requests: snapshot.requests.length,
      new_requests: snapshot.requests.filter((request) => request.status === "new").length,
      pending_requests: snapshot.requests.filter((request) => pendingRequestStatus(request.status)).length,
      synced_requests: snapshot.requests.length,
      request_count: snapshot.requests.length,
      latest_created_at: latestRequestTimestamp(snapshot),
      pulled_at: now,
      android_snapshot_updated_at: snapshot.updated_at,
      pending_action_count: 0
    },
    operations: snapshot.summary,
    business_capabilities: snapshot.business_capabilities,
    local_network_enabled: snapshot.local_network_enabled !== false,
    // Mirrors Hosting's per-device voice projection; contains no provider secrets.
    voice: { stt_available: snapshot.voice?.stt_available === true },
    daily_tasks: snapshot.daily_tasks,
    requests: snapshot.requests,
    customers: snapshot.customers,
    customer_room_stays: snapshot.customer_room_stays,
    room_folios: snapshot.room_folios,
    reservations: snapshot.reservations,
    rooms: snapshot.rooms,
    tables: snapshot.tables,
    menu: snapshot.menu,
    admin_menu: snapshot.admin_menu,
    menu_product_candidates: profile?.permissions.includes("menu.edit") ? snapshot.menu_product_candidates ?? [] : [],
    trackedStockItems: snapshot.trackedStockItems,
    appliedStockImageHashes: snapshot.appliedStockImageHashes,
    table_orders: snapshot.table_orders,
    messages: snapshot.messages,
    androidPermissions: snapshot.androidPermissions,
    finance: snapshot.finance,
    reports: snapshot.reports,
    market: snapshot.market,
    kbs: profile ? projectAndroidKbsForDevice(snapshot.kbs, snapshot.business_capabilities, profile) : null,
    commerce: snapshot.commerce,
    marketing: snapshot.marketing,
    actions: [],
    server_revision: sourceRevision
  };
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
  private starting: Promise<LocalCompanionServerAddress> | null = null;
  private httpsServer: HttpsServer | null = null;
  private publicTlsIdentity: LocalCompanionTlsPublicIdentity | null = null;
  private currentAddress: LocalCompanionServerAddress | null = null;
  private sourceRevision = Date.now();
  private lastBusinessId: string | null = null;

  constructor(private readonly options: LocalCompanionServerOptions) {}

  get address(): LocalCompanionServerAddress | null {
    return this.currentAddress;
  }

  get revision(): number {
    return this.sourceRevision;
  }

  /** Live listener projection for QR; never includes the private key. */
  get tlsIdentity(): LocalCompanionTlsPublicIdentity | null {
    const identity = this.publicTlsIdentity;
    return identity ? { ...identity, ipAddresses: [...identity.ipAddresses] } : null;
  }

  /** Same-key SAN/expiry renewal affects subsequent handshakes on this listener. */
  async refreshTlsIdentity(): Promise<void> {
    const server = this.httpsServer;
    if (!server || !this.options.httpsExperiment) return;
    const { privateKeyPem, ...identity } = await this.options.httpsExperiment.identity.load();
    if (this.httpsServer !== server) return;
    if (this.publicTlsIdentity?.spkiSha256 !== identity.spkiSha256) throw new Error("local_companion_tls_identity_changed");
    server.setSecureContext({ key: privateKeyPem, cert: identity.certificatePem, minVersion: "TLSv1.2" });
    this.publicTlsIdentity = identity;
  }

  markSnapshotDirty(): number {
    this.sourceRevision = Math.max(Date.now(), this.sourceRevision + 1);
    return this.sourceRevision;
  }

  async start(host = "0.0.0.0", port = DEFAULT_LOCAL_COMPANION_PORT): Promise<LocalCompanionServerAddress> {
    if (this.server && this.currentAddress) return this.currentAddress;
    if (this.starting) return this.starting;
    this.starting = this.startListener(host, port).finally(() => { this.starting = null; });
    return this.starting;
  }

  private async startListener(host: string, port: number): Promise<LocalCompanionServerAddress> {
    const handler = (request: IncomingMessage, response: ServerResponse) => {
      void this.handleRequest(request, response);
    };
    let server: Server;
    if (this.options.httpsExperiment !== undefined) {
      // A malformed opt-in must never select plaintext as a fallback.
      if (this.options.httpsExperiment.enabled !== true) throw new Error("local_companion_tls_experiment_required");
      const { privateKeyPem, ...identity } = await this.options.httpsExperiment.identity.load();
      this.httpsServer = createHttpsServer({ key: privateKeyPem, cert: identity.certificatePem, minVersion: "TLSv1.2" }, handler);
      this.publicTlsIdentity = identity;
      server = this.httpsServer;
    } else {
      if (this.options.testOnlyHttp !== true || process.env.NODE_ENV !== "test"
          || !["127.0.0.1", "::1"].includes(host)) {
        throw new Error("local_companion_https_required");
      }
      server = createServer(handler);
    }
    this.server = server;

    try {
      await this.listen(server, host, port);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "EADDRINUSE" || port === 0) {
        this.clearListener();
        throw error;
      }
      desktopLog.warn({
        scope: "local-companion",
        event: "local-companion.port-busy",
        message: "Varsayılan yerel companion portu meşgul; uygun bir port seçiliyor.",
        meta: { port },
        error
      });
      try {
        await this.listen(server, host, 0);
      } catch (retryError) {
        this.clearListener();
        throw retryError;
      }
    }

    const address = server.address() as AddressInfo | null;
    if (!address) {
      this.clearListener();
      server.close();
      throw new Error("Local companion server did not expose a listening address.");
    }
    this.currentAddress = { host, port: address.port, ...(this.httpsServer ? { protocol: "https" as const } : {}) };
    desktopLog.info({
      scope: "local-companion",
      event: "local-companion.server.started",
      message: "Yerel companion sunucusu başlatıldı.",
      meta: { host, port: address.port }
    });
    return this.currentAddress;
  }

  async stop(): Promise<void> {
    this.options.onStopped?.();
    // TLS initialization is async; never leave a listener alive after stop returns.
    try { await this.starting; } catch { /* Startup already failed closed. */ }
    const server = this.server;
    this.clearListener();
    if (!server?.listening) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    desktopLog.info({
      scope: "local-companion",
      event: "local-companion.server.stopped",
      message: "Yerel companion sunucusu durduruldu."
    });
  }

  private clearListener(): void {
    this.server = null;
    this.httpsServer = null;
    this.publicTlsIdentity = null;
    this.currentAddress = null;
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
      if (request.method === "POST" && url.pathname === LOCAL_COMPANION_ENDPOINTS.pointSpendQuote) {
        const denied = () => writeJson(response, 403, { code: "point_spend_quote_denied" });
        const deviceId = headerValue(request, LOCAL_COMPANION_DEVICE_ID_HEADER);
        const token = headerValue(request, LOCAL_COMPANION_TOKEN_HEADER);
        if (this.options.enabled?.() === false || !/^[A-Za-z0-9._:-]{6,120}$/.test(deviceId) || !token
          || !this.options.authorize({ deviceId, token, remoteAddress })) { denied(); return; }
        try {
          const body = await readJsonBody(request);
          if (this.options.enabled?.() === false || !this.options.authorize({ deviceId, token, remoteAddress })
            || Object.keys(body).sort().join(",") !== "customerId,lines"
            || typeof body.customerId !== "string" || !body.customerId || body.customerId !== body.customerId.trim()
            || body.customerId.length > 128 || !Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 200) { denied(); return; }
          const lines: Array<{ productId: string; quantity: number }> = [];
          for (const item of body.lines) {
            const line = objectValue(item);
            if (!line || Object.keys(line).sort().join(",") !== "productId,quantity" || typeof line.productId !== "string"
              || !line.productId || line.productId !== line.productId.trim() || line.productId.length > 128
              || typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0
              || line.quantity > 1_000_000 || Math.abs(line.quantity * 10000 - Math.round(line.quantity * 10000)) > 0.00001) { denied(); return; }
            lines.push({ productId: line.productId, quantity: line.quantity });
          }
          const result = this.options.readPointSpendQuote?.({ deviceId, token, customerId: body.customerId, lines });
          if (!result) { denied(); return; }
          writeJson(response, 200, { lines: result.lines.map(line => ({ productId: line.productId, quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor, currency: line.currency, updatedAt: line.updatedAt })), subtotalMinor: result.subtotalMinor,
          currency: result.currency, availablePointMinor: result.availablePointMinor, maxSpendableMinor: result.maxSpendableMinor,
          generatedAtMs: result.generatedAtMs, expiresAtMs: result.expiresAtMs });
        } catch { denied(); }
        return;
      }
      if (request.method === "POST" && url.pathname === LOCAL_COMPANION_ENDPOINTS.couponAttempt) {
        // The coupon secret may only travel over authenticated TLS. Any other
        // transport, malformed body or failed authorization returns one generic
        // denial without reflecting the code or revealing whether it exists.
        const denied = () => writeJson(response, 403, { code: "coupon_attempt_denied" });
        const secure = this.httpsServer !== null && (request.socket as TLSSocket).encrypted === true;
        const deviceId = headerValue(request, LOCAL_COMPANION_DEVICE_ID_HEADER);
        const token = headerValue(request, LOCAL_COMPANION_TOKEN_HEADER);
        if (!secure || this.options.enabled?.() === false || !/^[A-Za-z0-9._:-]{6,120}$/.test(deviceId) || !token
          || !this.options.authorize({ deviceId, token, remoteAddress })) { denied(); return; }
        try {
          const body = await readJsonBody(request);
          if (!secure || this.options.enabled?.() === false || !this.options.authorize({ deviceId, token, remoteAddress })
            || Object.keys(body).sort().join(",") !== "actionId,couponCode,customerId,lines,paymentMethod"
            || typeof body.actionId !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(body.actionId)
            || typeof body.couponCode !== "string" || !body.couponCode || body.couponCode.length > 256
            || typeof body.customerId !== "string" || !body.customerId || body.customerId !== body.customerId.trim()
            || body.customerId.length > 128
            || typeof body.paymentMethod !== "string" || !body.paymentMethod || body.paymentMethod.length > 64
            || !Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 200) { denied(); return; }
          const lines: Array<{ productId: string; quantity: number }> = [];
          for (const item of body.lines) {
            const line = objectValue(item);
            if (!line || Object.keys(line).sort().join(",") !== "productId,quantity" || typeof line.productId !== "string"
              || !line.productId || line.productId !== line.productId.trim() || line.productId.length > 128
              || typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0
              || line.quantity > 1_000_000 || Math.abs(line.quantity * 10000 - Math.round(line.quantity * 10000)) > 0.00001) { denied(); return; }
            lines.push({ productId: line.productId, quantity: line.quantity });
          }
          const result = this.options.readCouponAttempt?.({ deviceId, token, actionId: body.actionId,
            customerId: body.customerId, lines, couponCode: body.couponCode, paymentMethod: body.paymentMethod });
          if (!result) { denied(); return; }
          writeJson(response, 200, { permitId: result.permitId, expiresAtMs: result.expiresAtMs,
            currency: result.quote.currency, subtotalMinor: result.quote.subtotalMinor,
            discountMinor: result.quote.discountMinor, payableMinor: result.quote.payableMinor });
        } catch { denied(); }
        return;
      }
      if (request.method === "POST" && url.pathname === LOCAL_COMPANION_ENDPOINTS.customerSalePreview) {
        const denied = () => writeJson(response, 403, { code: "customer_sale_preview_denied" });
        const deviceId = headerValue(request, LOCAL_COMPANION_DEVICE_ID_HEADER);
        const token = headerValue(request, LOCAL_COMPANION_TOKEN_HEADER);
        if (this.options.enabled?.() === false || !/^[A-Za-z0-9._:-]{6,120}$/.test(deviceId) || !token
          || !this.options.authorize({ deviceId, token, remoteAddress })) { denied(); return; }
        try {
          const body = await readJsonBody(request);
          const keys = Object.keys(body).sort().join(",");
          if (this.options.enabled?.() === false || !this.options.authorize({ deviceId, token, remoteAddress })
            || (keys !== "lines" && keys !== "customerId,lines")
            || (body.customerId !== undefined && (typeof body.customerId !== "string" || body.customerId !== body.customerId.trim() || body.customerId.length > 128))
            || !Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 200) { denied(); return; }
          const lines: Array<{ productId: string; quantity: number }> = [];
          for (const item of body.lines) {
            const line = objectValue(item);
            if (!line || Object.keys(line).sort().join(",") !== "productId,quantity" || typeof line.productId !== "string"
              || !line.productId || line.productId !== line.productId.trim() || line.productId.length > 128
              || typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0
              || line.quantity > 1_000_000 || Math.abs(line.quantity * 10000 - Math.round(line.quantity * 10000)) > 0.00001) { denied(); return; }
            lines.push({ productId: line.productId, quantity: line.quantity });
          }
          const result = this.options.readCustomerSalePreview?.({ deviceId, token, customerId: typeof body.customerId === "string" ? body.customerId : "", lines });
          if (!result) { denied(); return; }
          writeJson(response, 200, { lines: result.lines.map(line => ({ productId: line.productId, quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor, currency: line.currency, updatedAt: line.updatedAt })),
          subtotalMinor: result.subtotalMinor, currency: result.currency, generatedAtMs: result.generatedAtMs });
        } catch { denied(); }
        return;
      }
      if (request.method === "POST" && url.pathname === LOCAL_COMPANION_ENDPOINTS.benefitsBalance) {
        const denied = () => writeJson(response, 403, { code: "benefits_balance_denied" });
        const deviceId = headerValue(request, LOCAL_COMPANION_DEVICE_ID_HEADER);
        const token = headerValue(request, LOCAL_COMPANION_TOKEN_HEADER);
        if (this.options.enabled?.() === false || !/^[A-Za-z0-9._:-]{6,120}$/.test(deviceId) || !token
          || !this.options.authorize({ deviceId, token, remoteAddress })) { denied(); return; }
        try {
          const body = await readJsonBody(request);
          if (this.options.enabled?.() === false || !this.options.authorize({ deviceId, token, remoteAddress })
            || Object.keys(body).sort().join(",") !== "currency,customerId"
            || typeof body.customerId !== "string" || !body.customerId || body.customerId !== body.customerId.trim()
            || body.customerId.length > 128 || typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency)) {
            denied(); return;
          }
          const result = this.options.readBenefitsBalance?.({ deviceId, token, customerId: body.customerId, currency: body.currency });
          if (!result) { denied(); return; }
          writeJson(response, 200, { availableMinor: result.availableMinor, generatedAtMs: result.generatedAtMs });
        } catch { denied(); }
        return;
      }
      if (request.method === "GET" && url.pathname === LOCAL_COMPANION_ENDPOINTS.status) {
        writeJson(response, 200, {
          ok: true,
          protocol_version: LOCAL_COMPANION_PROTOCOL_VERSION,
          desktop_id: this.options.desktopId(),
          pairing_required: true,
          local_network_enabled: this.options.enabled?.() !== false,
          source_revision: this.sourceRevision
        });
        return;
      }

      if (request.method === "POST" && url.pathname === LOCAL_COMPANION_ENDPOINTS.pair) {
        if (this.options.enabled?.() === false) {
          writeJson(response, 403, {
            ok: false,
            code: "local_network_disabled",
            message: "Yerel ağ bağlantısı masaüstü ayarlarından kapatılmış."
          });
          return;
        }
        if (!this.options.pair) {
          writeJson(response, 503, {
            ok: false,
            code: "pairing_not_configured",
            message: "Yerel cihaz eşleştirmesi henüz yapılandırılmadı."
          });
          return;
        }

        const body = await readJsonBody(request);
        const pairingTicket = stringValue(body.pairing_ticket);
        const deviceId = stringValue(body.device_id);
        const deviceName = stringValue(body.device_name);
        const appVersion = stringValue(body.app_version);
        if (!pairingTicket || !/^[A-Za-z0-9._:-]{6,120}$/.test(deviceId)) {
          writeJson(response, 422, {
            ok: false,
            code: "invalid_pairing_request",
            message: "Yerel eşleştirme isteği eksik veya geçersiz."
          });
          return;
        }

        const result = this.options.pair({
          pairingTicket,
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
        desktopLog.info({
          scope: "local-companion",
          event: "local-companion.device.paired",
          message: "Yerel cihaz eşleştirildi.",
          meta: { deviceId, remoteAddress }
        });
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

      if (this.options.enabled?.() === false) {
        writeJson(response, 403, {
          ok: false,
          code: "local_network_disabled",
          message: "Yerel ağ bağlantısı masaüstü ayarlarından kapatılmış."
        });
        return;
      }

      const deviceId = headerValue(request, LOCAL_COMPANION_DEVICE_ID_HEADER);
      const token = headerValue(request, LOCAL_COMPANION_TOKEN_HEADER);
      if (!/^[A-Za-z0-9._:-]{6,120}$/.test(deviceId) || !token) {
        writeJson(response, 401, { ok: false, code: "local_auth_required", message: "Yerel cihaz doğrulaması gerekli." });
        return;
      }
      if (!this.options.authorize({ deviceId, token, remoteAddress })) {
        desktopLog.warn({
          scope: "local-companion",
          event: "local-companion.auth.rejected",
          message: "Yerel cihaz doğrulaması reddedildi.",
          meta: { deviceId, remoteAddress }
        });
        writeJson(response, 401, { ok: false, code: "local_auth_failed", message: "Yerel cihaz doğrulaması başarısız." });
        return;
      }

      const body = await readJsonBody(request);
      // Lock/settings can change while the request body is arriving.
      if (this.options.enabled?.() === false) {
        writeJson(response, 403, { ok: false, code: "local_network_disabled", message: "Yerel bağlantı kullanılamıyor." });
        return;
      }
      if (!this.options.authorize({ deviceId, token, remoteAddress })) {
        writeJson(response, 401, { ok: false, code: "local_auth_failed", message: "Yerel cihaz doğrulaması başarısız." });
        return;
      }
      if (url.pathname === LOCAL_COMPANION_ENDPOINTS.summary) {
        const snapshot = this.options.createSummary(deviceId);
        const approvalRequired = !snapshot.androidPermissions[deviceId]?.is_active;
        const rawBusinessId = this.options.activeBusinessId?.() ?? "";
        const businessId = typeof rawBusinessId === "string" && rawBusinessId.length <= 128
          && rawBusinessId === rawBusinessId.trim() ? rawBusinessId : "";
        if (this.lastBusinessId !== null && this.lastBusinessId !== businessId) this.markSnapshotDirty();
        this.lastBusinessId = businessId;
        const businessIdentity = !approvalRequired && businessId ? { business_id: businessId } : {};
        const knownRevision = Math.max(0, Number(body.known_server_revision ?? 0) || 0);
        if (!approvalRequired && knownRevision > 0 && knownRevision === this.sourceRevision) {
          writeJson(response, 200, {
            ok: true,
            message: approvalRequired
              ? "Bu cihaz masaüstü onayı bekliyor."
              : "Android verisi yerel ağda zaten güncel.",
            approval_required: approvalRequired,
            not_modified: true,
            ...businessIdentity,
            server_revision: this.sourceRevision,
            pulled_at: new Date().toISOString(),
            pending_action_count: 0,
            // Even unchanged snapshots must refresh the live STT availability gate.
            voice: { stt_available: snapshot.voice?.stt_available === true }
          });
          return;
        }

        writeJson(response, 200, {
          protocol_version: LOCAL_COMPANION_PROTOCOL_VERSION,
          desktop_id: this.options.desktopId(),
          ...businessIdentity,
          ...createLocalAndroidSummaryResponse(
            snapshot,
            this.options.businessInfo(),
            deviceId,
            this.sourceRevision
          )
        });
        return;
      }

      const action = normalizeAction(body, deviceId);
      if (!action) {
        writeJson(response, 422, { ok: false, code: "invalid_action", message: "Telefon işlemi eksik veya geçersiz." });
        return;
      }
      const context = this.httpsServer && (request.socket as TLSSocket).encrypted === true
        ? Object.freeze({}) as LocalCompanionActionContext : undefined;
      if (context) localActionCredentials.set(context, { action, deviceId, token });
      let result: LocalCompanionActionResult;
      try {
        result = this.options.applyAction(action, context);
      } finally {
        if (context) localActionCredentials.delete(context);
      }
      this.markSnapshotDirty();
      // The action may already be committed, but access can change before its ACK.
      if (this.options.enabled?.() === false || !this.options.authorize({ deviceId, token, remoteAddress })) {
        writeJson(response, 403, { ok: false, code: "local_action_forbidden", message: "Yerel bağlantı kullanılamıyor." });
        return;
      }
      const receipt = result.ok && action.action_type === "market_sale_complete"
        ? this.options.readAuthorizedSaleReceipt?.(action, deviceId, token) : undefined;
      writeJson(response, 200, {
        ok: true,
        action_id: action.id,
        status: result.ok ? "applied" : "failed",
        message: result.message,
        error_message: result.ok ? "" : result.message,
        already_applied: result.ok ? Boolean(result.alreadyApplied) : false,
        source_revision: this.sourceRevision,
        ...(receipt ? { sale_receipt: { saleId: receipt.saleId, businessId: receipt.businessId, source: receipt.source,
          customerId: receipt.customerId, cashPaidMinor: receipt.cashPaidMinor, pointsTenderMinor: receipt.pointsTenderMinor,
          discountMinor: receipt.discountMinor ?? 0, currency: receipt.currency, paymentMethod: receipt.paymentMethod } } : {})
      });
    } catch (error) {
      const message = error instanceof Error && error.message === "request_body_too_large"
        ? "Yerel companion isteği çok büyük."
        : "Yerel companion isteği işlenemedi.";
      const status = error instanceof Error && error.message === "request_body_too_large" ? 413 : 400;
      desktopLog.error({
        scope: "local-companion",
        event: "local-companion.request.failed",
        message,
        // JSON parse errors can contain request text, including credentials.
        meta: { status }
      });
      if (!response.headersSent) {
        writeJson(response, status, { ok: false, code: "invalid_request", message });
      } else {
        response.end();
      }
    }
  }
}
