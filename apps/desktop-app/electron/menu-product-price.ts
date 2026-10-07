/** Menu pricing is channel-specific; commerce keeps its own canonical resolver. */
export function resolveMenuProductPrice(product: { sale_price: unknown }, entry: { price_override: unknown }): number {
  const value = Number(entry.price_override ?? product.sale_price);
  if (!Number.isFinite(value) || value < 0) throw new Error("Menü fiyatı geçersiz.");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
