import { marketingBusiness as business, marketingTransaction as transaction } from "./marketing-persistence";
import { getMediaAsset } from "./asset-store";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { MarketingContent, MarketingContentDetail, MarketingContentInput, MarketingContentVariant, MarketingPublication, MarketingPublicationInput } from "@yardimci-asistan/shared";
import { queueSyncJob } from "../database/sync-runtime-store";
import { MarketingError, marketingText, marketingChannel, marketingId, marketingAssetIds } from "./validation";

type Row = Record<string, unknown>;
function contentRow(row: Row): MarketingContent {
  return { id: String(row.id), businessId: String(row.business_id), title: String(row.title), purpose: row.purpose as MarketingContent["purpose"],
    source: row.source as MarketingContent["source"], masterText: String(row.master_text), status: row.status as MarketingContent["status"],
    revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function getMarketingContent(db: DatabaseSync, id: string): MarketingContentDetail {
  const row = db.prepare("SELECT * FROM marketing_contents WHERE id=? AND business_id=?").get(marketingId(id), business(db));
  if (!row) throw new MarketingError("not_found", "İçerik bulunamadı.");
  const variants = db.prepare("SELECT * FROM marketing_content_variants WHERE content_id=? ORDER BY channel").all(id).map((v): MarketingContentVariant => ({
    contentId: id, channel: v.channel as MarketingContentVariant["channel"], title: String(v.title), text: String(v.text),
    mediaAssetId: v.media_asset_id ? String(v.media_asset_id) : undefined, metadata: JSON.parse(String(v.metadata_json)), createdAt: String(v.created_at), updatedAt: String(v.updated_at)
  }));
  const media = db.prepare("SELECT * FROM marketing_content_media WHERE content_id=? ORDER BY sort_order").all(id).map((m) => ({
    contentId: id, mediaAssetId: String(m.media_asset_id), sortOrder: Number(m.sort_order), role: m.role as "primary" | "gallery"
  }));
  return { content: contentRow(row), variants, media };
}
export function listMarketingContents(db: DatabaseSync): MarketingContentDetail[] {
  return db.prepare("SELECT id FROM marketing_contents WHERE business_id=? ORDER BY updated_at DESC,id").all(business(db)).map((r) => getMarketingContent(db, String(r.id)));
}
function validateAssets(db: DatabaseSync, ids: string[], previous: string[] = []) {
  for (const id of ids) {
    const asset = getMediaAsset(db, id);
    if (asset.archivedAt && !previous.includes(id)) throw new MarketingError("archived_asset", "Arşivlenmiş görsel yeni ilişkiye eklenemez.");
  }
}
function retainPendingMedia(db: DatabaseSync, p: MarketingPublication) {
  for (const id of p.mediaAssetIds) db.prepare(`INSERT INTO marketing_publication_pending_media VALUES(?,?,?)
    ON CONFLICT(publication_id,media_asset_id) DO UPDATE SET revision=MAX(revision,excluded.revision)`).run(p.id,id,p.revision);
}
function checkRevision(expected: unknown, current: number) {
  if (expected !== current) throw new MarketingError("stale_revision", "Kayıt değişti. Güncel kaydı açıp tekrar deneyin.");
}
export function saveMarketingContent(db: DatabaseSync, input: MarketingContentInput, source: "manual" | "ai" = "manual"): MarketingContentDetail {
  return transaction(db, () => {
    const old = input.id ? getMarketingContent(db, input.id) : undefined;
    if (old) {
      checkRevision(input.expectedRevision, old.content.revision);
      if (db.prepare("SELECT 1 FROM marketing_share_targets WHERE content_id=?").get(old.content.id)) throw new MarketingError("share_submitted", "İşleme alınmış paylaşımı değiştirmek için yeni paylaşım oluşturun.");
    }
    const title = marketingText(input.title, 240, true), text = marketingText(input.masterText, 12000);
    if (!["announcement", "promotion"].includes(input.purpose) || !["draft", "ready", "archived"].includes(input.status)) throw new MarketingError("invalid_input", "İçerik türü/durumu geçersiz.");
    if (!Array.isArray(input.variants) || input.variants.length > 4 || new Set(input.variants.map(v => v.channel)).size !== input.variants.length) throw new MarketingError("invalid_input", "Kanal varyantları geçersiz.");
    const variants = input.variants.map(v => ({ mediaAssetId: v.mediaAssetId ? marketingId(v.mediaAssetId) : undefined, channel: marketingChannel(v.channel), title: marketingText(v.title ?? "", 240), text: marketingText(v.text, 12000),
      metadata: { version: 1, adaptation: v.metadata?.adaptation === "ai" ? "ai" : "manual" } }));
    if (variants.some(v => v.channel === "sms" && (v.text.length > 160 || /<\/?[A-Za-z][^>]*>/.test(v.text)))) throw new MarketingError("invalid_input", "SMS metni en fazla 160 karakter olabilir.");
    for (const v of variants) if (v.mediaAssetId) {
      if (v.channel !== "instagram") throw new MarketingError("invalid_media", "Kanal görseli yalnız Instagram için destekleniyor.");
      validateAssets(db,[v.mediaAssetId],old?.variants.filter(previous=>previous.channel===v.channel).flatMap(previous=>previous.mediaAssetId?[previous.mediaAssetId]:[]));
    }
    const ids = marketingAssetIds(input.mediaAssetIds); validateAssets(db, ids, old?.media.map(m => m.mediaAssetId));
    const id = old?.content.id ?? `content_${randomUUID()}`, now = new Date().toISOString();
    if (old) db.prepare("UPDATE marketing_contents SET title=?,purpose=?,master_text=?,status=?,revision=revision+1,updated_at=? WHERE id=?")
      .run(title,input.purpose,text,input.status,now,id);
    else db.prepare("INSERT INTO marketing_contents(id,business_id,title,purpose,source,master_text,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(id,business(db),title,input.purpose,source,text,input.status,now,now);
    const channels = variants.map(v => v.channel);
    for (const previous of old?.variants ?? []) if (!channels.includes(previous.channel)) db.prepare("DELETE FROM marketing_content_variants WHERE content_id=? AND channel=?").run(id, previous.channel);
    for (const v of variants) db.prepare(`INSERT INTO marketing_content_variants(content_id,channel,title,text,media_asset_id,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(content_id,channel) DO UPDATE SET title=excluded.title,text=excluded.text,media_asset_id=excluded.media_asset_id,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
      .run(id,v.channel,v.title,v.text,v.mediaAssetId??null,JSON.stringify(v.metadata),now,now);
    db.prepare("DELETE FROM marketing_content_media WHERE content_id=?").run(id);
    ids.forEach((assetId,index) => db.prepare("INSERT INTO marketing_content_media VALUES(?,?,?,?)").run(id,assetId,index,index===0?"primary":"gallery"));
    return getMarketingContent(db,id);
  });
}
function publicationRow(db: DatabaseSync, r: Row): MarketingPublication {
  const state = r.channel === "instagram" ? db.prepare("SELECT container_id,provider_media_id,permalink,failure_code FROM instagram_publication_state WHERE publication_id=?").get(String(r.id)) : undefined;
  return {id:String(r.id),businessId:String(r.business_id),contentId:String(r.content_id),channel:r.channel as MarketingPublication["channel"],
    ...(state ? {providerSummary:{containerId:String(state.container_id),mediaId:String(state.provider_media_id),permalink:String(state.permalink),failureCode:String(state.failure_code)}} : {}),
    status:r.status as MarketingPublication["status"],placement:"homepage_feature",title:String(r.title),text:String(r.text),
    mediaAssetIds:db.prepare("SELECT media_asset_id FROM marketing_publication_media WHERE publication_id=? ORDER BY sort_order").all(String(r.id)).map(m => String(m.media_asset_id)),
    revision:Number(r.revision),publishedRevision:Number(r.published_revision),desiredPublished:Number(r.desired_published)===1,
    publishedAt:String(r.published_at),unpublishedAt:String(r.unpublished_at),createdAt:String(r.created_at),updatedAt:String(r.updated_at)};
}
export function getMarketingPublication(db: DatabaseSync, id: string): MarketingPublication {
  const r = db.prepare("SELECT * FROM marketing_publications WHERE id=? AND business_id=?").get(marketingId(id),business(db));
  if (!r) throw new MarketingError("not_found", "Yayın bulunamadı."); return publicationRow(db,r);
}
export function listMarketingPublications(db: DatabaseSync): MarketingPublication[] {
  return db.prepare("SELECT * FROM marketing_publications WHERE business_id=? ORDER BY created_at DESC,id").all(business(db)).map(r => publicationRow(db,r));
}
export function saveMarketingPublication(db: DatabaseSync, input: MarketingPublicationInput, retainedMediaIds: readonly string[] = []): MarketingPublication {
  return transaction(db, () => {
    marketingChannel(input.channel);
    if (!(["website", "instagram"].includes(input.channel)) || input.placement !== "homepage_feature") throw new MarketingError("channel_unavailable", "Bu kanal henüz yayın desteklemiyor.");
    const old = input.id ? getMarketingPublication(db,input.id) : undefined;
    if (old) {
      checkRevision(input.expectedRevision,old.revision);
      if (old.channel !== input.channel) throw new MarketingError("invalid_input", "Yayın kanalı değiştirilemez.");
      if (old.channel === "instagram") {
        const state = db.prepare("SELECT create_submitted,container_id FROM instagram_publication_state WHERE publication_id=?").get(old.id);
        if (old.status === "published" || old.status === "publishing" || Number(state?.create_submitted) === 1 || state?.container_id) throw new MarketingError("publication_immutable", "Gönderilmiş Instagram içeriği değiştirilemez. Yeni yayın oluşturun.");
      }
    }
    const content = getMarketingContent(db,input.contentId).content;
    if (content.status === "archived") throw new MarketingError("archived_content", "Arşivlenmiş içerik yayınlanamaz.");
    if (old && old.contentId !== content.id) throw new MarketingError("invalid_input", "Yayının içerik kimliği değiştirilemez.");
    const ids = marketingAssetIds(input.mediaAssetIds); validateAssets(db,ids,[...(old?.mediaAssetIds??[]),...retainedMediaIds]);
    if (input.channel === "instagram" && ids.length !== 1) throw new MarketingError("invalid_media", "Instagram için bir görsel seçin.");
    const title = marketingText(input.title,240,true), text = marketingText(input.text,input.channel === "instagram" ? 2200 : 12000,input.channel === "website");
    const id = old?.id ?? `publication_${randomUUID()}`, now = new Date().toISOString();
    if (old) db.prepare("UPDATE marketing_publications SET title=?,text=?,revision=revision+1,status=?,updated_at=? WHERE id=?")
      .run(title,text,old.desiredPublished?"publishing":old.status,now,id);
    else db.prepare("INSERT INTO marketing_publications(id,business_id,content_id,channel,status,placement,title,text,created_at,updated_at) VALUES(?,?,?,?,'draft',?,?,?,?,?)")
      .run(id,business(db),content.id,input.channel,input.placement,title,text,now,now);
    db.prepare("DELETE FROM marketing_publication_media WHERE publication_id=?").run(id);
    ids.forEach((assetId,index) => db.prepare("INSERT INTO marketing_publication_media VALUES(?,?,?)").run(id,assetId,index));
    if (old?.desiredPublished && old.channel === "website") {retainPendingMedia(db,old);retainPendingMedia(db,getMarketingPublication(db,id));queueSyncJob(db,"marketing_website_publish");}
    const saved=getMarketingPublication(db,id); captureMarketingPublicationRevision(db,saved); return saved;
  });
}
export function requestMarketingPublication(db: DatabaseSync, id: string, expected: number, published: boolean): MarketingPublication {
  return transaction(db,() => {
    const p = getMarketingPublication(db,id); checkRevision(expected,p.revision);
    if (p.channel !== "website") throw new MarketingError("channel_unavailable", "Bu işlem yalnız Website içindir.");
    if (published && getMarketingContent(db,p.contentId).content.status === "archived") throw new MarketingError("archived_content", "Arşivlenmiş içerik yayınlanamaz.");
    if (p.desiredPublished === published && ["publishing","published","unpublished"].includes(p.status)) return p;
    db.prepare("UPDATE marketing_publications SET desired_published=?,revision=revision+1,status='publishing',updated_at=? WHERE id=?")
      .run(published?1:0,new Date().toISOString(),id);
    const next=getMarketingPublication(db,id);retainPendingMedia(db,next);
    queueSyncJob(db,"marketing_website_publish"); return next;
  });
}
/** Match the sent snapshot, never acknowledge a newer intent that arrived during upload. */
export function acknowledgeMarketingPublications(db: DatabaseSync, sent: MarketingPublication[], now: string): void {
  transaction(db,() => {
    for (const p of sent) {
      db.prepare("DELETE FROM marketing_publication_pending_media WHERE publication_id=? AND revision<=?").run(p.id,p.revision);
      db.prepare(`UPDATE marketing_publications SET published_revision=MAX(published_revision,?),published_snapshot_json=?,
        published_at=CASE WHEN ?=1 THEN ? ELSE published_at END,unpublished_at=CASE WHEN ?=0 THEN ? ELSE unpublished_at END,
        status=CASE WHEN revision=? THEN ? ELSE status END WHERE id=? AND published_revision<=?`)
        .run(p.revision,JSON.stringify(p.desiredPublished?{mediaAssetIds:p.mediaAssetIds}:{}),p.desiredPublished?1:0,now,p.desiredPublished?1:0,now,
          p.revision,p.desiredPublished?"published":"unpublished",p.id,p.revision);
    }
  });
}
export function failMarketingPublications(db: DatabaseSync, sent: MarketingPublication[]) {
  for (const p of sent) db.prepare("UPDATE marketing_publications SET status='failed' WHERE id=? AND revision=? AND status='publishing'").run(p.id,p.revision);
}
/** Local-only redaction vocabulary. This list never enters provider requests. */
export function marketingPrivateNames(db: DatabaseSync): string[] {
  return db.prepare("SELECT full_name FROM customers WHERE full_name<>''").all().map(r => String(r.full_name));
}

/** Canonical editorial revision history; no provider state, bytes or scheduler-owned content copy. */
export function captureMarketingPublicationRevision(db: DatabaseSync,p: MarketingPublication): void {
  const content=getMarketingContent(db,p.contentId).content;
  db.prepare("INSERT INTO marketing_publication_revisions(publication_id,revision,content_revision,snapshot_json,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING")
    .run(p.id,p.revision,content.revision,JSON.stringify({contentId:p.contentId,channel:p.channel,placement:p.placement,title:p.title,text:p.text,mediaAssetIds:p.mediaAssetIds}),new Date().toISOString());
}
