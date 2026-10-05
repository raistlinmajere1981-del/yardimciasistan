import type { DatabaseSync } from "node:sqlite";
import type { MediaAsset } from "@yardimci-asistan/shared";
import { marketingBusiness as business, marketingTransaction as transaction } from "./marketing-persistence";
import { MarketingError, marketingText, marketingId } from "./validation";
type Row = Record<string, unknown>;
function assetRow(r: Row): MediaAsset {
  const metadata = JSON.parse(String(r.ai_metadata_json));
  return { id: String(r.id),businessId: String(r.business_id),kind:"image",source:r.source as MediaAsset["source"],storageRef:String(r.storage_ref),
    mimeType:String(r.mime_type),width:Number(r.width),height:Number(r.height),fileSize:Number(r.file_size),altText:String(r.alt_text),contentHash:String(r.content_hash),
    ...(metadata.providerId ? { aiGenerationMetadata: metadata } : {}),createdAt:String(r.created_at),...(r.archived_at ? {archivedAt:String(r.archived_at)} : {}) };
}
export function getMediaAsset(db: DatabaseSync, id: string): MediaAsset {
  const r = db.prepare("SELECT * FROM media_assets WHERE id=? AND business_id=?").get(marketingId(id),business(db));
  if (!r) throw new MarketingError("not_found", "Görsel bulunamadı."); return assetRow(r);
}
export function listMediaAssets(db: DatabaseSync): MediaAsset[] { return db.prepare("SELECT * FROM media_assets WHERE business_id=? ORDER BY created_at DESC,id").all(business(db)).map(assetRow); }
export function insertMediaAsset(db: DatabaseSync, asset: Omit<MediaAsset,"businessId">): MediaAsset {
  const m = asset.aiGenerationMetadata;
  const metadata = m ? {providerId:marketingText(m.providerId,80,true),modelId:marketingText(m.modelId,160,true),intent:"marketing_image"} : {};
  db.prepare("INSERT INTO media_assets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(asset.id,business(db),"image",asset.source,asset.storageRef,asset.mimeType,
    asset.width,asset.height,asset.fileSize,marketingText(asset.altText,500),JSON.stringify(metadata),asset.contentHash,asset.createdAt,"");
  return getMediaAsset(db,asset.id);
}
export function assetUsage(db: DatabaseSync, id: string): {usageCount:number;activePublicationCount:number} {
  getMediaAsset(db,id);
  const variantCount = Number(db.prepare("SELECT COUNT(*) AS n FROM marketing_content_variants v JOIN marketing_contents c ON c.id=v.content_id WHERE v.media_asset_id=? AND c.business_id=?").get(id,business(db))?.n);
  const contentCount = Number(db.prepare("SELECT COUNT(*) AS n FROM marketing_content_media WHERE media_asset_id=?").get(id)?.n);
  const pending = db.prepare("SELECT publication_id FROM marketing_publication_pending_media WHERE media_asset_id=?").all(id).map(r => String(r.publication_id));
  const pubs = db.prepare(`SELECT p.id,p.desired_published FROM marketing_publications p
    JOIN marketing_publication_media m ON m.publication_id=p.id WHERE m.media_asset_id=? AND p.business_id=?`).all(id,business(db));
  const snapshots = db.prepare("SELECT id,published_snapshot_json FROM marketing_publications WHERE business_id=?").all(business(db))
    .filter(r => (JSON.parse(String(r.published_snapshot_json)).mediaAssetIds ?? []).includes(id));
  const planned = db.prepare(`SELECT s.id,r.snapshot_json FROM marketing_schedules s JOIN marketing_publication_revisions r
    ON r.publication_id=s.target_id AND r.revision=s.target_revision WHERE s.business_id=? AND
    (s.status IN ('active','paused') OR EXISTS(SELECT 1 FROM marketing_schedule_executions e WHERE e.schedule_id=s.id AND e.status IN ('pending','claimed')))`)
    .all(business(db)).filter(r=>(JSON.parse(String(r.snapshot_json)).mediaAssetIds ?? []).includes(id)).length;
  return {usageCount:contentCount+variantCount+planned+new Set([...pubs.map(p => String(p.id)),...snapshots.map(r => String(r.id)),...pending]).size,
    activePublicationCount:new Set([...pubs.filter(p => Number(p.desired_published)===1).map(p => String(p.id)),...snapshots.map(r => String(r.id)),...pending]).size};
}
export function manageMediaAsset(db: DatabaseSync, id: string, action: "archive" | "delete", altText?: string): void {
  transaction(db,() => {
    getMediaAsset(db,id);
    if (action === "delete") {
      if (assetUsage(db,id).usageCount) throw new MarketingError("asset_in_use", "Kullanılan görsel silinemez. İlişkileri kaldırın ve yayın onayını bekleyin veya arşivleyin.");
      db.prepare("DELETE FROM media_assets WHERE id=?").run(id);
    } else if (action === "archive") db.prepare("UPDATE media_assets SET archived_at=? WHERE id=?").run(new Date().toISOString(),id);
    else throw new MarketingError("invalid_input", "Medya işlemi geçersiz.");
    if (altText !== undefined && action !== "delete") db.prepare("UPDATE media_assets SET alt_text=? WHERE id=?").run(marketingText(altText,500),id);
  });
}
