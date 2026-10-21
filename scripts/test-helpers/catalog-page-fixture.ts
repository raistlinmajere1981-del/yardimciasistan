import type { CatalogProduct } from "@yardimci-asistan/shared";
import type { CatalogProductPage, ListCatalogProductsOptions } from "../../apps/desktop-app/electron/commerce-store";

/** Small in-browser catalogs only; database pagination assertions use real SQLite. */
export function catalogPageFixture(products: CatalogProduct[], options: ListCatalogProductsOptions = {}): CatalogProductPage {
  const eligible = products.filter(product => (!options.activeOnly || product.isActive)
    && (!options.inventoryOnly || product.trackInventory) && (!options.currency || product.currency === options.currency));
  const counts: CatalogProductPage["counts"] = { total: eligible.length, quickAccess: eligible.filter(product => product.quickAccessEnabled).length, categories: {} };
  for (const product of eligible) counts.categories[product.categoryId] = (counts.categories[product.categoryId] ?? 0) + 1;
  const search = options.search?.trim().toLocaleLowerCase("tr-TR") ?? "";
  const matched = eligible.filter(product => (!options.categoryId || product.categoryId === options.categoryId)
    && (!options.productId || product.id === options.productId) && (!options.quickAccessOnly || product.quickAccessEnabled)
    && (!search || [product.name, product.brand, product.sku, product.barcode].some(value => value?.toLocaleLowerCase("tr-TR").includes(search))));
  const offset = options.offset ?? 0, limit = options.limit ?? 60;
  const items = matched.slice(offset, offset + limit);
  const prices: CatalogProductPage["prices"] = {};
  for (const product of items) prices[product.id] = { productId: product.id, customerId: options.customerId ?? "", unitPrice: product.salePrice, currency: product.currency,
    requestedGroup: "retail", appliedGroup: "retail", fallbackToRetail: false, dealerEligible: false };
  return { revision: JSON.stringify(products), items, total: matched.length, offset, limit, nextOffset: offset + items.length < matched.length ? offset + items.length : null, counts, prices };
}
