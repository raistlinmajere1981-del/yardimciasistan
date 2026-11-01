import type { DocumentRenderSnapshot } from "./document-output-render-snapshot";
import type { DocumentSnapshotImage } from "./document-output-snapshot-store";

const escapeText = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] as string);
const mm = (value: number) => `${value / 10}mm`;

/** Pure composition: inputs must come from the validated snapshot owners. */
export function composeDocumentHtml(snapshot: DocumentRenderSnapshot, images: DocumentSnapshotImage[]): string {
  const scan = snapshot.scan;
  const image = scan ? images.find(item => item.role === (scan.processedImageRef ? "processed" : "original")) : undefined;
  if ((scan && (!image || image.imageRef !== (scan.processedImageRef ?? scan.originalImageRef))) || (!scan && images.length)) throw new Error("DOCUMENT_SNAPSHOT_IMAGES_INVALID");
  const imageTag = image ? `<img class="scan ${scan?.foreground ? "foreground" : "background"}" src="data:image/png;base64,${image.bytes.toString("base64")}" alt="">` : "";
  const fields = [...snapshot.fields, ...snapshot.rows.flat()].map(field =>
    `<div class="field" style="left:${mm(field.x)};top:${mm(field.y)};width:${mm(field.width)};height:${mm(field.height)}">${escapeText(field.text)}</div>`
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Belge</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>
@page{size:${mm(snapshot.pageWidth)} ${mm(snapshot.pageHeight)};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{position:relative;width:${mm(snapshot.pageWidth)};height:${mm(snapshot.pageHeight)};overflow:hidden;font-family:Arial,sans-serif}.scan{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:fill}.background{z-index:0}.foreground{z-index:2}.field{position:absolute;z-index:1;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;font-size:10pt;line-height:1.15}.notice{position:absolute;z-index:3;right:0;bottom:0;background:white;color:black;font-size:min(8pt,${snapshot.pageWidth / 200}mm);line-height:1.2;font-weight:bold;padding:0.5mm;white-space:nowrap}
</style></head><body>${imageTag}${fields}<div class="notice">MALİ BELGE DEĞİLDİR</div></body></html>`;
}
