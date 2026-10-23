import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { setImmediate as yieldImmediate } from "node:timers/promises";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store";
import { normalizeProductImageBytes, prepareOriginalProductImageAssets, productImageBytesFromDataUrl, writeProductImageAsset } from "./product-data-service";
import { productImageFormat } from "./product-image-codec";
import { readProductImageBytes, readProductOriginalAssets, type ProductOriginalAsset } from "./product-image-reader";
import { publicImageUrl } from "./commerce-online-catalog-publication";
import { MAX_PRODUCT_PHOTOS, type ProductPhotoCollection, type ProductPhotoMutation } from "@yardimci-asistan/shared";

function open(databasePath: string) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  return db;
}

function productRow(db: DatabaseSync, productId: string) {
  if (typeof productId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(productId)) throw new Error("Geçersiz ürün kimliği.");
  const row = db.prepare(`SELECT p.* FROM catalog_products p JOIN business b ON b.id=p.business_id
    WHERE p.id=? AND p.deleted_at='' AND b.deleted_at=''
      AND b.id=(SELECT id FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1)`).get(productId);
  if (!row) throw new Error("Fotoğrafları düzenlenecek ürün bulunamadı.");
  return row;
}

function revision(row: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify([row.image_original_assets_json, row.image_asset_path, row.image_source_url])).digest("hex");
}

function collection(databasePath: string, row: Record<string, unknown>): ProductPhotoCollection {
  const productId = String(row.id);
  return { productId, revision: revision(row), photos: readProductOriginalAssets(databasePath, productId, row).map(asset => ({ id: asset.hash, format: asset.format })), sourceUrl: publicImageUrl(row.image_source_url), sourceLicense: String(row.image_license ?? "") };
}

export function listProductPhotos(databasePath: string, productId: string): ProductPhotoCollection {
  const db = open(databasePath);
  try { return collection(databasePath, productRow(db, productId)); }
  finally { db.close(); }
}

function verifiedBytes(databasePath: string, asset: ProductOriginalAsset) {
  const bytes = readProductImageBytes(databasePath, asset.assetPath);
  if (createHash("sha256").update(bytes).digest("hex") !== asset.hash || productImageFormat(bytes) !== asset.format) throw new Error("Ürün fotoğrafının hash/biçim doğrulaması başarısız.");
  return bytes;
}

export function previewProductPhoto(databasePath: string, productId: string, photoId: string): string {
  const db = open(databasePath);
  try {
    const row = productRow(db, productId);
    const asset = readProductOriginalAssets(databasePath, productId, row).find(item => item.hash === photoId);
    if (!asset) throw new Error("Ürün fotoğrafı bulunamadı; galeriyi yenileyin.");
    return `data:image/jpeg;base64,${normalizeProductImageBytes(verifiedBytes(databasePath, asset)).toString("base64")}`;
  } finally { db.close(); }
}

/** No renderer file paths. Decode all selected files before starting an atomic append. */
export async function prepareProductPhotoAddition(dataUrls: unknown): Promise<Buffer[]> {
  if (!Array.isArray(dataUrls) || !dataUrls.length || dataUrls.length > MAX_PRODUCT_PHOTOS) throw new Error("Bir seferde 1–12 ürün fotoğrafı seçin.");
  const bytes: Buffer[] = [];
  for (const dataUrl of dataUrls) {
    if (typeof dataUrl !== "string") throw new Error("Ürün fotoğraf verisi geçersiz.");
    bytes.push(productImageBytesFromDataUrl(dataUrl));
    await yieldImmediate();
  }
  return bytes;
}

type PhotoOperation = { kind: "add"; bytes: Buffer[] } | { kind: "remove" | "cover"; photoId: string } | { kind: "reorder"; photoIds: string[] };

/** Sole multi-photo writer: the existing archive and product row remain authoritative.
 * Existing schema triggers invalidate retail/dealer/menu publications in this transaction.
 * Physical files remain immutable until the existing startup garbage collector is safe. */
export function mutateProductPhotos(databasePath: string, input: ProductPhotoMutation, operation: PhotoOperation): ProductPhotoCollection {
  const db = open(databasePath);
  try {
    db.exec("BEGIN IMMEDIATE");
    const capabilities = readEnabledBusinessCapabilities(db);
    if (!capabilities.includes(BUSINESS_CAPABILITIES.CATALOG) || !capabilities.includes(BUSINESS_CAPABILITIES.ONLINE_SALES)) throw new Error("Ürün fotoğraf yönetimi için Online Satış etkin olmalı.");
    const row = productRow(db, input?.productId);
    if (typeof input.expectedRevision !== "string" || input.expectedRevision !== revision(row)) throw new Error("Ürün fotoğrafları değişti; galeriyi yenileyip tekrar deneyin.");
    const previous = readProductOriginalAssets(databasePath, input.productId, row);
    let next = [...previous];
    if (operation.kind === "add") {
      if (!operation.bytes.length || operation.bytes.length > MAX_PRODUCT_PHOTOS) throw new Error("Bir seferde 1–12 ürün fotoğrafı seçin.");
      const seen = new Set(previous.map(asset => asset.hash));
      const additions = operation.bytes.filter(bytes => {
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (seen.has(hash)) return false;
        seen.add(hash); return true;
      });
      if (next.length + additions.length > MAX_PRODUCT_PHOTOS) throw new Error("Ürün başına en fazla 12 fotoğraf eklenebilir.");
      next.push(...prepareOriginalProductImageAssets(databasePath, input.productId, additions.map(bytes => ({ bytes, format: productImageFormat(bytes) }))));
    } else if (operation.kind === "reorder") {
      if (!Array.isArray(operation.photoIds) || operation.photoIds.length !== previous.length || new Set(operation.photoIds).size !== previous.length) throw new Error("Fotoğraf sırası mevcut fotoğrafların tamamını birer kez içermeli.");
      next = operation.photoIds.map(id => {
        const asset = previous.find(item => item.hash === id);
        if (!asset) throw new Error("Fotoğraf sırası bilinmeyen fotoğraf içeriyor.");
        return asset;
      });
    } else {
      const selected = previous.find(asset => asset.hash === operation.photoId);
      if (!selected) throw new Error("Ürün fotoğrafı bulunamadı; galeriyi yenileyin.");
      const remaining = previous.filter(asset => asset.hash !== selected.hash);
      next = operation.kind === "cover" ? [selected, ...remaining] : remaining;
    }
    const coverChanged = next[0]?.hash !== previous[0]?.hash;
    let coverUsable = false;
    try {
      const path = String(row.image_asset_path ?? "");
      if (path.startsWith(`assets/products/${input.productId}/`)) { readProductImageBytes(databasePath, path); coverUsable = true; }
    } catch { /* Repair a missing normalized cover from its verified first original. */ }
    const coverPath = coverChanged || !coverUsable
      ? next[0] ? writeProductImageAsset(databasePath, input.productId, normalizeProductImageBytes(verifiedBytes(databasePath, next[0]))) : ""
      : String(row.image_asset_path ?? "");
    db.prepare(`UPDATE catalog_products SET image_original_assets_json=?, image_asset_path=?,
      image_source_url=?, image_license=?, updated_at=? WHERE id=? AND business_id=?`).run(
      JSON.stringify(next), coverPath, coverChanged ? "" : String(row.image_source_url ?? ""), coverChanged ? "" : String(row.image_license ?? ""),
      new Date().toISOString(), input.productId, String(row.business_id));
    const result = collection(databasePath, productRow(db, input.productId));
    db.exec("COMMIT");
    return result;
  } finally {
    if (db.isTransaction) db.exec("ROLLBACK");
    db.close();
  }
}
