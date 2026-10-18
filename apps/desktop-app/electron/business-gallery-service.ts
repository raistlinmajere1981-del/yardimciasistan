import type { BrowserWindow } from "electron";
import type { PublicResourceMedia, PublicResourceMediaAssetFields, PublicResourceMediaDraftResult, PublicResourceMediaDraftState, PublicResourceMediaMutationResult } from "@yardimci-asistan/shared";
import { createPublicResourceMediaService } from "./public-resource-media-service";

const RESOURCE = "gallery";
const store = createPublicResourceMediaService({
  rootDirectory: "business-gallery",
  idField: "roomId",
  mediaIdPrefix: "gallery_",
  pickerTitle: "Galeri fotoğrafı seç",
  singularLabel: "Galeri",
  pluralLabel: "Galeri fotoğrafları",
  imageOnly: true
});
export type GalleryAsset = PublicResourceMediaAssetFields;
export type GalleryMutation = PublicResourceMediaMutationResult<GalleryAsset>;
export const listBusinessGallery = (path: string): GalleryAsset[] => store.list(path, RESOURCE);
export const galleryDraftState = (path: string): PublicResourceMediaDraftState => store.getDraftState(path);
export const commitGalleryDraft = (path: string): PublicResourceMediaDraftResult => store.commitDraft(path);
export const discardGalleryDraft = (path: string): PublicResourceMediaDraftResult => store.discardDraft(path);
export const addGalleryPhoto = (path: string, owner: BrowserWindow | null): Promise<GalleryMutation> => store.addFromDialog(path, owner, RESOURCE, "photo");
export const updateGalleryPhoto = (path: string, id: string, kind: "cover" | "photo", title: string): GalleryMutation =>
  store.update(path, { resourceId: RESOURCE, mediaId: id, kind, title });
export const removeGalleryPhoto = (path: string, id: string): GalleryMutation => store.remove(path, { resourceId: RESOURCE, mediaId: id });
export const moveGalleryPhoto = (path: string, id: string, direction: "up" | "down"): GalleryMutation =>
  store.move(path, RESOURCE, id, direction);
export const publishedGallery = (path: string): PublicResourceMedia[] =>
  store.getPublished(path, RESOURCE).filter(item => item.mimeType.startsWith("image/"));
export const pendingGallery = (path: string) => store.listPending(path);
export const galleryUploadSource = (path: string, id: string) => store.getUploadSource(path, id);
export const markGalleryUploaded = (path: string, id: string, url: string): void => store.markPublished(path, id, url);
