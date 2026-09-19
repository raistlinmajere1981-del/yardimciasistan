import type { CatalogCategory } from "../types/commerce";

/** Exact, Unicode-safe comparison key; it does not remove accents or invent aliases. */
export function normalizeMarketCategoryName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr-TR");
}

export function findExactActiveMarketCategoryId(
  categories: readonly CatalogCategory[],
  proposedCategory: unknown
): string {
  const expected = normalizeMarketCategoryName(proposedCategory);
  if (!expected) return "";
  return categories.find((category) => (
    category.isActive && normalizeMarketCategoryName(category.name) === expected
  ))?.id ?? "";
}
