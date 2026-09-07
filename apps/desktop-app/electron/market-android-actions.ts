import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { receiveCommercePurchaseInTransaction } from "./commerce-purchase-store.js";
import { setInventoryCountInTransaction } from "./commerce-store.js";
import {
  createMarketCartDraftInTransaction,
  createMarketProductDraftInTransaction
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
      case "market_product_draft_create":
        return applyProductDraftCreate(context);
      case "market_cart_draft_create":
        return applyCartDraftCreate(context);
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

function applyProductDraftCreate(context: MarketAndroidActionContext): MarketAndroidActionResult {
  const payload = context.action.payload;
  const draft = createMarketProductDraftInTransaction(context.db, {
    barcode: text(payload.barcode),
    proposedName: text(payload.proposed_name),
    sku: text(payload.sku),
    proposedCategory: text(payload.proposed_category),
    proposedPurchasePrice: Number(payload.proposed_purchase_price ?? 0),
    proposedSalePrice: Number(payload.proposed_sale_price ?? 0),
    currency: text(payload.currency) || "TRY",
    unit: text(payload.unit) || "piece",
    note: text(payload.note),
    source: "android",
    createdByDevice: context.action.device_id
  }, context.now);
  context.insertEvent("market.product_draft_created", "catalog_product_draft", draft.id, {
    source: "android",
    device_id: context.action.device_id,
    barcode: draft.barcode,
    proposed_name: draft.proposedName
  });
  return { ok: true, message: "Ürün taslağı masaüstü incelemesi için kaydedildi." };
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}
