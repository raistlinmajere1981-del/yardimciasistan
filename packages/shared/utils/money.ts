/** Canonical Turkish-first money input parsing, formatting and keystroke filtering.
 *
 *  All renderer money/price/amount fields go through this module so that
 *  "125", "125,5", "125,50", "125.50" and pasted "1.250,50" / "125,50 TL"
 *  behave identically everywhere. Anything ambiguous or malformed
 *  ("abc", "12abc", "1,2,3", "1.2.3", "-10", "10,123") is rejected instead
 *  of being silently coerced into a wrong number.
 */

export type MoneyInputStatus = "empty" | "valid" | "invalid";

export interface ParsedMoneyInput {
  status: MoneyInputStatus;
  /** Major units (e.g. 125.5) when status is "valid", otherwise null. */
  major: number | null;
  /** Minor units / kurus (e.g. 12550) when status is "valid", otherwise null. */
  minor: number | null;
}

export const MONEY_INPUT_PLACEHOLDER = "Örn. 125,50";

/** Convert a finite, non-negative major amount to safe integer minor units. */
export function moneyToMinor(amount: number): number {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new Error("Para tutarı geçersiz.");
  }
  const minor = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(minor)) throw new Error("Para tutarı güvenli sınırı aşıyor.");
  return minor;
}

/** Loose editing shape: plain digits with at most one decimal separator and 2 fraction digits. */
const EDITING_PATTERN = /^\d{0,12}([.,]?\d{0,2})?$/;
/** Strict thousand groups, e.g. 1.250.000 */
const THOUSAND_GROUP_PATTERN = /^\d{1,3}(\.\d{3})+$/;
const UNICODE_MINUS_PATTERN = /[−–—]/g;
/** Currency tokens that may surround a pasted amount and can be safely stripped. */
const PASTE_TOKEN_PATTERN = /₺|€|\$|£|try|tl|eur|usd|gbp/i;

function stripPasteTokens(value: string): string {
  return value
    .replace(/[\s\u00a0\u2000-\u200b'’`]/g, "")
    .replace(UNICODE_MINUS_PATTERN, "-")
    .replace(PASTE_TOKEN_PATTERN, "");
}

function toMinor(major: number): number | null {
  const minor = Math.round((major + Number.EPSILON) * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}

function parseCore(integer: string, fraction: string): ParsedMoneyInput {
  const invalid: ParsedMoneyInput = { status: "invalid", major: null, minor: null };
  if (!/^\d*$/.test(integer) || !/^\d*$/.test(fraction)) return invalid;
  if (fraction.length > 2) return invalid;
  if (!integer && !fraction) return invalid;
  const normalizedInteger = integer === "" ? "0" : integer;
  if (normalizedInteger.length > 12) return invalid;
  const paddedFraction = fraction.padEnd(2, "0");
  const minor = Number(`${normalizedInteger}${paddedFraction}`);
  if (!Number.isSafeInteger(minor)) return invalid;
  const major = minor / 100;
  return { status: "valid", major, minor };
}

/** Parse a raw money field value. Never throws. */
export function parseMoneyInput(value: string): ParsedMoneyInput {
  const empty: ParsedMoneyInput = { status: "empty", major: null, minor: null };
  const invalid: ParsedMoneyInput = { status: "invalid", major: null, minor: null };
  const text = value.trim();
  if (!text) return empty;
  const compact = stripPasteTokens(text);
  if (!compact) return empty;
  // Negative amounts are rejected for regular price/amount fields.
  if (compact.includes("-") || compact.includes("+")) return invalid;
  // After removing known currency tokens no letters or symbols may remain.
  if (/[^0-9.,]/.test(compact)) return invalid;

  const dots = (compact.match(/\./g) ?? []).length;
  const commas = (compact.match(/,/g) ?? []).length;

  if (dots > 0 && commas > 0) {
    // Both separators present: only the Turkish grouped form (1.250,50) is
    // accepted. The comma must be the single decimal separator and dots must
    // form strict thousand groups. EN-style "1,250.50" is rejected because a
    // comma is always decimal in this UI.
    const lastDot = compact.lastIndexOf(".");
    const lastComma = compact.lastIndexOf(",");
    if (lastDot > lastComma) return invalid;
    if (commas > 1) return invalid;
    const [head = "", fraction = ""] = compact.split(",");
    if (head !== "" && !/^\d+$/.test(head.replace(/\./g, ""))) return invalid;
    if (head.includes(".") && !THOUSAND_GROUP_PATTERN.test(head)) return invalid;
    return parseCore(head.replace(/\./g, ""), fraction);
  }

  if (commas > 0) {
    // Comma is always the decimal separator; never a thousand separator.
    if (commas > 1) return invalid;
    const [integer = "", fraction = ""] = compact.split(",");
    if (fraction === "") return invalid;
    return parseCore(integer, fraction);
  }

  if (dots === 1) {
    const [integer = "", fraction = ""] = compact.split(".");
    if (fraction === "") return invalid;
    // A single dot with 3 fraction digits is ambiguous (1.250 = 1250 or
    // an invalid 3-decimal amount), so it is rejected instead of guessed.
    if (fraction.length > 2) return invalid;
    return parseCore(integer, fraction);
  }

  if (dots > 1) {
    // Only strict thousand groups without a decimal part (e.g. 1.250.000).
    if (!THOUSAND_GROUP_PATTERN.test(compact)) return invalid;
    return parseCore(compact.replace(/\./g, ""), "");
  }

  return parseCore(compact, "");
}

/** Minor units (kurus) or null when the field is empty or invalid. */
export function parseMoneyToMinor(value: string): number | null {
  return parseMoneyInput(value).minor;
}

/** Major units (e.g. 125.5) or null when the field is empty or invalid. */
export function parseMoneyToMajor(value: string): number | null {
  return parseMoneyInput(value).major;
}

/** True when the field has no meaningful content (lets controlled inputs stay clearable). */
export function isMoneyInputBlank(value: string): boolean {
  const compact = stripPasteTokens(value.trim());
  return compact === "";
}

/**
 * Keystroke filter for controlled money inputs. Returns the next field value,
 * or null when the keystroke must be ignored (letters, signs, symbols,
 * second separator, third decimal digit). Returning null keeps the previous
 * value so garbage like "fsdfdsf0" or "-1" can never enter the field.
 */
export function sanitizeMoneyKeystroke(next: string): string | null {
  if (next === "") return "";
  if (/[^0-9.,]/.test(next)) return null;
  if (!EDITING_PATTERN.test(next)) return null;
  return next;
}

/**
 * Normalize pasted/clipboard text into the plain editing form ("1250,50").
 * Returns null when the pasted text is not a safely interpretable amount,
 * in which case the paste must be ignored rather than guessed.
 */
export function normalizePastedMoneyText(text: string): string | null {
  const parsed = parseMoneyInput(text);
  if (parsed.status !== "valid" || parsed.minor === null) return null;
  const minorText = String(parsed.minor);
  const integer = minorText.slice(0, -2) || "0";
  const fraction = minorText.slice(-2);
  if (fraction === "00") return integer;
  return fraction.endsWith("0") ? `${integer},${fraction[0]}` : `${integer},${fraction}`;
}

function splitMinor(minor: number): { integer: string; fraction: string } {
  const rounded = Math.round(minor);
  const text = String(Math.abs(rounded));
  return { integer: text.slice(0, -2) || "0", fraction: text.slice(-2).padStart(2, "0") };
}

/** Plain Turkish editing form without thousand grouping or symbols ("1250,5"). */
export function formatMinorToInput(minor: number): string {
  if (!Number.isFinite(minor)) return "";
  const { integer, fraction } = splitMinor(minor);
  if (fraction === "00") return integer;
  return fraction.endsWith("0") ? `${integer},${fraction[0]}` : `${integer},${fraction}`;
}

/** Plain Turkish editing form for decimal-major domains ("125,5"). */
export function formatMajorToInput(major: number): string {
  if (typeof major !== "number" || !Number.isFinite(major)) return "";
  const minor = toMinor(Math.max(0, major));
  return minor === null ? "" : formatMinorToInput(minor);
}

/** Read-only display with grouping and currency ("₺1.250,50"). */
export function formatMinorCurrency(minor: number, currency = "TRY"): string {
  if (!Number.isFinite(minor)) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** Read-only display for decimal-major domains ("₺1.250,50"). */
export function formatMajorCurrency(major: number, currency = "TRY"): string {
  if (typeof major !== "number" || !Number.isFinite(major)) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}
