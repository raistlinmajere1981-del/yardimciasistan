import type { BrowserWindow } from "electron";
import type {
  AddRoomMediaInput,
  DeleteRoomMediaInput,
  PublicResourceCoverPreview,
  RoomMediaAsset,
  RoomMediaDraftResult,
  RoomMediaDraftState,
  RoomMediaMutationResult,
  RoomPublicMedia,
  UpdateRoomMediaInput
} from "@yardimci-asistan/shared";
import {
  createPublicResourceMediaService,
  type ResourceMediaAsset,
  type StoredResourceMediaAsset
} from "./public-resource-media-service";

interface StoredRoomMediaAsset extends RoomMediaAsset {
  storedPath: string;
  contentHash: string;
}

const service = createPublicResourceMediaService({
  rootDirectory: "room-media",
  idField: "roomId",
  mediaIdPrefix: "room_media_",
  pickerTitle: "Oda medyası seç",
  singularLabel: "Oda",
  pluralLabel: "Oda medyaları"
});

export async function addRoomMediaFromDialog(
  userDataPath: string,
  owner: BrowserWindow | null,
  input: AddRoomMediaInput
): Promise<RoomMediaMutationResult> {
  return toMutationResult(await service.addFromDialog(userDataPath, owner, input?.roomId, input?.kind));
}

export function updateRoomMedia(userDataPath: string, input: UpdateRoomMediaInput): RoomMediaMutationResult {
  return toMutationResult(service.update(userDataPath, {
    resourceId: input?.roomId,
    mediaId: input?.mediaId,
    kind: input?.kind,
    title: input?.title
  }));
}

export function deleteRoomMedia(userDataPath: string, input: DeleteRoomMediaInput): RoomMediaMutationResult {
  return toMutationResult(service.remove(userDataPath, {
    resourceId: input?.roomId,
    mediaId: input?.mediaId
  }));
}

export function listRoomMedia(userDataPath: string, roomId: string): RoomMediaAsset[] {
  return service.list(userDataPath, roomId).map(toRoomAsset);
}

export function listRoomMediaCoverPreviews(userDataPath: string): PublicResourceCoverPreview[] {
  return service.listCoverPreviews(userDataPath);
}

export function getRoomMediaDraftState(userDataPath: string): RoomMediaDraftState {
  return service.getDraftState(userDataPath);
}

export function commitRoomMediaDraft(userDataPath: string): RoomMediaDraftResult {
  return service.commitDraft(userDataPath);
}

export function discardRoomMediaDraft(userDataPath: string): RoomMediaDraftResult {
  return service.discardDraft(userDataPath);
}

export function listPendingRoomMedia(userDataPath: string): StoredRoomMediaAsset[] {
  return service.listPending(userDataPath).map(toStoredRoomAsset);
}

export function getRoomPublishedMedia(userDataPath: string, roomId: string): RoomPublicMedia[] {
  return service.getPublished(userDataPath, roomId);
}

export function getRoomMediaUploadSource(userDataPath: string, mediaId: string): {
  asset: StoredRoomMediaAsset;
  absolutePath: string;
} | null {
  const source = service.getUploadSource(userDataPath, mediaId);
  return source ? { asset: toStoredRoomAsset(source.asset), absolutePath: source.absolutePath } : null;
}

export function markRoomMediaPublished(userDataPath: string, mediaId: string, remoteUrl: string): void {
  service.markPublished(userDataPath, mediaId, remoteUrl);
}

function toRoomAsset(asset: ResourceMediaAsset): RoomMediaAsset {
  const { resourceId, ...rest } = asset;
  return { ...rest, roomId: resourceId };
}

function toStoredRoomAsset(asset: StoredResourceMediaAsset): StoredRoomMediaAsset {
  const { resourceId, ...rest } = asset;
  return { ...rest, roomId: resourceId };
}

function toMutationResult(result: ReturnType<typeof service.update>): RoomMediaMutationResult {
  return {
    ...result,
    media: result.media.map(toRoomAsset)
  };
}
