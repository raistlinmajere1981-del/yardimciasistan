import type { DocumentKind, DocumentOutputRule, DocumentTemplateLayout } from "./document-output";

/** Configuration only. No tenant, path, recipients or output commands. */
export type DocumentOutputRuleInput = Omit<DocumentOutputRule, "businessId">;
export interface DocumentOutputReadInput { documentKind: DocumentKind }
export interface DocumentOutputSettings {
  documentKind: DocumentKind;
  rules: DocumentOutputRuleInput[];
  whatsappEnabled: boolean;
}
export type DocumentOutputManagementResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };
export interface DocumentPrinter { name: string; displayName?: string; isDefault?: boolean }
export interface DocumentPrinterSettings {
  documentKind: DocumentKind;
  printers: DocumentPrinter[];
  printerRef: string | null;
  missing: boolean;
}
export interface SaveDocumentPrinterBindingInput extends DocumentOutputReadInput { printerRef: string | null }
export interface DocumentFormImage { imageRef: string; dataUrl: string }
export interface ReadDocumentFormImageInput extends DocumentOutputReadInput { imageRef: string }
export interface SaveProcessedFormImageInput extends DocumentOutputReadInput { originalImageRef: string; pngBase64: string }
export interface DocumentOutputManagementBridge {
  prepareSaleReceipt?(input: { saleId: string }): Promise<DocumentOutputManagementResult<{ jobId: string }>>;
  listReadyDocuments(input: DocumentOutputReadInput): Promise<DocumentOutputManagementResult<Array<{ jobId: string; createdAt: string }>>>;
  previewReadyDocument(input: DocumentOutputReadInput & { jobId: string }): Promise<DocumentOutputManagementResult<null>>;
  printReadyDocument(input: DocumentOutputReadInput & { jobId: string }): Promise<DocumentOutputManagementResult<"accepted" | "failed" | "unknown" | null>>;
  saveProcessedFormImage(input: SaveProcessedFormImageInput): Promise<DocumentOutputManagementResult<DocumentFormImage>>;
  pickFormImage(input: DocumentOutputReadInput): Promise<DocumentOutputManagementResult<DocumentFormImage | null>>;
  readFormImage(input: ReadDocumentFormImageInput): Promise<DocumentOutputManagementResult<DocumentFormImage>>;
  getDocumentPrinters(input: DocumentOutputReadInput): Promise<DocumentOutputManagementResult<DocumentPrinterSettings>>;
  readPrinterBinding(input: DocumentOutputReadInput): Promise<DocumentOutputManagementResult<DocumentPrinterSettings>>;
  savePrinterBinding(input: SaveDocumentPrinterBindingInput): Promise<DocumentOutputManagementResult<DocumentPrinterSettings>>;
  readDocumentOutputTemplate(input: DocumentOutputReadInput): Promise<DocumentOutputManagementResult<DocumentOutputTemplateReadResult>>;
  saveDocumentOutputTemplate(input: SaveTemplateInput): Promise<DocumentOutputManagementResult<DocumentOutputTemplateReadResult>>;
  getDocumentOutputSettings(input: DocumentOutputReadInput): Promise<DocumentOutputManagementResult<DocumentOutputSettings>>;
  saveDocumentOutputRule(input: DocumentOutputRuleInput): Promise<DocumentOutputManagementResult<DocumentOutputRuleInput>>;
}

export interface DocumentOutputTemplateReadResult {
  documentKind: DocumentKind;
  revision: number | null;
  layout: DocumentTemplateLayout | null;
}
export interface SaveTemplateInput {
  documentKind: DocumentKind;
  expectedRevision: number | null;
  layout: DocumentTemplateLayout;
}
