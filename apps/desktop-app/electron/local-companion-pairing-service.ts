import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DesktopDatabase } from "./database.js";

const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;

export interface LocalCompanionPairingSession {
  pairingSecret: string;
  expiresAt: string;
}

export interface LocalCompanionPairingInput {
  pairingSecret: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
}

export type LocalCompanionPairingResult =
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

interface ActivePairingSession {
  secretHash: Buffer;
  expiresAtMs: number;
}

function hashSecret(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export class LocalCompanionPairingService {
  private activeSession: ActivePairingSession | null = null;

  constructor(private readonly database: DesktopDatabase) {}

  begin(ttlMs = DEFAULT_PAIRING_TTL_MS): LocalCompanionPairingSession {
    const safeTtl = Math.max(30_000, Math.min(ttlMs, 15 * 60 * 1000));
    const pairingSecret = randomBytes(24).toString("base64url");
    const expiresAtMs = Date.now() + safeTtl;
    this.activeSession = {
      secretHash: hashSecret(pairingSecret),
      expiresAtMs
    };
    return {
      pairingSecret,
      expiresAt: new Date(expiresAtMs).toISOString()
    };
  }

  cancel() {
    this.activeSession = null;
  }

  pair(input: LocalCompanionPairingInput): LocalCompanionPairingResult {
    const session = this.activeSession;

    if (!session || Date.now() > session.expiresAtMs) {
      this.activeSession = null;
      return {
        ok: false,
        code: "pairing_expired",
        message: "Yerel eşleştirme kodunun süresi dolmuş.",
        statusCode: 401
      };
    }

    const suppliedHash = hashSecret(String(input.pairingSecret ?? "").trim());
    if (suppliedHash.length !== session.secretHash.length || !timingSafeEqual(suppliedHash, session.secretHash)) {
      return {
        ok: false,
        code: "pairing_secret_invalid",
        message: "Yerel eşleştirme kodu geçersiz.",
        statusCode: 401
      };
    }

    // A valid code is consumed before any database mutation. Failed guesses do
    // not let another LAN peer cancel the user's pairing window.
    this.activeSession = null;

    const now = new Date().toISOString();
    const registered = this.database.registerPendingLocalAndroidDevice({
      device_id: String(input.deviceId ?? "").trim(),
      device_name: String(input.deviceName ?? "").trim(),
      app_version: String(input.appVersion ?? "").trim(),
      first_seen_at: now,
      last_seen_at: now
    });
    if (!registered) {
      return {
        ok: false,
        code: "device_invalid",
        message: "Telefon kimliği geçersiz.",
        statusCode: 422
      };
    }

    const token = `yal_${randomBytes(32).toString("hex")}`;
    if (!this.database.storeAndroidLocalCredential(input.deviceId, token)) {
      return {
        ok: false,
        code: "device_revoked",
        message: "Bu telefon kaldırılmış. Yeniden eşleştirmeden önce masaüstünden tekrar etkinleştirin.",
        statusCode: 403
      };
    }

    const pairedDevice = this.database.getAndroidDevices()
      .find((device) => device.deviceId === String(input.deviceId ?? "").trim());
    const approvalRequired = !pairedDevice?.isActive;
    return {
      ok: true,
      token,
      approvalRequired,
      message: approvalRequired
        ? "Telefon eşleştirildi ve masaüstü onayı bekliyor."
        : "Telefon yerel ağ için eşleştirildi."
    };
  }
}
