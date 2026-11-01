import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { isMainThread, MessageChannel, receiveMessageOnPort, Worker, workerData } from "node:worker_threads";

// Test-only RPC: a real independent connection in a worker, no timers deciding
// ordering. Every response is a completion barrier; every wait is bounded.
export function createCompanionSpendGrantWorker(path) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL(import.meta.url), { workerData: { path, signal: signal.buffer, port: port2 }, transferList: [port2] });
  let workerError;
  worker.on("error", error => { workerError = error; });
  const receive = () => {
    const deadline = Date.now() + 10_000;
    while (Atomics.load(signal, 0) === 0) {
      const remaining = deadline - Date.now();
      assert.ok(remaining > 0, "grant worker completion barrier timed out");
      Atomics.wait(signal, 0, 0, remaining);
    }
    const response = receiveMessageOnPort(port1)?.message;
    assert.ok(response, "worker completion must publish a response");
    if (response.fatal) throw new Error(response.fatal);
    return response;
  };
  const run = operation => {
    if (workerError) throw workerError;
    Atomics.store(signal, 0, 0);
    port1.postMessage(operation);
    return receive();
  };
  try { assert.equal(receive().ready, true); }
  catch (error) { port1.close(); void worker.terminate(); throw error; }
  return { run, async close() {
    // Termination also bounds failure cleanup; no detached child can hang a run.
    try { run("close"); }
    finally { port1.close(); await worker.terminate(); }
  } };
}

if (!isMainThread) {
  const { port } = workerData, signal = new Int32Array(workerData.signal);
  const respond = value => { port.postMessage(value); Atomics.store(signal, 0, 1); Atomics.notify(signal, 0); };
  let db;
  try {
    const { load } = await import("./market-sale-benefits-fixture.mjs");
    const grants = load("database/android-benefits-spend-grant-store");
    db = new DatabaseSync(workerData.path);
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=100");
    const owner = { assertAuthorized() {} }; // Isolated fixture Desktop-owner authority.
    const generation = () => grants.readAndroidBenefitsSpendGrantGeneration(db, "b1", "device-one", "c1");
    port.on("message", operation => {
      const before = db.prepare("SELECT total_changes() n").get().n;
      try {
        if (operation === "close") { db.close(); respond({ closed: true }); port.close(); return; }
        const originalGeneration = generation();
        const rollback = operation.endsWith("-rollback");
        if (rollback) db.exec("BEGIN IMMEDIATE");
        let changed;
        if (operation === "revoke" || operation === "revoke-rollback") changed = grants.revokeAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
        else if (operation === "grant" || operation === "grant-rollback") changed = grants.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
        else throw new Error("Unknown grant worker operation");
        const attemptedGeneration = generation();
        if (rollback) db.exec("ROLLBACK");
        assert.equal(db.isTransaction, false, "owner statement committed before response");
        respond({ ok: true, changed, originalGeneration, attemptedGeneration, generation: generation(), writes: db.prepare("SELECT total_changes() n").get().n - before });
      } catch (error) {
        if (db.isTransaction) db.exec("ROLLBACK");
        respond({ ok: false, writes: db.prepare("SELECT total_changes() n").get().n - before, code: error.code, errcode: error.errcode, message: error.message, inTransaction: db.isTransaction });
      }
    });
    respond({ ready: true });
  } catch (error) { db?.close(); respond({ fatal: error.message }); port.close(); }
}
