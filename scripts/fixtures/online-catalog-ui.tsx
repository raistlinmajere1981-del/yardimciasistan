import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES, type CatalogProduct } from "@yardimci-asistan/shared";
import { productWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { MarketProductsWorkspace } from "../../apps/desktop-app/src/components/market/MarketProductsWorkspace";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import "../../apps/desktop-app/src/styles/index.css";
const control = window as typeof window & { __product: CatalogProduct; __onlineToggle?: (enabled: boolean) => void };
function Harness() {
  const navigation = useWorkspaceNavigation();
  const [enabled, setEnabled] = useState(true);
  const [products, setProducts] = useState([control.__product]);
  const onProductSaved = (saved: CatalogProduct) => setProducts((current) => [...current.filter((item) => item.id !== saved.id), saved]);
  useEffect(() => { control.__onlineToggle = setEnabled; return () => { delete control.__onlineToggle; }; }, []);
  return <BusinessCapabilityRuntimeProvider value={{ snapshot: { businessId: "fixture", profileId: "market", capabilities: [], enabledCapabilities: [BUSINESS_CAPABILITIES.CATALOG, ...(enabled ? [BUSINESS_CAPABILITIES.ONLINE_SALES] : [])] }, state: "success", message: "", setCapability: async () => undefined, clearOverride: async () => undefined }}>
    <MarketProductsWorkspace products={products} categories={[]} busy={false} onReload={async () => {}} onProductSaved={onProductSaved} onStateChange={() => {}} />
    <button onClick={() => navigation.openWorkspace({ entityType: "product", entityId: control.__product.id, mode: "details" })}>Ürünü Aç</button>
    <WorkspaceHost definition={productWorkspaceDefinition} context={{
      products, categories: [], inventoryEnabled: false, productDataEnabled: false,
      onlineSalesEnabled: enabled, busy: false, onReload: async () => {}, onProductSaved, onStateChange: () => {}
    }} />
  </BusinessCapabilityRuntimeProvider>;
}
createRoot(document.getElementById("root")!).render(<WorkspaceNavigationProvider definitions={workspaceDefinitions} page="market"><Harness /></WorkspaceNavigationProvider>);
