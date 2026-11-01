import { parentPort, workerData } from "node:worker_threads";
import { completeMarketSale } from "./market-sale-benefits-fixture.mjs";
import { secretKey } from "./commerce-benefits-fixture.mjs";
parentPort.postMessage({ ready: true });
Atomics.wait(new Int32Array(workerData.start), 0, 0, 15000);
try {
  const result = completeMarketSale(workerData.path, workerData.input, { actor: {
    id: "local-desktop-owner", role: "desktop_owner", assertAuthorized() {}
  }, keys: { available: () => true, load: () => secretKey } });
  parentPort.postMessage({ ok: true, saleId: result.sale.id });
} catch (error) { parentPort.postMessage({ ok: false, code: error.code ?? error.message }); }
