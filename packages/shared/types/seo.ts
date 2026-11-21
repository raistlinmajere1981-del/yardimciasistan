/** A fixed page whitelist; site-owned editorial extensions keep their own titles. */
export const SEO_PAGE_KEYS = [
  "home", "about", "rooms", "restaurant", "menu", "catalog",
  "gallery", "announcements", "reviews", "contact"
] as const;
export type SeoPageKey = typeof SEO_PAGE_KEYS[number];
export const SEO_FIELDS = ["title", "description", "og_title", "og_description"] as const;
export type SeoFieldName = typeof SEO_FIELDS[number];
export type SeoFields = Record<SeoFieldName, string>;
export interface SeoPageSource extends SeoFields { page: SeoPageKey; updatedAt: string }
export interface SeoEditorSnapshot {
  languages: string[];
  pages: SeoPageSource[];
}
export interface SeoProposal { page: SeoPageKey; language: string; fields: SeoFields; sourceHashes: Record<SeoFieldName, string> }
export type SeoActionResult<T> = { ok: true; value: T } | { ok: false; message: string };
export interface SeoPublication { version: 1; pages: Partial<Record<SeoPageKey, SeoFields>> }
