import {
  hasBusinessCapability,
  resolveBusinessCapabilities,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { DesktopSetupData } from "../../electron/database";

/**
 * Renderer-facing capability seam.
 *
 * Desktop persistence still exposes the old module flags today. Keep all
 * compatibility logic here so navigation/pages do not spread legacy module
 * checks across the UI. When capabilities become persisted in SQLite this
 * adapter is the only layer that needs to change.
 */
export function getSetupCapabilities(setup: DesktopSetupData): BusinessCapability[] {
  return resolveBusinessCapabilities({
    businessType: setup.businessType,
    modules: setup.modules,
    aiEnabled: setup.aiEnabled
  });
}

export function setupHasCapability(
  setup: DesktopSetupData,
  capability: BusinessCapability
): boolean {
  return hasBusinessCapability(getSetupCapabilities(setup), capability);
}
