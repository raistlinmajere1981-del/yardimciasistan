import {
  BUSINESS_CAPABILITIES,
  type BusinessCapability,
  type CatalogCategory,
  type CatalogProduct,
  type CommerceOrder,
  type CommerceOrderDetail,
  type CommerceOrderFulfillmentResult,
  type CommerceResolvedUnitPrice,
  type FulfillCommerceOrderInput,
  type CommercePurchaseOrder,
  type CommercePurchaseOrderDetail,
  type CommerceSale,
  type CommerceSupplier,
  type InventoryBalance,
  type InventoryMovement,
  type ProductLookupMode,
  type ProductLookupResponse
} from "@yardimci-asistan/shared";
import {
  assertPersistedBusinessCapability,
  hasPersistedBusinessCapability
} from "./business-capability-runtime";
import {
  deleteCatalogCategory,
  getCatalogCategory,
  listCatalogCategories,
  saveCatalogCategory,
  type DeleteCatalogCategoryResult,
  type ListCatalogCategoriesOptions,
  type SaveCatalogCategoryInput
} from "./commerce-category-store";
import {
  getProductImageDataUrl,
  lookupExternalProductByBarcode
} from "./product-data-service";

import { applyShipmentProviderResult, type ShipmentProviderResultInput, listShipmentsForOrder, getShipment, createShipmentForOrder, updateShipmentStatus } from "./commerce-shipment-store";
import type { UpdateCommerceShipmentStatusInput } from "@yardimci-asistan/shared";

import { fulfillCommerceOrder } from "./commerce-order-fulfillment-service";
import {
  createCommerceOrder,
  getCommerceOrder,
  listCommerceOrders,
  updateCommerceOrderStatus,
  type CreateCommerceOrderInput,
  type ListCommerceOrdersOptions,
  type UpdateCommerceOrderStatusInput
} from "./commerce-order-store";
import {
  resolveCommerceProductPrice,
  type ResolveCommerceProductPriceInput
} from "./commerce-pricing-service";
import {
  getCommercePurchaseOrder,
  listCommercePurchaseOrders,
  receiveCommercePurchase,
  type ListCommercePurchaseOrdersOptions,
  type ReceiveCommercePurchaseInput
} from "./commerce-purchase-store";
import {
  applyInventoryMovement,
  createPaidCommerceSale,
  findCatalogProductByBarcode,
  getCommerceStoreSnapshot,
  getInventoryBalance,
  listCatalogProducts,
  listCommerceSuppliers,
  listInventoryMovements,
  saveCatalogProduct,
  saveCommerceSupplier,
  setInventoryCount,
  type ApplyInventoryMovementInput,
  type CommerceStoreSnapshot,
  type CreateCommerceSaleInput,
  type ListCatalogProductsOptions,
  type ListCommerceSuppliersOptions,
  type ListInventoryMovementsOptions,
  type SaveCatalogProductInput,
  type SaveCommerceSupplierInput,
  type SetInventoryCountInput
} from "./commerce-store";

export type {
  CreateCommerceOrderInput,
  FulfillCommerceOrderInput,
  ListCommerceOrdersOptions,
  ResolveCommerceProductPriceInput,
  ReceiveCommercePurchaseInput,
  SetInventoryCountInput,
  UpdateCommerceOrderStatusInput
};
export {
  addCustomerCreditAdjustment,
  createCustomerCreditSale,
  getCustomerCreditAccount,
  listCustomerCreditAccounts,
  listCustomerCreditEntries,
  recordCustomerCreditPayment
} from "./customer-credit-runtime";
export {
  createMarketCartDraft,
  consumePendingMarketBarcodeScans,
  getMarketCartDraft,
  loadMarketCartDraftForQuickSale,
  listMarketCartDrafts,
  markMarketCartDraftReviewed
} from "./market-companion-runtime";
export type {
  ConsumePendingMarketBarcodeScansOptions,
  CreateMarketCartDraftInput,
  ListMarketCartDraftsOptions
} from "./market-companion-runtime";

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
  const snapshot = getCommerceStoreSnapshot(databasePath);
  return {
    products: snapshot.products,
    suppliers: hasPersistedBusinessCapability(databasePath, BUSINESS_CAPABILITIES.RETAIL_SUPPLIERS)
      ? snapshot.suppliers
      : []
  };
}

export async function lookupRuntimeExternalProductByBarcode(
  databasePath: string,
  barcode: string,
  mode: ProductLookupMode = "manual"
): Promise<ProductLookupResponse> {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Ürün kataloğu bu işletmede etkin değil."
  );
  return lookupExternalProductByBarcode(databasePath, barcode, mode);
}

export function getRuntimeProductImageDataUrl(databasePath: string, productId: string): string {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Ürün kataloğu bu işletmede etkin değil."
  );
  return getProductImageDataUrl(databasePath, productId);
}

export function listRuntimeCatalogCategories(
  databasePath: string,
  options: ListCatalogCategoriesOptions = {}
): CatalogCategory[] {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Ürün kataloğu bu işletmede etkin değil."
  );
  return listCatalogCategories(databasePath, options);
}

export function getRuntimeCatalogCategory(
  databasePath: string,
  categoryId: string
): CatalogCategory | null {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Ürün kataloğu bu işletmede etkin değil."
  );
  return getCatalogCategory(databasePath, categoryId);
}

export function saveRuntimeCatalogCategory(
  databasePath: string,
  input: SaveCatalogCategoryInput
): CatalogCategory {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Ürün kataloğu bu işletmede etkin değil."
  );
  return saveCatalogCategory(databasePath, input);
}

export function deleteRuntimeCatalogCategory(
  databasePath: string,
  categoryId: string
): DeleteCatalogCategoryResult {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Ürün kataloğu bu işletmede etkin değil."
  );
  return deleteCatalogCategory(databasePath, categoryId);
}

export function listRuntimeCatalogProducts(
  databasePath: string,
  options: ListCatalogProductsOptions = {}
): CatalogProduct[] {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Ürün kataloğu bu işletmede etkin değil."
  );
  return listCatalogProducts(databasePath, options);
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

  const categoryId = String(input.categoryId ?? "").trim();
  if (categoryId && !getCatalogCategory(databasePath, categoryId)) {
    throw new Error("Seçilen ürün kategorisi bulunamadı.");
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

export function listRuntimeInventoryMovements(
  databasePath: string,
  options: ListInventoryMovementsOptions = {}
): InventoryMovement[] {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.INVENTORY,
    "Stok hareketleri bu işletmede etkin değil."
  );
  return listInventoryMovements(databasePath, options);
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
 * Physical count is an absolute observation. The store owns the read/delta/write
 * transaction so a concurrent stock mutation cannot race between those steps.
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
  return setInventoryCount(databasePath, input);
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
  return findCatalogProductByBarcode(databasePath, barcodeInput);
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

export function listRuntimeOrders(
  databasePath: string,
  options: ListCommerceOrdersOptions = {}
): CommerceOrder[] {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.ORDERS,
    "Sipariş yönetimi bu işletmede etkin değil."
  );
  return listCommerceOrders(databasePath, options);
}

export function getRuntimeOrder(
  databasePath: string,
  orderId: string
): CommerceOrderDetail | null {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.ORDERS,
    "Sipariş yönetimi bu işletmede etkin değil."
  );
  return getCommerceOrder(databasePath, orderId);
}

export function createRuntimeOrder(
  databasePath: string,
  input: CreateCommerceOrderInput
): CommerceOrderDetail {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.ORDERS,
    "Sipariş yönetimi bu işletmede etkin değil."
  );
  return createCommerceOrder(databasePath, input, {
    wholesaleEnabled: hasPersistedBusinessCapability(databasePath, BUSINESS_CAPABILITIES.WHOLESALE)
  });
}

export function resolveRuntimeProductPrice(
  databasePath: string,
  input: ResolveCommerceProductPriceInput
): CommerceResolvedUnitPrice {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.CATALOG,
    "Ürün kataloğu bu işletmede etkin değil."
  );
  if (String(input.customerId ?? "").trim()) {
    requireCapability(
      databasePath,
      BUSINESS_CAPABILITIES.CUSTOMERS,
      "Müşteri yönetimi bu işletmede etkin değil."
    );
  }
  return resolveCommerceProductPrice(databasePath, input);
}

export function fulfillRuntimeOrder(
  databasePath: string,
  input: FulfillCommerceOrderInput
): CommerceOrderFulfillmentResult {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.ORDERS,
    "Sipariş yönetimi bu işletmede etkin değil."
  );
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.SALES,
    "Satış yönetimi bu işletmede etkin değil."
  );
  if (input.settlement?.type === "credit") {
    requireCapability(
      databasePath,
      BUSINESS_CAPABILITIES.CUSTOMER_CREDIT,
      "Veresiye / Müşteri Hesabı bu işletmede etkin değil."
    );
  }
  return fulfillCommerceOrder(databasePath, input);
}

export function updateRuntimeOrderStatus(
  databasePath: string,
  input: UpdateCommerceOrderStatusInput
): CommerceOrderDetail {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.ORDERS,
    "Sipariş yönetimi bu işletmede etkin değil."
  );
  return updateCommerceOrderStatus(databasePath, input);
}

export function listRuntimeSuppliers(
  databasePath: string,
  options: ListCommerceSuppliersOptions = {}
): CommerceSupplier[] {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.RETAIL_SUPPLIERS,
    "Tedarikçi yönetimi bu işletmede etkin değil."
  );
  return listCommerceSuppliers(databasePath, options);
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

export function listRuntimePurchaseOrders(
  databasePath: string,
  options: ListCommercePurchaseOrdersOptions = {}
): CommercePurchaseOrder[] {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.RETAIL_PURCHASING,
    "Satın alma yönetimi bu işletmede etkin değil."
  );
  return listCommercePurchaseOrders(databasePath, options);
}

export function getRuntimePurchaseOrder(
  databasePath: string,
  purchaseOrderId: string
): CommercePurchaseOrderDetail | null {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.RETAIL_PURCHASING,
    "Satın alma yönetimi bu işletmede etkin değil."
  );
  return getCommercePurchaseOrder(databasePath, purchaseOrderId);
}

export function receiveRuntimePurchase(
  databasePath: string,
  input: ReceiveCommercePurchaseInput
): CommercePurchaseOrderDetail {
  requireCapability(
    databasePath,
    BUSINESS_CAPABILITIES.RETAIL_PURCHASING,
    "Satın alma ve stok girişi bu işletmede etkin değil."
  );
  if (String(input.supplierId ?? "").trim()) {
    requireCapability(
      databasePath,
      BUSINESS_CAPABILITIES.RETAIL_SUPPLIERS,
      "Tedarikçili satın alma için tedarikçi yönetimi etkin olmalı."
    );
  }
  return receiveCommercePurchase(databasePath, input);
}


function requireShipmentCapability(databasePath: string) {
  requireCapability(databasePath, BUSINESS_CAPABILITIES.ORDERS, "Sipariş yönetimi bu işletmede etkin değil.");
}

export function listRuntimeShipmentsForOrder(databasePath: string, orderId: string) {
  requireShipmentCapability(databasePath);
  return listShipmentsForOrder(databasePath, orderId);
}

export function getRuntimeShipment(databasePath: string, shipmentId: string) {
  requireShipmentCapability(databasePath);
  return getShipment(databasePath, shipmentId);
}

export function createRuntimeShipmentForOrder(databasePath: string, orderId: string) {
  requireShipmentCapability(databasePath);
  return createShipmentForOrder(databasePath, orderId);
}

export function updateRuntimeShipmentStatus(databasePath: string, input: UpdateCommerceShipmentStatusInput) {
  requireShipmentCapability(databasePath);
  return updateShipmentStatus(databasePath, input);
}


export function applyRuntimeShipmentProviderResult(databasePath: string, input: ShipmentProviderResultInput) {
  requireShipmentCapability(databasePath);
  return applyShipmentProviderResult(databasePath, input);
}
