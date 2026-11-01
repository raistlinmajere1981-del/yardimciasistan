import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C, getBusinessProfileSelectionCapabilities, type CatalogProduct } from "@yardimci-asistan/shared";
import type { DesktopDashboardData } from "../../apps/desktop-app/electron/database";
import { productWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { MarketProductsWorkspace } from "../../apps/desktop-app/src/components/market/MarketProductsWorkspace";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { isWebAvailable, WebAvailabilityProvider } from "../../apps/desktop-app/src/app/web-availability";
import "../../apps/desktop-app/src/styles/index.css";
type WebSetup = { webModuleUrl: string; syncSecret: string };
const control = window as typeof window & { __setup: WebSetup; __webSetupChanged?: (setup: WebSetup) => void; __product: CatalogProduct; __menuData?: DesktopDashboardData; __inventoryEnabled?: boolean; __onlineToggle?: (enabled: boolean) => void };
function Harness() {
  const navigation = useWorkspaceNavigation();
  const [enabled, setEnabled] = useState(true);
  const [setup, setSetup] = useState(control.__setup);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [products, setProducts] = useState([control.__product]);
  const onProductSaved = (saved: CatalogProduct) => { setProducts(current => [...current.filter(item => item.id !== saved.id), saved]); setCatalogRevision(current => current + 1); };
  useEffect(() => { control.__onlineToggle = setEnabled; return () => { delete control.__onlineToggle; }; }, []);
  useEffect(() => { control.__webSetupChanged = setSetup; return () => { delete control.__webSetupChanged; }; }, []);
  return <WebAvailabilityProvider available={isWebAvailable(setup)}><BusinessCapabilityRuntimeProvider value={{ snapshot: { businessId: "fixture", profileId: control.__menuData ? "restaurant" : "market", capabilities: [], enabledCapabilities: getBusinessProfileSelectionCapabilities(control.__menuData ? "restaurant" : "market", enabled ? [C.ONLINE_SALES] : []) } }}>
    {!control.__menuData && <MarketProductsWorkspace catalogRevision={catalogRevision} categories={[]} busy={false} onReload={async () => {}} onStateChange={() => {}} />}
    <button onClick={() => navigation.openWorkspace({ entityType: "product", entityId: control.__product.id, mode: "details" })}>Ürünü Aç</button>
    {control.__menuData && <button onClick={() => navigation.openWorkspace({ entityType: "product", entityId: control.__product.id,
      menuEntryId: control.__menuData?.menu.items.find(item => item.product_id === control.__product.id)?.id,
      mode: "details", returnContext: { page: "menu" } })}>Menü Ürününü Aç</button>}
    <WorkspaceHost definition={productWorkspaceDefinition} context={{
      menuData: control.__menuData, retailFieldsEnabled: !control.__menuData,
      products, categories: [], inventoryEnabled: control.__inventoryEnabled ?? false, productDataEnabled: false,
      onlineSalesEnabled: enabled, busy: false, onReload: async () => {}, onProductSaved, onStateChange: () => {}
    }} />
  </BusinessCapabilityRuntimeProvider></WebAvailabilityProvider>;
}
createRoot(document.getElementById("root")!).render(<WorkspaceNavigationProvider definitions={workspaceDefinitions} page={control.__menuData ? "menu" : "market"}><Harness /></WorkspaceNavigationProvider>);
