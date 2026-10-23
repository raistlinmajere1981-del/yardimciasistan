import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { Unzip, UnzipInflate, zipSync, strToU8 } from "fflate";
import { readSheet } from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import { PRODUCT_TRANSFER_FIELDS, CUSTOMER_TRANSFER_FIELDS, type TransferEntity, type TransferFormat } from "./data-transfer-contract";
export const MAX_TRANSFER_BYTES = 32 * 1024 * 1024;
const MAX_EXPANDED = 128 * 1024 * 1024;
export const MAX_TRANSFER_ROWS = 10000;
export type TransferRecord = Record<string, string>;
export interface TransferAsset { path: string; hash: string; format: string; productId: string; sku: string }
export interface TransferDocument { assetManifest?: TransferAsset[]; headers: string[]; records: TransferRecord[]; assets: Record<string, Uint8Array>; warnings: string[]; format: string }
export const transferHash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export function safeArchivePath(name: string) {
  if (!name || name.length > 240 || name.includes("\\") || name.startsWith("/") || name.includes(":") || name.split("/").some(p => p === ".." || p === "." || !p) || /[\x00-\x1f]/.test(name)) throw new Error("Arşivde güvenli olmayan dosya yolu var.");
}
/** Stream and count actual inflated bytes, including archives with forged size headers. Never extract to disk. */
export function readTransferArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  let total = 0, count = 0;
  const seen = new Set<string>();
  const unzipper = new Unzip(file => {
    const directory = file.name.endsWith("/");
    safeArchivePath(directory ? file.name.slice(0, -1) : file.name);
    if (seen.has(file.name) || ++count > 20000) throw new Error("Arşiv dosya sayısı veya yinelenen yol sınırı aşıldı.");
    seen.add(file.name);
    if ((file.originalSize ?? 0) > MAX_EXPANDED) throw new Error("Arşiv açılmış boyut sınırını aşıyor.");
    let length = 0;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, data, final) => {
      if (error) throw new Error("Arşiv bozuk.");
      total += data.length; length += data.length;
      if (total > MAX_EXPANDED || length > MAX_EXPANDED) throw new Error("Arşiv açılmış boyut sınırını aşıyor.");
      chunks.push(data);
      if (final && !directory) {
        const result = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
        files[file.name] = result;
      }
    };
    file.start();
  });
  unzipper.register(UnzipInflate);
  for (let start = 0; start < bytes.length; start += 16384) unzipper.push(bytes.subarray(start, start + 16384), start + 16384 >= bytes.length);
  return files;
}
const heading = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLowerCase().replace(/[^a-z0-9]/g, "");
export function suggestTransferMapping(headers: string[], entity: TransferEntity) {
  const fields = entity === "customers" ? CUSTOMER_TRANSFER_FIELDS : PRODUCT_TRANSFER_FIELDS;
  const aliases: Record<string, string[]> = {
    name: ["urunadi", "productname", "title"], sku: ["stockcode", "stokkodu", "stok kodu", "productcode"], category: ["categoryname", "kategoriadi", "category_name"],
    salePrice: ["sale_price_gross_try", "satis fiyati", "fiyat", "price", "sale_price"], taxRate: ["kdv", "tax_rate", "kdv orani"],
    sourceProductUrl: ["source_url", "url", "producturl"], sourceId: ["source_product_id", "idempotent_external_key"], stockQuantity: ["stock_quantity", "stok", "stockamount"],
    fullName: ["ad soyad", "ad", "fullname", "customername"], phone: ["gsm", "telefonnumarasi"], image: ["image1", "resim1", "resim", "picture1"]
  };
  const mapping: Record<string, string> = {};
  for (const [field, label] of Object.entries(fields)) {
    const accepted = [field, label, ...(aliases[field] ?? [])].map(heading);
    const candidates = headers.filter(h => accepted.includes(heading(h)));
    if (candidates.length === 1) mapping[field] = candidates[0]!;
  }
  return mapping;
}
export function transferNumber(value: string): number | undefined {
  let s = String(value ?? "").trim().replace(/\s/g, "");
  if (!s) return undefined;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(s)) throw new Error("Sayısal alan geçersiz: ondalık ve binlik ayraçlarını kontrol edin.");
  const n = Number(s); if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new Error("Sayısal alan sınır dışında.");
  return n;
}
export function transferBoolean(value: string): boolean | undefined {
  if (!String(value ?? "").trim()) return undefined;
  const s = heading(String(value));
  if (["true", "1", "evet", "yes", "aktif"].includes(s)) return true;
  if (["false", "0", "hayir", "no", "pasif"].includes(s)) return false;
  throw new Error("Evet/hayır alanı geçersiz.");
}
export function imageMime(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("Görsel boyutu geçersiz.");
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP") return "image/webp";
  throw new Error("Görsel JPEG, PNG veya WEBP içeriği taşımıyor.");
}
export async function parseTransferFile(name: string, bytes: Uint8Array, entity: TransferEntity): Promise<TransferDocument> {
  if (!bytes.length || bytes.length > MAX_TRANSFER_BYTES) throw new Error("Dosya boş veya 32 MB sınırını aşıyor.");
  const warnings: string[] = [];
  let table: unknown[][], format = "csv";
  let assets: Record<string, Uint8Array> = {};
  let assetManifest: TransferAsset[] = [];
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (zipped) {
    const files = readTransferArchive(bytes);
    if (files["manifest.json"]) {
      format = "zip";
      const manifest = JSON.parse(Buffer.from(files["manifest.json"]).toString("utf8")) as {format?:string;entity?:string;assets?:TransferAsset[]};
      const sameRecordType = manifest.entity === entity || (entity !== "customers" && ["products", "menu"].includes(manifest.entity ?? ""));
      if (manifest.format !== "yardimci-asistan-transfer-v1" || !sameRecordType || !Array.isArray(manifest.assets)) throw new Error("Aktarım manifesti veya kayıt türü geçersiz.");
      if (!files["records.csv"]) throw new Error("Arşivde records.csv eksik.");
      assets = {};
      assetManifest = manifest.assets;
      for (const item of manifest.assets) {
        safeArchivePath(item.path);
        if (!item.path.startsWith("assets/") || !files[item.path] || transferHash(files[item.path]!) !== item.hash || imageMime(files[item.path]!) !== item.format) throw new Error("Arşiv görseli eksik, bozuk veya hash/biçim eşleşmiyor.");
        assets[item.path] = files[item.path]!;
      }
      table = parse(Buffer.from(files["records.csv"]), { bom: true, delimiter: ";", skip_empty_lines: true, max_record_size: 100000 });
    } else if (files["[Content_Types].xml"] && files["xl/workbook.xml"]) {
      format = "xlsx";
      table = await readSheet(Buffer.from(bytes));
    } else throw new Error("Desteklenen manifestli ZIP veya XLSX dosyası değil.");
  } else {
    if (!/\.csv$/i.test(name)) throw new Error("CSV, XLSX veya manifestli ZIP seçin.");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const first = content.split(/\r?\n/)[0] ?? "";
    // Only delimiters outside quoted headers participate in detection.
    const unquoted = first.replace(/"(?:[^"]|"")*"/g, "");
    const delimiter = (unquoted.match(/;/g)?.length ?? 0) >= (unquoted.match(/,/g)?.length ?? 0) ? ";" : ",";
    table = parse(content, { bom: true, delimiter, skip_empty_lines: true, max_record_size: 100000 });
  }
  if (!table.length || table.length > MAX_TRANSFER_ROWS + 1 || (table[0]?.length ?? 0) > 128) throw new Error("Dosya en fazla 10.000 kayıt ve 128 kolon içerebilir.");
  const cell = (v: unknown): string => v instanceof Date ? v.toISOString().slice(0,10) : v == null ? "" : String(v);
  const headers = table[0]!.map(v => cell(v).trim());
  if (headers.some(h => !h || h.length > 160) || new Set(headers).size !== headers.length) throw new Error("Kolon başlıkları dolu ve benzersiz olmalı.");
  const records = table.slice(1).filter(row => row.some(v => cell(v).trim())).map(row => {
    if (row.length > headers.length) throw new Error("Satırda başlıktan fazla kolon var.");
    return Object.fromEntries(headers.map((header, i) => [header, cell(row[i]).replace(/^'(?=[\s\u0000-\u001f]*[=+\-@])/, "")]));
  });
  if (!records.length) warnings.push("Dosyada aktarılacak kayıt yok; şablona veri ekleyin.");
  if (format === "zip") for (const record of records) {
    if (record.image && assets[record.image] && !assetManifest.some(a=>a.path===record.image && (a.productId === record.id || a.sku && a.sku === record.sku))) throw new Error("Manifest görseli ürün kimliği/stok koduyla eşleşmiyor.");
  }
  return { headers, records, assets, assetManifest, warnings, format };
}
export const safeSpreadsheetCell = (s: string) => /^[\s\u0000-\u001f]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s) ? "'" + s : s;
export async function encodeTransferFile(format: TransferFormat, entity: TransferEntity, headers: string[], records: TransferRecord[], assets: Record<string, Uint8Array> = {}, assetManifest: TransferAsset[] = []): Promise<Buffer> {
  const csv = () => Buffer.from(stringify(records.map(r => headers.map(h => safeSpreadsheetCell(r[h] ?? ""))), { header: true, columns: headers, delimiter: ";", bom: true, record_delimiter: "\r\n" }));
  if (format === "csv") return csv();
  if (format === "xlsx") {
    const rows = [headers, ...records.map(r => headers.map(h => r[h] ?? ""))];
    return await writeXlsxFile(rows.map(row => row.map(value => ({ type: String, value: safeSpreadsheetCell(value) })))).toBuffer();
  }
  const manifest = { format: "yardimci-asistan-transfer-v1", entity, records: records.length, assets: assetManifest };
  const zipped = zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), "records.csv": csv(), ...assets }, { level: 1 });
  if (zipped.length > MAX_TRANSFER_BYTES) throw new Error("Çıktı 32 MB sınırını aşıyor; filtreleyerek parçalara ayırın.");
  return Buffer.from(zipped);
}
