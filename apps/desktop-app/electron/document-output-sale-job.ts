import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { documentKindEnabled, validateDocumentTemplate, type BusinessCapability, type DocumentTemplateLayout } from "@yardimci-asistan/shared";
import type { DocumentFormImages } from "./document-form-images";
import { createDocumentOutputJob } from "./document-output-store";
import { createDocumentRenderSnapshot } from "./document-output-render-snapshot";
import { readSaleDocumentSource } from "./document-output-sale-source";
import { captureDocumentRenderSnapshot, captureDocumentSnapshotImages, readDocumentRenderSnapshot, readDocumentSnapshotImages } from "./document-output-snapshot-store";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const conflict = (): never => { throw new Error("DOCUMENT_SALE_JOB_CONFLICT"); };

/** Main-process only: scope and image owner must come from the unlocked local session.
 * This is preparation, not a print command. No caller-provided document content is accepted. */
export function prepareSaleDocumentJob(db: DatabaseSync, images: DocumentFormImages, scope: { businessId: string; installationId: string; saleId: string }): string {
  const { businessId, installationId, saleId } = scope;
  if (![businessId, installationId, saleId].every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 128)) throw new Error("DOCUMENT_SALE_JOB_SCOPE_INVALID");
  const enabled = new Set((db.prepare("SELECT capability_id FROM business_capabilities WHERE business_id=? AND is_enabled=1").all(businessId) as { capability_id: BusinessCapability }[]).map(row => row.capability_id));
  if (!documentKindEnabled("sale_receipt", enabled)) throw new Error("DOCUMENT_CAPABILITY_DISABLED");
  const source = readSaleDocumentSource(db, businessId, saleId);
  const binding = db.prepare("SELECT printer_ref FROM document_printer_bindings WHERE business_id=? AND installation_id=? AND id='sale_receipt'").get(businessId, installationId);
  const prefix = `sale:${digest([businessId, installationId, saleId]).slice(0, 32)}:`;
  const operationId = prefix + digest([source, binding?.printer_ref]);
  const find = () => db.prepare("SELECT * FROM document_output_jobs WHERE business_id=? AND installation_id=? AND source_id=? AND substr(operation_id,1,?)=?").all(businessId, installationId, saleId, prefix.length, prefix);
  const replay = (rows: Record<string, unknown>[]): string => {
    if (rows.length !== 1) return conflict();
    const job = rows[0];
    if (!job) return conflict();
    if (job.operation_id !== operationId || job.command_kind !== "manual" || job.document_kind !== "sale_receipt" || job.trigger_kind !== "manual" || job.channel !== "print" || job.mode !== "ASK_CONFIRMATION" || job.adapter !== "native_print" || job.template_id !== "default:sale_receipt" || job.printer_binding_id !== "sale_receipt" || job.copies !== 1 || job.reprint_of !== null || typeof job.id !== "string") return conflict();
    const snapshotScope = { businessId, installationId, jobId: job.id };
    const snapshot = readDocumentRenderSnapshot(db, snapshotScope);
    if (!snapshot || JSON.stringify(snapshot) !== JSON.stringify(createDocumentRenderSnapshot("sale_receipt", JSON.parse(job.layout_snapshot_json as string) as DocumentTemplateLayout, source.values, source.lines))) return conflict();
    try { readDocumentSnapshotImages(db, snapshotScope); } catch { return conflict(); }
    return job.id;
  };
  let rows = find();
  if (rows.length) return replay(rows);
  const template = db.prepare("SELECT revision,layout_json FROM document_print_templates WHERE business_id=? AND id='default:sale_receipt' AND document_kind='sale_receipt' ORDER BY revision DESC LIMIT 1").get(businessId) as { revision: number; layout_json: string } | undefined;
  const rule = db.prepare("SELECT mode,adapter FROM document_output_rules WHERE business_id=? AND document_kind='sale_receipt' AND trigger_kind='manual' AND channel='print'").get(businessId);
  if (!template || !rule || rule.mode !== "ASK_CONFIRMATION" || rule.adapter !== "native_print" || !binding || typeof binding.printer_ref !== "string" || !binding.printer_ref.trim()) throw new Error("DOCUMENT_SALE_JOB_CONFIGURATION_MISSING");
  const layout = JSON.parse(template.layout_json) as DocumentTemplateLayout;
  // Validate first: malformed/unknown layouts retain the generic safe IPC error.
  validateDocumentTemplate(layout);
  if (!layout.lineBlock || layout.lineBlock.maxRows < source.lines.length ||
    !["line.description", "line.quantity", "line.total"].every(binding => layout.lineBlock!.fields.some(field => field.binding === binding))) {
    throw new Error("DOCUMENT_SALE_JOB_LINES_MISSING");
  }
  createDocumentRenderSnapshot("sale_receipt", layout, source.values, source.lines);
  for (const field of [...layout.fields, ...(layout.lineBlock?.fields ?? [])]) {
    if (!Object.hasOwn(field.binding.startsWith("line.") ? (source.lines[0] ?? {}) : source.values, field.binding)) throw new Error("DOCUMENT_SALE_JOB_FIELD_UNAVAILABLE");
  }
  const imageBytes = new Map<string, Buffer>();
  if (layout.scan) {
    for (const ref of [layout.scan.originalImageRef, layout.scan.processedImageRef]) {
      if (ref && !imageBytes.has(ref)) imageBytes.set(ref, images.readBytes(ref, businessId, "sale_receipt"));
    }
  }
  const capturedImages = { readBytes(ref: string, owner: string, kind: string): Buffer {
    const bytes = imageBytes.get(ref);
    if (!bytes || owner !== businessId || kind !== "sale_receipt") throw new Error("DOCUMENT_SNAPSHOT_IMAGES_INVALID");
    return bytes;
  } } as DocumentFormImages;
  let jobId: string;
  db.exec("BEGIN IMMEDIATE");
  try {
    rows = find();
    if (rows.length) { db.exec("COMMIT"); return replay(rows); }
    const current = db.prepare("SELECT revision,layout_json FROM document_print_templates WHERE business_id=? AND id='default:sale_receipt' AND document_kind='sale_receipt' ORDER BY revision DESC LIMIT 1").get(businessId);
    const currentRule = db.prepare("SELECT mode,adapter FROM document_output_rules WHERE business_id=? AND document_kind='sale_receipt' AND trigger_kind='manual' AND channel='print'").get(businessId);
    const currentBinding = db.prepare("SELECT printer_ref FROM document_printer_bindings WHERE business_id=? AND installation_id=? AND id='sale_receipt'").get(businessId, installationId);
    if (!current || current.revision !== template.revision || current.layout_json !== template.layout_json || currentRule?.mode !== "ASK_CONFIRMATION" || currentRule.adapter !== "native_print" || currentBinding?.printer_ref !== binding.printer_ref) throw new Error("DOCUMENT_SALE_JOB_CONFIGURATION_CHANGED");
    if (digest(readSaleDocumentSource(db, businessId, saleId)) !== digest(source)) return conflict();
    jobId = createDocumentOutputJob(db, { businessId, installationId, sourceId: saleId, operationId, commandKind: "manual", documentKind: "sale_receipt", trigger: "manual", channel: "print", templateId: "default:sale_receipt", templateRevision: template.revision, copies: 1, printerBindingId: "sale_receipt" });
    const snapshotScope = { businessId, installationId, jobId };
    captureDocumentRenderSnapshot(db, snapshotScope, source.values, source.lines);
    captureDocumentSnapshotImages(db, snapshotScope, capturedImages);
    if (digest(readSaleDocumentSource(db, businessId, saleId)) !== digest(source)) return conflict();
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return jobId;
}
