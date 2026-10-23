import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveProductAssetAbsoluteFromRelative } from "./data-paths.js";
import { productImageFormat } from "./product-image-codec";
import { MAX_PRODUCT_PHOTOS, MAX_PRODUCT_PHOTO_BYTES } from "@yardimci-asistan/shared";

export interface ProductOriginalAsset { assetPath: string; hash: string; format: string }

/** Reject symlinks at every untrusted asset component, for both reads and writes. */
export function assertProductAssetPath(databasePath: string, relativePath: string): string {
  const root = path.dirname(databasePath);
  const absolute = resolveProductAssetAbsoluteFromRelative(root, relativePath);
  let current = root;
  for (const segment of path.relative(root, absolute).split(path.sep)) {
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Ürün görsel yolu sembolik bağlantı içeremez.");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return absolute;
}

export function readProductImageBytes(databasePath: string, relativePath: string): Buffer {
  const absolute = assertProductAssetPath(databasePath, relativePath);
  let descriptor: number;
  try { descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch (error) { throw new Error("Ürün fotoğrafı arşivde bulunamadı veya okunamadı.", { cause: error }); }
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_PRODUCT_PHOTO_BYTES) throw new Error("Ürün görseli boş veya izin verilen boyuttan büyük.");
    // Bound the read itself, even if an external process grows a file after stat.
    const bounded = Buffer.alloc(stat.size + 1);
    let size = 0, count = 0;
    do {
      count = fs.readSync(descriptor, bounded, size, bounded.length - size, null);
      size += count;
    } while (count && size < bounded.length);
    if (size !== stat.size) throw new Error("Ürün görseli okunurken değişti.");
    const bytes = bounded.subarray(0, size);
    productImageFormat(bytes);
    return bytes;
  } finally { fs.closeSync(descriptor); }
}

/** Legacy cover-only rows become a virtual original without writing during reads. */
export function readProductOriginalAssets(databasePath: string, productId: string, row: { image_original_assets_json?: unknown; image_asset_path?: unknown }): ProductOriginalAsset[] {
  let parsed: unknown;
  try { parsed = JSON.parse(String(row.image_original_assets_json ?? "[]")); }
  catch { throw new Error("Ürün fotoğraf arşivi geçersiz."); }
  if (!Array.isArray(parsed) || parsed.length > MAX_PRODUCT_PHOTOS) throw new Error("Ürün fotoğraf arşivi en fazla 12 fotoğraf içermeli.");
  const assets: ProductOriginalAsset[] = (parsed as unknown[]).map(value => {
    const item = value as Record<string, unknown> | null;
    if (!item || typeof item.assetPath !== "string" || !item.assetPath.startsWith(`assets/products/${productId}/`)
        || typeof item.hash !== "string" || !/^[a-f0-9]{64}$/.test(item.hash) || typeof item.format !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(item.format)) throw new Error("Ürün fotoğraf arşivi geçersiz.");
    assertProductAssetPath(databasePath, item.assetPath);
    return { assetPath: item.assetPath, hash: item.hash, format: item.format };
  });
  if (!assets.length && row.image_asset_path) {
    const assetPath = String(row.image_asset_path);
    if (!assetPath.startsWith(`assets/products/${productId}/`)) throw new Error("Ürün görsel yolu ürünle eşleşmiyor.");
    const bytes = readProductImageBytes(databasePath, assetPath);
    assets.push({ assetPath, hash: createHash("sha256").update(bytes).digest("hex"), format: productImageFormat(bytes) });
  }
  return assets.filter((asset, index) => assets.findIndex(other => other.hash === asset.hash) === index);
}

/** Read the canonical immutable archive; consumers never store a channel image copy. */
export function readProductImageAsset(databasePath: string, relativePath: string): string {
  if (!relativePath) return "";
  const bytes = readProductImageBytes(databasePath, relativePath);
  const mime = productImageFormat(bytes);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
