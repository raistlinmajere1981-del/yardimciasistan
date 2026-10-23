import { createHash } from "node:crypto";
import type { DealerAccessProjection } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "./database";
import { prepareProductMedia, type ProductMediaPreparation } from "./product-media-publication";
import { publicImageUrl } from "./retail-product-image-projection";
import { uploadPublicResourceMediaFile, type PublicResourceMediaSyncConfig } from "./public-resource-media-publication";

/** Media preparation belongs to the existing dealer_access job, before freezing. */
export async function prepareDealerProductMedia(database: DesktopDatabase, config: PublicResourceMediaSyncConfig,
  revision: number, upload: typeof uploadPublicResourceMediaFile = uploadPublicResourceMediaFile,
  isCurrent: () => boolean = () => true): Promise<ProductMediaPreparation<DealerAccessProjection>> {
  const frozen = database.readPreparedSyncPublication<DealerAccessProjection>("dealer_access_publish", revision);
  if (frozen) return { ok: true, value: frozen };
  const projection = database.createDealerAccessProjection();
  if (!projection.enabled || !projection.catalogs?.length) return { ok: true, value: projection };
  const productIds = [...new Set(projection.catalogs.flatMap(c => c.products.map(p => p.product_id)))];
  const prepared = await prepareProductMedia(database, config, productIds, upload, isCurrent);
  if (!prepared.ok) return prepared;
  return { ok: true, value: { ...projection, catalogs: projection.catalogs.map(catalog => {
    const products = catalog.products.map(product => {
      const fallback = publicImageUrl(product.image_url);
      const urls = prepared.value.get(product.product_id) ?? (fallback ? [fallback] : []);
      return { ...product, image_url: urls[0] ?? "", image_urls: urls };
    });
    return { ...catalog, products, catalog_revision: createHash("sha256").update(JSON.stringify({ previousRevision: catalog.catalog_revision, products })).digest("hex") };
  }) } };
}
