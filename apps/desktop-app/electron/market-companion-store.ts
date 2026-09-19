import { DatabaseSync } from "node:sqlite";
import {
  createId,
  type CatalogProduct,
  type CommerceSaleDraft,
  type CommerceSaleDraftDetail,
  type CommerceSaleDraftItem,
  type CommerceUnit,
  type MarketBarcodeScanEvent,
  type MarketCartDraftLoadResult,
  type MarketDraftStatus
} from "@yardimci-asistan/shared";

const COMMERCE_UNITS = new Set<CommerceUnit>([
  "piece", "kg", "g", "l", "ml", "pack", "box", "meter", "other"
]);
const DRAFT_STATUSES = new Set<MarketDraftStatus>(["pending", "reviewed"]);

const MARKET_BARCODE_SCAN_TTL_MS = 60_000;
const MARKET_BARCODE_SCAN_FUTURE_TOLERANCE_MS = 30_000;

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

export interface CreateMarketBarcodeScanEventInput {
  androidActionId: string;
  deviceId: string;
  barcode: string;
  scannedAt: string;
}

export interface ConsumePendingMarketBarcodeScansOptions {
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

function mapBarcodeScanEvent(row: Record<string, unknown>): MarketBarcodeScanEvent {
  const rawStatus = text(row.status);
  const status = rawStatus === "consumed" || rawStatus === "expired" ? rawStatus : "pending";
  return {
    id: text(row.id),
    businessId: text(row.business_id),
    androidActionId: text(row.android_action_id),
    deviceId: text(row.device_id),
    barcode: text(row.barcode),
    scannedAt: text(row.scanned_at),
    receivedAt: text(row.received_at),
    consumedAt: text(row.consumed_at),
    status
  };
}

function mapResolvedCatalogProduct(row: Record<string, unknown>): CatalogProduct | null {
  const id = text(row.product_id_current);
  if (!id) return null;
  return {
    id,
    businessId: text(row.product_business_id),
    categoryId: text(row.product_category_id),
    name: text(row.product_name_current),
    sku: text(row.product_sku),
    barcode: text(row.product_barcode),
    description: text(row.product_description),
    salePrice: Number(row.product_sale_price ?? 0),
    purchasePrice: Number(row.product_purchase_price ?? 0),
    currency: normalizeCurrency(row.product_currency),
    unit: normalizeUnit(row.product_unit),
    taxRate: Number(row.product_tax_rate ?? 0),
    trackInventory: Number(row.product_track_inventory ?? 0) === 1,
    isActive: Number(row.product_is_active ?? 0) === 1,
    createdAt: text(row.product_created_at),
    updatedAt: text(row.product_updated_at)
  };
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

export function markMarketCartDraftReviewedRecord(
  databasePath: string,
  draftIdInput: string
): CommerceSaleDraft {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const draftId = limitedText(draftIdInput, 220);
    if (!draftId) throw new Error("Sepet taslağı kimliği gerekli.");

    database.exec("BEGIN IMMEDIATE");
    try {
      const current = database.prepare(`
        SELECT *
        FROM commerce_sale_drafts
        WHERE id = ? AND business_id = ?
        LIMIT 1
      `).get(draftId, businessId) as Record<string, unknown> | undefined;
      if (!current) throw new Error("Sepet taslağı aktif işletmede bulunamadı.");
      const draft = mapCartDraft(current);
      if (draft.status === "reviewed") {
        database.exec("COMMIT");
        return draft;
      }

      const now = new Date().toISOString();
      database.prepare(`
        UPDATE commerce_sale_drafts
        SET status = 'reviewed', updated_at = ?
        WHERE id = ? AND business_id = ? AND status = 'pending'
      `).run(now, draftId, businessId);
      const reviewed = database.prepare(`
        SELECT *
        FROM commerce_sale_drafts
        WHERE id = ? AND business_id = ?
        LIMIT 1
      `).get(draftId, businessId) as Record<string, unknown> | undefined;
      if (!reviewed || mapCartDraft(reviewed).status !== "reviewed") {
        throw new Error("Sepet taslağı kapatılamadı.");
      }
      database.exec("COMMIT");
      return mapCartDraft(reviewed);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

/**
 * Resolve a phone cart against the current active catalog without creating a
 * sale or any financial/inventory mutation. Android names and future price
 * snapshots remain diagnostic only.
 */
export function loadMarketCartDraftForQuickSaleRecord(
  databasePath: string,
  draftIdInput: string
): MarketCartDraftLoadResult {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const draftId = limitedText(draftIdInput, 220);
    if (!draftId) throw new Error("Sepet taslağı kimliği gerekli.");
    const detail = getMarketCartDraftRecordInDatabase(database, businessId, draftId);
    if (!detail) throw new Error("Sepet taslağı aktif işletmede bulunamadı.");
    if (detail.draft.status !== "pending") {
      throw new Error("Sepet taslağı daha önce kapatılmış.");
    }

    const rows = database.prepare(`
      SELECT
        draft_item.id AS draft_item_id,
        draft_item.product_id AS draft_product_id,
        draft_item.product_name AS draft_product_name,
        draft_item.quantity AS draft_quantity,
        product.id AS product_id_current,
        product.business_id AS product_business_id,
        product.category_id AS product_category_id,
        product.name AS product_name_current,
        product.sku AS product_sku,
        product.barcode AS product_barcode,
        product.description AS product_description,
        product.sale_price AS product_sale_price,
        product.purchase_price AS product_purchase_price,
        product.currency AS product_currency,
        product.unit AS product_unit,
        product.tax_rate AS product_tax_rate,
        product.track_inventory AS product_track_inventory,
        product.is_active AS product_is_active,
        product.created_at AS product_created_at,
        product.updated_at AS product_updated_at
      FROM commerce_sale_draft_items AS draft_item
      LEFT JOIN catalog_products AS product
        ON product.id = draft_item.product_id
       AND product.business_id = ?
       AND product.is_active = 1
       AND product.deleted_at = ''
      WHERE draft_item.draft_id = ?
      ORDER BY draft_item.created_at ASC, draft_item.id ASC
    `).all(businessId, draftId) as Array<Record<string, unknown>>;

    const result: MarketCartDraftLoadResult = {
      draft: detail.draft,
      items: [],
      skippedItems: []
    };
    for (const row of rows) {
      const product = mapResolvedCatalogProduct(row);
      const quantity = Number(row.draft_quantity ?? 0);
      if (product) {
        result.items.push({
          draftItemId: text(row.draft_item_id),
          product,
          quantity
        });
      } else {
        result.skippedItems.push({
          draftItemId: text(row.draft_item_id),
          productId: text(row.draft_product_id),
          productName: text(row.draft_product_name) || "Ürün",
          quantity,
          reason: "missing_or_inactive"
        });
      }
    }
    return result;
  } finally {
    database.close();
  }
}

/**
 * Called inside the Android action/receipt transaction. A stale scan is a
 * successful no-op so its receipt is committed and transport retries stop.
 */
export function createMarketBarcodeScanEventInTransaction(
  database: DatabaseSync,
  input: CreateMarketBarcodeScanEventInput,
  receivedAt: string
): MarketBarcodeScanEvent | null {
  const businessId = activeBusinessId(database);
  const androidActionId = limitedText(input.androidActionId, 220);
  const deviceId = limitedText(input.deviceId, 120);
  const barcode = limitedText(input.barcode, 120);
  const scannedAtMs = Date.parse(text(input.scannedAt));
  const receivedAtMs = Date.parse(receivedAt);
  if (!androidActionId || !deviceId) throw new Error("Barkod taraması cihaz bilgisi eksik.");
  if (barcode.length < 3) throw new Error("Barkod taraması için geçerli bir barkod gerekli.");
  if (!Number.isFinite(scannedAtMs) || !Number.isFinite(receivedAtMs)) {
    throw new Error("Barkod tarama zamanı geçersiz.");
  }
  if (scannedAtMs > receivedAtMs + MARKET_BARCODE_SCAN_FUTURE_TOLERANCE_MS) {
    throw new Error("Barkod tarama zamanı cihaz saatiyle uyumsuz.");
  }
  if (receivedAtMs - scannedAtMs > MARKET_BARCODE_SCAN_TTL_MS) {
    return null;
  }

  const event: MarketBarcodeScanEvent = {
    id: createId("market_barcode_scan_"),
    businessId,
    androidActionId,
    deviceId,
    barcode,
    scannedAt: new Date(scannedAtMs).toISOString(),
    receivedAt: new Date(receivedAtMs).toISOString(),
    consumedAt: "",
    status: "pending"
  };
  database.prepare(`
    INSERT INTO market_barcode_scan_events (
      id, business_id, android_action_id, device_id, barcode,
      scanned_at, received_at, consumed_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '', 'pending')
  `).run(
    event.id,
    event.businessId,
    event.androidActionId,
    event.deviceId,
    event.barcode,
    event.scannedAt,
    event.receivedAt
  );
  return event;
}

/** Atomically claims fresh scans once and expires anything that waited too long. */
export function consumePendingMarketBarcodeScanRecords(
  databasePath: string,
  options: ConsumePendingMarketBarcodeScansOptions = {}
): MarketBarcodeScanEvent[] {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const limit = normalizeLimit(options.limit, 100, 300);
    const now = new Date();
    const consumedAt = now.toISOString();
    const cutoff = new Date(now.getTime() - MARKET_BARCODE_SCAN_TTL_MS).toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        UPDATE market_barcode_scan_events
        SET status = 'expired', consumed_at = ?
        WHERE business_id = ? AND status = 'pending' AND scanned_at < ?
      `).run(consumedAt, businessId, cutoff);

      const rows = database.prepare(`
        SELECT *
        FROM market_barcode_scan_events
        WHERE business_id = ? AND status = 'pending' AND scanned_at >= ?
        ORDER BY received_at ASC, id ASC
        LIMIT ?
      `).all(businessId, cutoff, limit) as Array<Record<string, unknown>>;
      const markConsumed = database.prepare(`
        UPDATE market_barcode_scan_events
        SET status = 'consumed', consumed_at = ?
        WHERE id = ? AND business_id = ? AND status = 'pending'
      `);
      for (const row of rows) {
        markConsumed.run(consumedAt, text(row.id), businessId);
      }
      database.exec("COMMIT");
      return rows.map((row) => mapBarcodeScanEvent({
        ...row,
        status: "consumed",
        consumed_at: consumedAt
      }));
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}
