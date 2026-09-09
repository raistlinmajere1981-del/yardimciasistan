import { once } from "node:events";
import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../../apps/desktop-app/dist-electron/database.js");

// The smoke is meant to race initialize(), not the constructor's one-time
// journal-mode negotiation. Let every worker open its connection first, then
// release all initialized connections together below.
const database = openDatabaseWithRetry();
parentPort.postMessage("ready");
await once(parentPort, "message");
try {
  database.initialize();
  parentPort.postMessage(database.getSyncRuntimeStatus().clientId);
} finally {
  database.close();
}

function openDatabaseWithRetry() {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return new DesktopDatabase(workerData);
    } catch (error) {
      const busy = error instanceof Error && /database is locked|database is busy/i.test(error.message);
      if (!busy || attempt === 19) throw error;
      Atomics.wait(sleeper, 0, 0, 25 * (attempt + 1));
    }
  }
  throw new Error("Desktop database connection could not be opened.");
}
