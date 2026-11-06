import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, MAX_PRODUCT_PHOTOS, type CatalogProduct, type CommerceProductPublication, type InventoryBalance, type ProductPhotoCollection, type ProductPhotoDraftPhoto } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store";
import { applyInventoryMovementInTransaction, resolveInventoryLocation, saveCatalogProductInTransaction, setInventoryCountInTransaction,
  type CatalogProductImageMutation, type InventoryCountResult, type SaveCatalogProductInput } from "./commerce-store";
import { getCommerceProductPublication, saveCommerceProductPublication } from "./commerce-product-publication-store";
import { prepareProductImageForSave, productImageBytesFromDataUrl } from "./product-data-service";
import { applyProductPhotosInTransaction, assertProductPhotoRevision, prepareProductPhotoAddition, readProductPhotosInTransaction } from "./product-photo-store";
import { productImageFormat } from "./product-image-codec";
import { readProductImageBytes } from "./product-image-reader";

export interface SaveProductDetailsInput {
  product: SaveCatalogProductInput;
  /** Empty only for creation. Checked even for cover-only/manual image editing. */
  sourcePhotoRevision: string;
  imageMode: "keep" | "manual" | "clear" | "external";
  photos?: ProductPhotoDraftPhoto[];
  isPublished?: boolean;
  stock?: {
    operation: "add" | "remove" | "count";
    quantity: number;
    note: string;
    locationId?: string;
    expectedUpdatedAt: string;
    operationId: string;
  };
}

export interface SaveProductDetailsResult {
  product: CatalogProduct;
  photos: ProductPhotoCollection;
  publication: CommerceProductPublication | null;
  balance: InventoryBalance | null;
  stock: InventoryCountResult | null;
}

function open(databasePath: string) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  return db;
}

/** Read-only preflight, repeated under the write lock after asynchronous acquisition. */
function validate(databasePath: string, db: DatabaseSync, input: SaveProductDetailsInput) {
  if (!input?.product || !["keep", "manual", "clear", "external"].includes(input.imageMode)) throw new Error("Ürün taslağı geçersiz.");
  const capabilities = readEnabledBusinessCapabilities(db);
  if (!capabilities.includes(BUSINESS_CAPABILITIES.CATALOG)) throw new Error("Ürün kataloğu bu işletmede etkin değil.");
  if ((input.product.trackInventory !== false || input.stock) && !capabilities.includes(BUSINESS_CAPABILITIES.INVENTORY)) throw new Error("Stok takibi bu işletmede etkin değil.");
  if ((input.photos !== undefined || input.isPublished !== undefined) && !capabilities.includes(BUSINESS_CAPABILITIES.ONLINE_SALES)) throw new Error("Ürün fotoğraf yönetimi ve web yayını için Online Satış etkin olmalı.");
  if (input.isPublished !== undefined && typeof input.isPublished !== "boolean") throw new Error("Ürün yayın bilgisi geçersiz.");
  const business = db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1").get();
  if (!business) throw new Error("Aktif işletme bulunamadı.");
  const businessId = String(business.id);
  const productId = String(input.product.id ?? "").trim();
  if (productId) assertProductPhotoRevision(db, { productId, expectedRevision: input.sourcePhotoRevision });
  else if (input.sourcePhotoRevision !== "") throw new Error("Yeni ürün fotoğraf revizyonu boş olmalı.");
  const categoryId = String(input.product.categoryId ?? "").trim();
  if (categoryId && !db.prepare("SELECT 1 FROM catalog_categories WHERE id=? AND business_id=? AND deleted_at=''").get(categoryId, businessId)) throw new Error("Seçilen ürün kategorisi bulunamadı.");
  if (!String(input.product.name ?? "").trim()) throw new Error("Ürün adı gerekli.");
  for (const field of ["salePrice", "purchasePrice", "dealerPriceA", "dealerPriceB", "taxRate", "minimumQuantity"] as const) {
    const value = input.product[field];
    if (value != null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) throw new Error("Ürün fiyatı veya stok eşiği geçersiz.");
  }
  if (input.photos !== undefined) {
    if (!Array.isArray(input.photos) || input.photos.length > MAX_PRODUCT_PHOTOS
      || input.photos.some(photo => !photo || !/^[a-f0-9]{64}$/.test(photo.id) || !["image/png", "image/jpeg", "image/webp"].includes(photo.format))
      || new Set(input.photos.map(photo => photo.id)).size !== input.photos.length) throw new Error("Fotoğraf taslağı en fazla 12 farklı fotoğraf içermeli.");
    const source = productId ? readProductPhotosInTransaction(databasePath, db, productId).photos : [];
    if (input.photos.some(photo => photo.dataUrl === undefined && !source.some(existing => existing.id === photo.id && existing.format === photo.format))) throw new Error("Fotoğraf taslağı bilinmeyen fotoğraf içeriyor.");
  }
  const stock = input.stock;
  if (stock) {
    if (input.product.trackInventory === false) throw new Error("Bekleyen stok işlemi için stok takibini açın veya stok taslağını temizleyin.");
    if (!["add", "remove", "count"].includes(stock.operation) || typeof stock.quantity !== "number" || !Number.isFinite(stock.quantity)
      || stock.quantity < 0 || (stock.operation !== "count" && Math.round(stock.quantity * 10000) <= 0)
      || typeof stock.note !== "string" || stock.note.length > 240 || typeof stock.expectedUpdatedAt !== "string"
      || !/^[A-Za-z0-9_-]{1,80}$/.test(stock.operationId)) throw new Error("Stok taslağı geçersiz.");
    // A retry must never append another movement, even if a response was lost.
    if (db.prepare("SELECT 1 FROM inventory_movements WHERE business_id=? AND reference_type='product_workspace_save' AND reference_id=?").get(businessId, stock.operationId)) throw new Error("Bu stok taslağı zaten kaydedildi. Ürün kartını yeniden açın.");
    const location = stock.locationId
      ? db.prepare("SELECT id FROM inventory_locations WHERE id=? AND business_id=? AND is_active=1 AND deleted_at=''").get(stock.locationId, businessId)
      : db.prepare("SELECT id FROM inventory_locations WHERE business_id=? AND is_primary=1 AND is_active=1 AND deleted_at=''").get(businessId);
    if (stock.locationId && !location) throw new Error("Stok konumu bulunamadı.");
    const balance = productId && location ? db.prepare("SELECT quantity,updated_at FROM inventory_balances WHERE product_id=? AND location_id=?").get(productId, String(location.id)) : undefined;
    if (stock.expectedUpdatedAt !== String(balance?.updated_at ?? "")) throw new Error("Stok bu sayımdan sonra değişti. Güncel miktarı alıp yeniden sayın.");
    if (stock.operation === "remove" && stock.quantity > Number(balance?.quantity ?? 0)) throw new Error(`Yetersiz stok. Mevcut: ${Number(balance?.quantity ?? 0)}.`);
  }
  return businessId;
}

export interface PreparedProductDetailsSave {
  input: SaveProductDetailsInput;
  image: CatalogProductImageMutation | undefined;
  additions: Buffer[];
}

/** No DB writes. Manual/gallery content errors reject the whole save; external
 * provider images retain the existing optional-acquisition policy. */
export async function prepareProductDetailsSave(databasePath: string, input: SaveProductDetailsInput): Promise<PreparedProductDetailsSave> {
  const db = open(databasePath);
  try { validate(databasePath, db, input); } finally { db.close(); }
  const additions: Buffer[] = [];
  for (const photo of input.photos ?? []) {
    if (photo.dataUrl === undefined) continue;
    const [bytes] = await prepareProductPhotoAddition([photo.dataUrl]);
    if (createHash("sha256").update(bytes!).digest("hex") !== photo.id || productImageFormat(bytes!) !== photo.format) throw new Error("Ürün fotoğrafının hash/biçim doğrulaması başarısız.");
    additions.push(bytes!);
  }
  let image: CatalogProductImageMutation | undefined;
  if (input.imageMode !== "keep") {
    if (input.imageMode === "manual") productImageBytesFromDataUrl(input.product.manualImageDataUrl!);
    const imageInput = { ...input.product };
    delete imageInput.manualImageDataUrl;
    delete imageInput.clearImage;
    if (input.imageMode === "manual") imageInput.manualImageDataUrl = input.product.manualImageDataUrl!;
    if (input.imageMode === "clear") imageInput.clearImage = true;
    if (input.imageMode !== "external") imageInput.imageSourceUrl = "";
    image = await prepareProductImageForSave(databasePath, imageInput);
    if (!image && input.imageMode !== "external") throw new Error("Ürün görseli hazırlanamadı; taslak kaydedilmedi.");
  }
  return { input, image, additions };
}

/** One commit owns product, publication, photo state, inventory and trigger-based
 * outbox invalidation. No asynchronous work or publication callback inside it. */
export function saveProductDetails(databasePath: string, prepared: PreparedProductDetailsSave): SaveProductDetailsResult {
  const { input, image, additions } = prepared;
  const db = open(databasePath);
  try {
    db.exec("BEGIN IMMEDIATE");
    const businessId = validate(databasePath, db, input);
    const now = new Date().toISOString();
    const productInput = { ...input.product };
    delete productInput.manualImageDataUrl;
    delete productInput.clearImage;
    delete productInput.onlineSalesPublished;
    // A keep/collection edit cannot accidentally reacquire an external cover.
    const combinedPhotos = input.photos !== undefined;
    if (input.imageMode === "keep" || combinedPhotos) { delete productInput.imageSourceUrl; delete productInput.imageLicense; }
    if (input.imageMode === "clear" && !combinedPhotos) productInput.clearImage = true;
    if (input.isPublished !== undefined) productInput.onlineSalesPublished = input.isPublished;
    // For a combined gallery/cover edit, let the shared photo writer resolve the
    // final ordered state against the original archive. Keep the prepared create ID.
    const seedImage = combinedPhotos && image ? { productId: image.productId, assetPath: "", sourceUrl: "", license: "", originalAssets: [] } : undefined;
    const saved = saveCatalogProductInTransaction(db, productInput, now, combinedPhotos ? input.product.id ? undefined : seedImage : image);
    let photos = readProductPhotosInTransaction(databasePath, db, saved.id);
    if (input.photos !== undefined) {
      let photoIds = input.photos.map(photo => photo.id);
      const cover = image?.originalAssets?.[0];
      const finalAdditions = [...additions];
      if (input.imageMode === "clear") photoIds = photoIds.slice(1);
      else if (cover) {
        photoIds = [cover.hash, ...photoIds.slice(1).filter(id => id !== cover.hash)];
        finalAdditions.push(readProductImageBytes(databasePath, cover.assetPath));
      }
      photos = applyProductPhotosInTransaction(databasePath, db,
        { productId: saved.id, expectedRevision: input.product.id ? input.sourcePhotoRevision : photos.revision },
        { kind: "replace", photoIds, additions: finalAdditions,
          ...(image ? { source: { url: image.sourceUrl, license: image.license } } : {}) }, now);
    }
    const publication = input.isPublished === undefined ? getCommerceProductPublication(db, saved.id)
      : saveCommerceProductPublication(db, { productId: saved.id, isPublished: input.isPublished });
    let stock: InventoryCountResult | null = null;
    if (input.stock) {
      const draft = input.stock;
      const locationId = resolveInventoryLocation(db, businessId, draft.locationId, now);
      const common = { productId: saved.id, locationId, note: draft.note, referenceType: "product_workspace_save",
        referenceId: draft.operationId, actorSource: "desktop-product-workspace" };
      const movement = draft.operation === "count" ? setInventoryCountInTransaction(db, { ...common, countedQuantity: draft.quantity }, now).movement
        : applyInventoryMovementInTransaction(db, businessId, { ...common, type: "adjust",
          quantityDelta: draft.operation === "remove" ? -draft.quantity : draft.quantity }, now);
      const row = db.prepare("SELECT quantity,updated_at FROM inventory_balances WHERE product_id=? AND location_id=?").get(saved.id, locationId)!;
      stock = { movement, balance: { productId: saved.id, locationId, quantity: Number(row.quantity), minimumQuantity: saved.minimumQuantity ?? 0, updatedAt: String(row.updated_at) } };
    }
    const balanceRow = saved.trackInventory ? db.prepare(`SELECT b.location_id,b.quantity,b.updated_at FROM inventory_balances b
      JOIN inventory_locations l ON l.id=b.location_id WHERE b.product_id=? AND l.business_id=? AND l.is_primary=1 AND l.deleted_at=''`).get(saved.id, businessId) : undefined;
    const balance = stock?.balance ?? (balanceRow ? { productId: saved.id, locationId: String(balanceRow.location_id), quantity: Number(balanceRow.quantity), minimumQuantity: saved.minimumQuantity ?? 0, updatedAt: String(balanceRow.updated_at) } : null);
    const row = db.prepare("SELECT image_asset_path,image_source_url,image_license FROM catalog_products WHERE id=?").get(saved.id)!;
    const result = { product: { ...saved, imageAssetPath: String(row.image_asset_path), imageSourceUrl: String(row.image_source_url), imageLicense: String(row.image_license) }, photos, publication, balance, stock };
    db.exec("COMMIT");
    return result;
  } finally {
    if (db.isTransaction) db.exec("ROLLBACK");
    db.close();
  }
}
