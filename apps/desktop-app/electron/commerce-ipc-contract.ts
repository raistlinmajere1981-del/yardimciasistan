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
  CommerceProductPublication,
  SaveCommerceProductPublicationInput,
  CommerceOrder,
  CommerceOrderDetail,
  CommerceOrderFulfillmentResult,
  CommerceResolvedUnitPrice,
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
  CreateCommerceSaleInput,
  ListCatalogProductsOptions,
  CatalogProductPage,
  ListCommerceSuppliersOptions,
  ListInventoryMovementsOptions,
  SaveCatalogProductInput,
  SaveCommerceSupplierInput,
  SetInventoryCountInput
} from "./commerce-store";
import type {
  CreateCommerceOrderInput,
  InventoryCountResult,
  FulfillCommerceOrderInput,
  ListCommerceOrdersOptions,
  ResolveCommerceProductPriceInput,
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
  getMarketSaleBenefitsState: () => Promise<import("@yardimci-asistan/shared").BenefitsManagementResult<import("./market-sale-benefits").MarketSaleBenefitsState>>;
  previewMarketSaleBenefits: (input: import("./market-sale-benefits").MarketSalePreviewInput) => Promise<import("@yardimci-asistan/shared").BenefitsManagementResult<import("./market-sale-benefits").MarketSalePreview>>;
  /** Same canonical IPC operation; explicit rejection distinguishes rollback from a lost response. */
  tryCompleteMarketSale: (input: import("./market-sale-operation").CompleteMarketSaleInput) => Promise<CommerceIpcMutationResult<import("./market-sale-operation").CompleteMarketSaleResult>>;
  completeMarketSale: (input: import("./market-sale-operation").CompleteMarketSaleInput) => Promise<import("./market-sale-operation").CompleteMarketSaleResult>;
  getFullRefundMarketSalePreview: (saleId: string) => Promise<import("./market-sale-full-refund").FullRefundMarketSalePreview>;
  listMarketSaleHistory: (input: { limit: number; cursor?: import("./market-sale-full-refund").MarketSaleHistoryCursor }) => Promise<import("./market-sale-full-refund").MarketSaleHistoryPage>;
  fullRefundMarketSale: (input: import("./market-sale-full-refund").FullRefundMarketSaleInput) => Promise<import("./market-sale-full-refund").FullRefundMarketSaleResult>;
  tryFullRefundMarketSale: (input: import("./market-sale-full-refund").FullRefundMarketSaleInput) => Promise<CommerceIpcMutationResult<import("./market-sale-full-refund").FullRefundMarketSaleResult>>;

  listCategories: (options?: ListCatalogCategoriesOptions) => Promise<CatalogCategory[]>;
  saveCategory: (input: SaveCatalogCategoryInput) => Promise<CatalogCategory>;
  deleteCategory: (categoryId: string) => Promise<DeleteCatalogCategoryResult>;
  reorderCatalog: (kind: import("./commerce-catalog-presentation-store").CatalogOrderKind, orderedIds: string[], page?: { offset: number; total: number }) => Promise<void>;
  setProductQuickAccess: (productId: string, enabled: boolean) => Promise<void>;
  activateProduct: (productId: string) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;

  listProducts: (options?: ListCatalogProductsOptions) => Promise<CatalogProductPage>;
  getProductPublication: (productId: string) => Promise<CommerceProductPublication | null>;
  saveProductPublication: (input: SaveCommerceProductPublicationInput) => Promise<CommerceProductPublication>;
  saveProduct: (input: SaveCatalogProductInput) => Promise<CatalogProduct>;
  findProductByBarcode: (barcode: string) => Promise<CatalogProduct | null>;
  lookupExternalProductByBarcode: (barcode: string, mode?: ProductLookupMode) => Promise<ProductLookupResponse>;
  previewExternalProductImage: (provider: string, imageUrl: string) => Promise<string>;
  getProductImageDataUrl: (productId: string) => Promise<string>;
  listProductPhotos: (productId: string) => Promise<import("@yardimci-asistan/shared").ProductPhotoCollection>;
  previewProductPhoto: (productId: string, photoId: string) => Promise<string>;
  addProductPhotos: (input: import("@yardimci-asistan/shared").AddProductPhotosInput) => Promise<import("@yardimci-asistan/shared").ProductPhotoCollection>;
  removeProductPhoto: (input: import("@yardimci-asistan/shared").SelectProductPhotoInput) => Promise<import("@yardimci-asistan/shared").ProductPhotoCollection>;
  reorderProductPhotos: (input: import("@yardimci-asistan/shared").ReorderProductPhotosInput) => Promise<import("@yardimci-asistan/shared").ProductPhotoCollection>;
  setProductPhotoCover: (input: import("@yardimci-asistan/shared").SelectProductPhotoInput) => Promise<import("@yardimci-asistan/shared").ProductPhotoCollection>;

  getInventoryBalance: (productId: string, locationId?: string) => Promise<InventoryBalance>;
  listInventoryMovements: (options?: ListInventoryMovementsOptions) => Promise<InventoryMovement[]>;
  applyInventoryMovement: (input: ApplyInventoryMovementInput) => Promise<InventoryMovement>;
  setInventoryCount: (input: SetInventoryCountInput) => Promise<InventoryCountResult>;

  createPaidSale: (input: CreateCommerceSaleInput) => Promise<CommerceSale>;
  resolveProductPrice: (input: ResolveCommerceProductPriceInput) => Promise<CommerceResolvedUnitPrice>;

  getShippingProviderConfiguration: () => Promise<import("@yardimci-asistan/shared").ArasShippingConfiguration>;
  testShippingProviderConnection: (input?: import("@yardimci-asistan/shared").ArasShippingConfigurationInput) => Promise<import("@yardimci-asistan/shared").ShippingConnectionTestResult>;
  registerShipmentWithProvider: (shipmentId: string) => Promise<import("@yardimci-asistan/shared").CommerceShipment>;
  refreshShipmentProviderStatus: (shipmentId: string) => Promise<import("@yardimci-asistan/shared").CommerceShipment>;
  onShippingConfigurationChanged: (listener: () => void) => () => void;
  onShipmentsChanged: (listener: (orderId: string) => void) => () => void;
  listShipmentsForOrder: (orderId: string) => Promise<import("@yardimci-asistan/shared").CommerceShipment[]>;
  createShipmentForOrder: (orderId: string) => Promise<import("@yardimci-asistan/shared").CommerceShipment>;
  updateShipmentStatus: (input: import("@yardimci-asistan/shared").UpdateCommerceShipmentStatusInput) => Promise<import("@yardimci-asistan/shared").CommerceShipment>;

  onOrdersChanged: (listener: () => void) => () => void;
  listOrders: (options?: ListCommerceOrdersOptions) => Promise<CommerceOrder[]>;
  getOrder: (orderId: string) => Promise<CommerceOrderDetail | null>;
  createOrder: (input: CreateCommerceOrderInput) => Promise<CommerceIpcMutationResult<CommerceOrderDetail>>;
  updateOrderStatus: (input: UpdateCommerceOrderStatusInput) => Promise<CommerceOrderDetail>;
  fulfillOrder: (input: FulfillCommerceOrderInput) => Promise<CommerceOrderFulfillmentResult>;
  previewOrderBenefits: (input: import("@yardimci-asistan/shared").CommerceOrderBenefitsPreviewInput) => Promise<import("@yardimci-asistan/shared").BenefitsManagementResult<import("@yardimci-asistan/shared").CommerceOrderBenefitsPreview>>;
  tryFulfillOrder: (input: FulfillCommerceOrderInput) => Promise<CommerceIpcMutationResult<CommerceOrderFulfillmentResult>>;
  listCustomerCreditAccounts: (options?: ListCustomerCreditAccountsOptions) => Promise<CustomerCreditAccountSummary[]>;
  getCustomerCreditAccount: (customerId: string) => Promise<CustomerCreditAccountDetail>;
  prepareCustomerCreditWhatsApp: (input: PrepareCustomerCreditWhatsAppInput) => Promise<CustomerCreditWhatsAppPreparation>;
  listCustomerCreditEntries: (customerId: string, options?: ListCustomerCreditEntriesOptions) => Promise<CustomerCreditHistoryEntry[]>;
  createCustomerCreditSale: (input: CreateCustomerCreditSaleInput) => Promise<CommerceSale>;
  recordCustomerCreditPayment: (input: RecordCustomerCreditPaymentInput) => Promise<CustomerCreditEntry>;
  addCustomerCreditAdjustment: (input: AddCustomerCreditAdjustmentInput) => Promise<CustomerCreditEntry>;

  listCartDrafts: (options?: ListMarketCartDraftsOptions) => Promise<CommerceSaleDraftDetail[]>;
  loadCartDraftForQuickSale: (draftId: string) => Promise<MarketCartDraftLoadResult>;
  markCartDraftReviewed: (draftId: string) => Promise<CommerceSaleDraft>;
  consumePendingBarcodeScans: (options?: ConsumePendingMarketBarcodeScansOptions) => Promise<MarketBarcodeScanEvent[]>;
  setBarcodeScanMode: (active: boolean) => Promise<MarketBarcodeFastPullState>;

  listSuppliers: (options?: ListCommerceSuppliersOptions) => Promise<CommerceSupplier[]>;
  saveSupplier: (input: SaveCommerceSupplierInput) => Promise<CommerceSupplier>;

  listPurchaseOrders: (options?: ListCommercePurchaseOrdersOptions) => Promise<CommercePurchaseOrder[]>;
  receivePurchase: (input: ReceiveCommercePurchaseInput) => Promise<CommercePurchaseOrderDetail>;
}
