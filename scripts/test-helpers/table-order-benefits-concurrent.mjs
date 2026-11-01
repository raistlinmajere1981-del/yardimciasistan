import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { load } from "./market-sale-benefits-fixture.mjs";
import { secretKey } from "./commerce-benefits-fixture.mjs";
const db = new DatabaseSync(workerData.path);
const authority = { actor: { id: "local-desktop-owner", role: "desktop_owner", assertAuthorized() {} }, keys: { load: () => secretKey } };
const { settleTableOrderBenefits } = load("table-order-benefits");
parentPort.postMessage("ready"); Atomics.wait(new Int32Array(workerData.start), 0, 0);
try { parentPort.postMessage({ ok: true, receipt: settleTableOrderBenefits(db, workerData.input, authority) }); }
catch (error) { parentPort.postMessage({ ok: false, code: error.code, message: error.message }); }
finally { db.close(); }
