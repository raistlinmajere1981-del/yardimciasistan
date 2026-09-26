import type { RoomPublicFeatureId } from "./room-public-details";

export const ROOM_PUBLIC_CATALOG_VERSION = 1 as const;

export type RoomPublicMediaKind = "cover" | "photo" | "panorama_360" | "panorama_180" | "video";

export interface RoomPublicMedia {
  id: string;
  kind: RoomPublicMediaKind;
  url: string;
  mimeType: string;
  title: string;
  sortOrder: number;
}

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
  updatedAt: string;
  rooms: RoomPublicCatalogRoom[];
}
