import type { AdminBridge } from "../shared/contracts";

declare global {
  interface Window {
    adminControlCenter: AdminBridge;
  }
}

export {};
