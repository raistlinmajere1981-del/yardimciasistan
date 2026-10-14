import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { CommerceUnit, CustomerCreditPaymentMethod } from "@yardimci-asistan/shared";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { completeMarketSaleInTransaction } from "./market-sale-operation.js";
import { recordCustomerCreditPaymentInTransaction } from "./customer-credit-runtime.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { receiveCommercePurchaseInTransaction } from "./commerce-purchase-store.js";
import { saveCatalogProductInTransaction, setInventoryCountInTransaction } from "./commerce-store.js";
import {
  createMarketBarcodeScanEventInTransaction,
  createMarketCartDraftInTransaction
} from "./market-companion-store.js";

const COMMERCE_UNITS = new Set<CommerceUnit>([
  "piece", "kg", "g", "l", "ml", "pack", "box", "meter", "other"
]);

export type MarketAndroidActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export interface MarketAndroidActionContext {
  db: DatabaseSync;
  action: AndroidSyncAction;
  now: string;
  insertEvent: (
    type: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>
  ) => void;
  queueSnapshot: () => void;
}

export function applyMarketAndroidAction(
  context: MarketAndroidActionContext
): MarketAndroidActionResult {
  try {
    switch (context.action.action_type) {
      case "market_stock_count":
        return applyStockCount(context);
      case "market_purchase_receive":
        return applyPurchaseReceive(context);
      case "market_product_create":
        return applyProductCreate(context);
      case "market_cart_draft_create":
        return applyCartDraftCreate(context);
      case "market_barcode_scan":
        return applyBarcodeScan(context);
      case "market_sale_complete":
        return applySaleComplete(context);
      case "customer_credit_payment_add":
        return applyCreditPayment(context);
      default:
        return { ok: false, message: "Market telefon işlem türü desteklenmiyor." };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : "";
    return {
      ok: false,
      message: message || "Market telefon işlemi yerel kayıtlara uygulanamadı."
    };
  }
}

/** Bind the immutable financial intent to its action receipt, including device identity. */
export function marketAndroidActionIntentHash(action: AndroidSyncAction): string {
  const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, ordered(child)])) : value;
  return createHash("sha256").update(JSON.stringify(ordered({ actionType: action.action_type,
    deviceId: action.device_id, payload: action.payload }))).digest("hex");
}

function requireFields(payload: Record<string, unknown>, fields: string[]) {
  if (Object.keys(payload).some(key => !fields.includes(key))) throw new Error("Mobil işlem desteklenmeyen alan içeriyor.");
}

function paymentMethod(payload: Record<string, unknown>): CustomerCreditPaymentMethod {
  const method = text(payload.payment_method);
  if (!["cash", "card", "bank", "other"].includes(method)) throw new Error("Ödeme yöntemi geçersiz.");
  if (method === "card" && payload.external_payment_confirmed !== true) {
    throw new Error("Kart ödemesinin harici POS'ta gerçekleştiğini açıkça onaylayın.");
  }
  return method as CustomerCreditPaymentMethod;
}

function applySaleComplete(context: MarketAndroidActionContext): MarketAndroidActionResult {
  const payload = context.action.payload;
  requireFields(payload, ["lines", "location_id", "settlement", "customer_id", "payment_method", "external_payment_confirmed"]);
  if (payload.settlement !== "paid" && payload.settlement !== "credit") throw new Error("Satış ödeme seçimi geçersiz.");
  if (!Array.isArray(payload.lines) || !payload.lines.length || payload.lines.length > 200) throw new Error("Satış için 1–200 ürün satırı gerekli.");
  const seen = new Set<string>();
  const items = payload.lines.map(raw => {
    const line = record(raw);
    requireFields(line, ["product_id", "quantity", "expected_unit_price", "expected_currency", "expected_updated_at"]);
    const productId = text(line.product_id);
    if (!productId || seen.has(productId)) throw new Error("Satış ürünleri geçersiz veya yineleniyor.");
    seen.add(productId);
    if (typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1_000_000
        || Math.abs(line.quantity * 10000 - Math.round(line.quantity * 10000)) > 0.00001) throw new Error("Satış miktarı geçersiz.");
    if (typeof line.expected_unit_price !== "number" || !Number.isFinite(line.expected_unit_price) || line.expected_unit_price < 0
        || !/^[A-Z]{3}$/.test(text(line.expected_currency)) || !text(line.expected_updated_at)) throw new Error("Güncel ürün fiyatı ve sürümü gerekli.");
    return { productId, quantity: line.quantity, expectedUnitPrice: line.expected_unit_price,
      expectedCurrency: text(line.expected_currency), expectedUpdatedAt: text(line.expected_updated_at) };
  });
  const credit = payload.settlement === "credit";
  if (readEnabledBusinessCapabilities(context.db).includes("commerce.inventory") && !text(payload.location_id)) throw new Error("Güncel stok konumu gerekli.");
  if (credit && (!text(payload.customer_id) || text(payload.payment_method))) throw new Error("Veresiye için müşteri seçin; ödeme yöntemi boş olmalı.");
  if (!credit && text(payload.customer_id)) throw new Error("Mobil müşteri seçimi yalnız veresiye satışta kullanılabilir.");
  const result = completeMarketSaleInTransaction(context.db, {
    items, settlement: payload.settlement, customerId: credit ? text(payload.customer_id) : "",
    locationId: text(payload.location_id), paymentMethod: credit ? "" : paymentMethod(payload),
    source: "android-market-sale", operationId: context.action.id
  }, context.now);
  context.insertEvent("market.sale_completed", "commerce_sale", result.sale.id, {
    source: "android", device_id: context.action.device_id, settlement: result.sale.status,
    total: result.sale.total, currency: result.sale.currency
  });
  context.queueSnapshot();
  return { ok: true, message: credit ? "Veresiye satış kaydedildi; müşteri hesabına borç işlendi."
    : "Satış ve alınmış ödeme kaydı masaüstünde tamamlandı." };
}

function applyCreditPayment(context: MarketAndroidActionContext): MarketAndroidActionResult {
  const payload = context.action.payload;
  requireFields(payload, ["customer_id", "amount_minor", "currency", "expected_balance_minor", "payment_method", "external_payment_confirmed"]);
  if (!Number.isSafeInteger(payload.amount_minor) || Number(payload.amount_minor) <= 0
      || !Number.isSafeInteger(payload.expected_balance_minor) || Number(payload.expected_balance_minor) <= 0) {
    throw new Error("Pozitif tahsilat tutarı ve güncel bakiye gerekli.");
  }
  const entry = recordCustomerCreditPaymentInTransaction(context.db, {
    customerId: text(payload.customer_id), amountMinor: Number(payload.amount_minor), currency: text(payload.currency),
    paymentMethod: paymentMethod(payload), expectedBalanceMinor: Number(payload.expected_balance_minor), source: "android"
  }, context.now);
  context.insertEvent("customer_credit.payment_recorded", "customer_credit_entry", entry.id, {
    source: "android", device_id: context.action.device_id, amount_minor: entry.amountMinor, currency: entry.currency
  });
  context.queueSnapshot();
  return { ok: true, message: "Müşteri borcu tahsilatı masaüstünde kaydedildi." };
}

function applyStockCount(context: MarketAndroidActionContext): MarketAndroidActionResult {
  const payload = context.action.payload;
  const productId = text(payload.product_id);
  if (!productId) return { ok: false, message: "Stok sayımı için ürün kimliği gerekli." };
  const result = setInventoryCountInTransaction(context.db, {
    productId,
    countedQuantity: Number(payload.counted_quantity),
    expectedUpdatedAt: text(payload.expected_updated_at),
    note: text(payload.note),
    referenceType: "android_market_stock_count",
    referenceId: context.action.id,
    actorSource: "android"
  }, context.now);
  context.insertEvent("market.stock_counted", "catalog_product", productId, {
    source: "android",
    device_id: context.action.device_id,
    counted_quantity: result.balance.quantity,
    quantity_delta: result.movement?.quantityDelta ?? 0,
    movement_id: result.movement?.id ?? ""
  });
  context.queueSnapshot();
  return {
    ok: true,
    message: result.movement
      ? `Fiziksel sayım kaydedildi. Stok ${result.balance.quantity} oldu.`
      : `Stok zaten ${result.balance.quantity}; yeni hareket oluşturulmadı.`
  };
}

function applyPurchaseReceive(context: MarketAndroidActionContext): MarketAndroidActionResult {
  const payload = context.action.payload;
  if (!Array.isArray(payload.lines)) {
    return { ok: false, message: "Mal kabulü için ürün satırları gerekli." };
  }
  const lines = payload.lines.map((rawLine) => {
    const line = record(rawLine);
    return {
      productId: text(line.product_id),
      quantity: Number(line.quantity),
      unitCost: Number(line.unit_cost)
    };
  });
  const purchase = receiveCommercePurchaseInTransaction(context.db, {
    supplierId: text(payload.supplier_id),
    orderedAt: text(payload.ordered_at),
    notes: text(payload.note),
    source: "android",
    items: lines
  }, context.now);
  context.insertEvent("market.purchase_received", "purchase_order", purchase.order.id, {
    source: "android",
    device_id: context.action.device_id,
    supplier_id: purchase.order.supplierId,
    line_count: purchase.items.length,
    total: purchase.order.total,
    currency: purchase.order.currency
  });
  context.queueSnapshot();
  return {
    ok: true,
    message: `${purchase.items.length} ürün satırı teslim alındı ve stoğa işlendi.`
  };
}

function applyProductCreate(context: MarketAndroidActionContext): MarketAndroidActionResult {
  const payload = context.action.payload;
  const barcode = text(payload.barcode);
  const name = text(payload.name);
  if (barcode.length < 3) return { ok: false, message: "Yeni ürün için geçerli bir barkod gerekli." };
  if (!name) return { ok: false, message: "Yeni ürün için ürün adı gerekli." };

  const existing = context.db.prepare(`
    SELECT product.name
    FROM catalog_products AS product
    INNER JOIN business ON business.id = product.business_id
    WHERE product.barcode = ?
      AND product.deleted_at = ''
      AND business.deleted_at = ''
      AND product.business_id = (
        SELECT id
        FROM business
        WHERE deleted_at = ''
        ORDER BY created_at ASC
        LIMIT 1
      )
    LIMIT 1
  `).get(barcode) as { name?: unknown } | undefined;
  if (existing) {
    return {
      ok: false,
      message: `Bu barkod zaten ${text(existing.name) || "başka bir ürün"} için kayıtlı.`
    };
  }

  const categoryName = text(payload.category);
  const categoryId = categoryName ? findCategoryIdByName(context.db, categoryName) : "";
  const trackInventory = payload.track_inventory === true;

  const product = saveCatalogProductInTransaction(context.db, {
    name,
    brand: text(payload.brand),
    barcode,
    sku: text(payload.sku),
    categoryId,
    description: text(payload.note),
    purchasePrice: Number(payload.purchase_price ?? 0),
    salePrice: Number(payload.sale_price ?? 0),
    currency: text(payload.currency) || "TRY",
    unit: normalizeCommerceUnit(text(payload.unit)),
    taxRate: 0,
    trackInventory,
    minimumQuantity: 0,
    isActive: true,
    imageSourceUrl: text(payload.image_source_url),
    dataSource: text(payload.data_source),
    sourceProductUrl: text(payload.source_product_url),
    dataLicense: text(payload.data_license),
    imageLicense: text(payload.image_license),
    sourceFetchedAt: text(payload.source_fetched_at)
  }, context.now);

  context.insertEvent("market.product_created", "catalog_product", product.id, {
    source: "android",
    device_id: context.action.device_id,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    data_source: product.dataSource,
    category_name: categoryName,
    category_matched: Boolean(categoryId)
  });
  context.queueSnapshot();

  const categoryMessage = categoryName && !categoryId
    ? " Kategori adı masaüstündeki kayıtlarla eşleşmediği için ürün kategorisiz kaydedildi."
    : "";
  return {
    ok: true,
    message: `${product.name} ürün kataloğuna kaydedildi.${categoryMessage}`
  };
}

function findCategoryIdByName(database: DatabaseSync, categoryName: string): string {
  const row = database.prepare(`
    SELECT category.id
    FROM catalog_categories AS category
    INNER JOIN business ON business.id = category.business_id
    WHERE category.name = ? COLLATE NOCASE
      AND category.is_active = 1
      AND category.deleted_at = ''
      AND business.deleted_at = ''
      AND category.business_id = (
        SELECT id
        FROM business
        WHERE deleted_at = ''
        ORDER BY created_at ASC
        LIMIT 1
      )
    ORDER BY category.sort_order ASC, category.created_at ASC
    LIMIT 1
  `).get(categoryName) as { id?: unknown } | undefined;
  return text(row?.id);
}

function applyCartDraftCreate(context: MarketAndroidActionContext): MarketAndroidActionResult {
  const payload = context.action.payload;
  if (!Array.isArray(payload.lines)) {
    return { ok: false, message: "Sepet taslağı için ürün satırları gerekli." };
  }
  const lines = payload.lines.map((rawLine) => {
    const line = record(rawLine);
    return {
      productId: text(line.product_id),
      quantity: Number(line.quantity)
    };
  });
  const draft = createMarketCartDraftInTransaction(context.db, {
    lines,
    note: text(payload.note),
    source: "android",
    createdByDevice: context.action.device_id
  }, context.now);
  context.insertEvent("market.cart_draft_created", "commerce_sale_draft", draft.draft.id, {
    source: "android",
    device_id: context.action.device_id,
    line_count: draft.items.length
  });
  return { ok: true, message: "Sepet taslağı masaüstü için kaydedildi; satış oluşturulmadı." };
}

function applyBarcodeScan(context: MarketAndroidActionContext): MarketAndroidActionResult {
  const event = createMarketBarcodeScanEventInTransaction(context.db, {
    androidActionId: context.action.id,
    deviceId: context.action.device_id,
    barcode: text(context.action.payload.barcode),
    scannedAt: text(context.action.payload.scanned_at)
  }, context.now);
  if (!event) {
    // A successful no-op commits the normal action receipt. Persisted Android
    // outbox retries can therefore never surface an old scan in a later cart.
    return { ok: true, message: "Barkod taraması zaman aşımına uğradı; sepete iletilmedi." };
  }
  return { ok: true, message: "Barkod masaüstü kasasına gönderildi." };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeCommerceUnit(value: unknown): CommerceUnit {
  const unit = String(value ?? "piece").trim() as CommerceUnit;
  return COMMERCE_UNITS.has(unit) ? unit : "piece";
}
