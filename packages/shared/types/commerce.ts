export type CommerceUnit =
  | "piece"
  | "kg"
  | "g"
  | "l"
  | "ml"
  | "pack"
  | "box"
  | "meter"
  | "other";

export type InventoryMovementType =
  | "sale"
  | "purchase"
  | "waste"
  | "count"
  | "adjust"
  | "return_in"
  | "return_out";

export type CommercePurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "received"
  | "cancelled";

export interface CatalogCategory {
  id: string;
  businessId: string;
  name: string;
  parentId: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProduct {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  sku: string;
  barcode: string;
  description: string;
  salePrice: number;
  purchasePrice: number;
  currency: string;
  unit: CommerceUnit;
  taxRate: number;
  trackInventory: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLocation {
  id: string;
  businessId: string;
  name: string;
  code: string;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBalance {
  productId: string;
  locationId: string;
  quantity: number;
  minimumQuantity: number;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  businessId: string;
  productId: string;
  locationId: string;
  type: InventoryMovementType;
  quantityDelta: number;
  quantityAfter: number;
  unitCost: number;
  referenceType: string;
  referenceId: string;
  note: string;
  actorSource: string;
  createdAt: string;
}

export interface CommerceSale {
  id: string;
  businessId: string;
  status: "open" | "paid" | "cancelled";
  subtotal: number;
  discountTotal: number;
  total: number;
  currency: string;
  paymentMethod: string;
  source: string;
  openedAt: string;
  closedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceSaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  barcode: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  createdAt: string;
}

export interface CommerceSupplier {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  email: string;
  taxNumber: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommercePurchaseOrder {
  id: string;
  businessId: string;
  supplierId: string;
  status: CommercePurchaseOrderStatus;
  orderedAt: string;
  receivedAt: string;
  subtotal: number;
  total: number;
  currency: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommercePurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommercePurchaseOrderDetail {
  order: CommercePurchaseOrder;
  items: CommercePurchaseOrderItem[];
}

export type MarketDraftStatus = "pending" | "reviewed";

export interface CatalogProductDraft {
  id: string;
  businessId: string;
  barcode: string;
  proposedName: string;
  sku: string;
  proposedCategory: string;
  proposedPurchasePrice: number;
  proposedSalePrice: number;
  currency: string;
  unit: CommerceUnit;
  note: string;
  source: string;
  createdByDevice: string;
  status: MarketDraftStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceSaleDraft {
  id: string;
  businessId: string;
  status: MarketDraftStatus;
  source: string;
  createdByDevice: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceSaleDraftItem {
  id: string;
  draftId: string;
  productId: string;
  productName: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceSaleDraftDetail {
  draft: CommerceSaleDraft;
  items: CommerceSaleDraftItem[];
}

export interface MarketCartDraftResolvedItem {
  draftItemId: string;
  product: CatalogProduct;
  quantity: number;
}

export interface MarketCartDraftSkippedItem {
  draftItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: "missing_or_inactive";
}

/**
 * Read-only hand-off from a phone cart draft to desktop Quick Sale. Product
 * snapshots in this result come from the current local catalog, never Android.
 */
export interface MarketCartDraftLoadResult {
  draft: CommerceSaleDraft;
  items: MarketCartDraftResolvedItem[];
  skippedItems: MarketCartDraftSkippedItem[];
}

export type MarketBarcodeScanEventStatus = "pending" | "consumed" | "expired";

/**
 * Transport-neutral, ephemeral barcode observation. It is deliberately not a
 * sale, cart draft, inventory movement, or finance record.
 */
export interface MarketBarcodeScanEvent {
  id: string;
  businessId: string;
  androidActionId: string;
  deviceId: string;
  barcode: string;
  scannedAt: string;
  receivedAt: string;
  consumedAt: string;
  status: MarketBarcodeScanEventStatus;
}
