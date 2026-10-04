import { DatabaseSync } from "node:sqlite";
import {
  createId,
  BUSINESS_CAPABILITIES,
  hasBusinessCapability,
  normalizeCommerceOrderDeliverySnapshot,
  type CommerceOrderDeliverySnapshot,
  moneyToMinor,
  normalizeCommerceOrderBuyerSnapshot,
  type CommerceOrderBuyerSnapshot,
  type CommerceOrder,
  type CommerceOrderDetail,
  type CommerceOrderItem,
  type CommerceOrderStatus,
  type CommerceUnit
} from "@yardimci-asistan/shared";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service";
import { readEnabledBusinessCapabilities } from "./business-capability-store";
import { DealerWebOrderAccessRejected } from "./dealer-web-order-rejection";

const ORDER_STATUSES = new Set<CommerceOrderStatus>([
  "placed",
  "confirmed",
  "fulfilled",
  "cancelled"
]);
const COMMERCE_UNITS = new Set<CommerceUnit>([
  "piece", "kg", "g", "l", "ml", "pack", "box", "meter", "other"
]);

export interface CreateCommerceOrderInput {
  customerId?: string;
  buyerSnapshot?: CommerceOrderBuyerSnapshot;
  deliverySnapshot?: CommerceOrderDeliverySnapshot;
  source?: string;
  sourceReference?: string;
  discountTotal?: number;
  note?: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface ListCommerceOrdersOptions {
  status?: CommerceOrderStatus;
  customerId?: string;
  source?: string;
  limit?: number;
}

export interface UpdateCommerceOrderStatusInput {
  orderId: string;
  status: "confirmed" | "cancelled";
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

function normalizeCurrency(value: unknown) {
  const currency = String(value ?? "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "TRY";
}

function normalizeUnit(value: unknown): CommerceUnit {
  const unit = String(value ?? "piece") as CommerceUnit;
  return COMMERCE_UNITS.has(unit) ? unit : "piece";
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

function mapOrder(row: Record<string, unknown>): CommerceOrder {
  return {
    id: String(row.id ?? ""),
    businessId: String(row.business_id ?? ""),
    customerId: String(row.customer_id ?? ""),
    customerName: String(row.customer_name ?? ""),
    buyerSnapshot: JSON.parse(String(row.buyer_snapshot_json ?? "null")) as CommerceOrderBuyerSnapshot | null,
    deliverySnapshot: normalizeCommerceOrderDeliverySnapshot(JSON.parse(String(row.delivery_snapshot_json))),
    status: String(row.status ?? "placed") as CommerceOrderStatus,
    source: String(row.source ?? ""),
    sourceReference: String(row.source_reference ?? ""),
    subtotal: roundMoney(Number(row.subtotal ?? 0)),
    discountTotal: roundMoney(Number(row.discount_total ?? 0)),
    total: roundMoney(Number(row.total ?? 0)),
    currency: normalizeCurrency(row.currency),
    note: String(row.note ?? ""),
    placedAt: String(row.placed_at ?? ""),
    confirmedAt: String(row.confirmed_at ?? ""),
    fulfilledAt: String(row.fulfilled_at ?? ""),
    cancelledAt: String(row.cancelled_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapOrderItem(row: Record<string, unknown>): CommerceOrderItem {
  return {
    id: String(row.id ?? ""),
    orderId: String(row.order_id ?? ""),
    productId: String(row.product_id ?? ""),
    productName: String(row.product_name ?? ""),
    sku: String(row.sku ?? ""),
    barcode: String(row.barcode ?? ""),
    unit: normalizeUnit(row.unit),
    unitPrice: roundMoney(Number(row.unit_price ?? 0)),
    quantity: roundQuantity(Number(row.quantity ?? 0)),
    lineTotal: roundMoney(Number(row.line_total ?? 0)),
    taxRate: Number(row.tax_rate ?? 0),
    createdAt: String(row.created_at ?? "")
  };
}

function getOrderRow(database: DatabaseSync, businessId: string, orderIdInput: string) {
  const orderId = String(orderIdInput ?? "").trim();
  if (!orderId) throw new Error("Sipariş kimliği gerekli.");
  return database.prepare(`
    SELECT *
    FROM commerce_orders
    WHERE id = ? AND business_id = ? AND deleted_at = ''
    LIMIT 1
  `).get(orderId, businessId) as Record<string, unknown> | undefined;
}

function getOrderDetailInDatabase(
  database: DatabaseSync,
  businessId: string,
  orderId: string
): CommerceOrderDetail | null {
  const row = getOrderRow(database, businessId, orderId);
  if (!row) return null;
  const items = (database.prepare(`
    SELECT *
    FROM commerce_order_items
    WHERE order_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(orderId) as Array<Record<string, unknown>>).map(mapOrderItem);
  return { order: mapOrder(row), items };
}

export function getCommerceOrderDetailInTransaction(
  database: DatabaseSync,
  businessId: string,
  orderId: string
): CommerceOrderDetail | null {
  return getOrderDetailInDatabase(database, businessId, orderId);
}

export function listCommerceOrders(
  databasePath: string,
  options: ListCommerceOrdersOptions = {}
): CommerceOrder[] {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const conditions = ["business_id = ?", "deleted_at = ''"];
    const params: Array<string | number> = [businessId];

    if (options.status !== undefined) {
      if (!ORDER_STATUSES.has(options.status)) throw new Error("Geçersiz sipariş durumu.");
      conditions.push("status = ?");
      params.push(options.status);
    }

    const customerId = String(options.customerId ?? "").trim();
    if (customerId) {
      conditions.push("customer_id = ?");
      params.push(customerId);
    }

    const source = String(options.source ?? "").trim();
    if (source) {
      conditions.push("source = ?");
      params.push(source);
    }

    params.push(normalizeLimit(options.limit));
    return (database.prepare(`
      SELECT *
      FROM commerce_orders
      WHERE ${conditions.join(" AND ")}
      ORDER BY placed_at DESC, id DESC
      LIMIT ?
    `).all(...params) as Array<Record<string, unknown>>).map(mapOrder);
  } finally {
    database.close();
  }
}

export function getCommerceOrder(
  databasePath: string,
  orderId: string
): CommerceOrderDetail | null {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    return getOrderDetailInDatabase(database, businessId, orderId);
  } finally {
    database.close();
  }
}

export function createCommerceOrder(
  databasePath: string,
  input: CreateCommerceOrderInput,
  options: { wholesaleEnabled?: boolean; dealerAccess?: { accessId: string; accessRevision: number } } = {}
): CommerceOrderDetail {
  const database = openDatabase(databasePath);
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const businessId = activeBusinessId(database);
      let dealerCustomerId: string | undefined;
      if (options.dealerAccess) {
        const access = options.dealerAccess;
        const dealer = database.prepare(`SELECT a.customer_id FROM commerce_dealer_web_access a
          JOIN customers c ON c.id = a.customer_id AND c.business_id = a.business_id
          JOIN customer_commercial_profiles p ON p.customer_id = c.id AND p.business_id = a.business_id
          JOIN settings s ON s.business_id = a.business_id AND s.deleted_at = ''
          WHERE a.id = ? AND a.business_id = ? AND a.enabled = 1 AND a.access_revision = ?
            AND c.deleted_at = '' AND p.dealer_status = 'active' AND s.dealer_portal_enabled = 1`)
          .get(access.accessId, businessId, access.accessRevision);
        if (!dealer || !hasBusinessCapability(readEnabledBusinessCapabilities(database), BUSINESS_CAPABILITIES.WHOLESALE)) {
          throw new DealerWebOrderAccessRejected();
        }
        dealerCustomerId = String(dealer.customer_id);
        const delivery = normalizeCommerceOrderDeliverySnapshot(input.deliverySnapshot);
        const settings = database.prepare("SELECT online_sales_pickup_enabled, online_sales_shipping_enabled FROM settings WHERE business_id = ? AND deleted_at = ''").get(businessId)!;
        if (Number(settings[delivery.method === "pickup" ? "online_sales_pickup_enabled" : "online_sales_shipping_enabled"]) !== 1) {
          throw new Error("Bayi teslimat yöntemi kapalı.");
        }
      }
      const sourceRaw = options.dealerAccess ? "web-dealer" : String(input.source ?? "desktop").trim() || "desktop";
      const sourceReference = String(input.sourceReference ?? "").trim();
      if (sourceRaw === "web-dealer" && (!options.dealerAccess || !sourceReference)) throw new Error("Bayi web siparişi erişim kimliği gerekli.");
      if (sourceRaw.length > 80) throw new Error("Sipariş kaynağı en fazla 80 karakter olabilir.");
      if (sourceReference.length > 180) throw new Error("Sipariş kaynak kimliği en fazla 180 karakter olabilir.");
      const source = sourceRaw;

      if (sourceReference) {
        const existing = database.prepare(`
          SELECT id
          FROM commerce_orders
          WHERE business_id = ? AND source = ? AND source_reference = ? AND deleted_at = ''
          LIMIT 1
        `).get(businessId, source, sourceReference) as { id?: unknown } | undefined;
        if (existing?.id) {
          const detail = getOrderDetailInDatabase(database, businessId, String(existing.id));
          if (!detail) throw new Error("Sipariş kaynak kaydı okunamadı.");
          database.exec("COMMIT");
          return detail;
        }
      }

      if (!Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("Sipariş için en az bir ürün gerekli.");
      }
      if (input.items.length > 500) {
        throw new Error("Tek siparişte en fazla 500 ürün satırı olabilir.");
      }

      const customerId = dealerCustomerId ?? String(input.customerId ?? "").trim();
      let storedCustomerId: string | null = null;
      let customerName = "";
      if (customerId) {
        const customer = database.prepare(`
          SELECT id, full_name
          FROM customers
          WHERE id = ? AND business_id = ? AND deleted_at = ''
          LIMIT 1
        `).get(customerId, businessId) as { id?: unknown; full_name?: unknown } | undefined;
        if (!customer?.id) throw new Error("Sipariş müşterisi bulunamadı veya aktif değil.");
        storedCustomerId = String(customer.id);
        customerName = String(customer.full_name ?? "").trim();
      }

      let currency = "";
      let subtotal = 0;
      const preparedItems: Array<{
        productId: string;
        productName: string;
        sku: string;
        barcode: string;
        unit: CommerceUnit;
        unitPrice: number;
        quantity: number;
        lineTotal: number;
        taxRate: number;
      }> = [];

      for (const item of input.items) {
        const productId = String(item.productId ?? "").trim();
        const quantity = roundQuantity(Number(item.quantity));
        if (!productId) throw new Error("Sipariş ürün kimliği gerekli.");
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("Sipariş adedi sıfırdan büyük olmalı.");
        }

        const row = database.prepare(`
          SELECT id, name, sku, barcode, unit, currency, tax_rate
          FROM catalog_products
          WHERE id = ? AND business_id = ? AND is_active = 1 AND deleted_at = ''
          LIMIT 1
        `).get(productId, businessId) as Record<string, unknown> | undefined;
        if (!row) throw new Error("Sipariş ürünlerinden biri aktif değil veya bulunamadı.");

        const resolvedPrice = resolveCommerceProductPriceInDatabase(
          database,
          businessId,
          { productId, customerId: storedCustomerId ?? "" },
          Boolean(options.dealerAccess) || options.wholesaleEnabled === true
        );
        const itemCurrency = normalizeCurrency(resolvedPrice.currency || row.currency);
        if (currency && itemCurrency !== currency) {
          throw new Error("Tek siparişte birden fazla para birimi kullanılamaz.");
        }
        currency = itemCurrency;

        const unitPrice = roundMoney(resolvedPrice.unitPrice);
        moneyToMinor(unitPrice);
        const lineTotal = roundMoney(unitPrice * quantity);
        moneyToMinor(lineTotal);
        subtotal = roundMoney(subtotal + lineTotal);
        moneyToMinor(subtotal);

        preparedItems.push({
          productId,
          productName: String(row.name ?? ""),
          sku: String(row.sku ?? ""),
          barcode: String(row.barcode ?? ""),
          unit: normalizeUnit(row.unit),
          unitPrice,
          quantity,
          lineTotal,
          taxRate: (() => {
            const taxRate = Number(row.tax_rate ?? 0);
            if (!Number.isFinite(taxRate) || taxRate < 0) {
              throw new Error("Sipariş ürününün vergi oranı geçersiz.");
            }
            return taxRate;
          })()
        });
      }

      const discountTotal = options.dealerAccess ? 0 : roundMoney(Number(input.discountTotal ?? 0));
      if (!Number.isFinite(discountTotal) || discountTotal < 0) {
        throw new Error("Sipariş indirimi geçersiz.");
      }
      moneyToMinor(discountTotal);
      if (discountTotal > subtotal) {
        throw new Error("Sipariş indirimi ara toplamı aşamaz.");
      }
      const total = roundMoney(subtotal - discountTotal);
      moneyToMinor(total);

      const note = String(input.note ?? "").trim().slice(0, 4000);
      const buyerSnapshot = options.dealerAccess || input.buyerSnapshot === undefined ? null
        : normalizeCommerceOrderBuyerSnapshot(input.buyerSnapshot);
      const deliverySnapshot = normalizeCommerceOrderDeliverySnapshot(input.deliverySnapshot === undefined && source !== "web-online-sales" && source !== "web-dealer"
        ? { method: "pickup" } : input.deliverySnapshot);
      const now = new Date().toISOString();
      const orderId = createId("commerce_order_");

      database.prepare(`
        INSERT INTO commerce_orders (
          id, business_id, customer_id, customer_name, buyer_snapshot_json, delivery_snapshot_json, status, source, source_reference,
          subtotal, discount_total, total, currency, note, placed_at,
          confirmed_at, fulfilled_at, cancelled_at, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', ?, ?, '')
      `).run(
        orderId,
        businessId,
        storedCustomerId,
        customerName,
        JSON.stringify(buyerSnapshot),
        JSON.stringify(deliverySnapshot),
        source,
        sourceReference,
        subtotal,
        discountTotal,
        total,
        currency || "TRY",
        note,
        now,
        now,
        now
      );

      const insertItem = database.prepare(`
        INSERT INTO commerce_order_items (
          id, order_id, product_id, product_name, sku, barcode, unit,
          unit_price, quantity, line_total, tax_rate, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of preparedItems) {
        insertItem.run(
          createId("commerce_order_item_"),
          orderId,
          item.productId,
          item.productName,
          item.sku,
          item.barcode,
          item.unit,
          item.unitPrice,
          item.quantity,
          item.lineTotal,
          item.taxRate,
          now
        );
      }

      const detail = getOrderDetailInDatabase(database, businessId, orderId);
      if (!detail) throw new Error("Oluşturulan sipariş okunamadı.");
      database.exec("COMMIT");
      return detail;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

export function updateCommerceOrderStatus(
  databasePath: string,
  input: UpdateCommerceOrderStatusInput
): CommerceOrderDetail {
  const database = openDatabase(databasePath);
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const businessId = activeBusinessId(database);
      const row = getOrderRow(database, businessId, input.orderId);
      if (!row) throw new Error("Sipariş bulunamadı.");

      const current = String(row.status ?? "") as CommerceOrderStatus;
      const target = String(input.status ?? "");
      if (target !== "confirmed" && target !== "cancelled") {
        throw new Error("Geçersiz sipariş durumu.");
      }
      if (current === target) {
        const existing = getOrderDetailInDatabase(database, businessId, String(row.id));
        if (!existing) throw new Error("Sipariş okunamadı.");
        database.exec("COMMIT");
        return existing;
      }
      if (current === "fulfilled" || current === "cancelled") {
        throw new Error("Tamamlanmış veya iptal edilmiş sipariş değiştirilemez.");
      }
      if (target === "confirmed" && current !== "placed") {
        throw new Error("Yalnız yeni sipariş onaylanabilir.");
      }

      const now = new Date().toISOString();
      database.prepare(`
        UPDATE commerce_orders
        SET status = ?,
            confirmed_at = CASE WHEN ? = 'confirmed' THEN ? ELSE confirmed_at END,
            cancelled_at = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_at END,
            updated_at = ?
        WHERE id = ? AND business_id = ? AND deleted_at = ''
      `).run(target, target, now, target, now, now, String(row.id), businessId);

      const detail = getOrderDetailInDatabase(database, businessId, String(row.id));
      if (!detail) throw new Error("Güncellenen sipariş okunamadı.");
      database.exec("COMMIT");
      return detail;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}
