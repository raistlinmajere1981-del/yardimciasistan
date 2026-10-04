import { ipcMain } from "electron";
import type { ArasShippingConfigurationInput, CommerceShipment } from "@yardimci-asistan/shared";
import type { CommerceIpcMutationResult } from "../commerce-ipc-contract";
import type { ShippingProviderService } from "../shipping-provider-service";
import { normalizeShippingProviderError } from "../shipping/shipping-provider-error";

export function registerShippingProviderIpcHandlers(options: {
  service: ShippingProviderService;
  assertUnlocked: () => void;
  onChanged: (orderId: string) => void;
}) {
  async function mutate(operation: () => Promise<CommerceShipment>): Promise<CommerceIpcMutationResult<CommerceShipment>> {
    options.assertUnlocked();
    let shipment: CommerceShipment;
    try { shipment = await operation(); }
    catch (caught) {
      const error = normalizeShippingProviderError(caught);
      return { ok: false, expected: true, code: error.code, message: error.message };
    }
    options.onChanged(shipment.orderId);
    return { ok: true, value: shipment };
  }
  ipcMain.handle("commerce:shipping:configuration", () => { options.assertUnlocked(); return options.service.getConfiguration(); });
  ipcMain.handle("commerce:shipping:testConnection", (_event, input?: ArasShippingConfigurationInput) => {
    options.assertUnlocked(); return options.service.testConnection(input);
  });
  ipcMain.handle("commerce:shipping:registerShipment", (_event, shipmentId: string) => mutate(() => options.service.registerShipment(shipmentId)));
  ipcMain.handle("commerce:shipping:refreshStatus", (_event, shipmentId: string) => mutate(() => options.service.refreshShipmentStatus(shipmentId)));
}
