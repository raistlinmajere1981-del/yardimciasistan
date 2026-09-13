import { ipcMain } from "electron";
import { geocodeBusinessAddress } from "./business-location-geocode";

interface BusinessLocationGeocodeIpcDependencies {
  assertUnlocked: () => void;
}

export function registerBusinessLocationGeocodeIpcHandlers(
  dependencies: BusinessLocationGeocodeIpcDependencies
) {
  ipcMain.handle("businessLocation:geocodeAddress", async (_event, address: string) => {
    dependencies.assertUnlocked();
    return geocodeBusinessAddress(address);
  });
}
