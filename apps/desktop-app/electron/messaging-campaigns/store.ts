import type { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { BUSINESS_CAPABILITIES as C, normalizePhone, type BusinessMessageTemplate, type CustomerMessagingPreference,
  type MessagingAudienceCounts, type MessagingCampaign, type MessagingCampaignDetail, type MessagingCampaignInput,
  type MessagingChannel, type MessagingConsentStatus, type MessagingSegment, type MessagingRecipientSkipReason,
  type SaveMessagingPreferenceInput, type SaveMessagingSegmentInput } from "@yardimci-asistan/shared";
import { validateSmsText, boundedText, invalid, resolveCampaignBindings, validateCampaignInput, validateCampaignTemplate, validateChannel, validateSegmentFilter } from "./validation";

type Row = Record<string, unknown>;
function business(db: DatabaseSync): string {
  const id = String(db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get()?.id ?? "");
  if (!id) invalid("missing_business", "İşletme bulunamadı.");
  return id;
}
function requireCapability(db: DatabaseSync, capability: string) {
  if (!db.prepare("SELECT 1 FROM business_capabilities WHERE business_id=? AND capability_id=? AND is_enabled=1").get(business(db), capability)) invalid("feature_disabled", "Bu özellik işletme ayarlarında etkin değil.");
}
export function assertCampaignCapabilities(db: DatabaseSync) { requireCapability(db, C.CUSTOMERS); requireCapability(db, C.MESSAGING_CAMPAIGNS); }
export function campaignTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const value = action(); db.exec("COMMIT"); return value; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
function customerExists(db: DatabaseSync, id: string) {
  if (!db.prepare("SELECT 1 FROM customers WHERE id=? AND deleted_at='' AND (business_id IS NULL OR business_id=?)").get(boundedText(id, 100, true), business(db))) invalid("missing_customer", "Müşteri bulunamadı.");
}
export function getCustomerMessagingPreference(db: DatabaseSync, customerId: string, channel: MessagingChannel, purpose: "marketing"): CustomerMessagingPreference {
  requireCapability(db, C.CUSTOMERS); customerExists(db, customerId); validateChannel(channel);
  if (purpose !== "marketing") invalid("invalid_purpose", "İletişim amacı geçersiz.");
  const businessId = business(db), row = db.prepare("SELECT * FROM customer_messaging_preferences WHERE business_id=? AND customer_id=? AND channel=? AND purpose=?").get(businessId, customerId, channel, purpose);
  return { businessId, customerId, channel, purpose, status: (row?.status ?? "unknown") as MessagingConsentStatus,
    source: String(row?.source ?? ""), note: String(row?.note ?? ""), recordedAt: String(row?.recorded_at ?? ""), updatedAt: String(row?.updated_at ?? "") };
}
export function saveCustomerMessagingPreference(db: DatabaseSync, input: SaveMessagingPreferenceInput) {
  if (!input || !["unknown", "opted_in", "opted_out"].includes(input.status)) invalid("invalid_consent", "İletişim tercihi geçersiz.");
  getCustomerMessagingPreference(db, input.customerId, input.channel, input.purpose);
  const source = boundedText(input.source, 80, true), note = boundedText(input.note ?? "", 500), now = new Date().toISOString();
  return campaignTransaction(db, () => {
    db.prepare(`INSERT INTO customer_messaging_preferences(business_id,customer_id,channel,purpose,status,source,note,recorded_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(customer_id,channel,purpose) DO UPDATE SET
      status=excluded.status,source=excluded.source,note=excluded.note,recorded_at=excluded.recorded_at,updated_at=excluded.updated_at`)
      .run(business(db), input.customerId, input.channel, input.purpose, input.status, source, note, now, now);
    // Schema triggers suppress pending outbox in this same transaction; opt-in never revives it.
    return getCustomerMessagingPreference(db, input.customerId, input.channel, input.purpose);
  });
}
function segment(row: Row): MessagingSegment {
  return { id: String(row.id), businessId: String(row.business_id), name: String(row.name), description: String(row.description),
    filterDefinition: validateSegmentFilter(JSON.parse(String(row.filter_definition_json))), createdAt: String(row.created_at), updatedAt: String(row.updated_at), archivedAt: String(row.archived_at) };
}
export function listMessagingSegments(db: DatabaseSync) {
  assertCampaignCapabilities(db);
  return db.prepare("SELECT * FROM messaging_segments WHERE business_id=? AND archived_at='' ORDER BY created_at,id").all(business(db)).map(segment);
}
function getSegment(db: DatabaseSync, id: string) {
  const row = db.prepare("SELECT * FROM messaging_segments WHERE business_id=? AND id=? AND archived_at=''").get(business(db), boundedText(id, 100, true));
  if (!row) invalid("missing_segment", "Segment bulunamadı veya arşivlenmiş.");
  return segment(row);
}
export function saveMessagingSegment(db: DatabaseSync, input: SaveMessagingSegmentInput) {
  assertCampaignCapabilities(db);
  if (!input) invalid("invalid_segment", "Segment geçersiz.");
  const filter = validateSegmentFilter(input.filterDefinition), name = boundedText(input.name, 120, true), description = boundedText(input.description ?? "", 500);
  const now = new Date().toISOString(), id = input.id ? getSegment(db, input.id).id : `segment_${randomUUID()}`;
  db.prepare(`INSERT INTO messaging_segments(id,business_id,name,description,filter_definition_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,filter_definition_json=excluded.filter_definition_json,updated_at=excluded.updated_at`)
    .run(id, business(db), name, description, JSON.stringify(filter), now, now);
  return getSegment(db, id);
}
interface AudienceMember { customerId: string; fullName: string; companyName: string; skipReason: MessagingRecipientSkipReason }
function resolveAudience(db: DatabaseSync, segmentId: string, channel: MessagingChannel): AudienceMember[] {
  validateChannel(channel);
  const filter = getSegment(db, segmentId).filterDefinition;
  // Static query only; neither renderer nor stored filter supplies SQL.
  const rows = db.prepare(`SELECT c.id,c.full_name,c.phone,c.source,p.company_name,p.dealer_status,
      COALESCE(pref.status,'unknown') AS consent FROM customers c
    LEFT JOIN customer_commercial_profiles p ON p.customer_id=c.id AND p.business_id=?
    LEFT JOIN customer_messaging_preferences pref ON pref.customer_id=c.id AND pref.business_id=? AND pref.channel=? AND pref.purpose='marketing'
    WHERE c.deleted_at='' AND (c.business_id IS NULL OR c.business_id=?) ORDER BY c.id`).all(business(db), business(db), channel, business(db));
  return rows.filter((row) => filter.rules.every((rule) => rule.field === "source" ? row.source === rule.value
    : rule.field === "dealerStatus" ? row.dealer_status === rule.value
    : rule.operator === "present" ? Boolean(String(row.phone).trim()) : !String(row.phone).trim())).map((row) => ({
    customerId: String(row.id), fullName: String(row.full_name), companyName: String(row.company_name ?? ""),
    // Exclusive reasons: hard opt-out, then unknown, then usable contact. No contact snapshot.
    skipReason: row.consent === "opted_out" ? "opted_out" : row.consent !== "opted_in" ? "unknown_consent"
      : !normalizePhone(String(row.phone)).ok ? "missing_recipient" : ""
  }));
}
function counts(audience: AudienceMember[]): MessagingAudienceCounts {
  return { matchedCount: audience.length, eligibleCount: audience.filter((row) => !row.skipReason).length,
    unknownConsentCount: audience.filter((row) => row.skipReason === "unknown_consent").length,
    optedOutCount: audience.filter((row) => row.skipReason === "opted_out").length,
    missingRecipientCount: audience.filter((row) => row.skipReason === "missing_recipient").length };
}
export function previewMessagingSegment(db: DatabaseSync, id: string, channel: MessagingChannel) { assertCampaignCapabilities(db); return counts(resolveAudience(db, id, channel)); }
function campaign(row: Row): MessagingCampaign {
  return { id: String(row.id), businessId: String(row.business_id), name: String(row.name), purpose: "marketing", channel: row.channel as MessagingChannel,
    ...(row.provider_id ? { providerId: row.provider_id as NonNullable<MessagingCampaign["providerId"]> } : {}), segmentId: String(row.segment_id), templateName: String(row.template_name),
    templateLanguage: String(row.template_language), bindings: JSON.parse(String(row.bindings_json)), status: row.status as MessagingCampaign["status"],
    preparedAt: String(row.prepared_at), cancelledAt: String(row.cancelled_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    ...(row.content_id ? { contentId: String(row.content_id) } : {}), ...(row.content_revision ? { contentRevision: Number(row.content_revision) } : {}), text: String(row.text ?? ""),
    templateSnapshot: row.template_snapshot_json ? JSON.parse(String(row.template_snapshot_json)) : null,
    preparationCounts: row.preparation_counts_json ? JSON.parse(String(row.preparation_counts_json)) : null };
}
export function getMessagingCampaign(db: DatabaseSync, id: string): MessagingCampaign {
  assertCampaignCapabilities(db);
  const row = db.prepare("SELECT * FROM messaging_campaigns WHERE id=? AND business_id=?").get(boundedText(id, 100, true), business(db));
  if (!row) invalid("missing_campaign", "Kampanya bulunamadı.");
  return campaign(row);
}
export function listMessagingCampaigns(db: DatabaseSync) {
  assertCampaignCapabilities(db); return db.prepare("SELECT * FROM messaging_campaigns WHERE business_id=? ORDER BY created_at DESC,id").all(business(db)).map(campaign);
}
export function createMessagingCampaign(db: DatabaseSync, value: MessagingCampaignInput) {
  assertCampaignCapabilities(db); const input = validateCampaignInput(value); getSegment(db, input.segmentId);
  if (input.contentId) {
    const content = db.prepare("SELECT revision,status FROM marketing_contents WHERE id=? AND business_id=?").get(input.contentId, business(db));
    if (!content || Number(content.revision) !== input.contentRevision || content.status === "archived") invalid("stale_content", "Güncel içeriği kaydedip tekrar deneyin.");
    if (input.channel === "sms") {
      const variant = db.prepare("SELECT text FROM marketing_content_variants WHERE content_id=? AND channel='sms'").get(input.contentId);
      if (!variant || String(variant.text) !== input.text) invalid("stale_content", "SMS varyantını kaydedip tekrar deneyin.");
    }
  }
  const now = new Date().toISOString(), id = `campaign_${randomUUID()}`;
  db.prepare(`INSERT INTO messaging_campaigns(id,business_id,name,purpose,channel,provider_id,segment_id,template_name,template_language,bindings_json,content_id,content_revision,text,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, business(db), input.name, input.purpose, input.channel, input.providerId ?? null,
      input.segmentId, input.templateName, input.templateLanguage, JSON.stringify(input.bindings), input.contentId ?? null, input.contentRevision ?? null, input.text ?? "", now, now);
  return getMessagingCampaign(db, id);
}
export function getMessagingCampaignDetail(db: DatabaseSync, id: string): MessagingCampaignDetail {
  const value = getMessagingCampaign(db, id);
  const row = db.prepare(`SELECT COUNT(*) AS matched,SUM(status='skipped') AS skipped FROM messaging_campaign_recipients WHERE campaign_id=?`).get(id)!;
  const pending = db.prepare(`SELECT SUM(status='pending') AS pending,SUM(status='claimed') AS claimed,
    SUM(status='dispatched') AS dispatched,SUM(status='failed') AS failed,SUM(status='cancelled') AS cancelled FROM messaging_outbox WHERE campaign_id=?`).get(id)!;
  const errors = db.prepare(`SELECT last_error,COUNT(*) AS count FROM messaging_outbox WHERE campaign_id=? AND status='failed'
    GROUP BY last_error ORDER BY count DESC,last_error LIMIT 20`).all(id).map((error) => ({ category: /^[A-Za-z0-9_-]{1,64}$/.test(String(error.last_error)) ? String(error.last_error) : "operation_failed", count: Number(error.count) }));
  return { errorCounts: errors, campaign: value, matchedCount: Number(row.matched), eligibleCount: value.preparationCounts?.eligibleCount ?? 0,
    skippedCount: Number(row.skipped ?? 0), pendingOutboxCount: Number(pending.pending ?? 0), claimedOutboxCount: Number(pending.claimed ?? 0), dispatchedCount: Number(pending.dispatched ?? 0), failedCount: Number(pending.failed ?? 0), cancelledCount: Number(pending.cancelled ?? 0) };
}
export function previewMessagingCampaign(db: DatabaseSync, id: string) {
  const value = getMessagingCampaign(db, id);
  if (value.status !== "draft") invalid("not_draft", "Hazırlanmış kampanyanın üyeleri dondurulmuştur.");
  return counts(resolveAudience(db, value.segmentId, value.channel));
}
export function prepareMessagingCampaign(db: DatabaseSync, id: string, template: BusinessMessageTemplate | null) {
  return campaignTransaction(db, () => {
    const value = getMessagingCampaign(db, id);
    if (value.status === "prepared") return getMessagingCampaignDetail(db, id);
    if (value.status !== "draft") invalid("not_draft", "Yalnız taslak kampanya hazırlanabilir.");
    if (!value.providerId) invalid("missing_provider", "Hazırlamak için sağlayıcı seçin.");
    const input = validateCampaignInput({ name: value.name, purpose: value.purpose, channel: value.channel,
      ...(value.providerId !== undefined ? { providerId: value.providerId } : {}),
      segmentId: value.segmentId, templateName: value.templateName, templateLanguage: value.templateLanguage, bindings: value.bindings,
      ...(value.text !== undefined ? { text: value.text } : {}), ...(value.contentId !== undefined ? { contentId: value.contentId } : {}),
      ...(value.contentRevision !== undefined ? { contentRevision: value.contentRevision } : {}) });
    if (input.channel === "whatsapp") { if (!template) invalid("missing_template", "Onaylı şablon artık kullanılamıyor."); validateCampaignTemplate(input, template); }
    else validateSmsText(input.text);
    const audience = resolveAudience(db, value.segmentId, value.channel), summary = counts(audience), now = new Date().toISOString();
    for (const member of audience) {
      if (!member.skipReason) resolveCampaignBindings(value.bindings, member); // Validate all eligible values; never persist them.
      const recipientId = `campaign_recipient_${randomUUID()}`;
      db.prepare(`INSERT INTO messaging_campaign_recipients(id,campaign_id,customer_id,status,skip_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
        .run(recipientId, id, member.customerId, member.skipReason ? "skipped" : "prepared", member.skipReason, now, now);
      if (!member.skipReason) {
        const operationKey = createHash("sha256").update(JSON.stringify([id, member.customerId, value.channel])).digest("hex");
        db.prepare(`INSERT INTO messaging_outbox(id,business_id,campaign_id,campaign_recipient_id,customer_id,channel,provider_id,status,operation_key,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,'pending',?,?,?)`).run(`outbox_${randomUUID()}`, value.businessId, id, recipientId, member.customerId, value.channel, value.providerId, operationKey, now, now);
      }
    }
    db.prepare(`UPDATE messaging_campaigns SET status='prepared',prepared_at=?,updated_at=?,template_snapshot_json=?,preparation_counts_json=? WHERE id=? AND status='draft'`)
      .run(now, now, JSON.stringify(template), JSON.stringify(summary), id);
    return getMessagingCampaignDetail(db, id);
  });
}
export function cancelMessagingCampaign(db: DatabaseSync, id: string) {
  return campaignTransaction(db, () => {
    const value = getMessagingCampaign(db, id);
    if (value.status === "cancelled") return getMessagingCampaignDetail(db, id);
    if (!["draft", "prepared", "running", "paused"].includes(value.status)) invalid("cannot_cancel", "Bu kampanya iptal edilemez.");
    const now = new Date().toISOString();
    db.prepare(`UPDATE messaging_outbox SET status='dispatched',last_error='',updated_at=? WHERE campaign_id=? AND status='pending'
      AND EXISTS(SELECT 1 FROM business_messages m WHERE m.id=messaging_outbox.business_message_id AND (m.provider_message_id!='' OR m.accepted_at!='' OR m.delivered_at!='' OR m.read_at!=''))`).run(now, id);
    db.prepare(`UPDATE messaging_outbox SET status='cancelled',claim_token='',claimed_at='',updated_at=? WHERE campaign_id=? AND status IN ('pending','claimed')
      AND NOT EXISTS(SELECT 1 FROM business_message_provider_bindings b WHERE b.message_id=messaging_outbox.business_message_id AND b.submitted=1)`).run(now, id);
    db.prepare(`UPDATE messaging_outbox SET status='failed',last_error='submission_uncertain',updated_at=? WHERE campaign_id=? AND status='pending'
      AND EXISTS(SELECT 1 FROM business_message_provider_bindings b WHERE b.message_id=messaging_outbox.business_message_id AND b.submitted=1)`).run(now, id);
    db.prepare("UPDATE messaging_campaign_recipients SET status='cancelled',updated_at=? WHERE campaign_id=? AND status='prepared' AND EXISTS(SELECT 1 FROM messaging_outbox o WHERE o.campaign_recipient_id=messaging_campaign_recipients.id AND o.status='cancelled')").run(now, id);
    db.prepare("UPDATE messaging_campaigns SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=?").run(now, now, id);
    return getMessagingCampaignDetail(db, id);
  });
}
