import assert from "node:assert/strict";
import { test } from "node:test";
import { getInstallation, validateInstallationRegistry } from "./lib/installation-registry.mjs";

test("installation registry canonical hedefleri ve credential referanslarını içerir", () => {
  assert.deepEqual(validateInstallationRegistry(), []);

  const ya = getInstallation("ya");
  assert.equal(ya.webModuleUrl, "https://yardimciasistan.alwaysdata.net/yardimci-asistan");
  assert.equal(ya.credentialRef, "alwaysdata-main");
  assert.match(ya.versionEndpoint, /\/api\/version\.php$/);

  const market = getInstallation("market-pilot");
  assert.equal(market.webModuleUrl, "https://yardimciasistantest.alwaysdata.net/yardimci-asistan");
  assert.equal(market.deploy.host, "yardimciasistantest@ssh-yardimciasistantest.alwaysdata.net");
  assert.notEqual(market.deploy.remoteRoot, ya.deploy.remoteRoot);
  assert.notEqual(market.credentialRef, ya.credentialRef);

  const teknikel = getInstallation("teknikel");
  assert.equal(teknikel.webModuleUrl, "https://yardimciasistantoptanci.alwaysdata.net/yardimci-asistan");
  assert.equal(teknikel.deploy.host, "yardimciasistantoptanci@ssh-yardimciasistantoptanci.alwaysdata.net");
  assert.equal(teknikel.deploy.remoteRoot, "/home/yardimciasistantoptanci/www/yardimci-asistan");
  assert.notEqual(teknikel.deploy.remoteRoot, market.deploy.remoteRoot);
  assert.notEqual(teknikel.deploy.remoteRoot, ya.deploy.remoteRoot);
  assert.notEqual(teknikel.credentialRef, market.credentialRef);
  assert.notEqual(teknikel.credentialRef, ya.credentialRef);

  const gundogdu = getInstallation("gundogdu");
  assert.equal(gundogdu.kind, "customer-site");
  assert.equal(gundogdu.siteUrl, "https://yardimciasistangunduodu.alwaysdata.net");
  assert.equal(gundogdu.deploy.host, "yardimciasistangunduodu@ssh-yardimciasistangunduodu.alwaysdata.net");
  assert.equal(gundogdu.deploy.remoteRoot, "/home/yardimciasistangunduodu/www/yardimci-asistan");
  assert.equal(gundogdu.externalRepo.defaultSibling, "gundogdu_web");
  assert.notEqual(gundogdu.credentialRef, teknikel.credentialRef);
  assert.notEqual(gundogdu.deploy.remoteRoot, teknikel.deploy.remoteRoot);

  const landing = getInstallation("landing");
  assert.equal(landing.deploy.remoteRoot, "/home/yardimciasistan/www");
  assert.equal(
    landing.release.desktopManifests.winX64,
    "https://yardimciasistan.alwaysdata.net/updates/stable/win-x64/release.json"
  );
  assert.equal(
    landing.release.desktopManifests.winX86,
    "https://yardimciasistan.alwaysdata.net/updates/stable/win-x86/release.json"
  );

  const support = getInstallation("support");
  assert.match(support.publicUrl, /\/support\/report\.php$/);

  const blacksea = getInstallation("blacksea");
  assert.equal(blacksea.externalRepo.env, "BLACKSEA_REPO");
  assert.match(blacksea.versionEndpoint, /\/yardimci-asistan\/api\/version\.php$/);
});

test("committed installation registry gerçek credential değeri taşımaz", () => {
  for (const id of ["ya", "support", "landing", "blacksea", "market-pilot", "teknikel", "gundogdu"]) {
    const installation = getInstallation(id);
    const serialized = JSON.stringify(installation);
    assert.doesNotMatch(serialized, /"syncSecret"|"password"|"apiKey"|"token"/i);
    assert.ok(String(installation.credentialRef ?? "").trim());
  }
});
