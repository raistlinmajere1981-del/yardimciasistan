import { customerWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C, type BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import type { DesktopDashboardData } from "../../apps/desktop-app/electron/database";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { WorkspaceHost, WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { subscribeAppStatus } from "../../apps/desktop-app/src/app/runtime-state";
import { useCustomerController } from "../../apps/desktop-app/src/app/use-customer-controller";
import { useMessagingController } from "../../apps/desktop-app/src/app/use-messaging-controller";
import { useMarketController } from "../../apps/desktop-app/src/app/use-market-controller";
import { CustomersWorkspace } from "../../apps/desktop-app/src/components/customers/CustomersWorkspace";
import { WhatsAppWorkspace } from "../../apps/desktop-app/src/components/messages/MessageWorkspaces";
import { MessagesPage } from "../../apps/desktop-app/src/pages/MessagesPage";
import { MarketPage } from "../../apps/desktop-app/src/pages/MarketPage";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __m83Initial: { dashboard: DesktopDashboardData; snapshot: BusinessCapabilitySnapshot };
  __m83Toggle: (capability: BusinessCapability, enabled: boolean) => Promise<void>;
  __m83Call: (method: string, args: unknown[]) => Promise<BusinessCapabilitySnapshot>;
};

function Harness() {
  const [dashboardData, setDashboardData] = useState(control.__m83Initial.dashboard);
  const [snapshot, setSnapshot] = useState(control.__m83Initial.snapshot);
  const [page, setPage] = useState("customers");
  const [syncState, setSyncState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const whatsappEnabled = snapshot.enabledCapabilities.includes(C.WHATSAPP);
  const customerCreditEnabled = snapshot.enabledCapabilities.includes(C.CUSTOMER_CREDIT);
  const messaging = useMessagingController({ dashboardData, setDashboardData, setSyncState, setStatusMessage,
    messagesActive: page === "messages", aiEnabled: false, customersEnabled: true, whatsappEnabled, customerCreditEnabled,
    onOpenMessages: () => setPage("messages") });
  const customers = useCustomerController({ dashboardData, setDashboardData, setSyncState, setStatusMessage,
    selectedWhatsAppRequestId: messaging.selectedWhatsAppRequestId, setSelectedWhatsAppRequestId: messaging.setSelectedWhatsAppRequestId });
  const marketController = useMarketController({
    businessCapabilities: snapshot,
    active: page === "market"
  });
  control.__m83Toggle = async (capability, enabled) => setSnapshot(await control.__m83Call("toggle", [capability, enabled]));

  useEffect(() => subscribeAppStatus(({ state, message }) => {
    setSyncState(state);
    setStatusMessage(message);
  }), []);

  const workspace = (view: "safe" | "web", onReturnToSafe?: () => void) => <WhatsAppWorkspace view={view}
    preparedMessage={messaging.preparedWhatsAppMessage} requests={dashboardData.requests}
    selectedRequest={messaging.selectedWhatsAppRequest} selectedMessage={messaging.selectedWhatsAppMessage}
    selectedUrl={messaging.selectedWhatsAppUrl} aiEnabled={false} aiState="idle" aiMessage=""
    getRequestStatusTone={() => "neutral"} onSelectRequest={messaging.setSelectedWhatsAppRequestId}
    onOpenExternal={messaging.openSelectedWhatsAppExternal} onReturnToSafe={onReturnToSafe}
    onRewrite={messaging.handleRewriteWhatsAppMessage} onMessageSent={messaging.handleWhatsAppMessageSent}
    onDeleteMessage={messaging.handleDeleteWhatsAppMessage} />;

  return <BusinessCapabilityRuntimeProvider value={{ snapshot, state: "success", message: "", setCapability: async () => undefined, clearOverride: async () => undefined }}>
    <main className="smoke-shell">
      {customers.confirmDialog}
      {messaging.confirmDialog}
      <nav aria-label="Çalışma alanı">{["customers", "market", "messages"].map((id) => <button type="button" key={id} onClick={() => setPage(id)}>{id === "customers" ? "Müşteriler" : id === "market" ? "Market" : "Mesajlar"}</button>)}</nav>
      <p data-testid="topbar-status" data-state={syncState} role="status">{statusMessage}</p>
      {page === "customers" ? <div className="customer-work-page"><div className="customer-work-content is-customers">
        <WorkspaceNavigationProvider definitions={workspaceDefinitions} page="customerWork">
        <CustomersWorkspace
          customers={dashboardData.customers}
          stays={dashboardData.customerRoomStays}
          aiEnabled={false}
          onSave={customers.handleSaveCustomer}
          onAnalyzeIdentity={customers.handleAnalyzeIdentityImage}
        />
        <WorkspaceHost definition={customerWorkspaceDefinition} context={{
          data: dashboardData,
          aiEnabled: false,
          whatsappEnabled,
          reservationsEnabled: false,
          staysEnabled: false,
          customerCreditEnabled,
          onPreparedCreditWhatsApp: messaging.openPreparedCreditWhatsApp,
          onCall: messaging.callCustomerRecord,
          onWhatsApp: messaging.openCustomerWhatsApp,
          onSummarize: () => undefined,
          onSave: customers.handleSaveCustomer,
          onAnalyzeIdentity: customers.handleAnalyzeIdentityImage,
          onDelete: customers.handleDeleteCustomer
        }} />
        </WorkspaceNavigationProvider>
      </div></div> : page === "market" ? <MarketPage customers={dashboardData.customers} controller={marketController} />
        : <MessagesPage safeMode={workspace("safe")} webMode={(onReturn) => workspace("web", onReturn)} aiTools={null}
          aiEnabled={false} whatsappEnabled={whatsappEnabled} aiOpen={false} active />}
    </main>
  </BusinessCapabilityRuntimeProvider>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
