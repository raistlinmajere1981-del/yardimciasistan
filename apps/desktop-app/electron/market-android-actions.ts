import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { receiveCommercePurchaseInTransaction } from "./commerce-purchase-store.js";
import { saveCatalogProductInTransaction, setInventoryCountInTransaction } from "./commerce-store.js";
import {
  createMarketBarcodeScanEventInTransaction,
  createMarketCartDraftInTransaction
} from "./market-companion-store.js";

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
    barcode,
    sku: text(payload.sku),
    categoryId,
    description: text(payload.note),
    purchasePrice: Number(payload.purchase_price ?? 0),
    salePrice: Number(payload.sale_price ?? 0),
    currency: text(payload.currency) || "TRY",
    unit: text(payload.unit) || "piece",
    taxRate: 0,
    trackInventory,
    minimumQuantity: 0,
    isActive: true
  }, context.now);

  context.insertEvent("market.product_created", "catalog_product", product.id, {
    source: "android",
    device_id: context.action.device_id,
    barcode: product.barcode,
    name: product.name,
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
