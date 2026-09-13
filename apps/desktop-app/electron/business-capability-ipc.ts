import { ipcMain } from "electron";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import {
  applyBusinessProfileCapabilities,
  clearBusinessCapabilityOverride,
  readBusinessCapabilitySnapshot,
  setBusinessCapability,
  type BusinessCapabilitySnapshot
} from "./business-capability-store";
import { registerBusinessLocationGeocodeIpcHandlers } from "./business-location-geocode-ipc";
import { registerBusinessPublicProfileIpcHandlers } from "./business-public-profile-ipc";

export function registerBusinessCapabilityIpcHandlers(options: {
  databasePath: () => string;
  assertUnlocked: () => void;
  onMutation?: () => void;
}) {
  ipcMain.handle("capability:getSnapshot", (): BusinessCapabilitySnapshot => {
    options.assertUnlocked();
    return readBusinessCapabilitySnapshot(options.databasePath());
  });

  ipcMain.handle(
    "capability:set",
    (_event, capability: BusinessCapability, enabled: boolean): BusinessCapabilitySnapshot => {
      options.assertUnlocked();
      const snapshot = setBusinessCapability(options.databasePath(), {
        capability,
        enabled: enabled === true
      });
      options.onMutation?.();
      return snapshot;
    }
  );

  ipcMain.handle(
    "capability:clearOverride",
    (_event, capability: BusinessCapability): BusinessCapabilitySnapshot => {
      options.assertUnlocked();
      const snapshot = clearBusinessCapabilityOverride(options.databasePath(), capability);
      options.onMutation?.();
      return snapshot;
    }
  );

  ipcMain.handle(
    "capability:applyProfile",
    (_event, profileId: string, preserveUserOverrides = true): BusinessCapabilitySnapshot => {
      options.assertUnlocked();
      const snapshot = applyBusinessProfileCapabilities(options.databasePath(), profileId, {
        preserveUserOverrides: preserveUserOverrides !== false
      });
      options.onMutation?.();
      return snapshot;
    }
  );

  // Public profile and map location are part of the same settings surface.
  // Register their IPC contracts alongside the business settings handlers so
  // the current main-entry stays independent from the older public-context
  // coordinator that existed on the historical feature branch.
  registerBusinessPublicProfileIpcHandlers({
    databasePath: options.databasePath,
    assertUnlocked: options.assertUnlocked
  });
  registerBusinessLocationGeocodeIpcHandlers({
    assertUnlocked: options.assertUnlocked
  });
}
