import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = resolve(here, "../dist-renderer");
const fixture = JSON.parse(readFileSync(resolve(here, "../../../../EfektAtolyesi/examples/gideros.scene.json"), "utf8"));
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
test("compact image workspace keeps hierarchy, geometry, autosave and safe publication", { timeout: 90_000 }, async () => {
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
    await page.addInitScript((fixture) => {
      const installations = [
        { id: "landing", title: "Yardımcı Asistan landing", kind: "landing", status: "ready", statusNote: "Hazır", siteUrl: "https://demo.example.test", deployType: "ssh-rsync", credentialStatus: "configured", credentialRef: "demo", liveWebVersion: null, versionEndpoint: null },
        { id: "teknikel", title: "Teknikel Kombi", kind: "customer-site", status: "ready", statusNote: "Hazır", siteUrl: "https://teknikel.example.test", deployType: "ssh-rsync", credentialStatus: "configured", credentialRef: "demo", liveWebVersion: null, versionEndpoint: null }
      ];
      const targets = [
        { id: "landing", installationId: "landing", title: "Yardımcı Asistan landing", description: "Ana landing sayfasını canlı www köküne yayınlar; web modülüne dokunmaz.", confirmText: "Canlı landing güncellenecek.", impact: ["Landing root sayfaları güncellenir."], available: true, availabilityNote: "Canlı deploy scripti hazır." },
        { id: "teknikel-web", installationId: "teknikel", title: "Teknikel Kombi · Web modülü", description: "Yalnız Yardımcı Asistan API/web modülünü günceller.", confirmText: "Yalnız Teknikel web modülü güncellenecek.", impact: ["Teknikel sitesi korunur."], available: true, availabilityNote: "Teknikel'e özel deploy scripti hazır." }
      ];
      const idleRun = { running: false, targetId: "", action: "", stage: "", startedAt: null, finishedAt: null, result: "idle", exitCode: null, outputTail: [] };
      const scene = structuredClone(fixture);
      scene.photo.src = fixture.photo.src;
      window.__savedScenes = [];
      window.__deployCalls = [];
      window.__effectPublishCalls = [];
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
              canPublish: false, canPrepare: true, note: "Site kaynaklarında hazır. Site deploy ile etkinleşecek.",
              bindingStatus: "staged", sourcePath: "assets/site/img/coast.webp", width: 1818, height: 1228
            }, {
              id: "landing:linked", name: "Bağlı görsel", available: true, hasDraft: true, hasScene: true,
              canPublish: true, canPrepare: false, bindingStatus: "linked", sourcePath: "assets/site/img/linked.webp", width: 1818, height: 1228
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
              bindingStatus: "staged", sourcePath: "public/assets/site/img/hero.webp", width: 1818, height: 1228
            }]
          }
        ],
        loadEffectScene: async () => ({ scene, source: "draft" }),
        saveEffectScene: async (id, scene) => { window.__savedScenes.push({ id, scene: structuredClone(scene) }); return { ok: true, message: "saved", effectCount: scene.effects.length }; },
        prepareEffectScene: async () => ({ ok: true, message: "prepared", siteUrl: "https://demo.example.test" }),
        publishEffectScene: async (id) => { window.__effectPublishCalls.push(id); return { ok: true, message: "published", siteUrl: "https://demo.example.test" }; }
      };
    }, fixture);

    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.locator("button.nav-item", { hasText: "Efekt Atölyesi" }).click();
    await page.locator(".effects-publication").waitFor();
    assert.equal(await page.locator(".effects-publication").innerText(), "İlk yayın bekliyor");
    assert.match(await page.locator(".effects-publication").getAttribute("title"), /tam site ön kontrolü/);
    assert.equal(await page.locator(".effects-assets, .effects-activation, .effects-foot").count(), 0);
    const editor = page.frameLocator(".effects-stage iframe");
    await editor.locator("#effects .row-select").first().waitFor();
    const imageFrame = page.frames().find(frame => frame.url().includes("/effect-studio/index.html"));
    assert.ok(imageFrame);
    // All four columns stay in one row, with scrolling owned by lists/inspector.
    for (const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:1366,height:768},{width:1280,height:720}]) {
      await page.setViewportSize(viewport);
      const outer = await page.evaluate(() => {
        const rect = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
        return {overflowY:document.documentElement.scrollHeight-innerHeight,overflowX:document.documentElement.scrollWidth-innerWidth,head:rect(".effects-head"),stage:rect(".effects-stage"),frame:rect("iframe")};
      });
      assert.ok(outer.overflowY<=1 && outer.overflowX<=1, `Admin page overflow at ${viewport.width}: ${JSON.stringify(outer)}`);
      assert.ok(outer.head.height>=48 && outer.head.height<=58, `compact header: ${JSON.stringify(outer.head)}`);
      assert.ok(outer.frame.bottom<=viewport.height && outer.frame.height>viewport.height-110);
      const layout = await imageFrame.evaluate(() => {
        const rect = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
        return {overflowX:document.documentElement.scrollWidth-innerWidth,overflowY:document.documentElement.scrollHeight-innerHeight,width:innerWidth,height:innerHeight,
          columns:[".zone-library",".effect-library",".stage-column",".inspector"].map(rect),preview:rect("#preview-host"),tools:["#play","#compare","#guides","#fit","#undo","#redo","#add-zone","#add-effect"].map(rect)};
      });
      assert.ok(layout.overflowX<=1 && layout.overflowY<=1, `iframe overflow: ${JSON.stringify(layout)}`);
      layout.columns.forEach((column,i) => {
        assert.ok(column.width>100 && column.height>500 && column.right<=layout.width && column.bottom<=layout.height, `column ${i}: ${JSON.stringify(layout)}`);
        if(i)assert.ok(column.x>=layout.columns[i-1].right, "columns are side by side");
      });
      assert.ok(layout.preview.height>viewport.height-200 && layout.preview.width>350, `preview maximizes height: ${JSON.stringify(layout.preview)}`);
      for(const tool of layout.tools)assert.ok(tool.width>0 && tool.x>=0 && tool.right<=layout.width && tool.y>=0 && tool.bottom<=layout.height, `reachable tool: ${JSON.stringify(tool)}`);
      if(process.env.EFFECT_STUDIO_SCREENSHOTS)await page.screenshot({path:join(process.env.EFFECT_STUDIO_SCREENSHOTS,`effect-studio-${viewport.width}.png`)});
      for(const selector of ["#play","#compare","#guides","#fit"])assert.equal(await editor.locator(selector).isVisible(),true);
    }
    assert.equal(await editor.locator("#effects .row-select").count(), 1, "only the selected zone's effect appears");
    assert.equal(await editor.locator("#inspect-effect").getAttribute("aria-pressed"), "true");
    // The canonical canvas draws pixels, including at the smallest target size.
    await imageFrame.waitForFunction(() => [...document.querySelectorAll("#preview-host canvas")].some(canvas => {
      const data=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
      for(let i=3;i<data.length;i+=4)if(data[i])return true;
      return false;
    }));
    await editor.locator("#effect-solo").click();
    assert.equal(await editor.locator("#solo-status").isVisible(),true);
    await editor.locator("#effect-solo").click();
    await editor.locator("#play").click();
    assert.equal(await editor.locator("#play").getAttribute("aria-pressed"), "false");
    await editor.locator("#compare").click();
    assert.equal(await editor.locator("#comparison-badge").isVisible(), true);
    await editor.locator("#compare").click();
    await editor.locator("#play").click();
    await editor.locator("#guides").uncheck();
    assert.equal(await editor.locator("#guides-svg").isVisible(), false);
    await editor.locator("#guides").check();
    await editor.locator("#fit").selectOption("cover");
    await editor.locator("#fit").selectOption("contain");
    const initialEffect = await editor.locator("#effects .row-select").innerText();
    await editor.locator("#zones .row-select").nth(1).click();
    assert.equal(await editor.locator("#inspect-zone").getAttribute("aria-pressed"), "true");
    assert.equal(await editor.locator("#effects .row-select").count(), 1);
    assert.notEqual(await editor.locator("#effects .row-select").innerText(), initialEffect);
    await editor.locator("#effects .row-select").click();
    assert.equal(await editor.locator("#inspect-effect").getAttribute("aria-pressed"), "true");
    assert.equal(await editor.locator("#zone-inspector").isVisible(), false);
    await editor.locator("#effects input[type=checkbox]").uncheck();
    assert.equal(await editor.locator("#effects input[type=checkbox]").isChecked(), false);
    await editor.locator("#undo").click();
    assert.equal(await editor.locator("#effects input[type=checkbox]").isChecked(), true);
    await editor.locator("#redo").click();
    assert.equal(await editor.locator("#effects input[type=checkbox]").isChecked(), false);
    await editor.locator("#undo").click();
    // A new area starts empty and opens geometry; adding an effect opens settings.
    await editor.locator("#add-zone").click();
    assert.match(await editor.locator("#effects").innerText(), /Bu alanda efekt yok/);
    assert.equal(await editor.locator("#inspect-zone").getAttribute("aria-pressed"), "true");
    await editor.locator("#add-effect").click();
    assert.equal(await editor.locator("#inspect-effect").getAttribute("aria-pressed"), "true");
    await editor.getByLabel("Opaklık", {exact:true}).fill("0.7");
    await editor.getByLabel("Opaklık", {exact:true}).press("Tab");
    await page.waitForFunction(() => window.__savedScenes.some(entry => entry.scene.effects.at(-1).params.opacity===0.7));
    assert.equal(await page.locator(".effects-state").getAttribute("aria-live"), "polite");
    await editor.locator("#zones .selected input[type=checkbox]").uncheck();
    assert.equal(await editor.locator(".vertex").count(),0,"hidden area has no drag handles");
    await editor.locator("#zones .selected input[type=checkbox]").check();
    // Keyboard and pointer geometry edits remain in canonical photo coordinates.
    await editor.locator("#inspect-zone").click();
    const x = editor.getByLabel("X", {exact:true});
    const beforeX = Number(await x.inputValue());
    await editor.locator(".vertex").first().focus();
    await editor.locator(".vertex").first().press("ArrowRight");
    await editor.locator("#inspect-zone").click();
    // Keyboard geometry deliberately avoids re-rendering focused controls; refresh the inspector.
    await editor.locator("#zones .selected .row-select").click();
    assert.equal(Number(await x.inputValue()), beforeX+1);
    const vertex = await editor.locator(".vertex").first().boundingBox();
    await page.mouse.move(vertex.x+vertex.width/2,vertex.y+vertex.height/2);
    await page.mouse.down();
    await page.mouse.move(vertex.x+vertex.width/2+12,vertex.y+vertex.height/2+8,{steps:4});
    await page.mouse.up();
    assert.ok(Number(await x.inputValue())>beforeX+1);
    await editor.locator(".scene-settings summary").click();
    await editor.locator("#scene-name").fill("Kompakt çalışma");
    await editor.locator("#scene-name").press("Tab");
    await editor.locator("#scene-seed").fill("compact-test");
    await editor.locator("#scene-seed").press("Tab");
    await page.waitForFunction(() => window.__savedScenes.some(entry => entry.scene.name==="Kompakt çalışma" && entry.scene.seed==="compact-test"));
    // Error status stays visible, concise and recoverable without replacing controls.
    await editor.locator("#scene-name").fill("");
    await editor.locator("#scene-name").press("Tab");
    assert.equal(await editor.locator("#status.error").isVisible(),true);
    await editor.locator("#scene-name").fill("Kompakt çalışma düzeltildi");
    await editor.locator("#scene-name").press("Tab");
    assert.equal(await editor.locator("#status.error").count(),0);
    assert.deepEqual(pageErrors,[]);
    const publish = page.getByRole("button", { name: /Siteye yayınla/ });
    await publish.waitFor();
    await page.waitForFunction(() => !document.querySelector(".effects-buttons .effects-publish")?.disabled);
    assert.equal(await publish.isEnabled(), true);
    page.once("dialog", async dialog => {
      assert.match(dialog.message(), /TAM SİTE DEPLOY/);
      await dialog.dismiss();
    });
    await publish.click();
    assert.deepEqual(await page.evaluate(() => window.__effectPublishCalls), []);
    assert.deepEqual(await page.evaluate(() => window.__deployCalls), [], "renderer never runs raw deploy");
    page.once("dialog", async dialog => { await dialog.accept(); });
    await publish.click();
    await page.waitForFunction(() => window.__effectPublishCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__effectPublishCalls), ["landing:coast"]);
    assert.deepEqual(await page.evaluate(() => window.__deployCalls), []);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator("button.nav-item", { hasText: "Efekt Atölyesi" }).click();
    await page.locator(".effects-publication").waitFor();
    assert.equal(await page.getByLabel("Efekt görseli").inputValue(), "landing:coast", "the selected image survives a renderer refresh");

    await page.getByLabel("Efekt görseli").selectOption("landing:linked");
    await page.waitForFunction(() => document.querySelector(".effects-publication")?.textContent === "Yayın bağlantılı");
    assert.equal(await page.locator(".effects-activation").count(), 0, "another staged draft never replaces the selected image's status");
    await page.getByLabel("Efekt görseli").selectOption("landing:coast");
    await page.waitForFunction(() => document.querySelector(".effects-publication")?.textContent === "İlk yayın bekliyor");

    await page.getByLabel("Efekt projesi").selectOption("teknikel");
    await page.locator(".effects-loading").waitFor();
    assert.match(await page.locator(".effects-loading").innerText(), /ürün\/galeri/);
    assert.equal(await page.getByRole("button", { name: /Siteye bağlamayı hazırla/ }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /Siteye yayınla/ }).count(), 0);
    assert.equal(await page.locator(".effects-activation").count(), 0);

    await page.getByLabel("Efekt projesi").selectOption("blacksea");
    await page.waitForFunction(() => document.querySelector(".effects-publication")?.textContent === "Yayın bağlantılı");
    assert.equal(await page.locator(".effects-activation").count(), 0, "a staged image with its own publish route is not a first activation");
    assert.equal(await page.getByRole("button", { name: /Siteye yayınla/ }).count(), 1);
    await page.waitForFunction(() => !document.querySelector(".effects-publish")?.disabled);
    page.once("dialog", async dialog => {
      assert.match(dialog.message(), /Yalnız seçili görselin efekt sahnesi/);
      assert.doesNotMatch(dialog.message(), /TAM SİTE DEPLOY/);
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: /Siteye yayınla/ }).click();
    assert.deepEqual(await page.evaluate(() => window.__effectPublishCalls), [], "dismissed confirmation never publishes");
    // A missing deploy target explains why first publication is disabled.
    await page.evaluate(() => {
      window.__originalGetDeploymentTargets = window.adminControlCenter.getDeploymentTargets;
      window.adminControlCenter.getDeploymentTargets = async () => [];
    });
    await page.locator("button.nav-item", {hasText:"Genel Bakış"}).click();
    await page.locator("button.nav-item", {hasText:"Efekt Atölyesi"}).click();
    await page.getByLabel("Efekt projesi").selectOption("landing");
    await page.waitForFunction(() => document.querySelector(".effects-publish")?.disabled && document.querySelector(".effects-publish")?.title.includes("tam site yayın hedefi hazır değil"));
    assert.match(await page.getByRole("button", {name:/Siteye yayınla/}).getAttribute("title"), /tam site yayın hedefi hazır değil/);
    await page.evaluate(() => {
      window.adminControlCenter.getDeploymentTargets = window.__originalGetDeploymentTargets;
    });

    await page.locator("button.nav-item", { hasText: "Deploy" }).click();
    await page.locator(".deployment-hero h2").waitFor();
    await page.locator(".picker-item", { hasText: "Teknikel Kombi · Web modülü" }).click();
    await page.waitForFunction(() => document.querySelector(".deployment-title")?.textContent?.includes("web modülünü"));
    assert.match(await page.locator(".deployment-title").innerText(), /site kökü/);
    assert.deepEqual(await page.evaluate(() => window.__deployCalls), []);
    // The standalone editor keeps the full scene list and both inspectors.
    const standalone = await browser.newPage({viewport:{width:1440,height:900}});
    await standalone.goto(`http://127.0.0.1:${port}/effect-studio/index.html`,{waitUntil:"networkidle"});
    await standalone.locator("#effects .row-select").first().waitFor();
    assert.equal(await standalone.locator("#effects .row-select").count(),fixture.effects.length);
    for(const selector of [".topbar","#zone-inspector","#effect-inspector","#open-photo","#open-project","#export"])
      assert.equal(await standalone.locator(selector).isVisible(),true);
    await standalone.close();
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
