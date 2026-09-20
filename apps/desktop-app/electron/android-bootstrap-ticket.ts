import { createHmac, randomBytes } from "node:crypto";

export function createAndroidBootstrapTicket(input: {
  syncSecret: string;
  desktopId: string;
  ttlSeconds?: number;
  nowMs?: number;
}): string {
  const syncSecret = String(input.syncSecret ?? "").trim();
  const desktopId = String(input.desktopId ?? "").trim();
  if (!syncSecret) {
    throw new Error("Android kurulum bileti için web güvenlik anahtarı gerekli.");
  }
  if (!/^desktop-[A-Za-z0-9._:-]{8,120}$/.test(desktopId)) {
    throw new Error("Android kurulum bileti için masaüstü kimliği geçersiz.");
  }

  const issuedAt = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const ttlSeconds = Math.max(30, Math.min(input.ttlSeconds ?? 120, 300));
  const payload = {
    v: 1,
    desktop_id: desktopId,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    nonce: randomBytes(16).toString("hex")
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", syncSecret)
    .update(encoded, "utf8")
    .digest("hex");
  return `yab1.${encoded}.${signature}`;
}
