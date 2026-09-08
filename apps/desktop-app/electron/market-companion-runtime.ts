import {
  BUSINESS_CAPABILITIES,
  type CatalogProductDraft,
  type CommerceSaleDraft,
  type CommerceSaleDraftDetail,
  type MarketBarcodeScanEvent,
  type MarketCartDraftLoadResult
} from "@yardimci-asistan/shared";
import { assertPersistedBusinessCapability } from "./business-capability-runtime.js";
import {
  createMarketCartDraftRecord,
  createMarketProductDraftRecord,
  consumePendingMarketBarcodeScanRecords,
  getMarketCartDraftRecord,
  loadMarketCartDraftForQuickSaleRecord,
  listMarketCartDraftRecords,
  listMarketProductDraftRecords,
  markMarketCartDraftReviewedRecord,
  markMarketProductDraftReviewedRecord,
  type ConsumePendingMarketBarcodeScansOptions,
  type CreateMarketCartDraftInput,
  type CreateMarketProductDraftInput,
  type ListMarketCartDraftsOptions,
  type ListMarketProductDraftsOptions
} from "./market-companion-store.js";

export type {
  CreateMarketCartDraftInput,
  CreateMarketProductDraftInput,
  ListMarketCartDraftsOptions,
  ListMarketProductDraftsOptions,
  ConsumePendingMarketBarcodeScansOptions
};

function requireCatalog(databasePath: string): void {
  assertPersistedBusinessCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Market ürün taslakları için ürün kataloğu etkin olmalı."
  );
}

function requireSales(databasePath: string): void {
  assertPersistedBusinessCapability(
    databasePath,
    BUSINESS_CAPABILITIES.SALES,
    "Market sepet taslakları için satış yeteneği etkin olmalı."
  );
}

function requireBarcode(databasePath: string): void {
  assertPersistedBusinessCapability(
    databasePath,
    BUSINESS_CAPABILITIES.RETAIL_BARCODE,
    "Telefon barkod modu için barkod yeteneği etkin olmalı."
  );
}

export function createMarketProductDraft(
  databasePath: string,
  input: CreateMarketProductDraftInput
): CatalogProductDraft {
  requireCatalog(databasePath);
  return createMarketProductDraftRecord(databasePath, input);
}

export function listMarketProductDrafts(
  databasePath: string,
  options: ListMarketProductDraftsOptions = {}
): CatalogProductDraft[] {
  requireCatalog(databasePath);
  return listMarketProductDraftRecords(databasePath, options);
}

export function markMarketProductDraftReviewed(
  databasePath: string,
  draftId: string
): CatalogProductDraft {
  requireCatalog(databasePath);
  return markMarketProductDraftReviewedRecord(databasePath, draftId);
}

export function createMarketCartDraft(
  databasePath: string,
  input: CreateMarketCartDraftInput
): CommerceSaleDraftDetail {
  requireCatalog(databasePath);
  requireSales(databasePath);
  return createMarketCartDraftRecord(databasePath, input);
}

export function listMarketCartDrafts(
  databasePath: string,
  options: ListMarketCartDraftsOptions = {}
): CommerceSaleDraftDetail[] {
  requireCatalog(databasePath);
  requireSales(databasePath);
  return listMarketCartDraftRecords(databasePath, options);
}

export function getMarketCartDraft(
  databasePath: string,
  draftId: string
): CommerceSaleDraftDetail | null {
  requireCatalog(databasePath);
  requireSales(databasePath);
  return getMarketCartDraftRecord(databasePath, draftId);
}

export function loadMarketCartDraftForQuickSale(
  databasePath: string,
  draftId: string
): MarketCartDraftLoadResult {
  requireCatalog(databasePath);
  requireSales(databasePath);
  return loadMarketCartDraftForQuickSaleRecord(databasePath, draftId);
}

export function markMarketCartDraftReviewed(
  databasePath: string,
  draftId: string
): CommerceSaleDraft {
  requireCatalog(databasePath);
  requireSales(databasePath);
  return markMarketCartDraftReviewedRecord(databasePath, draftId);
}

export function consumePendingMarketBarcodeScans(
  databasePath: string,
  options: ConsumePendingMarketBarcodeScansOptions = {}
): MarketBarcodeScanEvent[] {
  requireCatalog(databasePath);
  requireSales(databasePath);
  requireBarcode(databasePath);
  return consumePendingMarketBarcodeScanRecords(databasePath, options);
}
