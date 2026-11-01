import {
  DOCUMENT_FIELD_BINDINGS, DOCUMENT_KINDS, validateDocumentTemplate,
  type DocumentFieldBinding, type DocumentKind, type DocumentTemplateField, type DocumentTemplateLayout
} from "@yardimci-asistan/shared";

type Values = Partial<Record<DocumentFieldBinding, string | null>>;
interface RenderField extends DocumentTemplateField { text: string }
export interface DocumentRenderSnapshot {
  version: 1; documentKind: DocumentKind; legalMeaning: "non_fiscal_copy";
  /** A consumer must visibly render this notice independently of template fields. */
  notice: "MALİ BELGE DEĞİLDİR";
  unit: "mm10"; pageWidth: number; pageHeight: number;
  fields: RenderField[]; rows: RenderField[][]; scan: DocumentTemplateLayout["scan"];
}
const allowed = new Set<string>(DOCUMENT_FIELD_BINDINGS);
function validateValues(values: Values, lines: boolean): void {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("DOCUMENT_RENDER_VALUES_INVALID");
  const prototype: unknown = Object.getPrototypeOf(values);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("DOCUMENT_RENDER_VALUES_INVALID");
  for (const key of Reflect.ownKeys(values)) {
    if (typeof key !== "string" || !allowed.has(key) || key.startsWith("line.") !== lines) throw new Error("DOCUMENT_RENDER_VALUES_INVALID");
    const descriptor = Object.getOwnPropertyDescriptor(values, key);
    if (!descriptor || !("value" in descriptor)) throw new Error("DOCUMENT_RENDER_VALUES_INVALID");
    const value: unknown = descriptor.value;
    if (value !== null && (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 4096)) throw new Error("DOCUMENT_RENDER_VALUES_INVALID");
  }
}
/** Literal text only: an HTML consumer must escape it for its output context. */
export function createDocumentRenderSnapshot(kind: DocumentKind, layout: DocumentTemplateLayout, values: Values, lines: Values[]): DocumentRenderSnapshot {
  if (!DOCUMENT_KINDS.includes(kind)) throw new Error("DOCUMENT_RENDER_KIND_INVALID");
  validateDocumentTemplate(layout);
  if (Buffer.byteLength(JSON.stringify(layout), "utf8") > 32768) throw new Error("DOCUMENT_TEMPLATE_INVALID");
  validateValues(values, false);
  if (!Array.isArray(lines) || lines.length > (layout.lineBlock?.maxRows ?? 0)) throw new Error("DOCUMENT_RENDER_ROWS_INVALID");
  for (const line of lines) validateValues(line, true);
  const field = (f: DocumentTemplateField, row?: Values, offset = 0): RenderField => ({
    binding: f.binding, x: f.x, y: f.y + offset, width: f.width, height: f.height,
    text: (f.binding.startsWith("line.") ? row?.[f.binding] : values[f.binding]) ?? ""
  });
  const block = layout.lineBlock;
  const result: DocumentRenderSnapshot = {
    version: 1, documentKind: kind, legalMeaning: "non_fiscal_copy", notice: "MALİ BELGE DEĞİLDİR",
    unit: "mm10", pageWidth: layout.pageWidth, pageHeight: layout.pageHeight,
    fields: layout.fields.map(f => field(f)),
    rows: block ? lines.map((line, index) => block.fields.map(f => field(f, line, block.y + index * block.rowHeight))) : [],
    scan: layout.scan ? { originalImageRef: layout.scan.originalImageRef, processedImageRef: layout.scan.processedImageRef, foreground: layout.scan.foreground } : null
  };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 256 * 1024) throw new Error("DOCUMENT_RENDER_SNAPSHOT_TOO_LARGE");
  return result;
}
