import {
  BUSINESS_CAPABILITIES,
  type CatalogProductDraft,
  type CommerceSaleDraftDetail
} from "@yardimci-asistan/shared";
import { assertPersistedBusinessCapability } from "./business-capability-runtime.js";
import {
  createMarketCartDraftRecord,
  createMarketProductDraftRecord,
  getMarketCartDraftRecord,
  listMarketCartDraftRecords,
  listMarketProductDraftRecords,
  type CreateMarketCartDraftInput,
  type CreateMarketProductDraftInput,
  type ListMarketCartDraftsOptions,
  type ListMarketProductDraftsOptions
} from "./market-companion-store.js";

export type {
  CreateMarketCartDraftInput,
  CreateMarketProductDraftInput,
  ListMarketCartDraftsOptions,
  ListMarketProductDraftsOptions
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
