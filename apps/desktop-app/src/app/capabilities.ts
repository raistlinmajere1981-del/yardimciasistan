import {
  hasBusinessCapability,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";

/**
 * Renderer-facing capability seam.
 *
 * Runtime capabilities come from the persisted capability snapshot received
 * from Electron. Selected roots are resolved only by the canonical Settings owner.
 */
export function runtimeHasCapability(
  snapshot: BusinessCapabilitySnapshot | null | undefined,
  capability: BusinessCapability
): boolean {
  return hasBusinessCapability(snapshot?.enabledCapabilities ?? [], capability);
}
