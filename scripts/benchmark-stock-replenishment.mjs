/** Opt-in 540/5000/10000-item browser-only rendering benchmark, no business data. */
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { resolve, join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const root=resolve("."), outDir=join(root,"artifacts/verify/runtime-performance");
mkdirSync(outDir,{recursive:true});
const server=await createServer({
  root:resolve("apps/desktop-app"),
  configFile:resolve("apps/desktop-app/vite.renderer.config.ts"),
  server:{port:0,strictPort:false}
});
let browser;
const results={name:"stock-replenishment-browser-benchmark",at:new Date().toISOString(),browser:"headless chromium, Vite fixture",samples:[],errors:[]};
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
async function heap(page){
  const cdps=await page.context().newCDPSession(page);
  await cdps.send("HeapProfiler.enable");await cdps.send("HeapProfiler.collectGarbage");
  await cdps.send("Performance.enable");
  const vals=(await cdps.send("Performance.getMetrics")).metrics;
  await cdps.detach();
  return Object.fromEntries(vals.filter(x=>["JSHeapUsedSize","Nodes"].includes(x.name)).map(x=>[x.name,x.name==="JSHeapUsedSize"?+(x.value/1048576).toFixed(2):x.value]));
}
try{
  await server.listen();
  browser=await launchChromiumForSmoke(chromium);
  const page=await browser.newPage({viewport:{width:1350,height:860},locale:"tr-TR"});
  page.on("pageerror",e=>results.errors.push(e.message));
  await page.route("**/stock-benchmark",async route=>route.fulfill({
    contentType:"text/html",
    body:await server.transformIndexHtml("/stock-benchmark",
      '<html><body><div id="root"></div><script type="module" src="/@fs/'+resolve("scripts/fixtures/stock-replenishment.tsx")+'"></script></body></html>')
  }));
  await page.goto(server.resolvedUrls.local[0]+"stock-benchmark");
  for(const size of [540,5000,10000]){
    await page.evaluate(n=>{window.stockUiTest.setRowCount(n);window.stockUiTest.setCategoryCount(42)},size);
    if(size===540) {
      const t=performance.now();
      await page.getByRole("button",{name:"İhtiyaç listesini aç"}).click();
      await expect(page.getByRole("dialog",{name:"İdeal Stok İhtiyaç Listesi"})).toBeVisible();
      await expect(page.locator(".stock-replenishment__results-heading")).toContainText("540 ürün");
      results.firstOpenMs=+(performance.now()-t).toFixed(1);
    }else{
      const t=performance.now();
      await page.getByRole("button",{name:"İhtiyaç listesini yenile"}).click();
      await expect(page.locator(".stock-replenishment__results-heading")).toContainText(String(size)+" ürün");
      results.samples.push({size,refreshMs:+(performance.now()-t).toFixed(1)});
    }
    const w=page.getByRole("dialog",{name:"İdeal Stok İhtiyaç Listesi"});
    const category=w.getByRole("navigation",{name:"İhtiyaç kategorileri"});
    await expect(category.getByRole("button")).toHaveCount(43);
    await expect(w.locator(".stock-replenishment__table tbody tr")).toHaveCount(50);
    const selectTimes=[], searchTimes=[];
    for(let i=1;i<=10;i++){
      const dest=i%2===1?"Kategori 05":"Tüm kategoriler";
      const t=performance.now();
      await category.getByRole("button",{name:new RegExp("^"+dest)}).click();
      await expect(w.locator(".stock-replenishment__results-heading h3")).toHaveText(dest);
      selectTimes.push(+(performance.now()-t).toFixed(1));
    }
    for(let i=0;i<10;i++){
      const term=i%2===0?"Ürün "+size:"";
      const t=performance.now();
      await w.getByLabel("İhtiyaçlarda ara").fill(term);
      if(term) await expect(w.locator(".stock-replenishment__table tbody tr")).toHaveCount(1);
      else await expect(w.locator(".stock-replenishment__table tbody tr")).toHaveCount(50);
      searchTimes.push(+(performance.now()-t).toFixed(1));
    }
    const memory=await heap(page);
    const record={size,categoryCount:42,renderedRows:50,categorySwitchMedianMs:median(selectTimes),
      searchMedianMs:median(searchTimes),categorySwitchMaxMs:Math.max(...selectTimes),searchMaxMs:Math.max(...searchTimes),
      rendererHeapMb:memory.JSHeapUsedSize,nodes:memory.Nodes};
    results.samples.push(record);
    console.log("CASE",JSON.stringify(record));
  }
  await page.setViewportSize({width:390,height:820});
  const categoryList=page.getByRole("navigation",{name:"İhtiyaç kategorileri"});
  const geometry=await categoryList.evaluate(el=>{
    const rail=el.closest(".detail-workspace-layout__rail").getBoundingClientRect();
    const table=el.closest(".stock-replenishment__layout").querySelector(".stock-replenishment__results-panel").getBoundingClientRect();
    return {scrollable:el.scrollHeight>el.clientHeight,railAboveTable:rail.bottom<=table.top+1};
  });
  results.narrow=geometry;
  console.log("NARROW",JSON.stringify(geometry));
  if(!geometry.scrollable||!geometry.railAboveTable)throw Error("narrow category rail broken");
  if(results.errors.length)throw Error(results.errors.join("\n"));
  const out=join(outDir,"stock-list.json");
  writeFileSync(out,JSON.stringify(results,null,2)+"\n");
  console.log("REPORT",out);
}catch(err){results.errors.push(String(err));writeFileSync(join(outDir,"stock-list-partial.json"),JSON.stringify(results,null,2)+"\n");throw err}
finally{await browser?.close();await server.close();}
