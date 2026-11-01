import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import type { DesktopCustomer, DesktopDashboardData, SaveCustomerInput } from "../../apps/desktop-app/electron/database";
import { isWebAvailable, WebAvailabilityProvider } from "../../apps/desktop-app/src/app/web-availability";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { useDashboardSnapshot } from "../../apps/desktop-app/src/app/use-dashboard-snapshot";
import { useMarketController } from "../../apps/desktop-app/src/app/use-market-controller";
import { subscribeAppStatus } from "../../apps/desktop-app/src/app/runtime-state";
import { buildNavigation } from "../../apps/desktop-app/src/app/navigation";
import { customerWorkspaceDefinition, productWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { WorkspaceHost, WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import type { MarketView } from "../../apps/desktop-app/src/components/workspace/workspace-intent";
import { MarketPage } from "../../apps/desktop-app/src/pages/MarketPage";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __salesInitial: { snapshot: BusinessCapabilitySnapshot; customers: DesktopCustomer[]; dashboardData: DesktopDashboardData; setup: { webModuleUrl: string; syncSecret: string } };
  __setSalesSnapshot: (snapshot: BusinessCapabilitySnapshot) => void;
  __setSalesSetup: (setup: { webModuleUrl: string; syncSecret: string }) => void;
};
function Harness() {
  const [dashboardData, setDashboardData] = useDashboardSnapshot(control.__salesInitial.dashboardData);
  const [snapshot, setSnapshot] = useState(control.__salesInitial.snapshot);
  const [setup, setSetup] = useState(control.__salesInitial.setup);
  const [statusMessage, setStatusMessage] = useState("");
  useEffect(() => window.yardimciDesktop?.onDashboardDataChanged?.(setDashboardData), [setDashboardData]);
  useEffect(() => subscribeAppStatus(({ message }) => setStatusMessage(message)), []);
  const [view, setView] = useState<MarketView>("quickSale");
  const controller = useMarketController({ businessCapabilities: snapshot, active: true });
  useEffect(() => { control.__setSalesSnapshot = setSnapshot; control.__setSalesSetup = setSetup; }, []);
  const enabled = (capability: string) => snapshot.enabledCapabilities.some(value => value === capability);
  return <WebAvailabilityProvider available={isWebAvailable(setup)}><BusinessCapabilityRuntimeProvider value={{ snapshot }}>
    <nav aria-label="Global test navigation" style={{ display: "flex", alignItems: "center", height: 44, overflow: "hidden" }}><span data-testid="topbar-status" role="status" style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" }}>{statusMessage}</span>{buildNavigation(snapshot).map(item => <button key={item.id}>{item.label}</button>)}</nav>
    <main style={{ height: "calc(100vh - 44px)" }}>
      <MarketPage customers={dashboardData.customers} controller={controller} activeView={view} onViewChange={setView} />
    </main>
    <WorkspaceHost definition={customerWorkspaceDefinition} context={{ data: dashboardData, aiEnabled: false, whatsappEnabled: false,
      reservationsEnabled: false, staysEnabled: false, customerCreditEnabled: enabled(C.CUSTOMER_CREDIT), wholesaleEnabled: enabled(C.WHOLESALE),
      onWhatsApp: () => undefined, onAnalyzeIdentity: async () => ({ ok: false, message: "fixture" }), onDelete: async () => undefined,
      onSave: async (input: SaveCustomerInput) => { const result = await window.yardimciDesktop!.saveCustomer(input); if (result.ok) setDashboardData(result.dashboardData); return result; } }} />
    <WorkspaceHost definition={productWorkspaceDefinition} context={{ products: controller.products, categories: controller.categories,
      inventoryEnabled: enabled(C.INVENTORY), productDataEnabled: false, wholesaleEnabled: enabled(C.WHOLESALE), onlineSalesEnabled: enabled(C.ONLINE_SALES),
      busy: controller.dataState === "loading", onReload: controller.reloadCatalog, onProductSaved: controller.upsertProduct, onStateChange: controller.handleStateChange }} />
  </BusinessCapabilityRuntimeProvider></WebAvailabilityProvider>;
}
createRoot(document.getElementById("root")!).render(<WorkspaceNavigationProvider definitions={workspaceDefinitions} page="market"><Harness /></WorkspaceNavigationProvider>);
