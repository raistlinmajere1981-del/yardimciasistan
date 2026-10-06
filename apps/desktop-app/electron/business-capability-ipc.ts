import { ipcMain } from "electron";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import {
  clearBusinessCapabilityOverride,
  readBusinessCapabilitySnapshot,
  setBusinessCapability,
  type BusinessCapabilitySnapshot
} from "./business-capability-store";
import { registerBusinessLocationGeocodeIpcHandlers } from "./business-location-geocode-ipc";

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

  // Map lookup remains part of the capability/settings surface. Public profile
  // IPC is registered by main.ts because its save handler also republishes the
  // current business AI context; registering it here as well would duplicate
  // Electron ipcMain handlers.
  registerBusinessLocationGeocodeIpcHandlers({
    assertUnlocked: options.assertUnlocked
  });
}
