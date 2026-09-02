import {
  BUSINESS_CAPABILITIES,
  getBusinessProfile,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "./business-capability-store";
import type { SaveInitialSetupInput } from "./database";

export type SaveCapabilitySetupInput = Omit<SaveInitialSetupInput, "modules"> & {
  servicePreferences: {
    whatsapp: boolean;
    android: boolean;
  };
};

const DOMAIN_PROJECTION_CAPABILITIES = {
  rooms: BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS,
  tables: BUSINESS_CAPABILITIES.FOOD_TABLES,
  qrMenu: BUSINESS_CAPABILITIES.QR_MENU
} as const satisfies Record<"rooms" | "tables" | "qrMenu", BusinessCapability>;

function resolveProjectedDomainCapability(
  capability: BusinessCapability,
  targetProfileId: string,
  snapshot: BusinessCapabilitySnapshot | null | undefined
) {
  const userOverride = snapshot?.capabilities.find(
    (entry) => entry.capability === capability && entry.source === "user"
  );
  if (userOverride) {
    return userOverride.enabled;
  }

  return getBusinessProfile(targetProfileId).defaultCapabilities.includes(capability);
}

/**
 * Temporary Electron-side compatibility adapter.
 *
 * Renderer code submits only the capability-first setup contract. database.ts
 * still accepts the historical module-shaped input while its large setup
 * persistence method is being split. Domain values are therefore projected at
 * the preload/IPC boundary from the target profile plus explicit persisted user
 * overrides. Service switches remain direct operator preferences.
 */
export function toLegacySetupSaveInput(
  input: SaveCapabilitySetupInput,
  snapshot: BusinessCapabilitySnapshot | null | undefined
): SaveInitialSetupInput {
  const { servicePreferences, ...setup } = input;

  return {
    ...setup,
    modules: {
      rooms: resolveProjectedDomainCapability(
        DOMAIN_PROJECTION_CAPABILITIES.rooms,
        input.businessType,
        snapshot
      ),
      tables: resolveProjectedDomainCapability(
        DOMAIN_PROJECTION_CAPABILITIES.tables,
        input.businessType,
        snapshot
      ),
      qrMenu: resolveProjectedDomainCapability(
        DOMAIN_PROJECTION_CAPABILITIES.qrMenu,
        input.businessType,
        snapshot
      ),
      whatsapp: servicePreferences.whatsapp,
      android: servicePreferences.android
    }
  };
}
