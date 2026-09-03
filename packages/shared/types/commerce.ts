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
