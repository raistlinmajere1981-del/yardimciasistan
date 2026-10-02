import { customerWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { DesktopDashboardData } from "../../apps/desktop-app/electron/database";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { WorkspaceHost, WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { subscribeAppStatus } from "../../apps/desktop-app/src/app/runtime-state";
import { useCustomerController } from "../../apps/desktop-app/src/app/use-customer-controller";
import { useMarketController } from "../../apps/desktop-app/src/app/use-market-controller";
import { MarketPage } from "../../apps/desktop-app/src/pages/MarketPage";
import { CustomersWorkspace } from "../../apps/desktop-app/src/components/customers/CustomersWorkspace";
import "../../apps/desktop-app/src/styles/index.css";


const control = window as typeof window & {
  __m82Initial: { dashboard: DesktopDashboardData; snapshot: BusinessCapabilitySnapshot };
  __m82Toggle: (enabled: boolean) => Promise<void>;
  __m82Call: (method: string, args: unknown[]) => Promise<BusinessCapabilitySnapshot>;
};

function Harness() {
  const [dashboardData, setDashboardData] = useState(control.__m82Initial.dashboard);
  const [snapshot, setSnapshot] = useState(control.__m82Initial.snapshot);
  const [page, setPage] = useState("market");
  const [marketView, setMarketView] = useState<"quickSale" | "products" | "phoneCarts" | "inventory" | "purchasing" | "labels">("quickSale");
  const [syncState, setSyncState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedWhatsAppRequestId, setSelectedWhatsAppRequestId] = useState("");
  const customers = useCustomerController({ dashboardData, setDashboardData, setSyncState, setStatusMessage,
    selectedWhatsAppRequestId, setSelectedWhatsAppRequestId });
  const marketController = useMarketController({
    businessCapabilities: snapshot,
    active: page === "market"
  });
  control.__m82Toggle = async (enabled) => { setSnapshot(await control.__m82Call("toggleCredit", [enabled])); };

  useEffect(() => subscribeAppStatus(({ state, message }) => {
    setSyncState(state);
    setStatusMessage(message);
  }), []);

  return <BusinessCapabilityRuntimeProvider value={{ snapshot, state: "success", message: "",
    setCapability: async () => undefined, clearOverride: async () => undefined }}>
    <main className="smoke-shell">
      {customers.confirmDialog}
      <nav aria-label="Çalışma alanı">
        <button type="button" onClick={() => setPage("market")}>Market</button>
        <button type="button" onClick={() => setPage("customers")}>Müşteriler</button>
      </nav>
      <p data-testid="topbar-status" data-state={syncState} role="status">{statusMessage}</p>
      {page === "market" ? <MarketPage customers={dashboardData.customers} controller={marketController} activeView={marketView} onViewChange={setMarketView} /> : <div className="customer-work-page">
        <div className="customer-work-content is-customers">
          <WorkspaceNavigationProvider definitions={workspaceDefinitions} page="customerWork">
          <CustomersWorkspace
            customers={dashboardData.customers}
            stays={dashboardData.customerRoomStays}
            reservations={dashboardData.reservations}
            notifications={dashboardData.hospitalityNotifications}
            kbsOverview={dashboardData.kbsOverview}
            aiEnabled={false}
            onSave={customers.handleSaveCustomer}
            onAnalyzeIdentity={customers.handleAnalyzeIdentityImage}
            onDelete={customers.handleDeleteCustomer}
            onSendKbs={async () => undefined}
          />
          <WorkspaceHost definition={customerWorkspaceDefinition} context={{
            data: dashboardData,
            aiEnabled: false,
            whatsappEnabled: false,
            reservationsEnabled: false,
            staysEnabled: false,
            accommodationFolioEnabled: true,
            customerCreditEnabled: snapshot.enabledCapabilities.includes(C.CUSTOMER_CREDIT),
            onWhatsApp: () => undefined,
            onSave: customers.handleSaveCustomer,
            onAnalyzeIdentity: customers.handleAnalyzeIdentityImage,
            onDelete: customers.handleDeleteCustomer
          }} />
          </WorkspaceNavigationProvider>
        </div>
      </div>}
    </main>
  </BusinessCapabilityRuntimeProvider>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
