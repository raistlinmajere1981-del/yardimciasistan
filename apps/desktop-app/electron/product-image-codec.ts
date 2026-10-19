import { nativeImage } from "electron";
import { Transformer } from "@napi-rs/image";

/** Decode before accepting an archive asset. Electron's nativeImage does not
 * decode WebP on every platform; a real WebP codec supplies its PNG display copy.
 * Callers keep the original bytes unchanged in the canonical image archive. */
export function decodeProductImageBytes(bytes: Buffer) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("Ürün görseli boş veya izin verilen boyuttan büyük.");
  let displayBytes = bytes;
  if (bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP") {
    try {
      const decoder = new Transformer(bytes);
      const metadata = decoder.metadataSync();
      if (metadata.width <= 0 || metadata.height <= 0 || metadata.width * metadata.height > 25_000_000) throw new Error("Görsel piksel sınırını aşıyor.");
      displayBytes = decoder.pngSync();
    } catch (error) {
      throw new Error("WEBP görseli çözümlenemedi veya piksel sınırını aşıyor.", {cause:error});
    }
  }
  const decoded = nativeImage.createFromBuffer(displayBytes);
  if (decoded.isEmpty()) throw new Error("Görsel çözümlenemedi.");
  const size = decoded.getSize();
  if (size.width * size.height > 25_000_000) throw new Error("Görsel piksel sınırını aşıyor.");
  return decoded;
}
