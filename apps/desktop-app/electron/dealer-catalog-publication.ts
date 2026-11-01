import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { DealerAccessProjection, DealerCatalogProjection, CommerceUnit, CommerceOrderDeliveryMethod } from "@yardimci-asistan/shared";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service";
import { publicImageUrl } from "./commerce-online-catalog-publication";

/** Called in the access publication read snapshot. Active catalog products are the dealer channel. */
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
  const rows = db.prepare(`SELECT p.id, p.name, p.description, p.sku, p.unit, p.tax_rate, p.image_source_url, p.category_id, p.brand, COALESCE(c.name, '') AS category_name FROM catalog_products p LEFT JOIN catalog_categories c ON c.id = p.category_id AND c.business_id = p.business_id AND c.deleted_at = ''
    WHERE p.business_id = ? AND p.is_active = 1 AND p.deleted_at = '' ORDER BY p.name, p.id`).all(businessId);
  return linkedDealers.map(dealer => {
    const owner = db.prepare("SELECT customer_id FROM customer_web_access WHERE id = ? AND business_id = ?").get(dealer.access_id, businessId)!;
    const products = rows.map(row => {
      const resolved = resolveCommerceProductPriceInDatabase(db, businessId, { productId: String(row.id), customerId: String(owner.customer_id) }, true);
      return { product_id: String(row.id), name: String(row.name), description: String(row.description), sku: String(row.sku),
        category_id: String(row.category_id), category_name: String(row.category_name), brand: String(row.brand),
        unit: String(row.unit) as CommerceUnit, price: resolved.unitPrice, currency: resolved.currency,
        tax_rate: Number(row.tax_rate), image_url: publicImageUrl(row.image_source_url), availability: "available" as const };
    });
    // Every invalidation renews the hint, including profile changes with identical prices.
    const content = { access_id: dealer.access_id, access_revision: dealer.access_revision, delivery_methods: deliveryMethods, products };
    return { ...content, catalog_revision: createHash("sha256").update(JSON.stringify({ ...content, publicationRevision })).digest("hex") };
  });
}
