import { ipcMain } from "electron";
import type { createDesktopDictationService } from "../desktop-dictation-service";

export function registerDesktopDictationIpcHandlers(service: ReturnType<typeof createDesktopDictationService>) {
  const senders = new Set<number>();
  const trackSender = (sender: Electron.WebContents) => {
    if (!senders.has(sender.id)) {
      const id = sender.id;
      senders.add(id);
      sender.once("destroyed", () => { service.releaseSender(id); senders.delete(id); });
    }
  };
  ipcMain.handle("dictation:getStatus", () => service.getStatus());
  ipcMain.handle("dictation:transcribe", (event, input: unknown) => {
    trackSender(event.sender);
    return service.transcribe(event.sender.id, input);
  });
  // Cancellation must still work after lock/capability withdrawal; it confers no upload authority.
  ipcMain.handle("dictation:cancel", (event, id: unknown) => { trackSender(event.sender); return service.cancel(event.sender.id, id); });
}
