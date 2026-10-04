import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type BusinessCapability, type CommerceOnlineCatalog, type CommerceOrderDeliveryMethod, type CommerceUnit } from "@yardimci-asistan/shared";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service";

export function publicImageUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    // A2 does not publish local media. Project only public HTTPS source images;
    // credentials, query parameters and local/private hosts never leave Desktop.
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
        || !url.hostname.includes(".") || /^[\d.:[\]]+$/.test(url.hostname)
        || /\.(local|localhost|internal|test)$/.test(url.hostname)) return "";
    return url.href;
  } catch { return ""; }
}

export function createCommerceOnlineCatalog(db: DatabaseSync, capabilities: Iterable<BusinessCapability>): CommerceOnlineCatalog {
  if (!hasBusinessCapability(capabilities, BUSINESS_CAPABILITIES.ONLINE_SALES)) {
    return { version: 1, enabled: false, updatedAt: "", deliveryMethods: [], products: [] };
  }
  // One read snapshot keeps canonical price resolution and publication fields coherent.
  db.exec("SAVEPOINT online_catalog_read");
  try {
    const business = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
    const businessId = String(business?.id ?? "");
    const settings = db.prepare("SELECT online_sales_pickup_enabled, online_sales_shipping_enabled FROM settings WHERE business_id = ? AND deleted_at = '' LIMIT 1").get(businessId);
    const deliveryMethods: CommerceOrderDeliveryMethod[] = [];
    if (Number(settings?.online_sales_pickup_enabled) === 1) deliveryMethods.push("pickup");
    if (Number(settings?.online_sales_shipping_enabled) === 1) deliveryMethods.push("shipping");
    if (!deliveryMethods.length) throw new Error("Online satış teslimat ayarları geçersiz.");
    const rows = db.prepare(`
      SELECT p.id, p.name, p.description, p.sku, p.unit, p.tax_rate, p.image_source_url,
             p.updated_at AS product_updated_at, publication.title_override,
             publication.description_override, publication.sort_order, publication.updated_at
      FROM commerce_product_publications publication
      JOIN catalog_products p ON p.id = publication.product_id AND p.business_id = publication.business_id
      WHERE publication.business_id = ? AND publication.channel = 'online_sales'
        AND publication.is_published = 1 AND p.is_active = 1 AND p.deleted_at = ''
      ORDER BY publication.sort_order, p.name, p.id
    `).all(businessId);
    const products = rows.map((row) => {
      const price = resolveCommerceProductPriceInDatabase(db, businessId, { productId: String(row.id) }, false);
      return {
        productId: String(row.id), name: String(row.title_override || row.name),
        description: String(row.description_override || row.description), sku: String(row.sku),
        unit: String(row.unit) as CommerceUnit, price: price.unitPrice, currency: price.currency,
        taxRate: Number(row.tax_rate), imageUrl: publicImageUrl(row.image_source_url),
        availability: "available" as const, sortOrder: Number(row.sort_order)
      };
    });
    // Include unpublished/inactive changes too, so removing the last product has a stable timestamp.
    const timestamp = db.prepare(`
      SELECT MAX(updated_at) AS updated_at FROM (
        SELECT updated_at FROM catalog_products WHERE business_id = ?
        UNION ALL SELECT updated_at FROM commerce_product_publications WHERE business_id = ?
        UNION ALL SELECT updated_at FROM settings WHERE business_id = ? AND deleted_at = ''
        UNION ALL SELECT updated_at FROM business_capabilities WHERE business_id = ? AND capability_id = 'channel.online_sales'
      )
    `).get(businessId, businessId, businessId, businessId);
    return { version: 1, enabled: true, deliveryMethods, updatedAt: String(timestamp?.updated_at ?? ""), products };
  } finally { db.exec("RELEASE online_catalog_read"); }
}
