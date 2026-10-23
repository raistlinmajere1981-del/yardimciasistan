import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopIdentityImageAnalyzeResult,
  DesktopStatusUpdateResult,
  SaveCustomerInput
} from "../../apps/desktop-app/electron/database";
import {
  customerWorkspaceDefinition,
  workspaceDefinitions
} from "../../apps/desktop-app/src/app/workspace-definitions";
import { CustomersWorkspace } from "../../apps/desktop-app/src/components/customers/CustomersWorkspace";
import {
  WorkspaceHost,
  WorkspaceNavigationProvider
} from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import "../../apps/desktop-app/src/styles/index.css";

type WholesaleFixtureControl = typeof window & {
  __whInitial: DesktopDashboardData;
  __whCall: (method: string, args: unknown[]) => Promise<unknown>;
  __whToggle?: (enabled: boolean) => void;
  __whTogglePortal?: (enabled: boolean) => void;
};

const control = window as WholesaleFixtureControl;

function Harness() {
  const [dashboardData, setDashboardData] = useState(control.__whInitial);
  const [wholesaleEnabled, setWholesaleEnabled] = useState(true);
  const [dealerPortalEnabled, setDealerPortalEnabled] = useState(true);

  useEffect(() => {
    control.__whToggle = setWholesaleEnabled;
    control.__whTogglePortal = setDealerPortalEnabled;
    return () => { delete control.__whToggle; delete control.__whTogglePortal; };
  }, []);

  const saveCustomer = async (input: SaveCustomerInput): Promise<DesktopCustomerMutationResult> => {
    const result = await control.__whCall("saveCustomer", [input]) as DesktopCustomerMutationResult;
    if (result.ok) setDashboardData(result.dashboardData);
    return result;
  };

  const deleteCustomer = async (
    customer: DesktopDashboardData["customers"][number]
  ): Promise<DesktopStatusUpdateResult | undefined> => {
    const result = await control.__whCall("deleteCustomer", [customer.id]) as DesktopStatusUpdateResult;
    if (result.ok) setDashboardData(result.dashboardData);
    return result;
  };

  const analyzeIdentity = async (): Promise<DesktopIdentityImageAnalyzeResult> => ({
    ok: false,
    message: "Bu smoke kimlik analizi kullanmaz."
  });

  return (
    <main className="smoke-shell">
      <p data-testid="wholesale-state">{wholesaleEnabled ? "wholesale-on" : "wholesale-off"}</p>
      <WorkspaceNavigationProvider definitions={workspaceDefinitions} page="customerWork">
        <CustomersWorkspace
          customers={dashboardData.customers}
          stays={dashboardData.customerRoomStays}
          reservations={dashboardData.reservations}
          notifications={dashboardData.hospitalityNotifications}
          kbsOverview={dashboardData.kbsOverview}
          aiEnabled={false}
          wholesaleEnabled={wholesaleEnabled}
          onSave={saveCustomer}
          onAnalyzeIdentity={analyzeIdentity}
          onDelete={deleteCustomer}
          onSendKbs={async () => undefined}
        />
        <WorkspaceHost
          definition={customerWorkspaceDefinition}
          context={{
            data: dashboardData,
            aiEnabled: false,
            whatsappEnabled: false,
            reservationsEnabled: false,
            staysEnabled: false,
            accommodationFolioEnabled: false,
            customerCreditEnabled: false,
            wholesaleEnabled,
            dealerPortalEnabled,
            onWhatsApp: () => undefined,
            onSave: saveCustomer,
            onAnalyzeIdentity: analyzeIdentity,
            onDelete: deleteCustomer
          }}
        />
      </WorkspaceNavigationProvider>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
);
