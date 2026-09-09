import {
  hasBusinessCapability,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";

/**
 * Renderer-facing capability seam.
 *
 * Runtime capabilities come from the persisted capability snapshot received
 * from Electron. Profile selection is only the initial preset for that state.
 */
function getEnabledBusinessCapabilities(
  snapshot: BusinessCapabilitySnapshot | null | undefined
): BusinessCapability[] {
  return snapshot?.enabledCapabilities ?? [];
}

export function runtimeHasCapability(
  snapshot: BusinessCapabilitySnapshot | null | undefined,
  capability: BusinessCapability
): boolean {
  return hasBusinessCapability(getEnabledBusinessCapabilities(snapshot), capability);
}
