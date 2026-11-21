import type { DatabaseSync } from "node:sqlite";
import { SEO_FIELDS, SEO_PAGE_KEYS, type SeoEditorSnapshot, type SeoFields, type SeoPageKey, type SeoPublication } from "@yardimci-asistan/shared";
import { queueSyncJob } from "./sync-runtime-store.js";

const maximum: Record<keyof SeoFields, number> = {
  title: 160, description: 500, og_title: 160, og_description: 500
};

export function isSeoPageKey(value: unknown): value is SeoPageKey {
  return typeof value === "string" && (SEO_PAGE_KEYS as readonly string[]).includes(value);
}

function businessId(db: DatabaseSync): string {
  return String(db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
}

export function readSeoPages(db: DatabaseSync): SeoEditorSnapshot {
  const id = businessId(db);
  const settings = db.prepare("SELECT enabled,target_languages_json FROM public_translation_settings WHERE business_id=?").get(id);
  const targets: unknown = settings?.enabled === 1 ? JSON.parse(String(settings.target_languages_json ?? "[]")) : [];
  const languages = ["tr", ...((Array.isArray(targets) ? targets : []).filter(
    (value): value is string => typeof value === "string" && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)
  ))];
  const rows = db.prepare("SELECT * FROM seo_page_sources WHERE business_id=?").all(id) as Array<Record<string,unknown>>;
  return {
    languages,
    pages: SEO_PAGE_KEYS.map(page => {
      const row = rows.find(r => r.page_key === page);
      return {
        page,
        title: String(row?.title ?? ""),
        description: String(row?.description ?? ""),
        og_title: String(row?.og_title ?? ""),
        og_description: String(row?.og_description ?? ""),
        updatedAt: String(row?.updated_at ?? "")
      };
    })
  };
}

export function validateSeoFields(value: unknown): SeoFields {
  if (!value || typeof value !== "object") throw Error("SEO alanları geçersiz.");
  const data = value as Record<string, unknown>;
  const result = {} as SeoFields;
  for (const field of SEO_FIELDS) {
    const text = data[field];
    if (typeof text !== "string" || text.length > maximum[field]
      || /[<>\u0000-\u001f]/u.test(text)) throw Error("SEO alanı geçersiz: " + field);
    result[field] = text.trim();
  }
  return result;
}

export function saveSeoSource(db: DatabaseSync, page: SeoPageKey, fields: SeoFields, expectedUpdatedAt: string): void {
  if (!isSeoPageKey(page)) throw Error("SEO sayfası geçersiz.");
  const sanitized = validateSeoFields(fields);
  const id = businessId(db);
  if (!id) throw Error("Önce işletme kurulumu gerekli.");
  const old = db.prepare("SELECT * FROM seo_page_sources WHERE business_id=? AND page_key=?").get(id, page);
  if (String(old?.updated_at ?? "") !== expectedUpdatedAt) throw Error("SEO kaydı değişmiş. Yeniden yükleyin.");
  if (old && SEO_FIELDS.every(field => String(old[field] ?? "") === sanitized[field])) return;
  const now = new Date().toISOString();
  db.exec("SAVEPOINT seo_source_write");
  try {
    db.prepare("INSERT INTO seo_page_sources(business_id,page_key,title,description,og_title,og_description,updated_at) " +
      "VALUES(?,?,?,?,?,?,?) ON CONFLICT(business_id,page_key) DO UPDATE SET " +
      "title=excluded.title,description=excluded.description,og_title=excluded.og_title," +
      "og_description=excluded.og_description,updated_at=excluded.updated_at")
      .run(id, page, sanitized.title, sanitized.description, sanitized.og_title, sanitized.og_description, now);
    queueSyncJob(db, "business_context_publish", now);
    db.exec("RELEASE seo_source_write");
  } catch (error) {
    db.exec("ROLLBACK TO seo_source_write; RELEASE seo_source_write");
    throw error;
  }
}

export function publicSeoPages(db: DatabaseSync): SeoPublication {
  const id = businessId(db);
  const rows = db.prepare("SELECT * FROM seo_page_sources WHERE business_id=?").all(id) as Array<Record<string,unknown>>;
  const pages: SeoPublication["pages"] = {};
  for (const row of rows) {
    if (!isSeoPageKey(row.page_key)) continue;
    const fields = Object.fromEntries(SEO_FIELDS.map(field => [field, String(row[field] ?? "")])) as SeoFields;
    if (Object.values(fields).some(Boolean)) pages[row.page_key] = fields;
  }
  return { version:1, pages };
}
