import { once } from "node:events";
import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../../apps/desktop-app/dist-electron/database.js");

parentPort.postMessage("ready");
await once(parentPort, "message");
const database = new DesktopDatabase(workerData);
try {
  database.initialize();
  parentPort.postMessage(database.getSyncRuntimeStatus().clientId);
} finally {
  database.close();
}
