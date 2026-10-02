import { Archive, Boxes, ShoppingBasket, Smartphone, Tags, Truck, type LucideIcon } from "lucide-react";
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
import {
  MarketQuickSaleWorkspace
} from "../components/market/MarketQuickSaleWorkspace";
import { PageWorkSurface } from "../components/layout/PageWorkSurface";

interface MarketTabDefinition {
  id: MarketView;
  label: string;
  description: string;
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
    reloadCatalog,
    upsertProduct,
    handleStateChange
  } = controller;

  const tabs = useMemo<MarketTabDefinition[]>(() => [
    { id: "quickSale", label: "Hızlı Satış", description: "Kasada hızlı ürün ekleme ve ödeme", icon: ShoppingBasket, enabled: catalogEnabled && salesEnabled },
    { id: "products", label: "Ürünler", description: "Ürün ve kategori yönetimi", icon: Archive, enabled: catalogEnabled },
    { id: "phoneCarts", label: "Telefon Sepetleri", description: "Telefonda hazırlanan satış sepetleri", icon: Smartphone, enabled: catalogEnabled && salesEnabled },
    { id: "inventory", label: "Stok", description: "Fiziksel sayım ve hareket geçmişi", icon: Boxes, enabled: inventoryEnabled },
    { id: "purchasing", label: "Tedarikçiler / Alım", description: "Tedarikçi ve stok girişi", icon: Truck, enabled: suppliersEnabled || purchasingEnabled },
    { id: "labels", label: "Etiketler", description: "Ürün ve raf etiketi hazırlama", icon: Tags, enabled: labelsEnabled }
  ], [catalogEnabled, inventoryEnabled, labelsEnabled, purchasingEnabled, salesEnabled, suppliersEnabled]);
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
      <section className="market-page" aria-label="Market yönetimi">
      <nav className="market-tabs" aria-label="Market çalışma alanları">
        {tabs.map((tab) => {
          if (!tab.enabled) return null;
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} onClick={() => onViewChange(tab.id)}>
              <Icon size={17} aria-hidden="true" />
              <span><strong>{tab.label}</strong><small>{tab.description}</small></span>
            </button>
          );
        })}
      </nav>

      <div className={`market-workspace market-workspace--${activeTab}`}>
      {activeTab === "quickSale" ? (
        <MarketQuickSaleWorkspace
          customers={customers}
          customerCreditEnabled={customerCreditEnabled}
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
