import { useCallback, useEffect, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
  type CatalogCategory,
  type CatalogProduct
} from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { runtimeHasCapability } from "./capabilities";
import { reportAppStatus } from "./runtime-state";

export type MarketAsyncState = "idle" | "loading" | "success" | "error";

export function useMarketController({
  businessCapabilities,
  active,
  enabled = true
}: {
  businessCapabilities: BusinessCapabilitySnapshot | null;
  active: boolean;
  enabled?: boolean;
}) {
  const bridge = window.yardimciDesktop?.commerce;
  const catalogEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.CATALOG);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [dataState, setDataState] = useState<MarketAsyncState>("idle");
  const [productDataEnabled, setProductDataEnabled] = useState(false);

  const handleStateChange = useCallback((state: Exclude<MarketAsyncState, "idle">, message: string) => {
    setDataState(state);
    reportAppStatus(state, message);
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
    if (!enabled) return;
    let disposed = false;
    const setupRequest = window.yardimciDesktop?.getSetupData?.();
    if (!setupRequest) {
      setProductDataEnabled(false);
      return () => {
        disposed = true;
      };
    }
    void setupRequest
      .then((setup) => {
        if (!disposed) setProductDataEnabled(setup.productData.enabled);
      })
      .catch(() => {
        if (!disposed) setProductDataEnabled(false);
      });
    return () => {
      disposed = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!catalogEnabled) {
      setProducts([]);
      setCategories([]);
      setDataState("idle");
      return;
    }
    if (!active) return;
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
  }, [active, catalogEnabled, enabled, reloadCatalog]);

  return {
    products,
    categories,
    dataState,
    productDataEnabled,
    reloadCatalog,
    handleStateChange
  };
}
