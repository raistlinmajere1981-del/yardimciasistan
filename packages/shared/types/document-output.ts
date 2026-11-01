import { BUSINESS_CAPABILITIES as C, type BusinessCapability } from "./business-capabilities";

export const DOCUMENT_KINDS = ["sale_receipt", "table_bill", "stay_statement", "product_label", "invoice_copy", "credit_statement", "shipping_label", "kitchen_ticket"] as const;
export type DocumentKind = typeof DOCUMENT_KINDS[number];
export type DocumentTrigger = "sale_completed" | "table_closed" | "stay_checked_out" | "order_dispatched" | "shipment_created" | "customer_statement_requested" | "order_created" | "manual";
export type DocumentOutputChannel = "print" | "email" | "whatsapp";
export type DocumentOutputMode = "OFF" | "ASK_CONFIRMATION" | "AUTOMATIC";
export type DocumentDeliveryState = "queued" | "awaiting-confirmation" | "sending" | "accepted" | "failed" | "unknown";
export type DocumentOutputAdapter = "native_print" | "smtp" | "whatsapp_webview" | "whatsapp_business_api";
/** Fixed-point: 1 unit = 0.1 mm. Never pixels or floating-point millimetres. */
export type DocumentMm10 = number;
export const DOCUMENT_FIELD_BINDINGS = [
  "business.name", "business.address", "business.phone", "document.number", "document.date",
  "customer.name", "totals.total", "totals.currency", "line.description", "line.quantity", "line.price", "line.total", "product.barcode"
] as const;
export type DocumentFieldBinding = typeof DOCUMENT_FIELD_BINDINGS[number];
export interface DocumentTemplateField {
  binding: DocumentFieldBinding;
  x: DocumentMm10; y: DocumentMm10; width: DocumentMm10; height: DocumentMm10;
}
export interface DocumentTemplateLayout {
  unit: "mm10";
  pageWidth: DocumentMm10;
  pageHeight: DocumentMm10;
  fields: DocumentTemplateField[];
  lineBlock: { y: DocumentMm10; rowHeight: DocumentMm10; maxRows: number; fields: DocumentTemplateField[] } | null;
  /** Opaque local asset IDs only. No paths, data URLs, credentials or remote URLs. */
  scan: { originalImageRef: string; processedImageRef: string | null; foreground: boolean } | null;
}
export interface DocumentOutputRule {
  businessId: string; documentKind: DocumentKind; trigger: DocumentTrigger;
  channel: DocumentOutputChannel; mode: DocumentOutputMode; adapter: DocumentOutputAdapter;
}
export interface DocumentPrinterBinding {
  businessId: string; installationId: string; id: string; printerRef: string;
}
/** Supplied only by an authoritative runtime adapter, never a renderer readiness claim. */
export interface DocumentAdapterSupport {
  adapter: DocumentOutputAdapter; available: boolean; supportsAutonomousDelivery: boolean;
}
/** This is output evidence only. No tax/legal issuance lifecycle exists here. */
export interface DocumentJobSnapshot {
  businessId: string; installationId: string; commandKind: "event" | "manual"; reprintOf: string | null;
  mode: Exclude<DocumentOutputMode, "OFF">; printerBindingId: string | null;
  sourceId: string; operationId: string; documentKind: DocumentKind; trigger: DocumentTrigger;
  templateId: string; templateRevision: number; layout: DocumentTemplateLayout;
  channel: DocumentOutputChannel; adapter: DocumentOutputAdapter; copies: number;
  legalMeaning: "non_fiscal_copy";
}
export interface DocumentOutputJob {
  id: string; snapshot: DocumentJobSnapshot; state: DocumentDeliveryState; createdAt: string;
}
export const DOCUMENT_REQUIRED_CAPABILITIES: Record<DocumentKind, readonly BusinessCapability[]> = {
  sale_receipt: [C.SALES], table_bill: [C.FOOD_ORDERS], stay_statement: [C.ACCOMMODATION_STAYS],
  product_label: [C.RETAIL_LABELS], invoice_copy: [],
  credit_statement: [C.CUSTOMER_CREDIT], shipping_label: [C.ORDERS], kitchen_ticket: [C.FOOD_ORDERS]
};
export function documentKindEnabled(kind: DocumentKind, capabilities: Iterable<BusinessCapability>): boolean {
  const enabled = new Set(capabilities);
  return enabled.has(C.PRINTING) && DOCUMENT_REQUIRED_CAPABILITIES[kind]?.every(value => enabled.has(value)) === true;
}
export function documentTriggerCompatible(kind: DocumentKind, trigger: DocumentTrigger): boolean {
  const triggers: Partial<Record<DocumentKind, readonly DocumentTrigger[]>> = {
    sale_receipt: ["sale_completed"], table_bill: ["table_closed"], stay_statement: ["stay_checked_out"],
    credit_statement: ["customer_statement_requested"], shipping_label: ["order_dispatched", "shipment_created"],
    kitchen_ticket: ["order_created"]
  };
  return trigger === "manual" || triggers[kind]?.includes(trigger) === true;
}
export function documentChannelCompatible(channel: DocumentOutputChannel, adapter: DocumentOutputAdapter, mode: DocumentOutputMode): boolean {
  if (!["OFF", "ASK_CONFIRMATION", "AUTOMATIC"].includes(mode)) return false;
  const adapterChannel = { native_print: "print", smtp: "email", whatsapp_webview: "whatsapp", whatsapp_business_api: "whatsapp" };
  return adapterChannel[adapter] === channel && !(mode === "AUTOMATIC" && adapter === "whatsapp_webview");
}
/** Necessary support gate; recipients, confirmation, lock and atomic claim remain adapter responsibilities. */
export function documentOutputSupported(rule: DocumentOutputRule, capabilities: Iterable<BusinessCapability>, support: DocumentAdapterSupport): boolean {
  const enabled = new Set(capabilities);
  return rule.mode !== "OFF" && documentKindEnabled(rule.documentKind, enabled) &&
    documentTriggerCompatible(rule.documentKind, rule.trigger) && documentChannelCompatible(rule.channel, rule.adapter, rule.mode) &&
    (rule.channel !== "whatsapp" || enabled.has(C.WHATSAPP)) && support.adapter === rule.adapter && support.available &&
    (rule.mode !== "AUTOMATIC" || support.supportsAutonomousDelivery);
}
export function validateDocumentTemplate(layout: DocumentTemplateLayout): void {
  const integer = (v: number, min: number, max: number) => Number.isSafeInteger(v) && v >= min && v <= max;
  const fail = () => { throw new Error("DOCUMENT_TEMPLATE_INVALID"); };
  if (!layout || layout.unit !== "mm10" || !integer(layout.pageWidth, 200, 5000) || !integer(layout.pageHeight, 200, 10000)) fail();
  const fields = (values: DocumentTemplateField[], inLines: boolean, height: number) => {
    if (!Array.isArray(values) || values.length > 100) fail();
    for (const f of values) {
      if (!f || !DOCUMENT_FIELD_BINDINGS.includes(f.binding) || (!inLines && f.binding.startsWith("line.")) ||
        !integer(f.x, 0, layout.pageWidth) || !integer(f.y, 0, height) ||
        !integer(f.width, 1, layout.pageWidth - f.x) || !integer(f.height, 1, height - f.y) ||
        Object.keys(f).some(key => !["binding", "x", "y", "width", "height"].includes(key))) fail();
    }
  };
  fields(layout.fields, false, layout.pageHeight);
  if (layout.lineBlock !== null) {
    const b = layout.lineBlock;
    if (!b || !integer(b.y, 0, layout.pageHeight) || !integer(b.rowHeight, 1, layout.pageHeight) || !integer(b.maxRows, 1, 200) || b.y + b.rowHeight * b.maxRows > layout.pageHeight || Object.keys(b).some(key => !["y", "rowHeight", "maxRows", "fields"].includes(key))) fail();
    fields(b.fields, true, b.rowHeight);
  }
  if (layout.scan !== null) {
    const s = layout.scan;
    const ref = (v: string) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
    if (!s || !ref(s.originalImageRef) || (s.processedImageRef !== null && !ref(s.processedImageRef)) || typeof s.foreground !== "boolean" || Object.keys(s).some(key => !["originalImageRef", "processedImageRef", "foreground"].includes(key))) fail();
  }
  if (Object.keys(layout).some(key => !["unit", "pageWidth", "pageHeight", "fields", "lineBlock", "scan"].includes(key)) || JSON.stringify(layout).length > 32768) fail();
}
