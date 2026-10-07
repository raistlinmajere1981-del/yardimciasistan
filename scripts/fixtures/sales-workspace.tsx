import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import type { DesktopCustomer } from "../../apps/desktop-app/electron/database";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { useMarketController } from "../../apps/desktop-app/src/app/use-market-controller";
import { useDesktopSync } from "../../apps/desktop-app/src/app/use-desktop-sync";
import { buildNavigation } from "../../apps/desktop-app/src/app/navigation";
import { productWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { WorkspaceHost, WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import type { MarketView } from "../../apps/desktop-app/src/components/workspace/workspace-intent";
import { MarketPage } from "../../apps/desktop-app/src/pages/MarketPage";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __salesInitial: { snapshot: BusinessCapabilitySnapshot; customers: DesktopCustomer[] };
  __setSalesSnapshot: (snapshot: BusinessCapabilitySnapshot) => void;
};
function Harness() {
  const [snapshot, setSnapshot] = useState(control.__salesInitial.snapshot);
  const [view, setView] = useState<MarketView>("quickSale");
  const controller = useMarketController({ businessCapabilities: snapshot, active: true });
  useEffect(() => { control.__setSalesSnapshot = setSnapshot; }, []);
  const enabled = (capability: string) => snapshot.enabledCapabilities.some(value => value === capability);
  return <BusinessCapabilityRuntimeProvider value={{ snapshot, state: "success", message: "", setCapability: async () => undefined, clearOverride: async () => undefined }}>
    <nav aria-label="Global test navigation">{buildNavigation(snapshot).map(item => <button key={item.id}>{item.label}</button>)}</nav>
    <main style={{ height: "calc(100vh - 44px)" }}>
      <MarketPage customers={control.__salesInitial.customers} controller={controller} activeView={view} onViewChange={setView} />
    </main>
    <WorkspaceHost definition={productWorkspaceDefinition} context={{ products: controller.products, categories: controller.categories,
      inventoryEnabled: enabled(C.INVENTORY), productDataEnabled: false, wholesaleEnabled: enabled(C.WHOLESALE), onlineSalesEnabled: enabled(C.ONLINE_SALES),
      busy: controller.dataState === "loading", onReload: controller.reloadCatalog, onProductSaved: controller.upsertProduct, onStateChange: controller.handleStateChange }} />
  </BusinessCapabilityRuntimeProvider>;
}
function NavigationRace() {
  const runtime = useDesktopSync({ accessPhase: "locked", setSyncState: () => {}, setStatusMessage: () => {}, onBootstrapSetup: () => {} });
  return <>
    <button onClick={() => void runtime.loadBusinessCapabilities()}>Capabilities yenile</button>
    <button onClick={() => void runtime.setRuntimeBusinessCapability(C.RETAIL_BARCODE, false)}>Satışı kapat</button>
    <nav aria-label="Runtime navigation">{buildNavigation(runtime.businessCapabilities).map(item => <button key={item.id}>{item.label}</button>)}</nav>
  </>;
}
createRoot(document.getElementById("root")!).render(location.pathname.includes("navigation-race") ? <NavigationRace /> : <WorkspaceNavigationProvider definitions={workspaceDefinitions} page="market"><Harness /></WorkspaceNavigationProvider>);
