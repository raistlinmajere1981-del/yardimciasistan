import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { app } from "electron";
import { decodeProductImageBytes } from "./product-image-codec";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import {
  normalizeBarcodeIdentity,
  createId,
  type ProductDataProviderId,
  type ProductLookupMode,
  type ProductLookupResponse
} from "@yardimci-asistan/shared";
import {
  resolveProductAssetAbsolutePath,
  resolveProductAssetRelativePath
} from "./data-paths.js";
import { attachCatalogProductImageInTransaction, findCatalogProductByBarcode, type SaveCatalogProductInput, type CatalogProductImageMutation } from "./commerce-store";
import { desktopLog } from "./desktop-logger";
import { readProductImageAsset } from "./product-image-reader.js";

const OPEN_FOOD_FACTS_PROVIDER: ProductDataProviderId = "open_food_facts";
const OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org/api/v2/product";
const OPEN_FOOD_FACTS_PRODUCT = "https://world.openfoodfacts.org/product";
const LOOKUP_TIMEOUT_MS = 8_000;
const IMAGE_TIMEOUT_MS = 10_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 768;

interface ProductDataSettings {
  enabled: boolean;
  provider: ProductDataProviderId;
  autoSearchUnknownBarcode: boolean;
  includeImages: boolean;
}

interface ProductLookupProvider {
  id: ProductDataProviderId;
  lookupByBarcode: (
    barcode: string,
    options: { includeImages: boolean; signal: AbortSignal }
  ) => Promise<ProductLookupResponse>;
  isImageUrlAllowed: (value: string) => boolean;
}

function openDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000;");
  return database;
}

function productDataSettings(databasePath: string): ProductDataSettings {
  const database = openDatabase(databasePath);
  try {
    const row = database.prepare(`
      SELECT product_data_enabled, product_data_provider,
             product_data_auto_search, product_data_include_images
      FROM settings
      WHERE deleted_at = ''
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    return {
      enabled: Number(row?.product_data_enabled ?? 0) === 1,
      provider: normalizeProductDataProvider(row?.product_data_provider),
      autoSearchUnknownBarcode: Number(row?.product_data_auto_search ?? 1) === 1,
      includeImages: Number(row?.product_data_include_images ?? 1) === 1
    };
  } finally {
    database.close();
  }
}

function normalizeBarcode(value: unknown): string {
  const barcode = normalizeBarcodeIdentity(value, 32);
  if (!/^[0-9]{6,32}$/.test(barcode)) {
    throw new Error("Ürün verisi araması için geçerli bir sayısal barkod gerekli.");
  }
  return barcode;
}

function text(value: unknown, maximum = 240): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maximum);
}

function normalizeProductDataProvider(value: unknown): ProductDataProviderId {
  const provider = text(value, 80);
  switch (provider) {
    case "open_food_facts":
      return "open_food_facts";
    default:
      return OPEN_FOOD_FACTS_PROVIDER;
  }
}

function userAgent() {
  const version = (() => {
    try {
      return app.getVersion();
    } catch {
      return "0.1";
    }
  })();
  return `YardimciAsistan/${version} (https://github.com/raistlinmajere1981-del/yardimciasistan)`;
}

function isOpenFoodFactsImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "openfoodfacts.org" || url.hostname.endsWith(".openfoodfacts.org"));
  } catch {
    return false;
  }
}

const openFoodFactsProvider: ProductLookupProvider = {
  id: OPEN_FOOD_FACTS_PROVIDER,
  isImageUrlAllowed: isOpenFoodFactsImageUrl,
  async lookupByBarcode(barcode, options) {
    const fields = [
      "code",
      "product_name",
      "generic_name",
      "brands",
      "quantity",
      "categories",
      "image_front_url"
    ].join(",");
    const response = await fetch(
      `${OPEN_FOOD_FACTS_API}/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(fields)}`,
      {
        method: "GET",
        headers: {
          "User-Agent": userAgent(),
          "Accept": "application/json"
        },
        redirect: "follow",
        signal: options.signal
      }
    );
    if (response.status === 404) {
      return { status: "not_found", barcode, provider: OPEN_FOOD_FACTS_PROVIDER };
    }
    if (!response.ok) {
      throw new Error(`Ürün veri servisi HTTP ${response.status} yanıtı verdi.`);
    }

    const payload = await response.json() as Record<string, unknown>;
    const product = payload.product;
    if (Number(payload.status ?? 0) !== 1 || !product || typeof product !== "object" || Array.isArray(product)) {
      return { status: "not_found", barcode, provider: OPEN_FOOD_FACTS_PROVIDER };
    }

    const source = product as Record<string, unknown>;
    const name = text(source.product_name, 180) || text(source.generic_name, 180);
    const brand = text(source.brands, 160);
    const quantity = text(source.quantity, 80);
    const categoryHint = text(source.categories, 180);
    const rawImageUrl = text(source.image_front_url, 1200);
    const imageUrl = options.includeImages && isOpenFoodFactsImageUrl(rawImageUrl) ? rawImageUrl : "";

    return {
      status: "found",
      product: {
        provider: OPEN_FOOD_FACTS_PROVIDER,
        barcode,
        name: name || brand || "Barkodlu ürün",
        brand,
        quantity,
        categoryHint,
        imageUrl,
        sourceProductUrl: `${OPEN_FOOD_FACTS_PRODUCT}/${encodeURIComponent(barcode)}`,
        dataLicense: "ODbL",
        imageLicense: imageUrl ? "CC BY-SA" : "",
        fetchedAt: new Date().toISOString()
      }
    };
  }
};

const PRODUCT_LOOKUP_PROVIDERS: Record<ProductDataProviderId, ProductLookupProvider> = {
  open_food_facts: openFoodFactsProvider
};

function productLookupProvider(providerId: ProductDataProviderId): ProductLookupProvider {
  return PRODUCT_LOOKUP_PROVIDERS[providerId] ?? openFoodFactsProvider;
}

export async function lookupExternalProductByBarcode(
  databasePath: string,
  barcodeInput: string,
  mode: ProductLookupMode
): Promise<ProductLookupResponse> {
  const settings = productDataSettings(databasePath);
  if (!settings.enabled) {
    return { status: "disabled", reason: "service_disabled" };
  }
  if (mode === "automatic" && !settings.autoSearchUnknownBarcode) {
    return { status: "disabled", reason: "automatic_search_disabled" };
  }

  const barcode = normalizeBarcode(barcodeInput);
  const provider = productLookupProvider(settings.provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    return await provider.lookupByBarcode(barcode, {
      includeImages: settings.includeImages,
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Ürün veri servisi zaman aşımına uğradı.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNormalizedProductImage(
  providerId: string,
  imageUrl: string
): Promise<Buffer> {
  const provider = PRODUCT_LOOKUP_PROVIDERS[providerId as ProductDataProviderId];
  if (!provider || !imageUrl || !provider.isImageUrlAllowed(imageUrl)) {
    throw new Error("Ürün görseli kaynağı geçersiz.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(imageUrl, {
      method: "GET",
      headers: { "User-Agent": userAgent(), "Accept": "image/*" },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Ürün görseli HTTP ${response.status} yanıtı verdi.`);
    }
    const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      throw new Error("Ürün görseli geçerli bir resim değil.");
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > IMAGE_MAX_BYTES) {
      throw new Error("Ürün görseli izin verilen boyuttan büyük.");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) {
      throw new Error("Ürün görseli boş veya izin verilen boyuttan büyük.");
    }

    return normalizeProductImageBytes(bytes);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Ürün görseli alınırken zaman aşımı oluştu.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeProductImageBytes(bytes: Buffer): Buffer {
  if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) {
    throw new Error("Ürün görseli boş veya izin verilen boyuttan büyük.");
  }
  const decoded = decodeProductImageBytes(bytes);
  if (decoded.isEmpty()) {
    throw new Error("Ürün görseli çözümlenemedi.");
  }
  const size = decoded.getSize();
  const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(size.width, size.height, 1));
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const normalized = scale < 1
    ? decoded.resize({ width, height, quality: "good" })
    : decoded;
  const encoded = normalized.toJPEG(86);
  if (!encoded.length) {
    throw new Error("Ürün görseli standart formata dönüştürülemedi.");
  }
  return encoded;
}

function normalizedManualProductImage(dataUrlInput: string): Buffer {
  const dataUrl = String(dataUrlInput ?? "").trim();
  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error("Manuel ürün görseli JPEG, PNG veya WEBP olmalı.");
  }
  const bytes = Buffer.from(match[1] ?? "", "base64");
  return normalizeProductImageBytes(bytes);
}

function writeProductImageAsset(databasePath: string, productId: string, encoded: Buffer): string {
  const dataRoot = path.dirname(databasePath);
  const fileName = `image_${randomUUID()}.jpg`;
  const absolutePath = resolveProductAssetAbsolutePath(dataRoot, productId, fileName);
  const relativePath = resolveProductAssetRelativePath(productId, fileName);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const tempPath = `${absolutePath}.tmp`;
  try {
    const descriptor = fs.openSync(tempPath, "wx");
    try {
      fs.writeFileSync(descriptor, encoded);
      fs.fsyncSync(descriptor);
    } finally { fs.closeSync(descriptor); }
    // Complete an immutable file before any DB reference. No post-commit finalize is needed.
    fs.renameSync(tempPath, absolutePath);
    if (process.platform !== "win32") {
      const directory = fs.openSync(path.dirname(absolutePath), "r");
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    }
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Temp cleanup is best effort.
    }
  }
  return relativePath;
}

/** Preserve original transfer bytes beside the primary normalized display asset. Metadata
 * commits with CatalogProduct; existing originals are immutable and never overwritten. */
export function prepareOriginalProductImageAssets(databasePath: string, productId: string, originals: Array<{bytes: Uint8Array; format: string}>) {
  return originals.map(({bytes,format}) => {
    const extension = format === "image/png" ? "png" : format === "image/webp" ? "webp" : "jpg";
    normalizedManualProductImage(`data:${format};base64,${Buffer.from(bytes).toString("base64")}`);
    const fileName = `original_${randomUUID()}.${extension}`;
    const absolutePath = resolveProductAssetAbsolutePath(path.dirname(databasePath),productId,fileName);
    fs.mkdirSync(path.dirname(absolutePath), { recursive:true });
    fs.writeFileSync(absolutePath,bytes,{flag:"wx",mode:0o600});
    return {assetPath:resolveProductAssetRelativePath(productId,fileName),hash:createHash("sha256").update(bytes).digest("hex"),format};
  });
}

/** Image acquisition is optional, as in the existing save contract. A failed prepare
 * keeps the current asset; product validation/commit still owns success or failure. */
export async function prepareProductImageForSave(databasePath: string, input: SaveCatalogProductInput): Promise<CatalogProductImageMutation | undefined> {
  const productId = String(input.id ?? "").trim() || createId("product_");
  if (input.clearImage) return { productId, assetPath: "", sourceUrl: "", license: "" };
  const sourceUrl = String(input.imageSourceUrl ?? "").trim().slice(0, 1200);
  if (!input.manualImageDataUrl && !sourceUrl) return undefined;
  try {
    let encoded: Buffer;
    let license = String(input.imageLicense ?? "").trim().slice(0, 80);
    if (input.manualImageDataUrl) encoded = normalizedManualProductImage(input.manualImageDataUrl);
    else {
      const settings = productDataSettings(databasePath);
      if (!settings.enabled || !settings.includeImages) return undefined;
      const db = openDatabase(databasePath);
      let providerId = String(input.dataSource ?? "").trim().slice(0, 80);
      try {
        const row = db.prepare("SELECT image_asset_path, image_source_url, data_source, image_license FROM catalog_products WHERE id = ? AND deleted_at = ''").get(productId);
        if (row?.image_asset_path && row.image_source_url === sourceUrl) return undefined;
        if (input.dataSource === undefined) providerId = String(row?.data_source ?? "").trim().slice(0, 80);
        if (input.imageLicense === undefined) license = String(row?.image_license ?? "").trim().slice(0, 80);
      } finally { db.close(); }
      encoded = await fetchNormalizedProductImage(providerId, sourceUrl);
    }
    const assetPath = writeProductImageAsset(databasePath, productId, encoded);
    return { productId, assetPath, sourceUrl: input.manualImageDataUrl ? "" : sourceUrl,
      license: input.manualImageDataUrl ? "" : license };
  } catch (error) {
    desktopLog.warn({ scope: "product-data", event: input.manualImageDataUrl ? "product-data.manual-image-archive.failed" : "product-data.image-archive.failed",
      message: input.manualImageDataUrl ? "Manuel ürün görseli arşivlenemedi." : "Ürün görseli arşivlenemedi.", meta: { productId }, error });
    return undefined;
  }
}

/** Startup only, before background work: collect abandoned prepared files and replaced
 * immutable images under a DB write lock. Never follow symlinks or remove referenced assets. */
export function cleanupOrphanProductImages(databasePath: string): void {
  const db = openDatabase(databasePath);
  try {
    db.exec("BEGIN IMMEDIATE");
    const referenced = new Set<string>();
    for (const row of db.prepare("SELECT image_asset_path, image_original_assets_json FROM catalog_products").all()) {
      if (row.image_asset_path) referenced.add(String(row.image_asset_path));
      const originals = JSON.parse(String(row.image_original_assets_json)) as Array<{assetPath:string}>;
      for (const item of originals) referenced.add(item.assetPath);
    }
    const root = path.join(path.dirname(databasePath), "assets", "products");
    if (fs.existsSync(root)) for (const directory of fs.readdirSync(root, { withFileTypes: true })) {
      if (!directory.isDirectory() || !/^[A-Za-z0-9_-]{1,64}$/.test(directory.name)) continue;
      for (const file of fs.readdirSync(path.join(root, directory.name), { withFileTypes: true })) {
        if (!file.isFile() || !/^(?:image_[0-9a-f-]{36}\.jpg|original_[0-9a-f-]{36}\.(?:jpg|png|webp))(?:\.tmp)?$/.test(file.name)) continue;
        const relative = `assets/products/${directory.name}/${file.name}`;
        if (!referenced.has(relative)) fs.unlinkSync(path.join(root, directory.name, file.name));
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    desktopLog.warn({ scope: "product-data", event: "product-data.orphan-cleanup.failed", message: "Kullanılmayan ürün görselleri temizlenemedi.", error });
  } finally { db.close(); }
}

export async function previewExternalProductImage(
  providerId: string,
  imageUrl: string
): Promise<string> {
  const encoded = await fetchNormalizedProductImage(providerId, imageUrl);
  return `data:image/jpeg;base64,${encoded.toString("base64")}`;
}

/** Optional post-apply acquisition shared by Android ingress paths, before transport ACK.
 * Product and action receipt have already committed; replay keeps an existing asset. */
export async function archiveAndroidProductImage(databasePath: string, action: AndroidSyncAction): Promise<void> {
  const barcode = String(action.payload?.barcode ?? "").trim();
  const imageUrl = String(action.payload?.image_source_url ?? "").trim();
  const provider = String(action.payload?.data_source ?? "").trim();
  if (!barcode || !imageUrl || !provider) return;

  try {
    const product = findCatalogProductByBarcode(databasePath, barcode);
    if (!product || product.imageAssetPath) return;
    await archiveExternalProductImage(databasePath, product.id, provider, imageUrl);
  } catch (error) {
    desktopLog.warn({
      scope: "product-data",
      event: "product-data.image-archive.failed",
      message: "Android ürün görseli yerel arşive alınamadı.",
      meta: { barcode },
      error
    });
  }
}

/** @compiledSmoke apps/desktop-app/scripts/fixtures/commerce-product-media.cjs (dist-electron require) */
export async function archiveExternalProductImage(
  databasePath: string,
  productId: string,
  providerId: string,
  imageUrl: string
): Promise<string> {
  const settings = productDataSettings(databasePath);
  if (!settings.enabled || !settings.includeImages) return "";

  const provider = PRODUCT_LOOKUP_PROVIDERS[providerId as ProductDataProviderId];
  if (!provider || !imageUrl || !provider.isImageUrlAllowed(imageUrl)) return "";

  const encoded = await fetchNormalizedProductImage(providerId, imageUrl);
  const relativePath = writeProductImageAsset(databasePath, productId, encoded);

  const database = openDatabase(databasePath);
  try {
    database.exec("BEGIN IMMEDIATE");
    const attached = attachCatalogProductImageInTransaction(database, productId, imageUrl, relativePath);
    database.exec("COMMIT");
    return attached ? relativePath : "";
  } finally {
    if (database.isTransaction) database.exec("ROLLBACK");
    database.close();
  }
}

export function getProductImageDataUrl(databasePath: string, productId: string): string {
  const database = openDatabase(databasePath);
  let relativePath = "";
  try {
    const row = database.prepare(`
      SELECT image_asset_path
      FROM catalog_products
      WHERE id = ? AND deleted_at = ''
      LIMIT 1
    `).get(productId) as { image_asset_path?: unknown } | undefined;
    relativePath = text(row?.image_asset_path, 500);
  } finally {
    database.close();
  }
  return readProductImageAsset(databasePath, relativePath);
}
