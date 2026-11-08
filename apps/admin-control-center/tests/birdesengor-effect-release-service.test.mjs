import test from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { BirdesengorEffectRelease } from "../dist-electron/electron/services/birdesengor-effect-release-service.js";
import { getDeploymentTargets } from "../dist-electron/electron/services/deployment-runner.js";
import {
  BIRDESENGOR_EFFECT_DEPLOY_TARGET_ID as targetId,
  BIRDESENGOR_EFFECT_SCENE_ID as sceneId
} from "../shared/contracts.ts";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const readiness = { ready: true, effectCount: 6, enabledCount: 6, mountedCount: 6, problems: [] };

function fixtures(results = {}) {
  const listeners = new Set(), calls = [], studioCalls = [];
  let sourceHash = "source-A", currentReady = true, draftRevision = 1;
  const runner = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start(request) {
      calls.push(request);
      if (results.rejectStart === request.action) return { accepted: false, message: "already running" };
      queueMicrotask(() => {
        for (const fn of listeners) fn({
          targetId: request.targetId, action: request.action, running: false,
          result: results[request.action] ?? "passed"
        });
      });
      return { accepted: true };
    }
  };
  const studio = async (action, id) => {
    studioCalls.push([action, id]);
    const scene = { kind: "objectScene", sceneId: "birdesengor-study-v2", revision: draftRevision };
    return { sourceHash, changed: action === "prepare", readiness: { ...readiness, ready: currentReady }, scene,
      draftDigest: action === "prepare" ? createHash("sha256").update(JSON.stringify(scene)).digest("hex") : undefined };
  };
  return {
    runner, calls, studioCalls,
    site: new BirdesengorEffectRelease(runner, studio),
    updateSource: value => { sourceHash = value; },
    updateDraft: value => { draftRevision = value; },
    updateReady: value => { currentReady = value; }
  };
}

test("explicit V2 source is available only through reviewed deployment target", () => {
  const targets = getDeploymentTargets(root);
  const target = targets.find(item => item.id === targetId);
  assert.equal(target?.installationId, "birdesengor");
  assert.match(target.confirmText, /birdesengorgizlievren.com/);
  assert.match(target.impact.join(" "), /content\//);
  assert.match(target.impact.join(" "), /topluluk/);
  assert.ok(targets.filter(item => item.id === targetId).length === 1);
});

test("stages source, runs dry-run, waits for explicit token, deploys and verifies", async () => {
  const {site,calls,studioCalls} = fixtures();
  const gate = await site.preflight(sceneId);
  assert.match(gate.token, /^[0-9a-f-]{36}$/i);
  assert.equal(gate.sourceHash, "source-A");
  assert.equal(gate.changed, true);
  assert.equal(gate.readiness.mountedCount, 6);
  assert.deepEqual(calls, [{ targetId, action: "preflight" }], "a dry-run never starts a deploy");
  assert.deepEqual(studioCalls, [["prepare", sceneId],["load", sceneId]]);
  const result = await site.deploy(sceneId, gate.token);
  assert.equal(result.ok, true);
  assert.match(result.siteUrl, /birdesengorgizlievren\.com/);
  assert.deepEqual(calls.map(item => item.action), ["preflight", "deploy"]);
  await assert.rejects(site.deploy(sceneId, gate.token), /onayı geçersiz/);
});

test("only the fixed V2 scene can prepare or deploy, never custom fixtures", async () => {
  const {site,calls} = fixtures();
  await assert.rejects(site.preflight("birdesengor:some-other"), /Yalnız kanonik/);
  await assert.rejects(site.preflight({id:sceneId}), /Yalnız kanonik/);
  await assert.rejects(site.deploy("landing:hero", "token"), /Yalnız kanonik/);
  assert.deepEqual(calls, []);
});

test("failed or rejected preflight never deploys", async () => {
  for (const results of [{preflight:"failed"}, {preflight:"cancelled"}, {rejectStart:"preflight"}]) {
    const {site,calls} = fixtures(results);
    await assert.rejects(site.preflight(sceneId), /ön kontrolü başarısız|already running/);
    await assert.rejects(site.deploy(sceneId,"guessed"), /onayı geçersiz/);
    assert.deepEqual(calls.map(item => item.action), ["preflight"]);
  }
});

test("source changes after dry-run invalidate approval, even when user has a token", async () => {
  const fixture = fixtures();
  const gate = await fixture.site.preflight(sceneId);
  fixture.updateSource("source-B");
  await assert.rejects(fixture.site.deploy(sceneId,gate.token), /kaynağı.*değişti/);
  assert.deepEqual(fixture.calls.map(item => item.action), ["preflight"]);
  await assert.rejects(fixture.site.deploy(sceneId,gate.token), /onayı geçersiz/);
});

test("saved draft changed DURING preflight aborts before approval", async () => {
  const fixture = fixtures();
  fixture.runner.subscribe(state => {
    if (state.action === "preflight" && !state.running) fixture.updateDraft(2);
  });
  await assert.rejects(fixture.site.preflight(sceneId), /taslak değişti/);
  assert.deepEqual(fixture.calls.map(item => item.action), ["preflight"]);
});

test("saved draft changed after preflight also invalidates approval", async () => {
  const fixture = fixtures();
  const gate = await fixture.site.preflight(sceneId);
  fixture.updateDraft(2);
  await assert.rejects(fixture.site.deploy(sceneId,gate.token), /taslağı değişti/);
  assert.deepEqual(fixture.calls.map(item => item.action), ["preflight"]);
});

test("missing mount readiness and concurrent edits stop publication", async () => {
  const fixture = fixtures();
  fixture.updateReady(false);
  await assert.rejects(fixture.site.preflight(sceneId), /uygun değil/);
  assert.deepEqual(fixture.calls, []);
  fixture.updateReady(true);
  const gate = await fixture.site.preflight(sceneId);
  fixture.site.invalidate();
  await assert.rejects(fixture.site.deploy(sceneId,gate.token), /onayı geçersiz/);
  assert.deepEqual(fixture.calls.map(item => item.action), ["preflight"]);
});

test("wrong or reused approval token and failed deploy never claim success", async () => {
  const fixture = fixtures({deploy:"failed"});
  const gate = await fixture.site.preflight(sceneId);
  await assert.rejects(fixture.site.deploy(sceneId,"wrong"), /onayı geçersiz/);
  await assert.rejects(fixture.site.deploy(sceneId,gate.token), /onayı geçersiz/);
  const second = await fixture.site.preflight(sceneId);
  await assert.rejects(fixture.site.deploy(sceneId,second.token), /doğrulama başarısız/);
  assert.deepEqual(fixture.calls.map(item => item.action), ["preflight","preflight","deploy"]);
});

test("old approval expires without remote side effects", async () => {
  const fixture=fixtures();
  const original=Date.now;
  let now=10_000;
  Date.now=()=>now;
  try {
    const gate=await fixture.site.preflight(sceneId);
    now+=11*60*1000;
    await assert.rejects(fixture.site.deploy(sceneId,gate.token), /süresi doldu/);
    assert.deepEqual(fixture.calls.map(item=>item.action), ["preflight"]);
  } finally { Date.now=original; }
});
