import assert from "node:assert/strict";
import { test } from "node:test";
import { getInstallation, validateInstallationRegistry } from "./lib/installation-registry.mjs";

test("installation registry canonical hedefleri ve credential referanslarını içerir", () => {
  assert.deepEqual(validateInstallationRegistry(), []);

  const ya = getInstallation("ya");
  assert.equal(ya.webModuleUrl, "https://yardimciasistan.alwaysdata.net/yardimci-asistan");
  assert.equal(ya.credentialRef, "alwaysdata-main");
  assert.match(ya.versionEndpoint, /\/api\/version\.php$/);

  const landing = getInstallation("landing");
  assert.equal(landing.deploy.remoteRoot, "/home/yardimciasistan/www");

  const support = getInstallation("support");
  assert.match(support.publicUrl, /\/support\/report\.php$/);

  const blacksea = getInstallation("blacksea");
  assert.equal(blacksea.externalRepo.env, "BLACKSEA_REPO");
  assert.match(blacksea.versionEndpoint, /\/yardimci-asistan\/api\/version\.php$/);
});

test("committed installation registry gerçek credential değeri taşımaz", () => {
  for (const id of ["ya", "support", "landing", "blacksea"]) {
    const installation = getInstallation(id);
    const serialized = JSON.stringify(installation);
    assert.doesNotMatch(serialized, /"syncSecret"|"password"|"apiKey"|"token"/i);
    assert.ok(String(installation.credentialRef ?? "").trim());
  }
});
