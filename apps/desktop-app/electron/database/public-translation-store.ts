import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { PUBLIC_LANGUAGES, PUBLIC_TRANSLATION_KINDS, type PublicSiteCatalog, type PublicLocalization, type SaveTranslationInput, type TranslationField, type TranslationFilter, type TranslationIdentity, type TranslationJob, type TranslateSelectionInput, type TranslationPage, type TranslationRecord, type TranslationSettings } from "@yardimci-asistan/shared";
import { validateSiteCatalog } from "../public-site-catalog";
import { queueSyncJob } from "./sync-runtime-store";

const translationHash = (text: string) => createHash("sha256").update(text).digest("hex");
export interface TranslationSource extends TranslationIdentity { fields: Record<string, string> }
export interface TranslationTask { sourceHash: string; refs: Array<TranslationIdentity & {field: string}> }
export interface TranslationWork {
  job: TranslationJob; input: TranslateSelectionInput | null; bulk: boolean;
  pending: TranslationTask[];
  records: Array<TranslationIdentity & {remaining: number; changed: boolean; failed: boolean}>;
}
export interface TranslationRuntime {
  work: TranslationWork | null; automaticPaused: boolean;
  cooldown: {reason: "rate_limited" | "quota_exhausted"; until: string; attempts: number; retryAfterSeconds?: number} | null;
}
export interface AiTranslationWrite { identity: TranslationIdentity; expected: Pick<TranslationField,"field" | "sourceHash">; text: string; failure?: string }
interface SourceRow { record_type: TranslationIdentity["kind"]; record_id: string; label: string; fields_json: string }
interface StoredTranslation { record_type: TranslationIdentity["kind"]; record_id: string; field: string; target_language: string; source_text: string; source_hash: string; translated_text: string; status: string; origin: "manual" | "ai"; updated_at: string }
const defaults = (): TranslationSettings => ({ enabled: false, sourceLanguage: "tr", targetLanguages: [], automatic: false });

export class PublicTranslationStore {
  constructor(private readonly db: DatabaseSync, private readonly gallery: () => Array<{ id: string; title: string }> = () => [], private readonly targetUrl: () => string = () => "") {}
  businessId() { return String(this.db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get()?.id ?? ""); }
  runtime(): TranslationRuntime {
    const row = this.db.prepare("SELECT state_json FROM public_translation_runtime WHERE business_id=?").get(this.businessId());
    return row ? JSON.parse(String(row.state_json)) as TranslationRuntime : {work:null, automaticPaused:false, cooldown:null};
  }
  saveRuntime(state: TranslationRuntime) {
    this.db.prepare("INSERT INTO public_translation_runtime(business_id,state_json) VALUES (?,?) ON CONFLICT(business_id) DO UPDATE SET state_json=excluded.state_json")
      .run(this.businessId(), JSON.stringify(state));
  }
  settings(): TranslationSettings {
    const row = this.db.prepare("SELECT * FROM public_translation_settings WHERE business_id=?").get(this.businessId());
    return row ? { enabled: row.enabled === 1, sourceLanguage: "tr", targetLanguages: JSON.parse(String(row.target_languages_json)) as string[], automatic: row.automatic === 1 } : defaults();
  }
  saveSettings(input: TranslationSettings) {
    if (!input || input.sourceLanguage !== "tr" || typeof input.enabled !== "boolean" || typeof input.automatic !== "boolean" || !Array.isArray(input.targetLanguages)
      || input.targetLanguages.length > 16 || input.targetLanguages.some(l => typeof l !== "string" || !PUBLIC_LANGUAGES.some(v => v.code === l) || l === "tr")
      || new Set(input.targetLanguages).size !== input.targetLanguages.length) throw Error("Yayın dilleri geçersiz. Kaynak dil Türkçe olmalıdır.");
    const businessId = this.businessId();
    if (!businessId) throw Error("Önce işletme kurulumunu tamamlayın.");
    if (JSON.stringify(this.settings()) === JSON.stringify(input)) return this.settings();
    this.transaction(() => {
      this.db.prepare(`INSERT INTO public_translation_settings(business_id,enabled,source_language,target_languages_json,automatic,updated_at)
        VALUES (?,?,'tr',?,?,?) ON CONFLICT(business_id) DO UPDATE SET enabled=excluded.enabled,target_languages_json=excluded.target_languages_json,automatic=excluded.automatic,updated_at=excluded.updated_at`)
        .run(businessId, Number(input.enabled), JSON.stringify(input.targetLanguages), Number(input.automatic), new Date().toISOString());
      this.invalidate();
    });
    return this.settings();
  }
  private language(language: string) {
    const settings = this.settings();
    if (!settings.enabled) throw Error("Çoklu Dil servisi kapalı.");
    if (!settings.targetLanguages.includes(language)) throw Error("Hedef yayın dili etkin değil.");
  }
  private sources() {
    return { sql: `WITH sources AS (SELECT record_type,record_id,label,fields_json FROM public_translation_sources WHERE business_id=?
      UNION ALL SELECT 'gallery', json_extract(value,'$.id'), json_extract(value,'$.title'), json_object('title',json_extract(value,'$.title')) FROM json_each(?)
      UNION ALL SELECT 'site_text', json_extract(value,'$.id'), json_extract(value,'$.label'), json_extract(value,'$.fields') FROM json_each(?))`,
    args: [this.businessId(), JSON.stringify(this.gallery().map(({ id, title }) => ({ id, title }))), JSON.stringify(this.siteSources().map(s => ({id:s.id,label:s.fields.text,fields:s.fields})))] };
  }
  siteCatalog(): PublicSiteCatalog | undefined {
    const row = this.db.prepare("SELECT catalog_json FROM public_site_translation_catalogs WHERE business_id=? AND target_url=?").get(this.businessId(), this.targetUrl());
    return row ? JSON.parse(String(row.catalog_json)) as PublicSiteCatalog : undefined;
  }
  replaceSiteCatalog(catalog: PublicSiteCatalog) {
    catalog = validateSiteCatalog(catalog);
    const serialized = JSON.stringify(catalog);
    if (JSON.stringify(this.siteCatalog()) === serialized) return false;
    this.transaction(() => {
      this.db.prepare("INSERT INTO public_site_translation_catalogs(business_id,target_url,catalog_json) VALUES (?,?,?) ON CONFLICT(business_id,target_url) DO UPDATE SET catalog_json=excluded.catalog_json")
        .run(this.businessId(), this.targetUrl(), serialized);
      this.invalidate("site_text");
    });
    return true;
  }
  private siteSources(): TranslationSource[] {
    const catalog = this.siteCatalog();
    return catalog ? Object.entries(catalog.entries).map(([key, entry]) => ({kind:"site_text", id:`${catalog.id}:${key}`, fields:{text:entry.text}})) : [];
  }
  private source(identity: TranslationIdentity): SourceRow | undefined {
    if (!identity || !PUBLIC_TRANSLATION_KINDS.includes(identity.kind) || typeof identity.id !== "string" || identity.id.length > 200) throw Error("Public kayıt kimliği geçersiz.");
    const source = this.sources();
    return this.db.prepare(`${source.sql} SELECT * FROM sources WHERE record_type=? AND record_id=?`).get(...source.args, identity.kind, identity.id) as unknown as SourceRow | undefined;
  }
  private record(row: SourceRow, language: string): TranslationRecord {
    const stored = this.db.prepare("SELECT * FROM public_translations WHERE business_id=? AND record_type=? AND record_id=? AND target_language=?")
      .all(this.businessId(), row.record_type, row.record_id, language) as unknown as StoredTranslation[];
    const fields: TranslationField[] = Object.entries(JSON.parse(row.fields_json) as Record<string, string>).filter(([, value]) => value.trim()).map(([field, source]) => {
      const t = stored.find(t => t.field === field), hash = translationHash(source);
      return { field, source, sourceHash: hash, text: t?.translated_text ?? "", origin: t?.origin ?? null, updatedAt: t?.updated_at ?? "",
        state: !t ? "missing" : t.source_hash !== hash ? "stale" : t.status === "ready" ? "ready" : "failed" };
    });
    return { kind: row.record_type, id: row.record_id, label: row.label, fields, total: fields.length,
      ready: fields.filter(f => f.state === "ready").length, stale: fields.filter(f => f.state === "stale").length,
      manual: fields.filter(f => f.origin === "manual").length, failed: fields.filter(f => f.state === "failed").length };
  }
  get(identity: TranslationIdentity, language: string) {
    this.language(language);
    const row = this.source(identity);
    if (!row) throw Error("Kayıt public yayında bulunamadı.");
    return this.record(row, language);
  }
  reusableAi(sourceHash: string, language: string): string | undefined {
    this.language(language);
    const row = this.db.prepare("SELECT translated_text FROM public_translations WHERE business_id=? AND source_hash=? AND target_language=? AND origin='ai' AND status='ready' LIMIT 1")
      .get(this.businessId(), sourceHash, language);
    return row ? String(row.translated_text) : undefined;
  }
  attention(): {failed: number; review: number} {
    const settings = this.settings();
    if (!settings.enabled) return {failed:0,review:0};
    const sources = this.sources();
    const row = this.db.prepare(`${sources.sql} SELECT
      SUM(CASE WHEN t.status='failed' AND f.value=t.source_text THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN t.origin='manual' AND f.value!=t.source_text THEN 1 ELSE 0 END) AS review
      FROM public_translations t
      JOIN sources s ON s.record_type=t.record_type AND s.record_id=t.record_id
      JOIN json_each(s.fields_json) f ON f.key=t.field
      WHERE t.business_id=? AND (t.status='failed' OR t.origin='manual')
      AND t.target_language IN (SELECT value FROM json_each(?))`).get(...sources.args, this.businessId(), JSON.stringify(settings.targetLanguages));
    return {failed:Number(row?.failed ?? 0),review:Number(row?.review ?? 0)};
  }
  list(filter: TranslationFilter): TranslationPage {
    this.language(filter?.language);
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(filter.limit) || 50))), offset = Math.max(0, Math.trunc(Number(filter.offset) || 0));
    const category = filter.category ?? "all", state = filter.state ?? "all";
    if (![...PUBLIC_TRANSLATION_KINDS, "all", "products", "menu"].includes(category) || !["all", "missing", "ready", "stale", "manual", "failed"].includes(state)) throw Error("Çeviri filtresi geçersiz.");
    const s = this.sources();
    const query = String(filter.query ?? "").trim().slice(0, 200).toLocaleLowerCase("tr-TR");
    const searchText = [..."İIÜÖÇŞĞ"].reduce((sql, letter) => `replace(${sql},'${letter}','${letter.toLocaleLowerCase("tr-TR")}')`, "s.label||' '||s.fields_json");
    const sql = `${s.sql}, filtered AS (SELECT s.*, COUNT(*) AS total,
      SUM(CASE WHEN t.status='ready' AND t.source_text=f.value THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN t.source_text!=f.value THEN 1 ELSE 0 END) AS stale,
      SUM(CASE WHEN t.origin='manual' THEN 1 ELSE 0 END) AS manual,
      SUM(CASE WHEN t.status='failed' AND t.source_text=f.value THEN 1 ELSE 0 END) AS failed
      FROM sources s JOIN json_each(s.fields_json) f
      LEFT JOIN public_translations t ON t.business_id=? AND t.record_type=s.record_type AND t.record_id=s.record_id AND t.field=f.key AND t.target_language=?
      WHERE trim(f.value)!='' AND (?='all' OR s.record_type=? OR (?='products' AND s.record_type IN ('catalog_product','catalog_category')) OR (?='menu' AND s.record_type IN ('menu_product','menu_category')))
      AND (?='' OR instr(lower(${searchText}),?)>0)
      GROUP BY s.record_type,s.record_id
      HAVING (?='all' OR (?='missing' AND ready<total) OR (?='ready' AND ready=total) OR (?='stale' AND stale>0) OR (?='manual' AND manual>0) OR (?='failed' AND failed>0)))`;
    const args = [...s.args, this.businessId(), filter.language, category, category, category, category, query, query, state, state, state, state, state, state];
    const total = Number(this.db.prepare(`${sql} SELECT COUNT(*) AS count FROM filtered`).get(...args)?.count ?? 0);
    const rows = this.db.prepare(`${sql} SELECT * FROM filtered ORDER BY label,record_type,record_id LIMIT ? OFFSET ?`).all(...args, limit, offset) as unknown as SourceRow[];
    return { records: rows.map(row => this.record(row, filter.language)), total, offset, limit };
  }
  saveManual(input: SaveTranslationInput) {
    this.language(input?.language);
    if (!Array.isArray(input.fields) || !input.fields.length || input.fields.length > 12) throw Error("Çeviri alanları geçersiz.");
    this.transaction(() => {
      const record = this.get(input, input.language);
      for (const field of input.fields) {
        const source = record.fields.find(f => f.field === field.field);
        if (!source || source.sourceHash !== field.sourceHash) throw Error("Kaynak metin değişti. Kaydı yeniden yükleyin.");
        const text = this.validText(field.text);
        this.write(record, input.language, source, text, "manual", "ready");
      }
      this.invalidate(input.kind);
    });
  }
  /** Re-read canonical source and manual ownership after the asynchronous AI boundary. */
  acceptAi(identity: TranslationIdentity, language: string, expected: TranslationField, text: string, failure = "") {
    return this.acceptAiBatch(language, [{identity,expected,text,failure}])[0]!;
  }
  /** One source/manual recheck and one outbox revision per affected publication section.
   * The queue checkpoint participates in the same transaction as the accepted fields. */
  acceptAiBatch(language: string, results: AiTranslationWrite[], checkpoint?: (accepted: boolean[]) => void) {
    return this.transaction(() => {
      this.language(language);
      const jobs = new Set<Parameters<typeof queueSyncJob>[1]>();
      const accepted = results.map(({identity,expected,text,failure = ""}) => {
        const row = this.source(identity);
        if (!row) return false;
        const field = this.record(row, language).fields.find(f => f.field === expected.field);
        if (!field || field.sourceHash !== expected.sourceHash || field.origin === "manual" || field.state === "ready") return false;
        this.write(identity, language, field, failure ? field.text : this.validText(text), "ai", failure ? "failed" : "ready", failure);
        if (!failure) for (const job of this.publicationJobs(identity.kind)) jobs.add(job);
        return true;
      });
      for (const job of jobs) queueSyncJob(this.db, job);
      checkpoint?.(accepted);
      return accepted;
    });
  }
  private validText(value: string) {
    if (typeof value !== "string" || !value.trim() || value.length > 12000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw Error("Çeviri boş veya geçersiz.");
    return value.trim();
  }
  private write(identity: TranslationIdentity, language: string, field: TranslationField, text: string, origin: "manual" | "ai", status: "ready" | "failed", failure = "") {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO public_translations(business_id,record_type,record_id,field,target_language,source_text,source_hash,translated_text,status,origin,failure_code,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(business_id,record_type,record_id,field,target_language) DO UPDATE SET
      source_text=excluded.source_text,source_hash=excluded.source_hash,translated_text=excluded.translated_text,status=excluded.status,origin=excluded.origin,failure_code=excluded.failure_code,updated_at=excluded.updated_at`)
      .run(this.businessId(), identity.kind, identity.id, field.field, language, field.source, field.sourceHash, text, status, origin, failure, now, now);
  }
  private publicationJobs(kind?: TranslationIdentity["kind"]) {
    const jobs = kind === "room" ? ["room_catalog_publish"] : kind === "table" ? ["table_catalog_publish"]
      : kind?.startsWith("menu_") ? ["menu_publish"] : kind?.startsWith("catalog_") ? ["online_catalog_publish"]
      : kind === "marketing" ? ["marketing_website_publish"] : kind ? ["business_context_publish"]
      : ["room_catalog_publish", "table_catalog_publish", "menu_publish", "online_catalog_publish", "business_context_publish", "marketing_website_publish"];
    return jobs as Array<Parameters<typeof queueSyncJob>[1]>;
  }
  private invalidate(kind?: TranslationIdentity["kind"]) {
    for (const job of this.publicationJobs(kind)) queueSyncJob(this.db, job);
  }
  localization(sources: TranslationSource[], includeSite = false): PublicLocalization {
    const settings = this.settings();
    const result: PublicLocalization = { version: 1, source_language: "tr", target_languages: settings.enabled ? settings.targetLanguages : [], translations: {} };
    if (includeSite) {
      result.languages = PUBLIC_LANGUAGES.filter(l => l.code === "tr" || result.target_languages.includes(l.code));
      result.business_id = this.businessId();
      const catalog = this.siteCatalog();
      if (catalog && settings.enabled) { result.site_catalog = catalog; sources = [...sources, ...this.siteSources()]; }
    }
    if (!result.target_languages.length || !sources.length) return result;
    const refs = new Map(sources.map(s => [`${s.kind}\0${s.id}`, s.fields]));
    const rows = this.db.prepare("SELECT * FROM public_translations WHERE business_id=? AND status='ready'").all(this.businessId()) as unknown as StoredTranslation[];
    for (const t of rows) {
      const source = refs.get(`${t.record_type}\0${t.record_id}`)?.[t.field];
      if (source === undefined || !source.trim() || !settings.targetLanguages.includes(t.target_language) || translationHash(source) !== t.source_hash) continue;
      const records = result.translations[t.record_type] ??= {};
      const languages = records[t.record_id] ??= {};
      (languages[t.target_language] ??= {})[t.field] = t.translated_text;
    }
    return result;
  }
  private transaction<T>(action: () => T): T {
    this.db.exec("SAVEPOINT public_translation_write");
    try { const value = action(); this.db.exec("RELEASE public_translation_write"); return value; }
    catch (error) { this.db.exec("ROLLBACK TO public_translation_write; RELEASE public_translation_write"); throw error; }
  }
}
