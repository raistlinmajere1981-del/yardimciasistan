import type { RoomPublicFeatureId } from "./room-public-details";
import type {
  PublicResourceMedia,
  PublicResourceMediaAssetFields,
  PublicResourceMediaDraftResult,
  PublicResourceMediaDraftState,
  PublicResourceMediaKind,
  PublicResourceMediaMutationResult
} from "./public-resource-media";

export const ROOM_PUBLIC_CATALOG_VERSION = 1 as const;

export type RoomPublicMediaKind = PublicResourceMediaKind;
export type RoomPublicMedia = PublicResourceMedia;

export interface RoomPublicCatalogRoom {
  id: string;
  name: string;
  number: string;
  capacity: number;
  bedInfo: string;
  floor: string;
  features: RoomPublicFeatureId[];
  description: string;
  priceNote: string;
  nightlyPriceMinor: number;
  currency: string;
  sortOrder: number;
  media: RoomPublicMedia[];
}

export interface RoomPublicCatalog {
  version: typeof ROOM_PUBLIC_CATALOG_VERSION;
  enabled: boolean;
  updatedAt: string;
  rooms: RoomPublicCatalogRoom[];
}

export interface RoomMediaAsset extends PublicResourceMediaAssetFields {
  roomId: string;
}

export interface AddRoomMediaInput {
  roomId: string;
  kind?: RoomPublicMediaKind;
}

export interface UpdateRoomMediaInput {
  roomId: string;
  mediaId: string;
  kind: RoomPublicMediaKind;
  title: string;
}

export interface DeleteRoomMediaInput {
  roomId: string;
  mediaId: string;
}

export type RoomMediaDraftState = PublicResourceMediaDraftState;
export type RoomMediaDraftResult = PublicResourceMediaDraftResult;
export type RoomMediaMutationResult = PublicResourceMediaMutationResult<RoomMediaAsset>;
