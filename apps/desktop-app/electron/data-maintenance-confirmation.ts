import { randomUUID } from "node:crypto";
import { ipcMain, type IpcMainEvent, type WebContents } from "electron";

export interface DataMaintenanceConfirmation {
  title: string;
  description: string;
  details: string;
  confirmLabel: string;
}

/** Keep the confirmation at the main-process validation boundary, tied to its caller. */
export function requestDataMaintenanceConfirmation(sender: WebContents, request: DataMaintenanceConfirmation): Promise<boolean> {
  if (sender.isDestroyed()) return Promise.resolve(false);
  const requestId = randomUUID();
  return new Promise((resolve) => {
    const finish = (approved: boolean) => {
      ipcMain.removeListener("dataMaintenance:confirmationResponse", respond);
      sender.removeListener("destroyed", cancel);
      sender.removeListener("did-start-navigation", cancel);
      resolve(approved);
    };
    const cancel = () => finish(false);
    const respond = (event: IpcMainEvent, id: unknown, approved: unknown) => {
      if (event.sender === sender && event.senderFrame === sender.mainFrame && id === requestId) finish(approved === true);
    };
    ipcMain.on("dataMaintenance:confirmationResponse", respond);
    sender.once("destroyed", cancel);
    sender.once("did-start-navigation", cancel);
    try { sender.send("dataMaintenance:confirmationRequested", requestId, request); }
    catch { finish(false); }
  });
}
