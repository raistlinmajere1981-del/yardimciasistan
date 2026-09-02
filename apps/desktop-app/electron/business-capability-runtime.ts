import type { BusinessCapability } from "@yardimci-asistan/shared";
import { readBusinessCapabilitySnapshot } from "./business-capability-store";

export function hasPersistedBusinessCapability(
  databasePath: string,
  capability: BusinessCapability
): boolean {
  return readBusinessCapabilitySnapshot(databasePath).enabledCapabilities.includes(capability);
}

export function assertPersistedBusinessCapability(
  databasePath: string,
  capability: BusinessCapability,
  message = "Bu işlem mevcut işletme yeteneklerinde etkin değil."
): void {
  if (!hasPersistedBusinessCapability(databasePath, capability)) {
    throw new Error(message);
  }
}
