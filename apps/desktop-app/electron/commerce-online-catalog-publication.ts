import { PublicTranslationStore } from "./database/public-translation-store";
import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type BusinessCapability, type CommerceOnlineCatalog, type CommerceOrderDeliveryMethod, type CommerceUnit } from "@yardimci-asistan/shared";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service";
import { retailProductImageUrls, type RetailProductImageResolver } from "./retail-product-image-projection";

export { publicImageUrl } from "./retail-product-image-projection";

export function createCommerceOnlineCatalog(db: DatabaseSync, capabilities: Iterable<BusinessCapability>, imageResolver?: RetailProductImageResolver): CommerceOnlineCatalog {
  if (!hasBusinessCapability(capabilities, BUSINESS_CAPABILITIES.ONLINE_SALES)) {
    return { version: 1, enabled: false, updatedAt: "", deliveryMethods: [], products: [] };
  }
  // One read snapshot keeps canonical price resolution and publication fields coherent.
  db.exec("SAVEPOINT online_catalog_read");
  try {
    const business = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
    const businessId = String(business?.id ?? "");
    const settings = db.prepare("SELECT online_sales_delivery_enabled, online_sales_pickup_enabled, online_sales_shipping_enabled FROM settings WHERE business_id = ? AND deleted_at = '' LIMIT 1").get(businessId);
    const deliveryEnabled = Number(settings?.online_sales_delivery_enabled) === 1;
    const deliveryMethods: CommerceOrderDeliveryMethod[] = [];
    if (deliveryEnabled && Number(settings?.online_sales_pickup_enabled) === 1) deliveryMethods.push("pickup");
    if (deliveryEnabled && Number(settings?.online_sales_shipping_enabled) === 1) deliveryMethods.push("shipping");
    if (deliveryEnabled && !deliveryMethods.length) throw new Error("Online satış teslimat ayarları geçersiz.");
    const rows = db.prepare(`
      SELECT p.id, p.category_id, p.brand, p.name, p.description, p.sku, p.unit, p.tax_rate, p.image_source_url, p.image_asset_path, p.image_original_assets_json,
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
      const imageUrls = retailProductImageUrls(db, row, imageResolver);
      return {
        categoryId: String(row.category_id), brand: String(row.brand ?? ""), productId: String(row.id), name: String(row.title_override || row.name),
        description: String(row.description_override || row.description), sku: String(row.sku),
        unit: String(row.unit) as CommerceUnit, price: price.unitPrice, currency: price.currency,
        taxRate: Number(row.tax_rate), imageUrl: imageUrls[0] ?? "", imageUrls,
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
    const categories = db.prepare("SELECT c.id,c.name FROM catalog_categories c WHERE c.business_id=? AND c.deleted_at='' AND c.is_active=1 AND EXISTS(SELECT 1 FROM catalog_products p JOIN commerce_product_publications x ON x.product_id=p.id AND x.business_id=c.business_id WHERE p.category_id=c.id AND p.is_active=1 AND p.deleted_at='' AND x.is_published=1 AND x.channel='online_sales') ORDER BY c.sort_order,c.id").all(businessId).map(c => ({id: String(c.id), name: String(c.name)}));
    const localization = new PublicTranslationStore(db).localization([...products.map(p => ({kind: "catalog_product" as const, id: p.productId, fields: {name: p.name, description: p.description}})), ...categories.map(c => ({kind: "catalog_category" as const, id: c.id, fields: {name: c.name}}))]);
    return { version: 1, enabled: true, categories, localization, deliveryMethods, updatedAt: String(timestamp?.updated_at ?? ""), products };
  } finally { db.exec("RELEASE online_catalog_read"); }
}
