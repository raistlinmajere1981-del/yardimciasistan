import { Archive, Boxes, ShoppingBasket, Smartphone, Tags, Truck, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
  type CatalogCategory,
  type CatalogProduct,
  type CommerceSaleDraftDetail,
  type CommerceSale
} from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../app/capabilities";
import { reportAppStatus } from "../app/runtime-state";
import type { DesktopCustomer } from "../../electron/database";
import { useBusinessCapabilityRuntime } from "../app/business-capability-context";
import { MarketInventoryWorkspace } from "../components/market/MarketInventoryWorkspace";
import { MarketLabelsWorkspace } from "../components/market/MarketLabelsWorkspace";
import { MarketCompanionInboxWorkspace } from "../components/market/MarketCompanionInboxWorkspace";
import { MarketProductsWorkspace } from "../components/market/MarketProductsWorkspace";
import { MarketPurchasingWorkspace } from "../components/market/MarketPurchasingWorkspace";
import {
  MarketQuickSaleWorkspace,
  type CartDraftQuickSaleRequest
} from "../components/market/MarketQuickSaleWorkspace";

type MarketTab = "quickSale" | "products" | "phoneCarts" | "inventory" | "purchasing" | "labels";
type AsyncState = "idle" | "loading" | "success" | "error";

interface MarketTabDefinition {
  id: MarketTab;
  label: string;
  description: string;
  icon: LucideIcon;
  enabled: boolean;
}

export function MarketPage({ customers }: { customers: DesktopCustomer[] }) {
  const { snapshot } = useBusinessCapabilityRuntime();
  const bridge = window.yardimciDesktop?.commerce;
  const C = BUSINESS_CAPABILITIES;
  const catalogEnabled = runtimeHasCapability(snapshot, C.CATALOG);
  const inventoryEnabled = runtimeHasCapability(snapshot, C.INVENTORY);
  const salesEnabled = runtimeHasCapability(snapshot, C.SALES);
  const customerCreditEnabled = runtimeHasCapability(snapshot, C.CUSTOMER_CREDIT);
  const barcodeEnabled = runtimeHasCapability(snapshot, C.RETAIL_BARCODE);
  const purchasingEnabled = runtimeHasCapability(snapshot, C.RETAIL_PURCHASING);
  const suppliersEnabled = runtimeHasCapability(snapshot, C.RETAIL_SUPPLIERS);
  const labelsEnabled = runtimeHasCapability(snapshot, C.RETAIL_LABELS);

  const tabs = useMemo<MarketTabDefinition[]>(() => [
    { id: "quickSale", label: "Hızlı Satış", description: "Kasada hızlı ürün ekleme ve ödeme", icon: ShoppingBasket, enabled: catalogEnabled && salesEnabled },
    { id: "products", label: "Ürünler", description: "Ürün ve kategori yönetimi", icon: Archive, enabled: catalogEnabled },
    { id: "phoneCarts", label: "Telefon Sepetleri", description: "Telefonda hazırlanan satış sepetleri", icon: Smartphone, enabled: catalogEnabled && salesEnabled },
    { id: "inventory", label: "Stok", description: "Fiziksel sayım ve hareket geçmişi", icon: Boxes, enabled: inventoryEnabled },
    { id: "purchasing", label: "Tedarikçiler / Alım", description: "Tedarikçi ve stok girişi", icon: Truck, enabled: suppliersEnabled || purchasingEnabled },
    { id: "labels", label: "Etiketler", description: "Ürün ve raf etiketi hazırlama", icon: Tags, enabled: labelsEnabled }
  ], [catalogEnabled, inventoryEnabled, labelsEnabled, purchasingEnabled, salesEnabled, suppliersEnabled]);
  const availableTabs = tabs.filter((tab) => tab.enabled);
  const [activeTab, setActiveTab] = useState<MarketTab>(() => availableTabs[0]?.id ?? "products");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [dataState, setDataState] = useState<AsyncState>("idle");
  const [cartDraftRequest, setCartDraftRequest] = useState<CartDraftQuickSaleRequest | null>(null);
  const handoffRequestId = useRef(0);

  const handleStateChange = useCallback((state: Exclude<AsyncState, "idle">, nextMessage: string) => {
    setDataState(state);
    reportAppStatus(state, nextMessage);
  }, []);

  // Keep the pending cart load alive across status-message renders.
  const clearCartDraftRequest = useCallback((draftId: string) => {
    setCartDraftRequest((current) => current?.draftId === draftId ? null : current);
  }, []);

  const reloadCatalog = useCallback(async () => {
    if (!bridge || !catalogEnabled) {
      setProducts([]);
      setCategories([]);
      return;
    }
    const [nextProducts, nextCategories] = await Promise.all([
      bridge.listProducts({ limit: 500 }),
      bridge.listCategories({ limit: 500 })
    ]);
    setProducts(nextProducts);
    setCategories(nextCategories);
  }, [bridge, catalogEnabled]);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0]?.id ?? "products");
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    if (!catalogEnabled) return;
    setDataState("loading");
    void reloadCatalog()
      .then(() => {
        setDataState("success");
        reportAppStatus("success", "Market verileri güncel.");
      })
      .catch((error) => {
        setDataState("error");
        reportAppStatus("error", error instanceof Error ? error.message : "Market verileri yüklenemedi.");
      });
  }, [catalogEnabled, reloadCatalog]);

  async function handleSaleCompleted(sale: CommerceSale) {
    await reloadCatalog();
    setDataState("success");
    reportAppStatus("success", sale.status === "credit" ? "Veresiye satış kaydedildi." : `Satış tamamlandı: ${sale.total.toFixed(2)} ${sale.currency}.`);
  }

  function openCartDraft(detail: CommerceSaleDraftDetail) {
    handoffRequestId.current += 1;
    setCartDraftRequest({ requestId: handoffRequestId.current, draftId: detail.draft.id });
    setActiveTab("quickSale");
  }

  return (
    <section className="market-page" aria-label="Market yönetimi">
      <nav className="market-tabs" aria-label="Market çalışma alanları">
        {tabs.map((tab) => {
          if (!tab.enabled) return null;
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} onClick={() => setActiveTab(tab.id)}>
              <Icon size={17} aria-hidden="true" />
              <span><strong>{tab.label}</strong><small>{tab.description}</small></span>
            </button>
          );
        })}
      </nav>

      {activeTab === "quickSale" ? (
        <MarketQuickSaleWorkspace
          customers={customers}
          customerCreditEnabled={customerCreditEnabled}
          products={products}
          categories={categories}
          barcodeEnabled={barcodeEnabled}
          busy={dataState === "loading"}
          onSaleCompleted={handleSaleCompleted}
          onStateChange={handleStateChange}
          cartDraftRequest={cartDraftRequest}
          onCartDraftLoaded={clearCartDraftRequest}
          onCartDraftReviewed={clearCartDraftRequest}
        />
      ) : activeTab === "products" ? (
        <MarketProductsWorkspace
          products={products}
          categories={categories}
          busy={dataState === "loading"}
          onReload={reloadCatalog}
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
    </section>
  );
}
