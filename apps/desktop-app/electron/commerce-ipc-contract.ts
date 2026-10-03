import type { CustomerCreditWhatsAppPreparation, PrepareCustomerCreditWhatsAppInput } from "./customer-credit-whatsapp";
import type {
  AddCustomerCreditAdjustmentInput,
  CreateCustomerCreditSaleInput,
  CustomerCreditAccountDetail,
  CustomerCreditAccountSummary,
  CustomerCreditEntry,
  CustomerCreditHistoryEntry,
  ListCustomerCreditAccountsOptions,
  ListCustomerCreditEntriesOptions,
  RecordCustomerCreditPaymentInput,
  CatalogCategory,
  CatalogProduct,
  CommerceOrder,
  CommerceOrderDetail,
  CommercePurchaseOrder,
  CommercePurchaseOrderDetail,
  CommerceSale,
  CommerceSaleDraft,
  CommerceSaleDraftDetail,
  CommerceSupplier,
  InventoryBalance,
  InventoryMovement,
  MarketBarcodeScanEvent,
  MarketCartDraftLoadResult,
  ProductLookupMode,
  ProductLookupResponse
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
import type {
  CreateCommerceOrderInput,
  InventoryCountResult,
  ListCommerceOrdersOptions,
  UpdateCommerceOrderStatusInput
} from "./commerce-runtime";
import type {
  ConsumePendingMarketBarcodeScansOptions,
  ListMarketCartDraftsOptions
} from "./market-companion-runtime";

export type CommerceIpcMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; expected: true; code: string; message: string };

export interface MarketBarcodeFastPullState {
  active: boolean;
  intervalMs: number;
  transport: "hosting";
}

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
  lookupExternalProductByBarcode: (barcode: string, mode?: ProductLookupMode) => Promise<ProductLookupResponse>;
  previewExternalProductImage: (provider: string, imageUrl: string) => Promise<string>;
  getProductImageDataUrl: (productId: string) => Promise<string>;

  getInventoryBalance: (productId: string, locationId?: string) => Promise<InventoryBalance>;
  listInventoryMovements: (options?: ListInventoryMovementsOptions) => Promise<InventoryMovement[]>;
  applyInventoryMovement: (input: ApplyInventoryMovementInput) => Promise<InventoryMovement>;
  setInventoryCount: (input: SetInventoryCountInput) => Promise<InventoryCountResult>;

  createPaidSale: (input: CreateCommerceSaleInput) => Promise<CommerceSale>;

  listOrders: (options?: ListCommerceOrdersOptions) => Promise<CommerceOrder[]>;
  getOrder: (orderId: string) => Promise<CommerceOrderDetail | null>;
  createOrder: (input: CreateCommerceOrderInput) => Promise<CommerceOrderDetail>;
  updateOrderStatus: (input: UpdateCommerceOrderStatusInput) => Promise<CommerceOrderDetail>;
  listCustomerCreditAccounts: (options?: ListCustomerCreditAccountsOptions) => Promise<CustomerCreditAccountSummary[]>;
  getCustomerCreditAccount: (customerId: string) => Promise<CustomerCreditAccountDetail>;
  prepareCustomerCreditWhatsApp: (input: PrepareCustomerCreditWhatsAppInput) => Promise<CustomerCreditWhatsAppPreparation>;
  listCustomerCreditEntries: (customerId: string, options?: ListCustomerCreditEntriesOptions) => Promise<CustomerCreditHistoryEntry[]>;
  createCustomerCreditSale: (input: CreateCustomerCreditSaleInput) => Promise<CommerceSale>;
  recordCustomerCreditPayment: (input: RecordCustomerCreditPaymentInput) => Promise<CustomerCreditEntry>;
  addCustomerCreditAdjustment: (input: AddCustomerCreditAdjustmentInput) => Promise<CustomerCreditEntry>;

  listCartDrafts: (options?: ListMarketCartDraftsOptions) => Promise<CommerceSaleDraftDetail[]>;
  getCartDraft: (draftId: string) => Promise<CommerceSaleDraftDetail | null>;
  loadCartDraftForQuickSale: (draftId: string) => Promise<MarketCartDraftLoadResult>;
  markCartDraftReviewed: (draftId: string) => Promise<CommerceSaleDraft>;
  consumePendingBarcodeScans: (options?: ConsumePendingMarketBarcodeScansOptions) => Promise<MarketBarcodeScanEvent[]>;
  setBarcodeScanMode: (active: boolean) => Promise<MarketBarcodeFastPullState>;

  listSuppliers: (options?: ListCommerceSuppliersOptions) => Promise<CommerceSupplier[]>;
  saveSupplier: (input: SaveCommerceSupplierInput) => Promise<CommerceSupplier>;

  listPurchaseOrders: (options?: ListCommercePurchaseOrdersOptions) => Promise<CommercePurchaseOrder[]>;
  getPurchaseOrder: (purchaseOrderId: string) => Promise<CommercePurchaseOrderDetail | null>;
  receivePurchase: (input: ReceiveCommercePurchaseInput) => Promise<CommercePurchaseOrderDetail>;
}
