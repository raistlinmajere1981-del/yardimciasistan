import { randomBytes } from "node:crypto";
import type { DesktopDatabase } from "./database.js";
import { verifyLocalCompanionPairingTicket } from "./local-companion-ticket.js";

export interface LocalCompanionPairingInput {
  pairingTicket: string;
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

export interface LocalCompanionPairingServiceOptions {
  desktopId: () => string;
  syncSecret: () => string;
  localNetworkEnabled: () => boolean;
}

export class LocalCompanionPairingService {
  private readonly usedTicketNonces = new Map<string, number>();

  constructor(
    private readonly database: DesktopDatabase,
    private readonly options: LocalCompanionPairingServiceOptions
  ) {}

  pair(input: LocalCompanionPairingInput): LocalCompanionPairingResult {
    if (!this.options.localNetworkEnabled()) {
      return {
        ok: false,
        code: "local_network_disabled",
        message: "Yerel ağ bağlantısı masaüstü ayarlarından kapatılmış.",
        statusCode: 403
      };
    }

    const verification = verifyLocalCompanionPairingTicket({
      ticket: input.pairingTicket,
      syncSecret: this.options.syncSecret(),
      desktopId: this.options.desktopId(),
      deviceId: String(input.deviceId ?? "").trim()
    });
    if (!verification.ok) {
      return verification;
    }

    this.clearExpiredNonces();
    if (this.usedTicketNonces.has(verification.nonce)) {
      return {
        ok: false,
        code: "local_pairing_ticket_replayed",
        message: "Yerel eşleştirme bileti daha önce kullanılmış.",
        statusCode: 409
      };
    }
    this.usedTicketNonces.set(verification.nonce, verification.expiresAt);

    const now = new Date().toISOString();
    const deviceId = String(input.deviceId ?? "").trim();
    const registered = this.database.registerPendingLocalAndroidDevice({
      device_id: deviceId,
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
    if (!this.database.storeAndroidLocalCredential(deviceId, token)) {
      return {
        ok: false,
        code: "device_revoked",
        message: "Bu telefon kaldırılmış. Yerel erişim için masaüstünden yeniden yetkilendirin.",
        statusCode: 403
      };
    }

    const pairedDevice = this.database.getAndroidDevices()
      .find((device) => device.deviceId === deviceId);
    const approvalRequired = !pairedDevice?.isActive;
    return {
      ok: true,
      token,
      approvalRequired,
      message: approvalRequired
        ? "Yerel bağlantı hazır; telefon masaüstü onayı bekliyor."
        : "Telefon yerel ağa otomatik bağlandı."
    };
  }

  private clearExpiredNonces() {
    const now = Math.floor(Date.now() / 1000);
    for (const [nonce, expiresAt] of this.usedTicketNonces) {
      if (expiresAt < now) {
        this.usedTicketNonces.delete(nonce);
      }
    }
  }
}
