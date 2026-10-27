/** Desktop translation owner; publication languages are unrelated to spoken languages. */
export const PUBLIC_TRANSLATION_KINDS = ["business", "room", "table", "menu_category", "menu_product", "catalog_category", "catalog_product", "gallery", "marketing", "site_text"] as const;
export type PublicTranslationKind = typeof PUBLIC_TRANSLATION_KINDS[number];
export interface TranslationSettings {
  enabled: boolean;
  sourceLanguage: "tr";
  targetLanguages: string[];
  automatic: boolean;
}
export interface TranslationIdentity { kind: PublicTranslationKind; id: string }
export type TranslationState = "missing" | "ready" | "stale" | "failed";
export interface TranslationField {
  field: string; source: string; sourceHash: string; text: string;
  state: TranslationState; origin: "manual" | "ai" | null; updatedAt: string;
}
export interface TranslationRecord extends TranslationIdentity {
  label: string; fields: TranslationField[]; ready: number; total: number;
  stale: number; manual: number; failed: number;
}
export interface TranslationFilter {
  language: string; category?: PublicTranslationKind | "all" | "products" | "menu";
  query?: string; state?: "all" | "missing" | "ready" | "stale" | "manual" | "failed";
  offset?: number; limit?: number;
}
export interface TranslationPage { records: TranslationRecord[]; total: number; offset: number; limit: number }
export interface SaveTranslationInput extends TranslationIdentity {
  language: string; fields: Array<{ field: string; sourceHash: string; text: string }>;
}
export interface TranslationJob {
  id: string; state: "running" | "complete" | "cancelled" | "unavailable";
  total: number; completed: number; failed: number; skipped: number; message: string;
}
export interface TranslateSelectionInput {
  filter: TranslationFilter; selection?: TranslationIdentity[];
}
export type TranslationResult<T> = { ok: true; value: T } | { ok: false; message: string };
export interface TranslationBridge {
  getTranslationSettings(): Promise<TranslationResult<TranslationSettings>>;
  saveTranslationSettings(input: TranslationSettings): Promise<TranslationResult<TranslationSettings>>;
  getTranslation(identity: TranslationIdentity, language: string): Promise<TranslationResult<TranslationRecord>>;
  listTranslations(filter: TranslationFilter): Promise<TranslationResult<TranslationPage>>;
  saveTranslation(input: SaveTranslationInput): Promise<TranslationResult<void>>;
  startTranslation(input: TranslateSelectionInput): Promise<TranslationResult<TranslationJob>>;
  getTranslationJob(): Promise<TranslationResult<TranslationJob | null>>;
  cancelTranslation(): Promise<TranslationResult<void>>;
}
/** Additive public data only. Source fields keep their existing names and Turkish values. */
export interface PublicLocalization {
  version: 1; source_language: "tr"; target_languages: string[];
  translations: Partial<Record<PublicTranslationKind, Record<string, Record<string, Record<string, string>>>>>;
  languages?: import("./public-languages").PublicLanguage[];
  site_catalog?: PublicSiteCatalog;
  business_id?: string;
}
/** Source-only catalog served by the site. No translated files or private business context. */
export interface PublicSiteCatalog {
  version: 1; id: string; revision: string; source_language: "tr";
  entries: Record<string, {text: string; hash: string}>;
}
