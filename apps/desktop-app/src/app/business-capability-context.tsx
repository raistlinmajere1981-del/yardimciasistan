import { createContext, useContext, type ReactNode } from "react";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";

export interface BusinessCapabilityRuntimeContextValue {
  snapshot: BusinessCapabilitySnapshot | null;
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
