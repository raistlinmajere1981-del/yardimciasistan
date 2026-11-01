import { parentPort, workerData } from "node:worker_threads";
import { fixture, intent, permit } from "./commerce-benefits-fixture.mjs";
const f = fixture({ existingPath: workerData.path });
const request = intent({ source: { kind: "sale", id: workerData.id },
  requestedPointsMinor: workerData.couponSecret ? 0 : 7000, couponCodes: workerData.couponSecret ? [workerData.couponSecret] : [] });
const authorizationId = workerData.couponSecret ? permit(f, request) : null;
parentPort.postMessage({ ready: true });
Atomics.wait(new Int32Array(workerData.start), 0, 0, 10000);
try {
  const receipt = f.transact(tx => f.store.reserve(tx, request, `r-${workerData.id}`, authorizationId));
  parentPort.postMessage({ ok: true, reservationId: receipt.reservationId });
} catch (error) { parentPort.postMessage({ ok: false, code: error.code ?? error.message }); }
finally { f.close(); }
