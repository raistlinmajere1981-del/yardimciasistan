import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createReadStream,existsSync,mkdtempSync,readFileSync,rmSync,statSync} from "node:fs";
import {extname,join,resolve,sep} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {chromium} from "@playwright/test";

const root=resolve(fileURLToPath(new URL("../../../../EfektAtolyesi/",import.meta.url)));
const browserPath="/usr/bin/brave";
const MIME={
  ".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",".webp":"image/webp",".png":"image/png"
};

test("scene editor smoke: candle drag, opacity, v2 roundtrip, visibility and 390px",{
  timeout:120_000,
  skip:!existsSync(join(root,"scene.html"))||!existsSync(browserPath)
},async()=>{
  const server=createServer((request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url??"/","http://127.0.0.1").pathname);
    const relative=pathname==="/"?"scene.html":pathname.replace(/^\/+/, "");
    const file=resolve(root,relative);
    if(!file.startsWith(root+sep)||!existsSync(file)||!statSync(file).isFile()){
      response.writeHead(404).end("not found");return;
    }
    response.writeHead(200,{"content-type":MIME[extname(file)]??"application/octet-stream"});
    createReadStream(file).pipe(response);
  });
  await new Promise(done=>server.listen(0,"127.0.0.1",done));
  const port=server.address().port;
  const browser=await chromium.launch({executablePath:browserPath,headless:true,args:["--no-sandbox","--disable-gpu"]});
  const temp=mkdtempSync(join(tmpdir(),"scene-editor-smoke-"));
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
    const pageErrors=[],consoleErrors=[];
    page.on("pageerror",error=>pageErrors.push(error.message));
    page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());});
    await page.goto(`http://127.0.0.1:${port}/scene.html`,{waitUntil:"networkidle"});
    await page.waitForFunction(()=>window.__sceneEditor?.getScene?.()?.objects?.length===6);

    assert.equal(await page.evaluate(()=>window.__sceneEditor.getScene().sceneId),"birdesengor-study-v2");
    assert.equal(await page.locator(".scene-object").count(),6);
    assert.equal(await page.locator(".scene-marker").count(),3);
    assert.match(await page.locator(".scene-local-warning").innerText(),/Yerel önizleme · canlı yayın ayrı/i);

    // Choose the candle and its named wick anchor.
    await page.locator("#object-list .scene-row-select",{hasText:"Mum"}).click();
    const anchorSelect=page.getByLabel("Adlandırılmış bağlantı noktası");
    await anchorSelect.selectOption("candle.flame-base");
    assert.equal(await anchorSelect.inputValue(),"candle.flame-base");
    assert.match(await page.locator("#object-inspector .scene-location").innerText(),/Görsel konum/);
    assert.match(await page.locator("#object-inspector .scene-location").innerText(),/[0-9]+ × [0-9]+ px \(1600 × 900\)/);
    const candlePoseBefore=await page.evaluate(()=>window.__sceneEditor.getScene().objects.find(item=>item.id==="candle").pose);

    // Select the topmost candle effect, then drag its target marker in the stage.
    await page.locator("#effect-list button",{hasText:"Duman"}).click();
    assert.equal(await page.locator("#effect-inspector h2").innerText(),"Efekt");
    const marker=page.locator('.scene-marker[data-effect-id="smoke-1"]');
    await marker.waitFor();
    const box=await marker.boundingBox();
    assert.ok(box,"smoke marker is visible");
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+42,box.y+box.height/2+18,{steps:8});
    await page.mouse.up();
    await page.waitForFunction(()=>{
      const effect=window.__sceneEditor.getScene().effects.find(item=>item.id==="smoke-1");
      return Math.abs(effect.target.offset.x)>0.0001;
    });
    const afterDrag=await page.evaluate(()=>{
      const scene=window.__sceneEditor.getScene();
      return {
        offset:scene.effects.find(item=>item.id==="smoke-1").target.offset,
        pose:scene.objects.find(item=>item.id==="candle").pose
      };
    });
    assert.ok(afterDrag.offset.x>0,"pointer drag changes effect offset X");
    assert.deepEqual(afterDrag.pose,candlePoseBefore,"object transforms stay separate from effect offsets");
    assert.equal(await page.locator("#effect-offset-x").inputValue(),String(afterDrag.offset.x));

    // Change the flame intensity through the canonical registry control.
    await page.locator("#effect-list button",{hasText:"Alev"}).click();
    await page.locator('#effect-inspector input[aria-label="Opaklık"]').evaluate(input=>{
      input.value="0.7";
      input.dispatchEvent(new Event("change",{bubbles:true}));
    });
    await page.waitForFunction(()=>window.__sceneEditor.getScene().effects.find(item=>item.id==="flame-1").params.opacity===0.7);

    // The real object runtime keeps drawing non-transparent flame pixels.
    await page.waitForFunction(()=>{
      const info=window.__sceneEditor.inspect();
      return info?.overlays?.some(overlay=>overlay.objectId==="candle"&&overlay.running&&overlay.frames>0);
    });
    const beforeVisibility=await page.evaluate(()=>{
      const info=window.__sceneEditor.inspect();
      const alpha=[...document.querySelectorAll(".scene-object canvas")].map(canvas=>{
        const data=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
        let count=0;
        for(let index=3;index<data.length;index+=4)if(data[index])count++;
        return count;
      });
      return {frames:info.overlays.reduce((sum,item)=>sum+item.frames,0),alpha};
    });
    assert.ok(beforeVisibility.alpha.some(count=>count>0),"canonical overlay renders visible pixels");

    // CSS visibility on a parent must stop the ticker even while intersecting.
    await page.evaluate(()=>{document.querySelector("#scene-objects").style.visibility="hidden";});
    await page.waitForFunction(()=>window.__sceneEditor.inspect()?.overlays?.every(overlay=>!overlay.running)??false);
    const pausedFrames=await page.evaluate(()=>window.__sceneEditor.inspect().overlays.reduce((sum,item)=>sum+item.frames,0));
    await page.waitForTimeout(700);
    const stillPaused=await page.evaluate(()=>window.__sceneEditor.inspect().overlays.reduce((sum,item)=>sum+item.frames,0));
    assert.equal(stillPaused,pausedFrames,"hidden parent halts frame updates");
    await page.evaluate(()=>{document.querySelector("#scene-objects").style.visibility="";});
    await page.waitForFunction(()=>window.__sceneEditor.inspect()?.overlays?.some(overlay=>overlay.running)??false);

    // Export then import the downloaded v2 JSON in a fresh file-input pass.
    const downloadPromise=page.waitForEvent("download");
    await page.locator("#export").click();
    const download=await downloadPromise;
    const exported=join(temp,"exported.scene.json");
    await download.saveAs(exported);
    const text=readFileSync(exported,"utf8");
    const parsed=JSON.parse(text);
    assert.equal(parsed.version,2);
    assert.equal(parsed.kind,"objectScene");
    assert.equal(parsed.sceneId,"birdesengor-study-v2");
    assert.equal(parsed.effects.find(item=>item.id==="flame-1").params.opacity,0.7);
    assert.deepEqual(parsed.effects.find(item=>item.id==="smoke-1").target.offset,afterDrag.offset);
    const validated=await page.evaluate(async source=>{
      const {importProject}=await import("/src/model/project.mjs");
      const scene=importProject(source);
      return {version:scene.version,sceneId:scene.sceneId,offset:scene.effects.find(item=>item.id==="smoke-1").target.offset,opacity:scene.effects.find(item=>item.id==="flame-1").params.opacity};
    },text);
    assert.deepEqual(validated,{version:2,sceneId:"birdesengor-study-v2",offset:afterDrag.offset,opacity:0.7});
    await page.locator("#project-file").setInputFiles(exported);
    await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("V2 proje açıldı"));
    assert.deepEqual(await page.evaluate(()=>window.__sceneEditor.getScene().effects.find(item=>item.id==="smoke-1").target.offset),afterDrag.offset);

    // Compact layout has no horizontal page overflow.
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(250);
    const overflow=await page.evaluate(()=>({
      document:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      body:document.body.scrollWidth-document.body.clientWidth
    }));
    assert.ok(overflow.document<=0,`no document horizontal overflow (${JSON.stringify(overflow)})`);
    assert.ok(overflow.body<=0,`no body horizontal overflow (${JSON.stringify(overflow)})`);

    assert.deepEqual(pageErrors,[]);
    assert.deepEqual(consoleErrors,[]);
    await page.close();
  }finally{
    await browser.close();
    await new Promise(done=>server.close(done));
    rmSync(temp,{recursive:true,force:true});
  }
});
