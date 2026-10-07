import {
  formatMajorToInput,
  normalizeBarcodeIdentity,
  parseMoneyToMajor,
  type CatalogCategory,
  type CatalogProduct,
  type CommerceUnit,
  type ProductLookupCandidate
} from "@yardimci-asistan/shared";

export interface ProductFormState {
  id: string;
  categoryId: string;
  name: string;
  brand: string;
  sku: string;
  barcode: string;
  description: string;
  salePrice: string;
  dealerPriceA: string;
  dealerPriceB: string;
  purchasePrice: string;
  currency: string;
  unit: CommerceUnit;
  taxRate: string;
  minimumQuantity: string;
  trackInventory: boolean;
  isActive: boolean;
  quickAccessEnabled: boolean;
  imageSourceUrl: string;
  dataSource: string;
  sourceProductUrl: string;
  dataLicense: string;
  imageLicense: string;
  sourceFetchedAt: string;
}

export const PRODUCT_UNIT_LABELS: Record<CommerceUnit, string> = {
  piece: "Adet",
  kg: "Kilogram",
  g: "Gram",
  l: "Litre",
  ml: "Mililitre",
  pack: "Paket",
  box: "Kutu",
  meter: "Metre",
  other: "Diğer"
};

export function emptyProductForm(inventoryEnabled = true): ProductFormState {
  return {
    id: "",
    categoryId: "",
    name: "",
    brand: "",
    sku: "",
    barcode: "",
    description: "",
    salePrice: "",
    dealerPriceA: "",
    dealerPriceB: "",
    purchasePrice: "",
    currency: "TRY",
    unit: "piece",
    taxRate: "0",
    minimumQuantity: "0",
    trackInventory: inventoryEnabled,
    isActive: true,
    quickAccessEnabled: false,
    imageSourceUrl: "",
    dataSource: "",
    sourceProductUrl: "",
    dataLicense: "",
    imageLicense: "",
    sourceFetchedAt: ""
  };
}

export function toProductForm(
  product: CatalogProduct | null | undefined,
  minimumQuantity: number | string = product?.minimumQuantity ?? 0,
  inventoryEnabled = true
): ProductFormState {
  if (!product) return emptyProductForm(inventoryEnabled);
  return {
    id: product.id,
    categoryId: product.categoryId,
    name: product.name,
    brand: product.brand ?? "",
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    salePrice: formatMajorToInput(product.salePrice),
    dealerPriceA: product.dealerPriceA == null ? "" : formatMajorToInput(product.dealerPriceA),
    dealerPriceB: product.dealerPriceB == null ? "" : formatMajorToInput(product.dealerPriceB),
    purchasePrice: formatMajorToInput(product.purchasePrice),
    currency: product.currency,
    unit: product.unit,
    taxRate: String(product.taxRate),
    minimumQuantity: String(minimumQuantity),
    trackInventory: product.trackInventory,
    isActive: product.isActive,
    quickAccessEnabled: product.quickAccessEnabled ?? false,
    imageSourceUrl: product.imageSourceUrl ?? "",
    dataSource: product.dataSource ?? "",
    sourceProductUrl: product.sourceProductUrl ?? "",
    dataLicense: product.dataLicense ?? "",
    imageLicense: product.imageLicense ?? "",
    sourceFetchedAt: product.sourceFetchedAt ?? ""
  };
}

/** Null when both price fields hold valid non-negative amounts. */
export function validateProductFormPrices(form: ProductFormState): string | null {
  const salePrice = parseMoneyToMajor(form.salePrice);
  if (salePrice === null || salePrice < 0) return "Satış fiyatı için geçerli bir tutar girin (örn. 125,50).";
  for (const [label, value] of [["Bayi A", form.dealerPriceA], ["Bayi B", form.dealerPriceB]] as const) {
    if (!value.trim()) continue;
    const dealerPrice = parseMoneyToMajor(value);
    if (dealerPrice === null || dealerPrice < 0) return `${label} fiyatı için geçerli bir tutar girin veya alanı boş bırakın.`;
  }
  const purchasePrice = parseMoneyToMajor(form.purchasePrice);
  if (purchasePrice === null || purchasePrice < 0) return "Alış fiyatı için geçerli bir tutar girin (örn. 125,50).";
  return null;
}

export function productFormToSaveInput(form: ProductFormState) {
  return {
    id: form.id || undefined,
    categoryId: form.categoryId,
    name: form.name,
    brand: form.brand,
    sku: form.sku,
    barcode: normalizeBarcodeIdentity(form.barcode, 80),
    description: form.description,
    salePrice: parseMoneyToMajor(form.salePrice) ?? 0,
    dealerPriceA: form.dealerPriceA.trim() ? parseMoneyToMajor(form.dealerPriceA) : null,
    dealerPriceB: form.dealerPriceB.trim() ? parseMoneyToMajor(form.dealerPriceB) : null,
    purchasePrice: parseMoneyToMajor(form.purchasePrice) ?? 0,
    currency: form.currency,
    unit: form.unit,
    taxRate: Number(form.taxRate),
    minimumQuantity: Number(form.minimumQuantity),
    trackInventory: form.trackInventory,
    isActive: form.isActive,
    quickAccessEnabled: form.quickAccessEnabled,
    imageSourceUrl: form.imageSourceUrl,
    dataSource: form.dataSource,
    sourceProductUrl: form.sourceProductUrl,
    dataLicense: form.dataLicense,
    imageLicense: form.imageLicense,
    sourceFetchedAt: form.sourceFetchedAt
  };
}

function matchingProductCategoryId(categories: CatalogCategory[], hint: string) {
  const hints = hint
    .split(",")
    .map((value) => value.trim().toLocaleLowerCase("tr-TR"))
    .filter(Boolean);
  if (hints.length === 0) return "";
  return categories.find((category) =>
    category.isActive && hints.includes(category.name.trim().toLocaleLowerCase("tr-TR"))
  )?.id ?? "";
}

export function applyProductLookupCandidate(
  form: ProductFormState,
  candidate: ProductLookupCandidate,
  categories: CatalogCategory[]
): ProductFormState {
  const matchedCategoryId = matchingProductCategoryId(categories, candidate.categoryHint);
  const quantityDescription = candidate.quantity ? `Ambalaj: ${candidate.quantity}` : "";
  return {
    ...form,
    barcode: candidate.barcode,
    name: form.name.trim() ? form.name : candidate.name,
    brand: form.brand.trim() ? form.brand : candidate.brand,
    categoryId: form.categoryId || matchedCategoryId,
    description: form.description.trim() ? form.description : quantityDescription,
    imageSourceUrl: candidate.imageUrl,
    dataSource: candidate.provider,
    sourceProductUrl: candidate.sourceProductUrl,
    dataLicense: candidate.dataLicense,
    imageLicense: candidate.imageLicense,
    sourceFetchedAt: candidate.fetchedAt
  };
}

export function productProviderLabel(provider: string) {
  return provider === "open_food_facts" ? "Open Food Facts" : provider || "Harici kaynak";
}
