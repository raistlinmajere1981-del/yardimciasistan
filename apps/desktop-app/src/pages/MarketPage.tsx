import { Archive, Boxes, Printer, ShoppingBasket, Tags, Truck, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
  type CatalogCategory,
  type CatalogProduct,
  type CommerceSale
} from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../app/capabilities";
import { useBusinessCapabilityRuntime } from "../app/business-capability-context";
import { MarketInventoryWorkspace } from "../components/market/MarketInventoryWorkspace";
import { MarketProductsWorkspace } from "../components/market/MarketProductsWorkspace";
import { MarketPurchasingWorkspace } from "../components/market/MarketPurchasingWorkspace";
import { MarketQuickSaleWorkspace } from "../components/market/MarketQuickSaleWorkspace";

type MarketTab = "quickSale" | "products" | "inventory" | "purchasing" | "labels";
type AsyncState = "idle" | "loading" | "success" | "error";

interface MarketTabDefinition {
  id: MarketTab;
  label: string;
  description: string;
  icon: LucideIcon;
  enabled: boolean;
}

function MarketEmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <section className="market-empty-state">
      <Icon size={30} aria-hidden="true" />
      <div><strong>{title}</strong><p>{description}</p></div>
    </section>
  );
}

export function MarketPage() {
  const { snapshot } = useBusinessCapabilityRuntime();
  const bridge = window.yardimciDesktop?.commerce;
  const C = BUSINESS_CAPABILITIES;
  const catalogEnabled = runtimeHasCapability(snapshot, C.CATALOG);
  const inventoryEnabled = runtimeHasCapability(snapshot, C.INVENTORY);
  const salesEnabled = runtimeHasCapability(snapshot, C.SALES);
  const purchasingEnabled = runtimeHasCapability(snapshot, C.RETAIL_PURCHASING);
  const suppliersEnabled = runtimeHasCapability(snapshot, C.RETAIL_SUPPLIERS);
  const labelsEnabled = runtimeHasCapability(snapshot, C.RETAIL_LABELS);

  const tabs = useMemo<MarketTabDefinition[]>(() => [
    { id: "quickSale", label: "Hızlı Satış", description: "Kasada hızlı ürün ekleme ve ödeme", icon: ShoppingBasket, enabled: catalogEnabled && salesEnabled },
    { id: "products", label: "Ürünler", description: "Ürün ve kategori yönetimi", icon: Archive, enabled: catalogEnabled },
    { id: "inventory", label: "Stok", description: "Fiziksel sayım ve hareket geçmişi", icon: Boxes, enabled: inventoryEnabled },
    { id: "purchasing", label: "Tedarikçiler / Alım", description: "Tedarikçi ve stok girişi", icon: Truck, enabled: suppliersEnabled || purchasingEnabled },
    { id: "labels", label: "Etiketler", description: "Ürün ve raf etiketi hazırlama", icon: Tags, enabled: labelsEnabled }
  ], [catalogEnabled, inventoryEnabled, labelsEnabled, purchasingEnabled, salesEnabled, suppliersEnabled]);
  const availableTabs = tabs.filter((tab) => tab.enabled);
  const [activeTab, setActiveTab] = useState<MarketTab>(() => availableTabs[0]?.id ?? "products");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [dataState, setDataState] = useState<AsyncState>("idle");
  const [message, setMessage] = useState("Market verileri hazır.");

  const handleStateChange = useCallback((state: Exclude<AsyncState, "idle">, nextMessage: string) => {
    setDataState(state);
    setMessage(nextMessage);
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
        setMessage("Market verileri güncel.");
      })
      .catch((error) => {
        setDataState("error");
        setMessage(error instanceof Error ? error.message : "Market verileri yüklenemedi.");
      });
  }, [catalogEnabled, reloadCatalog]);

  async function handleSaleCompleted(sale: CommerceSale) {
    await reloadCatalog();
    setDataState("success");
    setMessage(`Satış tamamlandı: ${sale.total.toFixed(2)} ${sale.currency}.`);
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

      <div className={`market-status market-status-${dataState}`} role="status" aria-live="polite">{message}</div>

      {activeTab === "quickSale" ? (
        <MarketQuickSaleWorkspace
          products={products}
          categories={categories}
          busy={dataState === "loading"}
          onSaleCompleted={handleSaleCompleted}
          onError={(nextMessage) => handleStateChange("error", nextMessage)}
        />
      ) : activeTab === "products" ? (
        <MarketProductsWorkspace
          products={products}
          categories={categories}
          busy={dataState === "loading"}
          onReload={reloadCatalog}
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
        <section className="market-panel">
          <header className="market-panel-heading"><span>Etiket</span><h2>Etiketler</h2><p>Çıktı adaptörleri M5 aşamasında bağlanacak.</p></header>
          <div className="market-placeholder-grid">
            <MarketEmptyState icon={Printer} title="Preview / PDF / PNG" description="İlk etiket adaptörü cihaz gerektirmeyen önizleme ve dosya çıktısı olacak." />
            <MarketEmptyState icon={Tags} title="Yazıcı adaptör yuvası" description="ZPL, TSPL ve sistem yazıcısı daha sonra aynı LabelPrinter sözleşmesine takılabilecek." />
          </div>
        </section>
      )}
    </section>
  );
}
