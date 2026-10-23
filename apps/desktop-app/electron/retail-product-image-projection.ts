import type { DatabaseSync } from "node:sqlite";
import type { ProductOriginalAsset } from "./product-image-reader";
export function publicImageUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    // Project only public HTTPS images;
    // credentials, query parameters and local/private hosts never leave Desktop.
    if (url.href.length > 2048 || url.hostname.endsWith(".") || url.protocol !== "https:" || url.username || url.password || url.search || url.hash
        || !url.hostname.includes(".") || /^[\d.:[\]]+$/.test(url.hostname)
        || /\.(local|localhost|internal|test)$/.test(url.hostname)) return "";
    return url.href;
  } catch { return ""; }
}


/** Resolution seam for the shared product media publication owner.
 * Resolve already uploaded, acknowledged HTTPS URLs in canonical original order.
 * A missing cover must be represented by an empty first slot; never promote an
 * uploaded secondary image over a cover whose upload is still pending. */
export type RetailProductImageResolver = (db: DatabaseSync, productId: string, originals: ProductOriginalAsset[]) => readonly string[];

export function retailProductImageUrls(db: DatabaseSync, row: Record<string, unknown>, resolve?: RetailProductImageResolver): string[] {
  let originals: ProductOriginalAsset[] = [];
  try {
    const parsed: unknown = JSON.parse(String(row.image_original_assets_json ?? "[]"));
    if (!Array.isArray(parsed) || parsed.length > 12) return [];
    originals = (parsed as unknown[]).flatMap(value => {
      const item = value as Record<string, unknown> | null;
      return item && typeof item.assetPath === "string" && typeof item.hash === "string" && typeof item.format === "string"
        ? [{ assetPath: item.assetPath, hash: item.hash, format: item.format }] : [];
    });
    if (originals.length !== parsed.length) return [];
  } catch { return []; }
  const candidates = resolve?.(db, String(row.id), originals) ?? [];
  if (candidates.length && publicImageUrl(candidates[0])) {
    return [...new Set(candidates.map(publicImageUrl).filter(Boolean))].slice(0, 12);
  }
  // A local archive (including legacy cover-only rows) must be acknowledged.
  // Missing/corrupt covers never fall back to an unrelated source or secondary.
  if (originals.length || row.image_asset_path) return [];
  const fallback = publicImageUrl(row.image_source_url);
  return fallback ? [fallback] : [];
}
