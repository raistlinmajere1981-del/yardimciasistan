import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = resolve(here, "../dist-renderer");
const studioRoot = resolve(here, "../../../../EfektAtolyesi");
const fixture = JSON.parse(readFileSync(join(studioRoot, "examples/birdesengor-v2.scene.json"), "utf8"));
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

test("local scene target switches iframe, edits and saves v2 without deploy UI", { timeout: 120_000 }, async () => {
  assert.ok(existsSync(join(dist, "effect-studio/scene.html")), "run the admin build before this test");
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await page.addInitScript((sceneFixture) => {
      const imageScene = {
        format: "efekt-atolyesi", version: 1, name: "Kıyı", seed: "ui-test",
        photo: { src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/zXcAAAAASUVORK5CYII=", width: 1, height: 1, name: "Kıyı dalgası" },
        zones: [], effects: []
      };
      window.__savedScenes = [];
      window.__deployCalls = [];
      window.adminControlCenter = {
        getOverview: async () => ({ generatedAt: new Date().toISOString(), repo: { branch: "test", head: "abc1234", dirtyCount: 0 }, product: {}, installations: [], release: {}, verification: {}, counts: { installations: 0, healthy: 0, drift: 0, errors: 0 } }),
        getVerificationHistory: async () => [],
        listSupportReports: async () => [],
        getSystemEnvironment: async () => ({ androidDevices: [] }),
        getDeploymentTargets: async () => [],
        getDeploymentRunState: async () => ({ running: false, targetId: "", action: "", stage: "", startedAt: null, finishedAt: null, result: "idle", exitCode: null, outputTail: [] }),
        startDeployment: async (request) => { window.__deployCalls.push(request); return { accepted: false, message: "UI test must not deploy." }; },
        cancelDeployment: async () => false,
        onDeploymentRunState: () => () => {},
        getReleaseOperationState: async () => ({ running: false, stage: "", startedAt: null, finishedAt: null, result: "idle", exitCode: null, outputTail: [] }),
        onReleaseOperationState: () => () => {},
        listEffectProjects: async () => [
          {
            id: "landing", name: "Yardımcı Asistan landing", siteUrl: "https://demo.example.test",
            images: [{
              id: "landing:coast", name: "Kıyı dalgası", available: true, hasDraft: true, hasScene: true,
              canPublish: true, canPrepare: false, note: "Yayın bağlantılı.",
              bindingStatus: "linked", sourcePath: "assets/site/img/coast.webp", width: 1, height: 1
            }]
          },
          {
            id: "birdesengor", name: "BirDeSenGör (yerel çalışma)", siteUrl: "",
            note: "Yerel V2 çalışma hedefi · kurulu site değil",
            images: [{
              id: "birdesengor:scene_v2", name: "BirDeSenGör V2 · çalışma sahnesi",
              available: true, hasDraft: false, hasScene: true, canPublish: false, canPrepare: false,
              kind: "sceneObject", note: "Yerel V2 çalışma sahnesi; yayın hedefi değildir.",
              sourcePath: "examples/birdesengor-v2.scene.json", width: 1600, height: 900
            }]
          }
        ],
        loadEffectScene: async (id) => id === "birdesengor:scene_v2"
          ? { scene: structuredClone(sceneFixture), source: "installed" }
          : { scene: structuredClone(imageScene), source: "draft" },
        saveEffectScene: async (id, scene) => {
          window.__savedScenes.push({ id, scene: structuredClone(scene) });
          return { ok: true, message: "saved", effectCount: scene.effects?.length ?? 0 };
        },
        prepareEffectScene: async () => ({ ok: true, message: "prepared", siteUrl: "https://demo.example.test" }),
        publishEffectScene: async () => ({ ok: true, message: "published", siteUrl: "https://demo.example.test" })
      };
    }, fixture);

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.locator("button.nav-item", { hasText: "Efekt Atölyesi" }).click();
    await page.waitForFunction(() => !document.querySelector(".effects-buttons button")?.disabled);
    assert.match(await page.locator("iframe").getAttribute("src"), /index\.html/);
    assert.equal(await page.getByRole("button", { name: /Siteye yayınla/ }).count(), 1,
      "ordinary image target keeps its publish action");

    await page.getByLabel("Efekt projesi").selectOption("birdesengor");
    await page.locator(".effects-local-only").waitFor();
    assert.match(await page.locator("iframe").getAttribute("src"), /scene\.html/);
    assert.match(await page.locator(".effects-local-only").innerText(), /Yerel çalışma · yayın yok/);
    assert.equal(await page.getByRole("button", { name: /Siteye yayınla/ }).count(), 0, "scene cannot publish");
    assert.equal(await page.getByRole("button", { name: /bağlamayı hazırla|sahneyi güncelle/ }).count(), 0, "scene cannot prepare");
    assert.equal(await page.locator(".effects-activation").count(), 0, "scene is not a staged deploy activation");

    const frame = page.frameLocator('iframe[title="Yerel V2 nesne sahnesi düzenleyici"]');
    await frame.locator(".scene-object").first().waitFor();
    const sceneFrame = page.frames().find(candidate => candidate.url().includes("scene.html"));
    assert.ok(sceneFrame, "scene editor frame is loaded");
    await sceneFrame.waitForFunction(() => Boolean(window.__sceneEditor?.getScene?.()));
    assert.equal(await frame.locator('[data-scene-object="candle"]').count(), 1);
    assert.equal(await frame.locator(".scene-marker").count(), 3);
    assert.equal(await frame.locator("#scene-id-line").innerText(), "sceneId: birdesengor-study-v2 · 1600 × 900");

    // Select the candle's named anchor and exercise the real canonical overlay.
    await frame.locator('[data-scene-object="candle"]').click();
    await frame.locator("#effect-list button").first().waitFor();
    assert.equal(await frame.locator("#effect-list button").count(), 3);
    await frame.locator("#effect-list button", { hasText: "Alev" }).click();
    await sceneFrame.waitForFunction(() => (window.__sceneEditor?.inspect()?.overlays?.[0]?.frames ?? 0) > 2);
    const pixels = await sceneFrame.evaluate(() => [...document.querySelectorAll(".scene-object canvas")].map(canvas => {
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index]) count++;
      return count;
    }));
    assert.ok(pixels.some(count => count > 0), `canonical overlay draws visible pixels: ${pixels.join(",")}`);

    // Dragging the topmost candle effect marker changes only that effect's offset.
    await frame.locator("#effect-list button", { hasText: "Duman" }).click();
    const sceneBefore = await sceneFrame.evaluate(() => window.__sceneEditor.getScene());
    const marker = frame.locator('.scene-marker[data-effect-id="smoke-1"]');
    const box = await marker.boundingBox();
    assert.ok(box, "effect marker is draggable");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 16, { steps: 4 });
    await page.mouse.up();
    await sceneFrame.waitForFunction(() => {
      const effect = window.__sceneEditor.getScene().effects.find(item => item.id === "smoke-1");
      return effect.target.offset.x !== 0 || effect.target.offset.y !== 0;
    });
    const sceneAfterDrag = await sceneFrame.evaluate(() => window.__sceneEditor.getScene());
    assert.deepEqual(sceneAfterDrag.objects, sceneBefore.objects, "dragging never moves object transforms");
    assert.notDeepEqual(sceneAfterDrag.effects.find(effect => effect.id === "smoke-1").target.offset,
      sceneBefore.effects.find(effect => effect.id === "smoke-1").target.offset);

    // Change the flame intensity through the registry control.
    await frame.locator("#effect-list button", { hasText: "Alev" }).click();
    const opacity = frame.getByLabel("Opaklık");
    await opacity.fill("0.42");
    await opacity.press("Tab");

    // The editor's own v2 export/import roundtrip preserves the edits.
    const roundtrip = await sceneFrame.evaluate(async () => {
      const { exportProject, importProject } = await import("/effect-studio/src/model/project.mjs");
      const scene = importProject(exportProject(window.__sceneEditor.getScene()));
      return {
        version: scene.version,
        kind: scene.kind,
        sceneId: scene.sceneId,
        opacity: scene.effects.find(effect => effect.id === "flame-1").params.opacity,
        smokeOffset: scene.effects.find(effect => effect.id === "smoke-1").target.offset
      };
    });
    assert.equal(roundtrip.version, 2);
    assert.equal(roundtrip.kind, "objectScene");
    assert.equal(roundtrip.sceneId, "birdesengor-study-v2");
    assert.equal(roundtrip.opacity, 0.42);
    assert.deepEqual(roundtrip.smokeOffset, sceneAfterDrag.effects.find(effect => effect.id === "smoke-1").target.offset);

    // The embedded auto-save receives the same v2 scene.
    await page.waitForFunction(() => window.__savedScenes.some(entry =>
      entry.scene.effects?.find(effect => effect.id === "flame-1")?.params?.opacity === 0.42));
    const saved = await page.evaluate(() => window.__savedScenes.at(-1));
    assert.equal(saved.id, "birdesengor:scene_v2");
    assert.equal(saved.scene.version, 2);
    assert.equal(saved.scene.kind, "objectScene");
    assert.equal(saved.scene.sceneId, "birdesengor-study-v2");
    assert.deepEqual(saved.scene.effects.find(effect => effect.id === "smoke-1").target.offset,
      sceneAfterDrag.effects.find(effect => effect.id === "smoke-1").target.offset);
    assert.equal(saved.scene.objects.find(object => object.id === "candle").pose.x,
      fixture.objects.find(object => object.id === "candle").pose.x);

    // CSS-hidden candle and parent stop the ticker even while intersecting.
    await sceneFrame.evaluate(() => { document.querySelector('[data-scene-object="candle"]').style.visibility = "hidden"; });
    await sceneFrame.waitForFunction(() => window.__sceneEditor.inspect().overlays.every(overlay => !overlay.running));
    const hiddenFrames = await sceneFrame.evaluate(() => window.__sceneEditor.inspect().overlays.reduce((sum, overlay) => sum + overlay.frames, 0));
    await page.waitForTimeout(400);
    const stillHiddenFrames = await sceneFrame.evaluate(() => window.__sceneEditor.inspect().overlays.reduce((sum, overlay) => sum + overlay.frames, 0));
    assert.equal(stillHiddenFrames, hiddenFrames, "hidden scene object stops frame updates");
    await sceneFrame.evaluate(() => { document.querySelector('[data-scene-object="candle"]').style.visibility = ""; });
    await sceneFrame.waitForFunction(() => window.__sceneEditor.inspect().overlays.some(overlay => overlay.running));

    // Compact viewport must not overflow horizontally.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const overflow = await sceneFrame.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, `390px scene editor overflows: ${JSON.stringify(overflow)}`);

    // Switching back to an image target swaps the iframe document and preserves
    // the image editor's publish action without cross-frame save leakage.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByLabel("Efekt projesi").selectOption("landing");
    await page.waitForFunction(() => document.querySelector("iframe")?.getAttribute("src")?.includes("index.html"));
    assert.equal(await page.getByRole("button", { name: /Siteye yayınla/ }).count(), 1);
    assert.equal(await page.locator(".effects-local-only").count(), 0);
    assert.deepEqual(await page.evaluate(() => window.__deployCalls), []);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
