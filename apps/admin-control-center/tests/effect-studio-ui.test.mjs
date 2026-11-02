import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = resolve(here, "../dist-renderer");
const browserPath = "/usr/bin/brave";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

// Renderer-only smoke test against the built UI. The bridge is mocked, so no
// Electron IPC, filesystem write or deployment runner is involved.
test("staged landing links to the Deploy screen without starting a deploy", { timeout: 90_000 }, async () => {
  assert.ok(existsSync(join(dist, "index.html")), "run the admin build before this test");
  assert.ok(existsSync(browserPath), "Brave is required for the local renderer check");

  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = resolve(dist, relative);
    if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-gpu"] });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      const installations = [
        { id: "landing", title: "Yardımcı Asistan landing", kind: "landing", status: "ready", statusNote: "Hazır", siteUrl: "https://demo.example.test", deployType: "ssh-rsync", credentialStatus: "configured", credentialRef: "demo", liveWebVersion: null, versionEndpoint: null },
        { id: "teknikel", title: "Teknikel Kombi", kind: "customer-site", status: "ready", statusNote: "Hazır", siteUrl: "https://teknikel.example.test", deployType: "ssh-rsync", credentialStatus: "configured", credentialRef: "demo", liveWebVersion: null, versionEndpoint: null }
      ];
      const targets = [
        { id: "landing", installationId: "landing", title: "Yardımcı Asistan landing", description: "Ana landing sayfasını canlı www köküne yayınlar; web modülüne dokunmaz.", confirmText: "Canlı landing güncellenecek.", impact: ["Landing root sayfaları güncellenir."], available: true, availabilityNote: "Canlı deploy scripti hazır." },
        { id: "teknikel-web", installationId: "teknikel", title: "Teknikel Kombi · Web modülü", description: "Yalnız Yardımcı Asistan API/web modülünü günceller.", confirmText: "Yalnız Teknikel web modülü güncellenecek.", impact: ["Teknikel sitesi korunur."], available: true, availabilityNote: "Teknikel'e özel deploy scripti hazır." }
      ];
      const idleRun = { running: false, targetId: "", action: "", stage: "", startedAt: null, finishedAt: null, result: "idle", exitCode: null, outputTail: [] };
      const scene = {
        format: "efekt-atolyesi", version: 1, name: "Kıyı", seed: "ui-test",
        photo: { src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/zXcAAAAASUVORK5CYII=", width: 1116, height: 663, name: "Kıyı dalgası" },
        zones: [], effects: []
      };
      window.__deployCalls = [];
      window.adminControlCenter = {
        getOverview: async () => ({
          generatedAt: new Date().toISOString(),
          repo: { branch: "test", head: "abc1234", dirtyCount: 0 },
          product: { version: "1.0.0", webModuleVersion: "0.5.2", androidVersionCode: 1 },
          installations,
          release: {},
          verification: {},
          counts: { installations: installations.length, healthy: installations.length, drift: 0, errors: 0 }
        }),
        getVerificationHistory: async () => [],
        listSupportReports: async () => [],
        getSystemEnvironment: async () => ({ androidDevices: [] }),
        getDeploymentTargets: async () => targets,
        getDeploymentRunState: async () => idleRun,
        startDeployment: async (request) => { window.__deployCalls.push(request); return { accepted: false, message: "UI test must not start deployments." }; },
        cancelDeployment: async () => false,
        onDeploymentRunState: () => () => {},
        getReleaseOperationState: async () => ({ running: false, stage: "", startedAt: null, finishedAt: null, result: "idle", exitCode: null, outputTail: [] }),
        onReleaseOperationState: () => () => {},
        listEffectProjects: async () => [
          {
            id: "landing", name: "Yardımcı Asistan landing", siteUrl: "https://demo.example.test",
            images: [{
              id: "landing:coast", name: "Kıyı dalgası", available: true, hasDraft: true, hasScene: false,
              canPublish: false, canPrepare: false, note: "Site kaynaklarında hazır. Site deploy ile etkinleşecek.",
              bindingStatus: "staged", sourcePath: "assets/site/img/coast.webp", width: 1116, height: 663
            }]
          },
          {
            id: "teknikel", name: "Teknikel Kombi", siteUrl: "https://teknikel.example.test",
            note: "Teknikel hero görseli API'den gelen ürün/galeri medyasıdır. Tasarımda sabit dekoratif fotoğraf yoktur; ürün/galeri görsellerine efekt bağlanmaz.",
            images: []
          },
          {
            id: "blacksea", name: "BlackSea Pansiyon", siteUrl: "https://blacksea.example.test",
            images: [{
              id: "blacksea:hero", name: "Hero", available: true, hasDraft: true, hasScene: true,
              canPublish: true, canPrepare: false, note: "Site kaynaklarında hazır.",
              bindingStatus: "staged", sourcePath: "public/assets/site/img/hero.webp", width: 1600, height: 900
            }]
          }
        ],
        loadEffectScene: async () => ({ scene, source: "draft" }),
        saveEffectScene: async () => ({ ok: true, message: "saved", effectCount: 0 }),
        prepareEffectScene: async () => ({ ok: true, message: "prepared", siteUrl: "https://demo.example.test" }),
        publishEffectScene: async () => ({ ok: true, message: "published", siteUrl: "https://demo.example.test" })
      };
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.locator("button.nav-item", { hasText: "Efekt Atölyesi" }).click();
    await page.locator(".effects-activation").waitFor();

    assert.match(await page.locator(".effects-activation").innerText(), /İlk etkinleştirme yerelde hazır/);
    const openDeploy = page.getByRole("button", { name: /Deploy ekranını aç/ });
    assert.match(await openDeploy.innerText(), /Yardımcı Asistan landing/);
    await openDeploy.click();

    await page.locator(".deployment-hero h2").waitFor();
    assert.equal(await page.locator(".deployment-hero h2").innerText(), "Yardımcı Asistan landing");
    assert.equal(await page.locator(".deployment-confirm").count(), 0, "navigation must not open the live confirm panel");
    assert.deepEqual(await page.evaluate(() => window.__deployCalls), [], "navigation must not start preflight or deploy");

    await page.locator("button.nav-item", { hasText: "Efekt Atölyesi" }).click();
    await page.locator(".effects-activation").waitFor();
    assert.match(await page.locator(".effects-asset.is-active").innerText(), /Kıyı dalgası/, "the staged image stays selected after returning");

    await page.reload({ waitUntil: "networkidle" });
    await page.locator("button.nav-item", { hasText: "Efekt Atölyesi" }).click();
    await page.locator(".effects-activation").waitFor();
    assert.match(await page.locator(".effects-asset.is-active").innerText(), /Kıyı dalgası/, "the staged image survives a renderer refresh");

    await page.getByLabel("Efekt projesi").selectOption("teknikel");
    await page.locator(".effects-empty-assets").waitFor();
    assert.match(await page.locator(".effects-empty-assets").innerText(), /ürün\/galeri/);
    assert.equal(await page.getByRole("button", { name: /Siteye bağlamayı hazırla/ }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /Siteye yayınla/ }).count(), 0);
    assert.equal(await page.locator(".effects-activation").count(), 0);

    await page.getByLabel("Efekt projesi").selectOption("blacksea");
    await page.locator(".effects-asset.is-active").waitFor();
    assert.equal(await page.locator(".effects-activation").count(), 0, "a staged image with its own publish route is not a first activation");
    assert.equal(await page.getByRole("button", { name: /Siteye yayınla/ }).count(), 1);

    await page.locator("button.nav-item", { hasText: "Deploy" }).click();
    await page.locator(".deployment-hero h2").waitFor();
    await page.locator(".picker-item", { hasText: "Teknikel Kombi · Web modülü" }).click();
    await page.waitForFunction(() => document.querySelector(".deployment-title")?.textContent?.includes("web modülünü"));
    assert.match(await page.locator(".deployment-title").innerText(), /site kökü/);
    assert.deepEqual(await page.evaluate(() => window.__deployCalls), []);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
