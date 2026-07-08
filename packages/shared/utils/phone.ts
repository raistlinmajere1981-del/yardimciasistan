export interface NormalizedPhone {
  ok: true;
  input: string;
  e164: string;
  national: string;
  whatsapp: string;
}

export interface InvalidPhone {
  ok: false;
  input: string;
  error: string;
}

export type NormalizePhoneResult = NormalizedPhone | InvalidPhone;

const TR_MOBILE_PATTERN = /^5\d{9}$/;
const PHONE_ERROR = "Telefon numarası Türkiye cep telefonu formatında olmalı. Örnek: 05xx xxx xx xx";

export function normalizePhone(phone: string): NormalizePhoneResult {
  const input = phone.trim();
  const digits = input.replace(/[^\d+]/g, "").replace(/^00/, "+");
  const national = toTRNationalNumber(digits);

  if (!national || !TR_MOBILE_PATTERN.test(national)) {
    return {
      ok: false,
      input,
      error: PHONE_ERROR
    };
  }

  return {
    ok: true,
    input,
    e164: `+90${national}`,
    national,
    whatsapp: `90${national}`
  };
}

export function isValidTRPhone(phone: string): boolean {
  return normalizePhone(phone).ok;
}

export function formatPhoneForDisplay(phone: string): string {
  const result = normalizePhone(phone);
  if (!result.ok) {
    return phone.trim();
  }

  const part1 = result.national.slice(0, 3);
  const part2 = result.national.slice(3, 6);
  const part3 = result.national.slice(6, 8);
  const part4 = result.national.slice(8, 10);
  return `+90 ${part1} ${part2} ${part3} ${part4}`;
}

export function formatPhoneForWhatsApp(phone: string): string {
  const result = normalizePhone(phone);
  return result.ok ? result.whatsapp : "";
}

function toTRNationalNumber(value: string): string | null {
  if (value.startsWith("+90")) {
    return value.slice(3);
  }

  if (value.startsWith("90") && value.length === 12) {
    return value.slice(2);
  }

  if (value.startsWith("0") && value.length === 11) {
    return value.slice(1);
  }

  if (value.length === 10) {
    return value;
  }

  return null;
}
