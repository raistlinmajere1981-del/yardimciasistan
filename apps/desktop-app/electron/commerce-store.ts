import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  createId,
  normalizeBusinessType,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import { assertPersistedBusinessCapability } from "./business-capability-runtime";

export type CatalogProductUnit = "piece" | "kg" | "g" | "l" | "ml" | "meter" | "pack";
export type InventoryMovementType = "purchase" | "sale" | "waste" | "count" | "adjust" | "sale_return" | "purchase_return";

export interface CatalogCategory {
  id: string;
  businessId: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface CatalogProduct {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  sku: string;
  barcode: string;
  salePrice: number;
  purchasePrice: number;
  currency: string;
  unit: CatalogProductUnit;
  taxRate: number;
  trackInventory: boolean;
  active: boolean;
  minimumQuantity: number;
  currentQuantity: number;
}

export interface SaveCatalogProductInput {
  id?: string;
  categoryId?: string;
  name: string;
  sku?: string;
  barcode?: string;
  salePrice?: number;
  purchasePrice?: number;
  currency?: string;
  unit?: CatalogProductUnit;
  taxRate?: number;
  trackInventory?: boolean;
  isActive?: boolean;
  minimumQuantity?: number;
}

export interface InventoryBalance {
  productId: string;
  locationId: string;
  quantity: number;
  minimumQuantity: number;
}

export interface RecordInventoryMovementInput {
  productId: string;
  locationId?: string;
  type: InventoryMovementType;
  quantityDelta: number;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  note?: string;
}

export interface Supplier {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  email: string;
  taxNumber: string;
  notes: string;
  active: boolean;
}

export interface SaveSupplierInput {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  notes?: string;
  active?: boolean;
}

export interface CompleteSaleItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
}

export interface CompleteSaleInput {
  items: CompleteSaleItemInput[];
  paymentMethod?: string;
  note?: string;
  reference?: string;
}

export interface CompletedSale {
  id: string;
  businessId: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  currency: string;
  paymentMethod: string;
  itemCount: number;
  soldAt: string;
}

interface ActiveBusinessRow {
  id?: string;
  business_type?: string;
}

interface ProductRow extends Record<string, unknown> {
  id?: string;
  business_id?: string;
  category_id?: string;
  name?: string;
  sku?: string;
  barcode?: string;
  sale_price?: number;
  purchase_price?: number;
  currency?: string;
  unit?: string;
  tax_rate?: number;
  track_inventory?: number;
  is_active?: number;
  created_at?: string;
}

function openDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function getActiveBusiness(database: DatabaseSync) {
  const row = database
    .prepare("SELECT id, business_type FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1")
    .get() as ActiveBusinessRow | undefined;
  const businessId = String(row?.id ?? "").trim();
  if (!businessId) {
    throw new Error("Aktif işletme bulunamadı.");
  }
  return { businessId, businessType: normalizeBusinessType(row?.business_type) };
}

function requireCapability(databasePath: string, capability: BusinessCapability) {
  assertPersistedBusinessCapability(databasePath, capability, `Bu işlem için ${capability} yeteneği etkin olmalı.`);
}

function normalizeText(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(Math.max(0, amount) * 100) / 100;
}

function normalizeTaxRate(value: unknown) {
  const rate = Number(value ?? 0);
  if (!Number.isFinite(rate)) return 0;
  return Math.min(100, Math.max(0, Math.round(rate * 100) / 100));
}

function normalizeUnit(value: unknown): CatalogProductUnit {
  const unit = String(value ?? "piece").trim() as CatalogProductUnit;
  return ["piece", "kg", "g", "l", "ml", "meter", "pack"].includes(unit) ? unit : "piece";
}

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000;
}

function ensurePrimaryLocation(database: DatabaseSync, businessId: string, now: string) {
  const existing = database
    .prepare("SELECT id FROM inventory_locations WHERE business_id = ? AND is_primary = 1 ORDER BY created_at ASC LIMIT 1")
    .get(businessId) as { id?: string } | undefined;
  if (existing?.id) return existing.id;

  const id = createId("inventory_location_");
  database.prepare(`
    INSERT INTO inventory_locations (
      id, business_id, name, code, is_primary, is_active, created_at, updated_at
    ) VALUES (?, ?, 'Ana Stok', 'MAIN', 1, 1, ?, ?)
  `).run(id, businessId, now, now);
  return id;
}

function getProductRow(database: DatabaseSync, businessId: string, productId: string) {
  return database.prepare(`
    SELECT p.*,
           COALESCE(b.minimum_quantity, 0) AS minimum_quantity,
           COALESCE(b.quantity, 0) AS current_quantity
    FROM catalog_products p
    LEFT JOIN inventory_locations l
      ON l.business_id = p.business_id AND l.is_primary = 1
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id AND b.location_id = l.id
    WHERE p.business_id = ? AND p.id = ? AND p.deleted_at = ''
    LIMIT 1
  `).get(businessId, productId) as ProductRow | undefined;
}

function mapProduct(row: ProductRow): CatalogProduct {
  return {
    id: String(row.id ?? ""),
    businessId: String(row.business_id ?? ""),
    categoryId: String(row.category_id ?? ""),
    name: String(row.name ?? ""),
    sku: String(row.sku ?? ""),
    barcode: String(row.barcode ?? ""),
    salePrice: Number(row.sale_price ?? 0),
    purchasePrice: Number(row.purchase_price ?? 0),
    currency: String(row.currency ?? "TRY"),
    unit: normalizeUnit(row.unit),
    taxRate: Number(row.tax_rate ?? 0),
    trackInventory: Number(row.track_inventory ?? 0) === 1,
    active: Number(row.is_active ?? 0) === 1,
    minimumQuantity: Number(row.minimum_quantity ?? 0),
    currentQuantity: Number(row.current_quantity ?? 0)
  };
}

export function listCatalogProducts(databasePath: string): CatalogProduct[] {
  requireCapability(databasePath, BUSINESS_CAPABILITIES.CATALOG);
  const database = openDatabase(databasePath);
  try {
    const { businessId } = getActiveBusiness(database);
    const rows = database.prepare(`
      SELECT p.*,
             COALESCE(b.minimum_quantity, 0) AS minimum_quantity,
             COALESCE(b.quantity, 0) AS current_quantity
      FROM catalog_products p
      LEFT JOIN inventory_locations l
        ON l.business_id = p.business_id AND l.is_primary = 1
      LEFT JOIN inventory_balances b
        ON b.product_id = p.id AND b.location_id = l.id
      WHERE p.business_id = ? AND p.deleted_at = ''
      ORDER BY p.name COLLATE NOCASE, p.id
    `).all(businessId) as ProductRow[];
    return rows.map(mapProduct);
  } finally {
    database.close();
  }
}

export function saveCatalogProduct(databasePath: string, input: SaveCatalogProductInput): CatalogProduct {
  requireCapability(databasePath, BUSINESS_CAPABILITIES.CATALOG);
  const database = openDatabase(databasePath);
  try {
    const { businessId } = getActiveBusiness(database);
    const id = normalizeText(input.id, 180) || createId("product_");
    const name = normalizeText(input.name, 240);
    if (!name) throw new Error("Ürün adı gerekli.");
    const categoryId = normalizeText(input.categoryId, 180);
    const sku = normalizeText(input.sku, 120);
    const barcode = normalizeText(input.barcode, 160);
    const currency = normalizeText(input.currency || "TRY", 12).toUpperCase() || "TRY";
    const salePrice = normalizeMoney(input.salePrice);
    const purchasePrice = normalizeMoney(input.purchasePrice);
    const unit = normalizeUnit(input.unit);
    const taxRate = normalizeTaxRate(input.taxRate);
    const trackInventory = input.trackInventory !== false;
    const isActive = input.isActive !== false;
    const now = new Date().toISOString();

    const existing = database.prepare(
      "SELECT id, created_at FROM catalog_products WHERE business_id = ? AND id = ? LIMIT 1"
    ).get(businessId, id) as { id?: string; created_at?: string } | undefined;

    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        INSERT INTO catalog_products (
          id, business_id, category_id, name, sku, barcode,
          sale_price, purchase_price, currency, unit, tax_rate,
          track_inventory, is_active, created_at, updated_at, deleted_at
        ) VALUES (?, ?, NULLIF(?, ''), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
        ON CONFLICT(id) DO UPDATE SET
          category_id = excluded.category_id,
          name = excluded.name,
          sku = excluded.sku,
          barcode = excluded.barcode,
          sale_price = excluded.sale_price,
          purchase_price = excluded.purchase_price,
          currency = excluded.currency,
          unit = excluded.unit,
          tax_rate = excluded.tax_rate,
          track_inventory = excluded.track_inventory,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at,
          deleted_at = ''
      `).run(
        id, businessId, categoryId, name, sku, barcode,
        salePrice, purchasePrice, currency, unit, taxRate,
        trackInventory ? 1 : 0, isActive ? 1 : 0,
        String(existing?.created_at ?? now), now
      );

      if (trackInventory) {
        const locationId = ensurePrimaryLocation(database, businessId, now);
        const minimumQuantity = Math.max(0, roundQuantity(Number(input.minimumQuantity ?? 0)));
        database.prepare(`
          INSERT INTO inventory_balances (product_id, location_id, quantity, minimum_quantity, updated_at)
          VALUES (?, ?, 0, ?, ?)
          ON CONFLICT(product_id, location_id) DO UPDATE SET
            minimum_quantity = excluded.minimum_quantity,
            updated_at = excluded.updated_at
        `).run(id, locationId, minimumQuantity, now);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      const message = error instanceof Error ? error.message : "Ürün kaydedilemedi.";
      if (message.includes("idx_catalog_products_barcode_unique")) {
        throw new Error("Bu barkod başka bir üründe kullanılıyor.", { cause: error });
      }
      if (message.includes("idx_catalog_products_sku_unique")) {
        throw new Error("Bu stok kodu başka bir üründe kullanılıyor.", { cause: error });
      }
      throw error;
    }

    const saved = getProductRow(database, businessId, id);
    if (!saved) throw new Error("Ürün kaydedildi ancak yeniden okunamadı.");
    return mapProduct(saved);
  } finally {
    database.close();
  }
}

export function recordInventoryMovement(databasePath: string, input: RecordInventoryMovementInput): InventoryBalance {
  requireCapability(databasePath, BUSINESS_CAPABILITIES.INVENTORY);
  const database = openDatabase(databasePath);
  try {
    const { businessId } = getActiveBusiness(database);
    const productId = normalizeText(input.productId, 180);
    const quantityDelta = roundQuantity(Number(input.quantityDelta ?? 0));
    if (!productId || !Number.isFinite(quantityDelta) || quantityDelta === 0) {
      throw new Error("Geçerli ürün ve stok miktarı gerekli.");
    }
    const now = new Date().toISOString();
    const locationId = normalizeText(input.locationId, 180) || ensurePrimaryLocation(database, businessId, now);
    const product = database.prepare(`
      SELECT id, track_inventory FROM catalog_products
      WHERE business_id = ? AND id = ? AND deleted_at = '' AND is_active = 1
    `).get(businessId, productId) as { id?: string; track_inventory?: number } | undefined;
    if (!product?.id) throw new Error("Stok hareketi için aktif ürün bulunamadı.");
    if (Number(product.track_inventory ?? 0) !== 1) throw new Error("Bu ürün için stok takibi kapalı.");

    database.exec("BEGIN IMMEDIATE");
    try {
      const balance = database.prepare(`
        SELECT quantity, minimum_quantity FROM inventory_balances
        WHERE product_id = ? AND location_id = ?
      `).get(productId, locationId) as { quantity?: number; minimum_quantity?: number } | undefined;
      const nextQuantity = roundQuantity(Number(balance?.quantity ?? 0) + quantityDelta);
      if (nextQuantity < 0) throw new Error("Stok miktarı sıfırın altına düşemez.");

      database.prepare(`
        INSERT INTO inventory_balances (product_id, location_id, quantity, minimum_quantity, updated_at)
        VALUES (?, ?, ?, 0, ?)
        ON CONFLICT(product_id, location_id) DO UPDATE SET
          quantity = excluded.quantity,
          updated_at = excluded.updated_at
      `).run(productId, locationId, nextQuantity, now);

      database.prepare(`
        INSERT INTO inventory_movements (
          id, business_id, product_id, location_id, movement_type,
          quantity_delta, unit_cost, reference_type, reference_id, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        createId("inventory_movement_"), businessId, productId, locationId,
        input.type, quantityDelta, normalizeMoney(input.unitCost),
        normalizeText(input.referenceType, 100), normalizeText(input.referenceId, 180),
        normalizeText(input.note, 500), now
      );
      database.exec("COMMIT");
      return { productId, locationId, quantity: nextQuantity, minimumQuantity: Number(balance?.minimum_quantity ?? 0) };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

export function saveSupplier(databasePath: string, input: SaveSupplierInput): Supplier {
  requireCapability(databasePath, BUSINESS_CAPABILITIES.RETAIL_SUPPLIERS);
  const database = openDatabase(databasePath);
  try {
    const { businessId } = getActiveBusiness(database);
    const id = normalizeText(input.id, 180) || createId("supplier_");
    const name = normalizeText(input.name, 240);
    if (!name) throw new Error("Tedarikçi adı gerekli.");
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO suppliers (
        id, business_id, name, phone, email, tax_number, notes, is_active, created_at, updated_at, deleted_at
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
      id, businessId, name,
      normalizeText(input.phone, 80), normalizeText(input.email, 200),
      normalizeText(input.taxNumber, 80), normalizeText(input.notes, 800),
      input.active === false ? 0 : 1, now, now
    );
    const row = database.prepare(`
      SELECT * FROM suppliers WHERE business_id = ? AND id = ? AND deleted_at = '' LIMIT 1
    `).get(businessId, id) as Record<string, unknown> | undefined;
    if (!row) throw new Error("Tedarikçi kaydedildi ancak yeniden okunamadı.");
    return {
      id: String(row.id ?? ""),
      businessId: String(row.business_id ?? ""),
      name: String(row.name ?? ""),
      phone: String(row.phone ?? ""),
      email: String(row.email ?? ""),
      taxNumber: String(row.tax_number ?? ""),
      notes: String(row.notes ?? ""),
      active: Number(row.is_active ?? 0) === 1
    };
  } finally {
    database.close();
  }
}

export function completeSale(databasePath: string, input: CompleteSaleInput): CompletedSale {
  requireCapability(databasePath, BUSINESS_CAPABILITIES.SALES);
  requireCapability(databasePath, BUSINESS_CAPABILITIES.CATALOG);
  const database = openDatabase(databasePath);
  try {
    const { businessId } = getActiveBusiness(database);
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error("Satış için en az bir ürün gerekli.");
    }
    const now = new Date().toISOString();
    const saleId = createId("sale_");
    const locationId = ensurePrimaryLocation(database, businessId, now);
    const rows: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      trackInventory: boolean;
    }> = [];
    let currency = "TRY";

    database.exec("BEGIN IMMEDIATE");
    try {
      for (const item of input.items) {
        const productId = normalizeText(item.productId, 180);
        const quantity = Math.max(0, roundQuantity(Number(item.quantity ?? 0)));
        if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("Satış ürünlerinde geçerli miktar gerekli.");
        }
        const product = database.prepare(`
          SELECT id, sale_price, currency, track_inventory FROM catalog_products
          WHERE business_id = ? AND id = ? AND deleted_at = '' AND is_active = 1
        `).get(businessId, productId) as {
          id?: string;
          sale_price?: number;
          currency?: string;
          track_inventory?: number;
        } | undefined;
        if (!product?.id) throw new Error("Satıştaki ürünlerden biri bulunamadı veya pasif.");
        const unitPrice = item.unitPrice === undefined ? Number(product.sale_price ?? 0) : normalizeMoney(item.unitPrice);
        if (rows.length === 0) currency = String(product.currency ?? "TRY");
        if (String(product.currency ?? "TRY") !== currency) {
          throw new Error("Tek satış içinde birden fazla para birimi kullanılamaz.");
        }
        const trackInventory = Number(product.track_inventory ?? 0) === 1;
        if (trackInventory) {
          const balance = database.prepare(`
            SELECT quantity FROM inventory_balances WHERE product_id = ? AND location_id = ?
          `).get(productId, locationId) as { quantity?: number } | undefined;
          const current = Number(balance?.quantity ?? 0);
          if (current < quantity) throw new Error("Yetersiz stok: satış tamamlanamadı.");
        }
        rows.push({
          productId,
          quantity,
          unitPrice,
          lineTotal: normalizeMoney(unitPrice * quantity),
          trackInventory
        });
      }

      const total = normalizeMoney(rows.reduce((sum, row) => sum + row.lineTotal, 0));
      database.prepare(`
        INSERT INTO sales (
          id, business_id, status, subtotal, discount_total, total, currency,
          payment_method, note, reference, sold_at, created_at, updated_at
        ) VALUES (?, ?, 'completed', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId, businessId, total, total, currency,
        normalizeText(input.paymentMethod || "cash", 80), normalizeText(input.note, 500),
        normalizeText(input.reference, 180), now, now, now
      );

      rows.forEach((row) => {
        database.prepare(`
          INSERT INTO sale_items (
            id, sale_id, product_id, quantity, unit_price, discount_total, line_total, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
        `).run(createId("sale_item_"), saleId, row.productId, row.quantity, row.unitPrice, row.lineTotal, now);
        if (!row.trackInventory) return;
        const balance = database.prepare(`
          SELECT quantity, minimum_quantity FROM inventory_balances
          WHERE product_id = ? AND location_id = ?
        `).get(row.productId, locationId) as { quantity?: number; minimum_quantity?: number } | undefined;
        const nextQuantity = roundQuantity(Number(balance?.quantity ?? 0) - row.quantity);
        database.prepare(`
          UPDATE inventory_balances SET quantity = ?, updated_at = ?
          WHERE product_id = ? AND location_id = ?
        `).run(nextQuantity, now, row.productId, locationId);
        database.prepare(`
          INSERT INTO inventory_movements (
            id, business_id, product_id, location_id, movement_type,
            quantity_delta, unit_cost, reference_type, reference_id, note, created_at
          ) VALUES (?, ?, ?, ?, 'sale', ?, ?, 'sale', ?, '', ?)
        `).run(
          createId("inventory_movement_"), businessId, row.productId, locationId,
          -row.quantity, row.unitPrice, saleId, now
        );
      });
      database.exec("COMMIT");
      return {
        id: saleId,
        businessId,
        subtotal: total,
        discountTotal: 0,
        total,
        currency,
        paymentMethod: normalizeText(input.paymentMethod || "cash", 80),
        itemCount: rows.reduce((sum, row) => sum + row.quantity, 0),
        soldAt: now
      };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}
