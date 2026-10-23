import type { DatabaseSync } from "node:sqlite";

/** Read canonical archive order; this store owns only target/hash upload acknowledgements. */
export function dealerProductImageArchives(db: DatabaseSync, productIds: readonly string[]) {
  if (!productIds.length) return [];
  return db.prepare(`SELECT id,image_asset_path,image_original_assets_json FROM catalog_products
    WHERE id IN (SELECT value FROM json_each(?)) AND is_active=1 AND deleted_at='' ORDER BY id`)
    .all(JSON.stringify(productIds)).map(row => {
      const originals = JSON.parse(String(row.image_original_assets_json)) as unknown;
      const paths: Array<{ path: string; hash: string }> = [];
      if (!Array.isArray(originals)) throw new Error("Ürün görsel arşivi geçersiz.");
      for (const candidate of originals.slice(0, 12) as unknown[]) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Ürün görsel arşivi geçersiz.");
        const item = candidate as Record<string, unknown>;
        if (typeof item.assetPath !== "string" || typeof item.hash !== "string" || !/^[a-f0-9]{64}$/.test(item.hash)) throw new Error("Ürün görsel arşivi geçersiz.");
        paths.push({ path: item.assetPath, hash: item.hash });
      }
      if (!paths.length && row.image_asset_path) paths.push({ path: String(row.image_asset_path), hash: "" });
      return { productId: String(row.id), paths };
    });
}
export function publishedDealerProductImage(db: DatabaseSync, productId: string, hash: string, target: string): string {
  return String(db.prepare("SELECT public_url FROM catalog_product_media_publications WHERE product_id=? AND content_hash=? AND target=?").get(productId,hash,target)?.public_url ?? "");
}
export function acknowledgeDealerProductImage(db: DatabaseSync, productId: string, hash: string, target: string, url: string) {
  const base = new URL(target), asset = new URL(url);
  const prefix = `${base.pathname.replace(/\/+$/, "")}/media/products/${encodeURIComponent(productId)}/`;
  if (base.protocol !== "https:" || base.search || base.hash || base.username || base.password
      || asset.origin !== base.origin || asset.username || asset.password || asset.search || asset.hash
      || !/^[a-f0-9]{64}$/.test(hash) || !["jpg", "png", "webp"].some(extension => asset.pathname === `${prefix}${hash}.${extension}`)) throw new Error("Ürün görseli yayın onayı geçersiz.");
  db.prepare(`INSERT INTO catalog_product_media_publications(product_id,content_hash,target,public_url,published_at)
    VALUES(?,?,?,?,?) ON CONFLICT(product_id,content_hash,target) DO UPDATE SET public_url=excluded.public_url,published_at=excluded.published_at`)
    .run(productId,hash,target,url,new Date().toISOString());
}
