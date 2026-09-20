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

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const TR_MOBILE_PATTERN = /^5\d{9}$/;
const PHONE_ERROR = "Telefon numarası geçerli formatta olmalı. Yurt dışı numaralarında ülke kodunu ekleyin. Örnek: +90 532 123 45 67 veya +44 7911 123456";

export function normalizePhone(phone: string): NormalizePhoneResult {
  const input = phone.trim();
  const compact = normalizePhoneCharacters(input);
  let e164 = "";

  if (compact.startsWith("+")) {
    if (!E164_PATTERN.test(compact)) return invalidPhone(input);
    if (compact.startsWith("+90") && !TR_MOBILE_PATTERN.test(compact.slice(3))) return invalidPhone(input);
    e164 = compact;
  } else {
    const national = toTRNationalNumber(compact);
    if (!national || !TR_MOBILE_PATTERN.test(national)) return invalidPhone(input);
    e164 = `+90${national}`;
  }

  const digits = e164.slice(1);
  return {
    ok: true,
    input,
    e164,
    national: e164.startsWith("+90") ? e164.slice(3) : digits,
    whatsapp: digits
  };
}

export function isValidPhone(phone: string): boolean {
  return normalizePhone(phone).ok;
}

export function isValidTRPhone(phone: string): boolean {
  const result = normalizePhone(phone);
  return result.ok && result.e164.startsWith("+90");
}

export function formatPhoneForDisplay(phone: string): string {
  const result = normalizePhone(phone);
  if (!result.ok) return phone.trim();

  if (result.e164.startsWith("+90") && result.national.length === 10) {
    const part1 = result.national.slice(0, 3);
    const part2 = result.national.slice(3, 6);
    const part3 = result.national.slice(6, 8);
    const part4 = result.national.slice(8, 10);
    return `+90 ${part1} ${part2} ${part3} ${part4}`;
  }

  return result.e164;
}

export function formatPhoneForWhatsApp(phone: string): string {
  const result = normalizePhone(phone);
  return result.ok ? result.whatsapp : "";
}

function normalizePhoneCharacters(input: string): string {
  if (!input || !/^[+\d\s().\/-]+$/.test(input)) return "";
  const compact = input.replace(/[\s().\/-]/g, "");
  return compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
}

function toTRNationalNumber(value: string): string | null {
  if (value.startsWith("90") && value.length === 12) return value.slice(2);
  if (value.startsWith("0") && value.length === 11) return value.slice(1);
  if (value.length === 10) return value;
  return null;
}

function invalidPhone(input: string): InvalidPhone {
  return { ok: false, input, error: PHONE_ERROR };
}
