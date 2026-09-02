import {
  hasBusinessCapability,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";

/**
 * Renderer-facing capability seam.
 *
 * v2 no longer reconstructs runtime capabilities from business_type or the
 * historical rooms/tables/QR boolean projection. The persisted capability
 * snapshot received from Electron is authoritative.
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
