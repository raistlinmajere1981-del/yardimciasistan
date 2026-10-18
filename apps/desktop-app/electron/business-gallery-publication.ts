import { galleryUploadSource, pendingGallery, markGalleryUploaded } from "./business-gallery-service";
import { uploadPublicResourceMediaFile, type PublicResourceMediaSyncConfig, type PublicResourceMediaPublicationResult } from "./public-resource-media-publication";

export async function publishPendingBusinessGallery(userDataPath: string, config: PublicResourceMediaSyncConfig, clientId: string): Promise<PublicResourceMediaPublicationResult> {
  let uploaded = 0;
  for (const item of pendingGallery(userDataPath)) {
    const source = galleryUploadSource(userDataPath, item.id);
    if (!source) return { ok: false, message: "Galeri fotoğrafı yerel depoda bulunamadı.", uploaded };
    const result = await uploadPublicResourceMediaFile(
      config, clientId, "/api/business-gallery-media.php", "gallery_id", source.absolutePath,
      { id: item.id, resourceId: "gallery", kind: item.kind, mimeType: item.mimeType,
        originalName: item.originalName, contentHash: item.contentHash },
      { success: "Galeri fotoğrafı yüklendi.", httpFailure: code => "Galeri fotoğrafı yüklenemedi (HTTP " + code + ").",
        connectionFailure: "Galeri aktarımında web modülüne ulaşılamadı.", readFailure: "Galeri fotoğrafı okunamadı.",
        fallbackFileName: "gallery-photo" }
    );
    if (!result.ok) return { ...result, uploaded };
    markGalleryUploaded(userDataPath, item.id, result.url);
    uploaded++;
  }
  return {ok:true,message: uploaded ? uploaded + " galeri fotoğrafı yüklendi." : "Galeri güncel.",uploaded};
}
