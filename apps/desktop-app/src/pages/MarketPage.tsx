import { FeatureViewSelector } from "../components/workspace/FeatureViewSelector";
import { Archive, Boxes, ClipboardList, ShoppingBasket, Smartphone, Tags, Truck, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
  type CommerceSaleDraftDetail,
  type CommerceSale,
  type ProductLookupCandidate
} from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../app/capabilities";
import type { MarketController } from "../app/controller-types";
import type { MarketView } from "../components/workspace/workspace-intent";
import type { DesktopCustomer } from "../../electron/database";
import { useBusinessCapabilityRuntime } from "../app/business-capability-context";
import { MarketInventoryWorkspace } from "../components/market/MarketInventoryWorkspace";
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
  onViewChange
}: {
  customers: DesktopCustomer[];
  controller: MarketController;
  activeView: MarketView;
  onViewChange: (view: MarketView) => void;
}) {
  const { snapshot } = useBusinessCapabilityRuntime();
  const C = BUSINESS_CAPABILITIES;
  const catalogEnabled = runtimeHasCapability(snapshot, C.CATALOG);
  const inventoryEnabled = runtimeHasCapability(snapshot, C.INVENTORY);
  const salesEnabled = runtimeHasCapability(snapshot, C.SALES);
  const customerCreditEnabled = runtimeHasCapability(snapshot, C.CUSTOMER_CREDIT);
  const ordersEnabled = runtimeHasCapability(snapshot, C.ORDERS);
  const wholesaleEnabled = runtimeHasCapability(snapshot, C.WHOLESALE);
  const barcodeEnabled = runtimeHasCapability(snapshot, C.RETAIL_BARCODE);
  const purchasingEnabled = runtimeHasCapability(snapshot, C.RETAIL_PURCHASING);
  const suppliersEnabled = runtimeHasCapability(snapshot, C.RETAIL_SUPPLIERS);
  const labelsEnabled = runtimeHasCapability(snapshot, C.RETAIL_LABELS);
  const {
    products,
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
    { id: "quickSale", label: "Hızlı Satış", icon: ShoppingBasket, enabled: catalogEnabled && salesEnabled },
    { id: "products", label: "Ürünler", icon: Archive, enabled: catalogEnabled },
    { id: "orders", label: "Siparişler", icon: ClipboardList, enabled: ordersEnabled && wholesaleEnabled },
    { id: "phoneCarts", label: "Telefon Sepetleri", icon: Smartphone, enabled: catalogEnabled && salesEnabled },
    { id: "inventory", label: "Stok", icon: Boxes, enabled: inventoryEnabled },
    { id: "purchasing", label: "Tedarikçiler / Alım", icon: Truck, enabled: suppliersEnabled || purchasingEnabled },
    { id: "labels", label: "Etiketler", icon: Tags, enabled: labelsEnabled }
  ], [catalogEnabled, inventoryEnabled, labelsEnabled, ordersEnabled, purchasingEnabled, salesEnabled, suppliersEnabled, wholesaleEnabled]);
  const availableTabs = tabs.filter((tab) => tab.enabled);
  const activeTab = availableTabs.some((tab) => tab.id === activeView)
    ? activeView
    : (availableTabs[0]?.id ?? "products");
  const [productLookupRequest, setProductLookupRequest] = useState<ProductLookupFormRequest | null>(null);
  const productHandoffRequestId = useRef(0);

  useEffect(() => {
    if (activeTab !== activeView) {
      onViewChange(activeTab);
    }
  }, [activeTab, activeView, onViewChange]);

  async function handleSaleCompleted(sale: CommerceSale) {
    await reloadCatalog();
    handleStateChange(
      "success",
      sale.status === "credit"
        ? "Veresiye satış kaydedildi."
        : `Satış tamamlandı: ${sale.total.toFixed(2)} ${sale.currency}.`
    );
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
  }, []);

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
          customerCreditEnabled={customerCreditEnabled}
          customerSelectionEnabled={runtimeHasCapability(snapshot, C.CUSTOMERS)}
          products={products}
          categories={categories}
          session={quickSaleSession}
          barcodeEnabled={barcodeEnabled}
          inventoryEnabled={inventoryEnabled}
          busy={dataState === "loading"}
          onSaleCompleted={handleSaleCompleted}
          onStateChange={handleStateChange}
          cartDraftRequest={quickSaleSession.cartDraftRequest}
          onCartDraftLoaded={quickSaleSession.clearCartDraftRequest}
          onCartDraftReviewed={quickSaleSession.clearCartDraftRequest}
          onExternalProductFound={openExternalProduct}
        />
      ) : activeTab === "products" ? (
        <MarketProductsWorkspace
          products={products}
          categories={categories}
          busy={dataState === "loading"}
          productDataEnabled={productDataEnabled}
          onReload={reloadCatalog}
          onProductSaved={upsertProduct}
          onStateChange={handleStateChange}
          productLookupRequest={productLookupRequest}
          onProductLookupLoaded={clearProductLookupRequest}
        />
      ) : activeTab === "orders" ? (
        <MarketOrdersWorkspace
          session={ordersSession}
          customers={customers}
          products={products}
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
          products={products}
          busy={dataState === "loading"}
          onStateChange={handleStateChange}
        />
      ) : activeTab === "purchasing" ? (
        <MarketPurchasingWorkspace
          products={products}
          busy={dataState === "loading"}
          onStateChange={handleStateChange}
        />
      ) : (
        <MarketLabelsWorkspace
          products={products}
          categories={categories}
          busy={dataState === "loading"}
          onStateChange={handleStateChange}
        />
      )}
      </div>
      </section>
    </PageWorkSurface>
  );
}
