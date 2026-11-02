import { ipcMain } from "electron";
import { readSiteTrafficSnapshot, type TrafficConnection } from "../web-traffic/snapshot";

export function registerWebTrafficIpc(options: {
  config: () => TrafficConnection;
  assertUnlocked: () => void;
}) {
  ipcMain.handle("webTraffic:snapshot", async (_event, days: 7 | 30, fresh?: boolean) => {
    options.assertUnlocked();
    if (days !== 7 && days !== 30) return { ok: false, message: "Geçersiz tarih aralığı.", stale: false };
    const result = await readSiteTrafficSnapshot(options.config(), days, fresh === true);
    options.assertUnlocked();
    return result;
  });
}
