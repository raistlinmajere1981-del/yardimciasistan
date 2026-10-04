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

export type ProductDataProviderId = "open_food_facts";
export type ProductLookupMode = "automatic" | "manual";

export interface ProductLookupCandidate {
  provider: ProductDataProviderId;
  barcode: string;
  name: string;
  brand: string;
  quantity: string;
  categoryHint: string;
  imageUrl: string;
  sourceProductUrl: string;
  dataLicense: string;
  imageLicense: string;
  fetchedAt: string;
}

export type ProductLookupResponse =
  | { status: "found"; product: ProductLookupCandidate }
  | { status: "not_found"; barcode: string; provider: ProductDataProviderId }
  | { status: "disabled"; reason: "service_disabled" | "automatic_search_disabled" };

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
  brand: string;
  sku: string;
  barcode: string;
  description: string;
  salePrice: number;
  dealerPriceA?: number | null;
  dealerPriceB?: number | null;
  purchasePrice: number;
  currency: string;
  unit: CommerceUnit;
  taxRate: number;
  trackInventory: boolean;
  isActive: boolean;
  imageAssetPath: string;
  imageSourceUrl: string;
  dataSource: string;
  sourceProductUrl: string;
  dataLicense: string;
  imageLicense: string;
  sourceFetchedAt: string;
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
  /** credit is a completed sale charged to an account, never cash received.
   * Account payments are not allocated back to individual sales in M8.1. */
  status: "open" | "paid" | "credit" | "cancelled";
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

export type CommerceOrderStatus =
  | "placed"
  | "confirmed"
  | "fulfilled"
  | "cancelled";

export interface CommerceOrder {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  /** Contact at submission time; independent of canonical Customer identity. */
  buyerSnapshot: CommerceOrderBuyerSnapshot | null;
  deliverySnapshot: CommerceOrderDeliverySnapshot;
  status: CommerceOrderStatus;
  source: string;
  sourceReference: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  currency: string;
  note: string;
  placedAt: string;
  confirmedAt: string;
  fulfilledAt: string;
  cancelledAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceOrderBuyerSnapshot {
  name: string;
  phone: string;
  email?: string;
}

export type CommerceOrderDeliveryMethod = "pickup" | "shipping";

/** Immutable order address; independent of Customer identity/address. */
export interface CommerceOrderShippingAddress {
  recipientName: string;
  addressLine1: string;
  addressLine2?: string;
  district: string;
  city: string;
  postalCode?: string;
  countryCode: string;
  note?: string;
}

export type CommerceOrderDeliverySnapshot =
  | { method: "pickup"; address: null }
  | { method: "shipping"; address: CommerceOrderShippingAddress };

export interface OnlineSalesDeliverySettings {
  pickupEnabled: boolean;
  shippingEnabled: boolean;
}

export interface CommerceOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  unit: CommerceUnit;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  taxRate: number;
  createdAt: string;
}

export interface CommerceOrderDetail {
  order: CommerceOrder;
  items: CommerceOrderItem[];
}

export type CommerceOrderFulfillmentSettlement =
  | { type: "paid"; paymentMethod: "cash" | "card" | "bank" | "other" }
  | { type: "credit" }
  | { type: "no_payment" };

export interface FulfillCommerceOrderInput {
  orderId: string;
  operationKey: string;
  settlement: CommerceOrderFulfillmentSettlement;
  locationId?: string;
}

export interface CommerceOrderFulfillment {
  id: string;
  businessId: string;
  orderId: string;
  saleId: string;
  operationKey: string;
  settlementType: CommerceOrderFulfillmentSettlement["type"];
  paymentMethod: string;
  inventoryLocationId: string;
  createdAt: string;
}

export interface CommerceOrderFulfillmentResult {
  fulfillment: CommerceOrderFulfillment;
  order: CommerceOrderDetail;
  sale: CommerceSale;
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

/** Channel settings attached to a canonical Catalog Product; never a second Product. */
export interface CommerceProductPublication {
  productId: string;
  businessId: string;
  channel: "online_sales";
  isPublished: boolean;
  titleOverride: string;
  descriptionOverride: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCommerceProductPublicationInput {
  productId: string;
  channel?: "online_sales";
  isPublished: boolean;
  titleOverride?: string;
  descriptionOverride?: string;
  sortOrder?: number;
}

/** Public allowlist: no barcode, cost, dealer price or private product metadata. */
export interface PublishedCommerceProduct {
  productId: string;
  name: string;
  description: string;
  sku: string;
  unit: CommerceUnit;
  price: number;
  currency: string;
  taxRate: number;
  imageUrl: string;
  /** Listing eligibility only; does not promise stock or reserve inventory. */
  availability: "available";
  sortOrder: number;
}

export interface CommerceOnlineCatalog {
  deliveryMethods: CommerceOrderDeliveryMethod[];
  version: 1;
  enabled: boolean;
  updatedAt: string;
  products: PublishedCommerceProduct[];
}
