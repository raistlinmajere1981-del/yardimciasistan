import { randomBytes, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { DesktopDatabase } from "./database.js";

export interface LocalCompanionPairingInput {
  pairingTicket: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
}

/** Trusted desktop renderer only. Never include this in LAN status or diagnostics. */
export interface LocalCompanionPairingSession {
  credential: string;
  desktopId: string;
  deviceId: string;
  expiresAt: number;
  /** Trusted UI only: explicit LAN endpoint for QR pairing without mDNS. */
  endpoint?: string;
  /** SHA-256 SPKI from the active S1 listener identity; never supplied by discovery. */
  spkiSha256?: string;
}

type PairingFailure = { ok: false; code: string; message: string; statusCode: number };
export type LocalCompanionPairingResult =
  | { ok: true; token: string; approvalRequired: boolean; message: string }
  | PairingFailure;

export interface LocalCompanionPairingServiceOptions {
  desktopId: () => string;
  isLocked: () => boolean;
  androidEnabled: () => boolean;
  localNetworkEnabled: () => boolean;
  monotonicNow?: () => number;
}

const SESSION_TTL_MS = 120_000;
const MAX_FAILED_ATTEMPTS = 5;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{6,120}$/;

export class LocalCompanionPairingService {
  private session: (LocalCompanionPairingSession & { deadline: number; failures: number }) | null = null;

  constructor(
    private readonly database: DesktopDatabase,
    private readonly options: LocalCompanionPairingServiceOptions
  ) {}

  begin(deviceIdInput: unknown = ""): LocalCompanionPairingSession {
    const blocked = this.checkAccess();
    if (blocked) throw new Error(blocked.message);
    const deviceId = typeof deviceIdInput === "string" ? deviceIdInput.trim() : "";
    const desktopId = this.options.desktopId();
    if ((deviceId && !DEVICE_ID_PATTERN.test(deviceId)) || !desktopId) {
      throw new Error("Eşleştirme için geçerli masaüstü kimliği ve varsa telefon kimliği gerekli.");
    }
    this.session = {
      credential: `yald1.${randomBytes(32).toString("hex")}`,
      desktopId,
      deviceId,
      expiresAt: Date.now() + SESSION_TTL_MS,
      deadline: this.now() + SESSION_TTL_MS,
      failures: 0
    };
    return this.read()!;
  }

  read(): LocalCompanionPairingSession | null {
    if (this.checkAccess()) return null;
    const session = this.currentSession();
    if (!session) return null;
    const { credential, desktopId, deviceId, expiresAt } = session;
    return { credential, desktopId, deviceId, expiresAt };
  }

  cancel(): void {
    this.session = null;
  }

  pair(input: LocalCompanionPairingInput): LocalCompanionPairingResult {
    const blocked = this.checkAccess();
    if (blocked) return blocked;
    const session = this.currentSession();
    if (!session) {
      return this.fail("local_pairing_session_closed", "Masaüstünden yeni bir eşleştirme başlatın.");
    }
    const deviceId = String(input.deviceId ?? "").trim();
    const ticket = String(input.pairingTicket ?? "").trim();
    const supplied = Buffer.from(ticket, "utf8");
    const expected = Buffer.from(session.credential, "utf8");
    const credentialMatches = supplied.length === expected.length && timingSafeEqual(supplied, expected);
    if (!DEVICE_ID_PATTERN.test(deviceId) || (session.deviceId !== "" && deviceId !== session.deviceId) || !credentialMatches) {
      session.failures += 1;
      if (session.failures >= MAX_FAILED_ATTEMPTS) this.cancel();
      return this.fail("local_pairing_credential_invalid", "Eşleştirme bilgisi bu telefon için geçerli değil.");
    }

    // Synchronous consumption before any domain write: two requests cannot both
    // claim a session. Failures also require a fresh explicit desktop begin.
    this.cancel();
    if (this.database.getAndroidDevices().some(device => device.deviceId === deviceId && device.revokedAt)) {
      return this.fail("device_revoked", "Bu telefon kaldırılmış. Yerel erişim için masaüstünden yeniden yetkilendirin.", 403);
    }
    const now = new Date().toISOString();
    const registered = this.database.registerPendingLocalAndroidDevice({
      device_id: deviceId,
      device_name: String(input.deviceName ?? "").trim(),
      app_version: String(input.appVersion ?? "").trim(),
      first_seen_at: now,
      last_seen_at: now
    });
    if (!registered) return this.fail("device_invalid", "Telefon kimliği geçersiz.", 422);

    const token = `yal_${randomBytes(32).toString("hex")}`;
    if (!this.database.storeAndroidLocalCredential(deviceId, token)) {
      return this.fail("device_revoked", "Bu telefon kaldırılmış. Yerel erişim için masaüstünden yeniden yetkilendirin.", 403);
    }
    const pairedDevice = this.database.getAndroidDevices().find((device) => device.deviceId === deviceId);
    const approvalRequired = !pairedDevice?.isActive;
    return {
      ok: true,
      token,
      approvalRequired,
      message: approvalRequired
        ? "Yerel bağlantı hazır; telefon masaüstü onayı bekliyor."
        : "Telefon yerel ağa bağlandı."
    };
  }

  private now(): number {
    return this.options.monotonicNow?.() ?? performance.now();
  }

  private currentSession() {
    if (this.session && (this.now() >= this.session.deadline || this.session.desktopId !== this.options.desktopId())) {
      this.cancel();
    }
    return this.session;
  }

  private checkAccess(): PairingFailure | null {
    let blocked: PairingFailure | null = null;
    if (this.options.isLocked()) {
      blocked = this.fail("app_locked", "Eşleştirme için uygulama kilidini açın.", 403);
    } else if (!this.options.androidEnabled()) {
      blocked = this.fail("android_capability_disabled", "Android bağlantısı bu işletmede etkin değil.", 403);
    } else if (!this.options.localNetworkEnabled()) {
      blocked = this.fail("local_network_disabled", "Yerel ağ bağlantısı masaüstü ayarlarından kapatılmış.", 403);
    }
    if (blocked) this.cancel();
    return blocked;
  }

  private fail(code: string, message: string, statusCode = 401): PairingFailure {
    return { ok: false, code, message, statusCode };
  }

}
