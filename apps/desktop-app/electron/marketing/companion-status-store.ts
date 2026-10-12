import type { DatabaseSync } from "node:sqlite";
import type { AndroidMarketingSnapshot } from "@yardimci-asistan/sync-core";
import { marketingBusiness } from "./marketing-persistence";

/** Canonical status facts only. Never load editorial text, recipients or provider errors. */
export function readMarketingCompanionStatus(db: DatabaseSync): AndroidMarketingSnapshot {
  const businessId = marketingBusiness(db);
  const publications = db.prepare(`SELECT id,channel,status,revision,published_revision,desired_published,updated_at
    FROM marketing_publications WHERE business_id=? ORDER BY updated_at DESC,id DESC LIMIT 50`).all(businessId);
  const schedules = db.prepare(`SELECT s.id,s.channel,s.target_type,s.status,s.next_run_at,s.updated_at,
    COALESCE((SELECT e.status FROM marketing_schedule_executions e WHERE e.schedule_id=s.id
      ORDER BY e.planned_at DESC,e.id DESC LIMIT 1),'') AS last_execution_status
    FROM marketing_schedules s WHERE s.business_id=? ORDER BY s.updated_at DESC,s.id DESC LIMIT 50`).all(businessId);
  const campaigns = db.prepare(`SELECT c.id,c.channel,c.status,c.updated_at,
    (SELECT COUNT(*) FROM messaging_outbox o WHERE o.campaign_id=c.id AND o.business_id=c.business_id
      AND o.status IN ('pending','claimed')) AS pending_count,
    (SELECT COUNT(*) FROM messaging_outbox o WHERE o.campaign_id=c.id AND o.business_id=c.business_id
      AND o.status='failed') AS failed_count
    FROM messaging_campaigns c WHERE c.business_id=? ORDER BY c.updated_at DESC,c.id DESC LIMIT 50`).all(businessId);
  return {
    publications: publications.map(r => ({ id: String(r.id), channel: r.channel as AndroidMarketingSnapshot["publications"][number]["channel"],
      status: r.status as AndroidMarketingSnapshot["publications"][number]["status"], revision: Number(r.revision),
      published_revision: Number(r.published_revision), desired_published: Number(r.desired_published) === 1, updated_at: String(r.updated_at) })),
    schedules: schedules.map(r => ({ id: String(r.id), channel: r.channel as AndroidMarketingSnapshot["schedules"][number]["channel"],
      target_type: r.target_type as AndroidMarketingSnapshot["schedules"][number]["target_type"],
      status: r.status as AndroidMarketingSnapshot["schedules"][number]["status"], next_run_at: String(r.next_run_at),
      last_execution_status: r.last_execution_status as AndroidMarketingSnapshot["schedules"][number]["last_execution_status"], updated_at: String(r.updated_at) })),
    campaigns: campaigns.map(r => ({ id: String(r.id), channel: r.channel as "whatsapp" | "sms",
      status: r.status as AndroidMarketingSnapshot["campaigns"][number]["status"], pending_count: Number(r.pending_count),
      failed_count: Number(r.failed_count), updated_at: String(r.updated_at) }))
  };
}
