import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { DealerAccessProjection, DealerCatalogProjection, CommerceUnit, CommerceOrderDeliveryMethod } from "@yardimci-asistan/shared";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service";
import { publicImageUrl, publishedOnlineProductRows } from "./commerce-online-catalog-publication";

/** The dealer channel publishes the same products as retail; only authorized prices differ. */
export function createDealerCatalogs(db: DatabaseSync, access: DealerAccessProjection): DealerCatalogProjection[] {
  if (!access.enabled) return [];
  // Unlinked customers have no authenticated web account that could consume a private catalog.
  const linkedDealers = access.dealers.filter(dealer => dealer.enabled && dealer.account_id !== "");
  if (!linkedDealers.length) return [];
  const settings = db.prepare("SELECT business_id, online_sales_delivery_enabled, online_sales_pickup_enabled, online_sales_shipping_enabled FROM settings WHERE deleted_at = '' LIMIT 1").get()!;
  if (Number(settings.online_sales_delivery_enabled) !== 1) return [];
  const businessId = String(settings.business_id);
  const publication = db.prepare("SELECT source_revision FROM sync_outbox_revisions WHERE job_key = 'dealer_access'").get();
  const publicationRevision = Number(publication?.source_revision ?? 0);
  const deliveryMethods: CommerceOrderDeliveryMethod[] = [];
  if (Number(settings.online_sales_pickup_enabled) === 1) deliveryMethods.push("pickup");
  if (Number(settings.online_sales_shipping_enabled) === 1) deliveryMethods.push("shipping");
  if (!deliveryMethods.length) throw new Error("Bayi teslimat ayarları geçersiz.");
  const rows = publishedOnlineProductRows(db, businessId);
  return linkedDealers.map(dealer => {
    const owner = db.prepare("SELECT customer_id FROM customer_web_access WHERE id = ? AND business_id = ?").get(dealer.access_id, businessId)!;
    const products = rows.map(row => {
      const resolved = resolveCommerceProductPriceInDatabase(db, businessId, { productId: String(row.id), customerId: String(owner.customer_id) }, true);
      return { product_id: String(row.id), name: String(row.title_override || row.name), description: String(row.description_override || row.description), sku: String(row.sku),
        category_id: String(row.category_id), category_name: String(row.category_name), brand: String(row.brand),
        unit: String(row.unit) as CommerceUnit, price: resolved.unitPrice, currency: resolved.currency,
        tax_rate: Number(row.tax_rate), image_url: publicImageUrl(row.image_source_url), availability: "available" as const,
        is_featured: Number(row.is_featured) === 1, featured_order: Number(row.featured_order) };
    });
    // Every invalidation renews the hint, including profile changes with identical prices.
    const content = { access_id: dealer.access_id, access_revision: dealer.access_revision, delivery_methods: deliveryMethods, products };
    return { ...content, catalog_revision: createHash("sha256").update(JSON.stringify({ ...content, publicationRevision })).digest("hex") };
  });
}
