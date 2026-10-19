import type { TablePublicFeatureId, TableSmokingPolicy } from "./table-public-details";
import type {
  PublicResourceMedia,
  PublicResourceMediaAssetFields,
  PublicResourceMediaDraftResult,
  PublicResourceMediaDraftState,
  PublicResourceMediaKind,
  PublicResourceMediaMutationResult
} from "./public-resource-media";

export const TABLE_PUBLIC_CATALOG_VERSION = 1 as const;

export type TablePublicMediaKind = PublicResourceMediaKind;
export type TablePublicMedia = PublicResourceMedia;

export interface TablePublicCatalogTable {
  id: string;
  name: string;
  area: string;
  capacity: number;
  description: string;
  features: TablePublicFeatureId[];
  smokingPolicy: TableSmokingPolicy;
  sortOrder: number;
  media: TablePublicMedia[];
}

export interface TablePublicCatalog {
  localization?: import("./public-translations").PublicLocalization;
  version: typeof TABLE_PUBLIC_CATALOG_VERSION;
  enabled: boolean;
  updatedAt: string;
  tables: TablePublicCatalogTable[];
}

export interface TableMediaAsset extends PublicResourceMediaAssetFields {
  tableId: string;
}

export interface AddTableMediaInput {
  tableId: string;
  kind?: TablePublicMediaKind;
}

export interface UpdateTableMediaInput {
  tableId: string;
  mediaId: string;
  kind: TablePublicMediaKind;
  title: string;
}

export interface DeleteTableMediaInput {
  tableId: string;
  mediaId: string;
}

export type TableMediaDraftState = PublicResourceMediaDraftState;
export type TableMediaDraftResult = PublicResourceMediaDraftResult;
export type TableMediaMutationResult = PublicResourceMediaMutationResult<TableMediaAsset>;
