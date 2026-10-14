import { nativeImage } from "electron";
import { CloudflareAiError } from "@yardimci-asistan/ai-core";

/** Keep the existing GeneratedImage PNG contract, including the requested marketing aspect. */
export function normalizeGeneratedImagePng(bytes: Uint8Array, aspect: "square" | "landscape" | "portrait"): Uint8Array {
  try {
    let image = nativeImage.createFromBuffer(Buffer.from(bytes));
    const { width, height } = image.getSize();
    if (image.isEmpty() || width <= 0 || height <= 0 || width * height > 40_000_000) throw new CloudflareAiError("invalid_response");
    const ratio = aspect === "landscape" ? 1.5 : aspect === "portrait" ? 2 / 3 : 1;
    const cropWidth = Math.min(width, Math.floor(height * ratio));
    const cropHeight = Math.min(height, Math.floor(width / ratio));
    image = image.crop({ x: Math.floor((width - cropWidth) / 2), y: Math.floor((height - cropHeight) / 2), width: cropWidth, height: cropHeight });
    const png = image.toPNG();
    if (!png.length || png.length > 30 * 1024 * 1024) throw new CloudflareAiError("invalid_response");
    return png;
  } catch { throw new CloudflareAiError("invalid_response"); }
}
