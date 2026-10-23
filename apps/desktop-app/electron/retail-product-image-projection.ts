import type { DatabaseSync } from "node:sqlite";
import type { ProductOriginalAsset } from "./product-image-reader";
export function publicImageUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    // A2 does not publish local media. Project only public HTTPS source images;
    // credentials, query parameters and local/private hosts never leave Desktop.
    if (url.href.length > 2048 || url.hostname.endsWith(".") || url.protocol !== "https:" || url.username || url.password || url.search || url.hash
        || !url.hostname.includes(".") || /^[\d.:[\]]+$/.test(url.hostname)
        || /\.(local|localhost|internal|test)$/.test(url.hostname)) return "";
    return url.href;
  } catch { return ""; }
}


/** Integration seam for the existing dealer media publication owner after merge.
 * Resolve already uploaded, acknowledged HTTPS URLs in canonical original order.
 * A missing cover must be represented by an empty first slot; never promote an
 * uploaded secondary image over a cover whose upload is still pending. */
export type RetailProductImageResolver = (db: DatabaseSync, productId: string, originals: ProductOriginalAsset[]) => readonly string[];

export function retailProductImageUrls(db: DatabaseSync, row: Record<string, unknown>, resolve?: RetailProductImageResolver): string[] {
  let originals: ProductOriginalAsset[] = [];
  try {
    const parsed: unknown = JSON.parse(String(row.image_original_assets_json ?? "[]"));
    if (Array.isArray(parsed) && parsed.length <= 12) originals = (parsed as unknown[]).flatMap(value => {
      const item = value as Record<string, unknown> | null;
      return item && typeof item.assetPath === "string" && typeof item.hash === "string" && typeof item.format === "string"
        ? [{ assetPath: item.assetPath, hash: item.hash, format: item.format }] : [];
    });
  } catch { /* Source fallback below. */ }
  const candidates = resolve?.(db, String(row.id), originals) ?? [];
  if (candidates.length && publicImageUrl(candidates[0])) {
    return [...new Set(candidates.map(publicImageUrl).filter(Boolean))].slice(0, 12);
  }
  const fallback = publicImageUrl(row.image_source_url);
  return fallback ? [fallback] : [];
}
