import { createContext, useContext, type ReactNode } from "react";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import type { SyncState } from "./runtime-state";

export interface BusinessCapabilityRuntimeContextValue {
  snapshot: BusinessCapabilitySnapshot | null;
  state: SyncState;
  message: string;
  setCapability: (capability: BusinessCapability, enabled: boolean) => Promise<BusinessCapabilitySnapshot | undefined>;
  clearOverride: (capability: BusinessCapability) => Promise<BusinessCapabilitySnapshot | undefined>;
}

const BusinessCapabilityRuntimeContext = createContext<BusinessCapabilityRuntimeContextValue | null>(null);

export function BusinessCapabilityRuntimeProvider({
  value,
  children
}: {
  value: BusinessCapabilityRuntimeContextValue;
  children: ReactNode;
}) {
  return (
    <BusinessCapabilityRuntimeContext.Provider value={value}>
      {children}
    </BusinessCapabilityRuntimeContext.Provider>
  );
}

export function useBusinessCapabilityRuntime(): BusinessCapabilityRuntimeContextValue {
  const value = useContext(BusinessCapabilityRuntimeContext);
  if (!value) {
    throw new Error("BusinessCapabilityRuntimeProvider bulunamadı.");
  }
  return value;
}
