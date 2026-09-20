import { createHmac, timingSafeEqual } from "node:crypto";

export type LocalCompanionTicketVerification =
  | {
      ok: true;
      desktopId: string;
      deviceId: string;
      issuedAt: number;
      expiresAt: number;
      nonce: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      statusCode: number;
    };

function fail(code: string, message: string, statusCode = 401): LocalCompanionTicketVerification {
  return { ok: false, code, message, statusCode };
}

export function verifyLocalCompanionPairingTicket(input: {
  ticket: string;
  syncSecret: string;
  desktopId: string;
  deviceId: string;
  nowMs?: number;
}): LocalCompanionTicketVerification {
  const ticket = String(input.ticket ?? "").trim();
  const syncSecret = String(input.syncSecret ?? "").trim();
  const expectedDesktopId = String(input.desktopId ?? "").trim();
  const expectedDeviceId = String(input.deviceId ?? "").trim();

  if (!syncSecret || !expectedDesktopId || !expectedDeviceId) {
    return fail("local_pairing_unavailable", "Yerel eşleştirme doğrulaması hazır değil.", 503);
  }

  const parts = ticket.split(".");
  if (parts.length !== 3 || parts[0] !== "yalp1") {
    return fail("local_pairing_ticket_invalid", "Yerel eşleştirme bileti geçersiz.");
  }

  const encodedPayload = parts[1];
  const suppliedSignature = parts[2].toLowerCase();
  if (!encodedPayload || !/^[a-f0-9]{64}$/.test(suppliedSignature)) {
    return fail("local_pairing_ticket_invalid", "Yerel eşleştirme bileti geçersiz.");
  }

  const expectedSignature = createHmac("sha256", syncSecret)
    .update(encodedPayload, "utf8")
    .digest("hex");
  const suppliedBuffer = Buffer.from(suppliedSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (
    suppliedBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return fail("local_pairing_ticket_invalid", "Yerel eşleştirme bileti doğrulanamadı.");
  }

  let payload: Record<string, unknown>;
  try {
    const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("local_pairing_ticket_invalid", "Yerel eşleştirme bileti okunamadı.");
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return fail("local_pairing_ticket_invalid", "Yerel eşleştirme bileti okunamadı.");
  }

  const version = Number(payload.v ?? 0);
  const desktopId = String(payload.desktop_id ?? "").trim();
  const deviceId = String(payload.device_id ?? "").trim();
  const issuedAt = Number(payload.iat ?? 0);
  const expiresAt = Number(payload.exp ?? 0);
  const nonce = String(payload.nonce ?? "").trim();

  if (
    version !== 1
    || desktopId !== expectedDesktopId
    || deviceId !== expectedDeviceId
    || !Number.isInteger(issuedAt)
    || !Number.isInteger(expiresAt)
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > 300
    || !/^[a-f0-9]{32}$/.test(nonce)
  ) {
    return fail("local_pairing_ticket_invalid", "Yerel eşleştirme bileti bu cihaz veya masaüstü için geçerli değil.");
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (issuedAt > nowSeconds + 30) {
    return fail("local_pairing_ticket_invalid", "Yerel eşleştirme biletinin zamanı geçersiz.");
  }
  if (expiresAt < nowSeconds) {
    return fail("local_pairing_ticket_expired", "Yerel eşleştirme biletinin süresi dolmuş.");
  }

  return {
    ok: true,
    desktopId,
    deviceId,
    issuedAt,
    expiresAt,
    nonce
  };
}
