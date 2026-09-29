import {
  getRoomMediaUploadSource,
  listPendingRoomMedia,
  markRoomMediaPublished
} from "./room-media-service";
import {
  uploadPublicResourceMediaFile,
  type PublicResourceMediaPublicationResult,
  type PublicResourceMediaSyncConfig
} from "./public-resource-media-publication";

export type RoomMediaPublicationResult = PublicResourceMediaPublicationResult;

export async function publishPendingRoomMedia(
  userDataPath: string,
  config: PublicResourceMediaSyncConfig,
  clientId: string
): Promise<RoomMediaPublicationResult> {
  const pending = listPendingRoomMedia(userDataPath);
  let uploaded = 0;

  for (const item of pending) {
    const source = getRoomMediaUploadSource(userDataPath, item.id);
    if (!source) {
      return {
        ok: false,
        message: `${item.originalName || "Oda medyası"} yerel depoda bulunamadı.`,
        uploaded
      };
    }

    const result = await uploadPublicResourceMediaFile(
      config,
      clientId,
      "/api/room-media.php",
      "room_id",
      source.absolutePath,
      {
        id: source.asset.id,
        resourceId: source.asset.roomId,
        kind: source.asset.kind,
        mimeType: source.asset.mimeType,
        originalName: source.asset.originalName,
        contentHash: source.asset.contentHash
      },
      {
        success: "Oda medyası yüklendi.",
        httpFailure: (status) => `Oda medyası yüklenemedi (HTTP ${status}).`,
        connectionFailure: "Oda medyası yüklenirken web modülüne ulaşılamadı.",
        readFailure: "Oda medya dosyası okunamadı.",
        fallbackFileName: "room-media"
      }
    );
    if (!result.ok) {
      return { ...result, uploaded };
    }

    markRoomMediaPublished(userDataPath, item.id, result.url);
    uploaded += 1;
  }

  return {
    ok: true,
    message: uploaded > 0 ? `${uploaded} oda medyası web'e yüklendi.` : "Oda medyaları güncel.",
    uploaded
  };
}
