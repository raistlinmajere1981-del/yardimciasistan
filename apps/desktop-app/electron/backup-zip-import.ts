import fs from "node:fs";
import path from "node:path";
import { Unzip, UnzipInflate } from "fflate";

// ZIPs are untrusted, even when downloaded from the demo site.
// Bound both the compressed input and the *actual* decoded data on disk.
const MAX_ZIP_BYTES = 256 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 20000;
const BAD_SEGMENT = /[\\:\u0000-\u001f]/;
const RESERVED_WINDOWS_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function validateEntryName(value: string): { parts: string[]; isDirectory: boolean } {
  const isDirectory = value.endsWith("/");
  const normalized = isDirectory ? value.slice(0, -1) : value;
  if (!normalized || normalized.length > 512 || normalized.startsWith("/") || normalized.includes("//")) {
    throw new Error("ZIP güvenli olmayan bir yol içeriyor.");
  }
  const parts = normalized.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || part.length > 180
    || BAD_SEGMENT.test(part) || RESERVED_WINDOWS_NAME.test(part) || /[. ]$/.test(part))) {
    throw new Error("ZIP güvenli olmayan bir dosya yolu içeriyor.");
  }
  // A backup ZIP contains one backup folder with only the v2 backup payload.
  if (parts.length > 1 && !["backup.json", "yardimci-asistan.sqlite", "assets", "qr-menu-images"].includes(parts[1]!)) {
    throw new Error("ZIP beklenmeyen bir yedek dosyası içeriyor.");
  }
  if (parts.length > 2 && !["assets", "qr-menu-images"].includes(parts[1]!)) {
    throw new Error("ZIP yedek klasörü dışında dosya içeriyor.");
  }
  if (parts.length === 2 && isDirectory && !["assets", "qr-menu-images"].includes(parts[1]!)) {
    throw new Error("ZIP beklenmeyen bir klasör içeriyor.");
  }
  if (parts.length === 2 && !isDirectory && ["assets", "qr-menu-images"].includes(parts[1]!)) {
    throw new Error("ZIP klasör yerine geçersiz dosya içeriyor.");
  }
  return { parts, isDirectory };
}

/** Extract into a NEW, empty staging directory. No existing user file is replaced. */
export async function extractBackupZipToStage(archivePath: string, stagingPath: string): Promise<string> {
  const archive = fs.statSync(archivePath);
  if (!archive.isFile() || archive.size < 22 || archive.size > MAX_ZIP_BYTES) {
    throw new Error("ZIP dosyası boş, geçersiz veya 256 MB sınırını aşıyor.");
  }
  if (!/\.zip$/i.test(archivePath)) throw new Error("Lütfen ZIP dosyası seçin.");
  fs.mkdirSync(stagingPath, { recursive: false });
  const seen = new Set<string>();
  const handles = new Set<number>();
  let rootName = "";
  let totalBytes = 0;
  let entries = 0;
  const unzipper = new Unzip(file => {
    if (++entries > MAX_ENTRIES) throw new Error("ZIP çok fazla dosya içeriyor.");
    const { parts, isDirectory } = validateEntryName(file.name);
    const root = parts[0]!;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(root) || root.startsWith(".tmp-")) {
      throw new Error("ZIP içindeki yedek klasörünün adı geçersiz.");
    }
    if (rootName && rootName !== root) throw new Error("ZIP tam olarak bir yedek klasörü içermeli.");
    rootName = root;
    const canonical = parts.join("/").toLowerCase();
    if (seen.has(canonical)) throw new Error("ZIP yinelenen dosya yolları içeriyor.");
    seen.add(canonical);
    if (file.compression !== 0 && file.compression !== 8) throw new Error("ZIP desteklenmeyen sıkıştırma kullanıyor.");
    if ((file.originalSize ?? 0) > MAX_FILE_BYTES) throw new Error("ZIP tek dosya boyutu sınırını aşıyor.");
    const destination = path.join(stagingPath, ...parts);
    if (isDirectory) {
      fs.mkdirSync(destination, { recursive: true });
      file.ondata = (error, data) => {
        if (error || data.length) throw new Error("ZIP klasör kaydı bozuk.");
      };
    } else {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const handle = fs.openSync(destination, "wx", 0o600);
      handles.add(handle);
      let fileBytes = 0;
      file.ondata = (error, data, final) => {
        if (error) throw new Error("ZIP dosyası çözümlenemedi.");
        totalBytes += data.length;
        fileBytes += data.length;
        if (totalBytes > MAX_UNPACKED_BYTES || fileBytes > MAX_FILE_BYTES) {
          throw new Error("ZIP açılmış boyut sınırını aşıyor.");
        }
        if (data.length) fs.writeSync(handle, data);
        if (final) {
          fs.closeSync(handle);
          handles.delete(handle);
        }
      };
    }
    file.start();
  });
  unzipper.register(UnzipInflate);
  try {
    // Feed small chunks to avoid holding the whole archive or its expansion in memory.
    for await (const bytes of fs.createReadStream(archivePath, { highWaterMark: 64 * 1024 })) {
      if (!(bytes instanceof Uint8Array)) throw new Error("ZIP verisi okunamadı.");
      unzipper.push(bytes, false);
    }
    unzipper.push(new Uint8Array(), true);
    if (!rootName || !seen.has(`${rootName.toLowerCase()}/backup.json`)
      || !seen.has(`${rootName.toLowerCase()}/yardimci-asistan.sqlite`) || handles.size) {
      throw new Error("ZIP içinde eksiksiz bir Yardımcı Asistan yedeği bulunamadı.");
    }
    return rootName;
  } finally {
    for (const handle of handles) {
      try { fs.closeSync(handle); } catch { /* closed by stream */ }
    }
  }
}
