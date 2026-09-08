import type {
  CatalogCategory,
  CatalogProductDraft,
  CommerceUnit
} from "../types/commerce";

export interface MarketProductDraftCatalogDefaults {
  categoryId: string;
  name: string;
  sku: string;
  barcode: string;
  description: string;
  salePrice: number;
  purchasePrice: number;
  currency: string;
  unit: CommerceUnit;
  taxRate: number;
  minimumQuantity: number;
  trackInventory: boolean;
  isActive: boolean;
  noteReference: string;
}

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

/**
 * Maps a review draft to safe catalog defaults. The note stays a separate
 * reference and is intentionally not copied into the product description.
 */
export function marketProductDraftCatalogDefaults(
  draft: CatalogProductDraft,
  categories: readonly CatalogCategory[],
  options: { inventoryEnabled: boolean; minimumQuantity?: number }
): MarketProductDraftCatalogDefaults {
  return {
    categoryId: findExactActiveMarketCategoryId(categories, draft.proposedCategory),
    name: draft.proposedName,
    sku: draft.sku,
    barcode: draft.barcode,
    description: "",
    salePrice: draft.proposedSalePrice,
    purchasePrice: draft.proposedPurchasePrice,
    currency: draft.currency || "TRY",
    unit: draft.unit,
    taxRate: 0,
    minimumQuantity: Math.max(0, Number(options.minimumQuantity ?? 0) || 0),
    trackInventory: options.inventoryEnabled,
    isActive: true,
    noteReference: draft.note
  };
}
