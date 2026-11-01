import type { LocalCompanionPairingSession } from "../../../electron/local-companion-pairing-service";
import { createSecurePairingQrSvg } from "./secure-pairing-qr-code";

export function localPairingPayload(session: LocalCompanionPairingSession): string {
  if (!/^desktop-[A-Za-z0-9._:-]{8,120}$/.test(session.desktopId)
      || !/^yald1\.[a-f0-9]{64}$/.test(session.credential)) {
    throw new Error("Eşleştirme bilgisi geçersiz.");
  }
  const endpoint = session.endpoint ?? "";
  const match = /^https:\/\/((?:[0-9]{1,3}\.){3}[0-9]{1,3}):([1-9][0-9]{0,4})$/.exec(endpoint);
  const octets = match?.[1]?.split(".").map(Number) ?? [];
  const [a, b] = octets;
  if (!match || octets.some((part, i) => part > 255 || String(part) !== match[1]!.split(".")[i])
      || Number(match[2]) > 65535
      || !(a === 10 || a === 192 && b === 168 || a === 172 && b! >= 16 && b! <= 31)) {
    throw new Error("Güvenli eşleştirme için özel IPv4 HTTPS adresi gerekli.");
  }
  const pin = session.spkiSha256 ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(pin)
      || btoa(atob(pin.replace(/-/g, "+").replace(/_/g, "/"))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_") !== pin) {
    throw new Error("Güvenli eşleştirme için TLS kimliği gerekli.");
  }
  const hex = session.credential.slice(6);
  const raw = hex.match(/.{2}/g)!.map((part) => parseInt(part, 16));
  const shortSecret = btoa(String.fromCharCode(...raw)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payload = `yapair3|${session.desktopId}|${shortSecret}|${endpoint.slice(8)}|${pin}`;
  if (new TextEncoder().encode(payload).length > 271) {
    throw new Error("Masaüstü kimliği QR kapasitesini aşıyor.");
  }
  return payload;
}

export function localPairingQr(session: LocalCompanionPairingSession): string {
  return createSecurePairingQrSvg(localPairingPayload(session));
}
