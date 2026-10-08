import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  createId,
  moneyToMinor,
  normalizeBarcodeIdentity,
  type CatalogProduct,
  type CommerceSale,
  type CommerceSupplier,
  type CommerceUnit,
  type InventoryBalance,
  type InventoryMovement,
  type InventoryMovementType
} from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { saveCommerceProductPublication } from "./commerce-product-publication-store.js";
import { isInventoryTrackingEnabled } from "./inventory-tracking.js";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service.js";

const COMMERCE_UNITS = new Set<CommerceUnit>([
  "piece", "kg", "g", "l", "ml", "pack", "box", "meter", "other"
]);
const INVENTORY_MOVEMENT_TYPES = new Set<InventoryMovementType>([
  "sale", "purchase", "waste", "count", "adjust", "return_in", "return_out"
]);

export interface ListCatalogProductsOptions {
  search?: string;
  categoryId?: string;
  activeOnly?: boolean;
  limit?: number;
}

export interface SaveCatalogProductInput {
  id?: string;
  categoryId?: string;
  name: string;
  /** Creation-only channel preference; defaults to published when online sales is enabled. */
  onlineSalesPublished?: boolean;
  brand?: string;
  sku?: string;
  barcode?: string;
  description?: string;
  salePrice?: number;
  dealerPriceA?: number | null;
  dealerPriceB?: number | null;
  quickAccessEnabled?: boolean;
  purchasePrice?: number;
  currency?: string;
  unit?: CommerceUnit;
  taxRate?: number;
  trackInventory?: boolean;
  isActive?: boolean;
  minimumQuantity?: number;
  imageSourceUrl?: string;
  dataSource?: string;
  sourceProductUrl?: string;
  dataLicense?: string;
  imageLicense?: string;
  sourceFetchedAt?: string;
  /** Optional image draft; the application prepares the asset before persistence. */
  manualImageDataUrl?: string;
  /** Explicit image removal, applied with the product transaction by the application. */
  clearImage?: boolean;
}

/** Internal application-prepared asset identity, never accepted directly from the renderer. */
export interface CatalogProductImageMutation {
  productId: string;
  assetPath: string;
  sourceUrl: string;
  license: string;
}

export interface ApplyInventoryMovementInput {
  productId: string;
  locationId?: string;
  type: InventoryMovementType;
  quantityDelta: number;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  actorSource?: string;
}

export interface ListInventoryMovementsOptions {
  productId?: string;
  locationId?: string;
  type?: InventoryMovementType;
  limit?: number;
}

export interface SetInventoryCountInput {
  productId: string;
  locationId?: string;
  countedQuantity: number;
  expectedUpdatedAt?: string;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  actorSource?: string;
}

export interface InventoryCountResult {
  balance: InventoryBalance;
  movement: InventoryMovement | null;
}

export interface CreateCommerceSaleInput {
  customerId?: string;
  paymentMethod?: string;
  source?: string;
  locationId?: string;
  discountTotal?: number;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface CreateCommerceSaleFromOrderSnapshotInput {
  subtotal: number;
  discountTotal: number;
  total: number;
  currency: string;
  paymentMethod: string;
  source: string;
  locationId?: string;
  items: Array<{
    productId: string;
    productName: string;
    barcode: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
}

export interface CommerceSaleFromOrderSnapshotResult {
  sale: CommerceSale;
  inventoryLocationId: string;
}

export interface ListCommerceSuppliersOptions {
  search?: string;
  activeOnly?: boolean;
  limit?: number;
}

export interface SaveCommerceSupplierInput {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  notes?: string;
  isActive?: boolean;
}

export interface CommerceStoreSnapshot {
  products: CatalogProduct[];
  suppliers: CommerceSupplier[];
}

function openDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function normalizeLimit(value: unknown, fallback = 200, maximum = 500) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(numeric)));
}

function activeBusinessId(database: DatabaseSync) {
  const row = database.prepare(`
    SELECT id
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown } | undefined;
  const businessId = String(row?.id ?? "").trim();
  if (!businessId) throw new Error("Aktif işletme bulunamadı.");
  return businessId;
}

function normalizeCurrency(value: unknown) {
  const currency = String(value ?? "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "TRY";
}

function normalizeUnit(value: unknown): CommerceUnit {
  const unit = String(value ?? "piece") as CommerceUnit;
  return COMMERCE_UNITS.has(unit) ? unit : "piece";
}

function mapProduct(row: Record<string, unknown>): CatalogProduct {
  return {
    id: String(row.id ?? ""),
    businessId: String(row.business_id ?? ""),
    categoryId: String(row.category_id ?? ""),
    name: String(row.name ?? ""),
    brand: String(row.brand ?? ""),
    sku: String(row.sku ?? ""),
    barcode: String(row.barcode ?? ""),
    description: String(row.description ?? ""),
    salePrice: roundMoney(Number(row.sale_price ?? 0)),
    dealerPriceA: row.dealer_price_a == null ? null : roundMoney(Number(row.dealer_price_a)),
    dealerPriceB: row.dealer_price_b == null ? null : roundMoney(Number(row.dealer_price_b)),
    sortOrder: Number(row.sort_order ?? 0),
    quickAccessEnabled: Number(row.quick_access_enabled ?? 0) === 1,
    quickAccessOrder: Number(row.quick_access_order ?? 0),
    purchasePrice: roundMoney(Number(row.purchase_price ?? 0)),
    currency: normalizeCurrency(row.currency),
    unit: normalizeUnit(row.unit),
    taxRate: Number(row.tax_rate ?? 0),
    trackInventory: Number(row.track_inventory ?? 0) === 1,
    minimumQuantity: Number(row.minimum_quantity ?? 0),
    isActive: Number(row.is_active ?? 0) === 1,
    imageAssetPath: String(row.image_asset_path ?? ""),
    imageSourceUrl: String(row.image_source_url ?? ""),
    dataSource: String(row.data_source ?? ""),
    sourceProductUrl: String(row.source_product_url ?? ""),
    dataLicense: String(row.data_license ?? ""),
    imageLicense: String(row.image_license ?? ""),
    sourceFetchedAt: String(row.source_fetched_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapSupplier(row: Record<string, unknown>): CommerceSupplier {
  return {
    id: String(row.id ?? ""),
    businessId: String(row.business_id ?? ""),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    taxNumber: String(row.tax_number ?? ""),
    notes: String(row.notes ?? ""),
    isActive: Number(row.is_active ?? 0) === 1,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapInventoryMovement(row: Record<string, unknown>): InventoryMovement {
  return {
    id: String(row.id ?? ""),
    businessId: String(row.business_id ?? ""),
    productId: String(row.product_id ?? ""),
    locationId: String(row.location_id ?? ""),
    type: String(row.movement_type ?? "adjust") as InventoryMovementType,
    quantityDelta: roundQuantity(Number(row.quantity_delta ?? 0)),
    quantityAfter: roundQuantity(Number(row.quantity_after ?? 0)),
    unitCost: Math.max(0, roundMoney(Number(row.unit_cost ?? 0))),
    referenceType: String(row.reference_type ?? ""),
    referenceId: String(row.reference_id ?? ""),
    note: String(row.note ?? ""),
    actorSource: String(row.actor_source ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}

function ensurePrimaryLocation(database: DatabaseSync, businessId: string, now = new Date().toISOString()) {
  const existing = database.prepare(`
    SELECT id
    FROM inventory_locations
    WHERE business_id = ? AND is_primary = 1 AND deleted_at = ''
    LIMIT 1
  `).get(businessId) as { id?: unknown } | undefined;
  if (existing?.id) return String(existing.id);

  const id = createId("inventory_location_");
  database.prepare(`
    INSERT INTO inventory_locations (
      id, business_id, name, code, is_primary, is_active, created_at, updated_at, deleted_at
    ) VALUES (?, ?, 'Ana Stok', 'main', 1, 1, ?, ?, '')
  `).run(id, businessId, now, now);
  return id;
}

function getProductRow(database: DatabaseSync, businessId: string, productId: string) {
  return database.prepare(`
    SELECT *
    FROM catalog_products
    WHERE id = ? AND business_id = ? AND deleted_at = ''
    LIMIT 1
  `).get(productId, businessId) as Record<string, unknown> | undefined;
}

function requireTrackedProductRow(database: DatabaseSync, businessId: string, productIdInput: string) {
  const productId = String(productIdInput ?? "").trim();
  const product = getProductRow(database, businessId, productId);
  if (!product) throw new Error("Stok işlemi için ürün bulunamadı.");
  if (Number(product.track_inventory ?? 0) !== 1) {
    throw new Error("Bu ürün stok takibine kapalı.");
  }
  return { productId, product };
}

export function resolveInventoryLocation(
  database: DatabaseSync,
  businessId: string,
  locationIdInput: string | undefined,
  now = new Date().toISOString()
) {
  const locationId = String(locationIdInput ?? "").trim() || ensurePrimaryLocation(database, businessId, now);
  const location = database.prepare(`
    SELECT id
    FROM inventory_locations
    WHERE id = ? AND business_id = ? AND is_active = 1 AND deleted_at = ''
    LIMIT 1
  `).get(locationId, businessId) as { id?: unknown } | undefined;
  if (!location?.id) throw new Error("Stok konumu bulunamadı.");
  return locationId;
}

function getInventoryBalanceRow(database: DatabaseSync, productId: string, locationId: string) {
  return database.prepare(`
    SELECT COALESCE(b.quantity, 0) AS quantity, p.minimum_quantity, COALESCE(b.updated_at, '') AS updated_at
    FROM catalog_products p LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.location_id = ?
    WHERE p.id = ?
  `).get(locationId, productId) as Record<string, unknown> | undefined;
}

function mapInventoryBalance(
  productId: string,
  locationId: string,
  row: Record<string, unknown> | undefined
): InventoryBalance {
  return {
    productId,
    locationId,
    quantity: roundQuantity(Number(row?.quantity ?? 0)),
    minimumQuantity: Math.max(0, roundQuantity(Number(row?.minimum_quantity ?? 0))),
    updatedAt: String(row?.updated_at ?? "")
  };
}

/** Caller owns the transaction: balance, movement and its sale/purchase receipt stay atomic. */
export function applyInventoryMovementInTransaction(
  database: DatabaseSync,
  businessId: string,
  input: ApplyInventoryMovementInput,
  now: string
): InventoryMovement {
  if (!INVENTORY_MOVEMENT_TYPES.has(input.type)) {
    throw new Error(`Geçersiz stok hareketi: ${input.type}`);
  }
  const { productId } = requireTrackedProductRow(database, businessId, input.productId);
  const locationId = resolveInventoryLocation(database, businessId, input.locationId, now);

  const quantityDelta = roundQuantity(Number(input.quantityDelta));
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error("Stok hareketi sıfırdan farklı olmalı.");
  }

  const before = getInventoryBalanceRow(database, productId, locationId);
  const quantityBefore = roundQuantity(Number(before?.quantity ?? 0));
  const quantityAfter = roundQuantity(quantityBefore + quantityDelta);
  if (quantityAfter < 0) {
    throw new Error(`Yetersiz stok. Mevcut: ${quantityBefore}.`);
  }

  database.prepare(`
    INSERT INTO inventory_balances (product_id, location_id, quantity, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(product_id, location_id) DO UPDATE SET
      quantity = excluded.quantity,
      updated_at = excluded.updated_at
  `).run(productId, locationId, quantityAfter, now);

  const movementId = createId("inventory_movement_");
  const unitCost = Math.max(0, roundMoney(Number(input.unitCost ?? 0)));
  const referenceType = String(input.referenceType ?? "").trim().slice(0, 80);
  const referenceId = String(input.referenceId ?? "").trim().slice(0, 160);
  const note = String(input.note ?? "").trim().slice(0, 1000);
  const actorSource = String(input.actorSource ?? "desktop").trim().slice(0, 80) || "desktop";

  database.prepare(`
    INSERT INTO inventory_movements (
      id, business_id, product_id, location_id, movement_type,
      quantity_delta, quantity_after, unit_cost, reference_type, reference_id,
      note, actor_source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    movementId,
    businessId,
    productId,
    locationId,
    input.type,
    quantityDelta,
    quantityAfter,
    unitCost,
    referenceType,
    referenceId,
    note,
    actorSource,
    now
  );

  return {
    id: movementId,
    businessId,
    productId,
    locationId,
    type: input.type,
    quantityDelta,
    quantityAfter,
    unitCost,
    referenceType,
    referenceId,
    note,
    actorSource,
    createdAt: now
  };
}

export function listCatalogProducts(
  databasePath: string,
  options: ListCatalogProductsOptions = {}
): CatalogProduct[] {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const conditions = ["business_id = ?", "deleted_at = ''"];
    const params: Array<string | number> = [businessId];
    const search = String(options.search ?? "").trim();
    const categoryId = String(options.categoryId ?? "").trim();

    if (options.activeOnly) conditions.push("is_active = 1");
    if (categoryId) {
      conditions.push("category_id = ?");
      params.push(categoryId);
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push("(name LIKE ? COLLATE NOCASE OR brand LIKE ? COLLATE NOCASE OR sku LIKE ? COLLATE NOCASE OR barcode LIKE ? COLLATE NOCASE)");
      params.push(pattern, pattern, pattern, pattern);
    }
    params.push(normalizeLimit(options.limit));

    return (database.prepare(`
      SELECT *
      FROM catalog_products
      WHERE ${conditions.join(" AND ")}
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC, id ASC
      LIMIT ?
    `).all(...params) as Array<Record<string, unknown>>).map(mapProduct);
  } finally {
    database.close();
  }
}

export function findCatalogProductByBarcode(databasePath: string, barcodeInput: string): CatalogProduct | null {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const barcode = normalizeBarcodeIdentity(barcodeInput);
    if (!barcode) throw new Error("Barkod boş olamaz.");
    const row = database.prepare(`
      SELECT *
      FROM catalog_products
      WHERE business_id = ? AND barcode = ? AND barcode <> '' AND is_active = 1 AND deleted_at = ''
      LIMIT 1
    `).get(businessId, barcode) as Record<string, unknown> | undefined;
    return row ? mapProduct(row) : null;
  } finally {
    database.close();
  }
}

export function saveCatalogProductInTransaction(
  database: DatabaseSync,
  input: SaveCatalogProductInput,
  now = new Date().toISOString(),
  image?: CatalogProductImageMutation
): CatalogProduct {
  const businessId = activeBusinessId(database);
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Ürün adı gerekli.");
  if (name.length > 180) throw new Error("Ürün adı en fazla 180 karakter olabilir.");

  const id = String(input.id ?? "").trim() || image?.productId || createId("product_");
  if (image && image.productId !== id) throw new Error("Ürün görsel kimliği eşleşmedi.");
  const existing = getProductRow(database, businessId, id);
  if (input.id && !existing) throw new Error("Düzenlenecek ürün bulunamadı.");
  if (existing && ((input.trackInventory !== false) !== (Number(existing.track_inventory) === 1)
      || normalizeUnit(input.unit) !== existing.unit)) {
    const openConsumption = database.prepare(`SELECT 1 FROM table_order_items i JOIN table_orders o ON o.id = i.order_id
      WHERE i.product_id = ? AND i.status <> 'cancelled' AND i.inventory_quantity_per_item > 0 AND o.status IN ('open', 'preparing', 'served', 'payment')
      UNION ALL SELECT 1 FROM room_folio_items i JOIN room_folios f ON f.id = i.folio_id
      WHERE i.product_id = ? AND i.deleted_at = '' AND i.inventory_quantity_per_item > 0 AND f.status = 'open' LIMIT 1`).get(id, id);
    if (openConsumption) throw new Error("Açık adisyon veya oda hesabında tüketimi bulunan ürünün stok takibi/birimi değiştirilemez.");
  }

  const brand = input.brand === undefined
    ? String(existing?.brand ?? "").trim().slice(0, 160)
    : String(input.brand ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  const sku = String(input.sku ?? "").trim().slice(0, 80);
  const barcode = normalizeBarcodeIdentity(input.barcode, 80);
  const description = String(input.description ?? "").trim().slice(0, 2000);
  const previousImageSourceUrl = String(existing?.image_source_url ?? "").trim().slice(0, 1200);
  const requestedImageSourceUrl = String(input.imageSourceUrl ?? "").trim().slice(0, 1200);
  const preserveImageMetadata = existing?.image_asset_path && !image && (input.manualImageDataUrl
    || (input.imageSourceUrl !== undefined && requestedImageSourceUrl !== previousImageSourceUrl));
  const imageSourceUrl = image?.sourceUrl ?? ((preserveImageMetadata || input.imageSourceUrl === undefined)
    ? previousImageSourceUrl
    : requestedImageSourceUrl);
  // A requested optional replacement must not detach the previous valid asset on prepare failure.
  const imageAssetPath = image ? image.assetPath : String(existing?.image_asset_path ?? "").trim().slice(0, 500);
  const dataSource = input.dataSource === undefined
    ? String(existing?.data_source ?? "").trim().slice(0, 80)
    : String(input.dataSource ?? "").trim().slice(0, 80);
  const sourceProductUrl = input.sourceProductUrl === undefined
    ? String(existing?.source_product_url ?? "").trim().slice(0, 1200)
    : String(input.sourceProductUrl ?? "").trim().slice(0, 1200);
  const dataLicense = input.dataLicense === undefined
    ? String(existing?.data_license ?? "").trim().slice(0, 80)
    : String(input.dataLicense ?? "").trim().slice(0, 80);
  const imageLicense = image?.license ?? ((preserveImageMetadata || input.imageLicense === undefined)
    ? String(existing?.image_license ?? "").trim().slice(0, 80)
    : String(input.imageLicense ?? "").trim().slice(0, 80));
  const sourceFetchedAt = input.sourceFetchedAt === undefined
    ? String(existing?.source_fetched_at ?? "").trim().slice(0, 80)
    : String(input.sourceFetchedAt ?? "").trim().slice(0, 80);
  const salePrice = Math.max(0, roundMoney(Number(input.salePrice ?? 0)));
  const dealerPriceA = input.dealerPriceA == null
    ? null
    : roundMoney(Number(input.dealerPriceA));
  const dealerPriceB = input.dealerPriceB == null
    ? null
    : roundMoney(Number(input.dealerPriceB));
  if (dealerPriceA !== null && (!Number.isFinite(dealerPriceA) || dealerPriceA < 0)) {
    throw new Error("Bayi A fiyatı geçersiz.");
  }
  if (dealerPriceB !== null && (!Number.isFinite(dealerPriceB) || dealerPriceB < 0)) {
    throw new Error("Bayi B fiyatı geçersiz.");
  }
  const purchasePrice = Math.max(0, roundMoney(Number(input.purchasePrice ?? 0)));
  const currency = normalizeCurrency(input.currency);
  const unit = normalizeUnit(input.unit);
  const taxRate = Math.max(0, Math.min(100, Number(input.taxRate ?? 0)));
  const trackInventory = input.trackInventory !== false;
  const isActive = input.isActive !== false;
  const categoryId = String(input.categoryId ?? "").trim();
  if (input.quickAccessEnabled !== undefined && typeof input.quickAccessEnabled !== "boolean") throw new Error("Hızlı erişim tercihi geçersiz.");

  try {
    database.prepare(`
      INSERT INTO catalog_products (
        id, business_id, category_id, name, brand, sku, barcode, description,
        sale_price, dealer_price_a, dealer_price_b, purchase_price, currency, unit, tax_rate,
        track_inventory, minimum_quantity, is_active, image_asset_path, image_source_url,
        data_source, source_product_url, data_license, image_license, source_fetched_at,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
      ON CONFLICT(id) DO UPDATE SET
        category_id = excluded.category_id,
        name = excluded.name,
        brand = excluded.brand,
        sku = excluded.sku,
        barcode = excluded.barcode,
        description = excluded.description,
        sale_price = excluded.sale_price,
        dealer_price_a = excluded.dealer_price_a,
        dealer_price_b = excluded.dealer_price_b,
        purchase_price = excluded.purchase_price,
        currency = excluded.currency,
        unit = excluded.unit,
        tax_rate = excluded.tax_rate,
        track_inventory = excluded.track_inventory,
        minimum_quantity = excluded.minimum_quantity,
        is_active = excluded.is_active,
        image_asset_path = excluded.image_asset_path,
        image_source_url = excluded.image_source_url,
        data_source = excluded.data_source,
        source_product_url = excluded.source_product_url,
        data_license = excluded.data_license,
        image_license = excluded.image_license,
        source_fetched_at = excluded.source_fetched_at,
        updated_at = excluded.updated_at,
        deleted_at = ''
    `).run(
      id, businessId, categoryId, name, brand, sku, barcode, description,
      salePrice, dealerPriceA, dealerPriceB, purchasePrice, currency, unit, taxRate,
      trackInventory ? 1 : 0, Math.max(0, roundQuantity(Number(input.minimumQuantity ?? existing?.minimum_quantity ?? 0))), isActive ? 1 : 0,
      imageAssetPath, imageSourceUrl, dataSource, sourceProductUrl,
      dataLicense, imageLicense, sourceFetchedAt,
      String(existing?.created_at ?? now), now
    );

    if (input.quickAccessEnabled !== undefined) {
      const nextOrder = Number((database.prepare("SELECT COALESCE(MAX(quick_access_order), -1) + 1 AS value FROM catalog_products WHERE business_id = ? AND quick_access_enabled = 1 AND deleted_at = ''").get(businessId) as { value: number }).value);
      database.prepare("UPDATE catalog_products SET quick_access_enabled = ?, quick_access_order = CASE WHEN quick_access_enabled = 0 AND ? = 1 THEN ? ELSE quick_access_order END WHERE id = ?")
        .run(input.quickAccessEnabled ? 1 : 0, input.quickAccessEnabled ? 1 : 0, nextOrder, id);
    }

    if (!existing) database.prepare("UPDATE catalog_products SET sort_order = (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM catalog_products WHERE business_id = ? AND id <> ? AND deleted_at = '') WHERE id = ?")
      .run(businessId, id, id);

    if (trackInventory) {
      const locationId = ensurePrimaryLocation(database, businessId, now);
      database.prepare(`
        INSERT INTO inventory_balances (product_id, location_id, quantity, updated_at)
        VALUES (?, ?, 0, ?)
        ON CONFLICT(product_id, location_id) DO NOTHING
      `).run(id, locationId, now);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ürün kaydedilemedi.";
    if (message.includes("idx_catalog_products_barcode_unique")
        || message.includes("catalog_products.business_id, catalog_products.barcode")) {
      throw new Error("Bu barkod başka bir üründe kullanılıyor.", { cause: error });
    }
    if (message.includes("idx_catalog_products_sku_unique")
        || message.includes("catalog_products.business_id, catalog_products.sku")) {
      throw new Error("Bu stok kodu başka bir üründe kullanılıyor.", { cause: error });
    }
    throw error;
  }

  if (!existing && readEnabledBusinessCapabilities(database).includes(BUSINESS_CAPABILITIES.ONLINE_SALES)) {
    if (input.onlineSalesPublished !== undefined && typeof input.onlineSalesPublished !== "boolean") {
      throw new Error("Ürün yayın bilgisi geçersiz.");
    }
    saveCommerceProductPublication(database, { productId: id, isPublished: input.onlineSalesPublished ?? true });
  }

  const saved = getProductRow(database, businessId, id);
  if (!saved) throw new Error("Ürün kaydedildi ancak yeniden okunamadı.");
  return mapProduct(saved);
}

export function saveCatalogProduct(databasePath: string, input: SaveCatalogProductInput, image?: CatalogProductImageMutation): CatalogProduct {
  const database = openDatabase(databasePath);
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const saved = saveCatalogProductInTransaction(database, input, new Date().toISOString(), image);
      database.exec("COMMIT");
      return saved;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

/** Late optional Android acquisition can only attach to the still-current, empty image intent. */
export function attachCatalogProductImageInTransaction(database: DatabaseSync, productId: string, imageUrl: string, assetPath: string): boolean {
  if (!database.isTransaction) throw new Error("Product image attachment requires a transaction.");
  return database.prepare(`UPDATE catalog_products SET image_asset_path = ?, updated_at = ?
    WHERE id = ? AND deleted_at = '' AND image_source_url = ? AND image_asset_path = ''`)
    .run(assetPath, new Date().toISOString(), productId, imageUrl).changes === 1;
}

export function getInventoryBalance(databasePath: string, productIdInput: string, locationId?: string): InventoryBalance {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const { productId } = requireTrackedProductRow(database, businessId, productIdInput);
    const resolvedLocationId = resolveInventoryLocation(database, businessId, locationId);
    return mapInventoryBalance(
      productId,
      resolvedLocationId,
      getInventoryBalanceRow(database, productId, resolvedLocationId)
    );
  } finally {
    database.close();
  }
}

export function listInventoryMovements(
  databasePath: string,
  options: ListInventoryMovementsOptions = {}
): InventoryMovement[] {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const conditions = ["business_id = ?"];
    const params: Array<string | number> = [businessId];
    const productId = String(options.productId ?? "").trim();
    const locationId = String(options.locationId ?? "").trim();

    if (productId) {
      requireTrackedProductRow(database, businessId, productId);
      conditions.push("product_id = ?");
      params.push(productId);
    }
    if (locationId) {
      conditions.push("location_id = ?");
      params.push(locationId);
    }
    if (options.type !== undefined) {
      if (!INVENTORY_MOVEMENT_TYPES.has(options.type)) {
        throw new Error(`Geçersiz stok hareketi: ${options.type}`);
      }
      conditions.push("movement_type = ?");
      params.push(options.type);
    }
    params.push(normalizeLimit(options.limit, 100, 500));

    return (database.prepare(`
      SELECT *
      FROM inventory_movements
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...params) as Array<Record<string, unknown>>).map(mapInventoryMovement);
  } finally {
    database.close();
  }
}

export function applyInventoryMovement(databasePath: string, input: ApplyInventoryMovementInput): InventoryMovement {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const now = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      const movement = applyInventoryMovementInTransaction(database, businessId, input, now);
      database.exec("COMMIT");
      return movement;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

export function setInventoryCount(databasePath: string, input: SetInventoryCountInput): InventoryCountResult {
  const database = openDatabase(databasePath);
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = setInventoryCountInTransaction(database, input, new Date().toISOString());
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

/**
 * Transaction-aware physical count primitive. Android action receipts and the
 * inventory mutation share one outer transaction through this entry point.
 */
export function setInventoryCountInTransaction(
  database: DatabaseSync,
  input: SetInventoryCountInput,
  now: string
): InventoryCountResult {
  const countedQuantity = roundQuantity(Number(input.countedQuantity));
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
    throw new Error("Sayım miktarı 0 veya daha büyük bir sayı olmalı.");
  }

  const businessId = activeBusinessId(database);
  const { productId } = requireTrackedProductRow(database, businessId, input.productId);
  const locationId = resolveInventoryLocation(database, businessId, input.locationId, now);
  const current = mapInventoryBalance(
    productId,
    locationId,
    getInventoryBalanceRow(database, productId, locationId)
  );
  const expectedUpdatedAt = String(input.expectedUpdatedAt ?? "").trim();
  if (expectedUpdatedAt && expectedUpdatedAt !== current.updatedAt) {
    throw new Error("Stok bu sayımdan sonra değişti. Güncel miktarı alıp yeniden sayın.");
  }
  const quantityDelta = roundQuantity(countedQuantity - current.quantity);

  if (quantityDelta === 0) return { balance: current, movement: null };

  const movement = applyInventoryMovementInTransaction(database, businessId, {
    productId,
    locationId,
    type: "count",
    quantityDelta,
    ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
    referenceType: input.referenceType || "inventory_count",
    ...(input.referenceId !== undefined ? { referenceId: input.referenceId } : {}),
    note: input.note || `Fiziksel sayım: ${countedQuantity}`,
    actorSource: input.actorSource || "desktop"
  }, now);
  const balance = mapInventoryBalance(
    productId,
    locationId,
    getInventoryBalanceRow(database, productId, locationId)
  );
  return { balance, movement };
}

export function createPaidCommerceSale(databasePath: string, input: CreateCommerceSaleInput): CommerceSale {
  const database = openDatabase(databasePath);
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const sale = createCommerceSaleInTransaction(database, input, "paid", new Date().toISOString());
      database.exec("COMMIT");
      return sale;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

/** Caller owns BEGIN IMMEDIATE / COMMIT, including current-price resolution. */
export function createCommerceSaleInTransaction(
  database: DatabaseSync,
  input: CreateCommerceSaleInput,
  status: "paid" | "credit",
  now: string
): CommerceSale {
  const businessId = activeBusinessId(database);
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Satış için en az bir ürün gerekli.");
  }

  const saleId = createId("sale_");
  const inventoryEnabled = isInventoryTrackingEnabled(database);
  const wholesaleEnabled = readEnabledBusinessCapabilities(database).includes(BUSINESS_CAPABILITIES.WHOLESALE);
  const locationId = inventoryEnabled
    ? String(input.locationId ?? "").trim() || ensurePrimaryLocation(database, businessId, now)
    : "";
  let currency = "";
  let subtotal = 0;
  const preparedItems: Array<{
    product: CatalogProduct;
    quantity: number;
    lineTotal: number;
  }> = [];

  for (const item of input.items) {
    const quantity = roundQuantity(Number(item.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Satış adedi sıfırdan büyük olmalı.");
    const row = getProductRow(database, businessId, String(item.productId ?? "").trim());
    if (!row || Number(row.is_active ?? 0) !== 1) throw new Error("Satış ürünlerinden biri aktif değil veya bulunamadı.");
    const product = mapProduct(row);
    const resolvedPrice = resolveCommerceProductPriceInDatabase(database, businessId, { productId: product.id,
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}) }, wholesaleEnabled);
    product.salePrice = resolvedPrice.unitPrice;
    moneyToMinor(product.salePrice);
    if (currency && product.currency !== currency) throw new Error("Tek satışta birden fazla para birimi kullanılamaz.");
    currency = product.currency;
    const lineTotal = roundMoney(product.salePrice * quantity);
    moneyToMinor(lineTotal);
    subtotal = roundMoney(subtotal + lineTotal);
    moneyToMinor(subtotal);
    preparedItems.push({ product, quantity, lineTotal });
  }

  const requestedDiscount = Number(input.discountTotal ?? 0);
  moneyToMinor(requestedDiscount);
  const discountTotal = Math.min(subtotal, roundMoney(requestedDiscount));
  const total = roundMoney(subtotal - discountTotal);
  const paymentMethod = status === "credit" ? "" : String(input.paymentMethod ?? "cash").trim().slice(0, 80) || "cash";
  const source = String(input.source ?? "desktop").trim().slice(0, 80) || "desktop";

  database.prepare(`
    INSERT INTO commerce_sales (
      id, business_id, status, subtotal, discount_total, total, currency,
      payment_method, source, opened_at, closed_at, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
  `).run(
    saleId, businessId, status, subtotal, discountTotal, total, currency || "TRY",
    paymentMethod, source, now, now, now, now
  );

  for (const prepared of preparedItems) {
    const saleItemId = createId("sale_item_");
    database.prepare(`
      INSERT INTO commerce_sale_items (
        id, sale_id, product_id, product_name, barcode, unit_price,
        quantity, line_total, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      saleItemId,
      saleId,
      prepared.product.id,
      prepared.product.name,
      prepared.product.barcode,
      prepared.product.salePrice,
      prepared.quantity,
      prepared.lineTotal,
      now
    );

    if (inventoryEnabled && prepared.product.trackInventory) {
      applyInventoryMovementInTransaction(database, businessId, {
        productId: prepared.product.id,
        locationId,
        type: "sale",
        quantityDelta: -prepared.quantity,
        unitCost: prepared.product.purchasePrice,
        referenceType: "commerce_sale",
        referenceId: saleId,
        note: `${prepared.product.name} satışı`,
        actorSource: source
      }, now);
    }
  }
  return {
    id: saleId,
    businessId,
    status,
    subtotal,
    discountTotal,
    total,
    currency: currency || "TRY",
    paymentMethod,
    source,
    openedAt: now,
    closedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Creates the final Commerce Sale from an already accepted Order snapshot.
 * Price/name/barcode/totals come from the order snapshot; current catalog rows
 * are consulted only for inventory tracking/cost metadata.
 * Caller owns the surrounding transaction.
 */
export function createCommerceSaleFromOrderSnapshotInTransaction(
  database: DatabaseSync,
  input: CreateCommerceSaleFromOrderSnapshotInput,
  status: "paid" | "credit",
  now: string
): CommerceSaleFromOrderSnapshotResult {
  const businessId = activeBusinessId(database);
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Sipariş fulfillment için en az bir ürün gerekli.");
  }

  const currency = String(input.currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Sipariş para birimi geçersiz.");

  const subtotal = roundMoney(Number(input.subtotal));
  const discountTotal = roundMoney(Number(input.discountTotal));
  const total = roundMoney(Number(input.total));
  moneyToMinor(subtotal);
  moneyToMinor(discountTotal);
  moneyToMinor(total);
  if (subtotal < 0 || discountTotal < 0 || total < 0 || discountTotal > subtotal) {
    throw new Error("Sipariş toplamları geçersiz.");
  }
  if (roundMoney(subtotal - discountTotal) !== total) {
    throw new Error("Sipariş toplamı snapshot ile uyuşmuyor.");
  }

  const saleId = createId("sale_");
  const inventoryEnabled = isInventoryTrackingEnabled(database);
  const inventoryLocationId = inventoryEnabled
    ? resolveInventoryLocation(database, businessId, input.locationId, now)
    : "";

  const prepared = input.items.map((item) => {
    const productId = String(item.productId ?? "").trim();
    const productName = String(item.productName ?? "").trim().slice(0, 240);
    const barcode = String(item.barcode ?? "").trim().slice(0, 120);
    const unitPrice = roundMoney(Number(item.unitPrice));
    const quantity = roundQuantity(Number(item.quantity));
    const lineTotal = roundMoney(Number(item.lineTotal));
    if (!productId || !productName) throw new Error("Sipariş ürün snapshot'ı eksik.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Sipariş adedi sıfırdan büyük olmalı.");
    moneyToMinor(unitPrice);
    moneyToMinor(lineTotal);
    if (unitPrice < 0 || lineTotal < 0 || roundMoney(unitPrice * quantity) !== lineTotal) {
      throw new Error("Sipariş ürün fiyat snapshot'ı geçersiz.");
    }

    const row = getProductRow(database, businessId, productId);
    if (!row) throw new Error("Sipariş ürünlerinden biri artık bulunamadı.");
    return {
      product: mapProduct(row),
      productId,
      productName,
      barcode,
      unitPrice,
      quantity,
      lineTotal
    };
  });

  const preparedSubtotal = roundMoney(prepared.reduce((sum, item) => sum + item.lineTotal, 0));
  if (preparedSubtotal !== subtotal) {
    throw new Error("Sipariş satır toplamları snapshot ara toplamıyla uyuşmuyor.");
  }

  const paymentMethod = status === "credit"
    ? ""
    : String(input.paymentMethod ?? "").trim().slice(0, 80);
  const source = String(input.source ?? "commerce-order").trim().slice(0, 80) || "commerce-order";

  database.prepare(`
    INSERT INTO commerce_sales (
      id, business_id, status, subtotal, discount_total, total, currency,
      payment_method, source, opened_at, closed_at, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
  `).run(
    saleId, businessId, status, subtotal, discountTotal, total, currency,
    paymentMethod, source, now, now, now, now
  );

  const insertSaleItem = database.prepare(`
    INSERT INTO commerce_sale_items (
      id, sale_id, product_id, product_name, barcode, unit_price,
      quantity, line_total, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of prepared) {
    insertSaleItem.run(
      createId("sale_item_"),
      saleId,
      item.productId,
      item.productName,
      item.barcode,
      item.unitPrice,
      item.quantity,
      item.lineTotal,
      now
    );

    if (inventoryEnabled && item.product.trackInventory) {
      applyInventoryMovementInTransaction(database, businessId, {
        productId: item.productId,
        locationId: inventoryLocationId,
        type: "sale",
        quantityDelta: -item.quantity,
        unitCost: item.product.purchasePrice,
        referenceType: "commerce_sale",
        referenceId: saleId,
        note: `${item.productName} sipariş fulfillment satışı`,
        actorSource: source
      }, now);
    }
  }

  return {
    sale: {
      id: saleId,
      businessId,
      status,
      subtotal,
      discountTotal,
      total,
      currency,
      paymentMethod,
      source,
      openedAt: now,
      closedAt: now,
      createdAt: now,
      updatedAt: now
    },
    inventoryLocationId
  };
}

export function listCommerceSuppliers(
  databasePath: string,
  options: ListCommerceSuppliersOptions = {}
): CommerceSupplier[] {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const conditions = ["business_id = ?", "deleted_at = ''"];
    const params: Array<string | number> = [businessId];
    const search = String(options.search ?? "").trim();

    if (options.activeOnly) conditions.push("is_active = 1");
    if (search) {
      const pattern = `%${search}%`;
      conditions.push("(name LIKE ? COLLATE NOCASE OR phone LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE OR tax_number LIKE ? COLLATE NOCASE)");
      params.push(pattern, pattern, pattern, pattern);
    }
    params.push(normalizeLimit(options.limit));

    return (database.prepare(`
      SELECT *
      FROM commerce_suppliers
      WHERE ${conditions.join(" AND ")}
      ORDER BY is_active DESC, name COLLATE NOCASE ASC
      LIMIT ?
    `).all(...params) as Array<Record<string, unknown>>).map(mapSupplier);
  } finally {
    database.close();
  }
}

export function saveCommerceSupplier(databasePath: string, input: SaveCommerceSupplierInput): CommerceSupplier {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) throw new Error("Tedarikçi adı gerekli.");
    const id = String(input.id ?? "").trim() || createId("supplier_");
    const existing = database.prepare(`
      SELECT * FROM commerce_suppliers
      WHERE id = ? AND business_id = ? AND deleted_at = ''
      LIMIT 1
    `).get(id, businessId) as Record<string, unknown> | undefined;
    if (input.id && !existing) throw new Error("Düzenlenecek tedarikçi bulunamadı.");
    const now = new Date().toISOString();

    database.prepare(`
      INSERT INTO commerce_suppliers (
        id, business_id, name, phone, email, tax_number, notes,
        is_active, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        phone = excluded.phone,
        email = excluded.email,
        tax_number = excluded.tax_number,
        notes = excluded.notes,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at,
        deleted_at = ''
    `).run(
      id,
      businessId,
      name,
      String(input.phone ?? "").trim().slice(0, 80),
      String(input.email ?? "").trim().slice(0, 160),
      String(input.taxNumber ?? "").trim().slice(0, 80),
      String(input.notes ?? "").trim().slice(0, 2000),
      input.isActive === false ? 0 : 1,
      String(existing?.created_at ?? now),
      now
    );

    const saved = database.prepare(`
      SELECT * FROM commerce_suppliers
      WHERE id = ? AND business_id = ? AND deleted_at = ''
      LIMIT 1
    `).get(id, businessId) as Record<string, unknown> | undefined;
    if (!saved) throw new Error("Tedarikçi kaydedildi ancak yeniden okunamadı.");
    return mapSupplier(saved);
  } finally {
    database.close();
  }
}

export function getCommerceStoreSnapshot(databasePath: string): CommerceStoreSnapshot {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const products = (database.prepare(`
      SELECT * FROM catalog_products
      WHERE business_id = ? AND deleted_at = ''
      ORDER BY is_active DESC, name COLLATE NOCASE ASC
    `).all(businessId) as Array<Record<string, unknown>>).map(mapProduct);
    const suppliers = (database.prepare(`
      SELECT * FROM commerce_suppliers
      WHERE business_id = ? AND deleted_at = ''
      ORDER BY is_active DESC, name COLLATE NOCASE ASC
    `).all(businessId) as Array<Record<string, unknown>>).map(mapSupplier);
    return { products, suppliers };
  } finally {
    database.close();
  }
}
