export const BUSINESS_AI_CATALOG_VERSION = 1 as const;

export type BusinessAiCatalogSource = "catalog" | "menu";

export interface BusinessAiCatalogItem {
  id: string;
  source: BusinessAiCatalogSource;
  name: string;
  description: string;
  category: string;
  brand: string;
  barcode: string;
  price: number;
  currency: string;
  unit: string;
  available: boolean;
  featured: boolean;
  tags: string[];
}

export interface BusinessAiCatalog {
  version: typeof BUSINESS_AI_CATALOG_VERSION;
  updatedAt: string;
  items: BusinessAiCatalogItem[];
}

const QUERY_STOP_WORDS = new Set([
  "acaba", "adet", "bakar", "bakar misin", "biliyor", "bir", "bu", "bunu", "da", "de",
  "fiyat", "fiyati", "fiyatı", "fiyati", "fiyatlar", "fiyatlari", "fiyatları", "icin", "için",
  "kac", "kaç", "kadar", "mevcut", "mi", "mı", "mu", "mü", "nedir", "ne", "neler", "olan",
  "olarak", "urun", "ürün", "urunler", "ürünler", "var", "varmi", "varmı", "var mı", "ve"
]);

export function selectRelevantBusinessAiCatalogItems(
  catalog: BusinessAiCatalog,
  query: string,
  limit = 8
): BusinessAiCatalogItem[] {
  const normalizedQuery = normalizeAiCatalogSearchText(query);
  if (!normalizedQuery) return [];

  const queryTokens = tokenizeAiCatalogSearchText(normalizedQuery)
    .filter((token) => !QUERY_STOP_WORDS.has(token));
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const hasBarcodeLikeQuery = /^\d{6,18}$/.test(compactQuery);

  const scored = catalog.items
    .map((item) => {
      const name = normalizeAiCatalogSearchText(item.name);
      const brand = normalizeAiCatalogSearchText(item.brand);
      const category = normalizeAiCatalogSearchText(item.category);
      const description = normalizeAiCatalogSearchText(item.description);
      const tags = normalizeAiCatalogSearchText(item.tags.join(" "));
      const barcode = String(item.barcode ?? "").replace(/\s+/g, "");
      let score = 0;

      if (hasBarcodeLikeQuery && barcode === compactQuery) score += 100;
      if (normalizedQuery === name) score += 80;
      if (normalizedQuery.length >= 3 && name.includes(normalizedQuery)) score += 45;
      if (normalizedQuery.length >= 3 && brand.includes(normalizedQuery)) score += 20;

      for (const token of queryTokens) {
        if (name === token) score += 24;
        else if (name.includes(token)) score += 14;
        if (brand.includes(token)) score += 7;
        if (category.includes(token)) score += 5;
        if (description.includes(token)) score += 3;
        if (tags.includes(token)) score += 3;
        if (barcode && barcode === token) score += 100;
      }

      if (item.featured && score > 0) score += 1;
      if (item.available && score > 0) score += 0.25;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score
      || Number(right.item.featured) - Number(left.item.featured)
      || left.item.name.localeCompare(right.item.name, "tr"));

  return scored.slice(0, Math.max(1, Math.min(20, Math.trunc(limit) || 8))).map(({ item }) => item);
}

export function normalizeAiCatalogSearchText(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9çğıöşü]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeAiCatalogSearchText(value: string): string[] {
  return [...new Set(value.split(" ").map((token) => token.trim()).filter((token) => token.length >= 2))];
}
