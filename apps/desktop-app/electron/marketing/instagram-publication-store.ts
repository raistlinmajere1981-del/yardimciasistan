import type { DatabaseSync } from "node:sqlite";
import type { InstagramPublicationState } from "@yardimci-asistan/shared";
import { marketingTransaction } from "./marketing-persistence";
import { getMarketingPublication, getMarketingContent } from "./store";
import { MarketingError } from "./validation";
export function instagramPublicationState(db: DatabaseSync, id: string): InstagramPublicationState | null {
  getMarketingPublication(db, id);
  const r = db.prepare("SELECT * FROM instagram_publication_state WHERE publication_id=?").get(id);
  return r ? { publicationId: id, accountKey: String(r.account_key), containerId: String(r.container_id), providerMediaId: String(r.provider_media_id), permalink: String(r.permalink), createSubmitted: Number(r.create_submitted) === 1, publishSubmitted: Number(r.publish_submitted) === 1, failureCode: String(r.failure_code), stageToken: String(r.stage_token), stageExpiresAt: String(r.stage_expires_at), stageBaseUrl: String(r.stage_base_url) } : null;
}
export function beginInstagramPublication(db: DatabaseSync, id: string, revision: number, accountKey: string, stage: { token: string; expiresAt: string; baseUrl: string }) {
  return marketingTransaction(db, () => {
    const p = getMarketingPublication(db, id), state = instagramPublicationState(db, id);
    if (p.channel !== "instagram" || p.revision !== revision) throw new MarketingError("stale_revision", "Güncel Instagram yayınını açın.");
    if (getMarketingContent(db,p.contentId).content.status === "archived") throw new MarketingError("archived_content", "Arşivlenmiş içerik yayınlanamaz.");
    if (state && state.accountKey !== accountKey) throw new MarketingError("account_changed", "Yayının Instagram hesabı değişmiş.");
    if (p.status === "published") return state!;
    if (!state) db.prepare("INSERT INTO instagram_publication_state(publication_id,account_key,stage_token,stage_expires_at,stage_base_url) VALUES(?,?,?,?,?)").run(id, accountKey, stage.token, stage.expiresAt, stage.baseUrl);
    else if (!state.createSubmitted && !state.containerId && (!state.stageToken || Date.parse(state.stageExpiresAt) <= Date.now())) db.prepare("UPDATE instagram_publication_state SET stage_token=?,stage_expires_at=?,stage_base_url=? WHERE publication_id=?").run(stage.token,stage.expiresAt,stage.baseUrl,id);
    db.prepare("UPDATE marketing_publications SET status='publishing',desired_published=1,updated_at=? WHERE id=?").run(new Date().toISOString(),id);
    return instagramPublicationState(db,id)!;
  });
}
export function claimInstagramSubmission(db: DatabaseSync, id: string, phase: "create" | "publish") {
  const column = phase === "create" ? "create_submitted" : "publish_submitted";
  return Boolean(db.prepare(`UPDATE instagram_publication_state SET ${column}=1,failure_code='' WHERE publication_id=? AND ${column}=0
    AND ${phase === "create" ? "container_id=''" : "container_id!=''"}
    AND EXISTS(SELECT 1 FROM marketing_publications p WHERE p.id=publication_id AND p.status='publishing')`).run(id).changes);
}
export function recordInstagramContainer(db: DatabaseSync, id: string, containerId: string) {
  if (!/^\d{1,64}$/.test(containerId)) throw new MarketingError("invalid_reference", "Instagram container kimliği geçersiz.");
  db.prepare("UPDATE instagram_publication_state SET container_id=?,failure_code='' WHERE publication_id=? AND create_submitted=1 AND container_id=''").run(containerId,id);
}
export function finishInstagramPublication(db: DatabaseSync, id: string, result: { mediaId?: string; permalink?: string; failureCode?: string; rejectedPhase?: "create" | "publish" }) {
  return marketingTransaction(db, () => {
    const p = getMarketingPublication(db,id);
    if (result.failureCode && p.status === "published") return p; // An authoritative late receipt wins.
    if (result.failureCode) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(result.failureCode)) throw new MarketingError("invalid_error", "Instagram hata kodu geçersiz.");
      const reset = result.rejectedPhase === "create" ? ",create_submitted=0" : result.rejectedPhase === "publish" ? ",publish_submitted=0" : "";
      db.prepare(`UPDATE instagram_publication_state SET failure_code=?${reset} WHERE publication_id=?`).run(result.failureCode,id);
      db.prepare("UPDATE marketing_publications SET status='failed',updated_at=? WHERE id=?").run(new Date().toISOString(),id);
    } else {
      if (result.mediaId && !/^\d{1,64}$/.test(result.mediaId)) throw new MarketingError("invalid_reference", "Instagram medya kimliği geçersiz.");
      db.prepare("UPDATE instagram_publication_state SET provider_media_id=CASE WHEN ?!='' THEN ? ELSE provider_media_id END,permalink=CASE WHEN ?!='' THEN ? ELSE permalink END,failure_code='' WHERE publication_id=?")
        .run(result.mediaId ?? "",result.mediaId ?? "",result.permalink ?? "",result.permalink ?? "",id);
      db.prepare("UPDATE marketing_publications SET status='published',published_revision=revision,published_at=?,updated_at=? WHERE id=?").run(new Date().toISOString(),new Date().toISOString(),id);
    }
    return getMarketingPublication(db,id);
  });
}
export function clearInstagramStage(db: DatabaseSync, id: string) { db.prepare("UPDATE instagram_publication_state SET stage_token='',stage_expires_at='' WHERE publication_id=?").run(id); }
