import {
  BUSINESS_CAPABILITIES,
  getBusinessProfile,
  validateBusinessCapabilitySet,
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

const DIRECT_SERVICE_CAPABILITIES = new Set<BusinessCapability>([
  BUSINESS_CAPABILITIES.WHATSAPP,
  BUSINESS_CAPABILITIES.ANDROID,
  BUSINESS_CAPABILITIES.AI
]);

function setCapability(enabled: Set<BusinessCapability>, capability: BusinessCapability, value: boolean) {
  if (value) {
    enabled.add(capability);
  } else {
    enabled.delete(capability);
  }
}

function projectTargetCapabilities(
  input: SaveCapabilitySetupInput,
  snapshot: BusinessCapabilitySnapshot | null | undefined
) {
  const enabled = new Set<BusinessCapability>(getBusinessProfile(input.businessType).defaultCapabilities);

  // Profile changes keep explicit domain overrides. Service switches are edited
  // directly by the current setup form, so the submitted values take priority
  // over an older persisted service override.
  for (const entry of snapshot?.capabilities ?? []) {
    if (entry.source !== "user" || DIRECT_SERVICE_CAPABILITIES.has(entry.capability)) {
      continue;
    }
    setCapability(enabled, entry.capability, entry.enabled);
  }

  setCapability(enabled, BUSINESS_CAPABILITIES.WHATSAPP, input.servicePreferences.whatsapp);
  setCapability(enabled, BUSINESS_CAPABILITIES.ANDROID, input.servicePreferences.android);
  setCapability(enabled, BUSINESS_CAPABILITIES.AI, input.aiEnabled);

  const violations = validateBusinessCapabilitySet(enabled);
  if (violations.length > 0) {
    const first = violations[0];
    throw new Error(
      `${first.capability} yeteneği için önce şu yetenekleri etkinleştirin: ${first.missingDependencies.join(", ")}.`
    );
  }

  return enabled;
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
  const enabled = projectTargetCapabilities(input, snapshot);

  return {
    ...setup,
    modules: {
      rooms: enabled.has(DOMAIN_PROJECTION_CAPABILITIES.rooms),
      tables: enabled.has(DOMAIN_PROJECTION_CAPABILITIES.tables),
      qrMenu: enabled.has(DOMAIN_PROJECTION_CAPABILITIES.qrMenu),
      whatsapp: servicePreferences.whatsapp,
      android: servicePreferences.android
    }
  };
}
