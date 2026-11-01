import { createHash, randomUUID } from "node:crypto";
import { constants, closeSync, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DocumentKind, DocumentFormImage } from "@yardimci-asistan/shared";
import { DocumentOutputManagementError } from "./document-output-management";

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
export interface FormImageDecoder { (bytes: Buffer): { width: number; height: number; png: Buffer } }
const invalid = (): never => { throw new DocumentOutputManagementError("DOCUMENT_IMAGE_INVALID"); };
function pixels(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) invalid();
}
/** Check encoded dimensions before allocating a native decoded bitmap. */
function dimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(PNG) && bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return invalid();
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) return invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218 || marker === undefined) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) return invalid();
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length) return invalid();
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
      if (size < 8) return invalid();
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += size;
  }
  return invalid();
}
function readBounded(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_BYTES) return invalid();
    const bytes = Buffer.alloc(stat.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const n = readSync(fd, bytes, count, bytes.length - count, null);
      if (!n) break;
      count += n;
    }
    if (count !== stat.size) return invalid();
    return bytes.subarray(0, count);
  } finally { closeSync(fd); }
}
/** Local immutable assets. Neither source paths nor business identity cross the bridge. */
export class DocumentFormImages {
  constructor(private readonly userData: string, private readonly decode: FormImageDecoder) {}
  private folder(businessId: string, kind: DocumentKind) {
    return join(this.userData, "doc-form-images", createHash("sha256").update(businessId).digest("hex"), kind);
  }
  importOriginal(sourcePath: string, businessId: string, kind: DocumentKind): DocumentFormImage {
    const bytes = readBounded(sourcePath);
    return this.persist(bytes, businessId, kind);
  }
  saveProcessed(originalImageRef: unknown, pngBase64: unknown, businessId: string, kind: DocumentKind): DocumentFormImage {
    // Scope/access is checked before accepting a derivative; original bytes remain untouched.
    this.read(originalImageRef, businessId, kind);
    if (typeof pngBase64 !== "string" || pngBase64.length < 4 || pngBase64.length > 4 * Math.ceil(MAX_BYTES / 3) || pngBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(pngBase64)) return invalid();
    const bytes = Buffer.from(pngBase64, "base64");
    if (bytes.length > MAX_BYTES || bytes.toString("base64") !== pngBase64 || !bytes.subarray(0, 8).equals(PNG)) return invalid();
    return this.persist(bytes, businessId, kind);
  }
  private persist(bytes: Buffer, businessId: string, kind: DocumentKind): DocumentFormImage {
    const encoded = dimensions(bytes); pixels(encoded.width, encoded.height);
    const decoded = this.decode(bytes); pixels(decoded.width, decoded.height);
    if (decoded.png.length > MAX_BYTES || !decoded.png.subarray(0, 8).equals(PNG)) return invalid();
    const output = dimensions(decoded.png);
    if (output.width !== decoded.width || output.height !== decoded.height) return invalid();
    const imageRef = randomUUID();
    const folder = this.folder(businessId, kind);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    writeFileSync(join(folder, `${imageRef}.png`), decoded.png, { flag: "wx", mode: 0o600 });
    return { imageRef, dataUrl: `data:image/png;base64,${decoded.png.toString("base64")}` };
  }
  read(imageRef: unknown, businessId: string, kind: DocumentKind): DocumentFormImage {
    const bytes = this.readBytes(imageRef, businessId, kind);
    return { imageRef: imageRef as string, dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
  }
  /** Trusted local owner only: opaque reference, never a caller-supplied path. */
  readBytes(imageRef: unknown, businessId: string, kind: DocumentKind): Buffer {
    if (typeof imageRef !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(imageRef)) return invalid();
    const bytes = readBounded(join(this.folder(businessId, kind), `${imageRef}.png`));
    if (!bytes.subarray(0, 8).equals(PNG)) return invalid();
    const size = dimensions(bytes); pixels(size.width, size.height);
    return bytes;
  }
}
