import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import type { DesktopDashboardData } from "../../apps/desktop-app/electron/database";
import { projectDesktopWorkspaceFeatures } from "../../apps/desktop-app/src/app/desktop-workspace-features";
import { PageViewStateProvider } from "../../apps/desktop-app/src/app/page-view-state";
import { CustomerWorkRoute } from "../../apps/desktop-app/src/components/app/routes/CustomerWorkRoute";
import { WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  customerFilterData: DesktopDashboardData;
  customerFilterCapabilities: BusinessCapability[];
  setCustomerFilterCapabilities: (capabilities: BusinessCapability[]) => void;
  setCustomerFilterKbsEnabled: (enabled: boolean) => void;
};
type RouteProps = Parameters<typeof CustomerWorkRoute>[0];

function Fixture() {
  const [capabilities, setCapabilities] = useState(control.customerFilterCapabilities);
  const [kbsEnabled, setKbsEnabled] = useState(control.customerFilterData.kbsOverview.enabled);
  control.setCustomerFilterCapabilities = setCapabilities;
  control.setCustomerFilterKbsEnabled = setKbsEnabled;
  const snapshot: BusinessCapabilitySnapshot = { businessId: "fixture", profileId: "market", capabilities: [], enabledCapabilities: capabilities };
  const features = projectDesktopWorkspaceFeatures(snapshot, true);
  // Deliberately retain old raw records: visibility must use the feature authority,
  // not rely on upstream projection having emptied every collection.
  return <PageViewStateProvider><WorkspaceNavigationProvider definitions={[]} page="customerWork">
    <CustomerWorkRoute activePage="customerWork" activeTab="customers" onTabChange={() => {}}
      surfaceData={{ ...control.customerFilterData, kbsOverview: { ...control.customerFilterData.kbsOverview, enabled: kbsEnabled } }} enabledCapabilities={capabilities} features={features}
      customerController={{} as RouteProps["customerController"]}
      messagingController={{} as RouteProps["messagingController"]}
      selectedKbsCustomerId="" kbsEgmSessionRequest={0} kbsSessionRetryNotificationId=""
      onSessionRetryConsumed={() => {}} kbsController={{} as RouteProps["kbsController"]}
      onSendKbs={async () => {}} onOpenRequestReservation={() => {}} />
  </WorkspaceNavigationProvider></PageViewStateProvider>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
