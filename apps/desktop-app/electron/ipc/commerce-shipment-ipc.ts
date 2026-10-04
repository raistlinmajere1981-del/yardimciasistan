import { ipcMain } from "electron";
import type { CommerceShipment, UpdateCommerceShipmentStatusInput } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import type { CommerceIpcMutationResult } from "../commerce-ipc-contract";
import { CommerceShipmentDomainError } from "../commerce-shipment-store";
import { classifyExpectedCommerceRejection } from "../commerce-ipc";
import { desktopLog } from "../desktop-logger";

export function registerCommerceShipmentIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  onChanged: (orderId: string) => void;
}) {
  function mutate(channel: string, operation: () => CommerceShipment): CommerceIpcMutationResult<CommerceShipment> {
    options.assertUnlocked();
    let shipment: CommerceShipment;
    try {
      shipment = operation();
    } catch (error) {
      const rejection = error instanceof CommerceShipmentDomainError
        ? { code: error.code, message: error.message } : classifyExpectedCommerceRejection(error);
      if (!rejection) throw error;
      desktopLog.warn({ scope: "commerce-shipment", event: "commerce-shipment.domain.rejected",
        message: rejection.message, meta: { channel, code: rejection.code } });
      return { ok: false, expected: true, ...rejection };
    }
    options.onChanged(shipment.orderId);
    return { ok: true, value: shipment };
  }
  ipcMain.handle("commerce:shipment:listForOrder", (_event, orderId: string) => {
    options.assertUnlocked();
    return options.getDatabase().listShipmentsForOrder(orderId);
  });
  ipcMain.handle("commerce:shipment:create", (_event, orderId: string) =>
    mutate("commerce:shipment:create", () => options.getDatabase().createShipmentForOrder(orderId)));
  ipcMain.handle("commerce:shipment:updateStatus", (_event, input: UpdateCommerceShipmentStatusInput) =>
    mutate("commerce:shipment:updateStatus", () => options.getDatabase().updateShipmentStatus(input)));
}
