import {
  getTableMediaUploadSource,
  listPendingTableMedia,
  markTableMediaPublished
} from "./table-media-service";
import {
  uploadPublicResourceMediaFile,
  type PublicResourceMediaPublicationResult,
  type PublicResourceMediaSyncConfig
} from "./public-resource-media-publication";

export type TableMediaPublicationResult = PublicResourceMediaPublicationResult;

export async function publishPendingTableMedia(
  userDataPath: string,
  config: PublicResourceMediaSyncConfig,
  clientId: string
): Promise<TableMediaPublicationResult> {
  const pending = listPendingTableMedia(userDataPath);
  let uploaded = 0;

  for (const item of pending) {
    const source = getTableMediaUploadSource(userDataPath, item.id);
    if (!source) {
      return {
        ok: false,
        message: `${item.originalName || "Masa medyası"} yerel depoda bulunamadı.`,
        uploaded
      };
    }

    const result = await uploadPublicResourceMediaFile(
      config,
      clientId,
      "/api/table-media.php",
      "table_id",
      source.absolutePath,
      {
        id: source.asset.id,
        resourceId: source.asset.tableId,
        kind: source.asset.kind,
        mimeType: source.asset.mimeType,
        originalName: source.asset.originalName,
        contentHash: source.asset.contentHash
      },
      {
        success: "Masa medyası yüklendi.",
        httpFailure: (status) => `Masa medyası yüklenemedi (HTTP ${status}).`,
        connectionFailure: "Masa medyası yüklenirken web modülüne ulaşılamadı.",
        readFailure: "Masa medya dosyası okunamadı.",
        fallbackFileName: "table-media"
      }
    );
    if (!result.ok) {
      return { ...result, uploaded };
    }

    markTableMediaPublished(userDataPath, item.id, result.url);
    uploaded += 1;
  }

  return {
    ok: true,
    message: uploaded > 0 ? `${uploaded} masa medyası web'e yüklendi.` : "Masa medyaları güncel.",
    uploaded
  };
}
