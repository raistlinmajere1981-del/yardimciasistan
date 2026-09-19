import {
  BUSINESS_CAPABILITIES,
  type CommerceSaleDraft,
  type CommerceSaleDraftDetail,
  type MarketBarcodeScanEvent,
  type MarketCartDraftLoadResult
} from "@yardimci-asistan/shared";
import { assertPersistedBusinessCapability } from "./business-capability-runtime.js";
import {
  createMarketCartDraftRecord,
  consumePendingMarketBarcodeScanRecords,
  getMarketCartDraftRecord,
  loadMarketCartDraftForQuickSaleRecord,
  listMarketCartDraftRecords,
  markMarketCartDraftReviewedRecord,
  type ConsumePendingMarketBarcodeScansOptions,
  type CreateMarketCartDraftInput,
  type ListMarketCartDraftsOptions
} from "./market-companion-store.js";

export type {
  CreateMarketCartDraftInput,
  ListMarketCartDraftsOptions,
  ConsumePendingMarketBarcodeScansOptions
};

function requireCatalog(databasePath: string): void {
  assertPersistedBusinessCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Market işlemleri için ürün kataloğu etkin olmalı."
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
