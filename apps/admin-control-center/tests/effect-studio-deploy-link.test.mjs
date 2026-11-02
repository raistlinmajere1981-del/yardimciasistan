import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EFFECT_SITE_DEPLOY_TARGETS,
  deployTargetScopeNote,
  effectSiteDeployTarget
} from "../shared/contracts.ts";

test("effect studio links only explicitly reviewed site/deploy pairs", () => {
  assert.deepEqual(EFFECT_SITE_DEPLOY_TARGETS, { landing: "landing" });
  assert.equal(effectSiteDeployTarget("landing"), "landing");
  // A similar name, URL or neighbouring site must never be inferred.
  assert.equal(effectSiteDeployTarget("landing-web"), null);
  assert.equal(effectSiteDeployTarget("teknikel"), null);
  assert.equal(effectSiteDeployTarget("blacksea"), null);
  assert.equal(effectSiteDeployTarget("gundogdu"), null);
  assert.equal(effectSiteDeployTarget(""), null);
});

test("module-only deploy targets carry an explicit scope explanation", () => {
  const note = deployTargetScopeNote("teknikel-web");
  assert.match(note, /web modül/i);
  assert.match(note, /site kökü/i);
  assert.match(note, /görselleri/i);
  assert.equal(deployTargetScopeNote("landing"), "", "site deploy targets need no module-only note");
});
