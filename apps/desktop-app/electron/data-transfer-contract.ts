import type { TransferPreferences } from "@yardimci-asistan/shared";
export { DEFAULT_TRANSFER_PREFERENCES, PRODUCT_TRANSFER_FIELDS, CUSTOMER_TRANSFER_FIELDS, IDENTITY_TRANSFER_FIELDS } from "@yardimci-asistan/shared";
export type { TransferPreferences } from "@yardimci-asistan/shared";
import type { CustomerListQuery } from "./database/customer-store";
export type TransferEntity = "products" | "customers";
export type TransferFormat = "csv" | "xlsx" | "zip";
export type TransferStatus = "new" | "update" | "skip" | "error";
export interface TransferRow {
  row: number; name: string; status: TransferStatus; reasons: string[]; warnings: string[];
  before: Record<string, string>; after: Record<string, string>; publishable: boolean;
}
export interface TransferPreview {
  revision: string; total: number; counts: Record<TransferStatus, number>;
  publishable: number; blocked: number; existingPublished: number; rows: TransferRow[];
}
export interface TransferSource { token: string; name: string; format: string; headers: string[]; mapping: Record<string, string>; total: number; warnings: string[] }
export interface TransferResult { added: number; updated: number; skipped: number; errors: number; rows: TransferRow[] }
export interface TransferExportOptions {
  entity: TransferEntity; format: TransferFormat; scope: "all" | "filtered";
  search?: string; quickAccessOnly?: boolean; customerFilter?: CustomerListQuery["filter"]; includeImages: boolean;
  includeIdentity: boolean; template?: "full" | "basic" | "ideasoft";
}
export interface TransferExportSummary { records: number; images: number }
export interface TransferFileResult extends TransferExportSummary { token: string; name: string; path: string; warnings: string[]; cancelled?: boolean }
export interface TransferProgress { stage: string; done: number; total: number }
export interface DataTransferBridge {
  pick(entity: TransferEntity): Promise<TransferSource | null>;
  upload(entity: TransferEntity, name: string, bytes: Uint8Array): Promise<TransferSource>;
  preview(token: string, mapping: Record<string, string>, preferences: TransferPreferences): Promise<TransferPreview>;
  apply(token: string, revision: string): Promise<TransferResult>;
  rows(token: string, status: TransferStatus | "all", offset: number): Promise<TransferRow[]>;
  summary(options: TransferExportOptions): Promise<TransferExportSummary>;
  export(options: TransferExportOptions): Promise<TransferFileResult>;
  report(token: string): Promise<TransferFileResult>;
  release(token: string): Promise<void>;
  onProgress(listener: (progress: TransferProgress) => void): () => void;
}
