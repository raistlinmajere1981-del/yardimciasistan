import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import type { DesktopDashboardData } from "../../apps/desktop-app/electron/database";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { useMarketController } from "../../apps/desktop-app/src/app/use-market-controller";
import { workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import type { MarketView } from "../../apps/desktop-app/src/components/workspace/workspace-intent";
import { MarketPage } from "../../apps/desktop-app/src/pages/MarketPage";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __stockInitial: BusinessCapabilitySnapshot;
  __stockSnapshot: (snapshot: BusinessCapabilitySnapshot) => void;
  __stockDashboard?: DesktopDashboardData;
};
function Harness() {
  const [snapshot, setSnapshot] = useState(control.__stockInitial);
  const [view, setView] = useState<MarketView>("inventory");
  const controller = useMarketController({ businessCapabilities: snapshot, active: true });
  useEffect(() => { control.__stockSnapshot = setSnapshot; }, []);
  return <BusinessCapabilityRuntimeProvider value={{ snapshot }}>
    <main style={{ height: "100vh", padding: 16 }}>
      <MarketPage customers={[]} controller={controller} activeView={view} onViewChange={setView}
        onDashboardDataChanged={data => { control.__stockDashboard = data; }} />
    </main>
  </BusinessCapabilityRuntimeProvider>;
}
createRoot(document.getElementById("root")!).render(
  <WorkspaceNavigationProvider definitions={workspaceDefinitions} page="market"><Harness /></WorkspaceNavigationProvider>
);
