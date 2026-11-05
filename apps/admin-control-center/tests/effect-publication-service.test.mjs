import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publishManagedEffect } from "../dist-electron/electron/services/effect-publication-service.js";

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

function fakeRunner(result = "passed") {
  const listeners = new Set();
  const calls = [];
  return {
    calls,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start({ targetId, action }) {
      calls.push([targetId, action]);
      queueMicrotask(() => {
        for (const fn of listeners) fn({ targetId, action, running: false, result, stage: action });
      });
      return { accepted: true, message: "started" };
    }
  };
}

test("linked scene publishes only the scene, never a full site", async () => {
  const runner = fakeRunner(), calls = [];
  const dispatcher = async action => {
    calls.push(action);
    if (action === "inspect") return { siteId: "blacksea", canPublish: true, canPrepare: false };
    if (action === "publish") return { ok: true, message: "scene uploaded" };
    throw new Error("unexpected action: " + action);
  };
  const result = await publishManagedEffect(repoRoot, "blacksea:hero", runner, dispatcher);
  assert.equal(result.message, "scene uploaded");
  assert.deepEqual(calls, ["inspect", "publish"]);
  assert.deepEqual(runner.calls, []);
});

test("first publish follows reviewed site preflight, deploy, then activation", async () => {
  for (const [siteId,targetId] of [["landing","landing"],["blacksea","blacksea"],["gundogdu","gundogdu-site"]]) {
    const runner = fakeRunner(), calls = [];
    const dispatcher = async action => {
      calls.push(action);
      if (action === "inspect") return { siteId, canPublish: false, canPrepare: true };
      if (action === "activate") return { ok: true, message: "verified" };
      return { ok: true };
    };
    const result = await publishManagedEffect(repoRoot, siteId + ":coast", runner, dispatcher);
    assert.equal(result.message, "verified");
    assert.deepEqual(calls, ["inspect", "prepare", "activate"]);
    assert.deepEqual(runner.calls, [[targetId, "preflight"], [targetId, "deploy"]]);
  }
});

test("failed preflight never starts a deploy or records a live binding", async () => {
  const runner = fakeRunner("failed"), calls = [];
  const dispatcher = async action => {
    calls.push(action);
    if (action === "inspect") return { siteId: "landing", canPublish: false, canPrepare: true };
    return { ok: true };
  };
  await assert.rejects(publishManagedEffect(repoRoot, "landing:coast", runner, dispatcher), /ön kontrolü başarısız/);
  assert.deepEqual(calls, ["inspect", "prepare"]);
  assert.deepEqual(runner.calls, [["landing", "preflight"]]);
});

test("failed site deployment does not activate a binding", async () => {
  const listeners = new Set(), calls = [];
  const runner = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start({ targetId, action }) {
      calls.push(action);
      queueMicrotask(() => {
        for (const fn of listeners) fn({ targetId, action, running: false,
          result: action === "preflight" ? "passed" : "failed" });
      });
      return { accepted: true, message: "started" };
    }
  };
  const actions = [];
  await assert.rejects(publishManagedEffect(repoRoot, "landing:coast", runner, async action => {
    actions.push(action);
    return action === "inspect"
      ? { siteId: "landing", canPublish: false, canPrepare: true } : { ok: true };
  }), /site deploy işlemi başarısız/);
  assert.deepEqual(calls, ["preflight", "deploy"]);
  assert.deepEqual(actions, ["inspect", "prepare"], "a failed deploy cannot write a verified binding");
});

test("missing live scene/manifest verification prevents activation", async () => {
  const runner = fakeRunner(), actions = [];
  await assert.rejects(publishManagedEffect(repoRoot, "landing:coast", runner, async action => {
    actions.push(action);
    if (action === "inspect") return { siteId: "landing", canPublish: false, canPrepare: true };
    if (action === "activate") throw new Error("Canlı efekt manifesti doğrulanamadı");
    return { ok: true };
  }), /manifesti doğrulanamadı/);
  assert.deepEqual(actions, ["inspect", "prepare", "activate"]);
  assert.deepEqual(runner.calls, [["landing", "preflight"], ["landing", "deploy"]]);
});

test("rejects module-only/unmapped and unprepared publication targets", async () => {
  for (const siteId of ["teknikel", "unknown"]) {
    const runner = fakeRunner(), calls = [];
    const dispatcher = async action => {
      calls.push(action);
      return { siteId, canPublish: false, canPrepare: true };
    };
    await assert.rejects(publishManagedEffect(repoRoot, siteId + ":scene", runner, dispatcher), /tam site deploy/);
    assert.deepEqual(calls, ["inspect"]);
    assert.deepEqual(runner.calls, []);
  }
  await assert.rejects(publishManagedEffect(repoRoot, "birdesengor:scene_v2", fakeRunner(),
    async () => ({ siteId: "birdesengor", canPublish: false, canPrepare: false })), /yayın yolu/);
});
