import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import type { DesktopSetupData } from "../../electron/database";
import { runtimeHasCapability } from "./capabilities";

export type CapabilitySetupData = Omit<DesktopSetupData, "modules"> & {
  /**
   * Transitional type-only sentinel.
   *
   * A few leaf components still accept DesktopSetupData even though they do not
   * read modules. `never` keeps CapabilitySetupData structurally assignable to
   * those props without reintroducing a runtime modules projection. The object
   * returned by toCapabilitySetupData deliberately has no `modules` property.
   * Remove this sentinel when those leaf prop types are narrowed during the
   * backend contract cut.
   */
  readonly modules: never;
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

  // The assertion is intentional: CapabilitySetupData.modules is a type-only
  // `never` sentinel for old leaf prop compatibility and must not exist at
  // runtime. This keeps accidental renderer module reads from becoming a new
  // source of truth while the leaf component contracts are narrowed.
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
  } as CapabilitySetupData;
}
