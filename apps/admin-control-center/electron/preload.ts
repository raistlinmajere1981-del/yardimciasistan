import { contextBridge, ipcRenderer } from "electron";
import type { AdminBridge } from "../shared/contracts";

const bridge: AdminBridge = {
  getOverview: () => ipcRenderer.invoke("admin:get-overview"),
  checkDependencyUpdates: () => ipcRenderer.invoke("admin:check-dependency-updates"),
  getVerificationRunState: () => ipcRenderer.invoke("admin:get-verification-run-state"),
  startVerification: (request) => ipcRenderer.invoke("admin:start-verification", request),
  cancelVerification: () => ipcRenderer.invoke("admin:cancel-verification"),
  onVerificationRunState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
    ipcRenderer.on("admin:verification-run-state", handler);
    return () => ipcRenderer.removeListener("admin:verification-run-state", handler);
  },
  openExternal: (url) => ipcRenderer.invoke("admin:open-external", url)
};

contextBridge.exposeInMainWorld("adminControlCenter", bridge);
