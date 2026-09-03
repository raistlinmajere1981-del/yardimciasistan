import {
  BUSINESS_CAPABILITIES,
  type BusinessCapability,
  type CatalogProduct,
  type CommerceSale,
  type CommerceSupplier,
  type InventoryBalance,
  type InventoryMovement
} from "@yardimci-asistan/shared";
import { assertPersistedBusinessCapability } from "./business-capability-runtime";
import {
  applyInventoryMovement,
  createPaidCommerceSale,
  getCommerceStoreSnapshot,
  getInventoryBalance,
  listCatalogProducts,
  saveCatalogProduct,
  saveCommerceSupplier,
  type ApplyInventoryMovementInput,
  type CommerceStoreSnapshot,
  type CreateCommerceSaleInput,
  type SaveCatalogProductInput,
  type SaveCommerceSupplierInput
} from "./commerce-store";

export interface SetInventoryCountInput {
  productId: string;
  locationId?: string;
  countedQuantity: number;
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

function requireCapability(databasePath: string, capability: BusinessCapability, message: string) {
  assertPersistedBusinessCapability(databasePath, capability, message);
}

export function getCommerceRuntimeSnapshot(databasePath: string): CommerceStoreSnapshot {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Ürün kataloğu bu işletmede etkin değil."
  );
  return getCommerceStoreSnapshot(databasePath);
}

export function saveRuntimeCatalogProduct(
  databasePath: string,
  input: SaveCatalogProductInput
): CatalogProduct {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Ürün kataloğu bu işletmede etkin değil."
  );
  if (input.trackInventory !== false) {
    requireCapability(
      databasePath,
      BUSINESS_CAPABILITIES.INVENTORY,
      "Stok takibi bu işletmede etkin değil."
    );
  }
  return saveCatalogProduct(databasePath, input);
}

export function getRuntimeInventoryBalance(
  databasePath: string,
  productId: string,
  locationId?: string
): InventoryBalance {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.INVENTORY,
    "Stok yönetimi bu işletmede etkin değil."
  );
  return getInventoryBalance(databasePath, productId, locationId);
}

export function applyRuntimeInventoryMovement(
  databasePath: string,
  input: ApplyInventoryMovementInput
): InventoryMovement {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.INVENTORY,
    "Stok yönetimi bu işletmede etkin değil."
  );
  return applyInventoryMovement(databasePath, input);
}

/**
 * A physical count is an absolute observation, not a delta entered by the UI.
 * Convert the counted quantity to an auditable `count` movement against the
 * current balance. When the count matches exactly, keep the balance unchanged
 * and avoid generating a meaningless zero movement.
 */
export function setRuntimeInventoryCount(
  databasePath: string,
  input: SetInventoryCountInput
): InventoryCountResult {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.INVENTORY,
    "Stok sayımı bu işletmede etkin değil."
  );

  const countedQuantity = Number(input.countedQuantity);
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
    throw new Error("Sayım miktarı 0 veya daha büyük bir sayı olmalı.");
  }

  const current = getInventoryBalance(databasePath, input.productId, input.locationId);
  const roundedCount = Math.round((countedQuantity + Number.EPSILON) * 10000) / 10000;
  const quantityDelta = Math.round((roundedCount - current.quantity + Number.EPSILON) * 10000) / 10000;
  if (quantityDelta === 0) {
    return { balance: current, movement: null };
  }

  const movement = applyInventoryMovement(databasePath, {
    productId: input.productId,
    locationId: current.locationId,
    type: "count",
    quantityDelta,
    unitCost: input.unitCost,
    referenceType: input.referenceType || "inventory_count",
    referenceId: input.referenceId,
    note: input.note || `Fiziksel sayım: ${roundedCount}`,
    actorSource: input.actorSource || "desktop"
  });

  return {
    movement,
    balance: getInventoryBalance(databasePath, input.productId, current.locationId)
  };
}

export function findRuntimeProductByBarcode(
  databasePath: string,
  barcodeInput: string
): CatalogProduct | null {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.RETAIL_BARCODE,
    "Barkod işlemleri bu işletmede etkin değil."
  );
  const barcode = String(barcodeInput ?? "").trim();
  if (!barcode) {
    throw new Error("Barkod boş olamaz.");
  }

  return listCatalogProducts(databasePath)
    .find((product) => product.isActive && product.barcode === barcode) ?? null;
}

export function createRuntimePaidSale(
  databasePath: string,
  input: CreateCommerceSaleInput
): CommerceSale {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.SALES,
    "Satış işlemleri bu işletmede etkin değil."
  );
  return createPaidCommerceSale(databasePath, input);
}

export function saveRuntimeSupplier(
  databasePath: string,
  input: SaveCommerceSupplierInput
): CommerceSupplier {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.RETAIL_SUPPLIERS,
    "Tedarikçi yönetimi bu işletmede etkin değil."
  );
  return saveCommerceSupplier(databasePath, input);
}
