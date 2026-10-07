import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
  type CatalogCategory,
  type CatalogProduct
} from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { runtimeHasCapability } from "./capabilities";
import { reportAppStatus } from "./runtime-state";
import { useMarketOrdersSession } from "./use-market-orders-session";
import { useMarketQuickSaleSession } from "./use-market-quick-sale-session";

export type MarketAsyncState = "idle" | "loading" | "success" | "error";

export function useMarketController({
  businessCapabilities,
  active,
  enabled = true,
  productDataEnabled = false
}: {
  businessCapabilities: BusinessCapabilitySnapshot | null;
  active: boolean;
  enabled?: boolean;
  productDataEnabled?: boolean;
}) {
  const bridge = window.yardimciDesktop?.commerce;
  const catalogEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.CATALOG);
  const customerCreditEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.CUSTOMER_CREDIT);
  const quickSaleSession = useMarketQuickSaleSession({ customerCreditEnabled,
    customerSelectionEnabled: runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.CUSTOMERS),
    pricingContext: businessCapabilities?.enabledCapabilities.join("|") ?? "" });
  const refreshSalePrices = quickSaleSession.refreshPrices;
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [dataState, setDataState] = useState<MarketAsyncState>("idle");
  const enabledRef = useRef(enabled);
  const reloadGeneration = useRef(0);
  const pinnedProducts = useRef(new Map<string, CatalogProduct>());
  enabledRef.current = enabled;

  const handleStateChange = useCallback((state: Exclude<MarketAsyncState, "idle">, message: string) => {
    setDataState(state);
    reportAppStatus(state, message);
  }, []);

  const ordersSession = useMarketOrdersSession({
    enabled: enabled && runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.ORDERS),
    onStateChange: handleStateChange
  });

  const upsertProduct = useCallback((product: CatalogProduct) => {
    reloadGeneration.current += 1;
    pinnedProducts.current.set(product.id, product);
    setProducts((current) => {
      const existingIndex = current.findIndex((item) => item.id === product.id);
      if (existingIndex < 0) return [...current, product];
      return current.map((item, index) => index === existingIndex ? product : item);
    });
  }, []);

  const reloadCatalog = useCallback(async () => {
    if (!enabledRef.current || !bridge || !catalogEnabled) {
      if (enabledRef.current) {
        setProducts([]);
        setCategories([]);
      }
      return;
    }
    const request = ++reloadGeneration.current;
    const [nextProducts, nextCategories] = await Promise.all([
      bridge.listProducts({ limit: 500 }),
      bridge.listCategories({ limit: 500 })
    ]);
    if (!enabledRef.current || request !== reloadGeneration.current) return;

    const nextIds = new Set(nextProducts.map((product) => product.id));
    for (const product of nextProducts) pinnedProducts.current.delete(product.id);
    const retainedProducts = [...pinnedProducts.current.values()].filter((product) => !nextIds.has(product.id));
    setProducts([...nextProducts, ...retainedProducts]);
    setCategories(nextCategories);
    refreshSalePrices();
  }, [bridge, catalogEnabled, refreshSalePrices]);

  useEffect(() => {
    if (!enabled) {
      reloadGeneration.current += 1;
      return;
    }
    if (!catalogEnabled) {
      reloadGeneration.current += 1;
      pinnedProducts.current.clear();
      setProducts([]);
      setCategories([]);
      setDataState("idle");
      return;
    }
    if (!active) return;
    let disposed = false;
    setDataState("loading");
    void reloadCatalog()
      .then(() => {
        if (disposed || !enabledRef.current) return;
        setDataState("success");
        reportAppStatus("success", "Market verileri güncel.");
      })
      .catch((error) => {
        if (disposed || !enabledRef.current) return;
        setDataState("error");
        reportAppStatus("error", error instanceof Error ? error.message : "Market verileri yüklenemedi.");
      });
    return () => {
      disposed = true;
    };
  }, [active, catalogEnabled, enabled, reloadCatalog]);

  return {
    products,
    categories,
    dataState,
    productDataEnabled,
    quickSaleSession,
    ordersSession,
    reloadCatalog,
    upsertProduct,
    handleStateChange
  };
}
