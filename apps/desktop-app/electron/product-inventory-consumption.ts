import type { DatabaseSync } from "node:sqlite";
import { applyInventoryMovementInTransaction, resolveInventoryLocation } from "./commerce-store.js";
import { isInventoryTrackingEnabled } from "./inventory-tracking.js";

export interface ProductConsumptionSnapshot {
  product_id: string;
  inventory_quantity_per_item: number;
  inventory_location_id: string | null;
}

/** Freeze actual consumption/location so later menu edits or unlink cannot change restoration. */
export function snapshotProductConsumption(db: DatabaseSync, productId: string, consumption: number, now: string): ProductConsumptionSnapshot {
  const product = db.prepare("SELECT business_id, track_inventory FROM catalog_products WHERE id = ? AND deleted_at = ''").get(productId);
  if (!product) throw new Error("Ürün bulunamadı.");
  const tracked = isInventoryTrackingEnabled(db) && Number(product.track_inventory) === 1;
  return {
    product_id: productId,
    inventory_quantity_per_item: tracked ? consumption : 0,
    inventory_location_id: tracked ? resolveInventoryLocation(db, String(product.business_id), undefined, now) : null
  };
}

/** Consumption policy only; the canonical inventory primitive owns every balance/movement write. */
export function applyProductConsumptionInTransaction(db: DatabaseSync, snapshot: ProductConsumptionSnapshot, quantityDelta: number,
  context: { referenceType: "table_order" | "room_folio"; referenceId: string; actorSource: string; note: string; now: string }) {
  const delta = Math.round(quantityDelta * snapshot.inventory_quantity_per_item * 10000) / 10000;
  if (delta === 0) return { ok: true as const, message: "Ürün stok takibinde değil." };
  const product = db.prepare("SELECT business_id FROM catalog_products WHERE id = ? AND deleted_at = ''").get(snapshot.product_id);
  if (!product) throw new Error("Stok işlemi için ürün bulunamadı.");
  try {
    applyInventoryMovementInTransaction(db, String(product.business_id), {
      productId: snapshot.product_id, locationId: snapshot.inventory_location_id ?? undefined,
      type: delta < 0 ? "sale" : "return_in", quantityDelta: delta,
      referenceType: context.referenceType, referenceId: context.referenceId,
      actorSource: context.actorSource, note: context.note
    }, context.now);
    return { ok: true as const, message: "Stok güncellendi." };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Yetersiz stok.")) {
      return { ok: false as const, message: context.actorSource === "android" ? "Stokta yeterli ürün yok." : "Bu ürün stokta yeterli değil." };
    }
    throw error;
  }
}
