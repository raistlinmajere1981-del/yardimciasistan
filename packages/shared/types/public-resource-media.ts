export const PUBLIC_RESOURCE_MEDIA_KINDS = [
  "cover",
  "photo",
  "panorama_360",
  "panorama_180",
  "video"
] as const;

export type PublicResourceMediaKind = (typeof PUBLIC_RESOURCE_MEDIA_KINDS)[number];

export interface PublicResourceMedia {
  id: string;
  kind: PublicResourceMediaKind;
  url: string;
  mimeType: string;
  title: string;
  sortOrder: number;
}

export interface PublicResourceMediaAssetFields {
  id: string;
  kind: PublicResourceMediaKind;
  originalName: string;
  mimeType: string;
  title: string;
  sortOrder: number;
  sizeBytes: number;
  updatedAt: string;
  remoteUrl: string;
  previewDataUrl?: string;
}

export interface PublicResourceMediaDraftState {
  dirty: boolean;
}

export type PublicResourceMediaDraftResult =
  | { ok: true; message: string; dirty: false; changed: boolean }
  | { ok: false; message: string; dirty: boolean; changed: false };

export type PublicResourceMediaMutationResult<TAsset extends PublicResourceMediaAssetFields> =
  | { ok: true; message: string; media: TAsset[]; dirty?: boolean }
  | { ok: false; message: string; media: TAsset[]; dirty?: boolean };

export function isPublicResourceMediaKind(value: unknown): value is PublicResourceMediaKind {
  return typeof value === "string"
    && (PUBLIC_RESOURCE_MEDIA_KINDS as readonly string[]).includes(value);
}
