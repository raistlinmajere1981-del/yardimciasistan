import type { DatabaseSync } from "node:sqlite";
import type { MarketingCampaignAnalytics, MarketingPublicationAnalytics, MarketingMetricName } from "@yardimci-asistan/shared";
import { marketingBusiness } from "./marketing-persistence";

type Row = Record<string, unknown>;
function campaign(row: Row) {
  return { id: String(row.id), channel: row.channel as MarketingCampaignAnalytics["channel"], status: row.status as MarketingCampaignAnalytics["status"], createdAt: String(row.created_at), preparedAt: String(row.prepared_at), eligible: row.eligible == null ? null : Number(row.eligible) };
}
function publication(row: Row) {
  return { id: String(row.id), channel: row.channel as MarketingPublicationAnalytics["channel"], status: row.status as MarketingPublicationAnalytics["status"], createdAt: String(row.created_at), publishedAt: String(row.published_at), unpublishedAt: String(row.unpublished_at), updatedAt: String(row.updated_at), providerTargetId: String(row.provider_media_id ?? ""), providerAccountKey: String(row.provider_account_key ?? "") };
}
/** Whitelisted canonical facts only. No Customer, content, parameters, secrets or raw responses. */
export function readMarketingAnalyticsRecords(db: DatabaseSync, startAt: string, endAt: string, target?: { type: "campaign" | "publication"; id: string }) {
  const business = marketingBusiness(db);
  const campaigns = target?.type === "publication" ? [] : db.prepare(`SELECT id,channel,status,created_at,prepared_at,
    json_extract(preparation_counts_json,'$.eligibleCount') AS eligible FROM messaging_campaigns WHERE business_id=?
    AND ${target ? "id=?" : "created_at>=? AND created_at<?"} ORDER BY created_at DESC,id`).all(business, ...(target ? [target.id] : [startAt, endAt])).map(campaign);
  const recipients = target?.type === "publication" ? [] : db.prepare(`SELECT r.campaign_id,r.created_at,r.status AS recipient_status,c.channel,
    o.status AS outbox_status,o.attempt_count,m.status AS message_status,m.accepted_at,m.delivered_at,m.read_at
    FROM messaging_campaign_recipients r JOIN messaging_campaigns c ON c.id=r.campaign_id AND c.business_id=?
    LEFT JOIN messaging_outbox o ON o.campaign_recipient_id=r.id AND o.business_id=c.business_id
    LEFT JOIN business_messages m ON m.id=o.business_message_id AND m.business_id=c.business_id AND m.purpose='marketing'
    WHERE ${target ? "c.id=?" : "r.created_at>=? AND r.created_at<?"} ORDER BY r.created_at,r.id`).all(business, ...(target ? [target.id] : [startAt, endAt])).map(r => ({
      campaignId: String(r.campaign_id), channel: r.channel as "whatsapp" | "sms", createdAt: String(r.created_at), recipientStatus: String(r.recipient_status), outboxStatus: String(r.outbox_status ?? ""), attempts: Number(r.attempt_count ?? 0), messageStatus: String(r.message_status ?? ""), acceptedAt: String(r.accepted_at ?? ""), deliveredAt: String(r.delivered_at ?? ""), readAt: String(r.read_at ?? "")
    }));
  const publications = target?.type === "campaign" ? [] : db.prepare(`SELECT p.id,p.channel,p.status,p.created_at,p.published_at,p.unpublished_at,p.updated_at,
    i.provider_media_id,i.account_key AS provider_account_key FROM marketing_publications p
    LEFT JOIN instagram_publication_state i ON i.publication_id=p.id WHERE p.business_id=?
    AND ${target ? "p.id=?" : "p.created_at>=? AND p.created_at<?"} ORDER BY p.created_at DESC,p.id`).all(business, ...(target ? [target.id] : [startAt, endAt])).map(publication);
  // A confirmed public snapshot may still be active while a newer update/unpublish awaits acknowledgement.
  const activeWebsitePublications = Number(db.prepare(`SELECT COUNT(*) AS count FROM marketing_publications
    WHERE business_id=? AND channel='website' AND published_revision>0 AND published_snapshot_json<>'{}'`).get(business)?.count ?? 0);
  return { campaigns, recipients, publications, activeWebsitePublications };
}

export interface MarketingMetricSnapshot {
  targetId: string; providerKey: string; metric: MarketingMetricName; value: number; measuredAt: string; expiresAt: string;
}
export function readMarketingMetricSnapshots(db: DatabaseSync, targetId: string, providerKey: string, startAt: string, endAt: string): MarketingMetricSnapshot[] {
  return db.prepare(`SELECT target_id,provider_key,metric,value,measured_at,expires_at FROM marketing_metric_snapshots
    WHERE business_id=? AND target_id=? AND provider_key=? AND range_start=? AND range_end=?`).all(marketingBusiness(db), targetId, providerKey, startAt, endAt).map(r => ({ targetId: String(r.target_id), providerKey: String(r.provider_key), metric: r.metric as MarketingMetricName, value: Number(r.value), measuredAt: String(r.measured_at), expiresAt: String(r.expires_at) }));
}
export function saveMarketingMetricSnapshots(db: DatabaseSync, records: MarketingMetricSnapshot[], startAt: string, endAt: string) {
  db.exec("SAVEPOINT marketing_metrics");
  try {
    for (const r of records) db.prepare(`INSERT INTO marketing_metric_snapshots(business_id,target_type,target_id,channel,provider_key,metric,range_start,range_end,value,measured_at,expires_at)
      VALUES(?,'publication',?,'instagram',?,?,?,?,?,?,?) ON CONFLICT(business_id,target_id,provider_key,metric,range_start,range_end)
      DO UPDATE SET value=excluded.value,measured_at=excluded.measured_at,expires_at=excluded.expires_at`).run(marketingBusiness(db), r.targetId, r.providerKey, r.metric, startAt, endAt, r.value, r.measuredAt, r.expiresAt);
    // Retain stale data for failed refresh; bound the entire table rather than deleting expired evidence.
    db.prepare("DELETE FROM marketing_metric_snapshots WHERE rowid IN (SELECT rowid FROM marketing_metric_snapshots ORDER BY measured_at DESC,rowid DESC LIMIT -1 OFFSET 1000)").run();
    db.exec("RELEASE marketing_metrics");
  } catch (error) { db.exec("ROLLBACK TO marketing_metrics; RELEASE marketing_metrics"); throw error; }
}
