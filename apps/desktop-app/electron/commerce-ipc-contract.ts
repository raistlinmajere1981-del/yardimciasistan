import type {
  CatalogCategory,
  CatalogProduct,
  CommercePurchaseOrder,
  CommercePurchaseOrderDetail,
  CommerceSale,
  CommerceSupplier,
  InventoryBalance,
  InventoryMovement
} from "@yardimci-asistan/shared";
import type {
  DeleteCatalogCategoryResult,
  ListCatalogCategoriesOptions,
  SaveCatalogCategoryInput
} from "./commerce-category-store";
import type {
  ListCommercePurchaseOrdersOptions,
  ReceiveCommercePurchaseInput
} from "./commerce-purchase-store";
import type {
  ApplyInventoryMovementInput,
  CommerceStoreSnapshot,
  CreateCommerceSaleInput,
  ListCatalogProductsOptions,
  ListCommerceSuppliersOptions,
  ListInventoryMovementsOptions,
  SaveCatalogProductInput,
  SaveCommerceSupplierInput,
  SetInventoryCountInput
} from "./commerce-store";
import type { InventoryCountResult } from "./commerce-runtime";

/**
 * Renderer-facing commerce contract. This deliberately exposes the capability-
 * guarded commerce runtime rather than repository/store functions.
 */
export interface DesktopCommerceBridge {
  getSnapshot: () => Promise<CommerceStoreSnapshot>;

  listCategories: (options?: ListCatalogCategoriesOptions) => Promise<CatalogCategory[]>;
  getCategory: (categoryId: string) => Promise<CatalogCategory | null>;
  saveCategory: (input: SaveCatalogCategoryInput) => Promise<CatalogCategory>;
  deleteCategory: (categoryId: string) => Promise<DeleteCatalogCategoryResult>;

  listProducts: (options?: ListCatalogProductsOptions) => Promise<CatalogProduct[]>;
  saveProduct: (input: SaveCatalogProductInput) => Promise<CatalogProduct>;
  findProductByBarcode: (barcode: string) => Promise<CatalogProduct | null>;

  getInventoryBalance: (productId: string, locationId?: string) => Promise<InventoryBalance>;
  listInventoryMovements: (options?: ListInventoryMovementsOptions) => Promise<InventoryMovement[]>;
  applyInventoryMovement: (input: ApplyInventoryMovementInput) => Promise<InventoryMovement>;
  setInventoryCount: (input: SetInventoryCountInput) => Promise<InventoryCountResult>;

  createPaidSale: (input: CreateCommerceSaleInput) => Promise<CommerceSale>;

  listSuppliers: (options?: ListCommerceSuppliersOptions) => Promise<CommerceSupplier[]>;
  saveSupplier: (input: SaveCommerceSupplierInput) => Promise<CommerceSupplier>;

  listPurchaseOrders: (options?: ListCommercePurchaseOrdersOptions) => Promise<CommercePurchaseOrder[]>;
  getPurchaseOrder: (purchaseOrderId: string) => Promise<CommercePurchaseOrderDetail | null>;
  receivePurchase: (input: ReceiveCommercePurchaseInput) => Promise<CommercePurchaseOrderDetail>;
}
