import { contextBridge, ipcRenderer } from "electron";
import type { AdminBridge } from "../shared/contracts";

const bridge: AdminBridge = {
  getOverview: () => ipcRenderer.invoke("admin:get-overview"),
  openExternal: (url) => ipcRenderer.invoke("admin:open-external", url)
};

contextBridge.exposeInMainWorld("adminControlCenter", bridge);
