import { ipcMain } from "electron";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import {
  applyBusinessProfileCapabilities,
  clearBusinessCapabilityOverride,
  readBusinessCapabilitySnapshot,
  setBusinessCapability,
  type BusinessCapabilitySnapshot
} from "./business-capability-store";
import {
  toLegacySetupSaveInput,
  type SaveCapabilitySetupInput
} from "./setup-contract";

export function registerBusinessCapabilityIpcHandlers(options: {
  databasePath: () => string;
  assertUnlocked: () => void;
  onMutation?: () => void;
}) {
  ipcMain.handle("capability:getSnapshot", (): BusinessCapabilitySnapshot => {
    options.assertUnlocked();
    return readBusinessCapabilitySnapshot(options.databasePath());
  });

  // Sandboxed preload scripts must stay dependency-light. Keep the temporary
  // capability -> legacy setup projection in the Electron main process instead
  // of importing application modules at runtime from preload.ts.
  ipcMain.handle(
    "capability:adaptSetupSave",
    (_event, input: SaveCapabilitySetupInput) => {
      options.assertUnlocked();
      return toLegacySetupSaveInput(
        input,
        readBusinessCapabilitySnapshot(options.databasePath())
      );
    }
  );

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
}
