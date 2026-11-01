import { parentPort, workerData } from "node:worker_threads";
import { load } from "./market-sale-benefits-fixture.mjs";
import { secretKey } from "./commerce-benefits-fixture.mjs";
const { fullRefundMarketSale } = load("market-sale-full-refund");
parentPort.postMessage({ ready: true });
Atomics.wait(new Int32Array(workerData.start), 0, 0, 15000);
try {
  const result = fullRefundMarketSale(workerData.path, workerData.input, { actor: {
    id: "local-desktop-owner", role: "desktop_owner", assertAuthorized() {}
  }, keys: { available: () => true, load: () => secretKey } });
  parentPort.postMessage({ ok: true, ...result });
} catch (error) { parentPort.postMessage({ ok: false, code: error.code ?? error.message }); }
