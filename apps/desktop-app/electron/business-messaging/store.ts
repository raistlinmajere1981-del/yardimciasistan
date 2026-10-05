import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { emptyWhatsAppCloudConfiguration, type BusinessMessage, type BusinessMessageStatus, type WhatsAppCloudConfigurationInput } from "@yardimci-asistan/shared";
import type { MessagingSecretWrite } from "./secret-service";
import { BusinessMessagingError } from "./provider-error";
export function normalizeMessagingConfiguration(input: WhatsAppCloudConfigurationInput) {
  if (!input || typeof input.enabled !== "boolean" || ![input.wabaId, input.phoneNumberId].every((id) => typeof id === "string" && /^(?:\d{1,40})?$/.test(id))) throw new BusinessMessagingError("invalid_configuration", "WhatsApp Business kimlikleri geçersiz.");
  return { enabled: input.enabled, wabaId: input.wabaId, phoneNumberId: input.phoneNumberId };
}
function business(db: DatabaseSync) {
  const row = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at LIMIT 1").get();
  return String(row?.id ?? "");
}
export function getStoredMessagingConfiguration(db: DatabaseSync) {
  return db.prepare("SELECT * FROM business_messaging_provider_config WHERE business_id = ? AND provider_id = 'whatsapp_cloud'").get(business(db));
}
export function getMessagingConfiguration(db: DatabaseSync) {
  const row = getStoredMessagingConfiguration(db); if (!row) return emptyWhatsAppCloudConfiguration();
  const enabled = Number(row.enabled) === 1, hasSecret = String(row.access_token_encrypted).startsWith("safe-storage:v1:");
  return { providerId: "whatsapp_cloud" as const, enabled, wabaId: String(row.waba_id), phoneNumberId: String(row.phone_number_id), hasSecret,
    configured: enabled && hasSecret && Boolean(row.waba_id && row.phone_number_id) };
}
export function saveMessagingConfiguration(db: DatabaseSync, businessId: string, input: WhatsAppCloudConfigurationInput, secret: MessagingSecretWrite) {
  const config = normalizeMessagingConfiguration(input);
  let encrypted = String(getStoredMessagingConfiguration(db)?.access_token_encrypted ?? "");
  if (secret.mode === "clear" || input.clearAccessToken) encrypted = "";
  else if (secret.mode === "replace") {
    if (!secret.encryptedValue?.startsWith("safe-storage:v1:")) throw new BusinessMessagingError("secret_not_encrypted");
    encrypted = secret.encryptedValue;
  } else if (input.accessToken) throw new BusinessMessagingError("secret_not_encrypted", "Erişim anahtarı ana süreçte şifrelenmeli.");
  db.prepare(`INSERT INTO business_messaging_provider_config VALUES (?, 'whatsapp_cloud', ?, ?, ?, ?, ?)
    ON CONFLICT(business_id, provider_id) DO UPDATE SET enabled=excluded.enabled, waba_id=excluded.waba_id,
    phone_number_id=excluded.phone_number_id, access_token_encrypted=excluded.access_token_encrypted, updated_at=excluded.updated_at`)
    .run(businessId, config.enabled ? 1 : 0, config.wabaId, config.phoneNumberId, encrypted, new Date().toISOString());
}
export function getMessagingCustomer(db: DatabaseSync, id: string) {
  const row = db.prepare("SELECT id, phone FROM customers WHERE id = ? AND deleted_at = ''").get(id);
  return row ? { id: String(row.id), phone: String(row.phone) } : null;
}
function project(row: Record<string, unknown>): BusinessMessage {
  return { id: String(row.id), businessId: String(row.business_id), customerId: row.customer_id ? String(row.customer_id) : undefined,
    purpose: row.purpose as BusinessMessage["purpose"], campaignId: row.campaign_id ? String(row.campaign_id) : undefined, campaignRecipientId: row.campaign_recipient_id ? String(row.campaign_recipient_id) : undefined,
    relatedEntityType: row.related_entity_type ? String(row.related_entity_type) : undefined, relatedEntityId: row.related_entity_id ? String(row.related_entity_id) : undefined,
    providerId: row.provider_id as BusinessMessage["providerId"], recipient: String(row.recipient), messageKind: row.message_kind as BusinessMessage["messageKind"],
    templateName: String(row.template_name), templateLanguage: String(row.template_language), providerMessageId: String(row.provider_message_id),
    status: String(row.status) as BusinessMessageStatus, failureCode: String(row.failure_code), failureMessage: String(row.failure_message),
    createdAt: String(row.created_at), acceptedAt: String(row.accepted_at), deliveredAt: String(row.delivered_at), readAt: String(row.read_at), failedAt: String(row.failed_at) };
}
export function getBusinessMessage(db: DatabaseSync, id: string): BusinessMessage | null {
  const row = db.prepare("SELECT * FROM business_messages WHERE id=? AND business_id=?").get(id, business(db)); return row ? project(row) : null;
}
export function getMessageBinding(db: DatabaseSync, id: string) {
  return db.prepare("SELECT * FROM business_message_provider_bindings WHERE message_id=?").get(id);
}
export interface PrepareBusinessMessageInput { providerId?: BusinessMessage["providerId"]; messageKind?: BusinessMessage["messageKind"]; customerId: string; recipient: string; templateName: string; templateLanguage: string; intentHash: string; accountKey: string; campaignId?: string; campaignRecipientId?: string }
/** Caller owns the transaction, allowing an outbox attachment to commit with the canonical message. */
export function insertBusinessMessage(db: DatabaseSync, input: PrepareBusinessMessageInput) {
  const id = `business_message_${randomUUID()}`;
  db.prepare(`INSERT INTO business_messages(id,business_id,customer_id,provider_id,recipient,message_kind,template_name,template_language,status,created_at,purpose,campaign_id,campaign_recipient_id)
    VALUES (?,?,?,?,?,?,?,?,'draft',?,?,?,?)`)
    .run(id, business(db), input.customerId, input.providerId ?? "whatsapp_cloud", input.recipient, input.messageKind ?? "template", input.templateName, input.templateLanguage, new Date().toISOString(), input.campaignId ? "marketing" : "operational", input.campaignId ?? null, input.campaignRecipientId ?? null);
  db.prepare("INSERT INTO business_message_provider_bindings(message_id,account_key,intent_hash) VALUES (?,?,?)").run(id, input.accountKey, input.intentHash);
  return getBusinessMessage(db, id)!;
}
export function prepareBusinessMessage(db: DatabaseSync, input: PrepareBusinessMessageInput) {
  db.exec("BEGIN IMMEDIATE");
  try { const result = insertBusinessMessage(db, input); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
/** Durable submission fence. Caller owns the transaction. */
export function claimBusinessMessageInTransaction(db: DatabaseSync, id: string) {
  const changed = db.prepare("UPDATE business_message_provider_bindings SET submitted=1 WHERE message_id=? AND submitted=0 AND EXISTS(SELECT 1 FROM business_messages m WHERE m.id=message_id AND m.status='draft')").run(id).changes;
  if (changed) db.prepare("UPDATE business_messages SET status='queued' WHERE id=? AND status='draft'").run(id);
  return Boolean(changed);
}
/** Refresh only a certainly unsubmitted draft. Caller commits this with its intent/fence.
 * Terminal states, receipts, account changes and unresolved submissions cannot be reset. */
export function refreshUnsubmittedBusinessMessageInTransaction(db: DatabaseSync, id: string, input: { recipient: string; intentHash: string; accountKey: string }) {
  const message = getBusinessMessage(db, id), binding = getMessageBinding(db, id);
  if (!message || message.status !== "draft" || message.providerMessageId || message.acceptedAt || message.deliveredAt || message.readAt
    || !binding || Number(binding.submitted) !== 0 || binding.account_key !== input.accountKey) return false;
  db.prepare("UPDATE business_messages SET recipient=?,failure_code='',failure_message='',failed_at='' WHERE id=? AND status='draft'").run(input.recipient, id);
  db.prepare("UPDATE business_message_provider_bindings SET intent_hash=? WHERE message_id=? AND submitted=0").run(input.intentHash, id);
  return true;
}
/** Only explicit adapter rejection proves a queued submission was not accepted.
 * Caller owns the transaction and transport lease; lease recovery is never rejection evidence. */
export function releaseRejectedBusinessMessageInTransaction(db: DatabaseSync, id: string) {
  const message = getBusinessMessage(db, id), binding = getMessageBinding(db, id);
  if (!message || message.status !== "queued" || message.providerMessageId || message.acceptedAt || message.deliveredAt || message.readAt
    || !binding || Number(binding.submitted) !== 1) return false;
  db.prepare("UPDATE business_message_provider_bindings SET submitted=0 WHERE message_id=? AND submitted=1").run(id);
  db.prepare("UPDATE business_messages SET status='draft' WHERE id=? AND status='queued'").run(id);
  return true;
}
/** Claim before HTTP, durable across restart. Cloud API has no send deduplication API. */
export function claimBusinessMessage(db: DatabaseSync, id: string) {
  db.exec("BEGIN IMMEDIATE");
  try { const changed = claimBusinessMessageInTransaction(db, id); db.exec("COMMIT"); return changed; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
export interface MessagingStatusUpdate { providerId?: BusinessMessage["providerId"]; providerMessageId: string; status: "accepted" | "delivered" | "read" | "failed"; timestamp: string; failureCode?: string; messageId?: string; accountKey?: string }
export function applyBusinessMessageStatus(db: DatabaseSync, input: MessagingStatusUpdate) {
  if (!/^[A-Za-z0-9_.=:-]{1,512}$/.test(input.providerMessageId) || !["accepted", "delivered", "read", "failed"].includes(input.status) || !Number.isFinite(Date.parse(input.timestamp))) throw new BusinessMessagingError("invalid_status");
  const known = db.prepare("SELECT id FROM business_messages WHERE provider_id=? AND provider_message_id=?").get(input.providerId ?? "whatsapp_cloud", input.providerMessageId);
  if (known && input.messageId && known.id !== input.messageId) return null;
  const localId = String(known?.id ?? input.messageId ?? "");
  const row = db.prepare(`SELECT m.* FROM business_messages m JOIN business_message_provider_bindings b ON b.message_id=m.id
    WHERE m.business_id=? AND m.provider_id=? AND b.submitted=1 AND m.id=?
    AND (m.provider_message_id='' OR m.provider_message_id=?) AND (?='' OR b.account_key=?)`)
    .get(business(db), input.providerId ?? "whatsapp_cloud", localId, input.providerMessageId, input.accountKey ?? "", input.accountKey ?? "");
  if (!row) return null;
  const current = project(row);
  const ranks = { draft: 0, queued: 1, failed: 1, accepted: 2, delivered: 3, read: 4, cancelled: 5 };
  if (current.status === "cancelled" || (input.status === "failed" && ["delivered", "read"].includes(current.status))) return current;
  const column = { accepted: "accepted_at", delivered: "delivered_at", read: "read_at", failed: "failed_at" }[input.status];
  if ((input.status !== "failed" && ranks[input.status] < ranks[current.status])
    || (current.status === "failed" && input.status === "accepted" && /^provider_/.test(current.failureCode))) {
    // Late HTTP acceptance / out-of-order webhook fills history without downgrading status.
    db.prepare(`UPDATE business_messages SET ${column}=? WHERE id=? AND ${column}=''`).run(input.timestamp, current.id);
    return getBusinessMessage(db, current.id);
  }
  if (input.status === current.status && current.providerMessageId === input.providerMessageId) return current;
  db.prepare(`UPDATE business_messages SET provider_message_id=?, status=?, ${column}=CASE WHEN ${column}='' THEN ? ELSE ${column} END,
    failure_code=?, failure_message=? WHERE id=?`).run(input.providerMessageId, input.status, input.timestamp,
      input.status === "failed" ? (/^[A-Za-z0-9_-]{1,64}$/.test(input.failureCode ?? "") ? input.failureCode! : "provider_failed") : "",
      input.status === "failed" ? (current.providerId === "iletimerkezi" ? "SMS mesajı iletilemedi." : "WhatsApp Business mesajı iletilemedi.") : "", current.id);
  return getBusinessMessage(db, current.id);
}
export function failBusinessMessage(db: DatabaseSync, id: string, code: string, message: string) {
  db.prepare("UPDATE business_messages SET status='failed', failure_code=?, failure_message=?, failed_at=? WHERE id=? AND (status='queued' OR (status='draft' AND purpose='marketing'))")
    .run(code.slice(0,64), message.slice(0,240), new Date().toISOString(), id);
  return getBusinessMessage(db, id)!;
}
