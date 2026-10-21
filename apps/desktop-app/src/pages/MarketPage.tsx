import { useCatalogProductPage } from "../app/use-catalog-product-page";
import { FeatureViewSelector } from "../components/workspace/FeatureViewSelector";
import { useWorkspaceNavigation } from "../components/workspace/WorkspaceNavigation";
import { Archive, Boxes, ClipboardList, ShoppingBasket, Smartphone, Tags, Truck, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
  type CommerceSaleDraftDetail,
  type ProductLookupCandidate
} from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../app/capabilities";
import type { MarketController } from "../app/controller-types";
import type { MarketView } from "../components/workspace/workspace-intent";
import type { DesktopCustomer, DesktopDashboardData } from "../../electron/database";
import { useBusinessCapabilityRuntime } from "../app/business-capability-context";
import { MarketInventoryWorkspace } from "../components/market/MarketInventoryWorkspace";
import { StockImageImportWorkspace } from "../components/restaurant/StockImageImportWorkspace";
import { MarketLabelsWorkspace } from "../components/market/MarketLabelsWorkspace";
import { MarketCompanionInboxWorkspace } from "../components/market/MarketCompanionInboxWorkspace";
import {
  MarketProductsWorkspace,
  type ProductLookupFormRequest
} from "../components/market/MarketProductsWorkspace";
import { MarketPurchasingWorkspace } from "../components/market/MarketPurchasingWorkspace";
import { MarketOrdersWorkspace } from "../components/market/MarketOrdersWorkspace";
import {
  MarketQuickSaleWorkspace
} from "../components/market/MarketQuickSaleWorkspace";
import { PageWorkSurface } from "../components/layout/PageWorkSurface";

interface MarketTabDefinition {
  id: MarketView;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
}

export function MarketPage({
  customers,
  controller,
  activeView,
  onViewChange,
  onDashboardDataChanged
}: {
  customers: DesktopCustomer[];
  controller: MarketController;
  activeView: MarketView;
  onViewChange: (view: MarketView) => void;
  onDashboardDataChanged?: (data: DesktopDashboardData) => void;
}) {
  const { snapshot } = useBusinessCapabilityRuntime();
  const navigation = useWorkspaceNavigation();
  const C = BUSINESS_CAPABILITIES;
  const catalogEnabled = runtimeHasCapability(snapshot, C.CATALOG);
  const inventoryEnabled = runtimeHasCapability(snapshot, C.INVENTORY);
  const aiEnabled = runtimeHasCapability(snapshot, C.AI);
  const salesEnabled = runtimeHasCapability(snapshot, C.SALES);
  const customerCreditEnabled = runtimeHasCapability(snapshot, C.CUSTOMER_CREDIT);
  const ordersEnabled = runtimeHasCapability(snapshot, C.ORDERS);
  const barcodeEnabled = runtimeHasCapability(snapshot, C.RETAIL_BARCODE);
  const purchasingEnabled = runtimeHasCapability(snapshot, C.RETAIL_PURCHASING);
  const suppliersEnabled = runtimeHasCapability(snapshot, C.RETAIL_SUPPLIERS);
  const labelsEnabled = runtimeHasCapability(snapshot, C.RETAIL_LABELS);
  const {
    products,
    catalogRevision,
    categories,
    dataState,
    productDataEnabled,
    quickSaleSession,
    ordersSession,
    reloadCatalog,
    upsertProduct,
    handleStateChange
  } = controller;

  const tabs = useMemo<MarketTabDefinition[]>(() => [
    { id: "quickSale", label: "Yeni İşlem", icon: ShoppingBasket, enabled: catalogEnabled && salesEnabled },
    { id: "products", label: "Ürünler", icon: Archive, enabled: catalogEnabled },
    { id: "orders", label: "Siparişler", icon: ClipboardList, enabled: ordersEnabled },
    { id: "phoneCarts", label: "Telefon Sepetleri", icon: Smartphone, enabled: catalogEnabled && salesEnabled },
    { id: "inventory", label: "Stok", icon: Boxes, enabled: inventoryEnabled },
    { id: "purchasing", label: "Tedarikçiler / Alım", icon: Truck, enabled: suppliersEnabled || purchasingEnabled },
    { id: "labels", label: "Etiketler", icon: Tags, enabled: labelsEnabled }
  ], [catalogEnabled, inventoryEnabled, labelsEnabled, ordersEnabled, purchasingEnabled, salesEnabled, suppliersEnabled]);
  const availableTabs = tabs.filter((tab) => tab.enabled);
  const activeTab = availableTabs.some((tab) => tab.id === activeView)
    ? activeView
    : (availableTabs[0]?.id ?? "products");
  const auxiliaryCatalog = useCatalogProductPage("market.auxiliary", { activeOnly: true, inventoryOnly: activeTab !== "labels" }, catalogRevision,
    ["inventory", "purchasing", "labels"].includes(activeTab));
  const auxiliaryProducts = [...(auxiliaryCatalog.page?.items ?? []), ...products.filter(product => !auxiliaryCatalog.page?.items.some(item => item.id === product.id))];
  const [productLookupRequest, setProductLookupRequest] = useState<ProductLookupFormRequest | null>(null);
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const productHandoffRequestId = useRef(0);

  useEffect(() => {
    if (activeTab !== activeView) {
      onViewChange(activeTab);
    }
  }, [activeTab, activeView, onViewChange]);

  function handleStockImageApplied(data: DesktopDashboardData) {
    onDashboardDataChanged?.(data);
    setInventoryRevision((current) => current + 1);
    void reloadCatalog().catch((error) => {
      handleStateChange("error", error instanceof Error ? error.message : "Katalog yenilenemedi.");
    });
  }

  function openCartDraft(detail: CommerceSaleDraftDetail) {
    const request = quickSaleSession.requestCartDraft(detail.draft.id);
    if (!request) {
      handleStateChange("error", "Önce devam eden satışı veya kapanamayan telefon sepetini tamamlayın.");
      onViewChange("quickSale");
      return;
    }
    onViewChange("quickSale");
  }

  const openExternalProduct = useCallback((product: ProductLookupCandidate) => {
    productHandoffRequestId.current += 1;
    setProductLookupRequest({ requestId: productHandoffRequestId.current, product });
    onViewChange("products");
  }, [onViewChange]);

  const clearProductLookupRequest = useCallback((requestId: number) => {
    setProductLookupRequest((current) => current?.requestId === requestId ? null : current);
  }, []);

  return (
    <PageWorkSurface mode="fill" className="market-page-surface">
      <section className="market-page" aria-label="Satış yönetimi">
      <FeatureViewSelector label="Satış çalışma alanları" value={activeTab} onChange={onViewChange}
        items={tabs.filter(tab => tab.enabled).map(tab => { const Icon = tab.icon; return {id:tab.id,label:tab.label,icon:<Icon size={17} aria-hidden="true" />}; })} />

      <div className={`market-workspace market-workspace--${activeTab}`}>
      {activeTab === "quickSale" ? (
        <MarketQuickSaleWorkspace
          customers={customers}
          ordersEnabled={ordersEnabled}
          onOrderCreated={detail => { ordersSession.setSearch(""); ordersSession.setStatusFilter(""); ordersSession.setSelectedOrder(detail); onViewChange("orders"); }}
          customerCreditEnabled={customerCreditEnabled}
          customerSelectionEnabled={runtimeHasCapability(snapshot, C.CUSTOMERS)}
          onCreateCustomer={() => navigation.openWorkspace({ entityType: "customer", entityId: "new-customer", mode: "create", returnContext: { page: "market", view: "quickSale" } }, {
            onReturn: context => { if (context.createdEntityId) quickSaleSession.setCustomerId(context.createdEntityId); }
          })}
          catalogRevision={catalogRevision}
          categories={categories}
          session={quickSaleSession}
          barcodeEnabled={barcodeEnabled}
          busy={dataState === "loading"}
          onSaleCompleted={reloadCatalog}
          onStateChange={handleStateChange}
          cartDraftRequest={quickSaleSession.cartDraftRequest}
          onCartDraftLoaded={quickSaleSession.clearCartDraftRequest}
          onCartDraftReviewed={quickSaleSession.clearCartDraftRequest}
          onExternalProductFound={openExternalProduct}
        />
      ) : activeTab === "products" ? (
        <MarketProductsWorkspace
          catalogRevision={catalogRevision}
          categories={categories}
          busy={dataState === "loading"}
          productDataEnabled={productDataEnabled}
          onReload={reloadCatalog}
          onStateChange={handleStateChange}
          productLookupRequest={productLookupRequest}
          onProductLookupLoaded={clearProductLookupRequest}
        />
      ) : activeTab === "orders" ? (
        <MarketOrdersWorkspace
          session={ordersSession}
          customerCreditEnabled={customerCreditEnabled}
          busy={dataState === "loading"}
          onStateChange={handleStateChange}
        />
      ) : activeTab === "phoneCarts" ? (
        <MarketCompanionInboxWorkspace
          cartDraftsEnabled={catalogEnabled && salesEnabled}
          busy={dataState === "loading"}
          onOpenCartDraft={openCartDraft}
          onStateChange={handleStateChange}
        />
      ) : activeTab === "inventory" ? (
        <MarketInventoryWorkspace
          products={auxiliaryProducts}
          busy={dataState === "loading"}
          onStateChange={handleStateChange}
          refreshRevision={inventoryRevision}
          utilityAction={catalogEnabled && inventoryEnabled && aiEnabled
            ? <StockImageImportWorkspace products={auxiliaryProducts} onApplied={handleStockImageApplied} />
            : undefined}
        />
      ) : activeTab === "purchasing" ? (
        <MarketPurchasingWorkspace
          products={auxiliaryProducts}
          busy={dataState === "loading"}
          onStateChange={handleStateChange}
        />
      ) : (
        <MarketLabelsWorkspace
          products={auxiliaryProducts}
          categories={categories}
          busy={dataState === "loading"}
          onProductSelected={upsertProduct}
          onStateChange={handleStateChange}
        />
      )}
      </div>
      </section>
    </PageWorkSurface>
  );
}
