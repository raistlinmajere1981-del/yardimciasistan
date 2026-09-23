import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C, type BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import type { DesktopCustomer } from "../../apps/desktop-app/electron/database";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { useMarketController } from "../../apps/desktop-app/src/app/use-market-controller";
import { workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { MarketPage } from "../../apps/desktop-app/src/pages/MarketPage";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __m8bInitial: { snapshot: BusinessCapabilitySnapshot };
  __m8bToggleCredit: (enabled: boolean) => void;
};

const customer = {
  id: "customer-1",
  fullName: "Test Müşterisi",
  phone: "+905551112233",
  email: "",
  source: "manual",
  notes: "",
  tags: [],
  lastContactAt: "2026-09-23T18:00:00.000Z",
  identityType: "",
  identityNumber: "",
  nationality: "",
  birthDate: "",
  birthdayMessageEnabled: false,
  gender: "",
  documentSerialNumber: "",
  documentExpiryDate: "",
  birthPlace: "",
  motherName: "",
  fatherName: "",
  issuingAuthority: "",
  address: "",
  requestCount: 0,
  reservationCount: 0,
  stayCount: 0,
  updatedAt: "2026-09-23T18:00:00.000Z"
} as DesktopCustomer;

function Harness() {
  const [snapshot, setSnapshot] = useState(control.__m8bInitial.snapshot);
  const controller = useMarketController({
    businessCapabilities: snapshot,
    active: true
  });

  control.__m8bToggleCredit = (enabled) => {
    setSnapshot((current) => {
      const enabledCapabilities = new Set<BusinessCapability>(current.enabledCapabilities);
      if (enabled) enabledCapabilities.add(C.CUSTOMER_CREDIT);
      else enabledCapabilities.delete(C.CUSTOMER_CREDIT);
      return { ...current, enabledCapabilities: [...enabledCapabilities] };
    });
  };

  return <BusinessCapabilityRuntimeProvider value={{
    snapshot,
    state: "success",
    message: "",
    setCapability: async () => undefined,
    clearOverride: async () => undefined
  }}>
    <WorkspaceNavigationProvider definitions={workspaceDefinitions} page="market">
      <MarketPage customers={[customer]} controller={controller} />
    </WorkspaceNavigationProvider>
  </BusinessCapabilityRuntimeProvider>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
