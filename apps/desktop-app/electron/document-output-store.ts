import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import {
  validateDocumentTemplate, documentChannelCompatible, documentTriggerCompatible,
  type DocumentKind, type DocumentTemplateLayout, type DocumentOutputRule, type DocumentDeliveryState
} from "@yardimci-asistan/shared";

/** Local domain owner only. No IPC, renderer, provider, rendering or sending side effects. */
export function createDocumentTemplate(db: DatabaseSync, businessId: string, id: string, revision: number, kind: DocumentKind, layout: DocumentTemplateLayout): void {
  validateDocumentTemplate(layout);
  db.prepare(`INSERT INTO document_print_templates (business_id,id,revision,document_kind,layout_json,created_at) VALUES (?,?,?,?,?,?)`)
    .run(businessId, id, revision, kind, JSON.stringify(layout), new Date().toISOString());
}
export function saveDocumentOutputRule(db: DatabaseSync, rule: DocumentOutputRule): void {
  if (!documentChannelCompatible(rule.channel, rule.adapter, rule.mode) || !documentTriggerCompatible(rule.documentKind, rule.trigger)) throw new Error("DOCUMENT_RULE_INVALID");
  db.prepare(`INSERT INTO document_output_rules (business_id,document_kind,trigger_kind,channel,mode,adapter) VALUES (?,?,?,?,?,?)
    ON CONFLICT (business_id,document_kind,trigger_kind,channel) DO UPDATE SET mode=excluded.mode,adapter=excluded.adapter`)
    .run(rule.businessId, rule.documentKind, rule.trigger, rule.channel, rule.mode, rule.adapter);
}
export interface CreateDocumentJobInput {
  businessId: string; installationId: string; sourceId: string; operationId: string;
  commandKind: "event" | "manual"; reprintOf?: string;
  documentKind: DocumentKind; trigger: DocumentOutputRule["trigger"]; channel: DocumentOutputRule["channel"];
  templateId: string; templateRevision: number; copies: number; printerBindingId?: string;
}
/** Caller supplies one durable command ID per manual command, reused on transport retry.
 * Event identity ignores operation ID: replay cannot change it to create a duplicate.
 * Never called inside a sale transaction: output failure cannot roll back the sale.
 */
export function createDocumentOutputJob(db: DatabaseSync, input: CreateDocumentJobInput): string {
  const key = input.commandKind === "event"
    ? [input.businessId, input.sourceId, input.documentKind, input.trigger, input.channel]
    : [input.businessId, input.operationId, input.sourceId, input.documentKind, input.trigger, input.channel];
  const id = createHash("sha256").update(JSON.stringify([input.commandKind, ...key])).digest("hex");
  const prior = db.prepare("SELECT * FROM document_output_jobs WHERE business_id=? AND id=?").get(input.businessId, id);
  if (prior) {
    if (input.commandKind === "manual" && (prior.installation_id !== input.installationId || prior.reprint_of !== (input.reprintOf ?? null) || prior.copies !== input.copies || prior.template_id !== input.templateId || prior.template_revision !== input.templateRevision || prior.printer_binding_id !== (input.printerBindingId ?? null))) throw new Error("DOCUMENT_COMMAND_CONFLICT");
    return id; // Pure receipt read; never requeues or executes a historical job.
  }
  const template = db.prepare("SELECT layout_json FROM document_print_templates WHERE business_id=? AND id=? AND revision=? AND document_kind=?")
    .get(input.businessId, input.templateId, input.templateRevision, input.documentKind) as { layout_json: string } | undefined;
  if (!template) throw new Error("DOCUMENT_TEMPLATE_MISSING");
  validateDocumentTemplate(JSON.parse(template.layout_json) as DocumentTemplateLayout);
  const rule = db.prepare("SELECT mode,adapter FROM document_output_rules WHERE business_id=? AND document_kind=? AND trigger_kind=? AND channel=?")
    .get(input.businessId, input.documentKind, input.trigger, input.channel) as { mode: string; adapter: string } | undefined;
  if (!rule || rule.mode === "OFF") throw new Error("DOCUMENT_RULE_DISABLED");
  db.prepare(`INSERT INTO document_output_jobs (business_id,id,installation_id,source_id,operation_id,command_kind,reprint_of,document_kind,trigger_kind,channel,mode,adapter,template_id,template_revision,layout_snapshot_json,copies,printer_binding_id,state,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (business_id,id) DO NOTHING`)
    .run(input.businessId, id, input.installationId, input.sourceId, input.operationId, input.commandKind, input.reprintOf ?? null,
      input.documentKind, input.trigger, input.channel, rule.mode, rule.adapter, input.templateId, input.templateRevision,
      template.layout_json, input.copies, input.printerBindingId ?? null, rule.mode === "AUTOMATIC" ? "queued" : "awaiting-confirmation", new Date().toISOString());
  return id;
}
/** CAS prevents double claims. Unknown/failed/accepted are terminal; explicit new commands only.
 * P0 has no recipient/adapter readiness/confirmation authority: sending is reserved for P2.
 */
export function transitionDocumentOutputJob(db: DatabaseSync, businessId: string, installationId: string, id: string, expected: DocumentDeliveryState, next: DocumentDeliveryState): boolean {
  if (next === "sending") throw new Error("DOCUMENT_ADAPTER_NOT_IMPLEMENTED");
  return db.prepare("UPDATE document_output_jobs SET state=? WHERE business_id=? AND installation_id=? AND id=? AND state=?")
    .run(next, businessId, installationId, id, expected).changes === 1;
}
