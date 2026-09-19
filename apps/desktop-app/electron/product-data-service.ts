import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app, nativeImage } from "electron";
import type {
  ProductDataProviderId,
  ProductLookupMode,
  ProductLookupResponse
} from "@yardimci-asistan/shared";
import {
  resolveProductAssetAbsoluteFromRelative,
  resolveProductAssetAbsolutePath,
  resolveProductAssetRelativePath
} from "./data-paths.js";

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
      provider: OPEN_FOOD_FACTS_PROVIDER,
      autoSearchUnknownBarcode: Number(row?.product_data_auto_search ?? 1) === 1,
      includeImages: Number(row?.product_data_include_images ?? 1) === 1
    };
  } finally {
    database.close();
  }
}

function normalizeBarcode(value: unknown): string {
  const barcode = String(value ?? "").trim();
  if (!/^[0-9]{6,32}$/.test(barcode)) {
    throw new Error("Ürün verisi araması için geçerli bir sayısal barkod gerekli.");
  }
  return barcode;
}

function text(value: unknown, maximum = 240): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maximum);
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

    const decoded = nativeImage.createFromBuffer(bytes);
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

    const dataRoot = path.dirname(databasePath);
    const absolutePath = resolveProductAssetAbsolutePath(dataRoot, productId, "front.jpg");
    const relativePath = resolveProductAssetRelativePath(productId, "front.jpg");
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const tempPath = `${absolutePath}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(tempPath, encoded);
      fs.copyFileSync(tempPath, absolutePath);
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // Temp cleanup is best effort; the product file has already been written or the caller gets the original error.
      }
    }

    const database = openDatabase(databasePath);
    try {
      database.prepare(`
        UPDATE catalog_products
        SET image_asset_path = ?, updated_at = ?
        WHERE id = ? AND deleted_at = ''
      `).run(relativePath, new Date().toISOString(), productId);
    } finally {
      database.close();
    }
    return relativePath;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Ürün görseli indirilirken zaman aşımı oluştu.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
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
  if (!relativePath) return "";

  const absolutePath = resolveProductAssetAbsoluteFromRelative(path.dirname(databasePath), relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return "";
  const bytes = fs.readFileSync(absolutePath);
  if (!bytes.length || bytes.length > IMAGE_MAX_BYTES) return "";
  const extension = path.extname(absolutePath).toLowerCase();
  const mime = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
