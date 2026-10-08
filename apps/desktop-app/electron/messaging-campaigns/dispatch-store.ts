import type { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { normalizePhone, type BusinessMessageTemplate, type MessagingOutboxItem } from "@yardimci-asistan/shared";
import { claimBusinessMessageInTransaction, getBusinessMessage, getMessageBinding, insertBusinessMessage, failBusinessMessage,
  refreshUnsubmittedBusinessMessageInTransaction, releaseRejectedBusinessMessageInTransaction } from "../business-messaging/store";
import { assertCampaignCapabilities, campaignTransaction, getMessagingCampaign, getMessagingCampaignDetail } from "./store";
import { invalid, validateSmsText, resolveCampaignBindings, validateCampaignTemplate } from "./validation";
import { reconcile, type DispatchClaim, type DispatchResult } from "./dispatch-contract";

function item(row: Record<string, unknown>): MessagingOutboxItem {
  return { id: String(row.id), businessId: String(row.business_id), campaignId: String(row.campaign_id), campaignRecipientId: String(row.campaign_recipient_id),
    customerId: String(row.customer_id), channel: row.channel as MessagingOutboxItem["channel"], providerId: row.provider_id as MessagingOutboxItem["providerId"],
    ...(row.business_message_id ? { businessMessageId: String(row.business_message_id) } : {}), status: row.status as MessagingOutboxItem["status"],
    claimToken: String(row.claim_token), claimedAt: String(row.claimed_at), operationKey: String(row.operation_key), attemptCount: Number(row.attempt_count),
    nextAttemptAt: String(row.next_attempt_at), lastError: String(row.last_error), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function getDispatchClaim(db: DatabaseSync, id: string, token: string): DispatchClaim | null {
  const row = db.prepare("SELECT * FROM messaging_outbox WHERE id=? AND status='claimed' AND claim_token=?").get(id, token);
  if (!row) return null;
  const value = item(row);
  return { item: value, campaign: getMessagingCampaign(db, value.campaignId), message: value.businessMessageId ? getBusinessMessage(db, value.businessMessageId) : null,
    submitted: value.businessMessageId ? Number(getMessageBinding(db, value.businessMessageId)?.submitted) === 1 : false };
}
/** Lease recovery never resets the BusinessMessage submission fence. Late responses may still persist its receipt. */
export function recoverDispatchClaims(db: DatabaseSync, now: string, staleBefore: string) {
  return campaignTransaction(db, () => {
    const rows = db.prepare(`SELECT o.*,c.status AS campaign_status,m.provider_message_id,b.submitted
      FROM messaging_outbox o JOIN messaging_campaigns c ON c.id=o.campaign_id
      LEFT JOIN business_messages m ON m.id=o.business_message_id LEFT JOIN business_message_provider_bindings b ON b.message_id=m.id
      WHERE o.status='claimed' AND o.claimed_at<=?`).all(staleBefore);
    for (const row of rows) {
      const status = row.provider_message_id ? "dispatched" : row.campaign_status === "cancelled" ? (Number(row.submitted) === 1 ? "failed" : "cancelled") : "pending";
      db.prepare("UPDATE messaging_outbox SET status=?,claim_token='',claimed_at='',next_attempt_at=?,last_error=?,updated_at=? WHERE id=? AND claim_token=?")
        .run(status, now, status === "failed" ? "submission_uncertain" : String(row.last_error), now, row.id ?? "", row.claim_token ?? "");
    }
    return rows.length;
  });
}
export function claimDispatchBatch(db: DatabaseSync, now: string, size: number): MessagingOutboxItem[] {
  if (!Number.isInteger(size) || size < 1 || size > 20) invalid("invalid_batch", "Gönderim politikası geçersiz.");
  return campaignTransaction(db, () => {
    assertCampaignCapabilities(db);
    const rows = db.prepare(`SELECT o.* FROM messaging_outbox o JOIN messaging_campaigns c ON c.id=o.campaign_id
      WHERE o.status='pending' AND o.next_attempt_at<=? AND c.status='running'
      AND c.business_id=(SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1)
      ORDER BY o.next_attempt_at,o.created_at,o.id LIMIT ?`).all(now, size);
    return rows.map((row) => {
      const token = randomUUID();
      db.prepare("UPDATE messaging_outbox SET status='claimed',claim_token=?,claimed_at=?,attempt_count=attempt_count+1,updated_at=? WHERE id=? AND status='pending'")
        .run(token, now, now, row.id ?? "");
      return item({ ...row, status: "claimed", claim_token: token, claimed_at: now, attempt_count: Number(row.attempt_count) + 1, updated_at: now });
    });
  });
}
export function transitionCampaignDispatch(db: DatabaseSync, id: string, action: "start" | "pause" | "resume", onAccepted?: () => void) {
  return campaignTransaction(db, () => {
    const campaign = getMessagingCampaign(db, id), from = { start: "prepared", pause: "running", resume: "paused" }[action], to = action === "pause" ? "paused" : "running";
    if (campaign.status === to) { onAccepted?.(); return getMessagingCampaignDetail(db, id); }
    if (campaign.status !== from) invalid("invalid_transition", "Kampanya durumu bu işlem için uygun değil.");
    db.prepare("UPDATE messaging_campaigns SET status=?,updated_at=? WHERE id=? AND status=?").run(to, new Date().toISOString(), id, from);
    onAccepted?.();
    return getMessagingCampaignDetail(db, id);
  });
}
export type CampaignSubmission = DispatchResult | { kind: "ready"; message: NonNullable<DispatchClaim["message"]>; parameters: string[][] };
/** Final synchronous eligibility check + rate permit + canonical message attachment + submission fence, one transaction. */
export function beginCampaignSubmission(db: DatabaseSync, id: string, token: string, template: BusinessMessageTemplate | null, accountKey: string, now: string, intervalMs: number): CampaignSubmission {
  return campaignTransaction(db, () => {
    const claim = getDispatchClaim(db, id, token);
    if (!claim) return { kind: "deferred", nextAttemptAt: now };
    if (claim.submitted) return reconcile(claim);
    if (claim.campaign.status !== "running") return claim.campaign.status === "cancelled" ? { kind: "failed", category: "campaign_cancelled" } : { kind: "deferred", nextAttemptAt: now };
    const customer = db.prepare(`SELECT c.id,c.phone,c.full_name,p.company_name,COALESCE(pref.status,'unknown') AS consent
      FROM customers c LEFT JOIN customer_commercial_profiles p ON p.customer_id=c.id AND p.business_id=?
      LEFT JOIN customer_messaging_preferences pref ON pref.customer_id=c.id AND pref.business_id=? AND pref.channel=? AND pref.purpose='marketing'
      WHERE c.id=? AND c.deleted_at='' AND (c.business_id IS NULL OR c.business_id=?)`)
      .get(claim.item.businessId, claim.item.businessId, claim.item.channel, claim.item.customerId, claim.item.businessId);
    if (!customer) return { kind: "skipped", category: "customer_unavailable" };
    if (customer.consent !== "opted_in") return { kind: "skipped", category: customer.consent === "opted_out" ? "opted_out" : "unknown_consent" };
    const phone = normalizePhone(String(customer.phone));
    if (!phone.ok) return { kind: "skipped", category: "missing_recipient" };
    if (claim.item.channel === "whatsapp") {
      if (!template) invalid("missing_template", "Onaylı şablon artık kullanılamıyor.");
      validateCampaignTemplate(claim.campaign, template);
      const shape = (value: BusinessMessageTemplate) => value.components.map(({ type, parameters }) => ({ type, parameters }));
      if (!claim.campaign.templateSnapshot || JSON.stringify(shape(template)) !== JSON.stringify(shape(claim.campaign.templateSnapshot))) return { kind: "failed", category: "template_changed" };
    } else validateSmsText(claim.campaign.text);
    const parameters = claim.item.channel === "sms" ? [] : resolveCampaignBindings(claim.campaign.bindings, { fullName: String(customer.full_name), companyName: String(customer.company_name ?? "") });
    const existingBinding = claim.message ? getMessageBinding(db, claim.message.id) : null;
    if (existingBinding && existingBinding.account_key !== accountKey) return { kind: "failed", category: "account_changed" };
    const gate = db.prepare("SELECT next_dispatch_at FROM messaging_dispatch_runtime WHERE business_id=?").get(claim.item.businessId);
    if (gate && String(gate.next_dispatch_at) > now) return { kind: "deferred", nextAttemptAt: String(gate.next_dispatch_at) };
    db.prepare(`INSERT INTO messaging_dispatch_runtime(business_id,next_dispatch_at) VALUES (?,?)
      ON CONFLICT(business_id) DO UPDATE SET next_dispatch_at=excluded.next_dispatch_at`)
      .run(claim.item.businessId, new Date(Date.parse(now) + intervalMs).toISOString());
    const hash = createHash("sha256").update(JSON.stringify(claim.item.channel === "sms" ? [claim.item.customerId, phone.whatsapp, "sms", claim.campaign.text] : [claim.item.customerId, phone.whatsapp, template!.name, template!.language, parameters])).digest("hex");
    let message = claim.message;
    if (!message) {
      message = insertBusinessMessage(db, { customerId: claim.item.customerId, recipient: phone.whatsapp, templateName: template?.name ?? "", templateLanguage: template?.language ?? "", providerId: claim.item.providerId, messageKind: claim.item.channel === "sms" ? "text" : "template",
        intentHash: hash, accountKey, campaignId: claim.campaign.id, campaignRecipientId: claim.item.campaignRecipientId });
      db.prepare("UPDATE messaging_outbox SET business_message_id=? WHERE id=? AND claim_token=?").run(message.id, id, token);
    } else {
      // Only a proven-rejected, unsubmitted intent can pick up changed canonical contact/bindings on retry.
      if (!refreshUnsubmittedBusinessMessageInTransaction(db, message.id, { recipient: phone.whatsapp, intentHash: hash, accountKey })) {
        return { kind: "failed", category: "submission_conflict" };
      }
    }
    if (!claimBusinessMessageInTransaction(db, message.id)) return { kind: "failed", category: "submission_conflict" };
    return { kind: "ready", message: getBusinessMessage(db, message.id)!, parameters };
  });
}
/** Only the adapter's explicit rejection can reopen a submitted campaign message. */
export function releaseRejectedCampaignMessage(db: DatabaseSync, id: string, token: string) {
  return campaignTransaction(db, () => {
    const claim = getDispatchClaim(db, id, token);
    if (!claim?.message) return false;
    return releaseRejectedBusinessMessageInTransaction(db, claim.message.id);
  });
}
export function finishDispatchClaim(db: DatabaseSync, id: string, token: string, result: DispatchResult, now: string, nextAttemptAt = "", rateLimitUntil = "") {
  return campaignTransaction(db, () => {
    const claim = getDispatchClaim(db, id, token);
    if (!claim) return false; // A stale worker cannot mutate another lease.
    // A receipt can arrive during error/backoff handling. Provider acceptance wins over a local retry/error.
    if (claim.submitted && reconcile(claim).kind === "accepted") result = reconcile(claim);
    let status = result.kind === "accepted" ? "dispatched" : result.kind === "retry" || result.kind === "deferred" ? "pending" : result.kind;
    if (claim.campaign.status === "cancelled" && status === "pending") status = claim.submitted ? "failed" : "cancelled";
    const error = "category" in result ? result.category : "";
    if (rateLimitUntil) db.prepare(`INSERT INTO messaging_dispatch_runtime(business_id,next_dispatch_at) VALUES (?,?)
      ON CONFLICT(business_id) DO UPDATE SET next_dispatch_at=MAX(next_dispatch_at,excluded.next_dispatch_at)`).run(claim.item.businessId, rateLimitUntil);
    if (error && !/^[a-zA-Z0-9_-]{1,64}$/.test(error)) invalid("invalid_error_category", "Gönderim hata kategorisi geçersiz.");
    db.prepare(`UPDATE messaging_outbox SET status=?,claim_token='',claimed_at='',next_attempt_at=?,last_error=?,updated_at=?,
      attempt_count=attempt_count-? WHERE id=? AND status='claimed' AND claim_token=?`)
      .run(status, result.kind === "deferred" ? result.nextAttemptAt : nextAttemptAt, error, now, result.kind === "deferred" ? 1 : 0, id, token);
    if (status === "skipped") db.prepare("UPDATE messaging_campaign_recipients SET status='skipped',skip_reason=?,updated_at=? WHERE id=?").run(error, now, claim.item.campaignRecipientId);
    if (status === "cancelled") db.prepare("UPDATE messaging_campaign_recipients SET status='cancelled',updated_at=? WHERE id=?").run(now, claim.item.campaignRecipientId);
    if (status === "failed" && claim.message) failBusinessMessage(db, claim.message.id, error, "Kampanya gönderimi tamamlanamadı.");
    return { status, category: error, businessMessageId: claim.message?.id };
  });
}
export function completeDispatchCampaigns(db: DatabaseSync, now: string): string[] {
  return campaignTransaction(db, () => {
    const rows = db.prepare(`SELECT id FROM messaging_campaigns c WHERE status='running' AND business_id=(SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1)
      AND NOT EXISTS(SELECT 1 FROM messaging_outbox o WHERE o.campaign_id=c.id AND o.status IN ('pending','claimed'))`).all();
    for (const row of rows) db.prepare("UPDATE messaging_campaigns SET status='completed',updated_at=? WHERE id=? AND status='running'").run(now, row.id ?? "");
    return rows.map((row) => String(row.id));
  });
}
