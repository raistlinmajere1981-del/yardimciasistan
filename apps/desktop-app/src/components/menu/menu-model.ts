import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";
import { formatMajorToInput, parseMoneyToMajor, type CommerceUnit } from "@yardimci-asistan/shared";
import type { DesktopDashboardData, SaveMenuProductEntryInput } from "../../../electron/database";
import type { StatusTone } from "../ui/StatusBadge";

export interface CategoryFormState {
  id: string; name: string; description: string; is_active: boolean; sort_order: string;
}
/** Only channel state. Canonical fields use ProductFormState / ProductWorkspace. */
export interface ItemFormState {
  id: string; product_id: string; category_id: string; price_override: string;
  is_available: boolean; is_featured: boolean; allergens: string; tags: string;
  stock_consumption_quantity: string; hide_when_out_of_stock: boolean; sort_order: string;
}
export function emptyCategoryForm(sortOrder: number): CategoryFormState {
  return { id: "", name: "", description: "", is_active: true, sort_order: String(sortOrder) };
}
export function toCategoryForm(category: PublishedMenuCategory | undefined): CategoryFormState {
  return category ? { ...category, sort_order: String(category.sort_order) } : emptyCategoryForm(10);
}
export function emptyItemForm(categoryId: string, sortOrder: number): ItemFormState {
  return { id: "", product_id: "", category_id: categoryId, price_override: "", is_available: true,
    is_featured: false, allergens: "", tags: "", stock_consumption_quantity: "1", hide_when_out_of_stock: false,
    sort_order: String(sortOrder) };
}
export function toItemForm(item: PublishedMenuItem | undefined, fallbackCategoryId: string): ItemFormState {
  return item ? { id: item.id, product_id: item.product_id ?? "", category_id: item.category_id,
    price_override: item.price_override == null ? "" : formatMajorToInput(item.price_override),
    is_available: item.is_available, is_featured: item.is_featured, allergens: item.allergens.join(", "),
    tags: item.tags.join(", "), stock_consumption_quantity: String(item.stock_consumption_quantity),
    hide_when_out_of_stock: item.hide_when_out_of_stock, sort_order: String(item.sort_order) }
    : emptyItemForm(fallbackCategoryId, 10);
}
export function validateItemFormPrice(form: ItemFormState): string | null {
  if (!form.price_override.trim()) return null;
  const price = parseMoneyToMajor(form.price_override);
  return price === null || price < 0 ? "Menü fiyatı için geçerli bir tutar girin veya alanı boş bırakın." : null;
}
function splitCommaList(value: string) { return value.split(",").map(item => item.trim()).filter(Boolean); }
export function itemFormToSaveInput(form: ItemFormState): SaveMenuProductEntryInput {
  return { id: form.id || undefined, product_id: form.product_id || undefined, category_id: form.category_id,
    price_override: form.price_override.trim() ? parseMoneyToMajor(form.price_override) : null,
    is_available: form.is_available, is_featured: form.is_featured, allergens: splitCommaList(form.allergens),
    tags: splitCommaList(form.tags), stock_consumption_quantity: Number(form.stock_consumption_quantity.replace(",", ".")),
    hide_when_out_of_stock: form.hide_when_out_of_stock, sort_order: Number(form.sort_order) };
}
export function nextSortOrder(records: Array<{ sort_order: number }>) {
  return records.reduce((highest, record) => Math.max(highest, record.sort_order), 0) + 10;
}
export function findMenuCategoryName(categoryId: string, categories: DesktopDashboardData["menu"]["categories"]) {
  return categories.find(category => category.id === categoryId)?.name ?? "Kategori yok";
}
export function compareMenuRecords(left: { sort_order: number; name: string }, right: { sort_order: number; name: string }) {
  return left.sort_order - right.sort_order || left.name.localeCompare(right.name, "tr");
}
export function stockUnitShortLabel(unit: CommerceUnit): string { return unit === "piece" ? "adet" : unit; }
export function getMenuStockBadge(item: PublishedMenuItem): { label: string; tone: StatusTone } | null {
  if (item.stock_quantity == null) return null;
  if (item.stock_quantity < item.stock_consumption_quantity) return { label: "Stokta yok", tone: "danger" };
  const label = `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 4 }).format(item.stock_quantity)} ${stockUnitShortLabel(item.stock_unit)}`;
  return { label: item.stock_min_quantity !== null && item.stock_quantity <= item.stock_min_quantity ? `Az stok · ${label}` : label,
    tone: item.stock_min_quantity !== null && item.stock_quantity <= item.stock_min_quantity ? "warning" : "success" };
}
export function isQrHiddenByStock(item: PublishedMenuItem): boolean {
  return item.stock_quantity !== null && item.hide_when_out_of_stock && item.stock_quantity < item.stock_consumption_quantity;
}
export function resolveMenuPreviewImageUrl(imageUrl: string, webModuleUrl: string) {
  const value = imageUrl.trim();
  if (!value || /^(data:image\/|blob:|https?:\/\/)/i.test(value)) return value;
  try { return new URL(value, `${webModuleUrl.replace(/\/+$/, "")}/`).toString(); } catch { return value; }
}
export function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
export function buildMenuPreviewData(menu: DesktopDashboardData["menu"], categoryForm: CategoryFormState, _itemForm: ItemFormState) {
  // Prices and product presentation are always the last backend projection, not renderer calculations.
  return { ...menu, categories: menu.categories.map(category => category.id === categoryForm.id
    ? { ...category, ...categoryForm, sort_order: Number(categoryForm.sort_order) } : category) };
}
export function formatMenuDateTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp)) : value;
}
