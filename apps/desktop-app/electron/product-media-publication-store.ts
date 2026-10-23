import type { DatabaseSync } from "node:sqlite";
import { MAX_PRODUCT_PHOTOS } from "@yardimci-asistan/shared";
import { publicImageUrl } from "./retail-product-image-projection";

/** Read canonical archive order; this store owns only target/hash upload acknowledgements. */
export function productImageArchives(db: DatabaseSync, productIds: readonly string[]) {
  if (!productIds.length) return [];
  return db.prepare(`SELECT id,image_asset_path,image_original_assets_json FROM catalog_products
    WHERE id IN (SELECT value FROM json_each(?)) AND is_active=1 AND deleted_at='' ORDER BY id`)
    .all(JSON.stringify(productIds)).map(row => {
      const originals = JSON.parse(String(row.image_original_assets_json)) as unknown;
      const paths: Array<{ path: string; hash: string; format: string }> = [];
      if (!Array.isArray(originals) || originals.length > MAX_PRODUCT_PHOTOS) throw new Error("Ürün görsel arşivi geçersiz.");
      for (const candidate of originals as unknown[]) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Ürün görsel arşivi geçersiz.");
        const item = candidate as Record<string, unknown>;
        if (typeof item.assetPath !== "string" || !item.assetPath.startsWith(`assets/products/${String(row.id)}/`)
            || typeof item.hash !== "string" || !/^[a-f0-9]{64}$/.test(item.hash)
            || !["image/jpeg", "image/png", "image/webp"].includes(String(item.format))) throw new Error("Ürün görsel arşivi geçersiz.");
        paths.push({ path: item.assetPath, hash: item.hash, format: String(item.format) });
      }
      if (!paths.length && row.image_asset_path) paths.push({ path: String(row.image_asset_path), hash: "", format: "" });
      return { productId: String(row.id), paths };
    });
}
export function publishedProductImage(db: DatabaseSync, productId: string, hash: string, target: string): string {
  const url = String(db.prepare("SELECT public_url FROM catalog_product_media_publications WHERE product_id=? AND content_hash=? AND target=?").get(productId,hash,target)?.public_url ?? "");
  return url ? productMediaPublicUrl(productId, hash, target, url) : "";
}
export function productMediaPublicUrl(productId: string, hash: string, target: string, url: string): string {
  const base = new URL(target), asset = new URL(url);
  const prefix = `${base.pathname.replace(/\/+$/, "")}/media/products/${encodeURIComponent(productId)}/`;
  if (!publicImageUrl(target) || !publicImageUrl(url) || !/^[A-Za-z0-9_-]{1,64}$/.test(productId)
      || asset.origin !== base.origin || asset.username || asset.password || asset.search || asset.hash
      || !/^[a-f0-9]{64}$/.test(hash) || !["jpg", "png", "webp"].some(extension => asset.pathname === `${prefix}${hash}.${extension}`)) throw new Error("Ürün görseli yayın onayı geçersiz.");
  return asset.href;
}
export function acknowledgeProductImage(db: DatabaseSync, productId: string, hash: string, target: string, url: string) {
  const acknowledged = productMediaPublicUrl(productId, hash, target, url);
  db.prepare(`INSERT INTO catalog_product_media_publications(product_id,content_hash,target,public_url,published_at)
    VALUES(?,?,?,?,?) ON CONFLICT(product_id,content_hash,target) DO UPDATE SET public_url=excluded.public_url,published_at=excluded.published_at`)
    .run(productId,hash,target,acknowledged,new Date().toISOString());
}
