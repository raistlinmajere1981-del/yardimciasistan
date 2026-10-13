import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const shared = require("../../packages/shared/dist/index.js");

export function verifyMarketBarcodeFastPullLifecycle() {
  const handlers = new Map(), gates = [], updates = [];
  let locked = false, deniedCapability = "";
  const registry = {};
  // Execute the full production owner; unrelated registration modules are inert fixtures.
  runInNewContext(readFileSync(new URL("../../apps/desktop-app/dist-electron/desktop-ipc-registry.js", import.meta.url), "utf8"), {
    exports: registry,
    require: (name) => {
      if (name === "electron") return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } };
      if (name === "@yardimci-asistan/shared") return shared;
      if (name === "./android-installation-service") return { AndroidInstallationService: class {} };
      if (name === "./desktop-dictation-service") return {
        createDesktopDictationService: () => ({ invalidate() {}, canCaptureAudio: () => false })
      };
      return new Proxy({}, { get: () => () => {} });
    }
  });
  const coordinator = { setMarketBarcodeFastPullEnabled: (active) => {
    updates.push(active); return { active, intervalMs: 1500, transport: "hosting" };
  } };
  const handle = registry.registerDesktopIpcHandlers({
    getAppLockService: () => ({}), getSyncCoordinator: () => coordinator,
    assertUnlocked: () => { gates.push("session"); if (locked) throw new Error("locked"); },
    assertCapability: (capability) => { gates.push(capability); if (deniedCapability === capability) throw new Error("capability disabled"); }
  });
  const sender = (id) => Object.assign(new EventEmitter(), { id });
  const first = sender(1), second = sender(2);
  const set = (source, enabled) => handlers.get("sync:setMarketBarcodeFastPull")({ sender: source }, enabled);
  const required = [shared.BUSINESS_CAPABILITIES.CATALOG, shared.BUSINESS_CAPABILITIES.SALES, shared.BUSINESS_CAPABILITIES.RETAIL_BARCODE];

  for (let cycle = 0; cycle < 50; cycle++) {
    assert.equal(set(first, true).active, true);
    assert.equal(first.listenerCount("destroyed"), 1, `cycle ${cycle}: exactly one owned listener`);
    assert.equal(set(first, false).active, false);
    assert.equal(first.listenerCount("destroyed"), 0, `cycle ${cycle}: disable removes listener`);
  }
  set(first, true);
  for (let repeat = 0; repeat < 50; repeat++) set(first, true);
  assert.equal(first.listenerCount("destroyed"), 1, "repeated enable is idempotent");
  set(second, true);
  assert.equal(second.listenerCount("destroyed"), 1);
  first.emit("destroyed");
  assert.equal(first.listenerCount("destroyed"), 0);
  assert.equal(updates.at(-1), true, "destroying one sender preserves the other sender's lease");
  assert.equal(second.listenerCount("destroyed"), 1);
  set(first, true);
  assert.equal(set(first, false).active, true, "disabling one sender preserves the other sender's lease");
  const beforeDisabledDestroy = updates.length;
  first.emit("destroyed");
  assert.equal(updates.length, beforeDisabledDestroy, "disabled sender has no stale callback");
  second.emit("destroyed");
  assert.equal(updates.at(-1), false, "last destroyed sender stops fast pull");
  assert.equal(second.listenerCount("destroyed"), 0);

  set(first, true); set(second, true);
  locked = true; handle.clearMarketBarcodeFastPull(); locked = false;
  assert.equal(updates.at(-1), false);
  assert.equal(first.listenerCount("destroyed"), 0);
  assert.equal(second.listenerCount("destroyed"), 0);
  const beforeClearedDestroy = updates.length;
  first.emit("destroyed"); second.emit("destroyed");
  assert.equal(updates.length, beforeClearedDestroy, "clear removes callbacks as well as leases");
  set(first, true);
  assert.equal(first.listenerCount("destroyed"), 1, "clear permits re-enable");
  handle.clearMarketBarcodeFastPull();
  const unrelated = () => {};
  first.on("destroyed", unrelated); set(first, true); handle.clearMarketBarcodeFastPull();
  assert.deepEqual(first.listeners("destroyed"), [unrelated], "clear preserves unrelated listeners");
  first.removeListener("destroyed", unrelated);

  for (const enabled of [true, false]) {
    gates.length = 0; locked = true;
    const before = updates.length;
    assert.throws(() => set(first, enabled), /locked/);
    assert.deepEqual(gates, ["session"], "session gate precedes capability and mutation");
    assert.equal(updates.length, before);
    assert.equal(first.listenerCount("destroyed"), 0);
  }
  locked = false;
  set(first, true); locked = true;
  const beforeLockedDisable = updates.length;
  assert.throws(() => set(first, false), /locked/);
  assert.equal(first.listenerCount("destroyed"), 1, "locked disable cannot change an active lease");
  assert.equal(updates.length, beforeLockedDisable);
  locked = false; set(first, false);
  for (const capability of required) {
    deniedCapability = capability; gates.length = 0;
    const before = updates.length;
    assert.throws(() => set(first, true), /capability disabled/);
    assert.deepEqual(gates, ["session", ...required.slice(0, required.indexOf(capability) + 1)]);
    assert.equal(updates.length, before);
    assert.equal(first.listenerCount("destroyed"), 0);
  }
  deniedCapability = ""; gates.length = 0;
  assert.equal(set(first, true).active, true);
  assert.deepEqual(gates, ["session", ...required]);
  deniedCapability = required[0]; gates.length = 0;
  assert.equal(set(first, false).active, false, "disable can release a lease after capability withdrawal");
  assert.deepEqual(gates, ["session"]);
  assert.equal(first.listenerCount("destroyed"), 0);
  handle.clearMarketBarcodeFastPull(); handle.clearMarketBarcodeFastPull();
  console.log("Fast-pull listener lifecycle: 50 cycles, repeated enable, two senders, destroy, clear/re-enable and gate ordering passed.");
}
