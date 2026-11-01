import { createContext, useContext, type ReactNode } from "react";
import { BUSINESS_CAPABILITIES as C, type BusinessCapability } from "@yardimci-asistan/shared";

// Presentation only: callers supply the saved setup, never the Web toggle/draft.
// Manual publication remains available when automatic sync is disabled.
export function isWebAvailable(setup: { webModuleUrl: string; syncSecret: string }): boolean {
  return Boolean(setup.webModuleUrl.trim() && setup.syncSecret.trim());
}

export function isWebCapabilityVisible(capability: BusinessCapability, webAvailable: boolean): boolean {
  return webAvailable || (capability !== C.REQUESTS && capability !== C.ONLINE_SALES && capability !== C.QR_MENU);
}

const WebAvailabilityContext = createContext(false);

export function WebAvailabilityProvider({ available, children }: { available: boolean; children: ReactNode }) {
  return <WebAvailabilityContext.Provider value={available}>{children}</WebAvailabilityContext.Provider>;
}

export function useWebAvailability(): boolean {
  return useContext(WebAvailabilityContext);
}
