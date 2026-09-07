import { DatabaseSync } from "node:sqlite";
import {
  createId,
  type CatalogProductDraft,
  type CommerceSaleDraft,
  type CommerceSaleDraftDetail,
  type CommerceSaleDraftItem,
  type CommerceUnit,
  type MarketDraftStatus
} from "@yardimci-asistan/shared";

const COMMERCE_UNITS = new Set<CommerceUnit>([
  "piece", "kg", "g", "l", "ml", "pack", "box", "meter", "other"
]);
const DRAFT_STATUSES = new Set<MarketDraftStatus>(["pending", "reviewed"]);

export interface CreateMarketProductDraftInput {
  barcode: string;
  proposedName: string;
  sku?: string;
  proposedCategory?: string;
  proposedPurchasePrice?: number;
  proposedSalePrice?: number;
  currency?: string;
  unit?: CommerceUnit | string;
  note?: string;
  source?: string;
  createdByDevice?: string;
}

export interface ListMarketProductDraftsOptions {
  status?: MarketDraftStatus;
  limit?: number;
}

export interface CreateMarketCartDraftInput {
  lines: Array<{
    productId: string;
    quantity: number;
  }>;
  note?: string;
  source?: string;
  createdByDevice?: string;
}

export interface ListMarketCartDraftsOptions {
  status?: MarketDraftStatus;
  limit?: number;
}

function openDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function activeBusinessId(database: DatabaseSync): string {
  const row = database.prepare(`
    SELECT id
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown } | undefined;
  const businessId = text(row?.id);
  if (!businessId) throw new Error("Aktif işletme bulunamadı.");
  return businessId;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function limitedText(value: unknown, maximum: number): string {
  const normalized = text(value);
  if (normalized.length > maximum) {
    throw new Error(`Metin en fazla ${maximum} karakter olabilir.`);
  }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(normalized)) {
    throw new Error("Metin geçersiz kontrol karakterleri içeriyor.");
  }
  return normalized;
}

function roundMoney(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("Taslak fiyatı 0 veya daha büyük olmalı.");
  }
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Sepet taslağı miktarı sıfırdan büyük olmalı.");
  }
  return Math.round((numeric + Number.EPSILON) * 10000) / 10000;
}

function normalizeCurrency(value: unknown): string {
  const currency = text(value || "TRY").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Taslak para birimi geçersiz.");
  return currency;
}

function normalizeUnit(value: unknown): CommerceUnit {
  const unit = text(value || "piece") as CommerceUnit;
  if (!COMMERCE_UNITS.has(unit)) throw new Error("Taslak ürün birimi geçersiz.");
  return unit;
}

function normalizeLimit(value: unknown, fallback = 100, maximum = 300): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(numeric)));
}

function normalizeStatus(value: unknown): MarketDraftStatus | "" {
  if (value === undefined || value === null || value === "") return "";
  const status = text(value) as MarketDraftStatus;
  if (!DRAFT_STATUSES.has(status)) throw new Error("Taslak durumu geçersiz.");
  return status;
}

function mapProductDraft(row: Record<string, unknown>): CatalogProductDraft {
  return {
    id: text(row.id),
    businessId: text(row.business_id),
    barcode: text(row.barcode),
    proposedName: text(row.proposed_name),
    sku: text(row.sku),
    proposedCategory: text(row.proposed_category),
    proposedPurchasePrice: Number(row.proposed_purchase_price ?? 0),
    proposedSalePrice: Number(row.proposed_sale_price ?? 0),
    currency: text(row.currency) || "TRY",
    unit: normalizeUnit(row.unit),
    note: text(row.note),
    source: text(row.source),
    createdByDevice: text(row.created_by_device),
    status: normalizeStatus(row.status) || "pending",
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  };
}

function mapCartDraft(row: Record<string, unknown>): CommerceSaleDraft {
  return {
    id: text(row.id),
    businessId: text(row.business_id),
    status: normalizeStatus(row.status) || "pending",
    source: text(row.source),
    createdByDevice: text(row.created_by_device),
    note: text(row.note),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  };
}

function mapCartDraftItem(row: Record<string, unknown>): CommerceSaleDraftItem {
  return {
    id: text(row.id),
    draftId: text(row.draft_id),
    productId: text(row.product_id),
    productName: text(row.product_name),
    quantity: Number(row.quantity ?? 0),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  };
}

export function createMarketProductDraftInTransaction(
  database: DatabaseSync,
  input: CreateMarketProductDraftInput,
  now: string
): CatalogProductDraft {
  const businessId = activeBusinessId(database);
  const barcode = limitedText(input.barcode, 120);
  const proposedName = limitedText(input.proposedName, 240);
  if (barcode.length < 3) throw new Error("Ürün taslağı için geçerli bir barkod gerekli.");
  if (!proposedName) throw new Error("Ürün taslağı için önerilen ad gerekli.");

  const existingProduct = database.prepare(`
    SELECT id
    FROM catalog_products
    WHERE business_id = ? AND barcode = ? AND deleted_at = ''
    LIMIT 1
  `).get(businessId, barcode);
  if (existingProduct) throw new Error("Bu barkod zaten gerçek bir katalog ürününe ait.");

  const draft: CatalogProductDraft = {
    id: createId("catalog_product_draft_"),
    businessId,
    barcode,
    proposedName,
    sku: limitedText(input.sku, 120),
    proposedCategory: limitedText(input.proposedCategory, 180),
    proposedPurchasePrice: roundMoney(input.proposedPurchasePrice),
    proposedSalePrice: roundMoney(input.proposedSalePrice),
    currency: normalizeCurrency(input.currency),
    unit: normalizeUnit(input.unit),
    note: limitedText(input.note, 2000),
    source: limitedText(input.source || "desktop", 80) || "desktop",
    createdByDevice: limitedText(input.createdByDevice, 120),
    status: "pending",
    createdAt: now,
    updatedAt: now
  };

  database.prepare(`
    INSERT INTO catalog_product_drafts (
      id, business_id, barcode, proposed_name, sku, proposed_category,
      proposed_purchase_price, proposed_sale_price, currency, unit, note,
      source, created_by_device, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    draft.id,
    draft.businessId,
    draft.barcode,
    draft.proposedName,
    draft.sku,
    draft.proposedCategory,
    draft.proposedPurchasePrice,
    draft.proposedSalePrice,
    draft.currency,
    draft.unit,
    draft.note,
    draft.source,
    draft.createdByDevice,
    draft.createdAt,
    draft.updatedAt
  );
  return draft;
}

export function createMarketProductDraftRecord(
  databasePath: string,
  input: CreateMarketProductDraftInput
): CatalogProductDraft {
  const database = openDatabase(databasePath);
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const draft = createMarketProductDraftInTransaction(database, input, new Date().toISOString());
      database.exec("COMMIT");
      return draft;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

export function listMarketProductDraftRecords(
  databasePath: string,
  options: ListMarketProductDraftsOptions = {}
): CatalogProductDraft[] {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const status = normalizeStatus(options.status);
    const conditions = ["business_id = ?"];
    const parameters: Array<string | number> = [businessId];
    if (status) {
      conditions.push("status = ?");
      parameters.push(status);
    }
    parameters.push(normalizeLimit(options.limit));
    return (database.prepare(`
      SELECT *
      FROM catalog_product_drafts
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...parameters) as Array<Record<string, unknown>>).map(mapProductDraft);
  } finally {
    database.close();
  }
}

export function createMarketCartDraftInTransaction(
  database: DatabaseSync,
  input: CreateMarketCartDraftInput,
  now: string
): CommerceSaleDraftDetail {
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error("Sepet taslağı için en az bir ürün gerekli.");
  }
  if (input.lines.length > 200) throw new Error("Sepet taslağı en fazla 200 satır içerebilir.");

  const businessId = activeBusinessId(database);
  const seenProductIds = new Set<string>();
  const preparedLines: Array<{ productId: string; productName: string; quantity: number }> = [];
  for (const line of input.lines) {
    const productId = limitedText(line?.productId, 220);
    if (!productId) throw new Error("Sepet taslağı ürün kimliği gerekli.");
    if (seenProductIds.has(productId)) throw new Error("Aynı ürün sepet taslağında yalnız bir kez bulunabilir.");
    seenProductIds.add(productId);
    const product = database.prepare(`
      SELECT id, name
      FROM catalog_products
      WHERE id = ? AND business_id = ? AND is_active = 1 AND deleted_at = ''
      LIMIT 1
    `).get(productId, businessId) as { id?: unknown; name?: unknown } | undefined;
    if (!product?.id) throw new Error("Sepet taslağı ürünlerinden biri aktif değil veya bulunamadı.");
    preparedLines.push({
      productId,
      productName: text(product.name),
      quantity: roundQuantity(line.quantity)
    });
  }

  const draft: CommerceSaleDraft = {
    id: createId("commerce_cart_draft_"),
    businessId,
    status: "pending",
    source: limitedText(input.source || "desktop", 80) || "desktop",
    createdByDevice: limitedText(input.createdByDevice, 120),
    note: limitedText(input.note, 2000),
    createdAt: now,
    updatedAt: now
  };
  database.prepare(`
    INSERT INTO commerce_sale_drafts (
      id, business_id, status, source, created_by_device, note, created_at, updated_at
    ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(
    draft.id,
    draft.businessId,
    draft.source,
    draft.createdByDevice,
    draft.note,
    draft.createdAt,
    draft.updatedAt
  );

  const insertLine = database.prepare(`
    INSERT INTO commerce_sale_draft_items (
      id, draft_id, product_id, product_name, quantity, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const items = preparedLines.map((line): CommerceSaleDraftItem => {
    const item: CommerceSaleDraftItem = {
      id: createId("commerce_cart_draft_item_"),
      draftId: draft.id,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      createdAt: now,
      updatedAt: now
    };
    insertLine.run(
      item.id,
      item.draftId,
      item.productId,
      item.productName,
      item.quantity,
      item.createdAt,
      item.updatedAt
    );
    return item;
  });
  return { draft, items };
}

export function createMarketCartDraftRecord(
  databasePath: string,
  input: CreateMarketCartDraftInput
): CommerceSaleDraftDetail {
  const database = openDatabase(databasePath);
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const draft = createMarketCartDraftInTransaction(database, input, new Date().toISOString());
      database.exec("COMMIT");
      return draft;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

function getMarketCartDraftRecordInDatabase(
  database: DatabaseSync,
  businessId: string,
  draftId: string
): CommerceSaleDraftDetail | null {
  const draftRow = database.prepare(`
    SELECT *
    FROM commerce_sale_drafts
    WHERE id = ? AND business_id = ?
    LIMIT 1
  `).get(draftId, businessId) as Record<string, unknown> | undefined;
  if (!draftRow) return null;
  const items = (database.prepare(`
    SELECT *
    FROM commerce_sale_draft_items
    WHERE draft_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(draftId) as Array<Record<string, unknown>>).map(mapCartDraftItem);
  return { draft: mapCartDraft(draftRow), items };
}

export function getMarketCartDraftRecord(
  databasePath: string,
  draftIdInput: string
): CommerceSaleDraftDetail | null {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const draftId = limitedText(draftIdInput, 220);
    if (!draftId) throw new Error("Sepet taslağı kimliği gerekli.");
    return getMarketCartDraftRecordInDatabase(database, businessId, draftId);
  } finally {
    database.close();
  }
}

export function listMarketCartDraftRecords(
  databasePath: string,
  options: ListMarketCartDraftsOptions = {}
): CommerceSaleDraftDetail[] {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const status = normalizeStatus(options.status);
    const conditions = ["business_id = ?"];
    const parameters: Array<string | number> = [businessId];
    if (status) {
      conditions.push("status = ?");
      parameters.push(status);
    }
    parameters.push(normalizeLimit(options.limit));
    const draftIds = (database.prepare(`
      SELECT id
      FROM commerce_sale_drafts
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...parameters) as Array<{ id?: unknown }>).map((row) => text(row.id));
    return draftIds.flatMap((draftId) => {
      const detail = getMarketCartDraftRecordInDatabase(database, businessId, draftId);
      return detail ? [detail] : [];
    });
  } finally {
    database.close();
  }
}
