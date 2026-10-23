import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { DealerAccessProjection } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "./database";
import { resolveProductAssetAbsoluteFromRelative } from "./data-paths";
import { uploadPublicResourceMediaFile, type PublicResourceMediaSyncConfig } from "./public-resource-media-publication";

type Preparation = { ok: true; value: DealerAccessProjection } | { ok: false; message: string; status?: number };

async function productImageHash(absolutePath: string): Promise<string> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of fs.createReadStream(absolutePath)) {
    if (!Buffer.isBuffer(chunk) || (size += chunk.length) > 30 * 1024 * 1024) throw new Error("Ürün görsel boyutu desteklenmiyor.");
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/** Media preparation is part of the existing dealer_access job, before its immutable body freezes. */
export async function prepareDealerProductMedia(database: DesktopDatabase, config: PublicResourceMediaSyncConfig,
  revision: number, upload: typeof uploadPublicResourceMediaFile = uploadPublicResourceMediaFile): Promise<Preparation> {
  const frozen = database.readPreparedSyncPublication<DealerAccessProjection>("dealer_access_publish", revision);
  if (frozen) return { ok: true, value: frozen };
  const projection = database.createDealerAccessProjection();
  if (!projection.enabled || !projection.catalogs?.length) return { ok: true, value: projection };
  const target = config.baseUrl.replace(/\/+$/, "");
  const productIds = [...new Set(projection.catalogs.flatMap(c => c.products.map(p => p.product_id)))];
  const media = new Map<string, string[]>();
  try {
    for (const product of database.getDealerProductImageArchives(productIds)) {
      const urls: string[] = [], hashes = new Set<string>();
      for (const asset of product.paths) {
        const absolutePath = resolveProductAssetAbsoluteFromRelative(path.dirname(database.databasePath), asset.path);
        if (!fs.existsSync(absolutePath)) continue;
        const actual = fs.realpathSync(absolutePath);
        const productRoot = path.join(fs.realpathSync(path.dirname(database.databasePath)), "assets", "products", product.productId);
        if (!actual.startsWith(productRoot + path.sep) || !/\.(?:jpg|jpeg|png|webp)$/i.test(actual)) throw new Error("Ürün görsel yolu geçersiz.");
        const stat = fs.statSync(actual);
        if (!stat.isFile() || stat.size < 1 || stat.size > 30 * 1024 * 1024) throw new Error("Ürün görsel boyutu desteklenmiyor.");
        const hash = await productImageHash(actual);
        if (asset.hash && asset.hash !== hash) throw new Error("Ürün görsel arşivi doğrulanamadı.");
        if (hashes.has(hash)) continue;
        hashes.add(hash);
        let url = database.getPublishedDealerProductImage(product.productId, hash, target);
        if (!url) {
          const ext = path.extname(actual).toLowerCase(), mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
          const result = await upload(config, database.getSyncRuntimeStatus().clientId, "/api/product-media.php", "product_id", actual,
            { id: hash, resourceId: product.productId, kind: "photo", mimeType: mime, originalName: path.basename(actual), contentHash: hash },
            { success: "Ürün fotoğrafı yüklendi.", httpFailure: status => `Ürün fotoğrafı yüklenemedi (HTTP ${status}).`, connectionFailure: "Ürün fotoğrafı aktarımında bağlantı kurulamadı.", readFailure: "Ürün fotoğrafı okunamadı.", fallbackFileName: "product-photo" });
          if (!result.ok) return result;
          url = new URL(result.url, target + "/").href;
          database.acknowledgeDealerProductImage(product.productId, hash, target, url);
        }
        urls.push(url);
      }
      if (urls.length) media.set(product.productId, urls);
    }
    return { ok: true, value: { ...projection, catalogs: projection.catalogs.map(catalog => {
      const products = catalog.products.map(product => {
        const urls = media.get(product.product_id) ?? (product.image_url ? [product.image_url] : []);
        return { ...product, image_url: urls[0] ?? "", image_urls: urls };
      });
      return { ...catalog, products, catalog_revision: createHash("sha256").update(JSON.stringify({ previousRevision: catalog.catalog_revision, products })).digest("hex") };
    }) } };
  } catch { return { ok: false, message: "Ürün fotoğrafları yayına hazırlanamadı. Görsel arşivini ve HTTPS bağlantısını kontrol edin." }; }
}
