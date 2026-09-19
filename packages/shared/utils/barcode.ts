/**
 * Canonicalizes human-entered numeric barcodes without damaging genuinely
 * alphanumeric barcode payloads. Numeric values may be pasted or typed with
 * spaces, hyphens or other visual separators; those separators are discarded.
 */
export function normalizeBarcodeIdentity(value: unknown, maximumLength = 80): string {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  if (!cleaned) return "";

  const hasAsciiDigit = /[0-9]/.test(cleaned);
  const hasLetter = /\p{L}/u.test(cleaned);
  const normalized = hasAsciiDigit && !hasLetter
    ? cleaned.replace(/[^0-9]/g, "")
    : cleaned;

  return normalized.slice(0, Math.max(1, Math.trunc(maximumLength) || 80));
}
