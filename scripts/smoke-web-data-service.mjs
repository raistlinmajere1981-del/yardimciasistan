import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { createServer } from "node:net";
import { activateFixtureSource, publicationEnvelope } from "./test-helpers/publication-protocol.mjs";

const root = mkdtempSync(join(tmpdir(), "ya-api-package-"));
const source = join(root, "firm-template/web-module");
const packageScript = resolve("scripts/package-web-module.mjs");
const secret = "api-contract-fixture-secret";
let server;
const pack = () => spawnSync(process.execPath, [packageScript], { cwd: root, encoding: "utf8" });
try {
  cpSync("product-version.json", join(root, "product-version.json"));
  cpSync("firm-template/web-module", source, { recursive: true, filter: path => {
    const name = relative("firm-template/web-module", path);
    return (!name.startsWith("data/") && !name.startsWith("media/") && !name.includes(".local."))
      || ["data/.htaccess", "data/ai-conversations.json", "media/.htaccess"].includes(name);
  } });
  writeFileSync(join(source, "data/fixture-private.local.php"), "<?php return ['secret' => 'private-fixture'];");
  writeFileSync(join(source, "data/ai-conversations.json"), '[{"message":"fixture-private-history"}]');
  const result = pack();
  assert.equal(result.status, 0, result.stderr);
  const output = join(root, "artifacts/web-module-deploy");
  const hosting = join(output, "yardimci-asistan");
  const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
  const paths = manifest.files.map(file => file.path);
  assert.ok(paths.includes("api/dealer/order.php"));
  assert.ok(paths.includes("api/whatsapp-webhook.php"));
  assert.ok(paths.includes("api/business-gallery-media.php"));
  assert.ok(paths.includes(".user.ini"), "Document upload limits must ship with the API service");
  for (const name of ["commerce-quote", "commerce-mail", "commerce-mail-worker", "commerce-checkout", "commerce-payment-provider", "commerce-order-payment"]) assert.ok(paths.includes(`lib/${name}.php`));
  assert.ok(paths.includes("lib/request-documents.php"), "Document handling must ship with the request endpoint");
  assert.equal(readFileSync(join(hosting, ".user.ini"), "utf8"), readFileSync(join(source, ".user.ini"), "utf8"));
  assert.ok(paths.every(path => !/\.(?:js|css|html|png|webp|tsx?)$/.test(path)));
  assert.ok(paths.every(path => !/^(?:magaza|duyurular|bayi|assets)\//.test(path)));
  assert.ok(!paths.includes("data/fixture-private.local.php"));
  assert.equal(readFileSync(join(hosting, "data/ai-conversations.json"), "utf8"), "[]\n");
  for (const archive of manifest.archives.filter(item => item.status === "created")) {
    const isTar = archive.path.endsWith(".tar.gz");
    const listing = spawnSync(isTar ? "tar" : "unzip", isTar ? ["-tzf", join(root, archive.path)] : ["-Z1", join(root, archive.path)], { encoding: "utf8" });
    assert.equal(listing.status, 0, listing.stderr);
    const files = listing.stdout.trim().split("\n").filter(path => !path.endsWith("/")).map(path => path.replace(/^yardimci-asistan\//, "")).sort();
    assert.deepEqual(files, [...paths].sort(), "Archive must contain exactly the verified backend files");
  }
  for (const name of ["index.php", "lib/site.css", "widget.js", ".other.ini", "config/.user.ini"]) {
    writeFileSync(join(source, name), "presentation fixture");
    const rejected = pack();
    assert.notEqual(rejected.status, 0, `${name} must not enter the backend package`);
    assert.match(rejected.stderr, /API-only kaynakta beklenmeyen dosya/);
    rmSync(join(source, name));
  }
  const configFile = join(hosting, "config/business.json");
  writeFileSync(configFile, JSON.stringify({ ...JSON.parse(readFileSync(configFile, "utf8")), sync_secret: secret, logo_url: "/assets/logo.webp" }));
  const probe = createServer();
  await new Promise(done => probe.listen(0, "127.0.0.1", done));
  const port = probe.address().port;
  await new Promise(done => probe.close(done));
  const base = `http://127.0.0.1:${port}`;
  server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", hosting], { stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/api/version.php`)).ok) { ready = true; break; } } catch {}
    await new Promise(done => setTimeout(done, 50));
  }
  assert.ok(ready, "Packaged PHP service must start");
  for (const path of ["/", "/widget.js", "/magaza/", "/duyurular/", "/bayi/", "/assets/business-map.js"]) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  await activateFixtureSource(base, secret, "api-contract-desktop");
  const publish = async (body) => {
    const response = await fetch(`${base}/api/sync.php`, { method: "POST", headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": secret },
      body: JSON.stringify(publicationEnvelope(body, "api-contract-desktop")) });
    assert.equal(response.status, 200, await response.text());
  };
  await publish({ action: "publish_business_context", business_context: { profile_id: "pension_restaurant", business_name: "API işletmesi", aboutText: "İşletme açıklaması", gallery: [
    { id: "gallery-one", url: "/yardimci-asistan/media/gallery/gallery/one.jpg", title: "Galeri fotoğrafı", kind: "cover", sort_order: 0 },
    { url: "file:///private/customer.jpg", title: "excluded" }
  ] } });
  const response = await fetch(`${base}/api/business.php`);
  assert.match(response.headers.get("content-type"), /application\/json/);
  const business = (await response.json()).business;
  assert.equal(business.display_name, "API işletmesi");
  assert.equal(business.logo_url, "/assets/logo.webp", "Public brand logo should be available for the shared Android APK");
  writeFileSync(configFile, JSON.stringify({ ...JSON.parse(readFileSync(configFile, "utf8")), logo_url: "https://wrong.example/fake.png" }));
  const unsafeLogo = (await (await fetch(base + "/api/business.php")).json()).business;
  assert.equal(unsafeLogo.logo_url, "", "Foreign brand logo URLs must not be reflected");
  writeFileSync(configFile, JSON.stringify({ ...JSON.parse(readFileSync(configFile, "utf8")), logo_url: "/assets/logo.webp" }));
  assert.equal(business.about_text, "İşletme açıklaması");
  assert.equal(business.gallery.length, 1);
  assert.equal(business.gallery[0].url, "/yardimci-asistan/media/gallery/gallery/one.jpg");
  assert.equal(business.gallery[0].title, "Galeri fotoğrafı");
  assert.ok(!JSON.stringify(business).includes(secret));
  assert.ok(Array.isArray(business.public_surfaces));
  assert.equal(typeof business.requests_enabled, "boolean");
  for (const [endpoint, list] of [["rooms", "rooms"], ["tables", "tables"], ["catalog", "products"]]) {
    const res = await fetch(`${base}/api/${endpoint}.php`);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.enabled, false);
    assert.deepEqual(data[list], []);
    const cached = await fetch(`${base}/api/${endpoint}.php`, { headers: { "If-None-Match": res.headers.get("etag") } });
    assert.equal(cached.status, 304);
  }
  assert.equal((await fetch(`${base}/api/menu.php`)).status, 200);
  await publish({ action: "publish_menu", menu: { enabled: false, categories: [], items: [] } });
  assert.equal((await fetch(`${base}/api/menu.php`)).status, 404);
  assert.equal((await fetch(`${base}/api/order.php`)).status, 405);
  assert.equal((await fetch(`${base}/lib/commerce-mail-worker.php`)).status, 404, "mail worker cannot be invoked over HTTP");
  assert.equal((await fetch(`${base}/api/dealer/session.php`)).status, 403);
  console.log("web-data-service-smoke-ok: backend archives, presentation rejection, public profile/gallery, visibility, ETag and auth");
} finally {
  if (server) {
    server.kill();
    await new Promise(done => server.exitCode !== null ? done() : server.once("exit", done));
  }
  rmSync(root, { recursive: true, force: true });
}
