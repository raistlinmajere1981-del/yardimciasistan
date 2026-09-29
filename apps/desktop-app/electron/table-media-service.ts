import type { BrowserWindow } from "electron";
import type {
  AddTableMediaInput,
  DeleteTableMediaInput,
  TableMediaAsset,
  TableMediaDraftResult,
  TableMediaDraftState,
  TableMediaMutationResult,
  TablePublicMedia,
  UpdateTableMediaInput
} from "@yardimci-asistan/shared";
import {
  createPublicResourceMediaService,
  type ResourceMediaAsset,
  type StoredResourceMediaAsset
} from "./public-resource-media-service";

export interface StoredTableMediaAsset extends TableMediaAsset {
  storedPath: string;
  contentHash: string;
}

const service = createPublicResourceMediaService({
  rootDirectory: "table-media",
  idField: "tableId",
  mediaIdPrefix: "table_media_",
  pickerTitle: "Masa medyası seç",
  singularLabel: "Masa",
  pluralLabel: "Masa medyaları"
});

export async function addTableMediaFromDialog(
  userDataPath: string,
  owner: BrowserWindow | null,
  input: AddTableMediaInput
): Promise<TableMediaMutationResult> {
  return toMutationResult(await service.addFromDialog(userDataPath, owner, input?.tableId, input?.kind));
}

export function updateTableMedia(userDataPath: string, input: UpdateTableMediaInput): TableMediaMutationResult {
  return toMutationResult(service.update(userDataPath, {
    resourceId: input?.tableId,
    mediaId: input?.mediaId,
    kind: input?.kind,
    title: input?.title
  }));
}

export function deleteTableMedia(userDataPath: string, input: DeleteTableMediaInput): TableMediaMutationResult {
  return toMutationResult(service.remove(userDataPath, {
    resourceId: input?.tableId,
    mediaId: input?.mediaId
  }));
}

export function listTableMedia(userDataPath: string, tableId: string): TableMediaAsset[] {
  return service.list(userDataPath, tableId).map(toTableAsset);
}

export function getTableMediaDraftState(userDataPath: string): TableMediaDraftState {
  return service.getDraftState(userDataPath);
}

export function commitTableMediaDraft(userDataPath: string): TableMediaDraftResult {
  return service.commitDraft(userDataPath);
}

export function discardTableMediaDraft(userDataPath: string): TableMediaDraftResult {
  return service.discardDraft(userDataPath);
}

export function listPendingTableMedia(userDataPath: string): StoredTableMediaAsset[] {
  return service.listPending(userDataPath).map(toStoredTableAsset);
}

export function getTablePublishedMedia(userDataPath: string, tableId: string): TablePublicMedia[] {
  return service.getPublished(userDataPath, tableId);
}

export function getTableMediaUploadSource(userDataPath: string, mediaId: string): {
  asset: StoredTableMediaAsset;
  absolutePath: string;
} | null {
  const source = service.getUploadSource(userDataPath, mediaId);
  return source ? { asset: toStoredTableAsset(source.asset), absolutePath: source.absolutePath } : null;
}

export function markTableMediaPublished(userDataPath: string, mediaId: string, remoteUrl: string): void {
  service.markPublished(userDataPath, mediaId, remoteUrl);
}

function toTableAsset(asset: ResourceMediaAsset): TableMediaAsset {
  const { resourceId, ...rest } = asset;
  return { ...rest, tableId: resourceId };
}

function toStoredTableAsset(asset: StoredResourceMediaAsset): StoredTableMediaAsset {
  const { resourceId, ...rest } = asset;
  return { ...rest, tableId: resourceId };
}

function toMutationResult(result: ReturnType<typeof service.update>): TableMediaMutationResult {
  return {
    ...result,
    media: result.media.map(toTableAsset)
  } as TableMediaMutationResult;
}
