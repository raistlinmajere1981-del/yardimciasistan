/** Convert a finite, non-negative major amount to safe integer minor units. */
export function moneyToMinor(amount: number): number {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new Error("Para tutarı geçersiz.");
  }
  const minor = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(minor)) throw new Error("Para tutarı güvenli sınırı aşıyor.");
  return minor;
}
