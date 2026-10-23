import path from "node:path";
import { createHash } from "node:crypto";
import { Transformer } from "@napi-rs/image";
import type { CommerceOnlineCatalog } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "./database";
import { assertProductAssetPath, readProductImageBytes } from "./product-image-reader";
import { productImageFormat } from "./product-image-codec";
import { productMediaPublicUrl } from "./product-media-publication-store";
import { publicImageUrl } from "./retail-product-image-projection";
import { uploadPublicResourceMediaFile, type PublicResourceMediaSyncConfig } from "./public-resource-media-publication";

export type ProductMediaPreparation<T> = { ok: true; value: T } | { ok: false; message: string; status?: number };
// Coalesce only simultaneous uploads. SQLite target/product/hash acknowledgements
// remain the durable authority across channels, retries and process restarts.
const inFlight = new WeakMap<DesktopDatabase, Map<string, Promise<string>>>();

/** Both channels prepare media before freezing their existing outbox revision.
 * Every referenced original must be readable and verified, including the cover.
 * Failing the complete gallery prevents silent cover promotion/partial success. */
export async function prepareProductMedia(database: DesktopDatabase, config: PublicResourceMediaSyncConfig,
  productIds: readonly string[], upload: typeof uploadPublicResourceMediaFile = uploadPublicResourceMediaFile,
  isCurrent: () => boolean = () => true
): Promise<ProductMediaPreparation<Map<string, string[]>>> {
  const media = new Map<string, string[]>();
  const target = config.baseUrl.trim().replace(/\/+$/, "");
  try {
    for (const product of database.getProductImageArchives(productIds)) {
      const urls: string[] = [], hashes = new Set<string>();
      for (const asset of product.paths) {
        if (!isCurrent()) throw new Error("product_media_revision_changed");
        if (!publicImageUrl(target) || !asset.path.startsWith(`assets/products/${product.productId}/`)) throw new Error("invalid_product_media");
        const absolute = assertProductAssetPath(database.databasePath, asset.path);
        const bytes = readProductImageBytes(database.databasePath, asset.path);
        const mimeType = productImageFormat(bytes);
        const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
        const fileExtension = path.extname(absolute).toLowerCase();
        if ((asset.format && asset.format !== mimeType) || ![`.${extension}`, ...(extension === "jpg" ? [".jpeg"] : [])].includes(fileExtension)) throw new Error("invalid_product_media_type");
        const decoder = new Transformer(bytes);
        const bounds = decoder.metadataSync();
        if (bounds.width <= 0 || bounds.height <= 0 || bounds.width * bounds.height > 25_000_000) throw new Error("invalid_product_media_bounds");
        decoder.pngSync(); // Decode as well as sniffing; truncated/corrupt originals fail locally.
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (asset.hash && asset.hash !== hash) throw new Error("invalid_product_media_hash");
        if (hashes.has(hash)) continue;
        hashes.add(hash);
        let url = database.getPublishedProductImage(product.productId, hash, target);
        if (!url) {
          let pending = inFlight.get(database);
          if (!pending) { pending = new Map(); inFlight.set(database, pending); }
          const key = JSON.stringify([target, product.productId, hash]);
          let transfer = pending.get(key);
          if (!transfer) {
            transfer = (async () => {
              const result = await upload({ ...config, baseUrl: target }, database.getSyncRuntimeStatus().clientId,
                "/api/product-media.php", "product_id", absolute,
                { id: hash, resourceId: product.productId, kind: "photo", mimeType, originalName: path.basename(absolute), contentHash: hash },
                { success: "Ürün fotoğrafı yüklendi.", httpFailure: status => `Ürün fotoğrafı yüklenemedi (HTTP ${status}).`,
                  connectionFailure: "Ürün fotoğrafı aktarımında bağlantı kurulamadı.", readFailure: "Ürün fotoğrafı okunamadı.", fallbackFileName: "product-photo" }, bytes);
              if (!result.ok) throw result;
              const acknowledged = productMediaPublicUrl(product.productId, hash, target, new URL(result.url, target + "/").href);
              if (!acknowledged.endsWith(`/${hash}.${extension}`)) throw new Error("invalid_product_media_receipt_type");
              database.acknowledgeProductImage(product.productId, hash, target, acknowledged);
              return acknowledged;
            })().finally(() => { pending.delete(key); });
            pending.set(key, transfer);
          }
          url = await transfer;
        }
        if (!url.endsWith(`/${hash}.${extension}`)) throw new Error("invalid_product_media_receipt_type");
        urls.push(url);
      }
      if (urls.length) media.set(product.productId, urls);
    }
    return { ok: true, value: media };
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : undefined;
    return { ok: false, message: "Ürün fotoğrafları yayına hazırlanamadı. Görsel arşivini ve HTTPS bağlantısını kontrol edin.", ...(status === undefined ? {} : { status }) };
  }
}

export async function prepareOnlineProductMedia(database: DesktopDatabase, config: PublicResourceMediaSyncConfig,
  revision: number, upload: typeof uploadPublicResourceMediaFile = uploadPublicResourceMediaFile,
  isCurrent: () => boolean = () => true
): Promise<ProductMediaPreparation<CommerceOnlineCatalog>> {
  const frozen = database.readPreparedSyncPublication<CommerceOnlineCatalog>("online_catalog_publish", revision);
  if (frozen) return { ok: true, value: frozen };
  const projection = database.createCommerceOnlineCatalog();
  if (!projection.enabled || !projection.products.length) return { ok: true, value: projection };
  const prepared = await prepareProductMedia(database, config, projection.products.map(product => product.productId), upload, isCurrent);
  if (!prepared.ok) return prepared;
  // Re-read through the canonical resolver; expectedRevision at freeze rejects any
  // domain mutation during upload, including visibility/capability/photo changes.
  return { ok: true, value: database.createCommerceOnlineCatalog((_db, id) => prepared.value.get(id) ?? []) };
}
