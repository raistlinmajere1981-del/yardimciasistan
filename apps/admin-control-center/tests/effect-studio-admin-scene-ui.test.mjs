import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = resolve(here, "../dist-renderer");
const studioRoot = resolve(here, "../../../../EfektAtolyesi");
const { siteSceneSource } = await import(join(studioRoot, "scripts/birdesengor-site.mjs"));
const site = siteSceneSource();
const siteState = await site.snapshot();
const fixture = siteState.scene;
const packet = { scene: fixture, source: "installed", siteSource: true, sourceHash: siteState.sourceHash,
  previewImage: await site.preview(siteState), readiness: site.readiness(fixture, siteState) };
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

test("current site scene supports reviewed staging and explicitly confirmed live publication", { timeout: 120_000 }, async () => {
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
    await page.addInitScript((sitePacket) => {
      const imageScene = {
        format: "efekt-atolyesi", version: 1, name: "Kıyı", seed: "ui-test",
        photo: { src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/zXcAAAAASUVORK5CYII=", width: 1, height: 1, name: "Kıyı dalgası" },
        zones: [], effects: []
      };
      window.__savedScenes = [];
      window.__deployCalls = [];
      window.__prepareCalls = [];
      window.__birdesengorPreflightCalls = [];
      window.__birdesengorLiveDeployCalls = [];
      window.__birdesengorCancelCalls = 0;
      window.adminControlCenter = {
        getOverview: async () => ({ generatedAt: new Date().toISOString(), repo: { branch: "test", head: "abc1234", dirtyCount: 0 }, product: {}, installations: [], release: {}, verification: {}, counts: { installations: 0, healthy: 0, drift: 0, errors: 0 } }),
        getVerificationHistory: async () => [],
        listSupportReports: async () => [],
        getSystemEnvironment: async () => ({ androidDevices: [] }),
        getDeploymentTargets: async () => [{ id: 'birdesengor-effects-v2', installationId: 'birdesengor',
          title: 'BirDeSenGör V2 · Efekt sahnesi', available: true, availabilityNote: 'Yerel Natro mevcut',
          description: '', confirmText: '', impact: [] }],
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
            id: "birdesengor", name: "BirDeSenGör", siteUrl: "",
            note: "Yerel V2 çalışma hedefi · kurulu site değil",
            images: [{
              id: "birdesengor:scene_v2", name: "BirDeSenGör V2 · çalışma sahnesi",
              available: true, hasDraft: false, hasScene: true, canPublish: false, canPrepare: true, siteSource: true,
              kind: "sceneObject", note: "Yerel V2 çalışma sahnesi; yayın hedefi değildir.",
              sourcePath: "src/effects/birdesengor-effects.v2.json", width: 1600, height: 900
            }]
          }
        ],
        loadEffectScene: async (id) => id === "birdesengor:scene_v2"
          ? structuredClone(sitePacket)
          : { scene: structuredClone(imageScene), source: "draft" },
        saveEffectScene: async (id, scene, sourceHash) => {
          window.__savedScenes.push({ id, scene: structuredClone(scene), sourceHash });
          const enabledCount = scene.effects.filter(effect => effect.enabled).length;
          return { ok: true, message: "saved", effectCount: scene.effects.length,
            readiness: { ready: enabledCount === 0, effectCount: scene.effects.length, enabledCount, mountedCount: 0,
              problems: enabledCount ? ["Etkin efektler sitede bağlı değil."] : [] } };
        },
        prepareEffectScene: async (id) => {
          window.__prepareCalls.push(id);
          return { ok: true, message: "Yerel site kaynak dosyası hazırlandı. Canlı yayın ayrı.", siteUrl: "", sourceHash: "staged-revision",
            readiness: { ready: true, effectCount: sitePacket.scene.effects.length, enabledCount: 0, mountedCount: 0, problems: [] } };
        },
        publishEffectScene: async () => ({ ok: true, message: "published", siteUrl: "https://demo.example.test" }),
        preflightBirdesengorEffect: async id => {
          window.__birdesengorPreflightCalls.push(id);
          return { ok: true, token: "reviewed-one-time-token", sourceHash: "revised-site-source", changed: true,
            message: "Ön kontrol başarılı", readiness: { ready: true, effectCount: sitePacket.scene.effects.length, enabledCount: 0, mountedCount: sitePacket.scene.effects.length, problems: [] } };
        },
        cancelBirdesengorEffect: async () => { window.__birdesengorCancelCalls++; return true; },
        deployBirdesengorEffect: async (id, token) => {
          window.__birdesengorLiveDeployCalls.push([id, token]);
          return { ok: true, message: "Canlı doğrulama başarılı", siteUrl: "https://birdesengorgizlievren.com/" };
        }
      };
    }, packet);

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.locator("button.nav-item", { hasText: "Efekt Atölyesi" }).click();
    await page.waitForFunction(() => !document.querySelector(".effects-buttons button")?.disabled);
    assert.match(await page.locator("iframe").getAttribute("src"), /index\.html/);
    assert.equal(await page.getByRole("button", { name: /Siteye yayınla/ }).count(), 1,
      "ordinary image target keeps its publish action");

    await page.getByLabel("Efekt projesi").selectOption("birdesengor");
    await page.locator(".effects-local-only").waitFor();
    assert.match(await page.locator("iframe").getAttribute("src"), /scene\.html/);
    assert.match(await page.locator(".effects-local-only").innerText(), /V2 site kaynak sahnesi · canlı yayın ayrı/);
    assert.equal(await page.getByRole("button", { name: /Siteye yayınla/ }).count(), 1,
      "the reviewed V2 scene alone offers a confirmed live deploy action");
    assert.deepEqual(await page.evaluate(() => window.__birdesengorLiveDeployCalls), [],
      "loading the site scene never causes a deployment");
    assert.equal(await page.getByRole("button", { name: /bağlamayı hazırla|sahneyi güncelle/ }).count(), 0, "scene cannot prepare");
    assert.equal(await page.locator(".effects-activation").count(), 0, "scene is not a staged deploy activation");

    const frame = page.frameLocator('iframe[title="Yerel V2 nesne sahnesi düzenleyici"]');
    await frame.locator(".scene-object").first().waitFor();
    const sceneFrame = page.frames().find(candidate => candidate.url().includes("scene.html"));
    assert.ok(sceneFrame, "scene editor frame is loaded");
    await sceneFrame.waitForFunction(() => Boolean(window.__sceneEditor?.getScene?.()));
    assert.equal(await frame.locator('[data-scene-object="candle"]').count(), 1);
    assert.equal(await frame.locator(".scene-marker").count(), packet.scene.effects.length,
      "Source scene renders one marker per approved effect slot");
    assert.equal(await frame.locator('[data-scene-object="vefk-stand"]').count(), 1);
    assert.equal(await frame.locator('[data-scene-object="parchment"]').count(), 0);
    assert.equal(await frame.locator('.scene-object').count(), 15);
    assert.equal(packet.scene.effects.length, 9);
    assert.equal(packet.readiness.enabledCount, 7);
    assert.equal(packet.readiness.mountedCount, 9);
    assert.equal(packet.readiness.ready, true);
    for (const id of ['camcorder', 'rolled-rug', 'incense-burner']) {
      assert.equal(await frame.locator(`[data-scene-object="${id}"]`).count(), 0);
    }
    assert.equal(await frame.locator('#object-list button', {hasText: 'Ahşap Tütsülük'}).count(), 1);
    const currentScene = await sceneFrame.evaluate(() => window.__sceneEditor.getScene());
    assert.deepEqual(currentScene.objects, packet.scene.objects);
    assert.deepEqual(currentScene.effects, packet.scene.effects);

    const prepare = page.getByRole("button", { name: "Site dosyasına hazırla" });
    assert.equal(await prepare.isDisabled(), true, "unsaved/unmounted effects cannot stage");
    await sceneFrame.waitForFunction(() => document.querySelector("#scene-photo").naturalWidth > 0);
    assert.equal(await frame.locator("#scene-photo").getAttribute("src"), packet.previewImage);
    const alignment = await sceneFrame.evaluate(() => {
      const stage = document.querySelector("#scene-viewport").getBoundingClientRect();
      const photo = document.querySelector("#scene-photo").getBoundingClientRect();
      const candle = document.querySelector('[data-scene-object="candle"]').getBoundingClientRect();
      return { ratio: stage.width / stage.height, photoWidth: photo.width, stageWidth: stage.width,
        candleX: (candle.x - stage.x - 1) / (stage.width - 2), candleWidth: candle.width / (stage.width - 2) };
    });
    assert.ok(Math.abs(alignment.ratio - 2) < .01, 'the photographic scene preview keeps its 2:1 aspect ratio');
    assert.ok(Math.abs(alignment.photoWidth - alignment.stageWidth) <= 2);
    assert.ok(Math.abs(alignment.candleX - fixture.objects.find(o => o.id === "candle").pose.x) < .003);
    assert.ok(Math.abs(alignment.candleWidth - fixture.objects.find(o => o.id === "candle").pose.width) < .003);
    await frame.locator("#show-photo").click();
    assert.equal(await frame.locator("#scene-photo").isHidden(), true);
    await frame.locator("#show-photo").click();
    await frame.locator("#show-guides").click();
    assert.equal(await frame.locator("#show-guides").getAttribute("aria-pressed"), "false");
    await frame.locator("#show-guides").click();
    await frame.locator("#advanced-settings summary").click();
    assert.equal(await frame.locator("#scene-id-line").innerText(), "sceneId: birdesengor-study-v2 · 1600 × 900");

    // Select the candle's named anchor and exercise the real canonical overlay.
    await frame.locator("#object-list button", { hasText: "Mum" }).click();
    assert.equal(await frame.locator('#object-inspector input').count(), 0);
    assert.equal(await frame.locator('#object-list input[type="checkbox"]').count(), 0);
    assert.equal(await frame.locator('#add-effect-controls').isHidden(), true);
    await frame.locator("#effect-list button").first().waitFor();
    assert.equal(await frame.locator("#effect-list button").count(), 3);
    await frame.locator("#effect-list button", { hasText: "Alev" }).click();
    await sceneFrame.waitForFunction(() => (window.__sceneEditor?.inspect()?.overlays?.find(o => o.objectId === "candle")?.frames ?? 0) > 2);
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
    await frame.getByRole('button',{name:'Hafif',exact:true}).click();
    assert.equal(await frame.locator('#effect-profile').innerText(),'Hafif');
    const actualPreset=await sceneFrame.evaluate(async()=>{
      const {objectEffectRegistry}=await import('/effect-studio/src/registry/effects.mjs');
      return objectEffectRegistry.flame.presets.Sakin;
    });
    assert.deepEqual(await sceneFrame.evaluate(()=>window.__sceneEditor.getScene().effects.find(effect=>effect.id==='flame-1').params),actualPreset);
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
    assert.equal(saved.sourceHash, packet.sourceHash);
    assert.equal(saved.scene.previewImage, undefined);
    assert.equal(saved.scene.version, 2);
    assert.equal(saved.scene.kind, "objectScene");
    assert.equal(saved.scene.sceneId, "birdesengor-study-v2");
    assert.deepEqual(saved.scene.effects.find(effect => effect.id === "smoke-1").target.offset,
      sceneAfterDrag.effects.find(effect => effect.id === "smoke-1").target.offset);
    assert.equal(saved.scene.objects.find(object => object.id === "candle").pose.x,
      fixture.objects.find(object => object.id === "candle").pose.x);

    // CSS-hidden candle and parent stop the ticker even while intersecting.
    await sceneFrame.evaluate(() => { document.querySelector('[data-scene-object="candle"]').style.visibility = "hidden"; });
    await sceneFrame.waitForFunction(() => window.__sceneEditor.inspect().overlays.filter(overlay => overlay.objectId === "candle").every(overlay => !overlay.running));
    const hiddenFrames = await sceneFrame.evaluate(() => window.__sceneEditor.inspect().overlays.filter(overlay => overlay.objectId === "candle").reduce((sum, overlay) => sum + overlay.frames, 0));
    await page.waitForTimeout(400);
    const stillHiddenFrames = await sceneFrame.evaluate(() => window.__sceneEditor.inspect().overlays.filter(overlay => overlay.objectId === "candle").reduce((sum, overlay) => sum + overlay.frames, 0));
    assert.equal(stillHiddenFrames, hiddenFrames, "hidden scene object stops frame updates");
    await sceneFrame.evaluate(() => { document.querySelector('[data-scene-object="candle"]').style.visibility = ""; });
    await sceneFrame.waitForFunction(() => window.__sceneEditor.inspect().overlays.some(overlay => overlay.running));

    await frame.locator('#advanced-settings summary').click();
    for(const size of [{width:1920,height:1080},{width:1366,height:768}]){
      await page.setViewportSize(size);
      await page.waitForTimeout(200);
      assert.equal(await frame.locator('#basic-opacity').isVisible(),true);
      const dimensions=await sceneFrame.evaluate(()=>({w:innerWidth,doc:document.documentElement.scrollWidth,h:innerHeight,body:document.body.scrollHeight}));
      assert.ok(dimensions.doc<=dimensions.w+1);
      assert.ok(dimensions.body<=dimensions.h+1);
      await page.screenshot({path:`/tmp/birdesengor-effect-round1-admin-${size.width}.png`});
    }
    // Only saved, valid drafts may use the separate prepare IPC; no publish.
    // The current site includes click-triggered sword/water slots in addition
    // to candle/incense. The readiness mock below only accepts a zero-enabled
    // draft, so switch off every source-owned effect rather than an old fixed list.
    for (const owner of new Set(packet.scene.effects.map(effect => effect.target.objectId))) {
      await sceneFrame.evaluate(id => window.__sceneEditor.selectObject(id), owner);
      for (const checkbox of await frame.locator('#effect-list input[type="checkbox"]').all()) {
        await checkbox.uncheck();
      }
    }
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll(".effects-buttons button")].find(b => b.textContent.includes("Site dosyasına hazırla"))?.disabled);
    await prepare.click();
    await page.waitForFunction(() => window.__prepareCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__prepareCalls), ["birdesengor:scene_v2"]);
    assert.deepEqual(await page.evaluate(() => window.__deployCalls), []);
    assert.deepEqual(await page.evaluate(() => window.__birdesengorLiveDeployCalls), []);

    // Cancelling the live confirmation after a successful dry-run is safe.
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Siteye yayınla", exact: true }).click();
    await page.waitForFunction(() => window.__birdesengorCancelCalls === 1);
    assert.deepEqual(await page.evaluate(() => window.__birdesengorLiveDeployCalls), []);

    // Deliberate second click, dry-run and an accepted human confirmation.
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Siteye yayınla", exact: true }).click();
    await page.waitForFunction(() => window.__birdesengorLiveDeployCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__birdesengorPreflightCalls),
      ["birdesengor:scene_v2", "birdesengor:scene_v2"]);
    assert.deepEqual(await page.evaluate(() => window.__birdesengorLiveDeployCalls),
      [["birdesengor:scene_v2", "reviewed-one-time-token"]]);
    assert.deepEqual(await page.evaluate(() => window.__deployCalls), [],
      "reviewed dedicated site workflow must not invoke generic deploy buttons");

    // Compact viewport must not overflow horizontally.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const overflow = await sceneFrame.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, `390px scene editor overflows: ${JSON.stringify(overflow)}`);

    await frame.getByRole('tab',{name:'Efekt ayarları'}).click();
    assert.equal(await frame.locator('#effect-inspector').isVisible(),true);
    await page.screenshot({path:'/tmp/birdesengor-effect-round1-admin-390.png'});

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
