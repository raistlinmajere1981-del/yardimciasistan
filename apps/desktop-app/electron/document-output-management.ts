import type { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES as C, DOCUMENT_KINDS, documentKindEnabled, documentTriggerCompatible,
  validateDocumentTemplate, documentChannelCompatible, type BusinessCapability, type DocumentKind,
  type DocumentPrinter, type DocumentPrinterSettings, type DocumentOutputRuleInput, type DocumentOutputSettings, type DocumentTemplateLayout, type DocumentOutputTemplateReadResult
} from "@yardimci-asistan/shared";
import { createDocumentTemplate, saveDocumentOutputRule } from "./document-output-store";

export class DocumentOutputManagementError extends Error {}
function requireValue(value: unknown, code: string): asserts value {
  if (!value) throw new DocumentOutputManagementError(code);
}
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "DOCUMENT_INPUT_INVALID");
  requireValue(Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key)), "DOCUMENT_INPUT_INVALID");
}
export function sanitizeDocumentPrinters(value: unknown, platform: NodeJS.Platform = process.platform): DocumentPrinter[] {
  if (!Array.isArray(value)) throw new DocumentOutputManagementError("DOCUMENT_PRINTERS_FAILED");
  const printers = new Map<string, DocumentPrinter>();
  for (const raw of value as unknown[]) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    if (!validPrinterName(item.name) || printers.has(item.name)) continue;
    // Only explicit native offline signals; absence of a signal never proves connectivity.
    if (platform === "win32" && typeof item.status === "number" && (item.status & 0x80) !== 0) continue;
    const options = item.options && typeof item.options === "object" ? item.options as Record<string, unknown> : null;
    if (typeof options?.["printer-state-reasons"] === "string" && options["printer-state-reasons"].split(",").some(reason => /^offline-report(?:-(?:error|warning|report))?$/.test(reason.trim()))) continue;
    printers.set(item.name, { name: item.name,
      ...(validPrinterName(item.displayName) ? { displayName: item.displayName } : {}),
      ...(typeof item.isDefault === "boolean" ? { isDefault: item.isDefault } : {}) });
  }
  return [...printers.values()];
}
function validPrinterName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256
    && Buffer.byteLength(value, "utf8") <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}
export interface DocumentOutputManagementActor { role: "desktop_owner"; assertAuthorized(): void }
/** Local authenticated owner only; business identity is resolved inside each operation. */
export class DocumentOutputManagement {
  constructor(private readonly database: DatabaseSync, private readonly actor: DocumentOutputManagementActor) {}
  private context(kind: unknown) {
    this.actor.assertAuthorized();
    requireValue(this.actor.role === "desktop_owner", "DOCUMENT_OWNER_REQUIRED");
    requireValue(typeof kind === "string" && DOCUMENT_KINDS.includes(kind as DocumentKind) && kind !== "invoice_copy", "DOCUMENT_INPUT_INVALID");
    const business = this.database.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC, id ASC LIMIT 1").get() as { id: string } | undefined;
    requireValue(business, "DOCUMENT_TENANT_REQUIRED");
    const capabilities = this.database.prepare("SELECT capability_id FROM business_capabilities WHERE business_id=? AND is_enabled=1").all(business.id)
      .map(row => row.capability_id as BusinessCapability);
    requireValue(documentKindEnabled(kind as DocumentKind, capabilities), "DOCUMENT_CAPABILITY_DISABLED");
    // Canonical setup servicePreferences.whatsapp is derived from persisted C.WHATSAPP.
    const settings = this.database.prepare("SELECT whatsapp_mode FROM settings WHERE business_id=? LIMIT 1").get(business.id);
    return { businessId: business.id, whatsappEnabled: capabilities.includes(C.WHATSAPP) && settings?.whatsapp_mode === "webview" };
  }
  authorizeFormImageAccess(value: unknown): string {
    exact(value, ["documentKind"]);
    return this.context(value.documentKind).businessId;
  }
  authorizePrinterAccess(value: unknown): string {
    exact(value, ["documentKind"]);
    return this.context(value.documentKind).businessId;
  }
  readPrinterBinding(value: unknown, installationId: string, printers: DocumentPrinter[], expectedBusinessId?: string): DocumentPrinterSettings {
    exact(value, ["documentKind"]);
    const { businessId } = this.context(value.documentKind);
    requireValue(expectedBusinessId === undefined || expectedBusinessId === businessId, "DOCUMENT_TENANT_CHANGED");
    requireValue(typeof installationId === "string" && installationId.length > 0 && installationId.length <= 128, "DOCUMENT_INPUT_INVALID");
    const row = this.database.prepare("SELECT printer_ref FROM document_printer_bindings WHERE business_id=? AND installation_id=? AND id=?")
      .get(businessId, installationId, value.documentKind as string);
    const printerRef = row ? String(row.printer_ref) : null;
    return { documentKind: value.documentKind as DocumentKind, printers, printerRef, missing: printerRef !== null && !printers.some(printer => printer.name === printerRef) };
  }
  savePrinterBinding(value: unknown, installationId: string, printers: DocumentPrinter[], expectedBusinessId?: string): DocumentPrinterSettings {
    exact(value, ["documentKind", "printerRef"]);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const { businessId } = this.context(value.documentKind);
      requireValue(expectedBusinessId === undefined || expectedBusinessId === businessId, "DOCUMENT_TENANT_CHANGED");
      requireValue(typeof installationId === "string" && installationId.length > 0 && installationId.length <= 128, "DOCUMENT_INPUT_INVALID");
      requireValue(value.printerRef === null || (validPrinterName(value.printerRef) && printers.some(printer => printer.name === value.printerRef)), "DOCUMENT_PRINTER_INVALID");
      this.database.prepare("DELETE FROM document_printer_bindings WHERE business_id=? AND installation_id=? AND id=?").run(businessId, installationId, value.documentKind as string);
      if (value.printerRef !== null) this.database.prepare("INSERT INTO document_printer_bindings(business_id,installation_id,id,printer_ref) VALUES(?,?,?,?)")
        .run(businessId, installationId, value.documentKind as string, value.printerRef);
      const result = this.readPrinterBinding({ documentKind: value.documentKind }, installationId, printers);
      this.database.exec("COMMIT");
      return result;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  read(value: unknown): DocumentOutputSettings {
    exact(value, ["documentKind"]);
    const context = this.context(value.documentKind);
    const rules = this.database.prepare(`SELECT document_kind AS documentKind, trigger_kind AS trigger, channel, mode, adapter
      FROM document_output_rules WHERE business_id=? AND document_kind=? ORDER BY trigger_kind,channel`)
      .all(context.businessId, value.documentKind as string) as unknown as DocumentOutputRuleInput[];
    return { documentKind: value.documentKind as DocumentKind, whatsappEnabled: context.whatsappEnabled,
      rules: rules.filter(rule => rule.channel === "print" || (context.whatsappEnabled && rule.channel === "whatsapp" && rule.adapter === "whatsapp_webview")) };
  }
  private template(businessId: string, documentKind: DocumentKind): DocumentOutputTemplateReadResult {
    const row = this.database.prepare("SELECT revision,document_kind,layout_json FROM document_print_templates WHERE business_id=? AND id=? ORDER BY revision DESC LIMIT 1")
      .get(businessId, `default:${documentKind}`);
    if (!row) return { documentKind, revision: null, layout: null };
    requireValue(row.document_kind === documentKind && Number.isSafeInteger(row.revision) && Number(row.revision) > 0
      && typeof row.layout_json === "string" && Buffer.byteLength(row.layout_json, "utf8") <= 32768, "DOCUMENT_TEMPLATE_INVALID");
    let layout: DocumentTemplateLayout;
    try { const parsed: unknown = JSON.parse(row.layout_json); validateDocumentTemplate(parsed as DocumentTemplateLayout); layout = parsed as DocumentTemplateLayout; }
    catch { throw new DocumentOutputManagementError("DOCUMENT_TEMPLATE_INVALID"); }
    return { documentKind, revision: Number(row.revision), layout };
  }
  readTemplate(value: unknown): DocumentOutputTemplateReadResult {
    exact(value, ["documentKind"]);
    const { businessId } = this.context(value.documentKind);
    return this.template(businessId, value.documentKind as DocumentKind);
  }
  saveTemplate(value: unknown): DocumentOutputTemplateReadResult {
    exact(value, ["documentKind", "expectedRevision", "layout"]);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const { businessId } = this.context(value.documentKind);
      requireValue(value.expectedRevision === null || (Number.isSafeInteger(value.expectedRevision) && Number(value.expectedRevision) > 0), "DOCUMENT_INPUT_INVALID");
      const layout = value.layout as DocumentTemplateLayout;
      try {
        requireValue(Buffer.byteLength(JSON.stringify(layout), "utf8") <= 32768, "DOCUMENT_TEMPLATE_INVALID");
        validateDocumentTemplate(layout);
      } catch { throw new DocumentOutputManagementError("DOCUMENT_TEMPLATE_INVALID"); }
      const kind = value.documentKind as DocumentKind;
      const latest = this.template(businessId, kind);
      requireValue(latest.revision === value.expectedRevision, "DOCUMENT_TEMPLATE_CONFLICT");
      const revision = (latest.revision ?? 0) + 1;
      requireValue(Number.isSafeInteger(revision), "DOCUMENT_TEMPLATE_INVALID");
      createDocumentTemplate(this.database, businessId, `default:${kind}`, revision, kind, layout);
      this.database.exec("COMMIT");
      return { documentKind: kind, revision, layout };
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  saveRule(value: unknown): DocumentOutputRuleInput {
    exact(value, ["documentKind", "trigger", "channel", "mode", "adapter"]);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const context = this.context(value.documentKind);
      const rule = value as unknown as DocumentOutputRuleInput;
      requireValue(["print", "whatsapp"].includes(rule.channel) && ["native_print", "whatsapp_webview"].includes(rule.adapter)
        && ["OFF", "ASK_CONFIRMATION", "AUTOMATIC"].includes(rule.mode) && ["manual", "sale_completed", "table_closed", "stay_checked_out", "order_dispatched", "shipment_created", "customer_statement_requested", "order_created"].includes(rule.trigger)
        && documentTriggerCompatible(rule.documentKind, rule.trigger)
        && documentChannelCompatible(rule.channel, rule.adapter, rule.mode)
        && ((rule.channel === "print" && rule.adapter === "native_print")
          || (context.whatsappEnabled && rule.channel === "whatsapp" && rule.adapter === "whatsapp_webview")), "DOCUMENT_RULE_INVALID");
      saveDocumentOutputRule(this.database, { ...rule, businessId: context.businessId });
      this.database.exec("COMMIT");
      return rule;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
