import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createSyncFetchWithTimeout } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");

let receivedSignal = false;
const slowFetch = async (_input, init = {}) => {
  receivedSignal = Boolean(init.signal);
  return new Promise((_resolve, reject) => {
    const rejectAsAbort = () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    };

    if (!init.signal) {
      reject(new Error("Timeout wrapper did not provide an AbortSignal."));
      return;
    }
    if (init.signal.aborted) {
      rejectAsAbort();
      return;
    }
    init.signal.addEventListener("abort", rejectAsAbort, { once: true });
  });
};

const startedAt = Date.now();
const timeoutFetch = createSyncFetchWithTimeout(slowFetch, 25);
await assert.rejects(timeoutFetch("https://example.test/api/sync.php"), (error) => error?.name === "AbortError");
const elapsedMs = Date.now() - startedAt;

assert.equal(receivedSignal, true);
assert.ok(elapsedMs >= 10, `Timeout fired unexpectedly early: ${elapsedMs}ms`);
assert.ok(elapsedMs < 500, `Timeout did not abort promptly: ${elapsedMs}ms`);

console.log(`Sync HTTP timeout smoke passed in ${elapsedMs}ms.`);
