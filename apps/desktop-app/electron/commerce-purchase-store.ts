import { DatabaseSync } from "node:sqlite";
import {
  createId,
  type CommercePurchaseOrder,
  type CommercePurchaseOrderDetail,
  type CommercePurchaseOrderItem,
  type CommercePurchaseOrderStatus
} from "@yardimci-asistan/shared";

const PURCHASE_ORDER_STATUSES = new Set<CommercePurchaseOrderStatus>([
  "draft", "ordered", "received", "cancelled"
]);

export interface ListCommercePurchaseOrdersOptions {
  supplierId?: string;
  status?: CommercePurchaseOrderStatus;
  limit?: number;
}

export interface ReceiveCommercePurchaseInput {
  supplierId?: string;
  locationId?: string;
  orderedAt?: string;
  notes?: string;
  source?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitCost: number;
  }>;
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

function normalizeLimit(value: unknown, fallback = 100, maximum = 500) {
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

function normalizeIsoTimestamp(value: unknown, fallback: string, label: string) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} geçersiz.`);
  return new Date(timestamp).toISOString();
}

function mapPurchaseOrder(row: Record<string, unknown>): CommercePurchaseOrder {
  return {
    id: String(row.id ?? ""),
    businessId: String(row.business_id ?? ""),
    supplierId: String(row.supplier_id ?? ""),
    status: String(row.status ?? "draft") as CommercePurchaseOrderStatus,
    orderedAt: String(row.ordered_at ?? ""),
    receivedAt: String(row.received_at ?? ""),
    subtotal: roundMoney(Number(row.subtotal ?? 0)),
    total: roundMoney(Number(row.total ?? 0)),
    currency: String(row.currency ?? "TRY"),
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapPurchaseOrderItem(row: Record<string, unknown>): CommercePurchaseOrderItem {
  return {
    id: String(row.id ?? ""),
    purchaseOrderId: String(row.purchase_order_id ?? ""),
    productId: String(row.product_id ?? ""),
    productName: String(row.product_name ?? ""),
    quantity: roundQuantity(Number(row.quantity ?? 0)),
    unitCost: Math.max(0, roundMoney(Number(row.unit_cost ?? 0))),
    lineTotal: Math.max(0, roundMoney(Number(row.line_total ?? 0))),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function ensurePrimaryLocation(database: DatabaseSync, businessId: string, now: string) {
  const existing = database.prepare(`
    SELECT id
    FROM inventory_locations
    WHERE business_id = ? AND is_primary = 1 AND is_active = 1 AND deleted_at = ''
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

function resolveInventoryLocation(
  database: DatabaseSync,
  businessId: string,
  locationIdInput: string | undefined,
  now: string
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

function applyPurchaseStockIn(
  database: DatabaseSync,
  input: {
    businessId: string;
    locationId: string;
    purchaseOrderId: string;
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    source: string;
    now: string;
  }
) {
  const current = database.prepare(`
    SELECT quantity, minimum_quantity
    FROM inventory_balances
    WHERE product_id = ? AND location_id = ?
  `).get(input.productId, input.locationId) as Record<string, unknown> | undefined;

  const quantityBefore = roundQuantity(Number(current?.quantity ?? 0));
  const quantityAfter = roundQuantity(quantityBefore + input.quantity);
  const minimumQuantity = Math.max(0, roundQuantity(Number(current?.minimum_quantity ?? 0)));

  database.prepare(`
    INSERT INTO inventory_balances (product_id, location_id, quantity, minimum_quantity, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(product_id, location_id) DO UPDATE SET
      quantity = excluded.quantity,
      updated_at = excluded.updated_at
  `).run(input.productId, input.locationId, quantityAfter, minimumQuantity, input.now);

  database.prepare(`
    INSERT INTO inventory_movements (
      id, business_id, product_id, location_id, movement_type,
      quantity_delta, quantity_after, unit_cost, reference_type, reference_id,
      note, actor_source, created_at
    ) VALUES (?, ?, ?, ?, 'purchase', ?, ?, ?, 'purchase_order', ?, ?, ?, ?)
  `).run(
    createId("inventory_movement_"),
    input.businessId,
    input.productId,
    input.locationId,
    input.quantity,
    quantityAfter,
    input.unitCost,
    input.purchaseOrderId,
    `${input.productName} alımı`,
    input.source,
    input.now
  );
}

export function listCommercePurchaseOrders(
  databasePath: string,
  options: ListCommercePurchaseOrdersOptions = {}
): CommercePurchaseOrder[] {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const conditions = ["business_id = ?", "deleted_at = ''"];
    const params: Array<string | number> = [businessId];
    const supplierId = String(options.supplierId ?? "").trim();

    if (supplierId) {
      conditions.push("supplier_id = ?");
      params.push(supplierId);
    }
    if (options.status !== undefined) {
      if (!PURCHASE_ORDER_STATUSES.has(options.status)) {
        throw new Error(`Geçersiz satın alma durumu: ${options.status}`);
      }
      conditions.push("status = ?");
      params.push(options.status);
    }
    params.push(normalizeLimit(options.limit));

    return (database.prepare(`
      SELECT *
      FROM purchase_orders
      WHERE ${conditions.join(" AND ")}
      ORDER BY
        CASE WHEN received_at <> '' THEN received_at ELSE created_at END DESC,
        id DESC
      LIMIT ?
    `).all(...params) as Array<Record<string, unknown>>).map(mapPurchaseOrder);
  } finally {
    database.close();
  }
}

export function getCommercePurchaseOrder(
  databasePath: string,
  purchaseOrderIdInput: string
): CommercePurchaseOrderDetail | null {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const purchaseOrderId = String(purchaseOrderIdInput ?? "").trim();
    if (!purchaseOrderId) throw new Error("Satın alma kaydı kimliği gerekli.");

    const orderRow = database.prepare(`
      SELECT *
      FROM purchase_orders
      WHERE id = ? AND business_id = ? AND deleted_at = ''
      LIMIT 1
    `).get(purchaseOrderId, businessId) as Record<string, unknown> | undefined;
    if (!orderRow) return null;

    const items = (database.prepare(`
      SELECT *
      FROM purchase_order_items
      WHERE purchase_order_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(purchaseOrderId) as Array<Record<string, unknown>>).map(mapPurchaseOrderItem);

    return { order: mapPurchaseOrder(orderRow), items };
  } finally {
    database.close();
  }
}

export function receiveCommercePurchase(
  databasePath: string,
  input: ReceiveCommercePurchaseInput
): CommercePurchaseOrderDetail {
  const database = openDatabase(databasePath);
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = receiveCommercePurchaseInTransaction(database, input, new Date().toISOString());
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
 * Transaction-aware receiving primitive. The Android receipt, purchase rows,
 * and inventory movements are committed or rolled back together.
 */
export function receiveCommercePurchaseInTransaction(
  database: DatabaseSync,
  input: ReceiveCommercePurchaseInput,
  now: string
): CommercePurchaseOrderDetail {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Satın alma için en az bir ürün gerekli.");
  }

  const businessId = activeBusinessId(database);
  const purchaseOrderId = createId("purchase_order_");
  const supplierId = String(input.supplierId ?? "").trim();
  const notes = String(input.notes ?? "").trim().slice(0, 2000);
  const source = String(input.source ?? "desktop").trim().slice(0, 80) || "desktop";
  const orderedAt = normalizeIsoTimestamp(input.orderedAt, now, "Sipariş tarihi");

  if (supplierId) {
    const supplier = database.prepare(`
      SELECT id
      FROM commerce_suppliers
      WHERE id = ? AND business_id = ? AND is_active = 1 AND deleted_at = ''
      LIMIT 1
    `).get(supplierId, businessId) as { id?: unknown } | undefined;
    if (!supplier?.id) throw new Error("Seçilen tedarikçi bulunamadı veya aktif değil.");
  }

  const locationId = resolveInventoryLocation(database, businessId, input.locationId, now);
  const seenProductIds = new Set<string>();
  let currency = "";
  let subtotal = 0;
  const preparedItems: Array<{
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    lineTotal: number;
  }> = [];

  for (const item of input.items) {
    const productId = String(item.productId ?? "").trim();
    if (!productId) throw new Error("Satın alma ürün kimliği gerekli.");
    if (seenProductIds.has(productId)) {
      throw new Error("Aynı ürün satın alma kaydında yalnız bir kez bulunabilir.");
    }
    seenProductIds.add(productId);

    const quantity = roundQuantity(Number(item.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Satın alma adedi sıfırdan büyük olmalı.");
    }
    const unitCost = roundMoney(Number(item.unitCost));
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error("Satın alma birim maliyeti 0 veya daha büyük olmalı.");
    }

    const product = database.prepare(`
      SELECT id, name, currency, track_inventory, is_active
      FROM catalog_products
      WHERE id = ? AND business_id = ? AND deleted_at = ''
      LIMIT 1
    `).get(productId, businessId) as Record<string, unknown> | undefined;
    if (!product || Number(product.is_active ?? 0) !== 1) {
      throw new Error("Satın alma ürünlerinden biri aktif değil veya bulunamadı.");
    }
    if (Number(product.track_inventory ?? 0) !== 1) {
      throw new Error("Satın alma ile stok girişi yapılacak ürün stok takibine açık olmalı.");
    }

    const productCurrency = String(product.currency ?? "TRY").trim().toUpperCase() || "TRY";
    if (currency && productCurrency !== currency) {
      throw new Error("Tek satın alma kaydında birden fazla para birimi kullanılamaz.");
    }
    currency = productCurrency;

    const lineTotal = roundMoney(quantity * unitCost);
    subtotal = roundMoney(subtotal + lineTotal);
    preparedItems.push({
      id: createId("purchase_order_item_"),
      productId,
      productName: String(product.name ?? ""),
      quantity,
      unitCost,
      lineTotal
    });
  }

  database.prepare(`
    INSERT INTO purchase_orders (
      id, business_id, supplier_id, status, ordered_at, received_at,
      subtotal, total, currency, notes, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, '')
  `).run(
    purchaseOrderId,
    businessId,
    supplierId,
    orderedAt,
    now,
    subtotal,
    subtotal,
    currency || "TRY",
    notes,
    now,
    now
  );

  const resultItems: CommercePurchaseOrderItem[] = [];
  for (const prepared of preparedItems) {
    database.prepare(`
      INSERT INTO purchase_order_items (
        id, purchase_order_id, product_id, product_name,
        quantity, unit_cost, line_total, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      prepared.id,
      purchaseOrderId,
      prepared.productId,
      prepared.productName,
      prepared.quantity,
      prepared.unitCost,
      prepared.lineTotal,
      now,
      now
    );

    applyPurchaseStockIn(database, {
      businessId,
      locationId,
      purchaseOrderId,
      productId: prepared.productId,
      productName: prepared.productName,
      quantity: prepared.quantity,
      unitCost: prepared.unitCost,
      source,
      now
    });

    resultItems.push({
      id: prepared.id,
      purchaseOrderId,
      productId: prepared.productId,
      productName: prepared.productName,
      quantity: prepared.quantity,
      unitCost: prepared.unitCost,
      lineTotal: prepared.lineTotal,
      createdAt: now,
      updatedAt: now
    });
  }

  return {
    order: {
      id: purchaseOrderId,
      businessId,
      supplierId,
      status: "received",
      orderedAt,
      receivedAt: now,
      subtotal,
      total: subtotal,
      currency: currency || "TRY",
      notes,
      createdAt: now,
      updatedAt: now
    },
    items: resultItems
  };
}
