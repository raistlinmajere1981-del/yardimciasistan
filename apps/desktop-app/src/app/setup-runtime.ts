import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import type { DesktopSetupData } from "../../electron/database";
import { runtimeHasCapability } from "./capabilities";

export type CapabilitySetupData = Omit<DesktopSetupData, "modules"> & {
  servicePreferences: {
    whatsapp: boolean;
    android: boolean;
  };
};

/**
 * Renderer boundary for the legacy DesktopSetupData payload.
 *
 * database.ts may still materialize historical module flags during the backend
 * migration, but renderer/controller state never keeps them. Runtime service
 * state and the selected profile come from the persisted capability snapshot.
 */
export function toCapabilitySetupData(
  setup: DesktopSetupData,
  snapshot: BusinessCapabilitySnapshot | null | undefined
): CapabilitySetupData {
  const { modules, ...base } = setup;
  const hasSnapshot = Boolean(snapshot?.businessId);

  return {
    ...base,
    businessType: snapshot?.profileId || setup.businessType,
    aiEnabled: hasSnapshot
      ? runtimeHasCapability(snapshot, BUSINESS_CAPABILITIES.AI)
      : setup.aiEnabled,
    servicePreferences: {
      whatsapp: hasSnapshot
        ? runtimeHasCapability(snapshot, BUSINESS_CAPABILITIES.WHATSAPP)
        : modules.whatsapp,
      android: hasSnapshot
        ? runtimeHasCapability(snapshot, BUSINESS_CAPABILITIES.ANDROID)
        : modules.android
    }
  };
}
