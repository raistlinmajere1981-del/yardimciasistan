import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData, SaveMenuItemInput } from "../../../electron/database";
import type { StatusTone } from "../ui/StatusBadge";

export interface CategoryFormState {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  sort_order: string;
}

export interface ItemFormState {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  image_url: string;
  is_available: boolean;
  is_featured: boolean;
  allergens: string;
  tags: string;
  stock_quantity: string;
  stock_min_quantity: string;
  stock_unit: "piece" | "gram";
  stock_consumption_quantity: string;
  hide_when_out_of_stock: boolean;
  stock_note: string;
  sort_order: string;
}

export function toCategoryForm(category: PublishedMenuCategory | undefined): CategoryFormState {
  if (!category) {
    return emptyCategoryForm(10);
  }

  return {
    id: category.id,
    name: category.name,
    description: category.description,
    is_active: category.is_active,
    sort_order: String(category.sort_order)
  };
}

export function emptyCategoryForm(sortOrder: number): CategoryFormState {
  return {
    id: "",
    name: "",
    description: "",
    is_active: true,
    sort_order: String(sortOrder)
  };
}

export function toItemForm(item: PublishedMenuItem | undefined, fallbackCategoryId: string): ItemFormState {
  if (!item) {
    return emptyItemForm(fallbackCategoryId, 10);
  }

  return {
    id: item.id,
    category_id: item.category_id,
    name: item.name,
    description: item.description,
    price: String(item.price),
    currency: item.currency,
    image_url: item.image_url,
    is_available: item.is_available,
    is_featured: item.is_featured,
    allergens: item.allergens.join(", "),
    tags: item.tags.join(", "),
    stock_quantity: item.stock_quantity == null ? "" : String(item.stock_quantity),
    stock_min_quantity: item.stock_min_quantity == null ? "" : String(item.stock_min_quantity),
    stock_unit: item.stock_unit === "gram" ? "gram" : "piece",
    stock_consumption_quantity: String(item.stock_consumption_quantity > 0 ? item.stock_consumption_quantity : 1),
    hide_when_out_of_stock: Boolean(item.hide_when_out_of_stock),
    stock_note: item.stock_note ?? "",
    sort_order: String(item.sort_order)
  };
}

export function emptyItemForm(categoryId: string, sortOrder: number): ItemFormState {
  return {
    id: "",
    category_id: categoryId,
    name: "",
    description: "",
    price: "0",
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: "",
    tags: "",
    stock_quantity: "",
    stock_min_quantity: "",
    stock_unit: "piece",
    stock_consumption_quantity: "1",
    hide_when_out_of_stock: false,
    stock_note: "",
    sort_order: String(sortOrder)
  };
}

export function itemFormToSaveInput(form: ItemFormState): SaveMenuItemInput {
  return {
    ...(form.id ? { id: form.id } : {}),
    category_id: form.category_id,
    name: form.name,
    description: form.description,
    price: Number(form.price),
    currency: form.currency,
    image_url: form.image_url,
    is_available: form.is_available,
    is_featured: form.is_featured,
    allergens: splitCommaList(form.allergens),
    tags: splitCommaList(form.tags),
    stock_quantity: parseNullableFormNumber(form.stock_quantity),
    stock_min_quantity: parseNullableFormNumber(form.stock_min_quantity),
    stock_unit: form.stock_unit,
    stock_consumption_quantity: parsePositiveFormNumber(form.stock_consumption_quantity, 1),
    hide_when_out_of_stock: form.hide_when_out_of_stock,
    stock_note: form.stock_note.trim() || null,
    sort_order: Number(form.sort_order)
  };
}

export function nextSortOrder(records: Array<{ sort_order: number }>) {
  return records.reduce((highest, record) => Math.max(highest, record.sort_order), 0) + 10;
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNullableFormNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsePositiveFormNumber(value: string, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function findMenuCategoryName(categoryId: string, categories: DesktopDashboardData["menu"]["categories"]) {
  return categories.find((category) => category.id === categoryId)?.name ?? "Kategori yok";
}

export function compareMenuRecords(left: { sort_order: number; name: string }, right: { sort_order: number; name: string }) {
  return left.sort_order - right.sort_order || left.name.localeCompare(right.name, "tr");
}

export function getMenuStockBadge(item: PublishedMenuItem): { label: string; tone: StatusTone } | null {
  if (item.stock_quantity == null) {
    return null;
  }
  if (item.stock_quantity < (item.stock_consumption_quantity > 0 ? item.stock_consumption_quantity : 1)) {
    return { label: "Stokta yok", tone: "danger" };
  }
  if (item.stock_min_quantity !== null && item.stock_quantity <= item.stock_min_quantity) {
    return { label: `Az stok · ${formatStockQuantity(item.stock_quantity, item.stock_unit)}`, tone: "wait" };
  }
  return { label: formatStockQuantity(item.stock_quantity, item.stock_unit), tone: "ok" };
}

export function formatStockQuantity(quantity: number, unit: "piece" | "gram"): string {
  const value = Number.isFinite(quantity) ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(quantity) : "0";
  return `${value} ${stockUnitShortLabel(unit)}`;
}

export function stockUnitShortLabel(unit: "piece" | "gram"): string {
  return unit === "gram" ? "g" : "adet";
}

export function isQrHiddenByStock(item: PublishedMenuItem): boolean {
  return typeof item.stock_quantity === "number"
    && item.hide_when_out_of_stock
    && item.stock_quantity < (item.stock_consumption_quantity > 0 ? item.stock_consumption_quantity : 1);
}

export function resolveMenuPreviewImageUrl(imageUrl: string, webModuleUrl: string) {
  const normalizedImageUrl = imageUrl.trim();
  if (!normalizedImageUrl) {
    return "";
  }
  if (/^(data:image\/|blob:|https?:\/\/)/i.test(normalizedImageUrl)) {
    return normalizedImageUrl;
  }
  try {
    return new URL(normalizedImageUrl, `${webModuleUrl.replace(/\/+$/, "")}/`).toString();
  } catch {
    return normalizedImageUrl;
  }
}

export function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

export function buildMenuPreviewData(
  menu: DesktopDashboardData["menu"],
  categoryForm: CategoryFormState,
  itemForm: ItemFormState
): DesktopDashboardData["menu"] {
  const now = new Date().toISOString();
  const draftCategoryId = categoryForm.id || "__draft_category__";
  const existingCategory = menu.categories.find((category) => category.id === categoryForm.id);
  const shouldIncludeDraftCategory = Boolean(categoryForm.id || categoryForm.name.trim());
  const draftCategory: PublishedMenuCategory = {
    id: draftCategoryId,
    name: categoryForm.name.trim() || "Adsız kategori",
    description: categoryForm.description,
    is_active: categoryForm.is_active,
    sort_order: Number.isFinite(Number(categoryForm.sort_order)) ? Number(categoryForm.sort_order) : 0,
    created_at: existingCategory?.created_at ?? now,
    updated_at: now
  };
  const categories = shouldIncludeDraftCategory
    ? categoryForm.id
      ? menu.categories.map((category) => category.id === categoryForm.id ? draftCategory : category)
      : [...menu.categories, draftCategory]
    : menu.categories;

  const draftItemId = itemForm.id || "__draft_item__";
  const existingItem = menu.items.find((item) => item.id === itemForm.id);
  const shouldIncludeDraftItem = Boolean(itemForm.id || itemForm.name.trim());
  const parsedPrice = Number(itemForm.price);
  const draftItem: PublishedMenuItem = {
    id: draftItemId,
    category_id: itemForm.category_id || (shouldIncludeDraftCategory ? draftCategoryId : categories[0]?.id ?? ""),
    name: itemForm.name.trim() || "Adsız ürün",
    description: itemForm.description,
    price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
    currency: itemForm.currency,
    image_url: itemForm.image_url,
    is_available: itemForm.is_available,
    is_featured: itemForm.is_featured,
    allergens: splitCommaList(itemForm.allergens),
    tags: splitCommaList(itemForm.tags),
    stock_quantity: parseNullableFormNumber(itemForm.stock_quantity),
    stock_min_quantity: parseNullableFormNumber(itemForm.stock_min_quantity),
    stock_unit: itemForm.stock_unit,
    stock_consumption_quantity: parsePositiveFormNumber(itemForm.stock_consumption_quantity, 1),
    hide_when_out_of_stock: itemForm.hide_when_out_of_stock,
    stock_note: itemForm.stock_note.trim() || null,
    sort_order: Number.isFinite(Number(itemForm.sort_order)) ? Number(itemForm.sort_order) : 0,
    created_at: existingItem?.created_at ?? now,
    updated_at: now
  };
  const items = shouldIncludeDraftItem
    ? itemForm.id
      ? menu.items.map((item) => item.id === itemForm.id ? draftItem : item)
      : [...menu.items, draftItem]
    : menu.items;

  return { ...menu, categories, items };
}

export function formatMenuDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
}
